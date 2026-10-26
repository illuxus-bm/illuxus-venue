import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

export type ServiceUnit =
  | "per_hour"
  | "per_event"
  | "per_person"
  | "per_day"
  | "flat";

/** Add-on categories a venue can offer. Stored as free text in
 *  vendor_services.category (migration 108) so the list can grow without
 *  a migration; the main app shows the label next to each add-on. */
export const SERVICE_CATEGORIES = [
  { value: "photography",   label: "Photography" },
  { value: "videography",   label: "Videography" },
  { value: "food",          label: "Food & catering" },
  { value: "meals",         label: "Breakfast / lunch / dinner" },
  { value: "beverages",     label: "Beverages & bar" },
  { value: "decor",         label: "Decor & florals" },
  { value: "av",            label: "Sound, light & AV" },
  { value: "entertainment", label: "Entertainment" },
  { value: "accommodation", label: "Rooms & accommodation" },
  { value: "transport",     label: "Transport & parking" },
  { value: "staffing",      label: "Staff & hospitality" },
  { value: "other",         label: "Other" },
] as const;

export function serviceCategoryLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return SERVICE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export interface MyService {
  id: string;
  title: string;
  description: string | null;
  /** Minor units — format with formatMoneyCents. */
  base_price: number;
  currency: string;
  unit: ServiceUnit;
  duration: string | null;
  is_instant_book: boolean;
  quote_on_request: boolean;
  is_active: boolean;
  /** Null = offered at every venue of this vendor. */
  venue_id: string | null;
  category: string | null;
}

export function useMyServices() {
  const { vendor } = useVendorAuth();

  return useQuery<MyService[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-services", vendor?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vendor_services")
        .select(
          "id, title, description, base_price, currency, unit, duration, is_instant_book, quote_on_request, is_active, venue_id, category",
        )
        .eq("vendor_id", vendor!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        ...s,
        base_price: Number(s.base_price),
      })) as MyService[];
    },
  });
}
