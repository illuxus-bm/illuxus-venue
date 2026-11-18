import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { initNative } from "@/lib/native";
import { reportError } from "@/lib/monitoring";

/** Mounts once inside the router to wire up Capacitor-only behaviour. */
export function NativeBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    initNative((to) => navigate(to)).catch((e) => reportError(e, { source: "initNative" }));
    // navigate is stable for the router's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
