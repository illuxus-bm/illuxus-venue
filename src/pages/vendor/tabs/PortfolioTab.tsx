import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState, EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { useMyPortfolio, type PortfolioItem } from "@/hooks/useMyPortfolio";
import { del, post, seg } from "@/lib/api";
import { uploadVendorImage, VENDOR_MEDIA_TYPES } from "@/lib/uploads";

/**
 * Portfolio — grid of past-work media. Each file is uploaded as
 * "vendor-media" (POST /api/me/uploads → PUT) and then recorded with
 * POST /api/me/portfolio { key }.
 *
 * Multi-file selection is supported: pick as many files as you want and
 * they upload sequentially with individual toasts for each failure.
 */
export default function PortfolioTab() {
  const { vendor } = useVendorAuth();
  const qc = useQueryClient();
  const { data: items = [], isLoading, error, refetch } = useMyPortfolio();
  const [uploading, setUploading] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const onFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !vendor || uploading) return;

    setUploading(true);
    let succeeded = 0;
    try {
      // Upload sequentially so we can capture partial errors and keep the
      // order the user picked them in (the server appends to the end).
      for (const file of files) {
        const result = await uploadVendorImage(file);
        if (!result.ok) {
          toast.error(`${file.name}: ${result.error}`);
          continue;
        }
        try {
          await post<PortfolioItem>("/me/portfolio", { key: result.key });
        } catch (err) {
          // The API cleans up the unreferenced upload.
          toast.error(`${file.name}: ${(err as Error).message}`);
          continue;
        }
        succeeded++;
      }

      if (succeeded > 0) {
        qc.invalidateQueries({ queryKey: ["vendor-portfolio", vendor.id] });
        toast.success(
          succeeded === 1 ? "Photo added" : `${succeeded} photos added`,
        );
      }
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (item: PortfolioItem) => {
    if (!vendor || deletingId) return;
    if (!confirm("Remove this photo from your portfolio?")) return;

    setDeletingId(item.id);
    try {
      // The server deletes the stored file too.
      await del(`/me/portfolio/${seg(item.id)}`);
      qc.invalidateQueries({ queryKey: ["vendor-portfolio", vendor.id] });
      toast.success("Removed");
    } catch (err) {
      toast.error((err as Error).message || "Could not remove photo");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept={VENDOR_MEDIA_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={onFilesChange}
      />

      <Card>
        <CardContent className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Showcase your past work
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Organizers see this on your public profile. JPG, PNG, or WEBP · up to 5 MB each.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? "Uploading…" : "Upload photos"}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : error ? (
        <ErrorState message="Couldn't load your portfolio." onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="h-6 w-6" />}
          message="Nothing here yet. A strong portfolio dramatically boosts win rate."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((it) => (
            <div
              key={it.id}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border/70 bg-secondary/40"
            >
              {it.media_type === "video" ? (
                <video src={it.url} className="h-full w-full object-cover" muted playsInline />
              ) : (
                <img
                  src={it.url}
                  alt={it.caption ?? ""}
                  className="h-full w-full object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => onDelete(it)}
                disabled={deletingId === it.id}
                className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white transition-opacity focus:opacity-100 focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                aria-label="Remove photo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              {it.caption ? (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-xs text-white">
                  {it.caption}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
