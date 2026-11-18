import { Capacitor } from "@capacitor/core";

/** True inside the Android / iOS Capacitor shell. */
export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform() as "web" | "android" | "ios";

/**
 * Open a URL outside the app. In the native shell this uses the system
 * in-app browser (SFSafariViewController / Chrome Custom Tabs) so the user
 * never gets stranded in a WebView with no back button. On the web it opens
 * a new tab.
 */
export async function openExternal(url: string): Promise<void> {
  if (isNative) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * One-time native setup: status bar, splash screen, Android back button,
 * external links, keyboard. A no-op on the web.
 */
export async function initNative(navigate: (to: number) => void): Promise<void> {
  if (!isNative) return;
  document.documentElement.classList.add("native", `platform-${platform}`);

  const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import("@capacitor/app"),
    import("@capacitor/status-bar"),
    import("@capacitor/splash-screen"),
  ]);

  const syncStatusBar = () => {
    const dark = document.documentElement.classList.contains("dark");
    void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
    if (platform === "android") {
      void StatusBar.setBackgroundColor({ color: dark ? "#121212" : "#fafafa" }).catch(() => undefined);
    }
  };
  syncStatusBar();
  new MutationObserver(syncStatusBar).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  // Android hardware back: go back in history, or leave the app at the root.
  void App.addListener("backButton", ({ canGoBack }) => {
    // Let an open dialog/sheet close first (Radix listens for Escape).
    const openDialog = document.querySelector('[role="dialog"][data-state="open"]');
    if (openDialog) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return;
    }
    if (canGoBack && window.history.length > 1) navigate(-1);
    else void App.exitApp();
  });

  // Links with target="_blank" (illuxus.com, maps, socials) open in the
  // system browser instead of replacing the app's WebView.
  document.addEventListener(
    "click",
    (event) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!/^https?:\/\//i.test(href)) {
        if (/^(mailto|tel):/i.test(href)) {
          event.preventDefault();
          window.open(href, "_system");
        }
        return;
      }
      const url = new URL(href);
      if (url.origin === window.location.origin) return;
      event.preventDefault();
      void openExternal(url.toString());
    },
    true,
  );

  await SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => undefined);
}
