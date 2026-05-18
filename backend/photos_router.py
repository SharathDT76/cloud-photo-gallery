"""Photo gallery API endpoints. Mirrors the Lambda functions:
- getUploadUrl  -> GET  /api/photos/upload-url
- confirmUpload -> POST /api/photos/confirm-upload
- listPhotos    -> GET  /api/photos        (paginated, optional album filter)
- (extra)       -> GET  /api/photos/{id}/download-url
- (extra)       -> PATCH /api/photos/{id}/album
- (extra)       -> DELETE /api/photos/{id}
"""
import base64
import io
import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Attr

from aws_clients import (
    s3_client,
    get_photos_table,
    ORIGINAL_BUCKET,
    THUMBNAIL_BUCKET,
    thumbnail_url,
)
from cognito_auth import get_current_user

# Register HEIF / HEIC support with Pillow (iOS photos)
register_heif_opener()

router = APIRouter(prefix="/api/photos", tags=["photos"])

ALLOWED_MIME = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
}
MIME_TO_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
}
THUMBNAIL_MAX = (600, 600)
DEFAULT_PAGE_SIZE = 24
MAX_PAGE_SIZE = 100


# ---------- Schemas ---------- #
class UploadUrlResponse(BaseModel):
    photo_id: str
    upload_url: str
    s3_key: str
    expires_in: int = 900


class ConfirmUploadRequest(BaseModel):
    photo_id: str
    filename: str
    content_type: str
    size: int
    album_id: Optional[str] = None


class PhotoOut(BaseModel):
    id: str
    filename: str
    content_type: str
    size: int
    width: Optional[int] = None
    height: Optional[int] = None
    uploaded_at: str
    thumbnail_url: str
    owner: str
    album_id: Optional[str] = None


class PhotoPage(BaseModel):
    items: List[PhotoOut]
    next_cursor: Optional[str] = None
    total: int


class AlbumAssignRequest(BaseModel):
    album_id: Optional[str] = None  # null to unassign


# ---------- Helpers ---------- #
def _original_key(user_sub: str, photo_id: str, ext: str) -> str:
    return f"users/{user_sub}/originals/{photo_id}.{ext}"


def _thumb_key(user_sub: str, photo_id: str) -> str:
    return f"users/{user_sub}/thumbnails/{photo_id}.jpg"


def _is_album(item: Dict[str, Any]) -> bool:
    return item.get("kind") == "album"


def _row_to_photo(item: Dict[str, Any]) -> PhotoOut:
    return PhotoOut(
        id=item["photo_id"],
        filename=item.get("filename", ""),
        content_type=item.get("content_type", "image/jpeg"),
        size=int(item.get("size", 0)),
        width=int(item["width"]) if item.get("width") else None,
        height=int(item["height"]) if item.get("height") else None,
        uploaded_at=item.get("uploaded_at", ""),
        thumbnail_url=thumbnail_url(item["thumb_key"]),
        owner=item.get("owner", ""),
        album_id=item.get("album_id") or None,
    )


def _query_all_photos(user_sub: str) -> List[Dict[str, Any]]:
    """Query all photo items for a user, handling DDB's 1MB pagination internally."""
    table = get_photos_table()
    items: List[Dict[str, Any]] = []
    kwargs = {
        "KeyConditionExpression": "#o = :o",
        "ExpressionAttributeNames": {"#o": "owner"},
        "ExpressionAttributeValues": {":o": user_sub},
    }
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            break
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]
    return [it for it in items if not _is_album(it)]


def _encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(json.dumps({"o": offset}).encode()).decode()


def _decode_cursor(cursor: Optional[str]) -> int:
    if not cursor:
        return 0
    try:
        return int(json.loads(base64.urlsafe_b64decode(cursor).decode())["o"])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid cursor")


# ---------- Endpoints ---------- #
@router.get("/upload-url", response_model=UploadUrlResponse)
async def get_upload_url(
    filename: str = Query(..., min_length=1),
    content_type: str = Query(...),
    user=Depends(get_current_user),
):
    """Returns a pre-signed S3 PUT URL the client uses to upload the original."""
    if content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail=f"Unsupported content type: {content_type}")

    photo_id = str(uuid.uuid4())
    ext = MIME_TO_EXT[content_type]
    key = _original_key(user["sub"], photo_id, ext)

    try:
        url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": ORIGINAL_BUCKET,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=900,
            HttpMethod="PUT",
        )
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate upload URL: {exc}")

    return UploadUrlResponse(photo_id=photo_id, upload_url=url, s3_key=key)


