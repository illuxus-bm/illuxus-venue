import * as React from "react";
import { useSearchParams } from "react-router-dom";
import {
  Building2,
  CalendarCheck,
  CalendarX,
  Image as ImageIcon,
  Inbox,
  LayoutGrid,
  ScrollText,
  Star,
  Tag,
  User,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VendorHeader } from "@/components/layout/VendorHeader";
import { VendorFooter } from "@/components/layout/VendorFooter";
import { EnvMissingBanner } from "@/components/EnvMissingBanner";
import { useVendorRealtime } from "@/hooks/useVendorRealtime";
import OverviewTab from "@/pages/vendor/tabs/OverviewTab";
import InboxTab from "@/pages/vendor/tabs/InboxTab";
import QuotesTab from "@/pages/vendor/tabs/QuotesTab";
import BookingsTab from "@/pages/vendor/tabs/BookingsTab";
import VenuesTab from "@/pages/vendor/tabs/VenuesTab";
import ServicesTab from "@/pages/vendor/tabs/ServicesTab";
import PortfolioTab from "@/pages/vendor/tabs/PortfolioTab";
import AvailabilityTab from "@/pages/vendor/tabs/AvailabilityTab";
import ReviewsTab from "@/pages/vendor/tabs/ReviewsTab";
import ProfileTab from "@/pages/vendor/tabs/ProfileTab";

// One place to add / rearrange tabs. Order matches the screenshots.
// Venues sits between Bookings and Services because the vendor's mental
// model is: "here's what's booked → here's what I have → here are the
// add-on services on it".
const TABS = [
  { value: "overview", label: "Overview", icon: LayoutGrid, Component: OverviewTab },
  { value: "inbox", label: "Inbox", icon: Inbox, Component: InboxTab },
  { value: "quotes", label: "Quotes", icon: ScrollText, Component: QuotesTab },
  { value: "bookings", label: "Bookings", icon: CalendarCheck, Component: BookingsTab },
  { value: "venues", label: "Venues", icon: Building2, Component: VenuesTab },
  { value: "services", label: "Services", icon: Tag, Component: ServicesTab },
  { value: "portfolio", label: "Portfolio", icon: ImageIcon, Component: PortfolioTab },
  { value: "availability", label: "Availability", icon: CalendarX, Component: AvailabilityTab },
  { value: "reviews", label: "Reviews", icon: Star, Component: ReviewsTab },
  { value: "profile", label: "Profile", icon: User, Component: ProfileTab },
] as const;

type TabValue = (typeof TABS)[number]["value"];

/**
 * Vendor dashboard shell: sticky header + centered 9-tab rail + tab content
 * + global footer. Tab state is local; if we later want deep-linkable tabs
 * we can lift it into the URL via `useSearchParams`.
 */
export default function VendorDashboardPage() {
  // Active tab lives in ?tab= so reloads, back/forward and shared links keep
  // the vendor where they were.
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const active: TabValue = TABS.some((t) => t.value === requested)
    ? (requested as TabValue)
    : "overview";
  const setActive = React.useCallback(
    (tab: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tab === "overview") next.delete("tab");
          else next.set("tab", tab);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  useVendorRealtime();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <EnvMissingBanner />
      <VendorHeader />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          <Tabs
            value={active}
            onValueChange={setActive}
            className="w-full"
          >
            {/* Tab rail — centered pill row on a light background. */}
            {/* Phones: one swipeable row. Larger screens: centred, wrapping. */}
            <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex sm:justify-center sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
              <TabsList className="inline-flex h-auto w-max gap-1 bg-secondary p-1 sm:w-auto sm:flex-wrap sm:justify-center">
                {TABS.map((t) => {
                  const Icon = t.icon;
                  return (
                    <TabsTrigger key={t.value} value={t.value} className="gap-1.5 px-3">
                      <Icon className="h-3.5 w-3.5" />
                      <span className="text-sm">{t.label}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            {TABS.map((t) => {
              const Component = t.Component;
              return (
                <TabsContent key={t.value} value={t.value} className="mt-6">
                  {/* Overview is the only tab that needs to redirect to
                      another tab (via the "Complete profile" CTA). Passing
                      an unrecognized prop to the others is harmless. */}
                  <Component onSwitchTab={setActive} />
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      </main>

      <VendorFooter />
    </div>
  );
}
