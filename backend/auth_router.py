"""Cognito authentication endpoints (Email + Password flow via boto3).
Avoids the need for the Hosted UI redirect, while still using your User Pool."""
import os
import hmac
import hashlib
import base64
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field
from botocore.exceptions import ClientError

from aws_clients import cognito_client, COGNITO_CLIENT_ID, COGNITO_USER_POOL_ID
from cognito_auth import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

COGNITO_CLIENT_SECRET = os.environ.get("COGNITO_CLIENT_SECRET", "").strip()


def _secret_hash(username: str) -> Optional[str]:
    if not COGNITO_CLIENT_SECRET:
        return None
    msg = (username + COGNITO_CLIENT_ID).encode("utf-8")
    dig = hmac.new(COGNITO_CLIENT_SECRET.encode("utf-8"), msg, hashlib.sha256).digest()
    return base64.b64encode(dig).decode()


def _maybe_secret(kwargs: dict, username: str):
    sh = _secret_hash(username)
    if sh:
        kwargs["SecretHash"] = sh
    return kwargs


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class ConfirmRequest(BaseModel):
    email: EmailStr
    code: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ResendRequest(BaseModel):
    email: EmailStr


@router.post("/signup")
async def signup(body: SignupRequest):
    kwargs = {
        "ClientId": COGNITO_CLIENT_ID,
        "Username": body.email,
        "Password": body.password,
        "UserAttributes": [{"Name": "email", "Value": body.email}],
    }
    kwargs = _maybe_secret(kwargs, body.email)
    try:
        resp = cognito_client.sign_up(**kwargs)
    except ClientError as exc:
        raise HTTPException(status_code=400, detail=exc.response["Error"]["Message"])
    return {
        "user_sub": resp.get("UserSub"),
        "user_confirmed": resp.get("UserConfirmed", False),
        "message": "Signed up. Check your email for the confirmation code.",
    }


@router.post("/confirm")
async def confirm_signup(body: ConfirmRequest):
    kwargs = {
        "ClientId": COGNITO_CLIENT_ID,
        "Username": body.email,
        "ConfirmationCode": body.code,
    }
    kwargs = _maybe_secret(kwargs, body.email)
    try:
        cognito_client.confirm_sign_up(**kwargs)
    except ClientError as exc:
        raise HTTPException(status_code=400, detail=exc.response["Error"]["Message"])
    return {"confirmed": True}


@router.post("/resend-code")
async def resend_code(body: ResendRequest):
    kwargs = {"ClientId": COGNITO_CLIENT_ID, "Username": body.email}
    kwargs = _maybe_secret(kwargs, body.email)
    try:
        cognito_client.resend_confirmation_code(**kwargs)
    except ClientError as exc:
        raise HTTPException(status_code=400, detail=exc.response["Error"]["Message"])
    return {"sent": True}


@router.post("/login")
async def login(body: LoginRequest):
    auth_params = {"USERNAME": body.email, "PASSWORD": body.password}
    sh = _secret_hash(body.email)
    if sh:
        auth_params["SECRET_HASH"] = sh
    try:
        resp = cognito_client.initiate_auth(
            ClientId=COGNITO_CLIENT_ID,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters=auth_params,
        )
    except ClientError as exc:
        raise HTTPException(status_code=401, detail=exc.response["Error"]["Message"])

    if "AuthenticationResult" not in resp:
        # Handle challenges like NEW_PASSWORD_REQUIRED
        raise HTTPException(
            status_code=400,
            detail=f"Auth challenge required: {resp.get('ChallengeName')}",
        )
    r = resp["AuthenticationResult"]
    return {
        "id_token": r["IdToken"],
        "access_token": r["AccessToken"],
        "refresh_token": r.get("RefreshToken"),
        "expires_in": r.get("ExpiresIn"),
        "token_type": r.get("TokenType", "Bearer"),
    }


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return {"sub": user["sub"], "email": user["email"]}
