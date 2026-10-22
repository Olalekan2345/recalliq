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

## "Inside RecallIQ" film (`src/components/marketing/cinematic/`)

A six-chapter scroll film placed directly after the hero (`#inside`): Investigate → Execute → Remember → Verify → Optimize → Evolve. Removing `<CinematicSection />` from `(marketing)/page.tsx` removes it entirely; nothing else depends on it.

- **Camera.** A sticky stage holds one CSS 3D world (perspective 1400px): a `world` element handles dolly and orbit, and a `pivot` element moves the camera target. All objects share that space, so scenes connect physically. Panels leave the laptop screen and shrink into memory capsules; the camera flies through light lines to the monitor wall behind the laptop; the monitors give way to tool cards; the cards collapse into the emblem. Keyframes are in `film.tsx` (`CAMERA`), and the 1440×900 composition is scaled to the viewport.
- **Real versus concept.** The laptop shows a screenshot of the real Workspace (`public/cinematic/workspace.webp`, fresh demo account, dark theme). Panels and monitors render the app's own components (`ActivityFeed`, `RunProgress`, `SafeText`, `VerificationBadge`, `Badge`) with `recorded-run.ts`, a snapshot of one real Mainnet investigation (display fields only, no user identity). The WorthIt chapter shows that run's actual tool decision. The memory hologram and the payment-approval card are labelled as concepts. Every chapter carries a source caption.
- **Rules learned the hard way.** Opacity on a `preserve-3d` group flattens it, so fades are applied to leaf objects only. Planes that intersect clip each other, so the hologram stands well in front of the screen. In Chrome, an element with `mix-blend-mode` inside a 3D transform clips its group's negative overflow, so the hologram plane has an explicit box. Computed SVG coordinates are rounded, because `Math.cos` differs between Node and browsers and would cause a hydration mismatch. `ActivityFeed` formats times locally, so it renders after mount.
- **Interaction.** Native scrolling over 560vh. A chapter rail jumps to chapters. "Play film" auto-advances at film speed and stops on any wheel, touch or key input; "Skip film" jumps to `#after-film`; the final CTA scrolls into view on focus. Copy beats are real text; each chapter also has a screen-reader heading and summary.
- **Fallback.** Below 1024px, or with reduced motion, the same six chapters render as stacked sections (`stacked.tsx`) with the same real panels and plain-text summaries. The choice is pure CSS, so there is no hydration branch.
- **Cost.** No new dependencies. The film is its own chunk (about 23 KB): it is not server-rendered and mounts only after the page is idle and the section is near, behind a same-height placeholder, so there is no layout shift. The hologram's and emblem's loops run only in their own chapter, and the scanlines are static (an animated `background-position` repainted every frame). The particle canvas (`particles.tsx`) draws only during the memory chapter while visible, with DPR capped at 1.5. The laptop screenshot is 48 KB and lazy-loaded.
- **Hydration.** Every homepage scene below the hero is its own `<Suspense>` boundary, so React hydrates the header and hero first and replays early clicks. Before this change, a click about 0.6 s after load was lost and the theme menu needed a second click (about 3 s); now the first click works (about 1.2 s).
- **Refreshing assets.** Re-capture the Workspace from a fresh account with the recorded question typed in, and regenerate `recorded-run.ts` from `GET /api/agent/runs/:id` of a real run. Never hand-edit values into the snapshot.

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
