# Brand — RecallIQ

_Status: active_ · design system details in [docs/DESIGN.md](docs/DESIGN.md)

## Positioning

An evidence-driven AI agent for Sui that remembers its verified mistakes and knows when specialist intelligence is worth paying for. Tone: precise, calm, honest about uncertainty. Never hype, never fabricate.

Creative direction: a premium AI laboratory with a warm mascot. The public homepage is cinematic; the signed-in product is calm and efficient in the same visual language.

## Logo

- Source: `public/logo.png`, a walrus inside a magnifying-glass "Q", cyan → cobalt → violet, wordmark "RecallIQ".
- `pnpm brand:assets` regenerates the transparent mark (`public/brand/recalliq-mark.png`), favicon (`src/app/icon.png`), iOS icon (`src/app/apple-icon.png`), the link preview (`src/app/opengraph-image.png`, full logo on the frosted ice → lavender surface) and the mascot crops.
- In the UI the mark is an image and the wordmark is live text: "Recall" in the foreground colour, "IQ" in the brand gradient. On midnight surfaces use `<Logo tone="light" />` (brighter gradient, AA on `#050920`).
- Background removal is a flood fill from the image border, so the white walrus face and tusks inside the mark are never made transparent.

## Mascot

- Source: `assets/brand/mascot-sheet.png` (approved sheet). Crops in `public/brand/mascots/*.webp` keep their own scene backgrounds: they are framed artwork, never cut out, and never shown above their native size.
- In use: `hoodie` (final call to action, auth panel), `agent` (first investigations), `smart` (empty Memory Vault), `hackathon` (Learning Lab), `walrus` / `tatum` / `business` (built-with section).
- Not used on payment confirmations, dense data tables or other high-focus screens.
- The sheet's "Female mascot", "IQ Queen" and "Fit & Sexy" variants are not used: their styling does not fit a professional finance and blockchain product. Supply new artwork for athletic or fashion variants.

## Palette (tokens in `src/app/globals.css`)

| Token                           | Light                                       | Dark                           | Use                                     |
| ------------------------------- | ------------------------------------------- | ------------------------------ | --------------------------------------- |
| brand gradient                  | `#18ccf9` → `#3254e4` → `#9976f9` (sampled) | same                           | Wordmark "IQ", brand button, highlights |
| midnight                        | `#050920`                                   | same                           | Cinematic scenes, auth panel            |
| indigo-deep                     | `#141a52`                                   | same                           | Secondary dark surfaces                 |
| scene-light                     | lavender `#f1eeff`                          | indigo `#0d1340`               | Editorial homepage sheets               |
| background / card               | frosted white `#f6f8ff` / `#ffffff`         | midnight `#070b1f` / `#0c1230` | App surfaces                            |
| primary                         | cobalt `#3254e4` (white text 6:1)           | `#7b9cff` (dark text 7:1)      | Actions, focus ring, links              |
| accent                          | `#ecefff` / text `#2b3fae`                  | `#1a2350` / text `#c3d0ff`     | Selected nav, badges, evidence chips    |
| success / warning / destructive | green / amber / red                         | same hues                      | VERIFIED, pending, CONTRADICTED         |
| muted-foreground                | `#4a5378`                                   | `#a3acd6`                      | Secondary text (AA on both themes)      |

Status colours always pair with an icon or text label (never colour alone).

## Typography

- Display: Sora (`next/font`, `--font-display`) for h1/h2 and scene headlines; its rounded geometry echoes the wordmark.
- UI: Geist Sans. Data: Geist Mono with `tabular-nums` for addresses, digests, amounts and blob IDs.

## Voice

- Specific and active: "Verified against checkpoint 336551792", not "Data looks good".
- Uncertainty is stated, not hidden: "Unverified — interpretation".
- No fabricated stats, testimonials or user counts anywhere. Homepage numbers come from the deployment's database; illustrations are labelled as illustrations.
- Partners are named factually ("built with"), never as endorsements.
