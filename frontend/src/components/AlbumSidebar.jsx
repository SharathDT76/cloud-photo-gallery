import { useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  FolderSimple,
  Trash,
  ImageSquare,
  ImagesSquare,
} from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiCreateAlbum, apiDeleteAlbum } from "@/lib/api";

export default function AlbumSidebar({
  albums,
  selected, // 'all' | 'none' | album_id
  onSelect,
  totalPhotos,
  unassignedCount,
  onAlbumsChanged,
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function createAlbum(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await apiCreateAlbum(name.trim());
      toast.success(`Album "${name}" created`);
      setName("");
      setOpen(false);
      onAlbumsChanged();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to create album");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAlbum(id) {
    try {
      await apiDeleteAlbum(id);
      toast.success("Album deleted");
      if (selected === id) onSelect("all");
      onAlbumsChanged();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to delete album");
    }
  }

  return (
    <aside
      className="w-full lg:w-64 lg:sticky lg:top-20 lg:self-start space-y-1"
      data-testid="album-sidebar"
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          Albums
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button
              data-testid="album-create-trigger"
              className="h-7 w-7 rounded-md hover:bg-neutral-100 inline-flex items-center justify-center"
              aria-label="New album"
            >
              <Plus size={14} />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>New album</DialogTitle>
            </DialogHeader>
            <form onSubmit={createAlbum} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="album-name">Album name</Label>
                <Input
                  id="album-name"
                  data-testid="album-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Summer trip"
                  required
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={busy || !name.trim()}
                  data-testid="album-create-submit"
                  className="bg-neutral-900 hover:bg-neutral-800"
                >
                  {busy ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <SidebarItem
        active={selected === "all"}
        onClick={() => onSelect("all")}
        icon={<ImagesSquare size={16} />}
        label="All photos"
        count={totalPhotos}
        testid="album-item-all"
      />
      <SidebarItem
        active={selected === "none"}
        onClick={() => onSelect("none")}
        icon={<ImageSquare size={16} />}
        label="Unassigned"
        count={unassignedCount}
        testid="album-item-none"
      />

      <div className="my-3 border-t border-neutral-200" />

      {albums.length === 0 && (
        <p className="text-xs text-neutral-400 px-3">
          No albums yet. Hit + to create one.
        </p>
      )}

      {albums.map((a) => (
        <div
          key={a.id}
          className={`group flex items-center rounded-md ${
            selected === a.id ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"
          }`}
        >
          <button
            onClick={() => onSelect(a.id)}
            data-testid={`album-item-${a.id}`}
            className="flex-1 min-w-0 px-3 py-2 text-left inline-flex items-center gap-2"
          >
            <FolderSimple size={16} weight={selected === a.id ? "fill" : "regular"} />
            <span className="truncate text-sm">{a.name}</span>
            <span
              className={`ml-auto text-xs ${
                selected === a.id ? "text-white/70" : "text-neutral-500"
              }`}
            >
              {a.photo_count}
            </span>
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                data-testid={`album-delete-${a.id}`}
                className={`opacity-0 group-hover:opacity-100 mr-2 p-1 rounded ${
                  selected === a.id ? "text-white" : "text-neutral-500 hover:text-red-600"
                }`}
                aria-label={`Delete ${a.name}`}
              >
                <Trash size={14} />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete album "{a.name}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  Photos inside will be moved back to <b>Unassigned</b>. The
                  album itself will be permanently removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteAlbum(a.id)}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ))}
    </aside>
  );
}

function SidebarItem({ active, onClick, icon, label, count, testid }) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`w-full px-3 py-2 rounded-md text-left inline-flex items-center gap-2 ${
        active ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"
      }`}
    >
      {icon}
      <span className="truncate text-sm">{label}</span>
      <span
        className={`ml-auto text-xs ${active ? "text-white/70" : "text-neutral-500"}`}
      >
        {count}
      </span>
    </button>
  );
}
