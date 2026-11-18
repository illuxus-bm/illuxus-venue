import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { ApiError, post } from "@/lib/api";
import { cn, formatMoneyCents } from "@/lib/utils";
import type { InboxRfq } from "@/hooks/useInboxRfqs";
import { addDays, toDateOnly, todayDateOnly } from "@/lib/dates";

const CURRENCIES = ["USD", "INR", "EUR", "GBP", "AUD", "CAD", "SGD", "AED"] as const;

const schema = z.object({
  total: z.coerce
    .number({ error: "Enter a number" })
    .positive("Total must be greater than zero")
    .max(1_000_000_000, "That total looks too large"),
  currency: z.enum(CURRENCIES),
  valid_until: z
    .string()
    .min(1, "Pick a date the quote is valid until")
    // "YYYY-MM-DD" strings compare correctly as text.
    .refine((v) => v >= todayDateOnly(), "The validity date can't be in the past"),
  inclusions: z.string().max(1000).optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

interface SendQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfq: InboxRfq | null;
}

/**
 * Vendor's "Reply with quote" flow.
 *
 * POST /api/me/quotes creates a 'sent' quote. The server stamps the
 * invitation's responded_at, so the Inbox segmentation moves the RFQ from
 * "New" to "Responded" without any client bookkeeping.
 */
export function SendQuoteDialog({
  open,
  onOpenChange,
  rfq,
}: SendQuoteDialogProps) {
  const { vendor } = useVendorAuth();
  const qc = useQueryClient();
  const [saving, setSaving] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaults(rfq, vendor?.default_currency),
  });

  React.useEffect(() => {
    if (open) reset(buildDefaults(rfq, vendor?.default_currency));
  }, [open, rfq, vendor?.default_currency, reset]);

  const currency = watch("currency");

  const onSubmit = async (values: FormValues) => {
    if (!vendor || !rfq || saving) return;
    setSaving(true);
    try {
      await post("/me/quotes", {
        rfq_id: rfq.rfq_id,
        // Minor units — matches vendor_bookings.total.
        total: Math.round(values.total * 100),
        currency: values.currency,
        valid_until: values.valid_until,
        inclusions: values.inclusions?.trim() || undefined,
        notes: values.notes?.trim() || undefined,
      });
      qc.invalidateQueries({ queryKey: ["vendor-inbox", vendor.id] });
      qc.invalidateQueries({ queryKey: ["vendor-quotes", vendor.id] });
      qc.invalidateQueries({ queryKey: ["vendor-stats", vendor.id] });
      toast.success("Quote sent");
      onOpenChange(false);
    } catch (err) {
      // Only "quote_exists" gets the withdraw hint; other 409s (request
      // closed, declined, bad validity date) carry their own message.
      if (err instanceof ApiError && err.code === "quote_exists") {
        toast.error(
          "You've already sent a quote for this request. Withdraw the old one first if you need to change it.",
        );
      } else {
        toast.error((err as Error).message || "Could not send quote");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reply with a quote</DialogTitle>
          <DialogDescription>
            The organizer will see this on their "My Requests" panel. Once they
            accept, we'll create a booking and lock the date on your calendar.
          </DialogDescription>
        </DialogHeader>

        {rfq ? (
          <div className="rounded-md border border-border/60 bg-secondary/40 p-3 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">
              {rfq.category_name ?? "Request"}
              {rfq.event_city ? ` · ${rfq.event_city}` : ""}
              {rfq.event_date ? ` · ${rfq.event_date}` : ""}
              {rfq.expected_guests ? ` · ${rfq.expected_guests} guests` : ""}
            </div>
            {rfq.budget_min || rfq.budget_max ? (
              <div className="num mt-1">
                Budget:{" "}
                {formatMoneyCents(rfq.budget_min ?? 0, rfq.currency)}
                {rfq.budget_max
                  ? ` – ${formatMoneyCents(rfq.budget_max, rfq.currency)}`
                  : ""}
              </div>
            ) : null}
            <p className="mt-2 line-clamp-3 text-foreground">
              {rfq.requirements || "(no details provided)"}
            </p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
            <div className="space-y-2">
              <Label htmlFor="total">Total price</Label>
              <Input
                id="total"
                type="number"
                min={0}
                step="1"
                placeholder="0"
                {...register("total")}
              />
              {errors.total ? (
                <p className="text-xs text-destructive">{errors.total.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Whole units in {currency}.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                {...register("currency")}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="valid_until">Valid until</Label>
            <Input id="valid_until" type="date" min={todayDateOnly()} {...register("valid_until")} />
            {errors.valid_until ? (
              <p className="text-xs text-destructive">
                {errors.valid_until.message}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pick a date the organizer must accept by. Typically 7–14 days out.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="inclusions">Inclusions</Label>
            <Textarea
              id="inclusions"
              rows={3}
              placeholder="What's included in this price — deliverables, hours, add-ons…"
              {...register("inclusions")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes for the organizer</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="Anything else the organizer should know?"
              {...register("notes")}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send quote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function buildDefaults(
  rfq: InboxRfq | null,
  vendorDefaultCurrency?: string,
): FormValues {
  const currency = (rfq?.currency ??
    vendorDefaultCurrency ??
    "USD") as (typeof CURRENCIES)[number];
  const validCurrency = CURRENCIES.includes(currency) ? currency : "USD";
  const twoWeeksFromNow = addDays(new Date(), 14);
  return {
    total: 0,
    currency: validCurrency,
    valid_until: toDateOnly(twoWeeksFromNow),
    inclusions: "",
    notes: "",
  };
}
