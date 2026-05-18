// Lambda: confirmUpload
// After client uploads to S3, this stores metadata in DynamoDB and (optionally)
// triggers thumbnail generation. With the S3 ObjectCreated trigger on the originals
// bucket, the thumbnailGenerator Lambda will handle the thumbnail asynchronously.
// API Gateway: POST /photos/confirm-upload

import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const region = process.env.AWS_REGION;
const ORIGINAL_BUCKET = process.env.ORIGINAL_BUCKET;
const DDB_TABLE = process.env.DDB_TABLE;

const s3 = new S3Client({ region });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
};

export const handler = async (event) => {
  try {
    const userSub =
      event.requestContext?.authorizer?.claims?.sub ||
      event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!userSub) return resp(401, { error: "Unauthorized" });

    const body = JSON.parse(event.body || "{}");
    const { photo_id, filename, content_type, size } = body;
    if (!photo_id || !filename || !content_type) {
      return resp(400, { error: "photo_id, filename, content_type required" });
    }
    const ext = MIME_TO_EXT[content_type];
    if (!ext) return resp(400, { error: "Unsupported content type" });

    const origKey = `users/${userSub}/originals/${photo_id}.${ext}`;
    const thumbKey = `users/${userSub}/thumbnails/${photo_id}.jpg`;

    // Verify the original landed in S3
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: ORIGINAL_BUCKET, Key: origKey })
    );
    const actualSize = Number(head.ContentLength || size || 0);

    const item = {
      owner: userSub,
      photo_id,
      filename,
      content_type,
      size: actualSize,
      orig_key: origKey,
      thumb_key: thumbKey,
      uploaded_at: new Date().toISOString(),
    };

    await ddb.send(new PutCommand({ TableName: DDB_TABLE, Item: item }));

    return resp(200, item);
  } catch (e) {
    return resp(500, { error: String(e?.message || e) });
  }
};

function resp(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...cors },
    body: JSON.stringify(body),
  };
}
