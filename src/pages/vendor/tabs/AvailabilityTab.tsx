import * as React from "react";
import { CalendarX, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBlockDate,
  useMyAvailability,
  useUnblockDate,
} from "@/hooks/useMyAvailability";
import { useMyVenues } from "@/hooks/useMyVenues";
import { parseDateOnly, todayDateOnly } from "@/lib/dates";

/**
 * Availability — vendor holds unbookable dates so the marketplace hides them
 * from organizer date pickers.
 *
 * Two kinds of blocks live in vendor_availability:
 *   • status='held'   — a manual block the vendor added here.
 *   • status='booked' — an automatic block written by the availability
 *                       trigger when a booking confirms; can only be
 *                       released by cancelling the booking itself.
 */
export default function AvailabilityTab() {
  const [date, setDate] = React.useState("");
  const [note, setNote] = React.useState("");
  // "" = block every venue (whole business).
  const [venueId, setVenueId] = React.useState("");
  const { data: venues = [] } = useMyVenues();
  const venueNames = React.useMemo(
    () => new Map(venues.map((v) => [v.id, v.name])),
    [venues],
  );
  const { data: blocks = [], isLoading, error, refetch } = useMyAvailability();
  const blockDate = useBlockDate();
  const unblockDate = useUnblockDate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      toast.error("Pick a date to block");
      return;
    }
    try {
      await blockDate.mutateAsync({ date, note, venueId });
      setDate("");
      setNote("");
      toast.success("Date blocked");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not block date");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Block a date</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={submit}
            className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_180px_1fr_auto] sm:items-end"
          >
            <div className="space-y-2">
              <Label htmlFor="block-date">Date</Label>
              <Input
                id="block-date"
                type="date"
                min={todayDateOnly()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-venue">Venue</Label>
              <select
                id="block-venue"
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All venues</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-note">Reason (optional)</Label>
              <Input
                id="block-note"
                placeholder="Existing booking, holiday, etc."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={blockDate.isPending}>
              <Plus className="h-4 w-4" />
              Block
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : error ? (
        <ErrorState message="Couldn't load your blocked dates." onRetry={refetch} />
      ) : blocks.length === 0 ? (
        <EmptyState message="No blocked dates. Organizers see you as fully available." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border/60">
              {blocks.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <CalendarX className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="num font-medium text-foreground">
                        {parseDateOnly(b.date).toLocaleDateString(undefined, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {b.venue_id ? venueNames.get(b.venue_id) ?? "One venue" : "All venues"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {b.note ??
                          (b.status === "booked" ? "Confirmed booking" : "Blocked")}
                      </div>
                    </div>
                  </div>
                  {b.status === "held" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        unblockDate.mutate(b.id, {
                          onSuccess: () => toast.success("Date released"),
                          onError: (err: Error) =>
                            toast.error(err?.message ?? "Could not release date"),
                        })
                      }
                      disabled={unblockDate.isPending}
                      aria-label={`Release ${b.date}`}
                      className="h-10 w-10 p-0"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
