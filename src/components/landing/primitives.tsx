import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * Landing building blocks, ported from illuxus
 * (src/components/landing/primitives.tsx + motion.ts) so the venue landing
 * moves and reads like the main one. Styles live in ./landing.css.
 */

/** True once the element has scrolled into view (then stays true). */
function useInView<T extends Element>(ref: React.RefObject<T>, rootMargin = "0px 0px -8% 0px") {
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

/** The closing ~40% of a headline's words take the highlight colour. */
function splitAccent(title: string): { lead: string[]; accent: string[] } {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { lead: [], accent: words };
  const accentCount = Math.max(1, Math.round(words.length * 0.4));
  return { lead: words.slice(0, words.length - accentCount), accent: words.slice(words.length - accentCount) };
}

/** Fades and lifts its children in the first time they scroll into view. */
export function Reveal({
  as: Tag = "div",
  index = 0,
  className,
  children,
}: {
  as?: React.ElementType;
  /** Position in a group; later items start slightly later. */
  index?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLElement>(null);
  const inView = useInView(ref);
  return (
    <Tag
      ref={ref}
      data-reveal=""
      className={cn(inView && "is-inview", className)}
      style={{ "--reveal-i": index } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}

/** Condensed all-caps headline whose closing words take the highlight colour. */
export function PosterTitle({
  as: Tag = "h2",
  text,
  className,
  immediate = false,
}: {
  as?: React.ElementType;
  text: string;
  className?: string;
  /** Animate on mount instead of waiting for scroll (above-the-fold use). */
  immediate?: boolean;
}) {
  const ref = React.useRef<HTMLElement>(null);
  const inView = useInView(ref);
  const { lead, accent } = splitAccent(text);
  const words = [
    ...lead.map((word) => ({ word, accent: false })),
    ...accent.map((word) => ({ word, accent: true })),
  ];
  return (
    <Tag ref={ref} className={cn("poster text-foreground", (inView || immediate) && "is-inview", className)}>
      {words.map(({ word, accent: isAccent }, i) => (
        <span key={`${word}-${i}`}>
          <span className={cn("poster-word", isAccent && "poster-accent")}>
            <span style={{ "--w": i } as React.CSSProperties}>{word}</span>
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </Tag>
  );
}

/** Section label: a round icon badge followed by a wide-tracked caption. */
export function SectionChip({ icon: Icon, label, className }: { icon: LucideIcon; label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-4 text-foreground",
        className,
      )}
    >
      <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground">
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
      <span className="eyebrow">{label}</span>
    </span>
  );
}

const PILL_BASE =
  "group inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]";
const PILL_VARIANT = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  gold: "bg-accent text-accent-foreground hover:bg-accent/90",
  outline: "border border-foreground/25 text-foreground hover:border-foreground/60 hover:bg-foreground/[0.04]",
} as const;
const PILL_SIZE = {
  sm: "h-9 px-4 text-[13px]",
  md: "h-11 px-5 text-[14px]",
  lg: "h-12 px-6 text-[15px]",
} as const;

/** Pill-shaped call to action: router link for in-app paths, anchor otherwise. */
export function PillLink({
  href,
  children,
  variant = "primary",
  size = "lg",
  arrow = false,
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: keyof typeof PILL_VARIANT;
  size?: keyof typeof PILL_SIZE;
  arrow?: boolean;
  className?: string;
}) {
  const classes = cn(PILL_BASE, PILL_VARIANT[variant], PILL_SIZE[size], className);
  const content = (
    <>
      {children}
      {arrow && <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />}
    </>
  );
  return href.startsWith("/") ? (
    <Link to={href} className={classes}>
      {content}
    </Link>
  ) : (
    <a href={href} className={classes}>
      {content}
    </a>
  );
}

/** Same gutters as illuxus' SiteContainer, so sections line up with the header. */
export function SiteContainer({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}
