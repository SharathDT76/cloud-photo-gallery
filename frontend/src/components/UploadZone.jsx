import { useCallback, useRef, useState } from "react";
import { UploadSimple, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { Progress } from "@/components/ui/progress";

export default function UploadZone({ onFiles, uploads }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDrag(false);
      if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
    },
    [onFiles]
  );

  return (
    <div
      data-testid="upload-zone"
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative cursor-pointer border-2 border-dashed rounded-xl px-8 py-12 transition-colors bg-neutral-50 hover:bg-neutral-100 ${
        drag ? "dropzone-active" : "border-neutral-300"
      }`}
    >
      <input
        ref={inputRef}
        data-testid="upload-zone-input"
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => e.target.files?.length && onFiles(e.target.files)}
      />
      <div className="flex flex-col items-center justify-center text-center">
        <div className="h-12 w-12 rounded-full bg-neutral-900 flex items-center justify-center mb-4">
          <UploadSimple size={20} color="white" weight="bold" />
        </div>
        <p className="font-heading text-xl tracking-tight text-neutral-900">
          Drop photos here, or click to browse
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          JPG, PNG, WebP, GIF · uploads go directly to your private S3 bucket
        </p>
      </div>

      {uploads?.length > 0 && (
        <div className="mt-8 max-w-xl mx-auto space-y-3" data-testid="upload-progress-list">
          {uploads.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-3 bg-white border border-neutral-200 rounded-md px-3 py-2"
              data-testid={`upload-row-${u.status}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate text-neutral-900">{u.name}</p>
                <Progress value={u.progress} className="mt-1 h-1" />
              </div>
              <span className="text-xs text-neutral-500 w-20 text-right">
                {u.status === "done" ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <CheckCircle size={14} weight="fill" /> done
                  </span>
                ) : u.status === "error" ? (
                  <span className="inline-flex items-center gap-1 text-red-600">
                    <WarningCircle size={14} weight="fill" /> error
                  </span>
                ) : (
                  u.status
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
