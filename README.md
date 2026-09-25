# Chooser of the Slain

A Papers, Please-style judgment game: you're a new Valkyrie with 20 battle-days until Ragnarök, sorting the dead before dusk. It's planned as a paid release on Steam and Google Play, with a free web demo (the Daily Shift and campaign days 1–3).

- **Plan:** [`docs/build-plan.md`](docs/build-plan.md): design, 20-day campaign, milestones, risks.
- **Technical spec:** [`docs/tech-spec.md`](docs/tech-spec.md): types, the case-fairness system, content formats, platform shells.
- **Status:** M7 (engineering done): the 20-day campaign is playable in the full builds, with a first draft of the story for every day and eleven endings (nine new, plus demoted and an empty house), all reachable by bots; winter bills, late-game upgrades and Endless mode ([`docs/m7-design.md`](docs/m7-design.md)). Waiting on you: rewriting or signing off the story drafts ([`docs/story-drafts.md`](docs/story-drafts.md)) and outside playthroughs, which the economy's tuning needs. Since M7: the dead's lines no longer give Loki away or contradict the soul, and repeat far less down a long queue; standing is shown on the morning and night screens, choices say whom they moved, and the audit's standing adds up; a journal keeps every scene and choice and lists what's still in play, and options you can't afford stay in sight; the ending reports the host at Ragnarök, the endings found are kept, and a day can be replayed in a new slot; the night screen says what each bill left unpaid will do, what the coming nights cost, and when the debt would end the run; assists give a slower or faster sun, a rule tracker and a campaign without fines; each day's new rule or tool gets a short coached lesson on its first soul; Skögul will point at what to look at, for some sun; Endless has a run of the day with share text, keeps a run through a reload and brings twists on days with nothing new, while earlier Dailies can be played from an archive; saves can be backed up and restored, a save the game can't read is kept and shown rather than taken for an empty slot, and the game asks the browser to keep its saves; and among smaller fixes, a paused practice, Daily or Endless shift can be left, costs show the upgrades bought, rules say what they ask on the day, generated souls no longer take the story's names or look alike, and runes have a font of their own; every screen and scene now opens at the top; `pnpm story:script` makes a readable script of the whole story for review, with approvals kept for Claude; the campaign has ten more story souls, fuller Days 4–6, and a later consequence for every story choice; the desk has some feel: stamps leave ink, souls walk up and off the way they're sent, papers can be moved about the desk, the sky goes down with the sun, and Reduce motion stills it all; and 21 achievements (8 in the demo), for judging well and finding the story's corners rather than for playing a lot, are kept on the device and in backups, shown in a gallery on the title screen, and ready to hand to Steam and Google Play once those builds exist; and an accessibility pass: every screen passes automated WCAG 2.2 AA checks on phone and desktop, every control on a phone is at least 44 px, 175% text works on a 360 px phone (the shift scrolls like a page), and screen readers hear citations, answers, verdicts and the sun running low; and controller support for the Steam Deck: the d-pad and left stick move between controls, the buttons do what the keys do, LB and RB go from paper to paper, and the controller's button prompts replace the keys' while it's in use; and a store capture: `pnpm store:capture` replays eleven chosen moments and three clips with the same souls every time, and saves Steam's 1920×1080 screenshots, Google Play's phone and landscape shots, GIFs and trailer frames, each checked against the stores' rules; and a playtest build: the whole game on its own restricted itch.io page, where each save slot turns its run into a report for the playtest form (the rings night by night, every soul sent wrong and the rule it broke, every choice), and whose saves stay apart from the public demo's ([`docs/playtest.md`](docs/playtest.md); [`docs/tech-spec.md`](docs/tech-spec.md) §19–38). Before that, M5 (vertical slice, engineering done): the woodcut is the chosen art direction and the game's default (the pixel candidate and the placeholder stay for comparison, on the art trial page from `pnpm art:sheet` and in play with `?art=`); Days 10 (the clerk, TRANSFER) and 12 (Loki, DETAIN); a vertical slice in the full builds (Days 1–3, then Day 12); placeholder sound; a landscape phone layout; the second draft of Days 1–3 ([`docs/voice.md`](docs/voice.md)). Waiting on you: commissioning the woodcut art ([`docs/art-brief.md`](docs/art-brief.md)), signing off the writing ([`docs/story-drafts.md`](docs/story-drafts.md)) and the Next Fest checkpoint ([`docs/next-fest.md`](docs/next-fest.md)). The public Daily alpha is unchanged: to launch it, follow [`docs/alpha-launch.md`](docs/alpha-launch.md). Privacy: [`docs/privacy.md`](docs/privacy.md).

## Getting started

Requires Node 22.18+ and pnpm 10.

```sh
pnpm install
pnpm dev                 # dev-full build with the Case Lab, at http://localhost:5173
pnpm lint                # Biome + import boundaries + engine purity
pnpm typecheck           # engine (no DOM), Node tooling, browser code
pnpm test                # Vitest + fast-check
pnpm build:all           # all seven targets into dist/<target>
pnpm leak-check          # demo builds contain no campaign content; full builds do
pnpm e2e                 # Playwright against dist/web-demo, dist/dev-full and dist/web-playtest
pnpm sim sweep --seeds 200   # generator sweep with the CI thresholds (nightly runs 10,000)
pnpm sim sweep --daily --seeds 200   # the same for Dailies #1-#200
pnpm golden:update       # refresh tests/golden (day summaries, Daily checksums) after an intended generator change
pnpm store:capture       # store screenshots, GIFs and trailer frames into dist/store (pnpm build:electron-full first)
```

## Layout

| Path | What |
|---|---|
| `packages/engine` | Deterministic game engine: pure TypeScript, no DOM, integer math only |
| `packages/content-schema` | zod schemas and the build-target matrix |
| `packages/content-compiler` | Compiles `content/packs` into per-target bundles and leak tokens |
| `packages/ui` | Preact UI (desk layout for desktop/Deck, drawer layout for phones) |
| `packages/platform` | Web, itch, Electron and Android adapters, chosen at build time |
| `packages/art` | Body art behind a swappable provider contract: the woodcut (the chosen direction and the default), plus the pixel candidate and the placeholder for comparison |
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
| `web-playtest` | everything | a restricted itch.io page, for invited playtesters ([`docs/playtest.md`](docs/playtest.md)) |
| `electron-demo` | core, daily, demo | Steam demo |
| `electron-full` | everything | Steam |
| `android-full` | everything | Google Play |
| `dev-full` | everything + Case Lab | local only |

## License

The code is licensed under the [GNU GPL v3.0 only](LICENSE). The story, art, audio and the game's name and branding are **not** covered by that license; see [`CONTENT-LICENSE.md`](CONTENT-LICENSE.md).
