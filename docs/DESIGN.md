# Design system and UI

How the RecallIQ interface is built: tokens, motion, the homepage scenes, the app shell, and the rules that keep the visuals honest. Brand basics (logo, palette, voice) are in [brand.md](../brand.md).

## Principles

1. **Visuals wrap real functionality.** No screen shows a number, record or status the backend did not produce. Illustrations are labelled as illustrations.
2. **Cinematic outside, calm inside.** The public homepage uses depth, scroll choreography and atmosphere. The signed-in app uses the same tokens with restrained motion, so data, payments and agent activity stay the focus.
3. **Nothing waits on an animation.** Content is in the HTML from the first render; above-the-fold entrances are CSS, so they start before JavaScript hydrates. Buttons and inputs are never covered by decorative layers.
4. **Motion is optional.** With `prefers-reduced-motion: reduce`, transforms are dropped, scroll scenes render in their final state and decorative loops stop.

## Tokens

All colours are CSS variables in `src/app/globals.css`, exposed to Tailwind through `@theme inline` (`bg-midnight`, `text-on-dark-muted`, `bg-scene-light`, `from-brand-cyan`, …). Light and dark themes redefine the same variables; the homepage's midnight scenes are fixed art direction, its editorial sheets switch between lavender (light) and deep indigo (dark).

Utilities: `glass` (themed frosted surface), `glass-dark` (frosted surface on midnight), `ring-brand` (1px gradient hairline), `bg-brand-gradient`, `brand-gradient-text(-light)`, `shadow-elevated`, `perspective-1200` / `preserve-3d`.

The dApp Kit wallet button and modal are web components; they are themed by mapping their `--dapp-kit-*` variables to these tokens.

## Motion

- Library: `motion` 14 (`motion/react`), loaded through `LazyMotion` with the DOM animation feature set only, inside `MotionConfig reducedMotion="user"` (`src/components/motion/motion-provider.tsx`). It is used on the homepage only.
- Tokens: `src/lib/motion.ts` (expo-out easing, duration tiers, stagger, soft springs).
- Primitives (`src/components/motion/primitives.tsx`): `Reveal`, `MaskedHeading`, `ScrollWords`, `TiltCard`, `Parallax`, `useSceneProgress`, `useAmbientMotion`.
- `useAmbientMotion()` is false on the server and during hydration, then true only when the user allows motion. Scroll transforms and decorative extras key off it, so server and client markup always match.
- CSS keyframes (`float-slow`, `spin-slow`, `ring-pulse`, `aurora-drift`, `word-rise`, `fade-up`, `skeleton-shimmer`) are all inside `@media (prefers-reduced-motion: no-preference)`.
- Off-screen homepage scenes set `data-paused`, which pauses their CSS animations.
- Native scrolling throughout: no scroll-jacking and no pinned sections beyond one sticky panel. In-page links smooth-scroll only when motion is allowed.
- No WebGL: the 3D effects are CSS perspective transforms. They give the depth the design needs without a three.js payload or continuous GPU work.

## Homepage scenes (`src/components/marketing/`)

| Scene                  | File                   | What is real                                                                                |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| A Hero                 | `hero.tsx`             | The approved emblem; links to sign-up, the pipeline and guest access                        |
| B Problem              | `problem.tsx`          | Copy only                                                                                   |
| C Inside the agent     | `inside-agent.tsx`     | The exact stage names the orchestrator records; labelled as an illustration, no values      |
| D Memory universe      | `memory-universe.tsx`  | The memory types from the lesson codec; conceptual visual                                   |
| E Agent Autopsy        | `autopsy.tsx`          | The real diagnosis logic (exact power-of-ten); values labelled illustrative                 |
| F WorthIt              | `worthit.tsx`          | Tool names, summaries and providers from the live registry; no prices                       |
| G Built with           | `powered-by.tsx`       | Factual "built with" statements and documentation links                                     |
| H Learning Lab         | `learning-scene.tsx`   | Live counts from the database (`server/services/public-stats.ts`), evaluation runs excluded |
| FAQ and status         | `(marketing)/page.tsx` | Integration health recorded by the worker                                                   |
| I Final call to action | `final-cta.tsx`        | Links to sign-up and guest access                                                           |

## App

- Shell (`components/app-shell.tsx`): frosted sidebar with grouped navigation (Agent, Intelligence, Account) and a gradient active indicator; glass header; the mobile drawer closes on Escape.
- Primitives restyled in place (`ui/button`, `ui/card`, `ui/misc`, `shared/layout-bits`), so every page inherits the system; `Button variant="brand"` marks the one primary action of a screen.
- `EmptyState mascot="…"` for first-run states; icon-only empty states elsewhere (and always on Payments).
- Run view: `RunProgress` shows six phases derived from the real run status and recorded state steps; a failed or cancelled run shows the phase it stopped in.
- `(dashboard)/loading.tsx` mirrors the page skeleton while data loads.
- Auth: split screen with the brand panel on large screens; same forms, labels and validation.

## Verification

- `pnpm test` (unit + integration), `pnpm test:e2e` (desktop and mobile Chromium), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`.
- Visual checks: desktop 1440×900, tablet 820×1180, mobile 390×844, light and dark, and reduced motion.

## Known issues

- The wallet kit's optional Slush web-wallet registration requests `https://api.slush.app/api/wallet/metadata`; the request is blocked (our CSP, and Slush's CORS for this origin), which logs a console error. Pre-existing and unrelated to the redesign; browser-extension wallets are unaffected.
- Mascot crops come from a 1536×1024 sheet, so each is at most about 500px wide and is shown at or below that size. Higher-resolution exports would allow larger placements.
