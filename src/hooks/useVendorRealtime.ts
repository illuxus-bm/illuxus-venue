import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { reportError } from "@/lib/monitoring";

/**
 * Subscribes to every table the vendor dashboard cares about and invalidates
 * the matching TanStack Query keys so all tabs reactively reflect changes
 * (a new RFQ lands in the inbox, an organizer accepts a quote, etc).
 *
 * The channel is torn down when the dashboard unmounts.
 */
export function useVendorRealtime() {
  const { vendor } = useVendorAuth();
  const qc = useQueryClient();

  React.useEffect(() => {
    if (!vendor?.id) return;

    const channel = supabase
      // Unique topic per mount: realtime-js reuses channels by topic, and a
      // remount while the previous channel is still "leaving" would otherwise
      // get a dead channel back and silently stop receiving events.
      .channel(`vendor:${vendor.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rfq_invitees", filter: `vendor_id=eq.${vendor.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["vendor-inbox", vendor.id] });
          qc.invalidateQueries({ queryKey: ["vendor-stats", vendor.id] });
        },
      )
      // Direct venue picks from the main app's marketplace live in
      // event_venue_selections. They surface alongside RFQs in the Inbox,
      // and an accept flips the vendor's availability calendar, so both
      // query keys need to refresh together.
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "event_venue_selections",
          filter: `vendor_id=eq.${vendor.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["vendor-inbox-venues", vendor.id] });
          qc.invalidateQueries({ queryKey: ["vendor-stats", vendor.id] });
          qc.invalidateQueries({ queryKey: ["vendor-availability", vendor.id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quotes", filter: `vendor_id=eq.${vendor.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["vendor-quotes", vendor.id] });
          qc.invalidateQueries({ queryKey: ["vendor-stats", vendor.id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vendor_bookings", filter: `vendor_id=eq.${vendor.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["vendor-bookings", vendor.id] });
          qc.invalidateQueries({ queryKey: ["vendor-stats", vendor.id] });
          qc.invalidateQueries({ queryKey: ["vendor-availability", vendor.id] });
        },
      )
      .on(
        "postgres_changes",
        // vendor_reviews has no vendor_id column (reviews hang off bookings).
        // A filter on a missing column makes Realtime reject the WHOLE channel,
        // so subscribe unfiltered; RLS still scopes what is delivered.
        { event: "*", schema: "public", table: "vendor_reviews" },
        () => {
          qc.invalidateQueries({ queryKey: ["vendor-reviews", vendor.id] });
        },
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reportError(err ?? new Error(`Realtime ${status}`), { source: "useVendorRealtime" });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [vendor?.id, qc]);
}
