import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

export default function NotFound() {
  const { user } = useVendorAuth();
  useDocumentMeta({ title: "Page not found", noindex: true });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 pt-safe pb-safe">
      <div className="w-full max-w-sm space-y-4 text-center">
        <p className="eyebrow text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has moved.
        </p>
        <Button asChild variant="outline">
          {user ? (
            <Link to="/vendor">Back to dashboard</Link>
          ) : (
            <Link to="/">Back to home</Link>
          )}
        </Button>
      </div>
    </div>
  );
}
