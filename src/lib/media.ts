/** One photo, video or file shown by MediaGallery on the public pages. */
export interface GalleryItem {
  id: string;
  url: string;
  caption: string | null;
  kind: "image" | "video" | "file";
}

export function mediaKindFromUrl(url: string, hint?: string | null): GalleryItem["kind"] {
  if (hint === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(url)) return "video";
  if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url)) return "image";
  return "file";
}
