import * as React from "react";
import { ChevronLeft, ChevronRight, FileText, Play, X } from "lucide-react";

import type { GalleryItem } from "@/lib/media";
import { cn } from "@/lib/utils";

/**
 * Photo / video gallery for the public pages: a large lead item, a strip of
 * thumbnails, and a full-screen viewer with arrow-key navigation. PDFs (floor
 * plans) can't be previewed inline, so they open in a new tab instead.
 */

export function MediaGallery({ items, className }: { items: GalleryItem[]; className?: string }) {
  const [open, setOpen] = React.useState<number | null>(null);
  const viewable = items.filter((i) => i.kind !== "file");
  const files = items.filter((i) => i.kind === "file");
  if (items.length === 0) return null;

  const [lead, ...rest] = viewable;
  return (
    <div className={cn("space-y-3", className)}>
      {lead && (
        <button
          type="button"
          onClick={() => setOpen(0)}
          className="group relative block aspect-[16/9] w-full overflow-hidden rounded-[20px] border border-border bg-muted"
          aria-label={`Open ${lead.caption ?? "media"} full screen`}
        >
          <Thumb item={lead} large />
        </button>
      )}
      {rest.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {rest.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setOpen(i + 1)}
              className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
              aria-label={`Open ${item.caption ?? "media"} full screen`}
            >
              <Thumb item={item} />
            </button>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f) => (
            <a
              key={f.id}
              href={f.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-[13px] font-medium hover:border-foreground/30"
            >
              <FileText className="h-4 w-4 text-primary" />
              {f.caption ?? "Floor plan (PDF)"}
            </a>
          ))}
        </div>
      )}
      {open !== null && <Viewer items={viewable} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Thumb({ item, large = false }: { item: GalleryItem; large?: boolean }) {
  if (item.kind === "video") {
    return (
      <>
        <video src={item.url} muted preload="metadata" className="h-full w-full object-cover" />
        <span className="absolute inset-0 grid place-items-center bg-black/20">
          <span className={cn("grid place-items-center rounded-full bg-background/90 text-foreground", large ? "h-14 w-14" : "h-9 w-9")}>
            <Play className={large ? "h-6 w-6" : "h-4 w-4"} />
          </span>
        </span>
      </>
    );
  }
  return (
    <img
      src={item.url}
      alt={item.caption ?? ""}
      loading={large ? "eager" : "lazy"}
      decoding="async"
      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
    />
  );
}

function Viewer({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: GalleryItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const item = items[index];
  const go = React.useCallback(
    (delta: number) => onIndex((index + delta + items.length) % items.length),
    [index, items.length, onIndex],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [go, onClose]);

  if (!item) return null;
  const nav = "grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20";
  return (
    <div role="dialog" aria-modal="true" aria-label="Media viewer" className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-between p-4 text-white/80" onClick={(e) => e.stopPropagation()}>
        <span className="num text-[13px]">
          {index + 1} / {items.length}
        </span>
        <button type="button" onClick={onClose} className={nav} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-4 pb-4" onClick={(e) => e.stopPropagation()}>
        {item.kind === "video" ? (
          <video key={item.url} src={item.url} controls autoPlay className="max-h-full max-w-full rounded-lg" />
        ) : (
          <img src={item.url} alt={item.caption ?? ""} className="max-h-full max-w-full rounded-lg object-contain" />
        )}
        {items.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} className={cn(nav, "absolute left-4")} aria-label="Previous">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => go(1)} className={cn(nav, "absolute right-4")} aria-label="Next">
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
      {item.caption && (
        <p className="px-4 pb-6 text-center text-[14px] text-white/80" onClick={(e) => e.stopPropagation()}>
          {item.caption}
        </p>
      )}
    </div>
  );
}
