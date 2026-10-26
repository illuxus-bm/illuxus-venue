import * as React from "react";
import { Pencil, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ServiceEditorDialog } from "@/components/vendor/ServiceEditorDialog";
import {
  serviceCategoryLabel,
  useMyServices,
  type MyService,
} from "@/hooks/useMyServices";
import type { Venue } from "@/hooks/useMyVenues";
import { formatMoneyCents } from "@/lib/utils";

/**
 * Additional services for one venue — photography, food, lunch, decor…
 *
 * Lists the services pinned to this venue plus the vendor-wide ones
 * (venue_id null), since organizers see both when they open the venue.
 * Adding from here pre-selects this venue in the editor; vendor-wide
 * services are edited the same way but stay labelled "All venues".
 */
export function VenueServicesDialog({
  open,
  onOpenChange,
  venue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venue: Venue;
}) {
  const { data: services = [], isLoading } = useMyServices();
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MyService | null>(null);

  const own = services.filter((s) => s.venue_id === venue.id);
  const shared = services.filter((s) => s.venue_id === null);

  const openAdd = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (s: MyService) => {
    setEditing(s);
    setEditorOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl flex flex-col p-0 gap-0 max-h-[85vh]">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle>Services · {venue.name}</DialogTitle>
            <DialogDescription>
              Add-ons organizers can tick when they request this venue —
              photography, food, lunch, decor and so on.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Loading services…
              </p>
            ) : (
              <>
                <ServiceList
                  title="Only at this venue"
                  empty="No venue-specific services yet."
                  services={own}
                  onEdit={openEdit}
                />
                <ServiceList
                  title="Offered at all your venues"
                  empty="None. Services added on the Services tab with “All my venues” appear here."
                  services={shared}
                  onEdit={openEdit}
                />
              </>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Done
            </Button>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add service
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ServiceEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        service={editing}
        defaultVenueId={venue.id}
      />
    </>
  );
}

function ServiceList({
  title,
  empty,
  services,
  onEdit,
}: {
  title: string;
  empty: string;
  services: MyService[];
  onEdit: (s: MyService) => void;
}) {
  return (
    <section className="space-y-2">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {title} ({services.length})
      </p>
      {services.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {services.map((s) => {
            const category = serviceCategoryLabel(s.category);
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{s.title}</span>
                    {category && (
                      <Badge variant="secondary" className="text-[10px]">
                        {category}
                      </Badge>
                    )}
                    {!s.is_active && (
                      <Badge variant="outline" className="text-[10px]">
                        Hidden
                      </Badge>
                    )}
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    {s.quote_on_request && s.base_price === 0
                      ? "Price on request"
                      : `${formatMoneyCents(s.base_price, s.currency)} / ${s.unit.replace("_", " ")}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label={`Edit ${s.title}`}
                  onClick={() => onEdit(s)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
