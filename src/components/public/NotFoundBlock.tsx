import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";

import { SiteContainer } from "@/components/landing/primitives";

/** Full-page "not found / couldn't load" state for the public pages. */
export function NotFoundBlock({ title, body }: { title: string; body: string }) {
  return (
    <SiteContainer className="flex min-h-[70vh] flex-col items-center justify-center pt-24 text-center">
      <Building2 className="h-12 w-12 text-muted-foreground/50" strokeWidth={1.5} />
      <h1 className="poster mt-4 text-[clamp(40px,6vw,72px)]">{title}</h1>
      <p className="mt-2 max-w-md text-muted-foreground">{body}</p>
      <Link to="/" className="mt-8 text-[14px] font-semibold underline decoration-accent decoration-2 underline-offset-[6px]">
        Browse all venues
      </Link>
    </SiteContainer>
  );
}
