# Chooser of the Slain

A Papers, Please-style judgment game: you're a new Valkyrie with 20 battle-days until Ragnarök, sorting the dead before dusk. It's planned as a paid release on Steam and Google Play, with a free web demo (the Daily Shift and campaign days 1–3).

- **Plan:** [`docs/build-plan.md`](docs/build-plan.md): design, 20-day campaign, milestones, risks.
- **Technical spec:** [`docs/tech-spec.md`](docs/tech-spec.md): types, the case-fairness system, content formats, platform shells.
- **Status:** M4 (campaign systems, built): the campaign with save slots, mornings, audits, nights, family, factions, a shop and endings, Ink story scenes, story souls and replaying any day. The demo plays Days 1–3; the full game Days 1–6, with the registry, rune-lens, clipping nails and forged tallies in Practice (Days 6–8 and 11). All story text is draft ([`docs/story-drafts.md`](docs/story-drafts.md)). M3's public Daily alpha is unchanged: to launch it, follow [`docs/alpha-launch.md`](docs/alpha-launch.md). Privacy: [`docs/privacy.md`](docs/privacy.md).

## Getting started

Requires Node 22.18+ and pnpm 10.

```sh
pnpm install
pnpm dev                 # dev-full build with the Case Lab, at http://localhost:5173
pnpm lint                # Biome + import boundaries + engine purity
pnpm typecheck           # engine (no DOM), Node tooling, browser code
pnpm test                # Vitest + fast-check
pnpm build:all           # all six targets into dist/<target>
pnpm leak-check          # demo builds contain no campaign content; full builds do
pnpm e2e                 # Playwright: smoke tests and full Daily playthroughs against dist/web-demo
pnpm sim sweep --seeds 200   # generator sweep with the CI thresholds (nightly runs 10,000)
pnpm sim sweep --daily --seeds 200   # the same for Dailies #1-#200
pnpm golden:update       # refresh tests/golden (day summaries, Daily checksums) after an intended generator change
```

## Layout

| Path | What |
|---|---|
| `packages/engine` | Deterministic game engine: pure TypeScript, no DOM, integer math only |
| `packages/content-schema` | zod schemas and the build-target matrix |
| `packages/content-compiler` | Compiles `content/packs` into per-target bundles and leak tokens |
| `packages/ui` | Preact UI (desk layout for desktop/Deck, drawer layout for phones) |
| `packages/platform` | Web, itch, Electron and Android adapters, chosen at build time |
| `packages/art-placeholder` | Procedural SVG body art behind a swappable provider contract; final art arrives at the vertical slice |
| `apps/web` | The single Vite entry for every target |
| `apps/electron`, `apps/android` | Steam (M6) and Google Play (M9) shells |
| `apps/telemetry` | Opt-in alpha telemetry: a Cloudflare Worker and D1 schema |
| `content/packs` | `core`, `daily` (the Daily Shift spec), `demo` (days 1–3) and `campaign` (days 4–20) |
| `tools` | Leak check, boundary lint, generator sweeps, icon renderer |

## Build targets

| Target | Content | Ships to |
|---|---|---|
| `web-demo` | core, daily, demo | GitHub Pages (PWA) |
| `web-itch` | core, daily, demo | itch.io |
| `electron-demo` | core, daily, demo | Steam demo |
| `electron-full` | everything | Steam |
| `android-full` | everything | Google Play |
| `dev-full` | everything + Case Lab | local only |

## License

The code is licensed under the [GNU GPL v3.0 only](LICENSE). The story, art, audio and the game's name and branding are **not** covered by that license; see [`CONTENT-LICENSE.md`](CONTENT-LICENSE.md).
