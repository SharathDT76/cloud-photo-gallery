#!/usr/bin/env python3
"""Provision a CloudFront distribution for the thumbnails bucket.

Run from the project root:

    python /app/scripts/provision_cloudfront.py

What it does
============
1. Creates a CloudFront Origin Access Control (OAC) for SigV4 signing.
2. Creates a CloudFront distribution that fronts the thumbnails S3 bucket.
3. Applies the required bucket policy on the thumbnails bucket so only this
   distribution can read objects.
4. Writes the distribution domain into /app/backend/.env as CLOUDFRONT_DOMAIN.
5. Prints the domain. Deployment takes ~10-20 min before objects start serving.

Re-runs are idempotent: if a distribution already exists with our comment, it
will reuse it.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

ROOT = Path("/app")
ENV_FILE = ROOT / "backend" / ".env"
load_dotenv(ENV_FILE)

REGION = os.environ.get("AWS_REGION", "ap-south-1")
THUMBNAIL_BUCKET = os.environ.get("THUMBNAIL_BUCKET")
DISTRIBUTION_COMMENT = "shadow-gallery-thumbnails"
OAC_NAME = "shadow-gallery-thumbnails-oac"


def session():
    return boto3.session.Session(
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        region_name=REGION,
    )


def ensure_oac(cf) -> str:
    existing = cf.list_origin_access_controls()["OriginAccessControlList"].get("Items", [])
    for o in existing:
        if o["Name"] == OAC_NAME:
            print(f"[OAC] reusing existing OAC {o['Id']}")
            return o["Id"]
    resp = cf.create_origin_access_control(
        OriginAccessControlConfig={
            "Name": OAC_NAME,
            "Description": "OAC for Shadow Gallery thumbnails",
            "SigningProtocol": "sigv4",
            "SigningBehavior": "always",
            "OriginAccessControlOriginType": "s3",
        }
    )
    oac_id = resp["OriginAccessControl"]["Id"]
    print(f"[OAC] created {oac_id}")
    return oac_id


def find_distribution(cf):
    paginator = cf.get_paginator("list_distributions")
    for page in paginator.paginate():
        for d in page.get("DistributionList", {}).get("Items", []) or []:
            if d.get("Comment") == DISTRIBUTION_COMMENT:
                return d
    return None


def create_distribution(cf, oac_id: str) -> dict:
    s3_origin_domain = f"{THUMBNAIL_BUCKET}.s3.{REGION}.amazonaws.com"
    config = {
        "CallerReference": f"shadow-gallery-{int(time.time())}",
        "Comment": DISTRIBUTION_COMMENT,
        "Enabled": True,
        "PriceClass": "PriceClass_100",
        "Origins": {
            "Quantity": 1,
            "Items": [
                {
                    "Id": "thumbnails-s3",
                    "DomainName": s3_origin_domain,
                    "OriginAccessControlId": oac_id,
                    "S3OriginConfig": {"OriginAccessIdentity": ""},
                    "CustomHeaders": {"Quantity": 0},
                    "OriginPath": "",
                    "ConnectionAttempts": 3,
                    "ConnectionTimeout": 10,
                }
            ],
        },
        "DefaultCacheBehavior": {
            "TargetOriginId": "thumbnails-s3",
            "ViewerProtocolPolicy": "redirect-to-https",
            "AllowedMethods": {
                "Quantity": 2,
                "Items": ["GET", "HEAD"],
                "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]},
            },
            "Compress": True,
            # CachingOptimized managed policy ID (global, not region-specific)
            "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
            "OriginRequestPolicyId": "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf",  # CORS-S3Origin
        },
        "DefaultRootObject": "",
        "ViewerCertificate": {
            "CloudFrontDefaultCertificate": True,
            "MinimumProtocolVersion": "TLSv1.2_2021",
        },
        "HttpVersion": "http2",
        "IsIPV6Enabled": True,
        "Restrictions": {
            "GeoRestriction": {"RestrictionType": "none", "Quantity": 0}
        },
        "WebACLId": "",
        "Aliases": {"Quantity": 0},
    }
    resp = cf.create_distribution(DistributionConfig=config)
    print(f"[DIST] created {resp['Distribution']['Id']} -> {resp['Distribution']['DomainName']}")
    return resp["Distribution"]


def get_caller_account(s):
    return s.client("sts").get_caller_identity()["Account"]


def apply_bucket_policy(s, account_id: str, distribution_id: str):
    s3 = s.client("s3")
    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "AllowCloudFrontServicePrincipalReadOnly",
                "Effect": "Allow",
                "Principal": {"Service": "cloudfront.amazonaws.com"},
                "Action": "s3:GetObject",
                "Resource": f"arn:aws:s3:::{THUMBNAIL_BUCKET}/*",
                "Condition": {
                    "StringEquals": {
                        "AWS:SourceArn": f"arn:aws:cloudfront::{account_id}:distribution/{distribution_id}"
                    }
                },
            }
        ],
    }
    s3.put_bucket_policy(Bucket=THUMBNAIL_BUCKET, Policy=json.dumps(policy))
    print(f"[POLICY] applied to bucket {THUMBNAIL_BUCKET}")


def write_env(domain: str):
    text = ENV_FILE.read_text()
    new_lines = []
    seen = False
    for line in text.splitlines():
        if line.startswith("CLOUDFRONT_DOMAIN="):
            new_lines.append(f'CLOUDFRONT_DOMAIN="{domain}"')
            seen = True
        else:
            new_lines.append(line)
    if not seen:
        new_lines.append(f'CLOUDFRONT_DOMAIN="{domain}"')
    ENV_FILE.write_text("\n".join(new_lines) + "\n")
    print(f"[ENV] wrote CLOUDFRONT_DOMAIN={domain}")


def main():
    if not THUMBNAIL_BUCKET:
        print("THUMBNAIL_BUCKET env var is required", file=sys.stderr)
        sys.exit(1)

    s = session()
    cf = s.client("cloudfront")

    # 1. OAC
    oac_id = ensure_oac(cf)

    # 2. Distribution
    existing = find_distribution(cf)
    if existing:
        print(f"[DIST] reusing existing distribution {existing['Id']}")
        dist_id = existing["Id"]
        domain = existing["DomainName"]
    else:
        try:
            d = create_distribution(cf, oac_id)
            dist_id = d["Id"]
            domain = d["DomainName"]
        except ClientError as e:
            print(f"Failed to create distribution: {e}", file=sys.stderr)
            sys.exit(2)

    # 3. Bucket policy
    account_id = get_caller_account(s)
    apply_bucket_policy(s, account_id, dist_id)

    # 4. Write env
    write_env(domain)

    print("")
    print("=" * 70)
    print(f"Distribution ID : {dist_id}")
    print(f"Domain          : https://{domain}")
    print(f"Status          : deploying — usually 10-20 minutes to be globally")
    print("                  available. Test with:")
    print(f"   curl -I https://{domain}/users/<sub>/thumbnails/<photo_id>.jpg")
    print("Then restart the backend so the new env is picked up:")
    print("   sudo supervisorctl restart backend")
    print("=" * 70)


if __name__ == "__main__":
    main()
