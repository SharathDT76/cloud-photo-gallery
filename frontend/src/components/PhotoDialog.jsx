import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DownloadSimple, Trash } from "@phosphor-icons/react";
import { formatBytes } from "@/components/PhotoCard";

const NONE_VALUE = "__none__";

export default function PhotoDialog({
  photo,
  albums = [],
  onClose,
  onDownload,
  onDelete,
  onAssignAlbum,
}) {
  const open = !!photo;
  const currentAlbum = photo?.album_id || NONE_VALUE;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-5xl bg-white/95 backdrop-blur-xl"
        data-testid="photo-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-heading text-xl truncate">
            {photo?.filename}
          </DialogTitle>
          <DialogDescription className="text-xs text-neutral-500">
            {photo &&
              `${photo.width}×${photo.height} · ${formatBytes(photo.size)} · ${new Date(
                photo.uploaded_at
              ).toLocaleString()}`}
          </DialogDescription>
        </DialogHeader>

        {photo && (
          <div className="relative bg-neutral-100 rounded-md overflow-hidden flex items-center justify-center max-h-[65vh]">
            <img
              src={photo.thumbnail_url}
              alt={photo.filename}
              className="w-full h-auto max-h-[65vh] object-contain"
            />
          </div>
        )}

        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 pt-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Album</span>
            <Select
              value={currentAlbum}
              onValueChange={(v) =>
                onAssignAlbum(photo, v === NONE_VALUE ? null : v)
              }
            >
              <SelectTrigger data-testid="photo-dialog-album-select" className="w-[200px] bg-white h-9">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Unassigned</SelectItem>
                {albums.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              data-testid="photo-dialog-download-btn"
              variant="outline"
              onClick={() => photo && onDownload(photo)}
            >
              <DownloadSimple size={16} className="mr-2" /> Download
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  data-testid="photo-dialog-delete-btn"
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash size={16} className="mr-2" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove the original and thumbnail from
                    S3 and metadata from DynamoDB.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="confirm-delete-cancel">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    data-testid="confirm-delete-confirm"
                    onClick={() => photo && onDelete(photo)}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