@router.post("/confirm-upload", response_model=PhotoOut)
async def confirm_upload(body: ConfirmUploadRequest, user=Depends(get_current_user)):
    """Verifies the original exists, generates a thumbnail, stores metadata."""
    if body.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Unsupported content type")

    ext = MIME_TO_EXT[body.content_type]
    orig_key = _original_key(user["sub"], body.photo_id, ext)
    thumb_key = _thumb_key(user["sub"], body.photo_id)

    try:
        head = s3_client.head_object(Bucket=ORIGINAL_BUCKET, Key=orig_key)
    except ClientError as exc:
        raise HTTPException(status_code=400, detail=f"Original not uploaded yet: {exc}")
    actual_size = int(head["ContentLength"])

    # If client claims a specific album, verify it belongs to the user
    if body.album_id:
        try:
            resp = get_photos_table().get_item(
                Key={"owner": user["sub"], "photo_id": body.album_id}
            )
            if not resp.get("Item") or not _is_album(resp["Item"]):
                raise HTTPException(status_code=400, detail="Album not found")
        except ClientError as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    try:
        orig_obj = s3_client.get_object(Bucket=ORIGINAL_BUCKET, Key=orig_key)
        img_bytes = orig_obj["Body"].read()
        with Image.open(io.BytesIO(img_bytes)) as im:
            im = ImageOps.exif_transpose(im)
            width, height = im.size
            im.thumbnail(THUMBNAIL_MAX, Image.LANCZOS)
            if im.mode in ("RGBA", "P", "LA"):
                im = im.convert("RGB")
            buf = io.BytesIO()
            im.save(buf, format="JPEG", quality=85, optimize=True)
            buf.seek(0)
            s3_client.put_object(
                Bucket=THUMBNAIL_BUCKET,
                Key=thumb_key,
                Body=buf.getvalue(),
                ContentType="image/jpeg",
                CacheControl="public, max-age=31536000",
            )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - error surface
        raise HTTPException(status_code=500, detail=f"Thumbnail generation failed: {exc}")

    uploaded_at = datetime.now(timezone.utc).isoformat()
    item = {
        "owner": user["sub"],
        "photo_id": body.photo_id,
        "kind": "photo",
        "filename": body.filename,
        "content_type": body.content_type,
        "size": actual_size,
        "width": width,
        "height": height,
        "orig_key": orig_key,
        "thumb_key": thumb_key,
        "uploaded_at": uploaded_at,
        "email": user.get("email", ""),
    }
    if body.album_id:
        item["album_id"] = body.album_id
    try:
        get_photos_table().put_item(Item=item)
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save metadata: {exc}")
    return _row_to_photo(item)


@router.get("", response_model=PhotoPage)
async def list_photos(
    sort_by: str = Query("date", pattern="^(date|size)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    cursor: Optional[str] = Query(None),
    album_id: Optional[str] = Query(None, description="Filter to a single album"),
    user=Depends(get_current_user),
):
    """List user's photos with sort + offset pagination + optional album filter."""
    try:
        items = _query_all_photos(user["sub"])
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=f"DynamoDB query failed: {exc}")

    if album_id == "none":
        items = [it for it in items if not it.get("album_id")]
    elif album_id:
        items = [it for it in items if it.get("album_id") == album_id]

    key_fn = (lambda it: it.get("uploaded_at", "")) if sort_by == "date" else (
        lambda it: int(it.get("size", 0))
    )
    items.sort(key=key_fn, reverse=(order == "desc"))

    offset = _decode_cursor(cursor)
    page = items[offset : offset + limit]
    next_offset = offset + limit
    next_cursor = _encode_cursor(next_offset) if next_offset < len(items) else None
    return PhotoPage(
        items=[_row_to_photo(it) for it in page],
        next_cursor=next_cursor,
        total=len(items),
    )


@router.get("/{photo_id}/download-url")
async def get_download_url(photo_id: str, user=Depends(get_current_user)):
    try:
        resp = get_photos_table().get_item(Key={"owner": user["sub"], "photo_id": photo_id})
        item = resp.get("Item")
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    if not item or _is_album(item):
        raise HTTPException(status_code=404, detail="Photo not found")

    try:
        url = s3_client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": ORIGINAL_BUCKET,
                "Key": item["orig_key"],
                "ResponseContentDisposition": f'attachment; filename="{item["filename"]}"',
            },
            ExpiresIn=900,
        )
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"download_url": url, "filename": item["filename"]}


@router.patch("/{photo_id}/album", response_model=PhotoOut)
async def assign_album(
    photo_id: str, body: AlbumAssignRequest, user=Depends(get_current_user)
):
    table = get_photos_table()
    try:
        resp = table.get_item(Key={"owner": user["sub"], "photo_id": photo_id})
        item = resp.get("Item")
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    if not item or _is_album(item):
        raise HTTPException(status_code=404, detail="Photo not found")

    if body.album_id:
        album_resp = table.get_item(
            Key={"owner": user["sub"], "photo_id": body.album_id}
        )
        if not album_resp.get("Item") or not _is_album(album_resp["Item"]):
            raise HTTPException(status_code=400, detail="Album not found")
        update_kwargs = {
            "UpdateExpression": "SET album_id = :a",
            "ExpressionAttributeValues": {":a": body.album_id},
        }
    else:
        update_kwargs = {
            "UpdateExpression": "REMOVE album_id",
        }

    try:
        table.update_item(
            Key={"owner": user["sub"], "photo_id": photo_id},
            **update_kwargs,
        )
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    item["album_id"] = body.album_id if body.album_id else None
    return _row_to_photo(item)


@router.delete("/{photo_id}")
async def delete_photo(photo_id: str, user=Depends(get_current_user)):
    table = get_photos_table()
    try:
        resp = table.get_item(Key={"owner": user["sub"], "photo_id": photo_id})
        item = resp.get("Item")
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    if not item or _is_album(item):
        raise HTTPException(status_code=404, detail="Photo not found")

    for bucket, key in [(ORIGINAL_BUCKET, item["orig_key"]), (THUMBNAIL_BUCKET, item["thumb_key"])]:
        try:
            s3_client.delete_object(Bucket=bucket, Key=key)
        except ClientError:
            pass

    try:
        table.delete_item(Key={"owner": user["sub"], "photo_id": photo_id})
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"deleted": True, "photo_id": photo_id}


# Unused but kept for module API import surface check
_ = Attr
