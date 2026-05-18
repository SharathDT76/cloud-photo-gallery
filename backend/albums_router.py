"""Album CRUD. Albums share the same DynamoDB table as photos, distinguished by
the `kind` attribute (`album` vs `photo`)."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from botocore.exceptions import ClientError

from aws_clients import get_photos_table
from cognito_auth import get_current_user

router = APIRouter(prefix="/api/albums", tags=["albums"])


class AlbumCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class AlbumOut(BaseModel):
    id: str
    name: str
    created_at: str
    photo_count: int


def _row_to_album(item: Dict[str, Any], photo_count: int) -> AlbumOut:
    return AlbumOut(
        id=item["photo_id"],
        name=item.get("name", ""),
        created_at=item.get("created_at", ""),
        photo_count=photo_count,
    )


def _query_all(user_sub: str) -> List[Dict[str, Any]]:
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
    return items


@router.post("", response_model=AlbumOut)
async def create_album(body: AlbumCreate, user=Depends(get_current_user)):
    album_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    item = {
        "owner": user["sub"],
        "photo_id": album_id,
        "kind": "album",
        "name": body.name.strip(),
        "created_at": created_at,
    }
    try:
        get_photos_table().put_item(Item=item)
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return _row_to_album(item, 0)


@router.get("", response_model=List[AlbumOut])
async def list_albums(user=Depends(get_current_user)):
    try:
        items = _query_all(user["sub"])
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    albums = [it for it in items if it.get("kind") == "album"]
    # count photos per album
    counts: Dict[str, int] = {}
    for it in items:
        if it.get("kind") != "album" and it.get("album_id"):
            counts[it["album_id"]] = counts.get(it["album_id"], 0) + 1
    albums.sort(key=lambda a: a.get("created_at", ""), reverse=True)
    return [_row_to_album(a, counts.get(a["photo_id"], 0)) for a in albums]


@router.delete("/{album_id}")
async def delete_album(album_id: str, user=Depends(get_current_user)):
    table = get_photos_table()
    try:
        resp = table.get_item(Key={"owner": user["sub"], "photo_id": album_id})
        item = resp.get("Item")
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    if not item or item.get("kind") != "album":
        raise HTTPException(status_code=404, detail="Album not found")

    # Unassign all photos in this album (lazy: scan items for this user)
    try:
        all_items = _query_all(user["sub"])
        for it in all_items:
            if it.get("kind") != "album" and it.get("album_id") == album_id:
                table.update_item(
                    Key={"owner": user["sub"], "photo_id": it["photo_id"]},
                    UpdateExpression="REMOVE album_id",
                )
        table.delete_item(Key={"owner": user["sub"], "photo_id": album_id})
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"deleted": True, "album_id": album_id}
