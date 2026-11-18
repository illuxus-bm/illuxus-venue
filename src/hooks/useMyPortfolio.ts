import { useQuery } from "@tanstack/react-query";

import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { get } from "@/lib/api";

export interface PortfolioItem {
  id: string;
  url: string;
  media_type: "image" | "video";
  caption: string | null;
  is_cover: boolean;
  sort_order: number;
}

export function useMyPortfolio() {
  const { vendor } = useVendorAuth();

  return useQuery<PortfolioItem[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-portfolio", vendor?.id],
    queryFn: ({ signal }) => get<PortfolioItem[]>("/me/portfolio", { signal }),
  });
}
