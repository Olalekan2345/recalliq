import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The RecallIQ walrus, cropped from the approved mascot sheet by
 * `pnpm brand:assets`. Each crop is framed artwork with its own scene
 * background, shown at or below its native size.
 */
export const MASCOTS = {
  hoodie: { w: 480, h: 406, alt: "The RecallIQ walrus in a RecallIQ hoodie, giving a peace sign" },
  head: { w: 220, h: 220, alt: "The RecallIQ walrus, winking" },
  smart: { w: 151, h: 141, alt: "The RecallIQ walrus holding a glowing memory orb" },
  "recalliq-white": { w: 206, h: 236, alt: "The RecallIQ walrus in a white RecallIQ hoodie" },
  tatum: { w: 202, h: 236, alt: "The RecallIQ walrus in a Tatum polo" },
  walrus: { w: 201, h: 236, alt: "The RecallIQ walrus in a Walrus polo" },
  "tatum-walrus": { w: 202, h: 236, alt: "The RecallIQ walrus in a Tatum and Walrus jacket" },
  agent: { w: 201, h: 236, alt: "The RecallIQ walrus in a RecallIQ hoodie, giving a thumbs up" },
  developer: { w: 202, h: 236, alt: "The RecallIQ walrus in a developer jacket with headphones" },
  premium: { w: 202, h: 236, alt: "The RecallIQ walrus in sunglasses with a RecallIQ pendant" },
  business: { w: 213, h: 251, alt: "The RecallIQ walrus in a suit, holding a tablet" },
  hackathon: { w: 208, h: 251, alt: "The RecallIQ walrus at a laptop in a “Build, Learn, Recall, Repeat” hoodie" },
  cyber: { w: 198, h: 251, alt: "The RecallIQ walrus in a glowing cyber jacket" },
} as const;

export type MascotVariant = keyof typeof MASCOTS;

export function Mascot({
  variant,
  className,
  eager,
  sizes,
  decorative = false,
}: {
  variant: MascotVariant;
  className?: string;
  /** Above the fold: load immediately instead of lazily. */
  eager?: boolean;
  sizes?: string;
  /** Purely ornamental next to text that already says the same thing. */
  decorative?: boolean;
}) {
  const m = MASCOTS[variant];
  return (
    <Image
      src={`/brand/mascots/${variant}.webp`}
      width={m.w}
      height={m.h}
      alt={decorative ? "" : m.alt}
      loading={eager ? "eager" : "lazy"}
      sizes={sizes ?? `${m.w}px`}
      className={cn("select-none", className)}
      draggable={false}
    />
  );
}
