# Shadow Gallery — AWS Setup Guide

This guide walks you through provisioning every AWS resource needed to run the gallery
**in production** with real Lambda functions. The Emergent-hosted preview already runs a
**functionally identical** FastAPI backend that talks to the same S3/DynamoDB/Cognito.

> Region used everywhere: **ap-south-1 (Mumbai)**.

---

## 1. Cognito User Pool (already configured)

- User Pool ID: `ap-south-1_uEX9otfnG`
- App Client ID: `4lrn7smuuif5nbn4dgfcqm6ivs`

### Required App Client settings
1. Open **Cognito → User Pools → your pool → App clients → your client**.
2. Authentication flows: enable **`ALLOW_USER_PASSWORD_AUTH`** and `ALLOW_REFRESH_TOKEN_AUTH`.
3. (Optional, only if you want to use the Hosted UI):
   - Hosted UI **callback URL**: `https://photo-vault-226.preview.emergentagent.com`
   - Hosted UI **sign-out URL**: `https://photo-vault-226.preview.emergentagent.com`
   - OAuth scopes: `openid email phone`

> The running app uses `USER_PASSWORD_AUTH` directly (no Hosted UI redirect needed).

---

## 2. S3 buckets

| Purpose | Bucket name | Access |
|---|---|---|
| Originals (private) | `shadow-photo-originals-709147558119` | Block all public access |
| Thumbnails | `shadow-photo-thumbnails-709147558119` | Block all public access (served via CloudFront OAC) |

### CORS for both buckets (required for browser uploads & thumbnail fetch)
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "POST", "GET", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposedHeaders": ["ETag"]
  }
]
```

Console → S3 → bucket → **Permissions → Cross-origin resource sharing (CORS)** → paste.

### Enable encryption + versioning (recommended)
- Default encryption: SSE-S3 (AES256) or SSE-KMS.
- Versioning: optional but recommended for originals.

---

## 3. DynamoDB table

- Table name: `PhotoGalleryMetadata`
- Partition key: `owner` (String) — the Cognito user `sub`
- Sort key: `photo_id` (String) — UUID

Console → DynamoDB → **Create table** → On-demand capacity → Create.

---

## 4. CloudFront distribution (for fast thumbnail delivery)

1. CloudFront → **Create distribution**.
2. Origin domain = **`shadow-photo-thumbnails-709147558119.s3.ap-south-1.amazonaws.com`**.
3. Origin access = **Origin access control (OAC)**.
4. Viewer protocol policy: **Redirect HTTP → HTTPS**.
5. Default cache behaviour: GET/HEAD only.
6. Default root object: leave blank.
7. After it deploys, copy the bucket policy CloudFront suggests and paste it into the thumbnails bucket's **Bucket policy**.
8. Note the distribution domain (e.g. `d1xxxxxxxxxxxx.cloudfront.net`) and set it as `CLOUDFRONT_DOMAIN` in `/app/backend/.env`, then `sudo supervisorctl restart backend`.

If `CLOUDFRONT_DOMAIN` is empty, thumbnails fall back to short-lived pre-signed S3 URLs (also works).

---

## 5. IAM user that the backend uses

You already provided an access key for an IAM user. Attach the inline policy below
(or `/app/aws/iam-policies.json::AppRuntimeRole`).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:HeadObject", "s3:DeleteObject"],
      "Resource": [
        "arn:aws:s3:::shadow-photo-originals-709147558119/*",
        "arn:aws:s3:::shadow-photo-thumbnails-709147558119/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query",
        "dynamodb:DeleteItem", "dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:ap-south-1:*:table/PhotoGalleryMetadata"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:SignUp", "cognito-idp:ConfirmSignUp",
        "cognito-idp:ResendConfirmationCode", "cognito-idp:InitiateAuth"
      ],
      "Resource": "arn:aws:cognito-idp:ap-south-1:*:userpool/ap-south-1_uEX9otfnG"
    }
  ]
}
```

---

## 6. Deploy the production Lambdas with SAM (optional)

The `/app/aws/` folder contains the four Node.js 18 Lambdas required by the prompt and
a SAM template that wires up Cognito, API Gateway, DynamoDB, and the S3 trigger for the
thumbnail generator.

```bash
cd /app/aws
npm --prefix lambdas install        # installs aws-sdk v3 and sharp
sam build
sam deploy --guided                 # first time only
```

The thumbnail generator needs Sharp built for `linux-x64`. Either:
- Use a container image (`sam build --use-container`), **or**
- Add a public Sharp Lambda layer in the same region, e.g. `arn:aws:lambda:ap-south-1:<account>:layer:sharp:<v>`.

After deploy, set the frontend `REACT_APP_BACKEND_URL` to the SAM output `ApiUrl` if
you want to swap the FastAPI backend for the real Lambdas.

---

## 7. Local development

```bash
cd /app/backend && python -m uvicorn server:app --reload --port 8001
cd /app/frontend && yarn start
```

In this Emergent environment supervisor already runs both.
