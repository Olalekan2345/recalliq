# Brand — RecallIQ

_Status: active_

## Positioning

An evidence-driven AI agent for Sui that remembers its verified mistakes and knows when specialist intelligence is worth paying for. Tone: precise, calm, honest about uncertainty. Never hype, never fabricate.

## Logo

- Source: `public/logo.png` — a walrus inside a magnifying-glass "Q", cyan → blue → violet, wordmark "RecallIQ".
- `pnpm brand:assets` regenerates the transparent mark (`public/brand/recalliq-mark.png`), favicon (`src/app/icon.png`), iOS icon (`src/app/apple-icon.png`) and link preview (`src/app/opengraph-image.png`).
- In the UI the mark is an image and the wordmark is live text: "Recall" in the foreground colour, "IQ" in the brand gradient (`.brand-gradient-text`), so it works in light and dark mode.

## Palette (tokens in `src/app/globals.css`)

| Token             | Light                                                     | Dark                              | Use                                    |
| ----------------- | --------------------------------------------------------- | --------------------------------- | -------------------------------------- |
| brand gradient    | `#18ccf9` → `#3254e4` → `#9976f9` (sampled from the logo) | same                              | Wordmark "IQ", hero accent, hero glow  |
| primary           | `#3254e4` logo blue (white text 6:1)                      | `#7b9cff` (dark text 7:1)         | Primary actions, focus ring, links     |
| accent            | `#eef1ff` / text `#2b3fae`                                | `#1d2547` / text `#c3d0ff`        | Selected nav, badges, evidence chips   |
| background / card | near-white ink                                            | deep ink `oklch(0.155 0.014 256)` | Surfaces                               |
| success           | green                                                     | green                             | VERIFIED, settled, stored              |
| warning           | amber                                                     | amber                             | Pending, awaiting approval, unverified |
| destructive       | red                                                       | red                               | CONTRADICTED, failed                   |
| muted-foreground  | `oklch(0.47 0.02 256)`                                    | `oklch(0.71 0.016 255)`           | Secondary text (AA on both themes)     |

One UI accent (logo blue); the gradient is reserved for brand moments. Status colours always pair with an icon or text label (never colour alone).

## Typography

- UI: Geist Sans (`next/font`), `tracking-tight` on headings.
- Data: Geist Mono with `tabular-nums` for addresses, digests, amounts, blob IDs.

## Voice

- Specific and active: "Verified against checkpoint 336551792", not "Data looks good".
- Uncertainty is stated, not hidden: "Unverified — interpretation".
- No fabricated stats, testimonials or user counts anywhere.
