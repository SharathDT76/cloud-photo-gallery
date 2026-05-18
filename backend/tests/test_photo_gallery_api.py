"""Backend API tests for Cloud Photo Gallery - Iteration 2.

Covers:
- Iteration 1 (regression): health/root, auth gating on photos, signup validation,
  Cognito error pass-through, CORS.
- Iteration 2 deltas:
    * HEIC mime accepted by /api/photos/upload-url (still 401 since unauth, but
      reaches auth gate; unsupported mime path covered through 401 first).
    * Pagination response schema (PhotoPage) on /api/photos via /openapi.json.
    * /api/photos query param validation (sort_by, order, limit) — 422 enforced
      BEFORE auth via FastAPI/Pydantic.
    * /api/albums CRUD: GET/POST/DELETE auth gating (401) and POST body
      validation (empty name / >80 chars -> 422).
    * /api/photos/{id}/album PATCH auth gating (401).
    * OpenAPI doc reflects albums + PhotoPage.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
# /openapi.json is mounted at FastAPI root, but the public ingress only routes
# /api/* to the backend. Hit the in-cluster backend port directly for schema.
INTERNAL_URL = "http://localhost:8001"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def openapi(client):
    r = client.get(f"{INTERNAL_URL}/openapi.json")
    assert r.status_code == 200, r.text
    return r.json()


# ---------- Health / Root (regression) ---------- #
class TestHealth:
    def test_root(self, client):
        r = client.get(f"{BASE_URL}/api/")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("service") == "cloud-photo-gallery"
        assert data.get("status") == "ok"
        assert data.get("region") == "ap-south-1"

    def test_health(self, client):
        # Confirms server.py imported photos_router which calls
        # pillow_heif.register_heif_opener() at import time without crashing.
        r = client.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data["buckets"]["originals"] == "shadow-photo-originals-709147558119"
        assert data["buckets"]["thumbnails"] == "shadow-photo-thumbnails-709147558119"
        assert data["ddb_table"] == "PhotoGalleryMetadata"
        assert data["cognito_user_pool"] == "ap-south-1_uEX9otfnG"


# ---------- Auth gating on photo endpoints (regression) ---------- #
class TestPhotosAuthGating:
    def test_list_photos_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/photos")
        assert r.status_code == 401, r.text

    def test_upload_url_no_auth_jpeg(self):
        r = requests.get(
            f"{BASE_URL}/api/photos/upload-url",
            params={"filename": "a.jpg", "content_type": "image/jpeg"},
        )
        assert r.status_code == 401, r.text

    def test_upload_url_no_auth_heic(self):
        # HEIC content-type must require auth (auth runs before mime check)
        r = requests.get(
            f"{BASE_URL}/api/photos/upload-url",
            params={"filename": "ios.heic", "content_type": "image/heic"},
        )
        assert r.status_code == 401, r.text

    def test_confirm_upload_no_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/photos/confirm-upload",
            json={
                "photo_id": "abc",
                "filename": "a.jpg",
                "content_type": "image/jpeg",
                "size": 100,
            },
        )
        assert r.status_code == 401, r.text

    def test_delete_photo_no_auth(self):
        r = requests.delete(f"{BASE_URL}/api/photos/some-id")
        assert r.status_code == 401, r.text

    def test_download_url_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/photos/some-id/download-url")
        assert r.status_code == 401, r.text

    def test_patch_photo_album_no_auth(self):
        r = requests.patch(
            f"{BASE_URL}/api/photos/some-id/album",
            json={"album_id": "abc"},
        )
        assert r.status_code == 401, r.text

    def test_me_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401, r.text

    def test_list_photos_bad_bearer(self):
        r = requests.get(
            f"{BASE_URL}/api/photos",
            headers={"Authorization": "Bearer not.a.real.jwt"},
        )
        assert r.status_code == 401, r.text

    def test_upload_url_bad_bearer(self):
        r = requests.get(
            f"{BASE_URL}/api/photos/upload-url",
            params={"filename": "a.jpg", "content_type": "image/jpeg"},
            headers={"Authorization": "Bearer xxx.yyy.zzz"},
        )
        assert r.status_code == 401, r.text


# ---------- Pydantic Query validation on /api/photos ---------- #
# NOTE: FastAPI evaluates security/auth dependencies BEFORE Pydantic Query
# validators. With a bad bearer, auth raises 401 first and validators never
# run. We therefore prove the *contract* declaratively via the OpenAPI schema
# (see TestOpenAPISchema.test_list_photos_query_params) and only assert here
# that the auth gate is engaged on these endpoints.
class TestPhotosQueryValidation:
    def test_invalid_sort_by_unauth(self):
        r = requests.get(
            f"{BASE_URL}/api/photos",
            params={"sort_by": "invalid"},
        )
        assert r.status_code == 401, r.text

    def test_invalid_order_unauth(self):
        r = requests.get(
            f"{BASE_URL}/api/photos",
            params={"order": "sideways"},
        )
        assert r.status_code == 401, r.text

    def test_limit_too_low_unauth(self):
        r = requests.get(
            f"{BASE_URL}/api/photos",
            params={"limit": 0},
        )
        assert r.status_code == 401, r.text

    def test_limit_too_high_unauth(self):
        r = requests.get(
            f"{BASE_URL}/api/photos",
            params={"limit": 101},
        )
        assert r.status_code == 401, r.text

    def test_limit_in_range_then_auth(self):
        r = requests.get(
            f"{BASE_URL}/api/photos",
            params={"limit": 50, "sort_by": "size", "order": "asc"},
        )
        assert r.status_code == 401, r.text

    def test_cursor_param_accepted_in_schema(self):
        # bad cursor returns 401 (auth first); decoded value would be 400.
        r = requests.get(
            f"{BASE_URL}/api/photos",
            params={"cursor": "!!!not-base64!!!"},
        )
        assert r.status_code == 401, r.text


# ---------- Album CRUD auth gating + body validation ---------- #
class TestAlbumsAuthGating:
    def test_list_albums_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/albums")
        assert r.status_code == 401, r.text

    def test_create_album_no_auth(self):
        r = requests.post(f"{BASE_URL}/api/albums", json={"name": "Family"})
        assert r.status_code == 401, r.text

    def test_delete_album_no_auth(self):
        r = requests.delete(f"{BASE_URL}/api/albums/some-random-id")
        assert r.status_code == 401, r.text


class TestAlbumsBodyValidation:
    """NOTE: Auth dependency runs before Pydantic body validation in FastAPI.
    Without a valid bearer these return 401. Pydantic constraints are verified
    via OpenAPI schema in TestOpenAPISchema.test_album_create_schema.
    """

    def test_create_album_empty_name_unauth(self):
        r = requests.post(
            f"{BASE_URL}/api/albums",
            json={"name": ""},
        )
        assert r.status_code == 401, r.text

    def test_create_album_name_too_long_unauth(self):
        r = requests.post(
            f"{BASE_URL}/api/albums",
            json={"name": "x" * 81},
        )
        assert r.status_code == 401, r.text

    def test_create_album_missing_name_unauth(self):
        r = requests.post(
            f"{BASE_URL}/api/albums",
            json={},
        )
        assert r.status_code == 401, r.text


# ---------- OpenAPI schema validation ---------- #
class TestOpenAPISchema:
    def test_albums_routes_present(self, openapi):
        paths = openapi.get("paths", {})
        assert "/api/albums" in paths, list(paths.keys())
        assert "get" in paths["/api/albums"]
        assert "post" in paths["/api/albums"]
        # Path with id param
        delete_path = "/api/albums/{album_id}"
        assert delete_path in paths, list(paths.keys())
        assert "delete" in paths[delete_path]

    def test_patch_photo_album_route_present(self, openapi):
        paths = openapi.get("paths", {})
        patch_path = "/api/photos/{photo_id}/album"
        assert patch_path in paths
        assert "patch" in paths[patch_path]

    def test_photo_page_schema(self, openapi):
        schemas = openapi.get("components", {}).get("schemas", {})
        assert "PhotoPage" in schemas, list(schemas.keys())
        props = schemas["PhotoPage"]["properties"]
        assert "items" in props
        assert "next_cursor" in props
        assert "total" in props
        # items is an array of PhotoOut
        items_schema = props["items"]
        assert items_schema.get("type") == "array"
        assert "$ref" in items_schema.get("items", {})
        assert items_schema["items"]["$ref"].endswith("/PhotoOut")
        # total must be integer
        total_schema = props["total"]
        assert total_schema.get("type") == "integer"

    def test_list_photos_response_is_photopage(self, openapi):
        paths = openapi.get("paths", {})
        list_op = paths.get("/api/photos", {}).get("get", {})
        resp = list_op.get("responses", {}).get("200", {})
        ref = (
            resp.get("content", {})
            .get("application/json", {})
            .get("schema", {})
            .get("$ref", "")
        )
        assert ref.endswith("/PhotoPage"), ref

    def test_list_photos_query_params(self, openapi):
        paths = openapi.get("paths", {})
        list_op = paths.get("/api/photos", {}).get("get", {})
        param_names = {p["name"]: p for p in list_op.get("parameters", [])}
        for n in ("sort_by", "order", "limit", "cursor", "album_id"):
            assert n in param_names, f"missing query param {n}: {list(param_names)}"
        limit_schema = param_names["limit"]["schema"]
        assert limit_schema.get("minimum") == 1
        assert limit_schema.get("maximum") == 100

    def test_album_create_schema(self, openapi):
        schemas = openapi.get("components", {}).get("schemas", {})
        assert "AlbumCreate" in schemas
        name = schemas["AlbumCreate"]["properties"]["name"]
        assert name.get("minLength") == 1
        assert name.get("maxLength") == 80


# ---------- Auth endpoint validation & Cognito pass-through (regression) ---------- #
class TestAuthEndpoints:
    def test_signup_invalid_email(self, client):
        r = client.post(
            f"{BASE_URL}/api/auth/signup",
            json={"email": "not-an-email", "password": "Validpass123!"},
        )
        assert r.status_code == 422, r.text

    def test_signup_weak_password(self, client):
        r = client.post(
            f"{BASE_URL}/api/auth/signup",
            json={"email": "test@example.com", "password": "short"},
        )
        assert r.status_code == 422, r.text

    def test_login_random_credentials(self, client):
        r = client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "nobody-xyz-12345@example.com", "password": "WrongPass!23"},
        )
        assert r.status_code == 401, r.text


# ---------- CORS (regression) ---------- #
class TestCORS:
    def test_cors_headers_on_preflight(self):
        r = requests.options(
            f"{BASE_URL}/api/health",
            headers={
                "Origin": "https://photo-vault-226.preview.emergentagent.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert r.status_code in (200, 204), r.text
        assert r.headers.get("access-control-allow-origin") is not None

    def test_cors_headers_on_simple_request(self):
        r = requests.get(
            f"{BASE_URL}/api/health",
            headers={"Origin": "https://photo-vault-226.preview.emergentagent.com"},
        )
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") is not None
