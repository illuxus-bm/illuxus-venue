import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scroll handling on navigation: jump to `#section` when the URL has a hash
 * (retrying briefly while lazy routes / data render), otherwise reset to the
 * top. SPAs keep the old offset by default.
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    let timer: number | undefined;
    const attempt = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (tries++ < 20) timer = window.setTimeout(attempt, 100);
    };
    attempt();
    return () => window.clearTimeout(timer);
  }, [pathname, hash]);

  return null;
}
