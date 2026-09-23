# Chooser of the Slain: build plan

Working title for concept #2 in [`game-concepts.md`](game-concepts.md). The technical detail behind this plan (types, algorithms, formats, platform shells) is in [`tech-spec.md`](tech-spec.md).

## Overview
**Decisions**
1. **Paid on Steam and Google Play.**
   - Steam build: Electron.
   - Play build: Capacitor, with the full game bundled inside the app, not a TWA.
   - Free web demo (Days 1–3 plus the Daily Shift) on GitHub Pages and itch.io.
2. **Placeholder art** until the vertical slice, then pick an art direction.
3. **A 20-day campaign** for 1.0, plus the Daily Shift and Endless modes.
4. **The repo is public,** so the game is effectively open source. Demo builds exclude the campaign, but the source doesn't hide it. The license terms are in §9.

**Timeline** (rough, full-time solo, starting Oct 2026): about **52 weeks plus 15–20% contingency**.
- Public Daily Shift web alpha: late Dec 2026 / early Jan 2027.
- Steam store page public: mid-Apr 2027.
- Steam Next Fest demo: Oct 2027. June 2027 only if the vertical slice is strong by early April.
- **1.0 on Steam and Play: about Nov 2027**, worst case Q1 2028.

**Notes**
- Ship the title as *Chooser of the Slain*, without "R-Us". Toys"R"Us has a history of enforcing "R Us" names. The repo name can stay.
- Use steamworks-ffi-node instead of steamworks.js. steamworks.js has had no npm release since Aug 2024 (checked on npm, Sep 2026). It sits behind our own `SteamPort` adapter.

---

