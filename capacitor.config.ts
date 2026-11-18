import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shells (Android + iOS) wrap the same Vite build in `dist/`.
 *
 * The app is served from the bundled assets, so it works offline-first and
 * passes store review. Supabase is reached over HTTPS like on the web.
 * `server.androidScheme: "https"` keeps the origin `https://localhost`, which
 * Supabase Auth, localStorage and secure cookies all treat as a secure context.
 */
const config: CapacitorConfig = {
  appId: "com.illuxus.venues",
  appName: "Illuxus Venues",
  webDir: "dist",
  server: {
    androidScheme: "https",
    iosScheme: "https",
    hostname: "localhost",
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: false,
      backgroundColor: "#121212",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
