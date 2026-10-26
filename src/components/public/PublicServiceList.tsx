import { Clock } from "lucide-react";

import { serviceCategoryLabel } from "@/hooks/useMyServices";
import type { PublicService } from "@/hooks/usePublicProfile";
import { UNIT_LABEL } from "@/lib/venueLabels";
import { formatMoneyCents } from "@/lib/utils";

/**
 * Add-on services on the public pages, grouped by category. Prices are stored
 * in minor units (ServiceEditorDialog multiplies by 100); 0 means the price
 * is quoted on request.
 */
export function PublicServiceList({
  services,
  venueNames,
}: {
  services: PublicService[];
  /** When given, each service says where it's offered (profile page). */
  venueNames?: Map<string, string>;
}) {
  const groups = new Map<string, PublicService[]>();
  for (const s of services) {
    const key = serviceCategoryLabel(s.category) ?? "Other services";
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  return (
    <div className="space-y-8">
      {Array.from(groups.entries()).map(([category, items]) => (
        <section key={category}>
          <p className="eyebrow text-muted-foreground">{category}</p>
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {items.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <p className="font-semibold leading-snug">{s.title}</p>
                  {s.description && (
                    <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{s.description}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                    {s.duration && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {s.duration}
                      </span>
                    )}
                    {venueNames && (
                      <span>{s.venue_id ? `At ${venueNames.get(s.venue_id) ?? "one venue"}` : "At every venue"}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 sm:text-right">
                  {s.base_price > 0 ? (
                    <>
                      <p className="num font-semibold">{formatMoneyCents(s.base_price, s.currency)}</p>
                      <p className="text-[12px] text-muted-foreground">{UNIT_LABEL[s.unit] ?? s.unit}</p>
                    </>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">Price on request</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
