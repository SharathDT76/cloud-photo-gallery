# Shadow Gallery — Cloud Photo Gallery PRD

## Original problem statement
Cloud-based photo gallery using React, AWS S3, Lambda, DynamoDB, CloudFront, API Gateway, Cognito.
Features: Cognito auth, pre-signed S3 uploads, private originals, auto thumbnails (Lambda + Sharp),
DynamoDB metadata, responsive masonry gallery, sort by date/size, download, delete, lazy loading,
CloudFront CDN, drag-and-drop, SAM/Serverless deployment, IAM policies, env-based config.

## User confirmed choices
- Real AWS services (no mocks)
- AWS Cognito authentication (User Pool `ap-south-1_uEX9otfnG`)
- Pinterest-style masonry layout
- Drag-and-drop upload
- Buckets: `shadow-photo-originals-709147558119`, `shadow-photo-thumbnails-709147558119`
- Region: ap-south-1
- (Iter 2) Albums, server-side pagination, HEIC support, CloudFront provisioning

## Architecture
- **Frontend** (React 19 + Tailwind + shadcn/ui): Landing, Auth (signin/signup/confirm), Gallery
  with album sidebar + infinite-scroll masonry.
- **Backend** (FastAPI on Emergent) = API-Gateway + Lambda orchestrator:
  - `GET  /api/photos/upload-url`
  - `POST /api/photos/confirm-upload`
  - `GET  /api/photos` → `PhotoPage { items, next_cursor, total }` (offset-cursor + sort + album filter)
  - `GET  /api/photos/{id}/download-url`
  - `PATCH /api/photos/{id}/album`
  - `DELETE /api/photos/{id}`
  - `GET / POST / DELETE /api/albums` (CRUD)
- **Auth**: Cognito User Pool with `USER_PASSWORD_AUTH` (signup/confirm/login via boto3).
- **Storage**: Originals → private S3, Thumbnails → S3 (CloudFront when `CLOUDFRONT_DOMAIN` is set).
- **Metadata**: Single DynamoDB table `PhotoGalleryMetadata`, PK `owner`, SK `photo_id`,
  `kind` ∈ {photo, album} discriminator, `album_id` (optional) on photo items.
- **Thumbnails**: Backend uses Pillow + `pillow_heif` (HEIC/HEIF support). Production Lambda
  code in `/app/aws/lambdas/thumbnailGenerator/` uses Sharp.
- **CloudFront**: `/app/scripts/provision_cloudfront.py` creates OAC + distribution + bucket
  policy + auto-writes `CLOUDFRONT_DOMAIN` into `/app/backend/.env` (one-shot, idempotent).

## Implementation status
### MVP (iteration 1)
- [x] Cognito auth (signup/confirm/login/logout)
- [x] Pre-signed S3 upload + thumbnail generation + DynamoDB metadata
- [x] Masonry gallery, sort by date/size, download, delete, drag-and-drop
- [x] Production Lambdas + SAM template + IAM policies + AWS_SETUP.md
- [x] Backend testing: 16/16 pass

### Iteration 2 (current)
- [x] **HEIC/HEIF support** via `pillow_heif` registered as Pillow opener; iOS uploads work end-to-end
- [x] **Server-side pagination**: `PhotoPage { items, next_cursor, total }`, cursor = base64 offset,
       frontend uses IntersectionObserver for infinite scroll
- [x] **Album grouping**: full CRUD, sidebar with counts + delete, photos can be assigned via
       PhotoDialog or uploaded directly into the active album
- [x] **CloudFront provisioning script**: creates OAC, distribution, bucket policy, writes env
- [x] Backend testing: 35/35 pass (regression + new features)

### Required AWS configuration (user side)
1. Cognito App Client: enable `ALLOW_USER_PASSWORD_AUTH`
2. S3 buckets: CORS JSON applied (see `/app/AWS_SETUP.md`)
3. DynamoDB: `PhotoGalleryMetadata` with PK `owner` (S), SK `photo_id` (S)
4. IAM user with policy from `/app/aws/iam-policies.json`
5. Run `python /app/scripts/provision_cloudfront.py` then `sudo supervisorctl restart backend`

## Test credentials
None — see `/app/memory/test_credentials.md`. Users sign up with their own Cognito accounts.

## Next backlog (P1)
- DDB `LastEvaluatedKey`-native pagination + GSI on `album_id` (avoid full table scans per page)
- Multi-select bulk actions (move to album, delete)
- Public share links (presigned URL with expiry)
- Stripe billing for storage tiers
- HEIC thumbnail rendering in dialog (currently shows JPEG thumb — good — but a high-res
  HEIC preview would require server-side decode endpoint)
