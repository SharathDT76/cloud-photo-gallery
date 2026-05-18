"""FastAPI entry point — serves as our API Gateway + Lambda orchestrator."""
import os
import logging
from pathlib import Path

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from photos_router import router as photos_router  # noqa: E402
from auth_router import router as auth_router  # noqa: E402
from albums_router import router as albums_router  # noqa: E402

app = FastAPI(title="Cloud Photo Gallery API")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {
        "service": "cloud-photo-gallery",
        "status": "ok",
        "region": os.environ.get("AWS_REGION"),
    }


@api_router.get("/health")
async def health():
    return {
        "ok": True,
        "buckets": {
            "originals": os.environ.get("ORIGINAL_BUCKET"),
            "thumbnails": os.environ.get("THUMBNAIL_BUCKET"),
        },
        "ddb_table": os.environ.get("DDB_TABLE"),
        "cognito_user_pool": os.environ.get("COGNITO_USER_POOL_ID"),
    }


app.include_router(api_router)
app.include_router(auth_router)
app.include_router(photos_router)
app.include_router(albums_router)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("photo-gallery")
logger.info(
    "Starting Cloud Photo Gallery API | region=%s originals=%s thumbnails=%s",
    os.environ.get("AWS_REGION"),
    os.environ.get("ORIGINAL_BUCKET"),
    os.environ.get("THUMBNAIL_BUCKET"),
)
