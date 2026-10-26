import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

/**
 * Sun / moon switch, as in illuxus (src/components/ThemeToggle.tsx).
 * `floating` renders it as a header chip: a round flip button on phones,
 * the two-sided switch from `sm` up.
 */
export function ThemeToggle({ floating = false, className }: { floating?: boolean; className?: string }) {
  const { theme, setTheme, toggle } = useTheme();

  if (floating) {
    const flipTo = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    return (
      <>
        <button
          type="button"
          onClick={toggle}
          title={flipTo}
          aria-label={flipTo}
          className="float-chip inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
        >
          {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
        <ThemeToggle className={cn("float-chip hidden h-9 p-[3px] sm:inline-flex lg:h-10 lg:p-[5px]", className)} />
      </>
    );
  }

  const option = (value: "light" | "dark", label: string, Icon: typeof Sun) => (
    <button
      type="button"
      role="radio"
      aria-checked={theme === value}
      aria-label={label}
      onClick={() => setTheme(value)}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200",
        theme === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
    </button>
  );

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn("inline-flex h-8 items-center rounded-full border border-border bg-secondary/60 p-0.5", className)}
    >
      {option("light", "Light theme", Sun)}
      {option("dark", "Dark theme", Moon)}
    </div>
  );
}