## 1. Game design
**Premise.** You're a newly appointed Valkyrie with 20 battle-days until Ragnarök. You judge each day's dead before dusk. Tone: dark comedy with a serious core (your mortal family, the gods' approaching doom).

**Day loop.**
1. **Dawn:** Odin's new rule (the decree), what changed in the rulebook, and a story scene.
2. **Shift:** the dead queue under a sun timer. For each one: inspect → compare and question → stamp → send. Mistakes get a citation on the spot.
3. **Audit:** pay, fines, faction standing.
4. **Night:** family upkeep, upgrades that only make you faster, letters, explicit story choices.
5. Save.

You can replay any past day from the save made at its start, as in Papers, Please.

**Stamps**, with the day each unlocks:
- VALHALLA: Day 1
- HEL: Day 1
- RETURN: Day 3
- FÓLKVANGR: Day 4
- RÁN: Day 5
- TRANSFER: Day 10
- DETAIN: Day 12

**Evidence**
- **The body, with tappable hotspots:**
  - grip
  - wounds front and back (you flip the body)
  - nails
  - pendant
  - lips
  - breath
  - skin signs
  - heraldry, drawn as pattern + emblem + color so color is never the only signal
- **Testimony:** can lie.
- **Saga tally:** reliable unless forged.
- **Raven report:** never false, but Muninn can leave blanks.
- **Weapon:** an owner inscription and a maker's mark.
- **Rulebook and daily decree.**
- **Registry of outlaws and oathbreakers,** from Day 6.

**Tools**, with the day each unlocks:
- Compare and Question: Day 1
- Flip: Day 2
- Feather: Day 3
- Rune-lens: Day 7
- Clippers: Day 8

Upgrades change speed only. They never change what can be solved.

**Rules are data.** Each rule is a condition that leads to a destination, checked in order. The authoritative rulebook text is generated from that data.

**Design fixes from the review**
- **Freyja's claim becomes a daily whim** over something visible ("Freyja wants the left-handed"), not a literal half.
- **Hammer + cross pendant means prime-signed** (a real custom; Egill undergoes it in Egils saga). Only the fully baptized get TRANSFERred.
- **"The fallen are dead" is presumed,** and visible cues (breath-fog, twitching) tell you when to use the feather. Occasional false cues keep the tool necessary.
- **Forged tallies give themselves away by category:**
  - an Elder Futhark rune mixed in
  - a mirrored rune
  - a broken "X owns me" inscription

  Spelling mistakes would be unfair: the Viking-age alphabet had only 16 runes for many more sounds, so real spellings vary.
- **The Naglfar plot advances only through explicit choices,** never through mistakes.

**Economy**
- Rings for each correct judgment, +1 if you flagged a liar's contradiction before stamping.
- 2 free citations a day, then fines of 5, 10, 15.
- Odin's ring Draupnir pays a bonus on nights 9 and 18.
- Family costs: hearth, food, medicine.
- Two nights below −30 rings means you're demoted, which ends the game.

**Factions.** Odin, Freyja, Hel, Loki and the Christian clerk. Their standing drives letters, story branches and endings.

**Modes**
- **Campaign:** 20 days.
- **Daily Shift:**
  - 8 souls, 6 minutes, one twist decree.
  - Numbered by local date, like Wordle.
  - Uses only Day 1–6 mechanics during the alpha, and never any story.
  - Share text shows only right/wrong, never destinations: `Chooser of the Slain · Daily #97 (g2) · [+][+][x][+]… 7/8`.
- **Endless:** a new rule every 5 souls, 3 strikes.
- **Story Mode:** no timer, no fines.
- **Assist:** sun speed from 0.5× to 2×. Daily results are marked as assisted.

**Content rules**
- The dead are adults only; the data schema limits age to 18–85.
- Family members who die are adults. Children can fall ill or leave, but never die.
- No self-harm and no sexual violence.
- Wounds are stylized marks.
- Religion is played as comedy about competing afterlife bureaucracies. The clerk's storyline gets a sensitivity read.
- **Norse symbols that extremists have appropriated** (valknut, Othala with serifs, Algiz as the "life rune", doubled Sowilo, the Tyr rune, Wolfsangel, black sun) never appear in branding or UI. Runes in in-world inscriptions are fine.
- Target rating: PEGI 12 / ESRB T.

**Lore the mechanics use (established)**
- Valkyrie means "chooser of the slain."
- Freyja takes half the slain (the poem *Grímnismál*).
- Hel receives those who die of sickness or old age (Snorri).
- The drowned go to the sea goddess Rán.
- The ship Naglfar is built from dead men's untrimmed nails.
- The dwarf Brokkr sewed Loki's lips shut.
- Odin marked himself with a spear before he died (*Ynglinga saga*).
- Draupnir drips eight rings every ninth night.
- Real Ulfberht swords are inscribed +VLFBERH+T; imitations read +VLFBERHT+.
- Egill was prime-signed in England.

## 2. Campaign (20 days)
| Day | New rule or tool | Story beat |
|---|---|---|
| 1 | Weapon in hand → Valhalla, otherwise Hel. Compare and Question. | Skögul, your mentor, trains you. First letter from home. |
| 2 | Flip: a wound in the back means you fled → Hel. | Your family's first need. |
| 3 | Feather → RETURN. **The demo ends here, and it must include a Question moment.** | Thorvald the Unlucky, not dead (the first of about 6 appearances). Loki: "Lovely nails." |
| 4 | FÓLKVANGR, set by Freyja's daily whim. | Freyja visits. Odin's and Freyja's quotas pull against each other. |
| 5 | Sea battle: the drowned → RÁN. | Illness at home. |
| 6 | Registry: outlaws and oathbreakers → Hel. | An oathbreaker you knew in life. |
| 7 | Weapon inscriptions: borrowed weapons and fake Ulfberhts. Rune-lens. | A scandal among the smiths. |
| 8 | Naglfar decree: clip untrimmed nails before stamping. | Loki's offer: "Don't clip." |
| 9 | Draupnir payday. | The first big family choice. |
| 10 | The clerk arrives → TRANSFER. Both pendants means prime-signed, so they stay yours. | Comedy between afterlife departments. |
| 11 | Forged tallies. | Who is forging them? |
| 12 | Loki's disguises → DETAIN (scarred lips). | Conspiracy choice: report or cover for him. |
| 13 | Muninn forgets. The two ravens disagree. | Midpoint twist: Odin knows. |
| 14 | Hel's hall is full: straw deaths are rerouted. | Hel goes on strike. |
| 15 | Odin's and Freyja's quotas conflict. | You start committing to a faction. |
| 16 | "Liars forfeit Valhalla": any lie you catch now matters. | Thorvald, finally? |
| 17 | The spear-mark loophole. | Your family's fate. |
| 18 | Draupnir payday. Naglfar is nearly done. | Loki's final offer. |
| 19 | All rules active. | The last night. |
| 20 | **Ragnarök**: a surge queue. | Endings. |

**Endings**
- Chooser Eternal (Odin)
- Freyja's Own
- Hel's Steward
- Naglfar Sails Early (Loki)
- The Transfer (the clerk)
- Smuggled Home (your family)
- Rebirth (the true ending)
- Demoted (failure, possible on any day)

**Writing budget: about 50k words, the biggest cost in the project.**

| Piece | Words |
|---|---|
| Decrees | 1.6k |
| Morning scenes | 7k |
| Nights and letters | 10k |
| ~30 scripted cases | 7.5k |
| 9 endings | 6.3k |
| ~900 lines of reusable dialogue for the dead | 13.5k |
| UI and tutorial | 5k |

## 3. Architecture
**Stack** (versions from the review's npm check, Sep 2026)
- **Language and bundler:** TypeScript, Vite 8.3.
- **UI:** Preact 10.29 + @preact/signals 2.11.
- **Content data:** yaml 2.9 + zod 4.6, used in the content compiler only. The game client uses just `zod/mini`, to validate saves.
- **Story:** inkjs 2.4, which compiles Ink scripts in Node.
- **Text:** intl-messageformat 12.1.
- **Tests:** Vitest 5 + fast-check 4.10; Playwright **1.56.1**, which matches the Chromium already installed here.
- **Lint and formatting:** Biome, plus a small import-boundary check in `tools/lint-boundaries` (dependency-cruiser doesn't support TypeScript 7 yet).
- **PWA:** vite-plugin-pwa 1.3.
- **Steam:** Electron 44 + electron-builder 26 + steamworks-ffi-node 0.11.
- **Play:** Capacitor 8.5.

**Layout (pnpm workspace)**
```
packages/engine            pure TS, no DOM: rng, logic (solver), gen, sim, narrative, save, runes
packages/content-schema    zod schemas, the single source of types
packages/content-compiler  YAML + Ink + strings -> generated/<target>/, lints, leak tokens, TS codegen
packages/ui                Preact components, layouts, input, i18n, art interfaces
packages/art-placeholder   procedural SVG body art (the final art package arrives in M5)
packages/platform          Platform interface; web | itch | electron | android adapters
packages/testkit           test data generators, brute-force reference solver, bots, sweep harness
apps/web | apps/electron | apps/android
content/packs/{core,daily,demo,campaign}      assets/{core,demo,campaign}
tools/{case-lab,sim,replay,leak-check,glyph-check,body-lab}      tests/{e2e,golden,replays,fixtures}
```

**Build targets**

| Target | Content packs | Ships to |
|---|---|---|
| web-demo | core, daily, demo (PWA) | GitHub Pages |
| web-itch | core, daily, demo (no service worker, relative paths) | itch.io zip |
| electron-demo | core, daily, demo | Steam demo (its own app ID) |
| electron-full | all | Steam |
| android-full | all | Play |
| dev-full | all + Case Lab | local only |

**Keeping the campaign out of demo builds**
- The compiler enforces which content packs can depend on which.
- The Vite content module only resolves the current target's output folder.
- Strings, Ink scripts, assets, achievements and the PWA's offline cache are all scoped to their pack.
- **A post-build leak check** scans every file the demo builds emit for a campaign marker string (a canary) and for campaign IDs. It also runs on the full builds, where it must *find* them, so the check can't pass by doing nothing.
- Public builds ship no source maps.

**Engine rules (enforced by lint)**
- No DOM, `Math.random`, `Date`, trigonometric or exponential `Math` functions, `localeCompare` or `Intl`.
- Integer math only, so Dailies match across browsers.
- Everything goes through `step(state, action) → {state, events}`.

## 4. Case generation and fairness (the core system)
- **Model.** Each case goes through these stages:
  1. Hidden truth about the dead soul.
  2. The evidence rendered from it.
  3. What the player can know on day d: taught laws, presumptions, a trust ladder, and what can be perceived with that day's baseline tools.
  4. A solver that treats every fact as true, false or unknown.
  5. The expected judgment: a destination, plus any required procedures such as trimming nails.
- **Trust ladder**, highest first:
  - 4: a physical sign read through a taught law, raven reports, confessions.
  - 3: the tally (0 if a forgery sign is visible).
  - 2: testimony.
  - 1: presumptions.
- **Loki cases have no special rules.** A Loki case is a consistent disguise plus one tell (scarred lips).
- **Contract, checked by a validator on every case:**
  - **F1:** every field that isn't a lie agrees with the truth, under all laws.
  - **F2:** every conflict contains a lie or forgery, so there are no false alarms.
  - **F3:** the solver reaches the expected judgment.
  - **F4:** every lie that changes the outcome shows up in a contradiction the player can find.
  - **F5:** every forgery shows a visible sign.
  - **F6:** if a decisive fact breaks its presumption, it has evidence at trust 3 or higher, plus a tool-free cue if every way to see it needs a tool.
  - **F7:** limits on effort, tools, subtlety and number of documents.
  - **F8:** the content rules.
- **Generator.**
  1. Each day has a shuffled "bag" of destinations, like Tetris's 7-bag.
  2. For each slot: pick a character type → sample the truth → judge it → pick lies → plan the evidence.
  3. Evidence planning:
     - Decisive facts get redundant ways to be seen, at least one at trust 3 or higher.
     - Add cues.
     - Muninn never leaves a blank on the only source of a fact.
     - Add decoys.
  4. Render, then validate.
  5. On failure, retry in tiers of 24/12/12/8 attempts with loosening constraints, then fall back to a curated, pre-validated case.
  - Separate random streams mean cosmetic changes never alter gameplay or Dailies.
  - Each case is a pure function of (seed, day, index).
  - Budget: at most 400 attempts per day, and under 5 ms per case for 99% of cases.
- **Compare and Question.**
  - Compare works on individual fields, and only on fields you've already looked at.
  - A wrong compare costs 10 seconds of sun.
  - Question costs 20 seconds of sun and plays the response planned at generation time:
    - confess: reveals the truth
    - insist: exposes a forged tally
    - excuse: retracts the claim
    - deflect: Loki's tell
  - Lines come from ICU message templates keyed by fact × claim × personality × response type, avoiding the last 20 used.
- **Minimal proof** is the smallest set of evidence that still yields the judgment. It drives:
  - difficulty
  - timer tuning
  - the bots
  - citations that explain mistakes: "Rule 4 applied; you didn't check: skin (fever-flush)."
- **Difficulty** = proof cost + weighted questions, rule depth, subtle fields, tools and lies. Refit the weights from alpha telemetry.
- **CI gates:**
  - At least 30% of generation attempts accepted per (day, character type).
  - Mean attempts ≤ 3, and 99th percentile ≤ 15.
  - Fallbacks ≤ 0.05%.
  - The bot that checks everything scores 100%.
  - The bot that believes testimony scores ≤ 65%, which proves the evidence matters.
- **Scripted cases** use the same validator, for every combination of story flags they branch on. Dilemmas relax only F3 and never cost rings.
- **Known limit: the validator proves the case can be deduced, not that the player can see the evidence.** Mitigations:
  - How visible each sign is (subtlety, zoom, what hides it) is gameplay data, and the art must meet it.
  - Citations show the proof.
  - A "Report this soul" button exports the case.
  - Opt-in alpha telemetry by rule and by sign.
  - A weekly review of random cases in the Case Lab.

## 5. Day loop, timer, scoring
- **Flow:** Morning → Shift → Audit → Night → save → next Morning. Day 20 goes Last Shift → Ragnarök report → Ending. Early endings are checked at every audit.
- **Sun time** is real shift time plus action costs:
  - flip 2 s, feather 10 s, rune-lens 8 s, question 20 s, wrong compare 10 s.
  - The current soul can be finished after dusk, with up to 60 s grace.
  - The timer pauses when the game is hidden or the app is paused, and the desk blurs so pausing can't be used to think for free.
- **Starting difficulty curve** (tuned by bots):
  - Day 1: 6 souls in 6 min.
  - Day 10: 12 souls in 9 min.
  - Day 19: 16 souls in 11 min.
- **Endings** are ordered conditions on the game state, using the same engine as rules.
  - Ragnarök strength = worthy − ½ unworthy + Freyja's host + Hel's legion − Naglfar progress.
  - Ranges of that score map to endings.

## 6. Content pipeline
1. YAML files, with unique keys and errors that point to file and line.
2. Schema checks.
3. Reference resolution.
4. Lints (§11).
5. Precomputed tables and rulebook pages.
6. Ink compile.
7. Message-format validation, plus a stretched pseudo-language for testing text overflow.
8. Output per build target.

`content:watch` hot-reloads the game and the Case Lab.

**What gets authored**
- facts, laws, cues, rules, and definitions that change by day
- character types
- day specs and scripted cases
- testimony and question templates
- name pools and heraldry

**Ink scripts (story scenes)**
- One compiled file per scene, with no Ink state carried between scenes. Long-term memory lives in engine flags.
- Scenes can read game values but not change them directly. Changes come from `# fx:` tags, applied once at scene end.
- Choices are logged as actions.
- English only at 1.0.

**Rulebook**
- "Order of Judgment", with NEW and REPEALED badges, and the clerk's plain-language summary generated from the rules themselves.
- Pages for Signs, Customs, Heraldry, Registry and the Futhark (rune alphabet).

## 7. UI
**Two layouts from one set of panels**
- **Desk** (desktop, Steam Deck, landscape tablets): used when the screen's short side is at least 600 px and the aspect ratio is at least 1.2. Papers can be dragged around.
- **Drawer** (portrait phones):
  - a top bar
  - the body taking about 45% of the screen
  - a row of clue chips
  - a tabbed bottom sheet
  - an action bar
- Landscape phones get a side sheet instead.

**Density limits**
- The generator enforces a maximum number of documents per case.
- Any field is at most 3 taps away.
- Touch targets are at least 44 px.
- Every body sign is also shown as a text chip, which is how Compare works on phones.

**Input**
- One command set shared by pointer, keyboard and gamepad. Keys: F flip, C compare, Q question, 1–7 stamps, R rulebook.
- One focus map serves keyboard, gamepad/Deck and screen readers.
- Stamping takes two steps: choose a stamp, then hold or confirm to send.

**Art can be swapped without touching game logic**
- **The engine owns** the appearance traits, the signs and how visible each sign must be.
- **A body-art module** draws them from a manifest: layers, palette slots, anchor points, hotspots and the visibility each drawing promises.
- **The placeholder module** is procedural SVG: shape-coded wounds, icon badges, pattern heraldry.
- **A pixel-art module** would use indexed PNGs recolored at runtime, scaled in whole-pixel steps.
- Contract tests and a Body Lab page keep the modules interchangeable.

**Accessibility and fonts**
- Text scale from 0.85 to 1.75.
- Reduced motion.
- Captions and screen-reader labels.
- Story Mode and Assist.
- Text at least 12 px on the Steam Deck's 1280×800 screen.
- Fonts: Noto Sans Runic plus a body font covering Old Norse letters (á ǫ ø ð þ …), checked by a CI glyph test.
- A pseudo-language toggle to test text overflow.

## 8. Saves and replays
- **Storage by platform:**
  - web: IndexedDB, requesting persistent storage
  - Electron: files written atomically by the main process
  - Android: Capacitor Filesystem
- Separate files for settings, Daily streaks, 3 campaign slots and Endless.
- **A save holds:**
  - the run seed
  - a snapshot at the start of each day
  - the in-progress day's **already-generated queue of souls**
  - the action log

  So a mid-day resume is exact even after an update changes the generator.
- **Migrations** have test fixtures for every past save version. A `.bak` copy is kept if loading fails.
- **Save codes (export and import) on web:** Pages and itch keep separate storage, and Safari deletes a site's storage after 7 days without use unless it's installed to the home screen.
- **Replay files** for bug reports, via "Report a problem": seed or snapshot, queue, actions, a state checksum every 20 actions, and device info. `pnpm replay --step` finds the first point where a replay diverges.

## 9. Platforms and repo
**Steam (Electron)**
- **Security:** the game loads from a custom `app://` protocol with a strict content security policy, with the renderer isolated and sandboxed.
- **Steam calls** happen only in Electron's main process, through `SteamPort` (steamworks-ffi-node, unpacked from the app archive). The Steam overlay is optional.
- **Saves** go in the per-user app-data folder, matched to Steam Auto-Cloud rules for Windows, macOS and Linux.
- **Linux and Steam Deck:**
  - Add the Linux command-line switches Electron needs under Steam's runtime.
  - Ship a native Linux build and test the Windows build under Proton too, both on a Deck in M6.
  - On Deck: gamepad support and the focus map, desk layout at 1280×800. Aim for Verified.
- **Demo** is a separate Steam app ID.
- **CI** uploads to a Steam beta branch.
- **macOS comes after launch.** Notarization needs a $99/year Apple account, plus test hardware.

**Google Play (Capacitor)**
- **Versions:** Capacitor 8.4 or later. It targets Android API 36, which new apps have needed since 31 Aug 2026. Minimum API 24.
- **Screen and plugins:**
  - safe-area insets for edge-to-edge screens
  - back button, pause, saves, share, haptics, splash screen
- **Saves** are covered by Android Auto Backup.
- **Orientation:** both.
- **WebView check:** a startup screen asks players to update Android System WebView if it's older than Chromium 105.
- **Store listing:**
  - Paid app, which needs a payments profile.
  - No ads or in-app purchases.
  - Data safety: "no data collected".
  - IARC content rating.
- **If your Play account is personal and newer than 13 Nov 2023,** you must run a closed test with 12 testers for 14 days before going to production. Recruit them from the Daily alpha.
- **CI** uploads to the internal testing track, with Play App Signing.

**Web demo and itch**
- The PWA (offline install) is only on the Pages build.
- Update prompts appear only on the title and night screens.
- Only demo assets are cached offline.
- Buttons: "Wishlist on Steam", later "Buy on Steam / Google Play".
- **Optional telemetry during the alpha only:** opt-in, a Cloudflare Worker + D1 database, no personal data.
- **itch build:**
  - relative paths and no service worker
  - under itch's limits (1,000 files, 500 MB)
  - uploaded with itch's `butler` CLI
  - a fallback for copying the share text when the clipboard is blocked

**GitHub (public repo)**
- Create `main`, make it the default branch, and require CI to pass before merging.
- Pages deploys from GitHub Actions: `deploy-web.yml` runs on `main`, builds the web demo, runs the leak check, then deploys.
- Turn on Issues, with a playtester form.
- **License (recommended):**
  - Code under GPL-3.0, or MIT if you prefer a permissive license.
  - A separate notice keeps story text, art, audio, and the game's name and branding outside the code license.
  - So anyone can read and fork the code but can't legally ship your campaign or art. Steam and Play both accept copyright takedowns.
- **Secrets needed later:** `STEAM_CONFIG_VDF`, `STEAM_USERNAME`, `BUTLER_API_KEY`, `ANDROID_KEYSTORE_B64`/`_PASS`, `PLAY_SA_JSON`.

## 10. Testing
| Layer | Checks | Runs |
|---|---|---|
| Unit (Vitest) | true/false/unknown logic, rune transliteration, RNG checksums, message formatting, state transitions, scoring | every commit |
| Property-based (fast-check) | F1–F8 on every generated case; same seed gives the same result; order doesn't matter; save/restore gives the same state; economy limits hold | pull requests: 200 seeds × 20 days; nightly: 10k × 20 |
| Cross-checks | a brute-force solver agrees with the fast one; deliberately broken cases get rejected; cosmetic-only changes keep the same judgment | pull requests |
| Golden files | summaries of 12 seeds × 20 days; checksums of the next 180 Dailies, pinned to the generator version | pull requests |
| Saves and replays | migration fixtures; a library of recorded replays | pull requests |
| End-to-end (Playwright 1.56.1) | screens: 412×915 phone, 360×740 phone, landscape phone, tablet, 1920×1080 desktop, 1280×800 Deck. Flows: a Daily, Day 1, compare and question, Story Mode, 150% text, reduced motion, keyboard only, simulated gamepad. Plus accessibility scans and a tap-target audit. | pull requests: smoke; nightly: full |
| Build | leak check (must fail to find campaign content in demos, must find it in full builds); web demo's initial JS ≤ 250 KB gzipped | pull requests |
| Bots | player bots (checks everything, efficient, competent, novice, believes testimony) × spending and story strategies. They report accuracy, income, family survival and which endings happen. **Every ending must be reachable.** | nightly |

## 11. Dev tooling
- **Case Lab** (dev build only; the leak check makes sure it isn't in public builds):
  - Shows: the truth, the lies, the rendered evidence, the solver's reasoning, the minimal proof, the templates used, rejected attempts and difficulty.
  - Actions: play this case, share a link to it, or export it as a scripted case.
  - Tabs for bulk generation runs and replays.
- **Content linter:**
  - schema, references and pack dependencies
  - the rulebook covers every case and no rule is unreachable
  - rules stay readable
  - laws don't contradict each other
  - every character type can be generated on each day it's used
  - every fact has a way to be seen, and cues exist where tools are needed
  - templates cover every lie × personality × response
  - strings: keys exist, message format parses, lengths fit their UI slots
  - Ink: bindings, tags, every scene reachable
  - assets and font glyphs present
  - word budgets and content rules
- **`pnpm sim day|campaign|daily`**, the Body Lab, a scenario jumper (start on day N with preset state), the pseudo-language toggle, and `pnpm replay`.

## 12. Milestones (full-time solo, from Oct 2026)
| # | Milestone | Weeks | When | Done when |
|---|---|---|---|---|
| M0 | Foundations | 1.5 | Oct 2026 | Workspace, CI, all 6 build targets building, leak check with both controls, engine lint rules, Pages hello-world |
| M1 | Fairness engine | 4 | Oct–Nov | Solver, generator, F1–F8 validator, minimal proof, question responses for Day 1–5 mechanics. A 10k-seed run passes the CI gates. Case Lab v1. |
| M2 | Playable core loop | 4 | Nov–Dec | Shift screen in both layouts; placeholder body; Day 1–5 tools; timer and pause; Daily and share text. 5 outside testers finish a Daily on phone and on desktop. |
| M3 | **Public Daily Shift alpha** | 2 | Dec – early Jan | Live on Pages and itch; short tutorial; feedback form, "Report this soul", opt-in telemetry; Daily checksum guard; a community channel. **Pay the Steam Direct fee now** (starts Valve's 30-day wait). |
| M4 | Campaign systems | 6 | Jan–Feb 2027 | Full day loop, economy, family, factions, shop, Ink scenes, scripted cases, saves and replay-any-day, forgeries, registry, clippers. Days 1–6 playable in draft. Economy simulations. |
| M5 | **Vertical slice + art decision** | 6 | Feb–Mar | Days 1–3 at final quality, plus Day 12 (Loki) as proof the late game works. **Two art directions built as swappable art modules** and judged on how readable the subtle signs are on a 360 px phone, cost per variant, and how they look on streams and in thumbnails. Then: style guide, audio pass, store capsule art commissioned, **Next Fest decision** |
| M6 | **Steam page + Electron** | 3 (overlaps M5) | Mar–Apr | Store page public mid-Apr 2027. Full and demo builds on the Steam beta branch. Cloud saves verified on Windows and Linux. Achievements. Tested on a Deck. |
| M7 | Content production | 15 | Apr–Jul | Days 4–20, the clerk, the Naglfar plot, 8+ endings, Endless. About 50k words. Weekly tester builds. Every ending reachable by bots. At least 5 outside full playthroughs. |
| M8 | **Steam demo + Next Fest** | 1–2 | before the chosen fest | Demo live (Days 1–3 + Daily), trailer, list of press and streamers |
| M9 | Android / Play | 4 | Aug | Capacitor build complete, tested on a cheap phone, 12-tester closed test started |
| M10 | Beta + polish | 6 | Aug–Oct | Bug bash, balance, accessibility audit, Deck review, content ratings; a release candidate with no critical or major bugs |
| M11 | Launch | 1–2 | early–mid Nov 2027 | Steam and Play 1.0, before the Steam Autumn Sale. Demo site switches to "Buy". Plan for 1.1. |

**Next Fest (decide at the end of M5)**
- **June 2027 (Jun 14–21):** registration closes Apr 25, and the demo and store page must be in review by May 17. Only choose it if the slice is strong by early April.
- **October 2027 (recommended):** dates aren't announced yet. It's usually mid-October, with registration about 2 months before.
- Each game gets one Next Fest. Make the demo public 2–4 weeks before it.

**What to cut if the schedule slips:**
- Move Endless to 1.1.
- Move macOS, localization, and the Daily archive and leaderboard to after launch.
- Settle for a "Playable" Deck rating instead of Verified.
- Shrink the clerk's storyline to 3 beats.
- Launch on Steam first, and on Play 2–6 weeks later.

## 13. Top risks
| Risk | Mitigation |
|---|---|
| Deducible but not visible (fairness) | How visible each sign is lives in the game data, and the art must meet it. Cues. Citations that show the proof. Telemetry. Weekly Case Lab review. |
| Late-game days produce repetitive cases or fail to generate | Generate from targeted character types; precomputed tables; CI gates per (day, character type); a new character type with each mechanic. |
| Phone screens get too crowded | Design the phone layout from M2. Papers, Please's own phone port was portrait-only and took about 8 months. Clue chips, a document cap, 360 px end-to-end tests, and a cheap phone in M9. |
| ~50k words of writing | Word budget per day; reusable templates carry the variety; sparse character appearances; write in passes (outline → draft → polish); consider a freelance editor. |
| Dailies differ between devices | Integer-only engine, generator versioning, pinned checksums for 180 days ahead, version in the share text. |
| Updates break saves | Day snapshots plus the saved queue; Ink state reset per scene; migration fixtures. |
| Steam integration | SteamPort adapter, Linux switches, unpacked native files, overlay optional, Deck testing in M6 |
| Play timeline | Target API 36; start the 14-day closed test early; WebView check. |
| Public repo | Anyone can build the full game (your choice). The license and the reserved name and branding limit resale; the stores act on takedowns. |
| Tone, religion, rating | Satire aims at bureaucracy, not belief; a sensitivity read; content rules enforced by the data schema. |
| Scope (3 modes × 3 storefronts) | The cut list, and launching on Steam first if needed. |

## Sources
- [Steam Next Fest June 2027](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/june_2027) · [Steam release process](https://partner.steamgames.com/doc/store/releasing)
- [Play testing requirement for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en) · [Play target API levels](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en)
- [Papers, Please on phones (TouchArcade)](https://toucharcade.com/2022/08/05/papers-please-iphone-android-download-available-now-free-update-ipad-universal/) · [Wikipedia](https://en.wikipedia.org/wiki/Papers,_Please)
- [steamworks-ffi-node](https://github.com/ArtyProf/steamworks-ffi-node) · [steamworks.js](https://github.com/ceifa/steamworks.js/) · [Announcing Capacitor 8](https://ionic.io/blog/announcing-capacitor-8)
- [itch.io HTML5 limits](https://itch.io/t/893409/zipped-html5-game-number-of-files-limit) · [Ulfberht inscriptions](https://www.vikingrune.com/2009/01/viking-swords-ulfberht-fakes/)
