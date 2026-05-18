import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  apiListPhotos,
  apiUploadUrl,
  apiConfirmUpload,
  uploadToS3,
  apiDeletePhoto,
  apiDownloadUrl,
  apiListAlbums,
  apiAssignAlbum,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Image as ImageIcon,
  SignOut,
  User as UserIcon,
  UploadSimple,
} from "@phosphor-icons/react";
import UploadZone from "@/components/UploadZone";
import PhotoCard from "@/components/PhotoCard";
import PhotoDialog from "@/components/PhotoDialog";
import AlbumSidebar from "@/components/AlbumSidebar";

const PAGE_SIZE = 24;

export default function Gallery() {
  const { user, logout } = useAuth();
  const [photos, setPhotos] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [total, setTotal] = useState(0);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortBy, setSortBy] = useState("date");
  const [order, setOrder] = useState("desc");
  const [uploads, setUploads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [albums, setAlbums] = useState([]);
  const [activeAlbum, setActiveAlbum] = useState("all"); // 'all' | 'none' | album_id
  const fileInputRef = useRef(null);
  const sentinelRef = useRef(null);

  const albumIdParam = useMemo(
    () => (activeAlbum === "all" ? null : activeAlbum),
    [activeAlbum]
  );

  const loadFirstPage = useCallback(async () => {
    setLoadingInitial(true);
    try {
      const page = await apiListPhotos({
        sort_by: sortBy,
        order,
        limit: PAGE_SIZE,
        album_id: albumIdParam,
      });
      setPhotos(page.items);
      setCursor(page.next_cursor);
      setTotal(page.total);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load photos");
    } finally {
      setLoadingInitial(false);
    }
  }, [sortBy, order, albumIdParam]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await apiListPhotos({
        sort_by: sortBy,
        order,
        cursor,
        limit: PAGE_SIZE,
        album_id: albumIdParam,
      });
      setPhotos((p) => [...p, ...page.items]);
      setCursor(page.next_cursor);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, sortBy, order, albumIdParam]);

  const refreshAlbums = useCallback(async () => {
    try {
      const a = await apiListAlbums();
      setAlbums(a);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load albums");
    }
  }, []);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    refreshAlbums();
  }, [refreshAlbums]);

  // Infinite scroll observer
  useEffect(() => {
    if (!sentinelRef.current || !cursor) return;
    const el = sentinelRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "400px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [cursor, loadMore]);

  const handleFiles = useCallback(
    async (files) => {
      const list = Array.from(files).filter((f) => {
        // Accept normal images plus HEIC/HEIF (browsers sometimes report blank type)
        if (f.type?.startsWith("image/")) return true;
        const lower = f.name.toLowerCase();
        return lower.endsWith(".heic") || lower.endsWith(".heif");
      });
      if (!list.length) return;

      for (const file of list) {
        const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        setUploads((u) => [...u, { id, name: file.name, progress: 0, status: "starting" }]);

        try {
          // Resolve content_type for HEIC files where browsers leave it blank
          let contentType = file.type;
          const lower = file.name.toLowerCase();
          if (!contentType && lower.endsWith(".heic")) contentType = "image/heic";
          if (!contentType && lower.endsWith(".heif")) contentType = "image/heif";
          if (!contentType) contentType = "image/jpeg";

          const { photo_id, upload_url } = await apiUploadUrl(file.name, contentType);
          setUploads((u) => u.map((x) => (x.id === id ? { ...x, status: "uploading", progress: 10 } : x)));
          await uploadToS3(upload_url, new Blob([await file.arrayBuffer()], { type: contentType }));
          setUploads((u) => u.map((x) => (x.id === id ? { ...x, status: "processing", progress: 70 } : x)));
          const photo = await apiConfirmUpload({
            photo_id,
            filename: file.name,
            content_type: contentType,
            size: file.size,
            album_id: activeAlbum !== "all" && activeAlbum !== "none" ? activeAlbum : null,
          });
          setUploads((u) => u.map((x) => (x.id === id ? { ...x, status: "done", progress: 100 } : x)));
          setPhotos((p) => [photo, ...p]);
          setTotal((t) => t + 1);
          setTimeout(() => {
            setUploads((u) => u.filter((x) => x.id !== id));
          }, 1500);
          refreshAlbums();
        } catch (e) {
          const msg = e?.response?.data?.detail || e.message || "Upload failed";
          toast.error(`${file.name}: ${msg}`);
          setUploads((u) => u.map((x) => (x.id === id ? { ...x, status: "error", progress: 0 } : x)));
        }
      }
    },
    [activeAlbum, refreshAlbums]
  );

  const handleDelete = useCallback(
    async (photo) => {
      try {
        await apiDeletePhoto(photo.id);
        setPhotos((p) => p.filter((x) => x.id !== photo.id));
        setTotal((t) => Math.max(0, t - 1));
        toast.success("Photo deleted");
        setSelected(null);
        refreshAlbums();
      } catch (e) {
        toast.error(e?.response?.data?.detail || "Delete failed");
      }
    },
    [refreshAlbums]
  );

  const handleDownload = useCallback(async (photo) => {
    try {
      const { download_url, filename } = await apiDownloadUrl(photo.id);
      const a = document.createElement("a");
      a.href = download_url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Download failed");
    }
  }, []);

  const handleAssignAlbum = useCallback(
    async (photo, album_id) => {
      try {
        const updated = await apiAssignAlbum(photo.id, album_id);
        setPhotos((p) =>
          p.map((x) => (x.id === photo.id ? { ...x, album_id: updated.album_id } : x))
        );
        setSelected((s) => (s && s.id === photo.id ? { ...s, album_id: updated.album_id } : s));
        toast.success(
          album_id
            ? `Moved to "${albums.find((a) => a.id === album_id)?.name || "album"}"`
            : "Removed from album"
        );
        refreshAlbums();
      } catch (e) {
        toast.error(e?.response?.data?.detail || "Failed to update");
      }
    },
    [albums, refreshAlbums]
  );

  const unassignedCount = useMemo(() => {
    const assignedTotal = albums.reduce((acc, a) => acc + (a.photo_count || 0), 0);
    return Math.max(0, total - assignedTotal);
  }, [albums, total]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/75 border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2" data-testid="gallery-brand">
            <div className="h-7 w-7 rounded-md bg-neutral-900 flex items-center justify-center">
              <ImageIcon size={16} weight="bold" color="white" />
            </div>
            <span className="font-heading font-semibold tracking-tight">Shadow Gallery</span>
          </Link>

          <div className="flex items-center gap-2">
            <Button
              data-testid="gallery-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md bg-neutral-900 hover:bg-neutral-800"
            >
              <UploadSimple size={16} weight="bold" className="mr-2" />
              Upload
            </Button>
            <input
              ref={fileInputRef}
              data-testid="gallery-file-input"
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid="gallery-user-menu-trigger"
                  className="h-9 w-9 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center"
                  aria-label="user menu"
                >
                  <UserIcon size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="text-xs text-neutral-500">Signed in as</p>
                  <p className="truncate text-neutral-900">{user?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} data-testid="gallery-signout-item">
                  <SignOut size={14} className="mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-neutral-500">
              {activeAlbum === "all"
                ? "Your archive"
                : activeAlbum === "none"
                ? "Unassigned"
                : albums.find((a) => a.id === activeAlbum)?.name || "Album"}
            </p>
            <h1 className="font-heading text-4xl sm:text-5xl font-semibold tracking-tight mt-2">
              Gallery
              <span className="text-neutral-400"> · {total}</span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger data-testid="gallery-sort-by" className="w-[150px] bg-white">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Upload date</SelectItem>
                <SelectItem value="size">File size</SelectItem>
              </SelectContent>
            </Select>
            <Select value={order} onValueChange={setOrder}>
              <SelectTrigger data-testid="gallery-order" className="w-[140px] bg-white">
                <SelectValue placeholder="Order" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Descending</SelectItem>
                <SelectItem value="asc">Ascending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <UploadZone onFiles={handleFiles} uploads={uploads} />

        {/* Layout: sidebar + grid */}
        <div className="mt-10 flex flex-col lg:flex-row gap-10">
          <AlbumSidebar
            albums={albums}
            selected={activeAlbum}
            onSelect={setActiveAlbum}
            totalPhotos={total}
            unassignedCount={unassignedCount}
            onAlbumsChanged={refreshAlbums}
          />

          <section className="flex-1 min-w-0" data-testid="gallery-photos-section">
            {loadingInitial ? (
              <div className="columns-1 sm:columns-2 lg:columns-2 xl:columns-3 gap-6 space-y-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="masonry-col rounded-lg shimmer"
                    style={{ height: 160 + ((i * 53) % 220) }}
                  />
                ))}
              </div>
            ) : photos.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <div className="columns-1 sm:columns-2 lg:columns-2 xl:columns-3 gap-6 space-y-6">
                  {photos.map((p) => (
                    <PhotoCard
                      key={p.id}
                      photo={p}
                      onOpen={() => setSelected(p)}
                      albumName={albums.find((a) => a.id === p.album_id)?.name}
                    />
                  ))}
                </div>
                {/* Infinite scroll sentinel */}
                <div ref={sentinelRef} className="h-12" />
                {loadingMore && (
                  <p className="text-center text-sm text-neutral-500 py-4">
                    Loading more...
                  </p>
                )}
                {!cursor && photos.length > 0 && (
                  <p className="text-center text-xs text-neutral-400 py-6">
                    You've reached the end · {total} photo{total === 1 ? "" : "s"}
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </main>

      <PhotoDialog
        photo={selected}
        albums={albums}
        onClose={() => setSelected(null)}
        onDownload={handleDownload}
        onDelete={handleDelete}
        onAssignAlbum={handleAssignAlbum}
      />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-24" data-testid="gallery-empty-state">
      <div className="inline-flex h-16 w-16 rounded-full bg-neutral-100 items-center justify-center mb-6">
        <ImageIcon size={26} weight="duotone" />
      </div>
      <h2 className="font-heading text-2xl tracking-tight">Nothing here yet</h2>
      <p className="mt-2 text-neutral-600">Drag images above, or hit the Upload button.</p>
    </div>
  );
}
