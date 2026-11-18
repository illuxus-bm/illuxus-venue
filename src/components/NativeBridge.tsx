import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { initNative } from "@/lib/native";
import { reportError } from "@/lib/monitoring";

/** Mounts once inside the router to wire up Capacitor-only behaviour. */
export function NativeBridge() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    initNative((to) => navigate(to), {
      // Refetch every active query when the app returns to the foreground.
      onResume: () => void queryClient.invalidateQueries(),
    }).catch((e) => reportError(e, { source: "initNative" }));
    // navigate and queryClient are stable for the app's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
