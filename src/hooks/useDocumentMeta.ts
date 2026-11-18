import { useEffect } from "react";

const SITE = "Illuxus Venues";

interface Meta {
  /** Page title; " · Illuxus Venues" is appended. */
  title?: string;
  description?: string;
  /** Absolute image URL for link previews. */
  image?: string | null;
  /** Keep private / error pages out of search results. */
  noindex?: boolean;
}

function setMeta(attr: "name" | "property", key: string, value: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (value == null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", value);
}

/**
 * Per-page <title>, description, Open Graph tags and robots, restored on
 * unmount. Client-side only, which is enough for Google (it renders JS) and
 * for in-app navigation; crawlers that don't run JS see index.html's defaults.
 */
export function useDocumentMeta({ title, description, image, noindex }: Meta) {
  useEffect(() => {
    const prevTitle = document.title;
    const prevDesc = document.head
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.getAttribute("content") ?? null;

    const fullTitle = title ? `${title} · ${SITE}` : prevTitle;
    document.title = fullTitle;
    if (description) setMeta("name", "description", description.slice(0, 300));
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description?.slice(0, 300) ?? prevDesc);
    setMeta("property", "og:image", image ?? null);
    setMeta("property", "og:url", window.location.href);
    setMeta("name", "robots", noindex ? "noindex, nofollow" : null);

    return () => {
      document.title = prevTitle;
      if (prevDesc) setMeta("name", "description", prevDesc);
      setMeta("name", "robots", null);
      setMeta("property", "og:image", null);
    };
  }, [title, description, image, noindex]);
}
