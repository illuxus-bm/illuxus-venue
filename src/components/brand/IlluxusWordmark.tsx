import { useTheme } from "@/contexts/ThemeContext";

/**
 * The Illuxus wordmark, as in illuxus (src/components/brand/IlluxusWordmark.tsx).
 * Two SVGs in /public, copied from the main app: the navy mark for light
 * backgrounds and the off-white mark for dark ones, picked from the theme.
 */
export function IlluxusWordmark({
  height = 22,
  className,
  ariaLabel = "illuxus",
}: {
  /** Render height in CSS pixels; width follows the aspect ratio. */
  height?: number;
  className?: string;
  /** Pass "" when a surrounding link already labels it. */
  ariaLabel?: string;
}) {
  const { theme } = useTheme();
  return (
    <img
      src={theme === "dark" ? "/illuxus-wordmark-dark.svg" : "/illuxus-wordmark-light.svg"}
      alt={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      height={height}
      style={{ height, width: "auto" }}
      className={className}
      draggable={false}
    />
  );
}
