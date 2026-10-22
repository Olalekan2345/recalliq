/**
 * The film's script. Ranges are fractions of the film's scroll progress.
 * Beats are the on-screen lines; `summary` is the same chapter as plain text,
 * used by the stacked (mobile / reduced-motion) version and screen readers.
 */
export interface Beat {
  text: string;
  /** [fade in starts, fully in, starts fading out, gone] */
  at: [number, number, number, number];
  accent?: boolean;
}

export interface Chapter {
  id: string;
  label: string;
  range: [number, number];
  beats: Beat[];
  summary: string;
  /** Where the visuals come from: shown as a caption. */
  source: "recorded" | "concept" | "brand";
}

export const CHAPTERS: Chapter[] = [
  {
    id: "investigate",
    label: "Investigate",
    range: [0, 0.15],
    beats: [
      { text: "Every question starts an investigation.", at: [0.0, 0.025, 0.075, 0.095] },
      { text: "Every experience can become a lesson.", at: [0.09, 0.11, 0.135, 0.15], accent: true },
    ],
    summary:
      "You ask in plain language. RecallIQ turns the question into an investigation of live Sui Mainnet data, and treats every outcome as something it can learn from.",
    source: "recorded",
  },
  {
    id: "execute",
    label: "Execute",
    range: [0.15, 0.32],
    beats: [
      { text: "One intelligent agent.", at: [0.16, 0.18, 0.225, 0.245] },
      { text: "Real tools. Real evidence.", at: [0.24, 0.26, 0.3, 0.32], accent: true },
    ],
    summary:
      "The agent plans, picks tools, queries the chain and records every result as evidence. The panels are from a real investigation recorded on this deployment.",
    source: "recorded",
  },
  {
    id: "remember",
    label: "Remember",
    range: [0.32, 0.52],
    beats: [
      { text: "Most AI forgets.", at: [0.335, 0.355, 0.385, 0.405] },
      { text: "RecallIQ remembers.", at: [0.4, 0.42, 0.45, 0.47], accent: true },
      { text: "Powered by Walrus Memory.", at: [0.465, 0.48, 0.505, 0.52] },
    ],
    summary:
      "When an experience teaches something, RecallIQ turns it into a lesson and stores it on Walrus Memory, so future sessions can recall it. This scene is a concept illustration.",
    source: "concept",
  },
  {
    id: "verify",
    label: "Verify",
    range: [0.52, 0.69],
    beats: [
      { text: "Don’t just trust the answer.", at: [0.545, 0.565, 0.595, 0.615] },
      { text: "Verify the evidence.", at: [0.61, 0.63, 0.65, 0.665], accent: true },
      { text: "Powered by Tatum.", at: [0.66, 0.672, 0.682, 0.69] },
    ],
    summary:
      "Every factual claim is re-checked against fresh Sui Mainnet reads through Tatum, and shown as verified, unverified or contradicted. These screens show a real recorded run.",
    source: "recorded",
  },
  {
    id: "optimize",
    label: "Optimize",
    range: [0.69, 0.84],
    beats: [
      { text: "Better decisions.", at: [0.7, 0.72, 0.755, 0.775] },
      { text: "Smarter spending.", at: [0.77, 0.79, 0.825, 0.84], accent: true },
    ],
    summary:
      "WorthIt weighs each tool's relevance and measured reliability. In the recorded run it offered nine free tools and held back the paid analysis because it was not worth it for the question.",
    source: "recorded",
  },
  {
    id: "evolve",
    label: "Evolve",
    range: [0.84, 1],
    beats: [],
    summary: "Persistent memory, verified intelligence and careful tool selection come together in one agent that gets smarter with every experience.",
    source: "brand",
  },
];

/** Total scroll length of the desktop film, in viewport heights. */
export const FILM_VH = 560;

export const FINAL = {
  headline: "Smarter with every experience.",
  body: "RecallIQ brings persistent memory, verified intelligence, and thoughtful tool selection together in one AI agent.",
  cta: { label: "Explore RecallIQ", href: "/workspace" },
};

/** Concept captions for the memory scene (illustration, not a storage event). */
export const MEMORY_STORY = ["An experience occurs", "A useful lesson is identified", "The lesson enters persistent memory", "Future sessions can recall it"];
