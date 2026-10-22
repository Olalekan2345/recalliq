# Brand — RecallIQ

_Status: active_ · design system details in [docs/DESIGN.md](docs/DESIGN.md)

## Positioning

An evidence-driven AI agent for Sui that remembers its verified mistakes and knows when specialist intelligence is worth paying for. Tone: precise, calm, honest about uncertainty. Never hype, never fabricate.

Creative direction: a bright, premium AI studio with a warm mascot: frosted white, ice blue, lavender and aqua surfaces, navy type, glossy iridescent accents, and dark devices allowed as objects on a light page. The public homepage is cinematic; the signed-in product is calm and efficient in the same visual language.

**Light is the default theme everywhere** (homepage, sign-in, dashboard), whatever the operating-system setting. Dark mode is an optional choice in the theme menu (light, dark, or follow the system) and is remembered per browser.

## Logo

- Source: `public/logo.png`, a walrus inside a magnifying-glass "Q", cyan → cobalt → violet, wordmark "RecallIQ".
- `pnpm brand:assets` regenerates the transparent mark (`public/brand/recalliq-mark.png`), favicon (`src/app/icon.png`), iOS icon (`src/app/apple-icon.png`), the link preview (`src/app/opengraph-image.png`, full logo on the frosted ice → lavender surface) and the mascot crops.
- In the UI the mark is an image and the wordmark is live text: "Recall" in the foreground colour, "IQ" in the brand gradient (deepened in light mode, brightened in dark mode by the `--brand-gradient-text` token).
- Background removal is a flood fill from the image border, so the white walrus face and tusks inside the mark are never made transparent.

## Mascot

- Source: `assets/brand/mascot-sheet.png` (approved sheet). Crops in `public/brand/mascots/*.webp` keep their own scene backgrounds: they are framed artwork, never cut out, and never shown above their native size.
- In use, selectively: the Q emblem in the hero, the film and the final call to action; `hoodie` (sign-in / sign-up panel); `developer`, the "IQ" walrus (the AI pipeline section); `walrus` (Walrus Memory section and built-with); `tatum` (blockchain data, built-with); `business` (x402 settlement, built-with); `agent` (first investigations), `smart` (empty Memory Vault), `hackathon` (empty Learning Lab).
- On light pages the crops are framed tiles (their navy scene backgrounds read like the dark devices in the film) with a soft shadow and a hairline border.
- Not used on payment confirmations, dense data tables or other high-focus screens.
- The sheet's "Female mascot", "IQ Queen" and "Fit & Sexy" variants are not used: their styling does not fit a professional finance and blockchain product. Supply new artwork for athletic or fashion variants.

## Palette (tokens in `src/app/globals.css`)

| Token                           | Light (default)                                                                           | Dark (optional)                   | Use                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------- |
| brand colours                   | cyan `#18ccf9`, cobalt `#3254e4`, violet `#9976f9` (sampled)                              | same                              | Glows, rings, indicators, gloss shapes    |
| `--brand-gradient`              | `#1678cf` → `#3156e3` → `#6a48e6` (white text ≥ 4.5:1)                                    | logo cyan → cobalt → violet       | Brand buttons, progress bars              |
| `--brand-gradient-text`         | `#0b8fbf` → `#2d5be3` → `#6b46e5` (≥ 3.4:1: large text only)                              | `#5fe0ff` → `#8ea6ff` → `#c4adff` | Headline accents, "IQ"                    |
| background / card               | `#f8fbff` / `#ffffff`                                                                     | `#070b1f` / `#0c1230`             | App surfaces                              |
| foreground                      | navy `#101c44`                                                                            | `#eef1ff`                         | Body text                                 |
| primary                         | `#1371c9` (white text 4.96:1)                                                             | `#7b9cff` (dark text 7:1)         | Actions, focus ring, links                |
| accent                          | ice `#e9f6fd` / text `#0b5a9e` (6.4:1)                                                    | `#1a2350` / text `#c3d0ff`        | Selected nav (plus a cyan indicator)      |
| muted-foreground                | `#556580` (≥ 5.2:1 on every section tone)                                                 | `#a3acd6`                         | Secondary text                            |
| border                          | `#e2eaf3`                                                                                 | `#1e2752`                         | Hairlines                                 |
| section tones `--sec-*`         | white, frost `#f8fbff`, soft `#f5f9ff`, ice `#edf8ff`, lavender `#f2efff`, aqua `#eafbf9` | navy shades                       | Homepage sections, blended top to bottom  |
| `--scene-accent`                | `#0b6fa3` (≥ 4.8:1 on every section tone)                                                 | `#7fe3ff`                         | Eyebrows and small labels on the homepage |
| success / warning / destructive | `#0f7a52` / `#9a5200` / `#c42233` on soft tints (≥ 4.7:1)                                 | lighter hues on dark tints        | VERIFIED, pending, CONTRADICTED           |
| midnight / on-dark              | `#050920` / `#eef1ff`                                                                     | same                              | Fixed-dark device screens only            |

Violet is used sparingly (gradients, the memory accent). Payment screens use the plain tokens, without gloss shapes or mascots.

Status colours always pair with an icon or text label (never colour alone).

## Typography

- Display: Sora (`next/font`, `--font-display`) for h1/h2 and scene headlines; its rounded geometry echoes the wordmark. Large headlines use tight tracking (−0.03em); the hero pairs Sora Light with Semibold ("Your AI" light, "remembers." semibold).
- UI: Geist Sans. Data: Geist Mono with `tabular-nums` for addresses, digests, amounts and blob IDs.

## Voice

- Specific and active: "Verified against checkpoint 336551792", not "Data looks good".
- Uncertainty is stated, not hidden: "Unverified — interpretation".
- No fabricated stats, testimonials or user counts anywhere. Homepage numbers come from the deployment's database; illustrations are labelled as illustrations.
- Partners are named factually ("built with"), never as endorsements.
