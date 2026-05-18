// Lambda: getUploadUrl
// Returns a pre-signed S3 PUT URL that the client uses to upload the original image directly.
// API Gateway path: GET /photos/upload-url?filename=...&content_type=...
// Auth: API Gateway uses a Cognito User Pool authorizer; the user's `sub` comes from claims.

import { S3Client } from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const region = process.env.AWS_REGION;
const ORIGINAL_BUCKET = process.env.ORIGINAL_BUCKET;

const s3 = new S3Client({ region });

const ALLOWED = {
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
    const qs = event.queryStringParameters || {};
    const filename = qs.filename;
    const contentType = qs.content_type;

    if (!filename || !contentType) {
      return resp(400, { error: "filename and content_type are required" });
    }
    if (!ALLOWED[contentType]) {
      return resp(400, { error: `Unsupported content type: ${contentType}` });
    }

    const userSub =
      event.requestContext?.authorizer?.claims?.sub ||
      event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!userSub) return resp(401, { error: "Unauthorized" });

    const photoId = randomUUID();
    const ext = ALLOWED[contentType];
    const key = `users/${userSub}/originals/${photoId}.${ext}`;

    const cmd = new PutObjectCommand({
      Bucket: ORIGINAL_BUCKET,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 900 });

    return resp(200, {
      photo_id: photoId,
      upload_url: uploadUrl,
      s3_key: key,
      expires_in: 900,
    });
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
