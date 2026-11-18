/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// The vendor app runs on a different port than illuxus so both can run
// side by side against the same Supabase backend during local dev.
//
// `--mode native` (used by `npm run build:native`) builds for the Capacitor
// shells: no service worker there, because the app is already served from
// bundled assets and a SW would only get in the way of native updates.
export default defineConfig(({ mode }) => {
  const isNative = mode === "native";

  return {
    server: {
      host: "::",
      port: 8081,
    },
    preview: {
      port: 8081,
    },
    plugins: [
      react(),
      VitePWA({
        disable: isNative,
        registerType: "autoUpdate",
        injectRegister: false,
        includeAssets: ["favicon.svg", "apple-touch-icon.png"],
        manifest: {
          id: "/",
          name: "Illuxus Venues",
          short_name: "Illuxus Venues",
          description:
            "Manage your venues, booking requests, quotes and availability on Illuxus.",
          start_url: "/vendor",
          scope: "/",
          display: "standalone",
          orientation: "portrait",
          background_color: "#121212",
          theme_color: "#7E22CE",
          categories: ["business", "productivity"],
          icons: [
            { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
            {
              src: "/maskable-icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          // Precache only the app shell. API traffic (Supabase) always goes to
          // the network so vendors never act on stale bookings or quotes.
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: ({ url }) =>
                url.origin === "https://fonts.googleapis.com" ||
                url.origin === "https://fonts.gstatic.com",
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "google-fonts",
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    build: {
      target: "es2020",
      // No public sourcemaps: Vercel would serve them to anyone.
      sourcemap: false,
      chunkSizeWarningLimit: 600,
      rolldownOptions: {
        output: {
          // Long-lived vendor chunks: these change far less often than app
          // code, so returning visitors keep them cached across deploys.
          codeSplitting: {
            groups: [
              { name: "react", test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
              { name: "supabase", test: /node_modules[\\/]@supabase[\\/]/ },
              { name: "radix", test: /node_modules[\\/]@radix-ui[\\/]/ },
              { name: "query", test: /node_modules[\\/]@tanstack[\\/]/ },
              { name: "forms", test: /node_modules[\\/](zod|react-hook-form|@hookform)[\\/]/ },
              { name: "date", test: /node_modules[\\/]date-fns[\\/]/ },
            ],
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      css: false,
    },
  };
});
