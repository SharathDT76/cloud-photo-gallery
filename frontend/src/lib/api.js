import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const STORAGE_KEY = "cpg.tokens";

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((cfg) => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const t = JSON.parse(raw);
      if (t?.id_token) cfg.headers.Authorization = `Bearer ${t.id_token}`;
    }
  } catch (_) {}
  return cfg;
});

// Auth
export const apiSignup = (email, password) =>
  api.post("/auth/signup", { email, password }).then((r) => r.data);
export const apiConfirm = (email, code) =>
  api.post("/auth/confirm", { email, code }).then((r) => r.data);
export const apiResend = (email) =>
  api.post("/auth/resend-code", { email }).then((r) => r.data);
export const apiLogin = (email, password) =>
  api.post("/auth/login", { email, password }).then((r) => r.data);
export const apiMe = () => api.get("/auth/me").then((r) => r.data);

// Photos
export const apiUploadUrl = (filename, content_type) =>
  api
    .get("/photos/upload-url", { params: { filename, content_type } })
    .then((r) => r.data);
export const apiConfirmUpload = (body) =>
  api.post("/photos/confirm-upload", body).then((r) => r.data);

export const apiListPhotos = ({
  sort_by = "date",
  order = "desc",
  cursor = null,
  limit = 24,
  album_id = null,
} = {}) =>
  api
    .get("/photos", {
      params: {
        sort_by,
        order,
        limit,
        ...(cursor ? { cursor } : {}),
        ...(album_id ? { album_id } : {}),
      },
    })
    .then((r) => r.data);

export const apiDownloadUrl = (id) =>
  api.get(`/photos/${id}/download-url`).then((r) => r.data);
export const apiDeletePhoto = (id) =>
  api.delete(`/photos/${id}`).then((r) => r.data);
export const apiAssignAlbum = (photoId, album_id) =>
  api.patch(`/photos/${photoId}/album`, { album_id }).then((r) => r.data);

// Albums
export const apiListAlbums = () =>
  api.get("/albums").then((r) => r.data);
export const apiCreateAlbum = (name) =>
  api.post("/albums", { name }).then((r) => r.data);
export const apiDeleteAlbum = (id) =>
  api.delete(`/albums/${id}`).then((r) => r.data);

// Upload directly to S3 with the pre-signed URL
export const uploadToS3 = (uploadUrl, file) =>
  axios.put(uploadUrl, file, {
    headers: { "Content-Type": file.type },
  });
