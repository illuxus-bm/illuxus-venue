import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorHandlers } from "@/lib/monitoring";
import { isNative } from "@/lib/native";

installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installable PWA + offline app shell on the web only. The native shells
// serve bundled assets and update through the stores.
if (import.meta.env.PROD && !isNative && "serviceWorker" in navigator) {
  void import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}
