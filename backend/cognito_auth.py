"""Cognito JWT validation utilities."""
import os
import time
from typing import Dict, Any, Optional

import requests
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, jwk
from jose.utils import base64url_decode

COGNITO_REGION = os.environ.get("COGNITO_REGION", "ap-south-1")
COGNITO_USER_POOL_ID = os.environ.get("COGNITO_USER_POOL_ID")
COGNITO_CLIENT_ID = os.environ.get("COGNITO_CLIENT_ID")

ISSUER = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
JWKS_URL = f"{ISSUER}/.well-known/jwks.json"

_jwks_cache: Dict[str, Any] = {"keys": None, "fetched_at": 0}

bearer_scheme = HTTPBearer(auto_error=False)


def _get_jwks():
    if _jwks_cache["keys"] is None or (time.time() - _jwks_cache["fetched_at"]) > 3600:
        resp = requests.get(JWKS_URL, timeout=10)
        resp.raise_for_status()
        _jwks_cache["keys"] = resp.json()["keys"]
        _jwks_cache["fetched_at"] = time.time()
    return _jwks_cache["keys"]


def verify_cognito_token(token: str) -> Dict[str, Any]:
    """Verify a Cognito ID or Access token. Returns the claims dict."""
    try:
        headers = jwt.get_unverified_headers(token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token header: {exc}")

    kid = headers.get("kid")
    keys = _get_jwks()
    key = next((k for k in keys if k["kid"] == kid), None)
    if not key:
        raise HTTPException(status_code=401, detail="Public key not found in JWKS")

    public_key = jwk.construct(key)
    message, encoded_signature = str(token).rsplit(".", 1)
    decoded_signature = base64url_decode(encoded_signature.encode("utf-8"))
    if not public_key.verify(message.encode("utf-8"), decoded_signature):
        raise HTTPException(status_code=401, detail="Signature verification failed")

    claims = jwt.get_unverified_claims(token)
    if claims["exp"] < time.time():
        raise HTTPException(status_code=401, detail="Token expired")
    if claims.get("iss") != ISSUER:
        raise HTTPException(status_code=401, detail="Invalid issuer")

    token_use = claims.get("token_use")
    if token_use == "id" and claims.get("aud") != COGNITO_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Invalid audience")
    if token_use == "access" and claims.get("client_id") != COGNITO_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Invalid client_id")

    return claims


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Dict[str, Any]:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    claims = verify_cognito_token(creds.credentials)
    # Normalize user identifier across id/access tokens
    user_id = claims.get("sub")
    email = claims.get("email") or claims.get("username") or user_id
    return {"sub": user_id, "email": email, "claims": claims}
