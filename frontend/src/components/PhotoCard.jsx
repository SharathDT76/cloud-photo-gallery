import { useState } from "react";
import { FolderSimple } from "@phosphor-icons/react";

export default function PhotoCard({ photo, onOpen, albumName }) {
  const [loaded, setLoaded] = useState(false);
  const ratio =
    photo.width && photo.height ? photo.height / photo.width : 1.2;
  return (
    <button
      onClick={onOpen}
      data-testid={`photo-card-${photo.id}`}
      className="masonry-col photo-card text-left w-full block group focus:outline-none focus:ring-2 focus:ring-neutral-900 rounded-lg"
    >
      <div className="relative w-full rounded-lg overflow-hidden bg-neutral-100">
        {!loaded && (
          <div
            className="absolute inset-0 shimmer"
            style={{ paddingBottom: `${ratio * 100}%` }}
            aria-hidden
          />
        )}
        <img
          src={photo.thumbnail_url}
          alt={photo.filename}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`w-full h-auto block rounded-lg ${loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-300`}
        />
        {albumName && (
          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur text-white text-[10px] uppercase tracking-widest px-2 py-1 rounded-md inline-flex items-center gap-1">
            <FolderSimple size={10} weight="fill" /> {albumName}
          </div>
        )}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
          <p className="text-white text-sm truncate">{photo.filename}</p>
          <p className="text-white/70 text-xs">{formatBytes(photo.size)}</p>
        </div>
      </div>
    </button>
  );
}

export function formatBytes(b) {
  if (!b) return "0 B";
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${["B", "KB", "MB", "GB"][i]}`;
}
