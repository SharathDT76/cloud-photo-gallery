"""AWS service client factory. Reads credentials from env."""
import os
import boto3
from botocore.config import Config

AWS_REGION = os.environ.get("AWS_REGION", "ap-south-1")
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY")

ORIGINAL_BUCKET = os.environ.get("ORIGINAL_BUCKET")
THUMBNAIL_BUCKET = os.environ.get("THUMBNAIL_BUCKET")
DDB_TABLE = os.environ.get("DDB_TABLE", "PhotoGalleryMetadata")
CLOUDFRONT_DOMAIN = os.environ.get("CLOUDFRONT_DOMAIN", "").strip()

COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID")
COGNITO_CLIENT_ID = os.environ.get("COGNITO_CLIENT_ID")
COGNITO_REGION = os.environ.get("COGNITO_REGION", AWS_REGION)

_session = boto3.session.Session(
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_REGION,
)

# S3 client with Signature Version 4 (required for ap-south-1 region presigned URLs)
s3_client = _session.client(
    "s3",
    config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
)

# DynamoDB resource
ddb_resource = _session.resource("dynamodb")

# Cognito client
cognito_client = _session.client("cognito-idp", region_name=COGNITO_REGION)


def get_photos_table():
    return ddb_resource.Table(DDB_TABLE)


def thumbnail_url(s3_key: str) -> str:
    """Build the public URL for a thumbnail. Prefer CloudFront if configured."""
    if CLOUDFRONT_DOMAIN:
        domain = CLOUDFRONT_DOMAIN.rstrip("/")
        if not domain.startswith("http"):
            domain = f"https://{domain}"
        return f"{domain}/{s3_key}"
    # Fall back to presigned S3 URL (works even when bucket is private)
    return s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": THUMBNAIL_BUCKET, "Key": s3_key},
        ExpiresIn=3600,
    )
