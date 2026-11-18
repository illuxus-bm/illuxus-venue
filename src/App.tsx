import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { VendorAuthProvider } from "@/contexts/VendorAuthContext";
import { RequireVendorAuth } from "@/components/auth/RequireVendorAuth";
import { VendorProfileGate } from "@/components/auth/VendorProfileGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FullPageLoader } from "@/components/FullPageLoader";
import { NativeBridge } from "@/components/NativeBridge";
import { ScrollToTop } from "@/components/ScrollToTop";
import { shouldRetryQuery } from "@/lib/queryRetry";

// Route-level code splitting: a visitor to the public landing page never
// downloads the dashboard, and vice versa.
const VendorLoginPage = lazy(() => import("@/pages/vendor/VendorLoginPage"));
const VendorSignupPage = lazy(() => import("@/pages/vendor/VendorSignupPage"));
const VendorDashboardPage = lazy(() => import("@/pages/vendor/VendorDashboardPage"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const PublicProfilePage = lazy(() => import("@/pages/public/PublicProfilePage"));
const PublicVenuePage = lazy(() => import("@/pages/public/PublicVenuePage"));
const NotFound = lazy(() => import("@/pages/NotFound"));

// Tuned for a supplier dashboard: keep 30s of freshness so quickly
// tabbing between Inbox / Quotes / Bookings doesn't hammer the API.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // Re-sync when a vendor comes back to the tab / app after a while, so
      // they never accept a request that was already withdrawn.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // 4xx never; offline / 5xx up to twice.
      retry: shouldRetryQuery,
    },
    mutations: {
      retry: 0,
    },
  },
});

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <VendorAuthProvider>
            <BrowserRouter>
              <NativeBridge />
              <ScrollToTop />
              <Toaster />
              <Suspense fallback={<FullPageLoader />}>
                <Routes>
                  {/* Public auth surfaces */}
                  <Route path="/vendor/login" element={<VendorLoginPage />} />
                  <Route path="/vendor/signup" element={<VendorSignupPage />} />

                  {/* Authenticated dashboard */}
                  <Route
                    path="/vendor"
                    element={
                      <RequireVendorAuth>
                        <VendorProfileGate>
                          <VendorDashboardPage />
                        </VendorProfileGate>
                      </RequireVendorAuth>
                    }
                  />

                  {/* Public landing page; the venue admin reaches the dashboard from its header. */}
                  <Route path="/" element={<LandingPage />} />

                  {/* Public pages: a venue business's profile and each listed venue. */}
                  <Route path="/v/:vendorId" element={<PublicProfilePage />} />
                  <Route path="/venues/:venueId" element={<PublicVenuePage />} />

                  {/* Fallback */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </VendorAuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
