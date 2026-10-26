import { ChevronDown, LogOut, User } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StarRating } from "@/components/StarRating";
import { ThemeToggle } from "@/components/ThemeToggle";
import { IlluxusWordmark } from "@/components/brand/IlluxusWordmark";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

/**
 * Sticky top bar for the vendor dashboard.
 *
 *   [ illuxus VENUES ]   [ ★ 0.0 (0)  |  ☀/☾  |  Avatar ▾ ]
 *
 * The avatar opens a proper user menu with business identity, email, and
 * a Sign out action — the previous single icon-button had no affordance
 * that this was where you found the sign-out.
 */
export function VendorHeader() {
  const { vendor, user, signOut } = useVendorAuth();

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
  };

  const initials =
    vendor?.business_name
      ?.split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "V";

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Illuxus Venues home">
          <IlluxusWordmark height={20} ariaLabel="" />
          <span className="eyebrow rounded-full border border-border bg-card px-2.5 py-1 text-[10px] text-primary">
            Venues
          </span>
        </Link>

        {vendor ? (
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <StarRating
              value={vendor.rating_avg ?? 0}
              count={vendor.rating_count ?? 0}
              className="hidden sm:inline-flex"
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-2 pr-2"
                  aria-label="Account menu"
                >
                  <Avatar className="h-7 w-7">
                    {vendor.logo_url ? (
                      <AvatarImage src={vendor.logo_url} alt="" />
                    ) : null}
                    <AvatarFallback className="text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-[140px] truncate text-sm font-medium text-foreground sm:inline">
                    {vendor.business_name}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-foreground">
                      {vendor.business_name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email ?? ""}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  {/* New tab so the dashboard stays open behind it. */}
                  <a href={`/v/${vendor.id}`} target="_blank" rel="noreferrer">
                    <User className="h-4 w-4" />
                    View public profile
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>
    </header>
  );
}
