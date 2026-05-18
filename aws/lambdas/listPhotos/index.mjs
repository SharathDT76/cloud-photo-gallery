// Lambda: listPhotos
// Returns all photos owned by the current user, sortable by date or size.
// API Gateway: GET /photos?sort_by=date|size&order=asc|desc

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const region = process.env.AWS_REGION;
const DDB_TABLE = process.env.DDB_TABLE;
const CLOUDFRONT_DOMAIN = (process.env.CLOUDFRONT_DOMAIN || "").replace(/\/$/, "");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

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

    const qs = event.queryStringParameters || {};
    const sortBy = qs.sort_by === "size" ? "size" : "date";
    const order = qs.order === "asc" ? "asc" : "desc";

    const out = await ddb.send(
      new QueryCommand({
        TableName: DDB_TABLE,
        KeyConditionExpression: "#o = :o",
        ExpressionAttributeNames: { "#o": "owner" },
        ExpressionAttributeValues: { ":o": userSub },
      })
    );

    const items = (out.Items || []).map((it) => ({
      id: it.photo_id,
      filename: it.filename,
      content_type: it.content_type,
      size: Number(it.size || 0),
      width: it.width ? Number(it.width) : null,
      height: it.height ? Number(it.height) : null,
      uploaded_at: it.uploaded_at,
      owner: it.owner,
      thumbnail_url: CLOUDFRONT_DOMAIN
        ? `https://${CLOUDFRONT_DOMAIN}/${it.thumb_key}`
        : null,
    }));

    items.sort((a, b) => {
      const av = sortBy === "size" ? a.size : a.uploaded_at;
      const bv = sortBy === "size" ? b.size : b.uploaded_at;
      if (av < bv) return order === "asc" ? -1 : 1;
      if (av > bv) return order === "asc" ? 1 : -1;
      return 0;
    });

    return resp(200, items);
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
