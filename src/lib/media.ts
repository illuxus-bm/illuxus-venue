/** One photo, video or file shown by MediaGallery on the public pages. */
export interface GalleryItem {
  id: string;
  url: string;
  caption: string | null;
  kind: "image" | "video" | "file";
}

export function mediaKindFromUrl(url: string, hint?: string | null): GalleryItem["kind"] {
  // The file extension wins over the stored hint: older rows may have an
  // image filed under "video", which would render as a broken <video>.
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return "video";
  if (/\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url)) return "image";
  if (/\.svg(\?|$)/i.test(url)) return "file";
  if (hint === "video") return "video";
  return "file";
}
