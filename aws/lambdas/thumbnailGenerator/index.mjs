// Lambda: thumbnailGenerator
// Triggered by S3 ObjectCreated:Put on the originals bucket.
// Reads the original, resizes with Sharp, writes a JPEG thumbnail (max 600px) to
// the thumbnails bucket, and updates DynamoDB with width/height.
// Requires layer or container image including the `sharp` binary for the Lambda arch.

import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import sharp from "sharp";

const region = process.env.AWS_REGION;
const THUMBNAIL_BUCKET = process.env.THUMBNAIL_BUCKET;
const DDB_TABLE = process.env.DDB_TABLE;

const s3 = new S3Client({ region });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

const streamToBuffer = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });

export const handler = async (event) => {
  for (const record of event.Records || []) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    // Expected key: users/{sub}/originals/{photo_id}.{ext}
    const match = key.match(/^users\/([^/]+)\/originals\/([^/.]+)\.(\w+)$/);
    if (!match) {
      console.log("Skipping non-original key", key);
      continue;
    }
    const [, sub, photoId] = match;

    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const buf = await streamToBuffer(obj.Body);
    const pipeline = sharp(buf, { failOn: "none" }).rotate();
    const meta = await pipeline.metadata();
    const thumb = await pipeline
      .resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    const thumbKey = `users/${sub}/thumbnails/${photoId}.jpg`;
    await s3.send(
      new PutObjectCommand({
        Bucket: THUMBNAIL_BUCKET,
        Key: thumbKey,
        Body: thumb,
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=31536000",
      })
    );

    // Update metadata with dimensions
    await ddb.send(
      new UpdateCommand({
        TableName: DDB_TABLE,
        Key: { owner: sub, photo_id: photoId },
        UpdateExpression: "SET width = :w, height = :h, thumb_key = :tk",
        ExpressionAttributeValues: {
          ":w": meta.width || 0,
          ":h": meta.height || 0,
          ":tk": thumbKey,
        },
      })
    );
  }
  return { ok: true };
};
