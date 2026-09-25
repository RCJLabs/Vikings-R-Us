# Chooser of the Slain: technical spec

This is the detailed design behind [`build-plan.md`](build-plan.md). When the two disagree on a game-design matter (unlock days, story beats), `build-plan.md` §1–2 wins. The YAML and TypeScript below are sketches, not final code.

## 0. Environment notes and review corrections (checked 2026-09-23)

**Repo and local tools**
- `RCJLabs/Vikings-R-Us` is **public, by decision** (see §8.4).
- Local tools: Node 22.22, pnpm 10.33, JDK 21, no Android SDK.
- `/opt/pw-browsers/chromium-1194` matches **Playwright 1.56.x**; 1.57 ships chromium-1200. Pin `@playwright/test@1.56.1` and set `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.

**Package versions (all compatible with each other)**
- vite 8.3 (Rolldown). @preact/preset-vite 2.10 and vitest 5.0 both accept Vite 8.
- preact 10.29, @preact/signals 2.11, zod 4.6, yaml 2.9.
- inkjs 2.4 ships `inkjs/compiler/*`, so Ink compiles in Node without the .NET compiler.
- intl-messageformat 12.1. @messageformat/core hasn't been published since Oct 2024.
- fast-check 4.10, electron 44, electron-builder 26.
- @capacitor/* 8.5: its Android template uses minSdk 24 and targetSdk/compileSdk 36.
- vite-plugin-pwa 1.3 (supports Vite 8).

**Corrections the review made to the first draft**
1. **Steam integration:** steamworks.js looks unmaintained (npm 0.4.0, Aug 2024). Use **steamworks-ffi-node** (0.11.2, Aug 2026) behind a `SteamPort` adapter. It calls Steamworks SDK 1.64 through koffi FFI (no native rebuild per Electron version) and covers achievements, stats, cloud, overlay and input.
2. **Public repo:** anyone can clone and build the full campaign. The decision is to accept that and protect the work with a license plus reserved content rights (§8.4). The build-time content split still keeps the campaign off the web demo and out of the Steam demo.
3. **Saves:** "state = f(seed, log)" is right for replays but wrong as the only save format across updates. Add day snapshots and save the in-progress day's already-generated queue. Make Ink scenes stateless (§5.4, §7).
4. **Fairness** needs trust levels, presumptions and perception classes, not only "every lie is exposed" (§3).
5. **Compare works field by field**, and only on what the player has actually looked at.
6. **Heraldry** is pattern + emblem + color. Color alone would break "never color alone".
7. **Dailies:**
   - The share text must not reveal answers and must include a generator version.
   - The engine must use integer math only. Functions like Math.sin, exp and pow can give slightly different results in Safari and Chrome, which would split the Daily.
8. **More leak paths:** string tables, Ink JSON, assets and source maps. Scope each of them to a pack.
9. **Schedule:** about 12–13 months full-time to 1.0 on both stores.
10. **Title:** don't put "R-Us" in the commercial title (Toys"R"Us enforces "R Us" marks). Ship as *Chooser of the Slain*.

---

## 1. Repo and package layout

```
Vikings-R-Us/                         (public; see §8.4 for license)
├─ package.json  pnpm-workspace.yaml  tsconfig.*.json  biome.json
├─ packages/
│  ├─ engine/            pure TS; tsconfig lib ES2023 with no DOM. rng/ logic/ gen/ sim/ narrative/ save/ runes/
│  ├─ content-schema/    zod schemas; z.infer types are the single source of truth
│  ├─ content-compiler/  YAML + Ink + strings -> generated/<target>/**, lints, leak tokens, TS codegen (FactId/ObsKey unions)
│  ├─ ui/                Preact components, layouts, input/commands, i18n runtime, art interfaces
│  ├─ art/               BodyArtProvider contract, shared layout, woodcut (default), pixel, placeholder
│  ├─ art-final/         (M5+) sprite provider, same contract
│  ├─ platform/          Platform interface; adapters web | itch | electron | android (aliased per target)
│  └─ testkit/           fast-check arbitraries, brute-force oracle solver, bots, sweep harness, golden utils
├─ apps/
│  ├─ web/               Vite entry; vite.config.ts holds the TARGET matrix; PWA config
│  ├─ electron/          main.ts, preload.ts, steam.ts, saves.ts, electron-builder.yml   (M6)
│  └─ android/           capacitor.config.ts plus the android/ Gradle project           (M9)
├─ content/packs/
│  ├─ core/      facts, laws, channels, cues, rules library, named predicates, stamps, tools, personas,
│  │             archetypes, testimony/raven/question templates, name pools, heraldry, strings/en.json
│  ├─ daily/     daily composer, twist-decree pool, 3-case primer, strings
│  ├─ demo/      days/01..03, scripted cases, ink/*.ink, letters, strings
│  └─ campaign/  days/04..20, characters, endings, ink/, strings, pack.yaml (holds a canary)
├─ assets/{core,demo,campaign}/        pack-scoped art and audio
├─ tools/  case-lab/  sim/  replay/  leak-check/  lint-boundaries/  glyph-check/  body-lab/
├─ tests/  e2e/  golden/  replays/  fixtures/saves/
└─ .github/workflows/  ci.yml nightly.yml deploy-web.yml itch.yml steam.yml android.yml
```

**Build targets.** Each is `pnpm build:<t>`, which runs `content:compile --target t`, then `vite build --mode t`, then the shell packaging step (M6/M9).

| Target | Packs | @platform | PWA | base | Ships to |
|---|---|---|---|---|---|
| web-demo | core, daily, demo | web | yes | `/Vikings-R-Us/` (or a custom domain) | GitHub Pages |
| web-itch | core, daily, demo | itch (web without service worker) | no | `./` | itch.io zip via butler |
| electron-demo | core, daily, demo | electron | no | `./` | Steam demo app (its own appId) |
| electron-full | all | electron | no | `./` | Steam |
| android-full | all | android | no | `./` | Play (Capacitor) |
| dev-full | all + Case Lab | web | no | `/` | local only |

**How demo builds exclude the campaign**
1. **Pack dependency graph in the compiler.** `daily → core`, `demo → core`, `campaign → core, demo`. Any reference that breaks it is a build error. Output goes to `generated/<target>/`, which contains only the allowed packs.
2. **Vite `virtual:content` plugin.** It resolves only to `generated/<target>/index.ts`. The boundary check (`tools/lint-boundaries`) blocks any other import of `content/**` or `generated/**`.
3. **Everything is pack-scoped:** strings (`strings/<pack>.en.json`), Ink JSON, assets, achievement metadata and the PWA's offline cache list.
4. **Post-build leak check** (a CI gate on web-demo, web-itch and electron-demo). It scans every emitted file (js, json, css, html, map, webmanifest, service-worker cache list) for the campaign canary and every campaign-owned ID (string keys, scene names, character IDs, asset names). **Positive control:** the same scan must find them in the full builds, so the check can't pass by doing nothing. Public targets ship no source maps.
5. **Source:** the repo is public by decision, so layers 1–4 keep the campaign off the *demo builds*, not out of the source (§8.4).

Mechanics code (e.g. the DETAIN handler) ships in every bundle. That's acceptable: mechanics aren't content. People digging through the demo can see mechanic names.

---

## 2. Core TypeScript types

These live in `content-schema` as zod schemas; the engine re-exports the inferred types.

```ts
export type Day = number;                              // campaign 1..20; daily/endless use synthetic DaySpecs
export type PackId = 'core' | 'daily' | 'demo' | 'campaign';
export type Destination = 'VALHALLA'|'FOLKVANGR'|'HEL'|'RAN'|'RETURN'|'DETAIN'|'TRANSFER';
export type ToolId = 'flip'|'feather'|'runeLens'|'clippers'|'loupe';
export type Faction = 'odin'|'freyja'|'hel'|'loki'|'clerk';
export type Value = string | number | boolean;
export type FactId = GeneratedFactId;                  // codegen'd union from facts.yaml
export type ObsKey = GeneratedObsKey;                  // 'skin'|'lips'|'nails'|'woundsFront'|'feather'|'tallyTell'|'faceMatch'|...
export type FieldId = string;                          // 'body.front.lips' | 'testimony.3' | 'tally.cause' | 'muninn.lord' | 'q.2'

// ---- Facts: hidden ground truth ----
export interface FactDef {
  id: FactId; pack: PackId;
  domain: { enum: readonly string[] } | { bool: true } | { int: readonly [number, number] } | { ref: 'people'|'lords'|'registry' };
  since: Day; inert: Value;          // before `since` the fact is pinned to `inert` (keeps early days simple)
  presumption?: Value;               // taught custom used when there's no evidence ("the fallen are dead")
  derived?: Pred;                    // computed, never sampled (e.g. fled)
}
export type Truth = Readonly<Record<FactId, Value>>;

// ---- One predicate language for rules, laws, whims, archetypes, scripted `if`s, game-overs, endings ----
export type Pred =
  | { fact: FactId; is: Value } | { fact: FactId; in: readonly Value[] } | { fact: FactId; gte?: number; lte?: number }
  | { state: string; is?: Value; gte?: number; lte?: number }        // GameState path (endings, scripted inserts)
  | { all: readonly Pred[] } | { any: readonly Pred[] } | { not: Pred }
  | { ref: string }                  // named, day-versioned predicate (e.g. pred.worthy)
  | { param: string }                // day parameter (e.g. freyjaWhim)
  | { always: true };

export interface Rule {              // ordered decision list: first TRUE wins
  id: string; pack: PackId; since: Day; until?: Day; order: number;
  when: Pred; then: Destination;
  decree: string;                    // i18n key for Odin's flavor text. The clerk's summary is GENERATED from `when`.
}
export interface Procedure { id: 'trimNails'; pack: PackId; since: Day; until?: Day; when: Pred } // judgment = dest + procedures

// ---- What the player is taught (rulebook "Signs" and "Customs") ----
export interface Law {
  id: string; pack: PackId; since: Day; text: string;
  if: ObsPattern;                    // {obs,is|in} | {all:[...]} | {fn:'ownerMatchesName'|'faceMatchesRegistry'}
  then: FactConstraint;              // conjunction of {fact, in:[...]} only, so propagation stays trivial
}
export interface Perception {        // GAMEPLAY content; art must conform to it (§6.5)
  view?: 'front'|'back'; tool?: ToolId; zoom?: boolean;
  salience: 1|2|3;                   // 1 subtle, 3 obvious at default zoom
  occludedBy?: readonly LookGene[];  // e.g. 'beard:full' hides lips, so they can't be perceived
}
export interface Channel {           // ways a fact CAN be evidenced (planner input)
  fact: FactId; via: { obs: ObsKey; law: string } | { says: SourceKind };
  trust: 3|4; perceive: Perception; since: Day; subtlety: 1|2|3;
}
export interface Cue { fact: FactId; value: Value; obs: ObsKey; is: Value; perceive: Perception } // hint, no law (e.g. breath-fog)
export type SourceKind = 'testimony'|'tally'|'huginn'|'muninn'|'registry'|'clerkRegister'|'confession';

// ---- Evidence: what gets rendered ----
export interface Field {
  id: FieldId; item: 'body'|'weapon'|SourceKind; perceive: Perception;
  obs?: { key: ObsKey; value: Value };              // interpreted via laws
  says?: { fact: FactId; value: Value | null };     // statement; null = Muninn "forgot"
  display: { msg?: string; params?: Record<string, Value>; runes?: string; hotspot?: string };
}
export interface Evidence { fields: readonly Field[]; look: AppearanceGenome; persona: string }

export interface Lie {
  field: FieldId; source: 'testimony'|'tally'; fact: FactId; claimed: Value; truth: Value;
  motive: 'wantsValhalla'|'avoidHel'|'hideFaith'|'evadeRegistry'|'mistaken'|'mischief';
  tell?: 'elderRune'|'mirroredRune'|'brokenFormula';    // required iff source === 'tally'
  onQuestion: 'confess'|'excuse'|'insist'|'deflect';    // fixed at generation, so the validator knows the reveals
  reveals: readonly FactId[];
}

export interface CaseSpec {          // output of the generator AND of compiled scripted cases
  id: string; pack: PackId; origin: 'procedural'|'scripted'; procIndex?: number; archetype?: string; character?: string;
  truth: Truth; lies: readonly Lie[]; evidence: Evidence;
  expect: { dest: Destination; procedures: readonly Procedure['id'][]; rule: string }
        | { dilemma: { acceptable: readonly Destination[]; why: string } };
  onStamp?: Partial<Record<Destination | '*', readonly Effect[]>>;
  meta?: { seed: string; attempts: number; proof: readonly FieldId[]; proofCostS: number; difficulty: number }; // stripped in prod
}

export interface Knobs {
  lieRate: number; maxLies: 0|1|2|3; forgeryRate: number; decoyRate: number;
  redundancy: 1|2|3;                 // hard channels per decisive fact
  salienceFloor: 1|2|3; dropout: number;                 // Muninn blanks, never on a sole channel
  proofCostS: readonly [number, number];                 // band for the minimal-proof cost, in sun-seconds
  maxTools: number; maxDocs: number;                     // phone density cap
  vigilance: number;                                     // rate of rare critical cases (alive, Loki, outlaw)
}
export interface DaySpec {
  day: Day; pack: PackId; sunS: number;
  decree: { msg: string; addRules: string[]; removeRules: string[]; stamps: Destination[]; tools: ToolId[];
            laws: string[]; procedures: string[] };
  params?: Record<string, { pool: string } | Pred>;      // freyjaWhim etc.
  queue: {
    procedural: { count: readonly [number, number]; archetypes: { id: string; w: number }[];
                  mix: Partial<Record<Destination, readonly [number, number]>>; knobs: Knobs; teachFirst?: string };
    scripted: { case: string; at: number | readonly [number, number]; if?: Pred }[];
  };
  scenes?: { morning?: string; night?: string }; letters?: string[];
  economy: { wage: number; docBonus: number; warnings: number; fines: readonly number[]; costs: Record<string, number> };
  budget?: { words: number };
}

// ---- Runtime (engine-owned, JSON-serializable, never reads a clock) ----
export type Phase = 'morning'|'shift'|'audit'|'night'|'scene'|'ragnarok'|'ending';
export interface CaseRuntime {
  caseId: string; arrivedAt: number; view: 'front'|'back'; seen: FieldId[]; tools: ToolId[];
  penaltyMs: number; flagged: string[]; questioned: string[]; trimmed: boolean; stamp?: Destination;
}
export interface GameState {
  v: 1; mode: 'campaign'|'daily'|'endless'; seed: string; genVersion: number;
  day: Day; phase: Phase; scene?: { knot: string; choices: number[] };
  clock: { sunMs: number; shiftStart: number; pausedMs: number; penaltyMs: number; story: boolean; speed: number };
  queue: string[]; cursor: number; cur?: CaseRuntime;
  rings: number; debtNights: number; standing: Record<Faction, number>;
  einherjar: { worthy: number; unworthy: number }; plot: { naglfar: number; lokiDeals: number; foiled: boolean };
  family: Record<string, { warmth: number; fed: number; health: number; status: 'ok'|'sick'|'gone' }>;
  upgrades: string[]; flags: Record<string, Value>; history: JudgmentRecord[]; recentTemplates: string[];
}
export type Action =
  | { t: 'newRun'; seed: string; mode: GameState['mode']; opts: RunOptions }
  | { t: 'beginShift'|'flip'|'trim'|'send'|'pause'|'resume'|'dusk'; at: number }
  | { t: 'reveal'; field: FieldId; at: number } | { t: 'tool'; tool: ToolId; target?: FieldId; at: number }
  | { t: 'compare'; a: FieldId; b: FieldId; at: number } | { t: 'question'; contradiction: string; at: number }
  | { t: 'stamp'; dest: Destination; at: number }
  | { t: 'choose'; index: number } | { t: 'buy'; item: string } | { t: 'endNight' } | { t: 'replayDay'; day: Day };
export declare function step(s: GameState, a: Action, c: Content): { state: GameState; events: GameEvent[] };
```

---

## 3. Case generation and fairness (the core system)

### 3.1 Model: four layers
- **The chain:** Truth T (facts) → render → Evidence E (fields) → player knowledge K(d) → solve → judgment (destination + procedures).
  - K(d) = the laws taught by day d, presumptions, the trust ladder, and what can be perceived with day d's tools.
- **Trust ladder:**
  - **4:** a physical sign read through a taught law; raven statements (Muninn may leave a blank, but ravens are never false); confessions.
  - **3:** the saga tally. It drops to 0 if any forgery sign is visible.
  - **2:** testimony.
  - **1:** presumption.
  - **0:** unknown.
- **Loki cases need no special handling.** T is the disguise persona's facts plus `loki=true`. Everything renders consistently with the persona except the lips, which a law covers. There's no "physical evidence can lie" exception.
- **Upgrades change speed only, never what can be perceived.** The validator always uses day d's baseline tools.
- **Cue, then confirm.** Tool-only facts (alive, forgery) get a tool-free *cue*: breath-fog, Huginn's "still twitching", a stick that looks off. Players confirm with the tool when cued, so nobody has to feather every soul.
  - False cues appear on normal cases at `decoyRate`, so the tool stays necessary.

### 3.2 Fairness contract (the validator checks every case)
- **F1 Soundness.** Every non-lie field agrees with T under ALL laws, including ones not yet taught, so the world stays consistent across days.
- **F2 No false alarms.** Every conflict among perceivable fields includes a lie or a forged field.
- **F3 Determinacy.** `solve(E,d)` reaches a definite judgment, equal to the expected destination and procedures.
- **F4 Exposure.** Every lie that changes the outcome is part of at least one detectable contradiction. F3 implies this, but it's checked separately so failures are easier to diagnose.
- **F5 Forgery detectability.** Every forged tally carries at least one sign that's visible on day d.
- **F6 Presumption safety.** If a decisive fact differs from its presumption, there is positive evidence at trust 3 or higher (or a confession).
  - **F6b:** if every way to see that fact needs a tool, there must also be a tool-free cue at or above the visibility floor.
- **F7 Effort.** Minimal-proof cost is within `proofCostS`. Tools ≤ `maxTools`. Every proof field has salience ≥ `salienceFloor`. Documents ≤ `maxDocs`.
- **F8 Content rules.**
  - Ages are limited to 18–85, so no children can appear.
  - A blocklist of banned combinations applies.
  - Names are unique within a day.
  - Symbols appropriated by extremists (valknut, serifed Othala, Algiz as "life rune", doubled Sowilo, Tyr rune, Wolfsangel, black sun) are banned from branding and UI art; runes stay allowed in in-world inscriptions.

### 3.3 Solver (from the player's point of view; three-valued; sound but conservative)
```ts
function solve(ev: Evidence, ctx: DayCtx): SolveResult {
  const P = ev.fields.filter(f => perceivable(f, ctx));      // tools(d), view, not occluded
  const B = initBeliefs(ctx.facts);                          // presumption @1, else full domain @0; each entry keeps a support set
  const tallyTrust = P.some(isPerceivableTell) ? 0 : 3;
  for (const f of P.filter(f => trustOf(f, tallyTrust) >= 3))
    narrow(B, constraintsOf(f, ctx.laws), trustOf(f), [f.id]);   // empty intersection => F2 violation
  propagate(B, ctx.factLaws);                                // fixpoint; support = union of field ids
  const cx: Contradiction[] = [];
  for (const s of P.filter(isTestimony)) {
    const b = B[s.says!.fact];
    if (b.level >= 3 && !b.values.has(s.says!.value)) cx.push({ lie: s.id, against: b.support, fact: s.says!.fact });
    else if (b.level <= 1) setSoft(B, s, 2);                 // testimony-vs-testimony clash => both dropped + internal contradiction
  }
  for (const c of cx) for (const r of revealsOf(c, ev)) narrow(B, r, 4, [`q:${c.lie}`]);  // planned confessions only
  propagate(B, ctx.factLaws);
  return { judgment: judge3(ctx.rules, ctx.procedures, B, ctx.params), contradictions: cx, beliefs: B };
}
// Kleene 3-valued logic: is -> T if values=={v}, F if v∉values, else U. all/any/not per Kleene.
function judge3(rules, procs, B, params) {
  for (const r of rules) {                                   // sorted by order, filtered by since/until
    const v = eval3(r.when, B, params);
    if (v === T) return { dest: r.then, rule: r.id, procedures: procs.filter(p => must(eval3(p.when, B))) };
    if (v === U) return { undetermined: r.id, blocking: unknownFacts(r.when, B) };
  }
  throw new Error('rulebook not total');                     // lint guarantees the last rule is {always:true}
}
function minimalProof(ev, ctx, expected): FieldId[] {        // 1-minimal: dropping any single field breaks it
  let keep = perceivableIds(ev, ctx);
  for (const id of byCostDesc(keep)) { const t = keep.filter(x => x !== id);
    if (same(solve(restrict(ev, t), ctx).judgment, expected)) keep = t; }
  return keep;
}
```
The minimal proof feeds four things:
- **Difficulty** (it's the effort measure).
- **Timer tuning.**
- **The bot's checklist.**
- **The in-game citation:** "Rule 4 applied; you did not inspect: skin (fever-flush)." This makes the fairness something players can *feel*.

### 3.4 Lie and contradiction model
- **A lie** is a statement field whose value differs from the truth. It comes from testimony (any fact) or a forged tally, which must carry a forgery sign.
- **Conflict detection:** each fact keeps a list of constraints with where they came from. Two constraints that allow no common value form a conflict set S1 ∪ S2.
- **Kinds of contradiction:**
  - **Direct:** the same fact.
  - **Inferential:** through a law, e.g. "died in battle" vs {no front wounds, no back wounds}.
  - **Identity:** the face vs. the registry portrait of the claimed name, or the owner inscription vs. the name.
  - **Internal:** two testimony lines disagree.
  - **Forged support:** lying testimony and a forged tally agree, and both contradict physical evidence.
- **"Detectable on day d"** means every field involved can be perceived with that day's tools, and every law involved has been taught.
- **Compare(a, b) at runtime** is valid when there's a conflict (S1, S2) with a in S1 and b in S2, **and** the player has seen everything in S1 ∪ S2 (`cur.seen`).
  - Invalid: "the ravens see no conflict", costing 10 sun-seconds.
  - Valid: creates a contradiction chip and earns the documentation bonus.
- **Decoys:**
  - Irrelevant oddities (old scars, mud, charms) have no law attached, so they can never create a conflict.
  - Irrelevant but detectable lies waste time without changing the outcome. They're good streamer comedy.

### 3.5 Question responses (template-based, deterministic)
1. Map the contradiction c to the lying field λ. For internal conflicts, use the planned lie.
2. `kind = λ.onQuestion`. The planner forces `confess` when F3 needs the reveal; otherwise it picks from a persona × motive weight table.
3. Pick a template:
   - Filter `QuestionTemplate.on` by fact, claimed value, truth, persona and kind (wildcards allowed).
   - Keep the most specific matches.
   - Make a weighted pick with `rng = hash(caseSeed,'q',c.id)`, excluding `state.recentTemplates` (the last 20).
   - Fall back to a generic template for that kind. The coverage lint guarantees one exists for every lie the generator can produce.
4. Fill ICU parameters (`{name}`, `{trueCause}`, `{lord}`, gender `select`) and render one to three lines.
5. Apply the effect:
   - `confess`: adds a confession field (trust 4) with its reveals, which can then be used in Compare.
   - `insist` (a truthful spirit against a forged tally): highlights the forgery sign, and the tally's trust drops to 0.
   - `excuse`: retracts the claim, no reveal.
   - `deflect` (Loki): no reveal, but a telltale line.
   - Every Question costs 20 sun-seconds.
- **Testimony uses the same machinery at generation time.** Each persona has a speech plan: opener, identity, death, deeds, faith, closer. Each slot picks a template whose `asserts` matches the planned statement (true or a lie), so every line carries a claim that Compare can use.

### 3.6 Generator algorithm
**`generateDay(runSeed, spec, state)`**
1. Pick n from `count`.
2. Build a **destination bag** from `mix` (like Tetris's 7-bag) and shuffle it by seed. Slot 0 targets the `teachFirst` rule.
3. Insert scripted cases whose `if` holds. Procedural slots keep their own `procIndex`, so moving a scripted case never shifts procedural seeds.
4. Run `generateCase` for each slot.
5. Day-level checks:
   - The destination mix is within bounds.
   - No more than 3 of the same destination in a row.
   - No character type makes up more than 40% of the day.
   - Names are unique (re-roll only the cosmetic stream).
   - Σ(expected time for a competent player) ÷ sunS is between 0.8 and 1.05.
   - Fix problems by swapping slots, at most 5 swaps. If that fails, log `DAY_SOFT_FAIL` and accept.

**`generateCase`**
```ts
const TIERS = [ {id:'strict',n:24}, {id:'widenBand',n:12}, {id:'anyArchetype',n:12}, {id:'retarget',n:8} ];
for (const tier of TIERS) for (let a = 0; a < tier.n; a++) {
  const rng = streams(`${genVersion}|${runSeed}|${day}|${procIndex}|${tier.id}|${a}`); // .arch .truth .lies .plan .look .dialog
  const arch = pickArchetype(ctx, slot.target, tier, rng.arch);   // precomputed archetype×day→dest table
  const T = sampleTruth(arch, ctx, rng.truth);            if (!T.ok) { rej('TRUTH_UNSAT', T.why); continue; }
  const J = judge(ctx.rules, T.value, ctx.params);        if (J.dest !== slot.target && tier.id !== 'retarget') { rej('DEST_MISMATCH'); continue; }
  const L = pickLies(arch, T.value, J, ctx.knobs, rng.lies);
  const plan = planEvidence(T.value, L, J, ctx, rng.plan); if (!plan.ok) { rej('NO_CHANNEL', plan.fact); continue; }
  const E = render(T.value, L, plan.value, ctx, rng.look, rng.dialog);
  const v = validate(E, T.value, L, J, ctx);               if (!v.ok) { rej(v.code, v.detail); continue; }   // F1–F8
  return accept(E, v.metrics);
}
return fallbackPool(ctx.day, slot.target, runSeed);        // curated, pre-validated; logged as a FALLBACK
```
- **`planEvidence`:**
  - Needed facts = decisive(T) ∪ the facts of each lie, where decisive(T) = {f | ∃v≠T[f]: judge(T[f:=v]) ≠ J}.
  - For each needed fact, pick `redundancy` channels available by day d, at least one at trust 3 or higher, weighted by the day's subtlety preference.
  - Add cues (F6b).
  - Muninn leaves blanks only on channels that aren't the only source for a needed fact.
  - Compose documents within `maxDocs`: a tally only if needed or on a random roll; a weapon only if grip isn't `none`.
  - Add decoys at `decoyRate`.
- **Separate random streams:**
  - Cosmetic changes (a new beard sprite) touch only `look`, so gameplay and Dailies stay stable. This is checked by metamorphic tests.
  - The whole case is a pure function of (seed, day, procIndex).
- **Budget per day:** at most 400 attempts. Target: under 5 ms per case in Node, 99th percentile.

### 3.7 Difficulty knobs and score
- **Knobs:** the `Knobs` fields, plus:
  - rule depth (the firing rule's position)
  - vigilance load (how many always-check items the rules imply)
  - how similar registry decoys look (distance in noticeable face traits)
  - how subtle forgery signs are
- **Score:** `difficulty = proofCostS + 8·questionsNeeded + 5·ruleDepth + 6·subtleProofFields + 4·distinctTools + 3·lies`. The weights start as guesses. Refit them from the public Daily alpha's telemetry (solve time and error rate as functions of these features).
- **By mode:**
  - Campaign: ramps through the DaySpecs.
  - Daily: a fixed "medium" band.
  - Endless: ramps with souls judged.

### 3.8 Logging and CI thresholds
- **GenLog per case:**
  - Identity: `{seed, day, procIndex, target}`.
  - Attempts: `attempts[]` of `{tier, a, archetype, code, detail}`.
    - Rejection codes: TRUTH_UNSAT, DEST_MISMATCH, NO_CHANNEL, UNDETERMINED(rule, blockingFacts), WRONG_DEST(via lie), FALSE_ALARM(fields), FORGERY_UNDETECTABLE, CUE_MISSING, EFFORT_BAND(cost), SALIENCE_FLOOR(field), DAY_CONSTRAINT.
  - On acceptance: `{archetype, dest, rule, decisiveFacts, lies, contradictions, proof, proofCostS, difficulty, ms}`.
  - Production builds keep counters only; full logs go to dev and CI.
- **Sweep report thresholds (CI fails if breached):**
  - Acceptance per (day, character type) ≥ 30%.
  - Mean attempts ≤ 3, 99th percentile ≤ 15.
  - Fallback rate ≤ 0.05%.
  - Generation time under 5 ms per case, 99th percentile.
  - Destination mix within spec on ≥ 99% of days.
  - The bot that checks everything scores exactly 100%.
  - The bot that believes testimony scores ≤ 65%, which proves the evidence matters.

### 3.9 Scripted cases and dilemmas
- Scripted cases compile to CaseSpec. Unspecified facts are sampled from the character's archetype with the case's own seed.
- They go through the same `validate`.
- **Branching:** if a case branches on flags (`if`), validate every combination of the flags it references.
- **Dilemmas** (`dilemma:`):
  - F1, F2 and F5 must still hold.
  - F3 becomes "result ∈ acceptable, or undetermined by design".
  - Citations are off, and the choice sets story flags.
- **Moral choices are explicit, never disguised as mistakes.** Example: Loki's "skip the trim" is a scene choice or deal action. An accidental mistake never advances the conspiracy.

### 3.10 What the validator can't prove, and the mitigations
The validator proves a case can be *deduced*, not that a human can *see* the evidence. Mitigations:
- Perception classes (salience, zoom, occlusion) are gameplay data, and the art has to meet them.
- Citations show the proof, so every mistake comes with an explanation.
- A "Report this soul" button exports the seed and the case.
- Opt-in alpha telemetry records error rates per rule and per sign.
- A weekly Case Lab review of 20 random cases per DaySpec.

---

## 4. Day loop, state machine, timer and scoring

```
Title -> newRun -> MORNING(d): decree scroll, rulebook diff (NEW/REPEALED badges), Ink morning scene
  -> beginShift -> SHIFT(d): [arrive -> reveal/flip/tool* -> compare/question/trim* -> stamp -> send]*
        ends on queue empty | dusk (the current soul may finish, grace <= 60 s)
  -> AUDIT(d): pay, citations/fines, standings, einherjar, plot; game-over table -> ENDING(early)
  -> NIGHT(d): letters/scenes (Ink), family upkeep, shop (speed-only upgrades), explicit plot choices
  -> endNight -> SNAPSHOT(d+1) -> MORNING(d+1)
Day 20: MORNING -> LAST SHIFT (surge queue) -> RAGNAROK (computed battle report scene) -> ENDING
replayDay(k): restore snapshot k (confirm: discards later days), as in Papers, Please
```

**Timer**
- Sun time = real time during SHIFT plus penalties: flip 2 s, feather 10 s, rune-lens 8 s, question 20 s, invalid compare 10 s.
- `elapsed = at − shiftStart − pausedMs + penaltyMs`. Actions carry `at` in integer ms from the UI's `performance.now()` offset. The UI dispatches `dusk`; the engine verifies it.
- The timer pauses on `visibilitychange`, blur or app pause. The desk blurs while paused, so pausing can't be used to think for free.
- Story Mode never reaches dusk. Assist sets sun speed from 0.5× to 2×; Daily results are then flagged "assisted".
- Starting curve (bot-tuned):
  - Day 1: 6 souls in 6 min.
  - Day 10: 12 in 9 min.
  - Day 19: 16 in 11 min.

**Scoring and economy** (defaults; bot-tuned)
- **Correct** means the destination and procedures are both right. It pays `wage` (5 rising to 8), plus `docBonus` +1 if you flagged a liar's contradiction before stamping.
- **Wrong:**
  - An immediate "Muninn's citation" slip.
  - The first 2 per day are warnings, then fines escalate [5, 10, 15].
  - A table of (expected, stamped) pairs sets standing changes. Example: sending Freyja's claim to Valhalla gives Freyja −2 and Odin +1.
- **Einherjar:** every VALHALLA stamp adds to worthy or unworthy. Unworthy einherjar flee at Ragnarök.
- **Night:**
  - Costs: hearth, food per person, medicine per sick member.
  - Nights in debt wear down family health.
  - Two nights in a row below −30 → the *Demoted* ending.
- **Draupnir** drips eight rings every ninth night (Snorri), so there's a bonus on nights 9 and 18.
- **Game-overs and endings** live in `endings.yaml` as ordered conditions on GameState, using the same predicate engine.
  - Checked at every audit for early endings: fired, demoted, transferred to the clerk, family leaves.
  - Checked again after Ragnarök. Strength = worthy − 0.5·unworthy + Freyja's host + Hel's legion − Naglfar progress, and ranges of strength map to endings.

**Modes**
- **Daily:**
  - A synthetic DaySpec from the daily pack: 8 souls, 6 min of sun, a "twist decree", no story.
  - The puzzle number comes from the **local** calendar date, as Wordle does; the UI passes it to the engine.
  - Share text: `Chooser of the Slain - Daily #97 (g2) / Decree: Freyja wants the left-handed / [+][+][x][+][+][+][+][+] 7/8, dusk +1:42 / <url>`. It shows correctness only and **never destination icons**, which would spoil the answers.
  - During the alpha, Dailies use Day 1–6 mechanics only. Loki and the clerk unlock in Dailies at launch.
- **Endless:** adds a new rule from the library every 5 souls; 3 citations ends the run; the seed is shareable.
- **Suggested full-game extra:** a Daily archive. The web demo offers only today's Daily.

---

## 5. Content pipeline and authoring

### 5.1 Stages (`packages/content-compiler`)
1. Load YAML with `yaml` 2.x:
   - YAML 1.2 core schema, so `NO` stays a string (matters in a Norse game).
   - `uniqueKeys` on.
   - A `LineCounter`, so errors point to file:line.
2. Parse each file with its zod schema.
3. Resolve references and build indices.
4. Run the lints (§10).
5. Precompute:
   - archetype × day → destination tables (about 300 sampled truths per pair)
   - rule summaries and rulebook pages
   - fallback pools
6. Compile Ink per scene with `inkjs/compiler`, then validate tags and externals.
7. Validate ICU strings with intl-messageformat and build a pseudo-localized variant.
8. Emit per target: `generated/<target>/{manifest.json, core.json, daily.json, days/day-NN.json, ink/*.json, strings/<pack>.en.json}`, plus `generated/types.ts` and `generated/leak/<pack>.tokens.json`.
9. `content:watch` recompiles the changed pack. Vite HMR invalidates `virtual:content`, so the Case Lab and the game hot-reload.

### 5.2 YAML examples (unlock days match build-plan §2)

> These sketches predate the implementation. The real files live in `content/packs/*`, and §13 lists where M1 differs (for example, `alive` is its own fact and there's no `cause: none`).

```yaml
# content/packs/core/facts.yaml
- { id: cause, domain: { enum: [battle, sickness, oldAge, drowned, accident, none] }, since: 1, inert: battle }
- { id: grip,  domain: { enum: [ownWeapon, borrowedWeapon, none] }, since: 1, inert: ownWeapon }
- { id: alive, domain: { bool: true }, since: 3, inert: false, presumption: false }   # Customs 1: "the fallen are dead"
- { id: faith, domain: { enum: [old, primeSigned, baptized] }, since: 10, inert: old }
- { id: loki,  domain: { bool: true }, since: 12, inert: false, presumption: false }
- id: fled
  domain: { bool: true }
  derived: { all: [ { fact: woundsBack, gte: 1 }, { fact: woundsFront, lte: 0 } ] }
- { id: age, domain: { int: [18, 85] }, since: 1, inert: 30 }                         # no children among the dead

# content/packs/core/laws.yaml
- { id: law.fever, since: 1, if: { obs: skin, is: feverFlush }, then: { fact: cause, in: [sickness] }, text: law.fever }
- id: law.unwounded                  # taught with Flip on day 2 (needs the back view)
  since: 2
  if: { all: [ { obs: woundsFront, is: 0 }, { obs: woundsBack, is: 0 } ] }
  then: { fact: cause, in: [sickness, oldAge, drowned, accident] }
  text: law.unwounded
- { id: law.breath, since: 3,  if: { obs: feather, is: stirs }, then: { fact: alive, in: [true] }, text: law.breath }
- { id: law.pendants, since: 10, if: { obs: pendant, is: hammerAndCross }, then: { fact: faith, in: [primeSigned] }, text: law.pendants }
- { id: law.lips,   since: 12, if: { obs: lips, is: stitchScars }, then: { fact: loki, in: [true] }, text: law.lips }

# content/packs/core/predicates.yaml   (day-versioned, so the rulebook diff shows the change)
- id: pred.worthy
  versions:
    - { since: 1, is: { all: [ { fact: cause, is: battle }, { fact: grip, in: [ownWeapon, borrowedWeapon] } ] } }
    - { since: 2, is: { all: [ { fact: cause, is: battle }, { fact: grip, in: [ownWeapon, borrowedWeapon] }, { fact: fled, is: false } ] } }
    - { since: 7, is: { all: [ { fact: cause, is: battle }, { fact: grip, is: ownWeapon }, { fact: fled, is: false } ] } }

# content/packs/core/rules.yaml   (first TRUE wins, by order)
- { id: rule.return,    order: 100, since: 3,  when: { fact: alive, is: true }, then: RETURN, decree: decree.return }
- { id: rule.detain,    order: 200, since: 12, when: { fact: loki, is: true }, then: DETAIN, decree: decree.detain }
- { id: rule.transfer,  order: 300, since: 10, when: { fact: faith, is: baptized }, then: TRANSFER, decree: decree.transfer }
- { id: rule.ran,       order: 500, since: 5,  when: { fact: cause, is: drowned }, then: RAN, decree: decree.ran }
- { id: rule.folkvangr, order: 600, since: 4,  when: { all: [ { ref: pred.worthy }, { param: freyjaWhim } ] }, then: FOLKVANGR, decree: decree.freyja }
- { id: rule.valhalla,  order: 700, since: 1,  when: { ref: pred.worthy }, then: VALHALLA, decree: decree.valhalla }
- { id: rule.hel,       order: 999, since: 1,  when: { always: true }, then: HEL, decree: decree.hel }
- { id: proc.trimNails, kind: procedure, since: 8, when: { fact: nails, is: untrimmed } }

# content/packs/core/archetypes/straw-braggart.yaml
id: arch.straw_braggart
since: 1
personas: [braggart, veteran]
truth: { cause: { in: [sickness, oldAge] }, age: { gte: 45 }, grip: { in: [ownWeapon, none] } }
motive: wantsValhalla
lies:
  - { fact: cause, claim: battle, p: 0.85, onQuestion: { confess: 3, excuse: 1 }, reveals: [cause] }
weight: 3

# content/packs/demo/days/day-03.yaml
day: 3
pack: demo
sunS: 420
decree: { msg: decree.d3, addRules: [rule.return], stamps: [RETURN], tools: [feather], laws: [law.breath], procedures: [] }
queue:
  procedural:
    count: [7, 9]
    teachFirst: rule.return
    archetypes: [ { id: arch.honest_warrior, w: 4 }, { id: arch.straw_braggart, w: 3 }, { id: arch.fled_coward, w: 2 }, { id: arch.not_quite_dead, w: 1 } ]
    mix: { VALHALLA: [0.3, 0.5], HEL: [0.3, 0.5], RETURN: [0.1, 0.2] }
    knobs: { lieRate: 0.3, maxLies: 1, forgeryRate: 0, decoyRate: 0.1, redundancy: 2, salienceFloor: 2,
             dropout: 0, proofCostS: [8, 35], maxTools: 1, maxDocs: 3, vigilance: 0.1 }
  scripted: [ { case: case.thorvald.d3, at: [3, 5] } ]
scenes: { morning: d3_morning, night: d3_night }
letters: [letter.d3.mother]
economy: { wage: 5, docBonus: 1, warnings: 2, fines: [5, 10, 15], costs: { hearth: 6, food: 4, medicine: 10 } }
budget: { words: 1400 }

# content/packs/demo/cases/thorvald-d3.yaml
id: case.thorvald.d3
pack: demo
character: thorvald
truth: { alive: true, cause: none, grip: ownWeapon, woundsFront: 2, woundsBack: 0, nails: trimmed }
look: { ref: look.thorvald }                  # fixed genome, so he is recognizable
testimony:
  - { msg: case.thorvald.d3.l1, says: { fact: name, value: Thorvald } }   # "Thorvald Ketilsson. Again. Is this Valhalla?"
  - { msg: case.thorvald.d3.l2, says: { fact: cause, value: battle } }    # "Axe to the ribs, holding the ford."
lies: [ { field: testimony.2, source: testimony, fact: cause, claimed: battle, truth: none, motive: mistaken, onQuestion: excuse, reveals: [] } ]
cues: [ { fact: alive, obs: breathFog, is: faint } ]
expect: { dest: RETURN, procedures: [], rule: rule.return }
onStamp:
  RETURN: [ { flag: thorvald_returned, inc: 1 } ]
  '*':    [ { flag: thorvald_misfiled, set: true } ]

# content/packs/core/templates/testimony-death.yaml
- id: tm.death.battle.shieldwall
  slot: death
  asserts: { fact: cause, value: $stated }      # the planned statement (truth or lie)
  requires: { stated: battle }
  personas: [braggart, veteran]
  msg: tm.death.battle.shieldwall                # "I held the shield wall at {place} until {foe} split it. And me."
  params: { place: pool.battlefields, foe: pool.foes }
  weight: 3

# content/packs/core/templates/question.yaml
- id: q.cause.battle_vs_sick.confess.braggart
  on: { fact: cause, claimed: battle, truth: [sickness, oldAge], persona: [braggart], kind: confess }
  msgs: [q.cause.braggart.confess.1, q.cause.braggart.confess.2]   # "...Fine. The coughing sickness." / "But I was PLANNING a glorious death. Next spring."
  weight: 2
- { id: q.any.excuse, on: { fact: '*', kind: excuse }, msgs: [q.any.excuse.1], weight: 1 }   # coverage fallback
```

### 5.3 Rulebook rendered from data
- **Order of Judgment:** rules sorted by `order`, with NEW and REPEALED badges.
  - The clerk's summary is **generated from the rule structure** through a phrase table (`phr.cause.is.battle: "fell in battle"`), and it's the authoritative text. Odin's decree is flavor only.
- **Other pages:** Signs = laws. Customs = presumptions plus the trust ladder ("The ravens do not lie. The dead often do."). Heraldry = pattern + emblem + color. Registry. Futhark table.
- **Lints:**
  - Predicates at most 2 levels deep and at most 3 clauses per rule, so the text stays readable.
  - The last rule must match everything.
  - No rule may be fully shadowed (checked by enumerating the relevant fact domains).

### 5.4 Ink integration (per-scene, stateless, pure)
- **One compiled JSON per scene file, per pack.** Nothing about Ink persists across scenes; memory across days lives in engine `flags`.
  - This avoids Ink save-compatibility problems and makes demo saves importable into the full game.
- **Externals** are read-only views of the state at scene start, bound with lookaheadSafe=true.
- **Side effects** come from tags: `# fx: standing freyja +1`, `# fx: flag owes_loki`, `# fx: rings -5`, `# portrait: skogul/annoyed`. The engine applies them **once, at scene end**.
- **Choices** are logged as `{t:'choose', index}`. To render or replay, the engine re-runs the scene from its start, which is cheap for short scenes.
```ts
export function playScene(json: object, knot: string, env: SceneEnv, choices: readonly number[]): SceneFrame {
  const story = new Story(json);
  story.state.storySeed = env.seed;                               // hash(runSeed, day, knot) -> deterministic RANDOM/shuffles
  story.BindExternalFunction('flag', (k: string) => env.flags[k] ?? 0, true);
  story.BindExternalFunction('standing', (f: string) => env.standing[f] ?? 0, true);
  story.BindExternalFunction('rings', () => env.rings, true);
  story.ChoosePathString(knot);
  const lines: SceneLine[] = [], effects: Effect[] = []; let i = 0;
  for (;;) {
    while (story.canContinue) { const text = story.Continue()!, tags = story.currentTags ?? [];
      lines.push({ text, tags }); effects.push(...parseFx(tags)); }
    if (!story.currentChoices.length) return { lines, effects, done: true };
    if (i === choices.length) return { lines, effects, choices: story.currentChoices.map(c => c.text), done: false };
    story.ChooseChoiceIndex(choices[i++]);
  }
}
```
- **Ink lint:** every `EXTERNAL` has a binding, every `fx` tag parses, every knot a DaySpec references exists, and a random-walk test reaches every knot.
- **Localization:** English only at 1.0, authored inline in Ink. Later, translate with one Ink file per language.

---

## 6. UI architecture

### 6.1 Wiring
- `game = signal<GameState>`. `dispatch(a)` runs `step`, sets `game.value`, and pushes events to an animation and audio bus.
- Selectors are `computed(...)`.
- UI-only signals: desk positions (saved per layout), the compare selection, open panels and the loupe.
- The engine runs on the main thread; generating a day takes under 30 ms. Case Lab sweeps run in a Web Worker.

### 6.2 Components
- **app:** App, ScreenRouter (state-driven, no URL routing), Providers (Content, Platform, Settings, Layout, Input, I18n).
- **screens:** Title, ModeSelect, DailyIntro, DailyResult, CampaignMap (replay any day), Morning (DecreeScroll + RulebookDiff + InkScene), Shift, Audit, Night (Family, Shop, Letters), Ending, Settings, Credits, Lab (dev only).
- **shift:** SunClock, QueueStrip, SoulArrival, WritOfPassage (the stamp target), StampRack/StampSheet, ToolTray (Flip, Feather, RuneLens, Clippers, Loupe), CompareBar, QuestionDialog, CitationSlip, ClueLedger (chips).
- **evidence:** BodyStage (HotspotLayer + Loupe), TestimonyScroll, TallyStick, RavenReport (Huginn/Muninn), WeaponCard (Inscription + RuneLens overlay), RegistryBook, ClerkRegister, Rulebook (OrderOfJudgment, Signs, Customs, Heraldry, Futhark).
- **story:** InkScene, LetterView, PortraitView.
- **layout:** Surface, DeskLayout/Paper, DrawerLayout/Tabs/BottomSheet, `useLayoutMode()`.
- **input:** commands.ts, keymap.ts, gamepad.ts, focusGraph.ts, pointer.ts.
- **Also:** a11y, i18n, audio.

### 6.3 Desk vs. Drawer from one tree
Panels are registered once. The layout decides how each one is contained:
```tsx
const SURFACES: SurfaceDef[] = [
  { id: 'body', title: 'ui.body', render: () => <BodyStage/>, desk: { x: .30, y: .06, w: .34 }, drawer: 'stage' },
  { id: 'testimony', title: 'ui.words', render: () => <TestimonyScroll/>, desk: { x: .66, y: .08, w: .28 }, drawer: 'tab' },
  { id: 'tally', title: 'ui.tally', render: () => <TallyStick/>, when: c => c.has('tally'), drawer: 'tab' },
  /* ravens, weapon, registry, rulebook ... */
];
const Layout = useLayoutMode() === 'desk' ? DeskLayout : DrawerLayout;   // <Layout surfaces={visible(SURFACES)} />
```
- **Choosing the mode:** desk if min(w, h) ≥ 600 and w/h ≥ 1.2 (covers the Deck, desktop and landscape tablets). Otherwise drawer. Settings can override.
- **Desk:**
  - Papers drag with pointer capture and a translate3d transform, throttled to animation frames.
  - Clicking brings a paper to the front; papers stay inside the viewport.
  - A "Tidy desk" button and a rulebook dock.
  - Positions are saved. Fonts are sized to stay readable through 1080p stream compression.
- **Drawer (portrait phone):**
  - A top bar with sun, rings and queue.
  - The body stage, about 45% of the height, with a flip toggle and loupe.
  - A row of clue chips.
  - A bottom sheet with tabs: Words / Tally / Ravens / Weapon / Registry / Rules.
  - An action bar: Tools, Compare, Judge.
  - Landscape phones get a side sheet instead.
- **Density limits:**
  - `maxDocs` per case, enforced by the generator.
  - At most 3 taps to any field.
  - Touch targets at least 44 px.
  - Every body sign is also a text chip. That gives accessible text, and it's how Compare works on phones.

### 6.4 Input model
All inputs map to one `Command` union: `focus(dir)`, `activate`, `back`, `flip`, `tool(id)`, `compareToggle`, `question`, `stamp(dest)`, `send`, `open(surface)`, `cycleSurface(±1)`, `zoom(Δ)`, `pause`.
- **Keyboard:**
  - Tab and arrows move focus; Enter/Space activate.
  - F flip, C compare, Q question, 1–7 stamps (once the writ is open), R rulebook.
  - `[` and `]` cycle papers; Esc goes back or pauses.
- **Gamepad** (polled each frame, with edge detection; built after M7 with some changes, §36):
  - A activate, B back, X compare, Y question.
  - LB/RB cycle panels; d-pad or stick moves focus; right stick moves the loupe.
  - Start pauses; View opens the rulebook.
- **Focus graph:** each interactive element registers `useFocusable({id, group, rect})`, and spatial navigation works within a group (groups are panels). Keyboard, gamepad, Deck Verified and screen readers all use the same graph; screen readers also get DOM order plus ARIA.
- **Pointer:**
  - Tapping a hotspot reveals it and opens the loupe.
  - Long-press (350 ms) pins a field for Compare in drawer mode.
  - Pinch or wheel zooms the loupe.
- **Stamping is two-step:** choose a stamp, the writ shows a preview, then Send by holding 300 ms on touch, pressing Enter, or pressing A. Hold-to-send can be turned off.

### 6.5 Art-agnostic body renderer
**The contract**
- **The engine owns:**
  - `AppearanceGenome`: build, skin, hair, hairColor, beard, eyes, nose, scar, helmet, tunic, heraldry.
  - The gameplay signs: grip, wounds front/back with type, nails, pendant, lips, skin signs, colors.
  - Their **perception classes**: salience, zoom, view, occlusion.
- **Art owns:** drawing them, hotspot shapes, and a *conformance* declaration.
- **Swapping art never changes generation or Dailies.** Salience and occlusion are gameplay data, and the art must meet them.
```ts
interface BodyArtProvider {
  id: string; manifest: ArtManifest;
  layers(look: AppearanceGenome, obs: BodyObs, view: 'front'|'back'|'portrait'): LayerDraw[];
}
type LayerDraw = { kind: 'svg'; markup: string; z: number }
               | { kind: 'sprite'; atlas: string; frame: string; palette?: PaletteSwap; z: number; at?: [number, number] };
// manifest.json (both providers): frame {w,h,scaleMode:'integer'|'smooth'}; views.front|back.layers[{slot,z,palette:['skin','hair','lordA','lordB']}];
// anchors {neck:[.5,.23], handR:[.18,.55], lips:[.5,.14], w1..w6:[...]}; hotspots {lips:{poly,zoom:3}, nailsR, pendant, chest, skin, colors, grip};
// conformance {"lips.stitchScars": 1, "skin.feverFlush": 2, ...}   // must be >= the required gameplay salience
```
**Providers**
- **Placeholder:** procedural SVG generated from the genome.
  - Heraldry is pattern (stripes, chevron, checky) + emblem + color.
  - Wounds are shape-coded: slash = blade, dot = arrow, star = crush.
  - Signs get icon badges plus texture (fever = stipple, foam = bubbles).
  - Pendants have distinct silhouettes.
- **Pixel art option:** indexed PNG layers recolored at runtime through a lookup table (OffscreenCanvas, cached as an ImageBitmap per layer and palette), scaled in whole-pixel steps (`image-rendering: pixelated`, letterboxed).
- **Portraits** for the registry and letters use the same provider in `portrait` view.
- **Registry decoys** differ from the real face in 1–2 noticeable traits (a knob).

**Contract tests (CI)**
- Every provider covers every trait × sign × view.
- Every required hotspot ID exists.
- Conformance meets the required salience.
- Occluding variants match the gameplay `occludedBy` data.
- A **Body Lab** page renders the full grid of variants for visual checks.

### 6.6 Accessibility, text and fonts
- **Text scale** from 0.85 to 1.75 (rem-based, layouts reflow).
- **Reduced motion:** follow `prefers-reduced-motion`, plus a settings toggle.
- **Story Mode and Assist:** auto-transliterate runes, highlight hotspots, adjust sun speed.
- **Never color alone:** heraldry, wound glyphs and stamp icons all have text labels.
- **Captions** for audio cues ("Huginn arrives").
- **Screen readers:** a live region for testimony, and labeled hotspots.
- **Deck:** text at least 12 px at 1280×800 (Valve's floor is 9 px).
- **Fonts:**
  - Noto Sans Runic, subset to the Runic block.
  - A UI/body font covering Old Norse letters (á é í ó ú ý æ ǫ ø ð þ ö).
  - A CI glyph check compares every character in each pack's strings against each font's glyph table.
- **Pseudo-localization toggle** (+35% length) to catch overflow and hardcoded strings.

---

## 7. Persistence and replays

**Storage**
- Interface: `SaveStore { list(); read(name); write(name, data) /* atomic */; remove(name) }`.
- **Adapters:**
  - web: IndexedDB via `idb`, plus `navigator.storage.persist()`
  - Electron: IPC to real files (write to a temp file, fsync, rename)
  - Android: Capacitor Filesystem
- **Files:** `settings.json`, `daily.json` (streaks and history), `slot-1..3.sav`, `endless.json`. Keeping them separate reduces Steam Cloud conflicts.

```ts
interface SaveV1 {
  format: 'cots.save'; schema: 1;
  build: { version: string; engineMajor: number; contentHash: string; genVersion: number };
  slot: string; meta: { createdAt: string; updatedAt: string; day: number; playtimeS: number };   // UI metadata only
  run: { seed: string; mode: 'campaign'|'endless'; opts: RunOptions };
  snapshots: { day: number; state: GameState; hash: string }[];      // one per day start (about 10–30 KB each)
  current: { day: number; log: Action[]; queue: CaseSpec[] } | null; // queue MATERIALIZED -> survives generator patches
}
```
- **When saves are written:** after every `send`, at scene end and at night end. Debounced 500 ms; flushed on `pagehide` or app pause.
- **Resuming:** restore the day snapshot and replay `current.log` over the saved queue, for an exact mid-day resume even after an update. If `engineMajor` changed, show "The Norns rewound the day" and restart from the snapshot.
- **Migrations:** a `migrations[v]` chain, with fixtures of every past version in `tests/fixtures/saves/`. Validate on load with `zod/mini`. On failure, keep a `.bak` and offer an export.
- **Save codes:** base64(gzip(JSON)) export/import strings on web builds.
  - They let players move between Pages and itch, which have separate storage.
  - They also cover Safari, which deletes a site's storage after 7 days without use unless it's installed to the home screen.
- **Replay files for bug reports:**
  - Format: `{ format:'cots.replay', build:{version, commit, contentHash, target, genVersion}, start:{snapshot}|{fresh:{seed,mode,opts}}, queue, actions, checkpoints:[{i, hash}], env:{layout, viewport, settings, ua}, breadcrumbs: string[] }`.
  - The state checksum is FNV-1a over canonical JSON (sorted keys), taken every 20 actions.
  - "Report a problem" builds the file and offers copy, share or download.
  - `pnpm replay file --step` checks invariants and finds the first checkpoint that diverges. The Case Lab has a timeline scrubber.

---

## 8. Platform shells

### 8.0 Platform interface
- `Platform { kind; storage; share(text,url); achievements.unlock(id); lifecycle.onPause/onResume/onBack; window.fullscreen?/quit?; links.store; haptics? }`.
- It's resolved **at build time** through the `@platform` alias, so web bundles contain no Electron or Capacitor code.

### 8.1 Electron (Steam), from M6
```ts
// apps/electron/src/main.ts (sketch)
if (process.platform === 'linux')             // Steam Linux Runtime / Deck: known-required switches
  for (const s of ['no-sandbox','no-zygote','in-process-gpu','disable-dev-shm-usage']) app.commandLine.appendSwitch(s);
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.whenReady().then(() => {
  protocol.handle('app', req => serveDist(req));                  // CSP default-src 'self'; no remote content ever
  const steam = SteamPort.init(APP_ID);                           // steamworks-ffi-node in MAIN only; null if not launched via Steam
  ipcMain.handle('save:list', () => saves.list());
  ipcMain.handle('save:read', (_e, n) => saves.read(n));
  ipcMain.handle('save:write', (_e, n, d) => saves.writeAtomic(n, d));   // name whitelist /^[a-z0-9_-]{1,32}\.(sav|json)$/
  ipcMain.on('steam:unlock', (_e, id) => steam?.unlock(id));
  const win = new BrowserWindow({ webPreferences: { preload, contextIsolation: true, sandbox: true }, backgroundColor: '#15110d' });
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => (openIfAllowlisted(url), { action: 'deny' }));
  win.loadURL('app://game/index.html');
});
app.on('before-quit', () => steam?.shutdown());
```
- **Save folders** (built explicitly to match Auto-Cloud):
  - Windows: `%APPDATA%/ChooserOfTheSlain/saves`.
  - macOS: `~/Library/Application Support/ChooserOfTheSlain/saves`.
  - Linux: `~/.config/ChooserOfTheSlain/saves`. Hardcode `.config`; don't rely on `$XDG_CONFIG_HOME`.
- **Auto-Cloud settings:**
  - Root `WinAppDataRoaming`, subdirectory `ChooserOfTheSlain/saves`, pattern `*.sav;*.json`, all operating systems.
  - Overrides: `MacAppSupport`, and `LinuxHome` + `.config/ChooserOfTheSlain/saves`.
  - Steam syncs at launch and exit and handles conflicts itself.
- **steamworks-ffi-node:**
  - List it in `asarUnpack` (redistributables, koffi binaries, prebuilds), because the app archive breaks it.
  - Never turn on `nodeIntegration`.
  - Its Electron overlay is experimental, so don't depend on it. Achievements still unlock without the overlay; show an in-game toast.
  - Add rich presence ("Day 7 - judging the fallen").
- **Steam Deck:**
  - Ship a native Linux build, with Windows under Proton as a fallback. Test both in M6.
  - Detect the Deck with the Steamworks Utils check and default to fullscreen.
  - Gamepad API plus the focus graph, with Deck/Xbox button glyphs.
  - Desk layout at 1280×800 with text of at least 12 px.
  - Pause on suspend (blur, visibility, `powerMonitor`). No launcher.
  - Aim for Verified. If any function needs touch or the trackpad, the rating drops to "Playable".
- **Packaging:** `electron-builder --dir` for win-unpacked and linux-unpacked. Include `steam_appid.txt` only in dev.
- **Demo:** `electron-demo` is a separate app with its own appId and only the demo packs. Nice to have: the full game imports demo progress from the demo's save folder.
- **CI (`steam.yml`, tag `steam-v*`):** a Windows + Ubuntu matrix builds with electron-builder, then `game-ci/steam-deploy` uploads through SteamPipe to the `beta` branch using the `STEAM_CONFIG_VDF` secret. You promote builds to the default branch by hand.
- **macOS: deferred.** Unsigned or ad-hoc builds are fragile, notarization costs $99/year, and you'd need test hardware.

### 8.2 Capacitor (Google Play, paid), from M9
- **Version:** Capacitor ≥ 8.4. Its template targets SDK 36, which new apps have needed since 2026-08-31, with minSdk 24.
- **Edge-to-edge screens:** use the built-in SystemBars. It injects `--safe-area-inset-*` CSS variables (on API 34 and below too, since 8.4). Write `padding-top: var(--safe-area-inset-top, env(safe-area-inset-top))`.
- **Plugins:**
  - @capacitor/app: back button (close the top drawer or modal, then pause, then confirm exit); `appStateChange`/`pause` pauses the sun.
  - @capacitor/filesystem: `Directory.Data` for saves.
  - @capacitor/share: the native share sheet for the Daily.
  - @capacitor/haptics: the stamp thunk.
  - @capacitor/splash-screen.
- **Backup:** Android Auto Backup (`allowBackup` plus `dataExtractionRules` that include the saves folder) gives free restore across devices, up to 25 MB.
- **Orientation:** both. Drawer on phones, desk on tablets in landscape.
- **WebView check:** at startup, check the Chromium version (105+ is needed for container queries and `:has()`). If it's older, show an "update Android System WebView" screen.
- **Store setup:**
  - Paid app, so you need a payments profile.
  - Declare no ads and no in-app purchases.
  - Data safety: "no data collected" (the Android build has no telemetry).
  - IARC content rating.
  - If your Play account is a personal one created after 2023-11-13, you must run a closed test with at least 12 testers opted in for 14 consecutive days before production access. Recruit testers from the Daily alpha.
- **CI (`android.yml`, tag `android-v*`):** `build:android-full`, then `npx cap sync android`, then Gradle `bundleRelease` (JDK 21, keystore from secrets), then `r0adkll/upload-google-play` to the internal track. Use Play App Signing.
- Capacitor also keeps a paid iOS app possible after launch.

### 8.3 Web demo (PWA) and itch
- **PWA (`web-demo` only):**
  - vite-plugin-pwa with `registerType: 'prompt'`. Show the update prompt only on the Title or Night screens, never mid-shift.
  - Offline cache limited to demo assets; `navigateFallback: index.html`.
  - `scope` and `start_url` equal to `base`.
- **Store buttons:** "Wishlist on Steam" before launch; "Buy on Steam / Google Play" after.
- **Optional opt-in telemetry during the alpha:**
  - A Cloudflare Worker + D1 database (free tier).
  - Per-case records: rule, signs, time, correctness. No personal data.
  - It's the only way to close the gap between "deducible" and "visible".
- **itch (`web-itch`):**
  - `base: './'`, no service worker, zipped.
  - itch's limits: at most 1,000 files, 500 MB extracted, 200 MB per file, 240-character paths, with `index.html` at the root.
  - CI uploads with `butler push dist/web-itch rcjlabs/chooser-of-the-slain:html5 --userversion $V`.
  - The iframe may block `navigator.clipboard`, so fall back to a selected textarea and `execCommand('copy')`.
  - Storage is separate from Pages, so offer save codes.

### 8.4 GitHub, Pages and licensing (public repo)
1. **Decision:** the repo stays public. Anyone can build the full game from source; the demo builds still exclude the campaign.
2. **Branches:**
   - Push `main` (done).
   - In Settings, make `main` the default branch and protect it (require CI).
   - Set Pages source to "GitHub Actions".
   - Check that the `github-pages` environment allows deployments from `main`.
   - Retire the concept branch once it's merged.
3. **`deploy-web.yml`** runs on pushes to `main`: pnpm install, `build:web-demo`, `leak-check`, `upload-pages-artifact`, `deploy-pages`. A custom domain changes the `base` path; set `COTS_BASE`.
4. **License:**
   - Code: GPL-3.0-only (`LICENSE`).
   - Story text, dialogue, art, audio, and the game's name and branding: all rights reserved (`CONTENT-LICENSE.md`).
   - So forks can reuse the code but can't legally ship the campaign or art. Steam and Google Play both accept copyright takedowns.
5. **Secrets (later):** `STEAM_CONFIG_VDF`, `STEAM_USERNAME`, `BUTLER_API_KEY`, `ANDROID_KEYSTORE_B64`/`_PASS`, `PLAY_SA_JSON`. Never commit keys or keystores; the repo is public.

---

## 9. Testing strategy

| Layer | Tool | What it covers | When |
|---|---|---|---|
| Unit | Vitest | 3-valued truth tables; propagation; rune transliteration; RNG/hash checksums; ICU rendering; state transitions; scoring | every commit |
| Property | fast-check (`@fast-check/vitest`) | F1–F8 for every procedural case; determinism; order independence (`generateCase(seed,d,i)` equals the day's case i); snapshot/restore equivalence; economy invariants | PR: 200 seeds × 20 days; nightly: 10k × 20, split across 4 runners |
| Differential | testkit oracle | brute force over the (small) decisive-fact domains must equal the 3-valued solver | PR (small), nightly |
| Adversarial | fast-check | deliberately broken plans (drop the exposing channel, forged tally without a sign, occluded lips, missing cue): the validator must reject everything the oracle calls undetermined or wrong | PR |
| Metamorphic | fast-check | changing only the cosmetic `look` stream keeps the judgment and proof; field order doesn't matter; adding a decoy doesn't change the judgment | PR |
| Golden days | snapshots | 12 fixed seeds × 20 days as summary JSON (archetype, dest, rule, lies, proof, difficulty); **the next 180 days' Daily checksums** must match the `DAILY_GEN` schedule unless its version is bumped | PR |
| Content | compiler lints | the list in §10 | PR |
| Replays | replay CLI | a library of replays in `tests/replays`: exact checkpoint checksums when contentHash matches, otherwise "no crash + invariants hold" | PR |
| Saves | Vitest | fixtures v1..vN migrate, validate and resume | PR |
| E2E | Playwright 1.56.1 | screens: phone 412×915 (touch), small phone 360×740, landscape phone 844×390, tablet, desktop 1920×1080, Deck 1280×800. Flows: a Daily, Day 1, compare/question, Story Mode, 150% text, reduced motion, keyboard only, gamepad (stub `navigator.getGamepads` via `addInitScript`). Plus axe scans, visual snapshots and a 44 px tap-target audit | PR: smoke; nightly: full |
| Build | leak-check, size budget | public targets clean, positive control passes on full builds; web-demo initial JS ≤ 250 KB gzipped | PR |
| Sims | bots | balance report (below) | nightly and on demand |

```ts
test.prop([fc.string({ minLength: 1, maxLength: 12 }), fc.integer({ min: 1, max: 20 })], { numRuns: RUNS })(
  'procedural cases are fair and order-independent', (seed, day) => {
    const d = generateDay(seed, content.day(day), content.baselineState(day));
    for (const c of d.cases.filter(c => c.origin === 'procedural')) {
      expect(validate(c, ctx(day)).ok).toBe(true);
      expect(oracleSolve(c.evidence, ctx(day))).toEqual(c.expect);
      expect(generateCase(seed, day, c.procIndex!)).toEqual(c);
    }
  });
```

**Bot policies**
- **oracle:** knows the truth (sanity check).
- **ideal:** checks everything perceivable.
- **efficient:** follows the minimal proof (a lower bound on time).
- **competent:** a checklist per day; uses tools when cued; misses signs at rates set by salience ({1: 25%, 2: 8%, 3: 1%}).
- **novice:** a shorter checklist and more Questions.
- **trusting:** believes testimony.
- Night strategies: frugal, familyFirst, upgradesFirst.
- Story strategies: pro-Odin, Loki-ally, Freyja-favorite, etc.

**Reports:** accuracy and throughput by policy and day versus sun time; income; family survival; which endings happen. **Every ending must be reachable by at least one policy.** The per-action human time model is calibrated later from alpha telemetry.

---

## 10. Dev tooling

**Case Lab** (`?lab`; exists only in `dev-full`, and the leak check asserts it's absent from public builds)
- Inputs: seed, day, procIndex, archetype and knob overrides.
- Panels:
  - the truth
  - the lies, with their question kinds
  - the evidence, drawn by the real components
  - the solver's trace: fields → laws → beliefs with support → the rule-by-rule three-valued evaluation
  - the minimal proof (highlighted) and the list of contradictions
  - the question templates that matched
  - rejection history (attempt, reason) and the difficulty score
- Buttons: "Play this case", "Permalink", and **"Export as scripted YAML"**, which turns a great procedural case into an authored one.
- Tabs: Sweep (N seeds run in a Worker, with histograms) and Replay viewer.

**Content linter** (`pnpm content:lint`, also run by compile)
- **Structure:**
  - zod schemas, with file:line errors
  - references resolve
  - the pack dependency graph holds
  - `since` ordering (nothing refers to a fact before it exists)
- **Rules:**
  - the rulebook covers every case, and no rule is shadowed
  - limits on predicate depth and clauses
  - laws are consistent: no sign implies contradictory facts
  - every archetype can be generated on each day it's used (≥ 200 draws with acceptance ≥ 30%)
- **Coverage:**
  - channels: every fact a rule reads has at least one hard channel by that rule's `since` day
  - cues for tool-only facts
  - testimony and question templates cover the lie catalog × personas × kinds, with variety targets (≥ 3 per common claim)
- **Text:**
  - i18n keys exist; unused keys are flagged
  - ICU syntax parses
  - string lengths fit their UI slot (a testimony line ≤ 140 chars)
- **Ink:** externals bound, `fx` tags parse, knots exist and are reachable.
- **Assets and fonts:** assets exist per pack; glyph coverage.
- **Budgets and content rules:** word budgets per day; the age domain, the banned-topic list, and only adults dying in the family.

**Day simulator CLI**
- `pnpm sim day --day 9 --seeds 2000 --bots trusting,competent,ideal --report out/day9.md`
- `pnpm sim campaign --seeds 500 --policy frugal,lokiAlly`
- `pnpm sim daily --from 2027-01-01 --days 365 --check-hashes`

**Also**
- **Body Lab:** a grid of every variant, hotspot and palette, with a checklist of how visible each sign is.
- **Scenario jumper:** start on day N with preset rings, standing and flags, to test Ink scenes.
- A pseudo-localization toggle and `pnpm replay`.

---

## 11. Milestones

See the table in `build-plan.md` §12. Engineering exit criteria:

- **M0 Foundations:**
  - pnpm workspace; Biome + the import-boundary check.
  - Engine purity check (no DOM, `Math.random`, `Date`, trig/exp `Math`, `localeCompare`/`Intl`).
  - CI runs typecheck, lint and tests, builds all 6 targets, and runs the leak check with both controls.
  - Hello-world deployed to Pages.
  - Playwright smoke on chromium-1194.
  - LICENSE and the content notice.
- **M1 Fairness engine:**
  - Facts, laws, channels, cues, rules, the three-valued solver, the generator, the F1–F8 validator, the minimal proof, and question responses for Day 1–5 mechanics.
  - A 10k-seed run meets the §3.8 thresholds.
  - Oracle, adversarial and metamorphic tests pass.
  - Case Lab v1 (text only).
- **M2 Playable core loop:**
  - Shift screen in drawer and desk layouts, with the placeholder body art.
  - Hotspots, flip, feather, compare, question, stamp, citation.
  - Sun timer and pause.
  - Daily mode and share text.
  - IndexedDB settings and streaks; keyboard input.
  - 5 outside testers finish a Daily on phone and on desktop.
- **M3 Public Daily alpha:**
  - PWA on Pages plus itch.
  - A 3-case primer.
  - Feedback forms, "Report this soul", opt-in telemetry.
  - A guard that checks Daily checksums don't change.
  - **Pay the Steam Direct fee** (the 30-day wait before release, plus tax and bank checks).
- **M4 Campaign systems:**
  - Full day loop, economy, family, factions, and a shop that only speeds you up.
  - Per-scene Ink and scripted cases.
  - Save slots, snapshots, replay any day, replay files, migrations.
  - Rune-lens and forged tallies; the registry with portraits; nails and clippers.
  - Days 1–6 playable with draft text; an economy bot simulation.
- **M5 Vertical slice:**
  - Days 1–3 at final quality, plus **Day 12 (Loki)** to prove the late game.
  - Two art directions built as providers, judged on:
    - how readable the subtle signs are on a 360 px phone
    - production cost, from the manifest's number of variants
    - how they look on streams and in thumbnails
    - how appealing the store capsule is
  - Then: the decision, a style guide and an asset list; an audio pass; trailer capture; capsule art commissioned.
- **M6 Steam page + Electron:**
  - The store page public by mid-April 2027.
  - electron-full and electron-demo on the Steam beta branch.
  - Auto-Cloud verified on Windows and Linux; achievements.
  - Deck tested with both native and Proton builds.
- **M7 Content production:**
  - Days 4–20 with all mechanics, 8+ endings, Endless.
  - Weekly builds to private testers.
  - Every ending reachable by bots; nightly sweeps pass.
  - At least 5 full external playthroughs.
- **M8 Steam demo + Next Fest:**
  - The demo app live (Days 1–3 + Daily), festival registration, a trailer, and a list of press and streamers.
  - Next Fest rules: one per game, the game must be unreleased, and a demo is required. Make the Steam demo public 2–4 weeks before the fest.
- **M9 Android / Play:**
  - The Capacitor shell, Filesystem saves and Auto Backup, back button and pause, safe-area insets, share, haptics, the WebView check.
  - Tested on a cheap phone.
  - The 12-tester closed test started.
- **M10 Beta:**
  - Bug bash and balance from sims plus telemetry.
  - Accessibility audit and Deck review.
  - IARC and the Steam content survey.
  - A release candidate with zero critical (P0) or major (P1) bugs.
- **M11 Launch:** Steam and Play 1.0, and the web demo's buttons switch to "Buy".

---

## 12. Top risks and mitigations

| Risk | Mitigation |
|---|---|
| **Public repo** (decided) | Anyone can build the full game. GPL code, all-rights-reserved content and a reserved name let you file takedowns against resold copies. |
| **Deducible but not visible** (case fairness) | Perception classes are gameplay data the art must meet; the F6b cue rule; citations show the proof; "Report this soul"; alpha telemetry per rule and sign; weekly Case Lab reviews; a visibility floor per day. |
| **Late-game combinatorics** (high rejection rates, repetitive cases) | Generate by targeting archetypes, with precomputed compatibility tables; CI acceptance thresholds per (day, archetype); a new archetype with every new mechanic; rule-depth and vigilance knobs; variety constraints. |
| **Phone UI density** | Drawer layout, clue chips, field-level compare; `maxDocs` enforced by the generator; 44 px targets; 360×740 and landscape end-to-end tests; a tap-target audit; the Daily alpha as the phone UX test bed from M3; a cheap phone in M9. |
| **Content volume (~50k words)** | Word budgets per day; systemic templates carry most variety; sparse character beats (Thorvald appears about 6 times); write in passes (outline, draft, polish); consider a freelance editor. |
| **Dailies diverging between versions or devices** | Integer-only engine; a `genVersion` schedule keyed by effective date; checksums for the next 180 days; version in the share text; PWA updates only on prompt. |
| **Saves or replays breaking after updates** | Snapshots plus the saved in-progress queue; per-scene Ink; migration fixtures; replays in compatibility mode. |
| **Steam technology** | steamworks-ffi-node behind `SteamPort`; the Linux switches; `asarUnpack`; the overlay treated as optional; Deck tested in M6, not M10. |
| **Play policy and timeline** | SDK 36 via Capacitor 8; a 14-day closed test built into the schedule; edge-to-edge insets; the WebView check. |
| **Real-time timer on mobile** | Pause when hidden, blur while paused, Story Mode, Assist sun speed. |
| **Tone, religion, rating** (target PEGI 12 / ESRB T) | The satire targets bureaucracy, not belief; a sensitivity read of the clerk's storyline; family deaths are adults only (children can fall ill or leave, never die); schema-enforced content rules. |
| **Trademark** | Ship as *Chooser of the Slain*. |
| **Scope** (3 modes × 3 storefronts) | The cut list in build-plan §12; Steam first if needed. |

**Design decisions this spec relies on** (also in build-plan §1)
- Freyja's claim is a daily **whim** over visible facts. The generator aims for about 30–50% of worthy souls.
- A hammer + cross pendant means **prime-signed** (Egils saga), and they stay yours. Only the baptized are TRANSFERred.
- RETURN relies on the presumption "the fallen are dead" plus cues.
- **Rune forgery signs are categorical** (an Elder Futhark rune, a mirrored rune, a broken "X á mik" owner formula). Younger Futhark spelling varies too much for spelling to be fair.
- Upgrades never affect whether a case can be solved.
- The Naglfar plot advances only through explicit choices.
- Days 1–3 of the demo include a Question moment and Thorvald's RETURN.

**Tech decisions**
- Per-pack bundles are the leak boundary; per-day chunks within a pack are fine.
- Keep zod out of the client except `zod/mini` for save validation.
- Use intl-messageformat. Templates are whole sentences with ICU gender `select`, never glued-together fragments.
- The engine bans `localeCompare` and `Intl`.
- Service workers only in `web-demo`; never in itch, Electron or Capacitor builds.

---

## 13. M1 implementation notes (the fairness engine as built)

**Where things live**
- Engine: `packages/engine/src/{logic,gen,narrative}`.
- Content: `content/packs/{core,demo,campaign}`.
- Tests: `packages/*/src/**/*.test.ts` and `tests/golden`.

**Decisions that differ from the sketches above**
- **The engine owns the content types.** They live in `packages/engine/src/content/types.ts`, and the engine imports nothing. `content-schema` parses YAML into exactly those types; its `z.ZodType<EngineType>` annotations turn any drift into a type error.
- **`alive` is its own fact**, presumed false. There is no `cause: none`: a not-quite-dead soul still has `cause: battle`.
- **Two kinds of laws.** *Signs* (`kind: sign`) read an observation, e.g. a fever flush means sickness. *Customs* (`kind: fact`) relate facts, e.g. no wounds anywhere means no battle death. Observations declared `from: { fact }` are read directly, with no law.
- **Facts that don't exist yet are known.** A fact before its `since` day is pinned and known to the solver at level 4 ("world"). On day 1 there are no back wounds, so the front of the body decides; the flip arrives with the rule on day 2.
- **Body evidence is complete.** Every observation active that day is rendered. The planner only decides testimony, raven lines, cues and decoys. So channel "redundancy" became `ravenRate`, and the knobs are `lieRate` (a percent multiplier on archetype lie chances), `maxLies`, `decoyRate`, `ravenRate`, `forgetRate`, `proofCostS`, `maxTools`, `maxDocs` and `salienceFloor`.
- **Archetype `require` predicates** (e.g. Freyja's whim, or its negation) compile into sampling constraints, so targeted destinations don't depend on rejection sampling.
- **Smaller changes:**
  - `teachFirst` names an archetype, not a rule.
  - Each dialogue pool (place, foe, weapon) is drawn once per soul, so all of a soul's lines agree. A mismatch would look like a lie.
  - Names come from a per-day shuffle, so they are unique within a day and each soul stays a pure function of (seed, day, index).
- **Leak tokens** now include every content id a pack owns. Ids and string keys are matched as quoted literals; the canary is matched raw.
- **dependency-cruiser was dropped** (it doesn't support TypeScript 7 yet). `tools/lint-boundaries` enforces engine purity and content imports.

**Known limits**
- A derived fact's trust level is the lowest level among its inputs, which is conservative.
- A statement about a derived fact (Huginn's "watched this one run") narrows that fact but isn't pushed back to its inputs.
- The partial-evidence oracle test only checks that the solver is never *more* certain than brute force.
- In days 1–5 every decisive fact can be seen on the body, so a confession never decides a case. The reveal path is implemented and tested; it starts to matter with identity and registry mechanics (day 6+).
- Day summaries are pinned in `tests/golden/days-1-5.json`; Daily checksums arrived with M2 (§14).

**Tooling**
- `pnpm sim sweep --seeds N [--days 1-5]` prints acceptance, attempts, fallbacks, timing, destination mix and bot scores, and fails on the §3.8 thresholds. CI runs 200 seeds as a test; `nightly.yml` runs 10,000.
- `pnpm exec tsx tools/sim/dump.ts <day> <seed> [index]` prints souls with evidence, lies, proof and question answers.
- `pnpm golden:update` rewrites the golden summaries after an intended generator change. Bump `genVersion` too.
- The Case Lab (`pnpm dev`) shows a soul's truth, evidence, solver beliefs and support, rule evaluation, questions and generation log, plus a 100-seed sweep.

## 14. M2 implementation notes (the playable core loop as built)

**Where things live**
- Shift engine: `packages/engine/src/shift/shift.ts` (state machine, scoring, share text, `queueChecksum`).
- The Daily's spec: `content/packs/daily/daily.yaml`, compiled to `generated/<target>/daily.json`.
- UI: `packages/ui/src/store.ts` (time, persistence, session), `screens.tsx` (title, briefing, summary) and `shift/` (the shift screen, keyboard map, evidence text).
- Body art: `packages/art/src/placeholder.ts` (was `packages/art-placeholder/src/body.ts` until M5). Storage and sharing: `packages/platform/src/{storage,share}.ts`.
- Tests: `packages/engine/src/shift/shift.test.ts`, `packages/art/src/contract.test.ts`, `tests/golden/dailies.test.ts`, `tests/e2e/daily.spec.ts`.

**Decisions**
- **The shift is a pure state machine**, `stepShift(state, action, ctx) → {state, events}`.
  - Every action carries `at`, integer ms from the UI's monotonic clock; the engine never reads a clock.
  - Sun time is real time minus pauses plus penalties.
  - Penalties: the first turn-over of each soul 2 s, the feather 10 s, a compare that finds nothing 10 s, a question 20 s.
  - After dusk the soul at the gate can still be judged for 60 s. Then every soul left is recorded as unjudged.
- **The solver referees Compare.** A compare catches a lie only if the solver, run on the fields the player has looked at, shows that pair contradicts (the lie, plus a field in its support). Questioning needs a caught lie.
- **What counts as looking.** The body needs an explicit look: tap a region or its chip. Papers are implicit: showing a paper marks its lines as seen. A citation lists the proof fields the player never looked at.
- **The Daily has its own content bundle.** `dailyContent` is built from the core and daily packs only, so the demo and full builds play the same Daily. `queueChecksum` values for Dailies #1–#180 are pinned in `tests/golden/dailies.json`.
- **Tuning the Daily's mix.**
  - RETURN is 0–2 per Daily, so finding one living soul doesn't tell you the rest are dead.
  - The mix leans towards HEL, which puts the testimony-trusting bot at 59.1% over 10,000 Dailies (the gate is 65%).
- **Preview Dailies.** Before `DAILY_EPOCH`, the title offers an unnumbered "Daily preview · date" (seed `daily:<n>`, n ≤ 0) so testers can play now. Its share text says "Daily preview <date>".
- **Saving a Daily in progress.**
  - The action log is saved after every action (not the state). A reload replays it and resumes paused on the same timeline.
  - The log and the results are mirrored to localStorage, which writes synchronously. An IndexedDB write still in flight is lost when the page unloads, which would let a just-sent soul be judged again. On load the fuller copy wins.
  - A 5 s heartbeat saves the last time the sun was seen running, so a reload or crash refunds at most about 5 s of sun.
  - Leaving the page (hidden, blurred or unloaded) pauses the sun, and the desk is blurred while paused.
  - One ranked attempt per Daily; replays don't count. The streak counts consecutive Dailies played to the end.
- **Strings are ICU MessageFormat.** The UI uses intl-messageformat. The compiler checks every message parses, and requires chip text for every sign value, tool and destination.
- **Storage** is an IndexedDB key-value store with an in-memory fallback. The first finished Daily asks for persistent storage. Electron and Android use the same store until their shells (M6, M9).
- **Body art contract (§6.5), simplified to** `draw(scene) → SVG`, `hotspots(scene)`, `conformance` and `views`. Contract tests check that:
  - every value of every sign draws differently;
  - every sign sits under a hotspot on its view;
  - conformance meets the gameplay salience;
  - hotspots stay inside the frame and don't overlap.
- **Hold-to-send** (300 ms) applies to touch and pen; mouse clicks and Enter send at once. A setting turns it off.

**Deferred and known limits**
- Desk papers sit in a fixed grid. Dragging, "Tidy desk" and saved positions are deferred to the M5 UI pass.
- No gamepad or focus graph yet (M6, with the Deck). Keyboard play uses native focus plus the keymap. (Controller support came after M7: §36.)
- Landscape phones get the drawer, not the side sheet from §6.3.
- Blur-to-pause also fires when a desktop player clicks another window. That's intended.
- A crash or reload refunds up to 5 s of sun (the heartbeat interval).
- The runtime Daily checksum guard arrived in M3 (§15).
- Only the web build's share text carries a link. The itch, Steam and Android builds share text alone.
- Web demo JS is 47.7 KB gzipped (budget 250 KB).

## 15. M3 implementation notes (the public Daily alpha as built)

**Where things live**
- Primer: `content/packs/daily/primer.yaml` (three scripted souls) and `packages/ui/src/shift/coach.ts` (the coach steps).
- Checksum guard: `packages/engine/src/shift/checks.ts`; the compiler writes `generated/<target>/daily-checks.json`.
- Traces: `packages/engine/src/shift/trace.ts` rebuilds what happened to each soul from the action log.
- Reports and feedback: `packages/ui/src/report.ts`, `links.ts`, `.github/ISSUE_TEMPLATE/`.
- Telemetry: `packages/ui/src/telemetry*.ts` (client) and `apps/telemetry` (Cloudflare Worker + D1).
- Deploys: `.github/workflows/deploy-itch.yml`, `deploy-telemetry.yml`. What only the owner can do is in `docs/alpha-launch.md`.

**Decisions**
- **The primer is a scripted day.** `queue.script` fixes each slot's archetype and destination. `lieRate: 200` makes the coward's lie certain. It plays untimed with a fixed seed, so everyone gets the same three souls:
  1. an honest warrior (look, read the rules, stamp);
  2. a coward who claims he never fled (turn over, catch the lie);
  3. a not-quite-dead soul (the mist cue, then the feather).
  - Sea-foam and Freyja's whim are explained in text afterwards.
  - Coach steps end when the player does the thing, or presses Next for reading steps. `data-coach` on the shift root drives the highlight in CSS, so nothing extra lands in the DOM (no marker for the lie).
- **The checksum guard.**
  - Each build ships a table of the checksum every Daily from −120 to 400 should have (8 hex characters each, about 2 KB gzipped), computed once per compile from the Daily content.
  - On starting a Daily, the device computes its own checksum and compares: `ok`, `mismatch` or `unchecked` (outside the table, or another generator version).
  - A mismatch shows a warning with a report button and marks the share text "unverified". The result keeps the guard value. With telemetry on, the mismatch is also sent.
- **"Report this soul"** opens a dialog with the report as text, a copy button and a GitHub issue-form link with the report pre-filled. The form's text fields are filled by their ids; dropdowns and checkboxes can't be. The GitHub mobile app drops the pre-fill, hence the copy button.
  - The report holds the build, mode, seed, day, soul index, the queue checksum, the verdict, this soul's actions (times relative to its first action) and the browser, screen and language.
  - The Case Lab reads a pasted report and jumps to that soul. It can also open the Daily and primer specs.
- **Telemetry is opt-in and off by default.**
  - The question is asked once, after the first finished Daily, and only in builds with `VITE_TELEMETRY_URL`. Without that variable there is no telemetry UI at all.
  - One record per finished shift is sent as a text/plain `fetch` with `keepalive` and no credentials. For each soul it holds the rule, archetype, stamp, sun used, penalties, tools, and the kinds of sign looked at or missed (keys, not values).
  - The Worker validates the record against a strict zod schema (bounded identifiers, enums, no free text), checks the origin, gets a random id per shift and keeps only the date.
  - The Worker's tests validate a record the game's own code builds from a played Daily, and the e2e tests validate the browser's real POST against the same schema.
- **PWA updates** use `registerType: 'prompt'`, and the web adapter registers the worker itself. The update is offered only on the title screen. Builds without the PWA get a no-op `virtual:pwa-register`.
- **Settings are mirrored to localStorage** like Daily progress and results. The mirror wins on load, because it's written synchronously.
- **A telemetry base URL may carry a path.** `new URL('/v1/…', base)` would have dropped it; the e2e test caught this.

**Deferred and known limits**
- The checksum table covers Dailies −120 to 400. Later Dailies report "unchecked" until the range is extended and a build shipped.
- The telemetry Worker has validation and an origin check but no rate limit. Anyone can post well-formed junk from outside a browser. D1's free tier caps writes (about 100k rows a day).
- Players need a GitHub account to file reports and feedback. Otherwise they can copy the report text and paste it into the community channel.
- The primer covers turning over, the feather and one lie. Sea-foam and the whim are text only.
- Web demo JS is 56.9 KB gzipped (budget 250 KB), up from 48 KB. Most of that is the checksum table, the new strings and the new UI; the service-worker update client is about 1 KB.
- Telemetry exists only in the web and itch builds. The Steam and Play builds ignore a telemetry URL even if one is set, which matches Play's "no data collected".

## 16. M4 implementation notes (campaign systems as built)

**Where things live**
- The run: `packages/engine/src/campaign/` (`run.ts` the day loop, economy, family and endings; `save.ts` saves, resume and replaying a day; `state.ts` the run state and the paths endings can read).
- Story: `packages/story` plays compiled Ink; the compiler's `scenes.ts` compiles and lints `scenes/*.ink`. Story souls are `cases/*.yaml`, made by `engine/src/gen/scripted.ts`. What is placeholder writing, and the rules for writing scenes, are in `docs/story-drafts.md`.
- Campaign UI: `packages/ui/src/campaign/` (`run-store.ts` slots, saving and resume; `screens.tsx` slots, morning, audit, night, ending). It loads on first use, with scenes in a chunk of their own.
- Content: `content/packs/demo` (Days 1–3 and their campaign rules) and `content/packs/campaign` (Days 4–8 and 11, the registry, the rune-lens, procedures, tallies).
- Tools: `pnpm sim campaign [--target]` (the economy bots), the testkit's `scenarioSave` (a save on any morning, for tests), and a second e2e preview server for the full build.

**Decisions**
- **The run is pure.** `stepRun(run, action, env)` wraps the shift. Morning scenes, beginning the shift, the shift's own actions, the audit, bills, the shop, night scenes and ending the night are all actions. A save keeps each morning's state, the day's actions and the day's queue, so a resume is exact and any day can be replayed from its morning. A save from another engine version starts its day again ("the Norns rewound the day").
- **Economy and family** (all numbers are per day, in its spec):
  - Wages per soul judged rightly, a bonus when the lie was caught, a few forgiven mistakes, then fines that escalate.
  - Bills: hearth, food for everyone at home, medicine for the sick. An unmet need is a seeded gamble (so replays fall sick the same way), and two nights of the same need in a row always make someone sick.
  - Two nights sick without medicine lose them: adults die; children are sent to relatives.
  - Draupnir drips rings on nights 9 and 18. Two nights below the debt floor is the Demoted ending.
  - Story Mode has no sun and no fines.
- **Standing** with Odin, Freyja, Hel, Loki and the clerk moves by an (expected, stamped) table, and through scenes and story souls. The shop sells speed only.
- **Scenes are stateless Ink.** Each file is compiled on its own. A scene reads the run through six externals and changes it only through `# fx:` tags, applied once when the scene ends.
  - The compiler rejects Ink errors and warnings, unknown externals, malformed effects, effects on choice lines, text outside a choice's brackets (the game echoes the picked option), missing speakers, and scenes no day plays.
  - It walks every choice path in three sample runs.
- **Story souls** are generated from their own truth constraints with a fixed identity and a seed of their own (the same soul in every run), then validated by the same F1–F8 contract. The compiler proves each can be made on every day that places it, under every whim. Stamping one can set flags or move standing at the audit. Thorvald (Day 3) and Geir (Day 6) are the first.
- **Later decrees reuse the fairness engine.** Each needed one general addition:
  - Registry (Day 6): an observation can be read from a document (`doc`), which becomes its own evidence item. The registry lookup is a tool; a namesake's entry always shows different hair; a cue (the broken oath-ring) says when to look.
  - Rune-lens (Day 7): owner's runes and maker's marks are tool readings on the weapon; a borrowed weapon sends a soul to Hel.
  - Procedures (Day 8): a judgment is a destination plus the procedures due. Clipping nails is the first. The solver must see the hands to settle it; a right stamp on unclipped nails is a mistake with its own citation. The key is left out of judgments without procedures, so older cases and Dailies keep their exact shape.
  - Saga tallies (Day 11): tally lines count at trust 3 unless a forgery sign is seen through the rune-lens, which voids the whole tally. A tally is also believed whole or not at all: if its lines can't all be true together (given what's been seen), none of them counts, even with no line refuted outright. The solver narrows line by line and rolls back on any contradiction; the oracle filters the possible worlds by all lines jointly. (A CI counterexample had "never fled" and "fell in battle" on one tally with only the front seen: jointly impossible, yet the old solver trusted both and judged VALHALLA.) A forger's lie is carved, never spoken. F5 requires a visible sign and a cue for every forgery. The trusting bot believes tallies as well as words.
- **Mechanics live in the campaign pack.** New facts sort after the old ones, and new random draws use their own forks, so the Daily and Days 1–5 generate exactly as before (goldens unchanged). A Days 6-on golden now pins the full game's days.
- **Leak check vs shared code.** Campaign ids and string keys must not appear in the UI code every build shares. Tool buttons and chips build their keys from data, and the one pool the UI names (crimes) lives in core.

**Economy simulation** (`pnpm sim campaign --seeds 200`; bots judge at a fixed accuracy and follow a night strategy)

| Judging (accuracy) | Demo, Days 1–3: demoted | Full, Days 1–6: demoted | Full: rings at the end (competent: mean / min) |
|---|---|---|---|
| Expert (97%) | 0% | 0% | — |
| Competent (85%) | 0% | 0% | 126 / 49 (pay all bills) |
| Novice (65%) | 0.5–1.5% | 3.5–14% | — |
| Careless (40%) | 23–34% | 92–98% | — |

The range in each cell spans the three night strategies (pay everything, skip the hearth on odd nights, buy upgrades first). No bot lost a family member, because every strategy pays for medicine; the unit tests cover losing one.

**Deferred and known limits**
- The campaign runs to Day 6. Days 7, 8 and 11 have mechanics and specs (playable in Practice in full builds) but no story. Days 9, 10 and 12–20 are M7.
- All story text is draft (about 1.7k words of Ink plus strings); see `docs/story-drafts.md`. The scene lint walks three sample runs, not every run.
- By Day 6 a competent player has about 126 rings and nothing left to buy. The economy needs more sinks or costs as days are added.
- A scene restarts if the page reloads mid-scene (choices are logged only when it ends); a shift resumes paused where it was.
- Minimal proofs are 1-minimal, not cheapest: with a tool, the proof can keep the tool reading where a raven line would do. Proof costs run a little high on those days.
- A forged tally is always also contradicted by the body, so the rune-lens is a second route rather than the only one. Forgeries that only the lens can catch need facts with no cheap physical sign.
- Web demo JS is 63.6 KB gzipped on first load (the campaign screens and the Ink runtime, 40.8 KB, load when the campaign is opened; the demo's scenes are 2.6 KB).

## 17. M5 implementation notes (the vertical slice as built)

**Where things live**
- Art: `packages/art` (was `art-placeholder`): the contract (`contract.ts`), the shared figure layout and hotspot regions (`layout.ts`), the placeholder, the two candidates (`woodcut.ts`, now the default and in the main bundle; `pixel.ts`, loaded on demand), and the comparison sheet (`sheet.ts`). The UI's art switch is `packages/ui/src/art.ts`; `pnpm art:sheet` writes the trial page; dev-full's title screen has a Body Lab.
- Days 10 and 12: the campaign pack (`faith`, `thorsHammer`, `trickster`, the `amulet` and `lipScars` signs, `rule.transfer`, `rule.detain`, five archetypes, templates, `days/day-10.yaml`, `day-12.yaml`).
- The slice: `campaign.yaml` `slice`; Day 12's scenes and story soul (`scenes/d12.*.ink`, `cases/loki-12.yaml`).
- Sound: `packages/ui/src/audio.ts`. Writing: `docs/voice.md`. Art and store briefs: `docs/art-brief.md`. Next Fest: `docs/next-fest.md`.

**Decisions**
- **The art contract grew.** Each provider draws its own registry portraits. Pixel art declares its grid, and the stage sizes it so each art pixel covers whole device pixels (a ResizeObserver; the frame is letterboxed). Every provider shares one layout, so taps land in the same places and a region's signs are one decision.
- **Choosing art.** `?art=woodcut|pixel|placeholder` picks the art and the device remembers it. Feedback links name it. Art never changes a case.
- **The woodcut was chosen** (September 2026) and is the default. After the choice, its hands were redrawn: open hands with fingers and a thumb, and a fist closed round the grip with the thumb over the index finger. The held weapon now shows from behind too, though `grip` stays a front-view sign (the back view has no hand hotspots). From behind, the fist shows its back (knuckles down the outer side; the fingers and thumb curl out of sight) and the weapon passes behind the forearm: a playtest found the first version, with the weapon over the arm and a fist that looked like its front, read as an arm turned backwards. The weapon leans out 14° from the fist, away from the body, in both views, so it shows past the arm from behind and turning the body doesn't change its angle; the rune-lens reading follows the blade, upright, on the side toward the body so it stays in the frame.
- **The weapon a soul names is the weapon drawn.** Testimony already shares one weapon word per soul; the shift passes it to the art (axe, sword, spear, seax). No generation change, so Dailies and goldens stay put.
- **Day 10:** faith is heathen by presumption. The amulet is the sign: a cross means baptized, a hammer heathen, and both on one cord prime-signed (who stay ours). TRANSFER comes after outlaws. A false convert's claim is caught by his hammer.
- **Day 12:** `trickster` (not `loki`, which is a faction id in shared code and would trip the leak check). Its only sign is stitch scars on the lips (salience 1), so the day's floor drops to 1. DETAIN comes first. Loki's one lie is "just a plain man", and questioning it gets a `deflect`, which reveals nothing.
- **Rules accumulate,** so Day 11 now includes the Day 10 souls; the Days 6-on golden pins Days 10–12 (Days 6–8 unchanged).
- **The slice** is a run flag. After the slice's first day range it jumps to the late day, adding what the skipped days would have brought (the run's own flags win), and the late day's night ends with the slice's finale. It can also start on the late day.
- **Sound** is synthesised (no files). `soundFor()` maps shift events to sounds, so the audio pass replaces only the recipes. Nothing is created at volume 0; audio starts on the first gesture and holds while paused.

**Measured**
- The body on screen: 166×232 CSS px on a 360×740 phone; 216×302 on a 740×360 landscape phone (it was 74×103 before the landscape layout: the body now runs down the left with the tools beside it).
- Every sign reads at phone size in all three styles except the feather, whose "stirs" was weak everywhere; all three now draw air lines beside the head.
- Days 10–12, 500 seeds: every generation gate met, the trusting bot at 57%, DETAIN about one soul a day on Day 12. Fairness properties pass at 800 runs with the new days included.
- Web demo first load 66.3 KB gzip; each art candidate is a 4.6 KB chunk loaded only when chosen. With the woodcut as the default (in the main bundle), the first load is 72.2 KB gzip.

**Known limits**
- The candidates are drawn in code: they show readability and cost, not how commissioned art would look.
- Loki's scars read at a glance in the woodcut, which may make him too easy. The pixel scars show only through the loupe, and on a bearded face they can look like teeth.
- The slice's stand-in for Days 4–11 (rings, standing, `ulf_shipyard`) is a guess. Day 12 has a generated teaching Loki as well as the story Loki. The slice plays only in full builds, which aren't deployed anywhere public.
- Days 7–11 still have no story; the plain campaign still ends after Day 6.
- The brute-force oracle enumerates every world the evidence allows, which is exponential in the free facts. Days 10–12 made the partial-evidence property the slowest check (about 100 ms a run); its budget is now 250 ms a run. M7's days will need the oracle to enumerate only the facts the day's rules, laws and constraints can reach.
- Everything written in M5 is draft (`docs/story-drafts.md`). The sound is a placeholder.

## 18. M7 implementation notes (the full campaign as built)

**Where things live**
- The design and its open questions: `docs/m7-design.md`. Story drafts, flags and which choices reach which ending: `docs/story-drafts.md`.
- Days 9 and 13–20: the campaign pack (`days/`, `rules.yaml`, `laws.yaml`, `facts.yaml` with `liar` and `spearMark`, `world.yaml`, archetypes, Muninn's lines in `templates/ravens.yaml`). Scenes for Days 7–11 and 13–20: `scenes/d{7…20}.*.ink`; Thorvald's Day 16 visit: `cases/thorvald-16.yaml`.
- The fast oracle: `packages/testkit/src/oracle.ts` (the slow reference, for Days ≤ 12: `oracle-reference.ts`).
- Endings state (`sent`, `naglfar`, `ragnarok`, `lead.<faction>`): `packages/engine/src/campaign/state.ts`. Endless: `packages/engine/src/shift/endless.ts` and the UI's `EndlessMode` (`packages/ui/src/store.ts`).
- The story-playing sim: `packages/testkit/src/campaign-sim.ts` (policies), `scenePaths` in `packages/story`, `pnpm sim campaign --story all`.

**Decisions**
- **The oracle stays exact without enumerating everything.** Unary constraints narrow facts first; linked facts form groups (fact laws, derived facts, tally lines, the liar's claims); only the group the rules read is enumerated, and the others need only be satisfiable.
- **Liars (Day 16) are a fact of the truth.** `liar` is never sampled: the generator plans lies before judging and sets it from them. The solver proves it from a caught lie, a seen forgery, or claims that can't all be true together, and otherwise presumes the soul honest. Both oracles prove it only from evidence, never from another presumption (M7.7: a presumed-heathen soul who said he was prime-signed had counted as a liar).
- **Statements about derived facts constrain what they're made of.** A raven's "never fled" now means no wound in the back, as a tally's always did, so the laws reason from it. Fixed with the above after the partial-evidence property found both (three counterexamples, pinned as tests).
- **Observation keys never reuse a campaign fact's id.** The art draws signs by observation key and ships in every build, so `spearMark` the sign leaked a campaign token into the demo; the sign is `spearCut` (like `nails`/`nailsGrown`, `lipScars`/`trickster`).
- **Standing moves only on wrong stamps** (a fix: catch-all rows had matched right ones since M4).
- **Story branches read flags and the family's state,** and letters hold when a family member is gone. Day 17 decides where the family is (ship, ferry, wood or home) and drops the other plans, so the ending matches the player's last choice; taking Loki's deal on Day 18 replaces it.
- **Bots choose by effects, not words.** A policy scores every path through a scene by the flags, standing and rings it changes, so rewriting a scene keeps the bots working.
- **Endless reuses the day specs:** each round is the first five souls of its day's queue, so the day's teaching soul comes first.

**Measured**
- The oracle: Day 12 from 76 ms a soul (1.3 s worst) to 0.16 ms (1.6 ms worst). Fairness properties take about 5 s each at 800 runs.
- Sweep, Days 1–20 × 300 seeds (74,554 souls): mean 1.03 attempts, p99 2, no fallbacks, generation p99 1.8 ms, ideal bot 100%, trusting bot 56.4% (Day 4 alone is 69.8%, above 65%, unchanged since M4).
- Every ending reached by a bot built for it (test in `campaign-sim.test.ts`, with a negative control). Endings by 12 seeds: see `docs/m7-design.md`.
- Economy with the story played: competent players end on about 368 rings, experts about 691; careless players are always demoted.
- Writing: 40 scenes, all draft, about 11,700 words of scenes in the full builds.

**Known limits**
- The economy misses its target: a competent player can still afford the ferry without giving anything up. Squeezing harder demotes most novices (fines sink them, not bills). This needs playtests, not bots.
- Faction endings mostly go to careful players: mistakes cost the god who lost the soul, so a competent player's Odin ends near −16 whatever they choose.
- Host-strength thresholds (260 for Rebirth, 240 for the wolf) are absolute numbers for these queue sizes. The reach test catches drift if the queues change.
- The partial-evidence property runs 150 random seeds per CI run; it took 12,000 more runs to show the fixes held. The nightly's larger runs are the real guard.
- All M7 writing is first draft; the clerk's storyline needs its sensitivity read.

## 19. After M7: what the dead say (audit item 1)

**Where things live**
- Picking lines: `packages/engine/src/gen/render.ts` (`choose`, `deal`, `pinnedWords`); the soul's place in its day reaches it through `dressCase`'s `voice`.
- Content: `spreadLines` in the story days' knobs (demo Days 1–3, campaign Days 4–20), `words` on the campaign's `blade` fact, `chances` in the campaign's `speech.yaml`. New variants are in the campaign pack's templates and strings.
- Tests: `packages/engine/src/gen/voice.test.ts` (tells, weapons, repeats, and that spreading changes only words), `packages/ui/src/dialogue.test.ts` (the fixed strings), compiler lints for `words` and `chances`.

**Decisions**
- **Spreading lines keeps every soul a pure function of (seed, day, index).** A day deals each kind of line (a slot and claim, a raven report, a tally line) into a deck: its variants in a per-day order, each as often as its weight, spaced out (smooth weighted round-robin), cut at a per-day point. Soul *i* says the variant at position *i*. A soul whose persona can't say it takes the variant whose places in the deck are furthest from its own. It only chooses among the same templates, so judgments, proofs, lies and field ids are unchanged (a metamorphic test checks this). Avoiding "the last 20 lines heard", as §3.5 planned, would make each soul depend on the souls before it.
- **The Daily keeps its words.** Its spec has no `spreadLines`, the new variants are in the campaign pack, and the core strings changed only in wording, so its pinned checksums hold. Without the knob, lines are drawn exactly as before (same draws, same order).
- **Facts can fix words.** A fact's `words` (value → pool → word) fixes the word for a soul that has the value or claims it; its lines use it, and the evidence records it (`evidence.words`, only when set) so the art draws it when no line names it.
- **Honest souls vouch for themselves too.** The guise slot is spoken at 15% by honest souls from Day 12, and Loki can wear any persona, so neither the line nor how he talks gives him away.
- **Per-value speaking chances.** Liars always speak their claim; honest souls speak by chance. For claims that liars favour (baptism from Day 10, a true Ulfberht from Day 7) the honest chance is 60%, so the claim alone stops being nearly always a lie. A chance draw is one draw whatever its odds, so nothing else in the plan moves.

**Measured** (16–30 seeds of Days 1–20 in the full build, before → after)
- Lines that repeat one heard earlier that day: 59% → 31% (Day 20: 68% → 43%). The same line as one of the last three souls: 42% → 10%; as the soul just before: 21% → 3%. Variants alone got near repeats to 18%; spreading halved that.
- Day 20's most-used line: 10 times a day on average (14 at worst) → 5 (7 at worst). Muninn forgets about 8 souls a day; his most-used forgetting line went from all 8 (12 at worst) to 2.4 (3 at worst).
- Loki's lines: a lie 100% of the time → 35% (13–46% by line). Highest lie share of any line: 100% → 65% (a baptism claim).
- Contradictions: "my father's axe" with another weapon (27% of those lines), an Ulfberht drawn or named as a non-sword (91% of marked or claimed blades), "seventy winters" at any age, a braggart who died old confessing to a cough, a forger telling both tally stories: all 0. Also reworded: Huginn's "never gave ground" and "dropped the weapon early", which he also said of souls who died in bed or drowned (about a quarter of those reports), and the soul's own "went into the mud".
- Day goldens (12 seeds × 20 days) and the Daily checksums are unchanged.

**Known limits**
- Some claims stay soft tells: a coward's "I did not run" is a lie 63% of the time, because cowards who claim it mostly fled. It's never proof, and the body decides.
- An axe can't be an Ulfberht, so a player who knows that can skip the lens on axe-bearers. That's true to the world; it makes the Ulfberht check a little easier than the validator's proof cost assumes.
- Spreading helps most with lines many souls say. A claim few souls make can still repeat a few souls apart (a deck is only as long as its variants' weights), so the real fix for repetition is still more variants: about 770 new words here, all first draft.
- Honest and veteran souls still have no flavour lines. Adding them would add a line where there was none, which moves field ids in the day goldens, so it's left for a content pass.

## 20. After M7: showing what choices do (audit item 2)

**What changed**
- **The audit's standing adds up.** It had shown today's mistakes under "Today" while story effects moved "In all" unseen. The run now keeps the story's standing since the last audit (`storyStanding`: scenes, story souls' stamps, the slice's jump), and each audit files it in its ledger (`DayLedger.story`) beside the day's mistakes. The table shows Mistakes, Story and Now: the last audit's Now plus both columns is today's.
- **A standing strip** on the morning and night screens, for the powers the player has had dealings with (`factionsMet`: any whose standing has moved on the record, even back to 0). The rest stay out of sight until the story brings them in.
- **Notes after choices.** A scene's frame files what each choice did on the last line before the next choice (or the end); the scene then shows "Hel will remember that (+3)." for each power moved. Ink gives a tag written under a line to the next line, so a line's own tags can't say which choice an effect belongs to; filing by stretch puts the note in one predictable place. The audit adds the same note to a story soul's verdict (`stampEffects`).
- **Aliases.** `aliases` in a campaign's config gives a power another name until a day: Loki is "The stranger" until Day 12, when Skögul names him, in the strip, the table and the notes. Before this, the full game's Day 4 audit already listed "Loki" after the Day 3 stranger scene.

**Tests**
- Engine: the ledger files story standing from last night's scene to this audit, the columns add up over several days, a power that moved back to 0 stays met, story souls' stamps and the slice's jump count as story, and the alias holds until Day 12.
- Story: where effects are filed, including a choice with no text after it.
- e2e (phone and desktop): the Day 1 note and strip, a Day 1 audit row whose columns add up (a mistake −1, a choice +1, now 0), and Day 3's stranger named only as the stranger.

**Known limits**
- A note can come a few lines after the reply it belongs to (on Day 1 it comes after three closing lines), because it waits for the end of the choice's stretch.
- Saves from before this change have no story column for days already audited; their rows show 0 there, so those days don't add up.
- The notes are plain text under the choice. Whether players want them, or would rather discover standing on their own, is a playtest question.

## 21. After M7: the journal (audit item 3)

**What changed**
- **The save keeps a journal.** A save held only today's actions, so a day's scenes, letters and choices were gone the next morning. `RunSave.journal` records each scene played: its day, the choices made, and what the scene could read of the run as it began (rings, flags, standing, the family), since nothing else in the save can rebuild that for an older day. A replayed day drops its entries and the later days'; a scene played again (a day restarted after an engine update) replaces its entry. Under 1 KB a scene (the flags grow as the story goes), so a whole campaign adds about 20 KB to a save.
- **The Journal button** on the morning, night and ending screens opens a page over the screen (a scene half-read underneath keeps its place). It lists the threads still in play, then every day's scenes, newest first, played again read-only with the choices made and the standing notes. Only the days opened are played again.
- **Threads** are content (`threads` in `campaign.yaml`): a text key shown while a run-state condition holds, with an optional count. The campaign has ten: Skögul's loan, Ulf's fine and his shipyard, the stranger's deal, the ferry, knowing of the wood, the family's plan (the wood or home), the clerk's contract, and how much you've heard of the after.
- **Options you can't afford stay in sight.** A `needs: rings N` tag inside an option's brackets shows the option greyed out with what it needs, instead of an Ink condition hiding it. The seven rings-gated options (the roof, Ulf's fine, Skögul's loan, the healer, the ferry twice, the clerk's fee) now use it; story gates stay hidden. The runner won't take a locked option; bots and the compiler's walks skip them, and a point where every option is locked fails the build.

**Tests**
- Engine: every scene played is kept with its choices and the run as it began; a replay drops the discarded days and a replayed scene replaces its entry; threads follow their conditions and counts.
- Story: locked options are shown with their cost, can't be taken, aren't walked, and a point with only locked options fails; the env a journal entry gives equals the one the scene had.
- Compiler: a `needs` tag outside an option's brackets, or malformed, is rejected.
- e2e: the journal after a day and after a reload (phone and desktop), a locked option on Day 2's night with an emptied purse, and the thread list in the full build.

**Known limits**
- Saves from before the journal have no entries for the days already played.
- Ink's word count reads a `needs` tag as words, so each adds about three to the scene word totals.
- The threads name what's in play, not whether it will work: the ferry thread doesn't say whether you'll have the hundred rings. That's item 5's planning, not the journal's.

## 22. After M7: the Ragnarök report, the endings gallery, branching replays (audit item 4)

**What changed**
- **The ending screen reports how the run stood.** The host at Ragnarök part by part (worthy einherjar twice over, the unworthy against, Freyja's host and Hel's legion twice over, Naglfar's nails against), adding up to the host; what the endings ask of it (read from their conditions by `hostMarks`, so the 260 and 240 come from `campaign.yaml`, not the UI); each power's standing at the end, with whoever was ahead of the rest; and where the souls went. The host section only appears in builds whose endings read the host (not the demo).
- **Endings are kept per device.** Reaching an ending adds it to the device's settings (`endingsSeen`, any slot, any run; a slot that ended before this counts when it's opened). The slots screen lists the endings this build can reach (`reachableEndings`: those with a condition, and the finale), naming the ones found (their text behind a click) and not the rest. The report names an ending only once it's been found here: "An ending you haven't found: a host of 260 or more."
- **A replay can branch.** Each slot offers "Replay here" (as before: the day starts again and the later days are forgotten) and "Replay in a new slot", which copies the save up to that morning into the first empty slot and leaves the original as it was. With every slot full the button is off, and the note says to empty one.

**Tests**
- Engine: the host's parts add up to its strength; the reachable endings of the demo (3) and the full game (11); the marks (the green earth at 260 or more, the wolf at 240 or less; none in the demo). The campaign sim's reach test now uses the same list.
- e2e: the demo's ending reports standing and souls, counts 1 of 3, and the gallery names it alone; a replay in a new slot keeps the original at Day 2; in the full game, a quick Demoted ending shows the host and names neither unfound ending.

**Known limits**
- The marks give the host's part of an ending's condition only. The green earth asks for more (the wood, what you've learned, someone at home), which the report doesn't list, so as not to spell out endings not yet found.
- Endings found are kept per device and browser, with the settings; a new browser starts the gallery again.
- Replaying in a new slot needs an empty slot; there are three.

## 23. After M7: planning the night (audit item 5)

**What changed**
- **The night screen says what the bills as set will do.** The engine works out tonight (`nightOutlook`) with the same code the night itself runs, so the screen and the night can't disagree; only who falls sick by chance is left open, and the screen gives the odds instead.
  - The family list says how soon each sick person needs medicine ("needs medicine tonight", "within 2 nights").
  - Under the bills, one line for each consequence: who dies or is sent to relatives without medicine tonight, who stays sick and how many more nights they can go without it, who falls sick for certain after another cold or hungry night, and the chance for anyone else well ("30% each").
  - "After tonight" now counts Draupnir's rings on his nights (it used to leave them out, so on nights 9 and 18 it was 8 rings short), and the screen says when he drips.
- **Tonight's bills are in sight before the choices that cost rings.** An option with a `needs: rings` tag has the purse and tonight's bills (all paid) above it, and at night what it would leave after them, counting its own effects (the healer who cures Asa means no medicine to buy for her). The morning briefing gives tonight's bills too.
- **The nights ahead.** The bills card lists the next three nights' firewood and food (for those at home now) and medicine a head, marking Draupnir's nights (`billForecast`, which follows the vertical slice's jump and stops at the run's last day).
- **The debt that ends a run looks like it.** After a night below the floor, the morning and night screens carry a banner saying how many more end the run (the number read from the demoted ending's condition, `debtLimit`). When the bills as set would end the run, by the debt or with no one left at home, the bills card says so and Sleep asks first.
- Family members can have a short name for use in sentences, an optional `<name key>.short` string ("Ragna" beside "Ragna, your mother"); the night's news uses it too.

**Tests**
- Engine: a property test that the outlook matches the night itself on 150 random nights (purse, debt, every certain change, and chance only ever making someone well sick); who is lost, who surely falls sick and the odds; Draupnir and the debt that ends the run; no one left at home; the forecast in the full game, the demo and the slice.
- UI strings: every branch of the new messages.
- e2e: the night's consequences and the nights ahead, and the news the next morning; the purse and what an option leaves at Day 2's night; the debt banner, warning and the sleep that asks first, on the way to Demoted.

**Known limits**
- The preview of an option counts its effects up to the next choice in the scene, not what later choices would add.
- The forecast assumes the family stays as it is tonight: food for everyone at home now, medicine a head for whoever falls sick.
- Chance is shown as a percentage, not hidden. The design reason to keep it (skipping a bill is a gamble) still holds; the player just knows the odds.

## 24. After M7: assists (audit item 6)

**What changed**
- **Sun speed**: ×0.5, ×0.75, ×1, ×1.5 or ×2, as the plan had it. A slower sun is the same shift with more of it: the sun's length is divided by the speed, and tool costs and penalties stay as they are, so in effect everything runs at the chosen speed. Shifts with no sun (Story Mode, practice without sun, Endless, the primer) ignore it.
- **The rule tracker**: the rulebook greys out, and marks "ruled out", the rules that what the player has seen of the soul already rules out. It asks the solver for only what can't be wrong (`certainOnly`): no presumptions, and no saga tally believed, since it may be forged with the sign not yet seen; body signs, the ravens, tool readings, confessions and caught lies count. So it never greys out the rule that applies, which a property test checks on Days 1–20 with random parts of each soul seen and asked. With everything seen it rules out about 6.3 rules a soul (120 queues, Days 1–20), where on average 4.6 rules come before the one that applies.
- **No fines** in the campaign: citations still come but cost nothing, and the audit counts every mistake forgiven. Story Mode keeps its own no-sun, no-fines rule, and shows only the tracker.
- **Where they're set and kept**: device settings, in the title screen's settings and on each campaign morning. A shift takes them up with its `begin` action (the campaign's `beginShift`) and keeps them in its config, so a resumed Daily, a resumed campaign day and a bug report's replay all use the assists the shift began with, whatever the settings say now. The day's ledger keeps them too, and the audit says which were on.
- **Results say so**: a Daily played with another sun speed or the tracker adds them to its share text ("· sun ×0.5, rule tracker") and shows "Played with …" under its result on the title screen.
- **Telemetry**: shifts played with an assist aren't sent. The worker's schema is strict and has no field for assists, so it would refuse them; sending them means adding the field to the worker and deploying it first.

**Measured** (campaign sim, 40 runs per policy, plain story; `pnpm sim campaign` and `pnpm sim campaign --no-fines`)

| Bot | Night strategy | Demoted | Demoted with no fines |
|---|---|---|---|
| novice (65% right) | pays everything | 97.5% | 0% |
| novice | frugal | 42.5% | 0% |
| novice | upgrades first | 100% | 37.5% |
| careless (40%) | pays everything | 100% | 100% |
| competent (85%) | any | 0% | 0% |

Fines are what sink a novice. In a scratch run of 30 seeds, cutting every bill by a quarter instead (fines kept) still left 19 of 30 novices demoted, and at 80% accuracy none were. Novices who get through without fines mostly come to the wolf's ending: their mistakes leave the host at 240 or less. The sim can't measure the sun speed or the tracker, because its bots have an accuracy, not a clock; whether those lift real players' accuracy is for playtests.

**Tests**
- Engine: the sun speed from the `begin` action (only the speeds on offer) and dusk at the slower sun's end; the share text's notes; the tracker on a Day 1 soul (nothing ruled out before looking, the weapon rule once the empty hand is seen); the tracker's property test; fines waived and the day's ledger keeping the assists; a campaign day resumed mid-shift keeping its assists.
- e2e: the Daily with the sun at ×0.5 and the tracker (12:00 of sun, the rules the body rules out greyed and the one that applies not, the share text, the note under the result); a campaign day at ×2 with no fines (3:00 of sun, every mistake forgiven, the audit's note).

**Known limits**
- Assists apply from the next shift; changing one mid-shift does nothing to that shift.
- The tracker only greys rules out. It never says which rule applies, and it reads nothing from testimony or a tally, so it rules out less than a player who reads an honest tally rightly.
- Endless keeps one best score, with or without the tracker.

## 25. After M7: a lesson for each new mechanic (audit item 7)

**What changed**
- **The coach teaches every day that brings something new**, not just the primer. Each such day already puts a teaching soul first (`queue.teachFirst`); its spec now has a `lesson`, a few coach steps for that soul: Days 1–8 and 10–17 (Day 9 brings nothing new). The lessons are content, in each pack's day files with their text in the pack's strings, so the campaign's never reach a demo build.
- **A step** names what to highlight (`focus`) and what ends it (`until`): a field looked at (by id, or `whim:<param>` for the sign the day's whim reads, worked out on the day), a tool used, the body turned over, or a lie caught; or it's a reading step ended by Next. The last step lasts until the soul is judged. Steps a soul can't give are left out: on Day 2, "catch the lie" only shows when the fled soul lies (35 of 40 teaching souls).
- **Who is taught**: campaign and practice shifts, on the day's first soul, when it is the teaching soul. A lesson is taught once per device: judging its soul, or skipping it, records the day (`coached` in the settings). Days 1–3 are skipped for anyone who has played the primer, which teaches the same. A setting turns the lessons off.
- **The primer's steps now use the same form**, so one coach runs both.
- **New highlights**: hair, neck, the registry, the rune-lens, the clippers, the ravens, the tally and Compare.
- **The compiler checks** each lesson: a teaching soul to ride on, known highlights, strings that exist, tools taught by that day, a whim param the day has, and a last step that waits for the stamp.

**Tests**
- Unit: every lesson can be followed to its stamp on 25 generated teaching souls a day, by a player who does only what each step asks; lessons show once, not after the primer for Days 1–3, and not when turned off; the primer's steps are as they were.
- e2e: Day 6's lesson in practice (the registry highlighted, then the stamp), gone for the next soul and the next practice; skipping Day 8's; the setting off for Day 7; Day 1's lesson in a new campaign.

**Known limits**
- The sun keeps running during a lesson. Most steps ask for what the soul needs anyway; the reading steps cost a few seconds.
- The lesson texts are first drafts for the writing pass.
- A lesson rides on the day's first soul only. A player who fumbles it gets no second lesson that day, though replaying the day doesn't bring it back either (it's recorded once the soul is judged).

## 26. After M7: Skögul's hint (audit item 8)

**What changed**
- **A Hint button (and H)** asks Skögul where to look, for 15 seconds of sun (`PENALTY.hint`; a question costs 20). The engine's `hint` action points at the first piece of the soul's deciding evidence (its minimal proof, `meta.proof`) that the player hasn't looked at and she hasn't already pointed at, and keeps what she pointed at in the soul's state, so replays and resumes are exact.
- **She says where, not what**: "Skögul points at the hands", "taps the registry", "hands you the rune-lens", "looks up at the ravens". What she pointed at stays highlighted (the coach's highlights) until the player has looked, with the flip highlighted too when it's on the other side of the body.
- **Nothing left to show**: once everything that decides the soul has been seen, the button is off and says so, and asking costs nothing. Following her hints to the end always shows enough to decide the soul, given the answers of a liar who confesses when questioned (a property test on Days 1–20).
- Not offered in Endless (a score with no sun) or the primer (the coach leads it). Shifts without a sun (Story Mode, practice without sun) get hints for free.
- The rulebook's costs line and the keys line mention it.

**Tests**
- Engine: the first hint points at the first unseen proof field, for 15 s; the next at the next; nothing to point at (and no cost) once the proof has been seen; the property test above.
- UI: every proof field on Days 1–20 has a line and a highlight the coach knows.
- e2e: in the Daily, a hint costs 15 s of sun, names a place and highlights it, and a careful player's look at everything leaves the button off with its reason.

**Known limits**
- A hint isn't counted anywhere: the Daily's share text, the audit and the endings don't know it was used. It costs sun instead, like a question.
- She points in the proof's order, not at what's quickest to check next.
- When a soul can only be decided by a liar's confession, she never says to question them: she only points at evidence.

## 27. After M7: more reasons to replay Endless and the Daily (audit item 9)

**What changed**
- **Today's Endless.** The Endless card offers today's run, numbered like the Daily (`Endless #91` on 2027-03-01, a dated preview before `DAILY_EPOCH`) and the same for everyone (`endlessSeed(n)`), and a free run with a seed of its own (the old Endless). Today's counts once: its result is kept on the device (`endlessToday` in the settings) and stays on the card with its share text, and today's run can't be begun again.
- **Share text** says how many souls, how far and on which day's rules, and whether the rule tracker was on; never where anyone went. `Chooser of the Slain · Endless #91 (g1)` / `23 souls judged rightly · round 9, Day 9's rules`. A free run shares as `Endless · free run`.
- **A run survives a reload.** It is saved after every action, as the Daily's progress is (IndexedDB plus a synchronous localStorage mirror): the run as its round began, the round's actions, and the score as it stands. Resuming rebuilds the round, replays the actions and leaves it paused on the soul it was left on. After an update that changes the generator, the round starts again from its first soul; the rounds before it keep their score. Starting another run ends a saved one where it stands (and records it, if it was a day's run); while today's is under way, the card offers only Resume.
- **Twists.** A round that brings nothing new takes a twist: a day with no teaching soul (Days 9 and 18–20) and every round after the last day; in the demo, every round after Day 3. A twist is its own decree plus different knobs or a different destination mix for the day's souls, never different rules; with nothing new to teach, the day's teaching soul no longer comes first. Twists are content (`endless.yaml` in the demo and campaign packs, each `since` the first day whose mechanics it needs), drawn per round from the run's seed (`endlessTwist`); `endlessContext` gives the round's day context with the twist in it, so the briefing and the rulebook show the twist's decree. Demo: liars, the straw-dead, a battle's worth of the fallen, mist (more decoy cues). Campaign: Freyja's day, a sea battle, the forgers, Loki's friends, Muninn forgetting. The full game draws from both lists.
- **Past Dailies.** The Daily card has a fold listing every earlier Daily, newest first, with this device's result if it was played here. One plays from this build's generator for its own sake: never recorded, streak untouched, and marked "from the archive" in the briefing and `(archive)` in the share text. `dailyDate(n)` dates them (the inverse of the Daily's numbering).

**Tests**
- Engine: which rounds twist (full: 9 and 18–20 and every round after 20; demo: from round 4); a twisted round keeps its day's rules and reads its twist's decree, and doesn't open on the teaching soul; every twist makes a full round on every day it can come to; the liars twist makes more lies than the day it twists; the share text, with and without the tracker; `dailyDate` against the Daily numbering (and a property test that it undoes `daysFromCivil`).
- Compiler: twist lints (a duplicate id, a missing decree string, `since` after the build's last day, a mix asking for souls no rule sends anywhere by then, an empty range).
- e2e: today's Endless resumed after a reload with its strike, recorded once, its share text kept on the title card after another reload, then a free run saved; the demo's round 4 twist (its decree, the score carried over); a Daily from the archive played to the end leaves today's Daily and the streak alone.

**Known limits**
- Nothing stops a player from clearing site data and playing today's Endless again. As with the Daily there's no server; it's an honor system.
- An archive Daily is regenerated by the current generator, so after a generator change it can differ from what players got that day (the share text's `(gN)` says which).
- A twist changes knobs and the mix, not rules, so late twists change the flavor more than the difficulty. Measured on the days Endless twists (full game: Days 9 and 18–20, 40 seeds each; demo: Day 3), first five souls: no fallbacks, about 1.03 attempts a soul; the mix twists move the souls as meant (the straw-dead: HEL 33% to 52%; the battle: Valhalla 17% to 45%; Freyja: Fólkvangr 8% to 24%; the sea: Rán 12% to 29%; Loki: DETAIN 8% to 21%). The liars twist doubles each soul's chance to lie, but most late souls already lie when they can (one lie at most), so it adds 11% more lies in the full game and 40% in the demo. The other knob twists (mist, forgers, Muninn) change the evidence, not where anyone goes. The twist texts are first drafts.
- Only the latest day's Endless result is kept (plus the best score): no history or streak.
- Endless still sends no telemetry. Archive plays are sent like a replayed Daily (both are marked only by the Daily number), so alpha numbers per Daily can include players who already knew the souls.
- A soul report from a twisted round carries the round's seed (`<run seed>|endless|<round>`), but rebuilding that soul needs `endlessContext`: the Case Lab's seed-and-day input gives the untwisted day.

## 28. After M7: save safety (audit item 10)

**What changed**
- **Backups.** Settings has a Saves section. Back up gives a file to download, and the same text to copy where downloads are blocked (some itch.io frames). It holds everything worth keeping: the campaign slots, Daily results, the Endless best and the latest day's result, endings found, lessons taken, and any unfinished Daily or Endless run. Restore reads a file or pasted text. `packages/ui/src/save-data.ts` has the format and the merge rules (pure, tested); `saves.ts` the storage.
- **Restoring merges; it never writes over anything newer.** Daily results this device lacks are added; one it has stays. A campaign goes into its own slot if that's free, else the first free one; if the same run (same seed) is already here, whichever copy was saved later wins; with no free slot it's reported and skipped. Records merge: the higher Endless best, every ending and lesson from both, the later day's Endless result. This device keeps its own settings (layout, text size, sound, assists and, above all, its telemetry answer). An unfinished run comes along only where there's none here, and a Daily only if it's today's, on the same generator, and not yet played here. Text that isn't a backup, or a backup from a newer version, is refused with a reason.
- **Unreadable saves are kept, not taken for empty.** A slot whose copies (IndexedDB and localStorage) can't be read, because they're damaged or written by a newer version, used to show as empty, so a New campaign would have written over it. Now it's shown as unreadable, with Save a copy (the data as found, for a bug report) and Clear this slot (confirmed). Nothing writes over it until then, and branching skips it. A save that reads but won't open (the engine rejects it: a day this build doesn't have, say) is marked the same way when opened. The slot check now also covers what the slot list reads of each morning, so a save broken inside can't break the list. Settings and a Daily record this build can't read are set aside under `<key>.unread` before anything writes over them, and backups carry them.
- **Asking the browser to keep the saves.** A browser may clear a site's data (Safari after 7 days unused unless the game is on the Home Screen; others under storage pressure) unless it grants persistent storage. The game now asks (`navigator.storage.persist()`) once a session when a campaign is saved, as it did after a ranked Daily and now also after a day's Endless run. The Saves section says whether the browser has agreed, may clear the saves, or keeps them only for the tab (a private window); the campaign's slot list suggests a backup when saves may not be kept.

**Tests**
- Unit (`save-data.test.ts`): reading (not JSON, not a backup, a newer version); Daily results added and never replaced, bad ones skipped; this device's settings kept, only the records in them merged; where a campaign goes (its own slot, the first free one, none free); the later copy of the same run wins, with a revision past this device's so it's the copy loaded next time; unreadable slots never written over; unplayable and damaged campaigns in a backup skipped; unfinished runs taken on only where allowed; a whole device restored onto an empty one.
- e2e (`saves.spec.ts`): a backup (the text, and the downloaded file) restored into a fresh browser brings the Daily results, the streak, the Endless best and the campaign, but not the text size, and restoring it again changes nothing; text that isn't a backup, or is a newer one, is refused; a damaged slot and one that won't open show as unreadable, survive a reload, can be copied, and are cleared only when asked; the persistence request once a campaign is saved, and the status line before and after.

**Known limits**
- Nothing is automatic: the player has to make a backup. Each browser grants persistent storage by its own rules (Chrome by engagement or installation, Firefox asks the player, Safari decides for itself), so asking guarantees nothing.
- The Steam and Play shells get their own file stores later (M6, M9). There, a blob download may do nothing (Android's WebView doesn't handle them), so copying the text is the way until those shells add a native save dialog.
- A backup is plain JSON and easy to edit; a restored Daily result is taken at its word, like everything else on the device (there's no server).
- The demo refuses a full game's campaign save that has days it doesn't have; the other way round works.
- Three late campaigns make a backup of a few hundred KB (a Day 20 save is about 135 KB): fine as a file, heavy to paste on a phone.
- Only campaign slots, settings and the Daily record are protected from being written over when unreadable. Unreadable unfinished Daily or Endless progress is ignored, as before.

## 29. After M7: small fixes from the audit

**What changed**
- **Leaving a shift.** The pause screen of a practice, primer, Daily or Endless shift now has Leave (a campaign day keeps its Save and quit). A line under it says what leaving does: a practice shift ends; the primer can be taken again from the title screen; today's Daily and an Endless run wait on the title screen, paused where they were left (both are already saved after every action); a replayed Daily isn't kept.
- **Costs after upgrades.** The Question button and the rulebook's costs (each tool, and a question) show what they cost in this shift, after the campaign's upgrades (`toolCost`, `questionCostMs`). They used to show the base price (a question always said 20 s).
- **The keys line** counts the stamps the build has (`1-5 stamps` in the demo, `1-7` in the full game) and names G, the registry, where the build has one.
- **A rule's wording by day.** A rule can take new wording from a given day (`texts: [{ since, text }]` in the rulebook; `ruleText(rule, day)`), so the rulebook, citations and the morning's list of changes show the wording in force that day. The Valhalla rule no longer says "(from day 2)": on Day 1 it says "fell in battle, weapon in hand", and from Day 2, when turning the body over is taught, it adds "and never fled". Day 2's morning lists it as Changed. (What the rule asks already changed that day, through `pred.worthy`'s versions; only the words lagged.) The compiler checks that each later wording's string exists and that the days go up.
- **The story's names are kept for the story.** The demo and campaign packs reserve names in `names.reserved.*` pools: the family's (Ragna, Ulf, Asa) and the story's (Thorvald, Geir, Hrafn). No generated soul is given one, or has a father of that name. Before, over 40 runs of 20 days, a run met about 7.5 generated Ulfs, 3 Asas and 8.5 Hrafns, and 48% of Day 12s had a generated Hrafn in the same queue as the story's (Loki, wearing a dead hero's face that day; the audit counted 31% with its own seeds). After: none.
- **Fewer look-alikes.** Days that spread their looks (`spreadLooks`, set on every demo and campaign day, never the Daily) give each soul its name, and its build, beard and clothing colour, by its place among the day's souls of its gender. Each name and each combination is used once before any is used twice. The clothing colour is now part of the look (`look.tunic`, which the art styles use, else the old hash of the name). Over the same 40 runs, pairs of souls in a day with the same gender, build, beard, hair and clothing went from 1.27 on Day 20 (5.25 when clothing is ignored) to none on any day; the same name twice in a day went from 5 cases to none.
- **A font for runes.** A forgery sign quotes the rune ᛗ, and a system without a runic font shows a blank box. The game now ships Noto Sans Runic (SIL Open Font License 1.1; the runic block only, 6.6 KB) first in its font list, for U+16A0–16F8 only, so the browser fetches it only when a rune is on screen.
- (The forged tally's confession giving two contradictory reasons was fixed with audit item 1.)

**The Daily is unchanged.** Its spec spreads nothing, and the reserved pools are in the demo and campaign packs while the Daily is built from the core and daily packs only; its pinned checksums hold. Golden summaries for Days 1–20 changed in names only.

**Tests**
- Engine: a property test on Days 1–20 (12 random seeds a run): no reserved name given or used as a father; each gender's names, and its build-beard-clothing combinations, are all different until there are more souls of that gender than names or combinations. The Daily's spec and pools are left alone. `ruleText` picks the latest wording by the day.
- Compiler: a later wording with a missing string, or out of day order, is refused.
- e2e: leaving a paused practice shift, Daily (resumed on the same soul) and Endless run (kept with its score); the keys line in both builds; on the campaign's Day 2 the Valhalla rule is listed as Changed, and after the horn of mead the rulebook at the gate says a question costs 15 s; on Day 11 the rune in a forgery sign is drawn with the bundled font, read from Chromium's record of the fonts that drew it. Without the fix, a system font drew it (FreeMono, on this machine).

**Known limits**
- The pools run out on the busiest days. There are 22 men's and 19 women's names to go round, and 48 looks for men but only 12 for women (three builds, four colours). Over 2,000 runs, 2 Day 20s had more than 22 men and repeated a name, and 1 had 13 women and repeated a look: about 1 run in 700. More names in the demo and campaign pools, and more women's looks in the art, would remove it.
- Souls of the same gender, build, beard and hair still meet on busy days (2.0 pairs on Day 20): their clothing tells them apart. At a glance, the woodcut's clothing colour is the smallest of those differences.
- The Daily keeps its old names and looks, as changing them would change the live Daily. With 8 souls, repeats there are rare.
- The runic font isn't in the web demo's offline cache: the demo shows no runes. Other scripts outside the fonts players have would still show blank boxes; the game uses none.
- What a player sees in the Leave note is a first draft, like the other new texts.

## 30. After M7: screens open at the top

**What changed**
- **Every screen opens at its top.** Nothing reset the scroll when the screen changed, and a scene gave the keyboard's focus to its first option, at the bottom, with a plain `focus()`, which scrolls the page to it. Measured on the phone before the fix, each screen opened at the very bottom: Day 1's morning at 341 of 341 px, the night at 302 of 302, the night's bills after its scene at 146 of 146, and Day 2's morning at 128 of 128. Now `App` scrolls to the top whenever `screen` changes, and so does each part of a screen: a scene when it starts, and whatever follows it (the day's orders, the night's bills, or the next scene).
- **Focus never scrolls the page.** `useAutoFocus` and the scene give focus with `preventScroll`, so the keyboard still starts on the same button while the page stays at its top.
- **A choice in a scene** brings the lines it adds (the chosen line, then what follows) to the top of the view, with a little room above (`scroll-margin-top`), or as near as the page's end allows. The next option takes the focus. Before, the page stayed pinned to its end.
- **A reload** opens at the top (`history.scrollRestoration = 'manual'`). The browser used to put the page back where it had been scrolled, though the screen it reopens may be a different one.
- **The phone's evidence tabs** each open at their top (the panel is keyed by tab). Before, a tab opened where the last one had been scrolled to.
- The helpers are in `packages/ui/src/scroll.ts` (`toTop`, `toTopOf`).

**Tests**
- e2e (`scroll.spec.ts`, phone and desktop). Each of these opens at the top after the last screen was scrolled to its end: the campaign's slots, Day 1's morning scene, its orders, the audit, the night, its bills, and Day 2's morning. After each scene choice, the first new line is at the top of the view (or the page is at its end) and the next option has the focus. Also covered: the title's way into a practice shift and back, a reload, and the phone's tabs. Without the fix, 6 of the 7 fail; the desktop briefing fits on its screen either way.

**Known limits**
- The page jumps at once, with no animation.
- Overlays (the journal, citations, dialogs) open over the page, which stays where it was underneath, as before.
- On a small phone, a screen's first button can now start below the fold. It still has the keyboard's focus, so Enter works as before.

## 31. After M7: a readable script for reviewing the story

**What changed**
- **`pnpm story:script`** (`tools/story-script/`) writes the story as one page (`dist/story-script/index.html`, and `page.html` for publishing as an artifact).
  - `parse.ts` reads each scene's source into rows in the small part of Ink the scenes are written in: lines with speakers, options (their conditions, `#needs: rings N`, `+`), `{ cond: … }` blocks with `- cond:` and `- else:` branches, gathers, jumps (with and without a condition), parts (knots), effect tags, and inline `{cond:a|b}`. Anything else is refused rather than shown wrong.
  - `expr.ts` parses the conditions and says them in words ("Ulf is at home", "you have 5 rings or more"), turning them round for "otherwise".
  - `model.ts` puts together days, scenes, story souls, endings, journal threads and a flag index: every option, story-soul stamp and slice jump that sets a flag, and every scene, story soul, ending and thread that reads it.
  - `render.ts` makes the page: the game's palette in both themes, and each line with its `.ink` line number.
- **Review.** Each scene has Approve, Needs changes and a note.
  - Published as an artifact with the `db` capability, the page keeps one document per scene in `reviews/<scene>`: `{scene, verdict, note, hash, at}`. `hash` is the scene's source hash when reviewed, so the page flags a scene rewritten since. Claude reads the collection to apply a review.
  - Opened as a local file, the page keeps the review in `localStorage`, and Copy review gives the text, with the `pnpm story:approve` command for the approved scenes.
- **`pnpm story:approve <scene…>`** signs scenes off. It removes the `# draft` line and the draft comment under it.
- **What the index found.** 45 flags. None is read without being set somewhere. 22 are set but read nowhere yet, which means choices with no later consequence beyond their own effects: `asked_namesake`, `asked_twice`, `broke_loki`, `covered_loki`, `ferryman_doubted`, `geir_judged`, `heard_pension`, `helped_clerk`, `kept_quiet`, `letters_honest`, `letters_kind`, `loki_in_valhalla`, `promised_medicine`, `refused_loki`, `reported_carver`, `reported_loki`, `roof_mended`, `sided_freyja`, `sided_hel`, `sided_odin`, `told_skogul`, `ulf_fine_paid`. No code reads them either.

**Tests** (`tools/story-script/script.test.ts`)
- Conditions in words, both ways round, and the flags they read.
- A sample scene read row by row, with its nesting.
- Ink the script can't show is refused.
- Every line and option the game can show, on every path through every scene in three runs (fresh, gone badly, gone well, as the compiler walks them), is in the script: over 2,000 lines.
- The flag index for known flags (`ulf_shipyard`, `geir_hel`, `wood`), and no flag read without a setter.
- Signing off changes only the draft mark.
- The page: every scene, review control and flag entry is present, there is one script (the page's own), and the story's text is escaped.

**Known limits**
- The script shows each scene as written, with its structure. It doesn't show one playthrough at a time.
- Only scenes and story souls' lines are in it. The dead's everyday lines, question answers and decrees come from string tables, not from scenes.
- Word counts are Ink's own, as the writing budget uses them.
- Reviews are per scene. A note points at lines by their numbers.
- The review lives with one published artifact. Publishing again from another conversation without its link makes a new, empty one.
- The page loads its fonts from Google Fonts, and uses system fonts when offline.

## 32. After M7: more campaign (phase 2)

**What changed**
- **Ten story souls** (`content/packs/campaign/cases/`), each validated by the compiler on its day under every param choice (Freyja's whims, Odin's claims):

  | Day | Soul | Comes when | Stamp | What it tests or pays off |
  |---|---|---|---|---|
  | 4 | Old Hrolf, who helped Ulf patch the roof | `roof_mended` (Day 2) | HEL | An honest straw death; the night's letter reports it |
  | 5 | Solveig, a neighbour drowned at the herring | always | RÁN | Rán's first day; Ulf's letter carries the news |
  | 8 | Hallbjorn, the smith from Day 7 | `ulf_fine_paid` or `ulf_debt` (two versions) | VALHALLA | A braggart swearing his copied Ulfberht is real |
  | 9 | Thorvald's second visit | `thorvald_returned` (Day 3) | RETURN | Still alive |
  | 10 | Bard, a shipwright from Ulf's yard | `ulf_shipyard` (Day 9) | RÁN, clipped | Drowned with long nails: the Naglfar decree |
  | 13 or 15 | Bjarni, the tally carver from Day 11 | `reported_carver` set (Day 13, drowned by the jarl) or not (Day 15, old age) | RÁN or TRANSFER | His own forged tally claims a battle |
  | 17 | Thrand, an old skald | always | VALHALLA | The spear mark |
  | 19 | Halla, the midwife who delivered you | always | TRANSFER | Hel's hall is full |

- **Sun.** Days 5, 17 and 19 always get a soul more, so they get 30 s more sun (570, 910, 950). A conditional soul adds a soul without adding sun, as Geir's and Loki's days do.
- **Names.** Every story soul's name is in its pack's `names.reserved.*` pool, and the compiler now fails a story soul whose name isn't. The new names (Hrolf, Solveig, Hallbjorn, Bard, Bjarni, Thrand, Halla) aren't in the generated pools, so generated souls, the goldens and the Daily are unchanged.
- **Words.** Archetypes and story souls take `words`, by pool (`{ pool.weapons: seax }`), which fix the words their generated lines use; the facts' own words still win (an Ulfberht is a sword). A fisherwoman no longer mentions "my sword". The compiler checks each word is in its pool, as it does for facts.
- **Scenes.** Days 4–6 are fuller (about 860 words to 1,340), with the same choices and effects, so the bots choose as before. Lines across Days 4–19 now read the 22 flags nothing read (§31), and two new stamp flags (`hrolf_judged`, `solveig_judged`) keep a night from mentioning a soul you never judged. Day 6's night had said "You didn't see him" to a player who had judged Geir with a third stamp; it now reads `geir_judged`.
- **The story script** says a comparison of two of the run's numbers in words ("letters_honest is more than letters_kind"), and the flag index has no flag left that's set but read nowhere.

**Tests**
- Compiler: a story soul with an unreserved name fails, and so do words from an unknown pool or a word its pool doesn't have.
- Engine (`campaign/run.test.ts`): every story soul with `words` has them in its evidence and says no other weapon; a fact's words win over the soul's (Hallbjorn's copy stays a sword). Without the change, the test fails.
- The compiler's check of each placed soul, which fails if a soul goes elsewhere (checked by sending Halla to HEL on Day 19: the build fails).
- The campaign sims: the good bot isn't demoted, the bad bot is, and every ending is still reachable.

**Known limits**
- All the new writing is first draft, for review in the story script.
- A story soul also says generated lines (how it died, its weapon, its back), fixed per content version and day param. Each new soul's lines were read together with its generated ones, and the clashes rewritten, but a later change to the templates can bring a new one. The script shows only the written lines.
- The sims' story policies choose by effects. None pays 5 rings for the roof, so Old Hrolf never appears in the economy sims; the compiler still proves his day works.

## 33. After M7: the desk's feel

**What changed**
- **Ink.** A chosen stamp leaves its ink on the soul: the destination's name in a double border, rotated, in a dark ink of the stamp's colour family, landing with a thud. It sits over the legs, below every hotspot (the lowest ends at y 336 of the 420-unit frame), takes no clicks and is hidden from screen readers; the stamp button already says which stamp is chosen. Choosing another stamp re-inks. A stamp button also presses down under the hand.
- **Souls walk up and off.** A new soul walks up from the queue (0.36 s). A sent soul walks off the way its stamp sends it (0.42 s): up for Valhalla and Fólkvangr, down for Hel and Rán, back the way it came for RETURN, aside for TRANSFER and DETAIN. The one walking off is a copy (`shift/motion.ts`): its drawing and ink only, with no buttons, roles, labels or test ids, inert and hidden from screen readers. It fades early, so the next soul can be looked at straight away. The copy is taken in a plain signal effect on `departed`, which runs as the send's batch ends, before the desk re-renders. Taken later, it would be of the next soul, or of a squeezed stage while both are mounted.
- **Papers.** On the desk layout the soul's papers slide in as it walks up, one after another; the rules stay put.
- **Moving papers** (the plan's "papers can be dragged around", `shift/desk.ts`, `shift/papers.ts`). Each paper on the desk layout has a title strip that picks it up. A press that doesn't move is a click, not a drag.
  - A moved paper leaves its column and lies loose, over the others, the last moved on top. It's positioned across the whole desk, not in its grid area.
  - Its spot is a fraction of the desk, so it survives a resize. It keeps its width and stays on the desk with its title in reach, and the stamp rack stays on top of it.
  - The settings keep the spots (`deskPapers`) for the next shift and a reload.
  - A double click on a title puts that paper back; "Tidy the desk" puts them all back.
  - The drag listens on the window, because a paper leaving its column replaces its element.
  - The drawer layout (phones) has no loose papers.
- **The sky** (`shift/sky.ts`). The ground behind the desk goes from warm to rose (a third of the day left) to dusk blue as the sun goes down, a two-colour gradient re-rendered with the sun's tick. The style only changes when the daylight moves a hundredth.
  - The stage and the papers keep their own grounds, so the signs are as easy to see as the art promises.
  - Every sky colour keeps the desk's text (ink, muted, accent) at 4.5:1 or better. The first draft's day colour had muted text at 3.9:1 and was darkened.
- **Reduce motion.** A new setting, `reduceMotion`. With it, or the device's own reduced-motion setting, the stylesheet stills every animation and no soul walks off. The ink is simply there, and the sky still changes colour, since that's the time of day rather than movement.
- None of it changes the game: no state, no timing, no focus, and the Daily is unchanged.

**Tests**
- Unit (`shift/sky.test.ts`, `shift/papers.test.ts`):
  - the sky darkens at every step from dawn to dusk, and the text stays at 4.5:1 on it;
  - loose papers stay on the desk, and the pile renumbers in order.
- e2e (`tests/e2e/desk.spec.ts`), phone and desktop:
  - A fast player plays the Daily at full speed. Each soul is stamped and sent as it walks up, and each new soul's first sign is clicked straight after a send, which the copy walking off must not intercept. Every soul's ink is checked. Every soul walks off the right way with its ink, holding nothing but a picture, and is gone afterwards. 8 of 8 judged rightly.
  - With the setting, and separately with the device's reduced-motion setting: no animations, no soul walking off, the ink still shown.
  - Desktop only: a paper dragged by its title lands where it was put. It stays there for the next soul and after a reload. A click isn't a drag, a double click puts it back, and "Tidy the desk" puts all back.
  - Under a fake clock: the sky is darker four minutes in, and darker still at dusk.
- `art.spec.ts` now waits for the soul to finish walking up before measuring where it stands.

**Known limits**
- The motion is a placeholder for the art direction to restyle ([`docs/art-brief.md`](art-brief.md), "Motion"). No sound was added: the stamp and send already have their placeholder sounds.
- Dragging is for a pointer (mouse, pen or touch on a tablet's desk layout). Keyboard and screen-reader players keep the papers in their places, which lose nothing.
- A paper can be put down over the body. That's the player's arrangement, and "Tidy the desk" undoes it.
- The walking-off copy duplicates the drawing's SVG ids for 0.4 s. The shared hatching patterns are identical for every soul, and each soul's clip path has its own id, so nothing draws wrongly.
- Whether the motion feels right is a matter for playtesters, not tests.

## 34. After M7: achievements (phase 6)

**Rules**
- Achievements reward skill or finding something, never playing a lot: no counts of Dailies played, souls judged in total or days survived.
- Accuracy counts with assists on. Speed, and doing it without help, don't.
- Daily achievements count only the day's Daily played for the record (`ranked`). A past Daily from the archive, or today's played again, doesn't count, because its answers can be known.
- The primer walks the player through its souls, so it earns nothing. The failure endings (demoted, an empty house) earn nothing.

**Content** (`achievements.yaml` in any pack, `AchievementSchema`). Each achievement has:
- an id;
- title and text string keys;
- `hidden`: unnamed in the gallery until earned;
- `when`: the moment it's checked at and a test there. The test is a StatePred, the same form endings use, over that moment's numbers (`engine/achievements.ts`):

| Moment | Checked | Numbers |
|---|---|---|
| `soul` | as each soul is judged | `correct`, `lies`, `caught`, `questioned`, `confessed`, `hints`, `afterDusk`, `story`, `day`, `assisted`, `stamped.<DEST>` |
| `shift` | as a shift ends | `total`, `judged`, `correct`, `wrong`, `perfect`, `lies`, `caught`, `missedLies`, `hints`, `questions`, `confessions`, `sunLeft` (percent), `dusk`, `day`, `assisted`, `untimed` |
| `endless` | as each Endless soul is scored | `score`, `round`, `strikes` |
| `run` | whenever the campaign run changes | the run's own paths (`STATE_PATHS`: flags, standing, family, day…) |
| `ending` | as a run ends | the ending's id |

- `soul` and `shift` also name the modes that count: `daily`, `archive`, `practice`, `endless`, `primer`, `campaign`.
- A soul's numbers come from the shift as it stood just before the send, while its hints and questions are still on it.
- A shift's numbers are rebuilt from its action log (`traceShift`), so hints on every soul count.
- The compiler checks strings, unique ids, that each test reads only what its moment has, and that each ending exists. Achievement ids join their pack's leak tokens, so the campaign's stay out of the demo builds.

**The first 21** (first-draft text; the demo builds have the first 8):

| Pack | Achievement | Earned by |
|---|---|---|
| core | Asked nicely | questioning a liar until they confess |
| core | Last light | judging a soul rightly after the sun has set |
| core | Nothing gets past you | calling out every lie in a shift that tells at least three |
| daily | Clean slate | a perfect Daily (assists allowed) |
| daily | Nobody's help | a perfect Daily with no hints and no assists |
| daily | Home before dark | a perfect Daily with half the sun left, no assists |
| demo | The long watch | 25 souls rightly in one Endless run |
| demo | Not a scratch | 15 souls rightly in Endless before the first strike |
| campaign | the nine story endings | each ending, hidden, titled as the ending |
| campaign | Stitched | detaining Loki (hidden) |
| campaign | Unlucky, not dead | sending Thorvald home on Day 3 and on Day 16 (hidden) |
| campaign | Nobody left behind | reaching Ragnarök with the whole family home |
| campaign | Spotless | a perfect campaign day, Day 10 or later |

**In the game**
- The settings keep what's earned (`achievements`: id → the time first earned), so it's on the device and in backups like the other records.
- A backup merges by id, keeping the earlier time. Ids the build doesn't have come along, as endings do, so a full-game backup keeps them when it goes through the demo.
- A notice names what was just earned. Earned during a shift, it waits for the next screen that isn't the shift, so nothing covers the desk while the sun runs; a shift begun while one is showing hides it. It sits at the top for a few seconds, takes no clicks, and is a polite live region for screen readers.
- The gallery is a card on the title screen: earned ones with their date, the rest marked "Not yet earned", hidden ones as "Hidden" until found.
- Records from before achievements count. On every start, and after restoring a backup, the game grants what they show: endings found, the Endless best, and Dailies played for the record. A test that reads a number a record doesn't keep, such as hints or strikes, isn't guessed at: it isn't earned that way.
- `Platform.unlockAchievement(id)` tells the platform. It's called for each new achievement, and for all of them on every start, so an adapter must take the same id twice. The web builds do nothing with it. The Steam adapter (M6) and the Play adapter (M9) map the game's ids to the platform's own. Google Play makes up its own ids, so its adapter needs a table.

**Tests**
- Engine (`achievements.test.ts`), on real content, with a bot playing Daily #41:
  - fast, alone and perfect earns the Daily's three, but only as `daily`;
  - a hint, a slower sun, a late finish or a wrong stamp each cost the right ones;
  - a confession found by calling out a lie and questioning it;
  - every lie called out, and one left;
  - a soul judged in the grace after dusk;
  - Endless scores, and a best score kept without strikes, which can't earn the clean run;
  - run flags, the family at Ragnarök, the story endings, and the failure endings earning nothing.
- The campaign sim notes achievements as it plays. The "every ending is reachable" test now also requires each achievement only the campaign can earn to be earned by some bot. A misspelt flag in a test fails it.
- Compiler: missing strings, duplicates, a number a moment doesn't have, an unknown ending, and unknown modes or moments. Also that achievement ids are leak tokens.
- Backups (`save-data.test.ts`): merged by id at the earlier time, unknown ids kept, junk dropped, no change when there's nothing new.
- e2e (`achievements.spec.ts`), phone and desktop:
  - A Daily played with one liar questioned. "Asked nicely" is kept the moment the liar is sent but not announced during the shift. The summary announces it with the Daily's three.
  - The gallery shows 4 of 8, with dates, and so it stays after a reload, with no second notice.
  - In the full game, a hidden achievement is unnamed. Records seeded from before achievements (an ending, an Endless best of 30) earn the ending's and the long watch after a reload, but not the clean run.

**Known limits**
- The achievements are kept in the browser's storage and can be edited there. There's no protection, and the Steam and Play builds will pass on whatever the game says.
- "Home before dark" asks for half the sun. Bots spend 26–50 s of the Daily's 360 s on the evidence itself, but how long players take to read is a guess until playtests.
- Hidden achievements are hidden in the gallery only: their strings are in the full build.
- Steam and Google Play achievements need those builds. Nothing is sent anywhere from the web.
- The text is a first draft.

## 35. After M7: accessibility pass (phase 5)

**What was measured.** Before any change, every screen was walked on the phone (412×915), the desktop (1920×1080), and a 360×740 phone with the text at 175%. axe-core ran its WCAG 2.2 A and AA rules and its best practices on each:
- **WCAG A/AA:**
  - muted text and quiet buttons in the citation and report dialogs at 1.84:1 on the paper colour;
  - unlabelled share and report text boxes;
  - two scrolling areas a keyboard couldn't reach: the phone's Rules tab, and the night's "nights ahead" table.
- **Best practice:** the shift had no main landmark or level-one heading, and headings skipped a level in the briefing's rules, the journal and the phone's Rules tab.
- **Taps:** 11 kinds of control on the phone were under 44 px:
  - the small buttons, at 36 px (back up, restore, buy, skip the lesson, report);
  - the two dropdowns, at 33 px;
  - the campaign slots' Story Mode checkbox, 23 px tall, under WCAG's own 24 px floor.
- **175% text on 360 px:**
  - The shift was unusable: Pause and Judge sat past the screen's right edge, the sun meter shrank to nothing, and the evidence got about 75 px.
  - The title, morning and journal were wider than the phone. The settings' dropdowns and the assists fieldset wouldn't shrink, and neither would the Daily card's grid column once the archive's dropdown was there.

**What changed**
- **Contrast.** Muted text and quiet buttons on paper use `--paper-muted` (#675743, 5.6:1).
- **Labels and structure:**
  - The text boxes have labels.
  - The phone's evidence panel is a proper tab panel: labelled by its tab, and it takes the focus so a keyboard can scroll it. The nights-ahead table is a focusable, labelled region.
  - The shift screen is a `main` with a hidden level-one heading, its mode's title.
  - Heading levels no longer skip: the briefing's rules card has its own heading, each journal day is a heading, and the phone's Rules tab has a hidden one.
- **Touch targets.** On a touch screen (`pointer: coarse`), small buttons and dropdowns are at least 44 px. Story Mode's label is 44 px tall everywhere. Checkboxes and radio buttons are 1.5 rem, 24 px at the default size, and grow with the text.
- **Large text:**
  - The sun bar and the action bar wrap instead of overflowing.
  - Dropdowns never outgrow their box, and grid columns and fieldsets can shrink.
  - From a text size of 1.4 up (`LARGE_TEXT`, marked on the page as `data-text="large"`), a portrait phone's shift scrolls like a page instead of fitting the screen. The sun bar stays at the top and the action bar at the bottom. The body keeps 45% of the screen and the evidence reads in full, with nothing scrolling inside anything else.
  - Each new soul starts at the top of the page.
  - At the default size nothing changes, and the shift still fits one screen.
- **What screen readers hear:**
  - **Verdicts.** They were already said, through the toast's live region. But each screen had its own toast, and a live region made along with its message isn't read out, so the last soul's verdict could be lost as the summary opened. Now one toast serves every screen, made once with the app.
  - **Citations.** The dialog is described by its text, so a screen reader reads why the stamp was wrong along with the title and button. The same goes for a questioned soul's answer.
  - **The sun.** With a minute of sun left, the toast says so, once a shift; dusk was already said. The sun meter stays hidden from screen readers, and the time beside it can be read.

**Tests** (`tests/e2e/accessibility.spec.ts`, `@axe-core/playwright` 4.13.0)
- **Every screen passes axe** (WCAG 2.2 A and AA, and best practices), on the phone and the desktop:
  - title, briefing, shift and each phone tab, pause, citation, answer, summary, report;
  - the primer, a practice lesson, Endless's briefing and end;
  - save slots, morning and its scene, journal, audit, night and its scene;
  - in the full game, the warning before an ending and the ending.
- **On the phone**, every control is at least 44 px each way. Links inside running text are exempt, and a checkbox counts its label.
- **On a 360×740 phone**, at 100% and at 175% text, the same screens pass axe and the tap check, and nothing reaches past the screen's edge.
- **At 175%**, the shift's sun, count, Pause, Judge and Compare are on screen at the top and bottom of the page, the evidence isn't cut to a scrolling sliver, and the next soul starts at the top. At 100%, the shift fits one screen.
- **Screen readers:**
  - a citation's accessible description is its reason, and an answer's is its lines;
  - there's one live region, outside every screen, and it holds the last verdict when the summary opens;
  - under a fake clock, "A minute of sun left." comes at five minutes into a six-minute Daily, and dusk after it.
- The walks run with the device's reduced motion, which the game honours by stilling every animation. Without it, main's first CI run caught an achievement notice mid-fade, at about 30% opacity, and failed it on contrast.

**Known limits**
- **What axe can't check.** Automated checks find only some problems. Nobody has played the game with a screen reader yet, and someone who uses one should. In particular:
  - whether reading the body's signs as chips is enough without seeing the body;
  - whether Compare's two-step picking makes sense by ear.
- **Landscape phones.** With large text they keep their fixed side-by-side layout. It isn't checked at 175%, and it's likely cramped.
- **Desktop large text.** The desk layout was scanned at 100% only. It wasn't checked at 175%, on a desktop or on the Steam Deck's 1280×800.
- **Sound.** There are no captions, because every sound has something visible with it (a stamp, a citation, a toast). If music or ambience carries meaning later (phase 9), it will need them.
- **Target sizes on desktop.** The 44 px rule applies to touch screens. With a mouse, the small buttons stay 36 px and the dropdowns 33 px, above WCAG 2.2's 24 px AA minimum.

## 36. After M7: controller support (phase 4)

**Why.** Steam Deck Verified needs full controller support: every screen playable with the Deck's own controls, and on-screen prompts that match them. The game had no gamepad code; §6.4 planned it for M6.

**The buttons** (the standard gamepad layout; `packages/ui/src/pad.ts` reads it, `gamepad.ts` acts on it):

| Button | Does | Key |
|---|---|---|
| D-pad, left stick | Moves the focus to the nearest control that way. Held, it repeats after 400 ms, then every 120 ms | Tab |
| A | Presses what has the focus. After a stamp, the focus goes to Send | Enter, Space |
| B | Goes back. On the desk it's Esc: stop comparing, put the stamp sheet away, else pause. In a dialog, its close button. Elsewhere, the nearest open section or back button around the focus, so a confirmation's Cancel comes before the screen's Back | Esc |
| X | Compare | C |
| Y | Turn the soul over | F |
| LT | Ask Skögul for a hint | H |
| RT | Go to the stamps, at the one chosen (on a phone, it opens the judge sheet) | 1–9 |
| LB, RB | The paper before or after. On a phone, the tabs; on the desk: the rules, the body and its signs, each of the soul's papers, the stamps, and round again | none |
| View | The rules, with the focus on them | R |
| Menu | Pause, and resume | P |
| Right stick | Scrolls what has the focus, else the phone's open tab, else the page | wheel |

- The buttons send the shift's own keys (`shift/keys.ts`), so the controller and the keyboard can't disagree.
- Question, the feather, the registry and the later tools have no button of their own. They're buttons on the desk, reached with the d-pad and pressed with A; Question sits beside the contradiction it asks about.
- §6.4 planned Y for Question. Y turns the soul over instead, since every soul from Day 2 needs turning over and only a caught liar can be questioned.
- §6.4's focus graph (`useFocusable` in groups) wasn't built. The focus moves over the page's own controls, found when a button is pressed, and papers are marked `data-panel` for LB and RB. Nothing has to register, so a new screen works with no extra code.

**How the focus moves** (`spatial.ts`):
- **What it can stop at:** what a keyboard can focus, less what's disabled, hidden, inert or in a closed section. A scrolling panel with controls in it isn't a stop, its controls are; one with nothing to press (the rules) is.
- **Which one:** from the focused control's box, the nearest box that way within 45°. Drifting sideways counts double, and the centres' offset breaks ties. The 45° limit came from play: right from the last stamp, with Send not yet ready, went to the pause button at the top of the screen. Now it stays put.
- **Scrolling boxes:**
  - A control in another scrolling box counts only as far as it shows, so the d-pad can't land on a line scrolled out of sight in another paper.
  - Moving within a scrolling box scrolls it.
  - A focused paper that scrolls (the rules) scrolls with the d-pad before the focus leaves it.
  - With nothing further that way, the d-pad scrolls what it's in.
- **Dialogs:** while a dialog or the stamp sheet is up, the focus stays in it. While a dialog is up, the desk's buttons wait; Menu still resumes a pause.
- **Nothing focused:** A or the d-pad first only shows the focus. It goes near where it last was on this screen (asking a question takes its button away), else to the screen's main button.
- **Lists and sliders:** A picks one up, and the d-pad changes it. A puts it down; B puts back what it was.

**Prompts**
- **Switching:** a button press or a stick sets `data-input="gamepad"` on the page. A real key or tap clears it (the key events the controller sends don't count).
- **What changes while it's set:**
  - The key hints hide, and each button shows its own: X on Compare, Y on Turn over, LT on Hint, RT on Judge and beside the stamps, Menu on Pause, View on the rules, LB and RB beside the tabs and the desk's papers, B on every back and close button.
  - The title's line of keys becomes the controller's.
  - The focus ring always shows. A browser shows it only after keys.
  - On a touch screen, "Hold to send" reads "Send", because A sends at once.
- **How they're drawn:** the prompts are CSS. `data-pad` or `data-back` on a button is drawn by `::after` with empty alt text, so a button's accessible name doesn't change.
- **Lettering:** the letters are Xbox's, which are also the Deck's.

**Tests**
- **Unit:** `spatial.test.ts` (6) and `pad.test.ts` (8). They cover the 45° limit, the trigger threshold, the dead zones, merging pads, one press per push, and the repeat timing.
- **End to end** (`tests/e2e/gamepad.spec.ts`). Before the page loads, its `navigator.getGamepads` is swapped for one that returns a standard pad. The test holds that pad's buttons down frame by frame. The cases:
  - **On the Deck's 1280×800:**
    - Daily #41 played start to finish with the controller alone: 8 of 8, then home with B.
    - Right from the last stamp stays put until Send is ready.
    - X and B compare; Y turns the soul over; LT gets a hint; Menu and B pause and resume; X waits while paused.
    - View goes to the rules, and the d-pad and right stick scroll them. RB and LB go round the papers.
    - The prompts show while the controller is in use, and the keys come back after a click or a key. Compare's accessible name stays "Compare".
  - **On the phone:**
    - LB and RB turn the tabs.
    - RT brings up the stamps, and the focus stays in the sheet. B puts it away.
    - A stamps and sends, and Send doesn't ask to be held.
    - The right stick scrolls the title.
  - **On both:** the text-size slider is picked up, moved, put down, and put back.
  - **In the full game:** B leaves the campaign's slots, the d-pad reaches New run, and A plays the first scene to its end.

**Known limits**
- **No real controller or Deck has been tried.** The tests fake a standard pad in the browser.
  - Established: the W3C Gamepad spec's standard mapping puts A, B, X and Y at buttons 0–3, the shoulders and triggers at 4–7, View and Menu at 8 and 9, and the d-pad at 12–15.
  - Not checked: that Chromium, under Electron on the Deck and through Steam Input, reports the Deck's controls with that mapping. That's for M6, on a Deck.
- **Sound.** A browser may not count a controller press as a gesture that lets sound start. If it doesn't, a web page with only a controller in use is silent until a key or a tap. The Steam build's window (M6) should allow sound without a gesture (Electron's `autoplayPolicy: 'no-user-gesture-required'`); the Electron shell is still a stub.
- **Gestures.** For the same reason, a link pressed with A may be blocked as a pop-up, and choosing a backup file may not open the file chooser. In the Steam build, links should open in the system browser (M6). Restoring a backup is optional, and Steam's on-screen keyboard (Steam + X) can type into the paste box.
- **Deck Verified checks more than input:** among them text size at 1280×800, the display resolution, and the on-screen keyboard for text entry. They're for M6, on a Deck.
- **Other controllers.** PlayStation pads show the Xbox letters; Steam Input can present any pad as an Xbox one. Buttons can't be remapped in the game; Steam Input can do that too.
- **Dragging.** Papers can't be dragged with a controller. They stay in place, as they do for the keyboard.
- **The primer's wording.** It says "tap the hands" and "tap their claim, then the wound"; with a controller, that's A. Wording that follows the controller is a writing change, left for sign-off.

## 37. After M7: store screenshots and trailer capture (phase 7)

**Why.** Store pages need screenshots at set sizes and short clips, and they go stale whenever the art changes. The capture replays chosen moments with the same souls every time, so a new set takes minutes.

**Running it** (`tools/store-capture`)
- `pnpm build:electron-full && pnpm store:capture` writes `dist/store`:
  - `steam/*.png`: 11 shots at 1920×1080;
  - `play-landscape/*.jpg`: the same 11 as JPEG, for tablets and landscape listings;
  - `play-phone/*.jpg`: 7 shots at 1080×1920;
  - for each of 3 clips: `clips/<id>.gif` (640 px wide, 15 fps), `clips/<id>/frames/*.png` (1920×1080 at 30 fps, for editing a trailer), and `clips/<id>.mp4` (H.264) when ffmpeg is on the PATH;
  - `index.html`, a contact sheet of everything with the checks below; `manifest.json`.
- `STORE_ART=pixel pnpm store:capture` shoots another art style.
- On GitHub: Actions, Store capture, Run workflow. The files come back as the run's artifact, with MP4s, since the runner installs ffmpeg.
- CI runs `pnpm store:check` on every push, in about 30 seconds. It plays every moment to its shot, cuts each clip to a frame per step, and checks every file.

**How it stays the same**
- **The build:** the Steam build (`electron-full`), served locally.
- **The clock and the dice:** each moment opens a fresh browser at 2027-01-10 12:00 UTC (Daily #41), with the clock stopped and `Math.random` seeded for that moment. A new run's seed comes from those two, so it's the same run each time.
- **Getting there:** the campaign moments start from `scenarioSave` saves (Days 3, 5 and 6, and a finished run), or from the vertical slice's start on Day 12. The engine works out the right stamps, as it does for the e2e tests.
- **Stills:** taken with the device's reduced motion, which the game honours, so everything is at rest. Toasts and achievement notices are waited out. Focus rings, the caret and the scenes' "draft" label are hidden.
- **Clips:** shot a frame at a time. Each frame runs the game's clock on by one frame (its timers, its animation frames, the sun), then moves every CSS and Web Animation on by hand. An animation is paused when first seen and set frame by frame; at its end it's finished, so whatever waits on it (a soul walking off) goes on. A frame takes about 170 ms to shoot, and the clip still plays at 30 fps.
- **How close two runs come:** a clip's frames matched to within a few pixels of anti-aliasing on the soul's art (about 60 of 2 million). That's the same souls and the same frames, not bit for bit. Before the clock was paused and running animations were settled, most frames differed.

**Sizes**
- **Steam:** the desk as a 1280×720 window drawn at 1.5×, which is 1920×1080. The text stays readable in Steam's thumbnails, where a 1920-wide desk would shrink it.
- **Google Play, phone:** a 432×768 phone at 2.5×, which is 1080×1920 (9:16). JPEG, since Play refuses alpha.
- **GIFs:** cropped to the action and shrunk to at most 640 px wide by area averaging. Each clip has one 256-colour palette, so what stays still doesn't flicker. 15 fps, looping.

**The stores' rules.** `finish.ts` checks every file against them, and the contact sheet shows the result. The rules below are from Steamworks' and the Play Console's own pages, as quoted in search results; this environment's network blocks the pages themselves.
- **Steam:** at least 5 screenshots, at 1280×720 or 1920×1080.
- **Google Play:**
  - JPEG or 24-bit PNG, with no alpha;
  - each side 320–3840 px, and the long side at most twice the short;
  - for a game to count for promotion, at least 3 landscape shots at 16:9 and 1920×1080 or more, or 3 portrait shots at 9:16 and 1080×1920 or more;
  - the preview video is a YouTube link, not a file.
- **GIF size:** anything over 5 MB gets a warning. That's a judgement about load times, not a store rule.

**The moments** (`catalog.ts`; `moments.ts` plays to each):
- **Daily #41 on the desk:**
  - a soul at the gate with every sign looked at;
  - a lie caught, with the Lie mark and Question;
  - the liar's confession;
  - the first soul stamped, ink on its legs;
  - a citation;
  - dusk, with 40 seconds of sun left.
- **The campaign:**
  - Day 6's registry entry, with its portrait;
  - Day 12's Loki, the stitch scars on his lips;
  - Day 3's morning scene;
  - Night 5's bills, with a sick child;
  - an ending's report of the host at Ragnarök.
- **Phone shots:** 7 of the above.
- **Clips:**
  - stamp and send: the soul walks off, the next walks up;
  - catching a lie: to the soul's answer;
  - sundown: the six-minute sun in four seconds.

**Known limits**
- **Not final.** The art is the woodcut built in code, not commissioned art, and the story is a draft. The draft label is hidden, but the text isn't final: the ending's own text ends "DRAFT.". As the brainstorm said, the tool is for the real store page once the art is final.
- **MP4s need ffmpeg.** There's none in this environment, so the MP4 step runs only on the workflow's runner.
- **Story screens on Steam.** The morning, night and ending screens are one column on the wide frame, with empty space either side.
- **Nothing checks that a picture looks good.** The dry run checks that each moment still gets there and that each file meets the rules. Looking at the contact sheet is a person's job.
- **Other store assets.** Steam's capsules and library art aren't made here; they're commissioned (docs/capsule-brief.md). The trailer is still to be edited, from these clips.
- **Fragility.** The moments follow the UI's test ids, so a UI change can break one; CI's dry run catches it. The frame-stepping relies on Playwright's clock and Chromium's animation API, so a browser update could shift frames slightly.

## 38. After M7: a playtest build for invited testers (phase 8)

**Why.** Testers could only play the demo unless they built the game from source, and the campaign's economy had only been tuned against bots. How to set up the page and invite people: [`playtest.md`](playtest.md).

**The target.** `web-playtest` is the full edition (every pack) with the itch adapter, relative paths, no service worker and no Case Lab. Two new target fields reach the build through the content manifest:
- **`playtest`:** the title screen says it's a playtest build and names it. Each readable save slot gets a Playtest report button. `dev-full` has the flag too, so the report can be tried locally.
- **`storage`:** the build's own name for what it keeps in a browser, or null to share the other builds' place.
  - Only `web-playtest` has one, `playtest`. Its localStorage keys are `cots.playtest.*` instead of `cots.*`, and its IndexedDB database is `chooser-of-the-slain.playtest`.
  - `localKey` in `store.ts` builds every key: settings, the Daily's and Endless's mirrors, the save slots, the art style. The platform's `openStore(name)` takes the database's name.
  - Every other build keeps its names, so no existing save moves.
  - Why: the demo shows a save it can't read as unreadable and offers to clear it, and itch probably serves every HTML5 game from one origin (Known limits).
- **The build label:** target · commit · content hash, e.g. `web-playtest · 3f2a9c1 · content ca5b2592`. `VITE_BUILD` sets the commit (the playtest workflow passes the short SHA). A local build says `local`.

**The engine: mistakes itemised.** The audit now files each soul sent wrong in the day's ledger, as `mistakes`. Each entry has:
- the rule that decided where the soul belonged;
- the destination expected and the one stamped;
- any procedures skipped (nails left uncut).

The field is absent on a day with none, and in saves from before this build, which keep only the count. No verdict, pay or Daily changes, and the pinned Daily checksums hold.

**The report** (`packages/ui/src/campaign/playtest.ts`, pure). It's Markdown, made from the save and the run it resumes to:
- **Header:**
  - the build, slot and seed, and whether it's Story Mode or the slice;
  - the day, phase and rings, and any nights in debt;
  - the family;
  - standing with the powers met so far, by the names they go by that day, so the stranger stays the stranger until Day 12;
  - upgrades bought, and the ending.
- **Days:** one row per finished day: souls right, wrong and unjudged; pay, bonus, fines, bills, shop, story and Draupnir; the rings after the night; and any assists. Signs are ASCII, so a script can read the table. A day whose night hasn't come has its night cells empty.
- **Mistakes:** one line per soul: the stamp, where it belonged, the rule's text as that day's rulebook words it, and any steps skipped. For an old save, the day's count.
- **Choices:** each journal entry is played again through its scene with the choices made (`playScene` with `journalEnv`), and the lines marked chosen are listed. If a scene has changed since and replay fails, the option numbers are listed instead.

**The UI** (`playtest-ui.tsx`)
- A dialog with the report, *Open the playtest form*, *Copy the report* and *Close*. Escape closes it, and so does B on a controller, as on every dialog.
- The form link fills in `.github/ISSUE_TEMPLATE/campaign-playtest.yml`: the report, and the title `Campaign playtest: Day N` (plus ", an ending" for a finished run).
- A link over 8,000 characters opens the empty form instead, with a note to paste the report.

**The deploy** (`.github/workflows/deploy-playtest.yml`)
- Run by hand only.
- Needs `BUTLER_API_KEY` and the variable `ITCH_PLAYTEST_TARGET`, and skips cleanly without them. It fails if that project is the demo's (`ITCH_TARGET`).
- Builds with the commit in `VITE_BUILD`, runs the leak check (the full build's canary must be there) and itch's limits, then pushes with butler, with the short SHA as the version.
- The build is 14 files and 828 KB.

**Tests**
- **Engine:** the audit files each soul sent wrong with the rule that decided it, and none on a day judged rightly.
- **Report (4 unit tests):**
  - a row per day with pay, bills and rings;
  - each mistake's destinations and rule;
  - an old save's count;
  - choices read back from a morning scene.
- **e2e on the real `web-playtest` build** (served on port 4176; phone and desktop):
  - the title note;
  - a slot the demo left at `cots.campaign.0` is ignored, and the build's own keys and database are used;
  - one day played with a soul sent wrong: the report's row, the mistake and its rule, both choices as the journal shows them, the form link's fields, Copy (the clipboard holds the report), Escape, and Close.
- **A negative control, run once by hand:** built with `storage: null`, the storage test fails.
- **CI** builds and leak-checks the new target with the rest.

**Known limits** (more in `playtest.md`)
- **The shared origin is unverified.** itch.io is blocked here, so that itch serves every HTML5 game from one origin comes from memory and forum reports. If it doesn't, the separate storage costs nothing.
- **A password and a secret link can be passed on,** and the public repo means anyone can build the whole game anyway.
- **Choices from rewritten scenes** show as option numbers.
- **Only the campaign has a report.** The Daily already has its share text, soul reports and opt-in telemetry.
- **The form needs a GitHub account,** and issues on a public repo are public. Copy the report is the way round both.
- **The labels don't exist yet.** The forms' labels (`playtest`, `campaign`, and the alpha forms' `alpha` and `soul-report`) aren't in the repository, and GitHub skips a label that doesn't exist.

## 39. After M7: music, ambience and sound cues (phase 9)

**Why.** There was no music or ambience, and the effects were synthesised placeholders. This builds the system and lists every file it needs. Every build stays silent (apart from the placeholder effects) until real sound arrives: placeholder loops would be worse than silence. The commissioning brief is [`sound-brief.md`](sound-brief.md).

**The content** (`content/packs/<pack>/sound.yaml`)
- **Beds:** each has an id and a line saying what it's for. Its layers are `music`, `tension` and `ambience`, each a file name, or `{ file, loop: false }` for a piece that plays once.
- **Day overrides:** a day can give some places a bed of its own (Day 20's gate is `ragnarok`).
- **Ending overrides:** an ending can have its own music.
- **Cues:** a cue can name recorded variants.
- **Where things are:**
  - core has a bed for each place, and the cue files;
  - the demo adds its lost ending's music;
  - the campaign adds Ragnarök's gate and three ending moods.
- **Files:** `assets/<pack>/sound/<name>.ogg` (Opus) and `.m4a` (AAC).

**The compiler** (`packages/content-compiler/src/sound.ts`)
- **Scope:** it reads only the target's packs, so a demo never names the campaign's music.
- **What's left out:** any layer, cue variant, day or ending bed without files, so a place falls back to its own bed, a cue to its placeholder, or silence.
- **Errors:**
  - a bed defined twice, or one a day or ending names that doesn't exist;
  - an ending that doesn't exist;
  - a pack with sound that leaves a place without a bed.
- **Output:** it writes `generated/<target>/sound.ts`, with each file as `new URL(<path>, import.meta.url)`, so Vite copies only the named files into the build, hashed. The compile line reports the count, e.g. `sound 0 of 26 files` for the demo and `0 of 32` for the full game. None exist yet.
- **Outside the content hash:** sound doesn't change the content hash, so the Daily's checks are unaffected.

**The mix** (`packages/ui/src/sound/mix.ts`, pure)
- **The bed:** the screen gives a place:
  - title, save slots and briefings → title;
  - shift → gate;
  - results, Endless's end and the audit → tally;
  - then morning, night and ending.

  The place's bed is the ending's own on the ending screen, else the day's own (campaign only), else the place's.
- **Tension:** `smoothstep((sunUsed − 0.5) / 0.5)`, from the share of sun used. It's 0 without a sun (Story Mode, untimed practice, Endless). The calm music is scaled by `1 − 0.35·tension`.
- **Ducking:** story text on screen (a scene or an ending) scales music by 0.4 and ambience by 0.55.
- **The player's volumes:** new `music` (0.7) and `ambience` (0.8) settings scale each part. The existing `sound` setting is the master volume.

**The player** (`packages/ui/src/sound/beds.ts`)
- **Changing bed:** a new bed fades in over 1.2 s while the old one fades out. Levels then ease toward the mix (0.25 s).
- **Loading:** each layer loads the first format the browser says it can play (`canPlayType`), falling back to the next if decoding fails.
- **In step:** layers are decoded whole and started on the same sample, so a stem and its music stay in step.
- **Memory:** four decoded files are kept for coming back to.
- **Recorded cues** are decoded once sound first runs, then played in turn. Until then, or without files, the recipe plays.

**The context** (`audio.ts`)
- **Suspended while:** a shift is paused, the page is hidden, or the volume is 0.
- **Leaving from the pause** lets it go. Before, a gesture happened to resume it.
- **Still starts on the first tap or key,** as browsers require. A tap before the game is listening starts nothing, and the next one does.

**The driver** (`packages/ui/src/sound/driver.ts`)
- **Inputs:** the screen, the shift's sun (read at each tick only while a shift runs), the campaign's day and ending, story text on screen, and the settings.
- **Where the campaign's details come from:** its lazily loaded screens publish its day and ending (`sound/place.ts`). `useStoryText()` marks scenes and the ending.
- **When the day counts:** only on the campaign's own screens and a campaign shift, so a Daily after Day 20 still plays the gate.
- **The volume settings** appear only in a build that has beds.

**Sketches** (dev-full only, `?sound=sketch`)
- **What:** procedural drones, a heartbeat pulse, wind and a hearth, 8-second loops fitted to whole cycles, with noise cross-faded at the seam. They let the system be heard and tested.
- **Kept out of other builds:** the module is imported behind `import.meta.env.MODE === 'dev-full'`, which other builds drop. So does the test handle `__cotsSound` (the mix, and each layer's level, target and state).

**Tests**
- **Unit:**
  - the mix: beds by place, day and ending; tension silent then rising, never falling; ducking; volumes; the lists matching the schema's names;
  - the compiler: files found by format, missing names left out, silent overrides dropped, bad references refused, the generated URLs, and campaign beds only in full targets.
- **e2e, dev-full with sketches, phone and desktop:**
  - title → gate on a practice shift, with all three layers;
  - tension up and the calm music down after five minutes of sun;
  - a pause holds sound, and leaving releases it back to the title bed;
  - the music volume setting;
  - music and ambience ducked under the morning scene, and restored after it;
  - no beds and no music setting without sketches;
  - none of it on the web demo.

  Run 4 times over, they held.

**Known limits**
- **No real sound yet.** Levels need calibrating when files land: the defaults were chosen without them.
- **Loops are decoded whole.** It keeps them gapless and in step, and costs memory (23 MB a stereo minute). Pieces that play once are decoded whole too; if endings grow long, stream them instead.
- **Stem lengths aren't checked.** The compiler can't see audio lengths. A stem of a different length from its music drifts, which the brief's acceptance test covers.
- **Offline, the PWA plays no music.** Its precache leaves audio out, so the web demo fetches each bed when first heard. Add runtime caching for sound when files exist.
- **No captions,** as §35 said, because nothing new is carried by sound: the tension follows the sun on screen, and ducking follows text on screen.

## 40. After M7: appeals (gameplay brainstorm, item 5)

**Why.** A mistake was cited, fined and forgotten. Now the soul can come back the next morning to be judged again. The brainstorm's first version was "admit or defend". That would have been an empty choice, because the citation already tells the player on the spot that a verdict was wrong. So:
- an appeal is heard by judging the soul again, at the desk;
- some appeals come from souls judged rightly, trying their luck, so an appeal is no proof of a mistake.

**Who appeals** (engine, at the audit: `chooseAppeal` in `campaign/run.ts`)
- **Days:** from `appeals.from` (Day 1) up to the day before the last, whose mistakes have no morning left.
- **Candidates:**
  - souls sent to the wrong place;
  - "chancers": souls judged rightly into Hel, Rán or the clerk's hall.

  Story souls never appeal; their stories have their own consequences.
- **The draw:** from its own stream of the run's seed (`<seed>|appeal|<day>`), so a run always brings the same appeals.
  - 70% after a day with a soul sent wrong, 25% after a day without.
  - When both kinds are there, 25% of appeals come from a chancer.
- **What's kept for the morning:** the soul as it stood (its case), the stamp, whether a Valhalla stamp made it a worthy einherjar, and what the mistake cost (its fine, the standing it moved).

**Hearing it** (UI)
- **Where:** a card on the morning screen, after the morning's scene, before the decree.
- **Hear the appeal** opens the desk for that one soul.
  - It has no sun, and uses the rules and stamps of the day it was judged.
  - A banner says the day and what the soul was stamped.
- **Leaving from the pause** keeps the appeal for later.
- **Let the verdict stand** closes it. Going to the gate unheard lets it lapse the same way.
- **The session:** it's a practice-mode shift with its own `appeal` mode. It earns no achievements, sends no telemetry, and skips the summary: its stamp becomes the run's `appeal` action.

**Outcomes** (`hearAppeal`)

| Verdict was | Stamped on appeal | Outcome | Rings | Standing | The soul |
|---|---|---|---|---|---|
| wrong | where it belongs | righted | its fine back | the mistake's undone | moves to its hall |
| right | the same | upheld | +3 | none | stays |
| either | anywhere wrong | wrong | −5 (none in Story Mode, or if that day waived fines) | as for that mistake | moves there |
| either | not heard | let stand | none | none | stays |

Moving a soul keeps the Ragnarök host true: the counts of souls sent, and the worthy and unworthy einherjar.

**Records**
- The day it's heard, the audit files it in that day's ledger (`appeal`). The audit shows its rings as a row, and its standing as its own column, so the accounts still add up.
- The playtest report lists every appeal.
- The save's log keeps the action, so replays and resumes give the same run.

**Numbers.** These are first guesses in `content/packs/demo/campaign.yaml`: `from 1, afterMistake 70, otherwise 25, chancers 25, bonus 3, fine 5`. The sim (12 runs per policy) has bots hear every appeal and judge it with their accuracy at the gate:
- experts end about 12 rings up, and competent bots about 6;
- novices are demoted about as often as before: the novice who pays every bill in 12 of 12 runs, up from 11 of 12, one run's difference at 12 seeds.

Appeals add depth and a second look; they don't fix the economy's missing middle. Bots understate them, since a person with no sun should judge better than at the gate.

**Tests**
- **Engine (6):**
  - the appeal and what it cost;
  - righting a mistake: fine, standing, the soul's hall;
  - upheld, wrong and let stand;
  - lapsing at the gate, and the ledger;
  - no appeal from story souls, after the last day, or without the settings;
  - replaying from a save.
- **Report (1):** each appeal listed.
- **Sim:** hears appeals. The bot that plays for the wolf ending (a weak host) lets them stand, because righting mistakes strengthens the host.
- **e2e on the web demo** (phone and desktop), with the clock and `Math.random` pinned to a run whose first soul appeals:
  - righted, including leaving from the pause;
  - decided wrongly, with the audit's −5 row;
  - let stand.

**Known limits**
- **The pleas are generic.** There's one line per destination stamped, and they're draft copy for your sign-off.
- **Memory is a real edge.** A player who remembers yesterday's citations knows which appeals have merit. That's part of the game. Chancers keep an appeal from being proof, but they don't make it a mystery.
- **Rewards stay small** (3 and 5 rings) until playtests say otherwise.
- **The Daily is untouched.** It has no appeals.

## 41. After M7: the line at dusk (gameplay brainstorm, item 4)

**Why.** Souls still in line when the sun set used to vanish, costing only their wage. Now the queue remembers them.

The brainstorm's version, and what changed:
- **It added yesterday's leftovers to tomorrow's queue.** A slow day would make the next one longer, a snowball that steepens the novices' cliff. Here they take the places of the day's last new souls instead, so the line is no longer. Leaving a soul costs a wage, exactly as before.
- **It didn't say whose rules judge them.** A soul made for one day often can't be judged fairly by the next: it lacks the new day's kinds of evidence. Measured over 40 seeds, only 47% of Day 1's souls could be judged by Day 2's rules; 36% of Day 4's by Day 5's; none of Day 7's by Day 8's (the nails); 57% of Day 16's by Day 17's. Here each soul is seen afresh (below), and 100% of 9,555 pass.
- **It charged Hel once per soul.** Endings need standing of 4 to 8, so any occasionally slow player would lose Hel's ending. Here only a crowded gate costs anything.
- **It let the living die into Hel's hall.** Hel's legion counts double in the host at Ragnarök, so that would be a fine-free way to grow it. Here the living lost in the night go to no hall.
- **It promised the order of the line would matter.** That needs a way to choose who comes to the desk next: a big change on both layouts, and to what the player knows before judging. It isn't built; see the limits.

**At the audit** (`waitingLine` in `campaign/run.ts`)
- **Which souls:** those still in line when the sun set.
- **When:** from `waiting.from`, only when the next day follows on. Not after the last day, and not across a vertical slice's jump.
- **Story souls never wait.** Their stories go on without them.
- **The living** (those who should go back) **die in the night.** Each costs `waiting.died` (Odin −1 in the demo), and they go to no hall.
- **Everyone else waits for the next day,** seen afresh under its rules. `dressForDay` in `gen/generate.ts` does this:
  - it keeps the soul's truth, lies and look;
  - it recomputes whether the soul counts as a liar (from Day 16) and judges it by the next day's rules;
  - it dresses it with that day's evidence (the signs its rules read, a registry entry once there's a registry), under the same F1–F8 contract as the day's own souls.

  A soul no dressing passes would be gone, as before there was a line. It has never happened.
- **A crowded gate** (`waiting.crowd` or more left, three in the demo) costs `waiting.night` (Hel −1) once for the night.

**The next morning** (`campaignQueue`)
- **Place in line:** the souls who waited come first, after the day's teaching soul, so a slow player never loses the day's lesson.
- **Room:** each takes the place of one of the day's new souls: one who shares its name if there is one, so no two in the line do, else the last.
- **Clearing:** once the gate opens, they're in the day's line and no longer in the run's `waiting`.
- **Replays:** the morning's save keeps them, so replaying the day brings them back in the same places.
- **The day they came:** a waiting soul keeps its original `day`, which is how the desk knows it waited. Nothing else reads a case's day.

**Records**
- **The audit:**
  - names what became of each soul left: it waits at the gate for tomorrow, or it was still breathing at dusk and dies in the night;
  - gives the line's standing a column of its own, "The line", so the accounts still add up.
- **The morning** lists who waited, and says they're first in line today, under today's rules.
- **The desk** marks a soul who waited: "Waited at the gate since Day 1. Today's rules decide."
- **The playtest report** lists each night's line.
- **The ledger** keeps it as `waiting`, with the souls by id and name, and the cost.

**Numbers.** The demo campaign's settings are `from 1, crowd 3, night { hel: -1 }, died { odin: -1 }`: first guesses.
- **Re-dressing** takes 1–3 ms a soul. Under the next day's rules the right destination changes for 4–19% of souls, up to 102 of 529 after Day 14 fills Hel's hall.
- **The sim** (`pnpm sim campaign --pace N`, 12 runs per policy):
  - it now gives bots a pace in seconds of sun per soul, 25 unless told;
  - each day allows about 46–63 s per soul.

| Pace | Souls left over a run | Nights with 3 or more | Living lost | Standing |
|---|---|---|---|---|
| 25 s | 0 | 0 | 0 | baseline |
| 55 s | 2–6, on Days 3, 5, 6 and 9 | 0 | 0.1–0.2 | Hel and Hel endings within noise of baseline |
| 70 s | 24–47 | 4–5 | 1.4–3.3 | Hel about 5–9 lower, no Hel endings; Odin 1.5–3 lower |

The counts are for bots that last the run. Careless bots are demoted early, so they leave fewer.

- **Bots with the speed upgrades** leave about half as many (2.3–2.9 against 5.2–6.1 at 55 s): the first time the sim shows those upgrades earning their keep.
- **Rings** move only by the wages of souls never judged, as before the line.
- **A quirk that predates the line:** novices are demoted slightly less when slow, since fewer souls judged means fewer fines. The line makes leaving souls a little costlier.

**Tests**
- **Engine (5):**
  - the souls left wait, dressed and judged by the next day's rules, after its teaching soul, in the places of its last souls, with no repeated names;
  - the living die: no hall, their own cost, and story souls don't wait;
  - a soul or two costs nothing;
  - no line without the setting, before `from`, on the last day, or when everyone is judged;
  - a saved morning brings the same line, and standing adds up across every audit column.
- **Generator:** every soul of every day can wait for the next, and passes its contract there.
- **Sim:** a slow bot's line waits, and its accounts and standing add up.
- **Report (1).**
- **e2e on the web demo** (phone and desktop): Playwright's clock runs the sun down with four souls in line. Then:
  - the audit's notes and Hel −1 in the line's column;
  - Day 2's morning note;
  - the teaching soul first, then the souls who waited, with the desk's banner.

**Known limits**
- **Nobody chooses the order.** The line is still first come, first judged, so the living's urgency is a reason to keep pace, not a choice to make. Letting the player call a soul forward is the follow-up, if playtests want it.
- **A waiting soul's words are said afresh the next day.** Its truth, lies and look are the same, but a player who read its testimony at dusk will find it put differently.
- **The costs are small on purpose,** and so are the thresholds that decide endings. The bots' pace is a guess; the playtest build will say how often real players leave souls.
- **Story Mode has no dusk,** so no line. **The Daily is untouched.**

## 42. After M7: the gods' requests (gameplay brainstorm, item 2)

**Why.** Only mistakes move standing, and the campaign's rows already let a mistake please the god who gains the soul: a warrior of Valhalla's sent to Hel is Odin −1 and Hel +1. Nothing said so, and nothing in a shift let a player court a god on purpose. Now, some mornings, a god asks openly.

The brainstorm's version, and what changed:
- **"Freyja wants two more for Fólkvangr" didn't say whose.** More for Fólkvangr has to come from another hall, and whose decides the cost: the rows charge Odin 2 for each of his warriors sent to her. So each request names both ends, souls that belong in one place sent to another, and the desk counts only those.
- **It said a favour "risks" a citation.** It's certain. Every soul sent as asked is a mistake, with no wage, a citation, and a fine once the day's warnings are used. The morning says so, and says what the rows will move.
- **It had requests that test skill,** such as "Hel: nobody fit for my hall goes elsewhere". They're dropped. The wage already pays for judging rightly, and the rows already charge Hel's favour for a soul of hers sent elsewhere, so such a request would pay for skill twice and punish a mistake twice. It offers no choice, which was the point of the item. Only favours are asked.
- **Requests that conflict** are kept, as rivals. Freyja and Hel both want Odin's warriors, so on some mornings both ask for the same souls, to be sent to different halls. When the line holds enough for both, both can be done, at twice the mistakes.

**The draw** (`drawRequests` in `campaign/run.ts`, at each audit, for the next morning)
- **When:** from `requests.from` (Day 4), on `chance`% of mornings, whenever there's a next day.
- **Its own stream** of the run's seed (`<seed>|requests|<day>`), so nothing else in a run changes: a bot that ignores requests plays exactly as it did before them.
- **Which:** a request is open on a day inside its `since` and `until` when both its places are stamps that day and the next day's line holds at least `n` souls that belong where it asks from. That line includes the souls who wait from tonight (§41), so every request can be done.
- **One** open request is picked. Then, `rivals`% of the time, another god's open request for the same souls joins it.
- **Replays:** the morning's save keeps them, so replaying the day brings the same requests.

**The morning** shows each request under the scene: the god's words, then the terms.
- **The terms** say how many souls, from where, to send where, and the reward.
- **They say what each soul costs** as the mistake it is: no wage, a citation, a fine once the day's warnings are used, and the rows' standing, which `standingFx` works out for that pair of places. In Story Mode, or with the no-fines assist (which can be set on the same page), they leave the fine out.
- **Declining** costs nothing and needs nothing.

**The desk** shows each request's count under the sun: "Hel's request: 1 of 2 sent to Hel".

**The audit** (`settleRequests`)
- **Counts** the souls that belonged where the request asked from and were sent where it asked.
- **Done in full** (`n` or more): the reward, in a "Requests" column of the standing table, so the accounts still add up, with a note under the table. Each soul's own mistake moves standing in the Mistakes column, as it always did. **In part:** nothing.
- **Lists** each request, done or not: "Freyja's request: not done (0 of 2)."
- **The ledger** keeps them as `requests`. The playtest report lists them.
- **A soul given to a god whose request was done in full doesn't appeal** (§40). Righting it would keep the reward without its cost. Souls sent for a request done only in part appeal like any mistake.

**The standing table** had to change for the extra column.
- **The bug:** at 360 px, a fifth column (the appeal's or the line's) already pushed the page sideways; with the requests' column the table ran into the gutter at 412 px as well.
- **Now** it scrolls in its own box (`LedgerScroll` in `campaign/screens.tsx`), never the page, and the box takes keyboard focus.
- **The names stay put.** A column scrolled to comes to rest against them, never half under them, where a "+1" half hidden reads as "-1". The box measures the names' column, snaps to it, and leaves room after the last column so that every resting place is a column's start.
- **Smaller headers** keep the usual five columns inside a 360 px screen. With 175% text the table scrolls.

**Numbers.** The campaign pack's settings are `from 4, chance 50, rivals 25`, each reward +1: first guesses.

| God | Asks for souls that belong in | Sent to | Souls | From Day | Each soul's rows |
|---|---|---|---|---|---|
| Freyja | Valhalla | Fólkvangr | 2 | 4 | Odin −2, Freyja +1 |
| Odin | Fólkvangr | Valhalla | 1 | 4 | Freyja −2, Odin +1 |
| Hel | Valhalla | Hel | 2 | 5 | Odin −1, Hel +1 |
| The clerk | Hel | TRANSFER | 2 | 10 | Hel −1, the clerk +1 |

- **How often:** a run brings about 11 requests. On Day 5, 18 of 30 seeds had one, and 4 of those a rival.
- **The sim** (`pnpm sim campaign --serve <god>`, 12 runs per policy, plain story): bots do every request of one god they can, with souls they've judged rightly, and ignore the rest. The rows below are the payAll policy's; the other nights are close.

| Serving | Done in a run | Expert: standing at the end | Expert: endings | Competent: standing | Competent: endings |
|---|---|---|---|---|---|
| Nobody | 0 | Odin 2.8, Freyja 2.8, Hel 3.4 | Hel 6, the last stand 3, Freyja 2, Odin 1 | Odin −11.2, Freyja 1.3, Hel −3.1 | the last stand 9, Freyja 2, Hel 1 |
| Freyja | 3.3 | Freyja 12.8, Odin −10.8 | Freyja 12 | Freyja 10.3, Odin −23.4 | Freyja 11, the last stand 1 |
| Hel | 3.2 | Hel 11.3, Odin −2.1 | Hel 12 | Hel 4.4, Odin −16.5 | Hel 8, the last stand 3, Freyja 1 |
| Odin | 2.4 | Odin 7.6, Freyja −2.1 | Odin 11, the last stand 1 | Odin −6.4 | the last stand 9, one each of Hel, Freyja, Odin |
| The clerk | 1.8 | the clerk 7.0 | the last stand 12 | the clerk 5.5 | the last stand 11, Freyja 1 |

**What decides the endings.** Freyja's and Hel's endings need standing 3 and the lead; Odin's only the lead. An expert who ignores the requests ends with the three gods within a point or so of each other, so which of them the run ends with is close to a coin toss. One favour moves more than that, and the rows do most of the moving:

| Favours done (payAll, plain) | Expert: Freyja's ending, reward 0 / +1 | Expert: Hel's | Competent: Freyja's | Competent: Hel's |
|---|---|---|---|---|
| 0 | 2 / 2 of 12 | 6 / 6 | 2 / 2 | 1 / 1 |
| 1 | 9 / 10 | 10 / 12 | 6 / 7 | 2 / 2 |
| 2 | 12 / 12 | 12 / 12 | 10 / 11 | 2 / 7 |
| Every one asked (about 3) | 12 / 12 | 12 / 12 | 11 / 11 | 3 / 9 |

So at standing 3, for an expert, a single favour of Freyja's or Hel's mostly decided the ending, whatever the reward. The choice was made openly rather than by accident, but it was cheap.

**Raised to 8.** Both endings now need standing 8 and the lead. 8 is the lowest mark at which the god's story alone falls short: at 7, an expert devoted to Hel in the story still reaches her ending in 8 runs of 12 without a request. Measured over 12 runs a policy (payAll, the god's own story policy, the first N of her requests done):

| Favours done | Expert: Freyja's ending | Expert: Hel's | Competent: Freyja's | Competent: Hel's |
|---|---|---|---|---|
| None (the story alone) | 0 of 12 | 2 | 1 | 0 |
| 1 | 12 | 11 | 5 | 2 |
| 2 | 12 | 12 | 9 | 3 |
| Every one asked (about 3) | 12 | 12 | 10 | 5 |
| Every one asked, plain story | 12 | 11 | 9 | 3 |

- **For an expert,** the story and one favour now bring the ending, as do the requests alone.
- **The cost: Hel's ending is now a hard one for a competent player.** It takes 5 of 12 even with her story and every request, against 9 at standing 3. Her souls are many, and each one judged wrong costs her a point (the rows above).
- **Novices** reach neither ending at any mark from 4 up.
- The reach test's Freyja and Hel bots now do their god's requests too.

**Tests**
- **Engine (5):**
  - requests come from their first day on, only when the line holds the souls asked for, and a second one is a rival for the same souls;
  - the reward is paid when done in full, on top of what each soul's mistake moves;
  - nothing extra is paid when done in part, and nothing at all is charged when declined;
  - a saved morning brings the same requests; there are none without the setting or after the last day;
  - a soul given for a request done in full never appeals, while those of one done in part may.
- **Sim:** a slow bot's standing adds up, requests' column included.
- **Report (1).**
- **e2e on the full game** (phone and desktop): a save made in Node on Day 5's morning, with two gods asking for the same souls. It checks:
  - the morning's terms, with and without the no-fines assist;
  - the desk's counts, and the citations;
  - the audit's results, its Requests column and note;
  - the standing table on a 360 px phone: it fits; at 175% text it scrolls in its own box, never the page, and no column comes to rest half under the names.

**Known limits**
- **One favour mostly decides the ending** (above).
- **The clerk's favours alone never reach his ending,** which also needs the contract from the story (`flags.clerk_contract`).
- **A mistake can do a request by accident.** Competent bots that ignore requests still complete 0.2–0.3 a run, with mistakes that happen to match one. The god is pleased all the same.
- **The gods' words are drafts,** like the rest of the story.
- **The Daily and Endless are untouched,** and the demo ends before Day 4.

## 43. After M7: the gods' favour (gameplay brainstorm, item 3)

**Why.** Standing did nothing until the ending. Now each god gives something while you're in their favour, so a run's allegiance shows long before Day 20.

The brainstorm's version, and what changed:
- **Kept:** Odin gives more sun, Freyja a free question a day, Hel milder sickness at home, the clerk halved fines. Like the upgrades, favours give time, information or money, never what decides a soul.
- **"Milder sickness"** is made concrete: no one at home falls sick by chance (from a night's unpaid bill), and the sick hold out a night longer without medicine. Nights in a row without firewood or food still make them sick. The chance part was added after the first measurements (below): the extra night alone changed nothing the sim could see.
- **It set no standing to reach.** The first favours come at 4, or at 3 for the two that ease hardship (sickness and fines), so they come to players who court a god, and rarely by accident (below). A second, stronger favour comes at 8.
- **Loki gets none.** The brainstorm names four gods, and the stranger isn't named until Day 12. A favour of his would be the place for the Naglfar plot to pay out during a run, if you want one.

**The rule** (`favoursFor` in `campaign/run.ts`): at the gate each morning, every god whose standing is at a favour's `at` or more grants it for the day and its night. A god's favours add up: sun and free questions are summed, and of the fine and sickness percentages the lowest holds.
- **Settled at the gate.** Standing doesn't move during a shift, so the audit files the same favours the gate granted (`favours` in the day's ledger).
- **The night keeps them.** Mistakes that cost a god standing at the audit don't take back that night's favour. The next morning decides again.

**Where each acts**
- **Odin's sun:** `shiftMods` adds it to the day's sun, as the sundial does.
- **Freyja's question:** the shift counts the free questions asked (`mods.freeQuestions`, `freeAsked`), so the day's first question costs no sun. Without the favour no count is kept, and nothing else about a shift changes.
- **The clerk's fines:** the audit charges `finePct` of each fine, rounding down, and files the rings spared (`eased` in the day's ledger). An appeal's own fine is untouched.
- **Hel's night:** `careFor` gives the night its extra nights for the sick, and scales the chance of falling sick from an unpaid bill by `sickChancePct` (0: none). The night screen's outlook (the odds it gives, and the family's "needs medicine within N nights") counts with both.

**The screens**
- **The morning** names today's favours in the day's card: those that do anything, since Story Mode has no sun and no fines, and the no-fines assist leaves nothing to halve. A guide below lists every favour, the standing it takes, the standing now, and which are yours today.
- **The desk** labels the free question "Question (free today)".
- **The audit** notes the clerk's favours under the fines. When they waive the fines, the fines row stays, at 0, so the mistake it's for isn't lost from the accounts.
- **The night** notes Hel's.
- **The playtest report** lists each day's favours, and the rings of fines they spared.

**Numbers** (the campaign pack; first guesses):

| God | First favour | Second, at 8 |
|---|---|---|
| Odin | at 4: +60 s of sun | +60 s more |
| Freyja | at 4: the day's first question free | the second too |
| Hel | at 3: no one falls sick by chance, and the sick hold out a night longer | another night |
| The clerk | at 3: fines halved | the rest waived |

These began as one favour each, all at 4 (the measurements just below). The revision after them follows.

How often each is held (bots, 12 runs, plain story, payAll; the share of mornings from Day 2 with the god at 4 or more):

| Player | Serving nobody | Serving that god |
|---|---|---|
| Expert | Odin 3%, Freyja 4%, Hel 12%, the clerk 0% | Odin 23%, Freyja 68%, Hel 49%, the clerk 23% |
| Competent | Freyja 3%, the clerk 1%, the others 0% | Freyja 58%, Hel 27%, the clerk 14%, Odin 0% |
| Novice | the clerk 11%, the others 0% | Freyja 25%, the clerk 20%, Hel 7%, Odin 0% |

At 3, experts would hold Freyja's or Hel's on about a fifth of mornings without trying (22% and 20%).

What they change (the same bots, with the favours and without them):
- **Odin's:** an expert who courts him at 70 s a soul holds it on 5 of 20 days, and leaves 31.6 souls at dusk over a run against 34.8. At 55 s: 2.7 against 2.9.
- **The clerk's:** novices hold it on under 2 of 16 days, so their fines barely move (332 against 345 rings a run for one who courts him).
- **Hel's:** never shows. Bots that skip bills lose everyone by Day 4, before anyone can reach her mark; bots that pay lose no one either way.
- **Freyja's:** bots never question, so the sim can't show it.

So the favours are small, and in the sim mostly invisible. Whether players feel them is for the playtest to show.

**Revised after these measurements:** the clerk's and Hel's marks lowered to 3, Hel's favour widened to chance sickness, and a second favour for each god at 8, the mark of Freyja's and Hel's endings (§42). Measured again (12 runs a policy, payAll unless named; "courting" is the god's own story policy and every request of theirs, the transfer policy for the clerk). The share of mornings from Day 2 at each mark:

| God (marks) | Expert, plain | Expert, courting | Competent, courting | Novice, courting |
|---|---|---|---|---|
| Odin (4, 8) | 4%, 0% | 60%, 41% | 26%, 10% | 0%, 0% |
| Freyja (4, 8) | 0%, 0% | 73%, 30% | 64%, 21% | 21%, 0% |
| Hel (3, 8) | 25%, 0% | 66%, 37% | 37%, 12% | 0%, 0% |
| The clerk (3, 8) | 0%, 0% | 43%, 19% | 40%, 12% | 21%, 3% |

- **The second favours never come by accident,** and to a courting expert on a fifth to two fifths of mornings.
- **Hel's at 3 comes to a plain expert on a quarter of mornings** (a fifth at 4). Experts pay their bills, so it's worth little to them.
- **The clerk's at 3 comes to novices who don't court him** on 13% of mornings (5% at 4). Their fines over a run fall from 294 to 285 rings: still small.
- **Hel's widened favour is the first the sim shows.** Bots on the frugal policy go without firewood every other night. With her requests done (plain story), an expert holds it on 55% of mornings and pays 61 rings for medicine over a run, against 176 without it; competent, 30% and 113. Without her requests, experts still hold it on 15% of mornings (131 rings). The extra night alone changed nothing, since bots always buy medicine.
- **The second favours are unmeasured.** Odin's matters only to a player slower than the sun (bots at 25 s a soul never are). Freyja's needs a bot that questions, Hel's second night a bot that skips medicine, and the clerk's comes to few novices (3% of a courting novice's mornings).

**Tests**
- **Engine (6):**
  - a favour is granted at its mark and not below; Odin's sun is in the day's shift and its ledger;
  - the clerk's halves each fine, rounding down;
  - Hel's holds for the night even after the audit costs her standing, and the night's outlook agrees;
  - Hel's spares the well any chance of falling sick (the outlook's odds, and 12 seeded nights), though a second night without firewood still makes them sick;
  - a god's favours add up at the second mark: a second minute, question and night, and the fines waived, with the rings spared filed;
  - Freyja's makes the first question free and the next one cost its price, and no count is kept without it.
- **Compiler (1):** favours compile; missing words and a favour named twice are refused.
- **Report (1):** the favours each day held, and the fines they spared.
- **e2e on the full game** (phone and desktop): a save on Day 5's morning with every god at its first mark, and Odin and the clerk at their second. It checks:
  - the morning's favours, the guide and the day's sun (two minutes more);
  - the free question at the desk;
  - the waived fine, its row at 0, and both of the clerk's notes at the audit;
  - Hel's favour at night, and no odds of falling sick with the firewood unpaid.

**Known limits**
- **The favours are small** (above). Odin's and Hel's are the ones the sim shows; the marks and values are content.
- **The second favours are guesses** (above): none of them is measured.
- **Loki has none** (above).
- **The words are drafts.**
- **The Daily and Endless are untouched,** and the demo has no favours.

## 44. After M7: promotion (gameplay brainstorm, item 1)

**Why.** One difficulty curve serves everyone: novices meet a cliff, and anyone who judges well cruises, with money that stops mattering. Promotion lets a strong player choose more pressure, inside the story.

The brainstorm's version, and what changed:
- **"After strong days"** is made concrete: two clean days in a row, meaning every soul judged rightly and none left at dusk.
- **"A promotion"** is two ranks: Chooser, Second Grade, and after clean days at it, Chooser, First Grade.
- **"A longer queue"** is souls added after the day's own, with the same sun.
- **"Fewer free citations, higher pay and a nightly tithe to Odin"** are kept. The first guesses at pay and tithe (+2 and +3 rings a soul; tithes of 6 and 14) made experts far richer than before, 1,753 rings at the end of a run against 764, the opposite of the aim. They're now +1 and +2 rings a soul, and tithes of 20 and 45.
- **"Declining costs nothing"** is kept, and a rank can be stepped down from at night, which the brainstorm didn't have. A player who overreaches isn't trapped into debt.

**The offer** (`promote` in `campaign/run.ts`, at each audit)
- **Counting:** clean days in a row are counted (`clean`). When they reach `cleanDays`, the next morning offers the next rank (`offer`) and the count starts again.
- **When:** from `promotion.from` (Day 4), never for the last day, and never in Story Mode, which has no sun and no fines to be promoted into.
- **Answered in the morning** (`{ t: 'promotion', accept }`). An offer still unanswered when the gate opens lapses, and is filed as declined.
- **Filed:** the day's audit files the answer (`offer`) and the day's rank (`rank`) in the ledger.

**A rank's day** (`rankOf`, `economyFor`)
- **The line:** the rank's `souls` come after the day's own (`extraSouls`). Each is made as the day's souls are, at the places after them, bound for a destination drawn from the day's mix on a stream of its own. So the day's own line is the same at any rank, and the requests and the line at dusk, which count on it, are untouched. One who would share a name with a soul already in the line is passed over.
- **The economy:** the wage rises by the rank's `wage`, and the citations forgiven before the fines fall by its `warnings` (never below none). The audit and the audit screen both use this rank-adjusted economy.
- **The sun doesn't grow.** The extra souls come in the same daylight, which is where most of a rank's pressure lies for a person, if not for a bot.

**The night**
- **The tithe:** Odin's `tithe` is owed for the rank the day was worked at (`titheTonight`). The night's upkeep, its outlook, the ledger's night record (`night.tithe`) and the forecast of the nights ahead all count it.
- **Stepping down** (`{ t: 'stepDown' }`, at night) takes the rank below, or none, from the next day, and starts the clean count again. Tonight's tithe is still owed, so a rank can't be taken for a day's pay and dropped before its tithe.

**The screens**
- **The morning** shows the offer: what the rank brings, what it costs, and that declining costs nothing. The rank held follows the purse, and tonight's bills include the tithe.
- **The audit** pays the rank's wage and forgives its citations.
- **The night** lists the tithe among the bills, with a card to step down; the nights ahead note the tithe.
- **The playtest report** lists each offer and what was made of it, the days worked at each rank, and any step down.

**Numbers.** The campaign pack's first guesses: `from 4, cleanDays 2`.

| Rank | Souls more a day | Citations forgiven | Wage | Tithe a night |
|---|---|---|---|---|
| Chooser, Second Grade | 2 | 1 fewer | +1 a soul | 20 |
| Chooser, First Grade | 4 | 2 fewer (none) | +2 a soul | 45 |

The sim (`pnpm sim campaign --promote`, 12 runs per policy, plain story; bots take every offer):

| Bots, payAll | Declining | Taking promotions | Days at Second / First Grade |
|---|---|---|---|
| Expert: rings at the end | 764 | 1,039 | 3.6 / 12.5 |
| Expert: the host at Ragnarök | 330 | 398 | |
| Competent: rings at the end | 451 | 451 | 4.8 / 0.6 |

- **Frugal and upgrades-first bots** show the same shape: experts +281 to +289 rings and +66 host; competent bots within 14 rings of declining.
- **Novices and careless bots** are never offered one.
- **At 45 s a soul,** promoted experts leave 3.8–7.7 souls at dusk over a run, against none at their own rank.

So for a bot a rank is money and a stronger host for the flawless, and a wash for the competent. What a person will mostly feel is the same sun over more souls, with fewer mistakes forgiven: the pressure the brainstorm asked for, which the sim can't show.

**Tests**
- **Engine (4):**
  - the offer after clean days, again after as many more when declined, and the count restarting after a mistake;
  - a rank's longer line (the day's own souls unchanged, no repeated names), wage, fewer citations forgiven and tithe, with the night's accounts adding up;
  - stepping down, from the next day, with the tithe still owed for the day worked at the rank;
  - no offers in Story Mode, past the last rank or for the last day, and an unanswered offer lapsing at the gate as declined.
- **Compiler (1):** a rank's missing words, or a rank named twice, are refused.
- **Report (1).**
- **Sim:** accounts that add up with the tithe.
- **e2e on the full game** (phone and desktop): a save on Day 4's morning with the offer. It's taken, the day is worked at the rank, and the rank is stepped down from at night. The test checks:
  - the offer's terms;
  - the rank after the purse, and tonight's bills with the tithe;
  - the longer line and the rank's wage;
  - the night's tithe, the nights ahead, and stepping down.

**Known limits**
- **Bots don't feel the squeeze.** At their pace the sun never runs short, so the sim shows the money and the host, not the difficulty. The playtest will say whether a rank is worth taking.
- **The story doesn't know about ranks yet.** No scene mentions one, and no ending reads it: a place for the writing pass.
- **Rank names and words are drafts.**
- **The Daily and Endless are untouched,** and the demo never reaches Day 4.

## 45. After M7: interruptions at the desk, part 1: the noon decree (gameplay brainstorm, item 7)

**Why.** Papers, Please gets its best moments from interruptions at the booth. Item 7 brings three to the desk, authored like story souls:
- a raven with a noon decree (Day 19, this section);
- a god who stops at the desk (Day 18);
- a jarl who jumps the queue with a bribe (Day 9).

The god and the jarl follow in their own changes.

The brainstorm's version, and what changed:
- **"A raven brings a noon decree, announced with time to adapt"** is kept. Two souls before the change, a raven lands on the desk with the news. The soul at the desk and the next are still judged by the morning's rules.
- **"Noon" is a place in the line, not a time of day.** A soul's destination is settled when it's made, so that its fairness can be proved. If the change followed the sun, the same soul would belong in two places depending on how fast the player worked. So the decree holds from a fixed soul of the day's own line: the ninth, on Day 19.
- **"The fairness check tests each soul against the rule in force when it's judged"** is kept, literally. Every soul after noon is made under the decree's rules: generated, given its evidence and validated under them. It's then judged under them at the desk. Every soul before noon is handled under the morning's rules.
- **The decree draws a day param again**, never to the same choice. Params are the rules that already change each day (Freyja's whim, Odin's claim). No rule text changes: the rulebook's rules read the params.
- **Its first soul shows the change.** That soul is made from the decree's `teach` archetype, as a day's first soul teaches its new rule. On Day 19 it's one of Freyja's picks under her new whim.

**The rule** (`NoonDecree` on a day spec; `createDayContext`, `soulCtx`)
- `noon: { at, notice, redraw, text, teach? }`.
- **The afternoon:** the day's context carries a second one for after noon. It's the same day, with the `redraw` params drawn again from the run's seed, never to the morning's choice.
- **Which souls:** `generateCase` makes a soul whose place in the day's line is `at` or later under the afternoon, and marks it (`noon`). Story souls placed at `at` or later are made the same way. A rank's extra souls come after the day's own line, so after noon too.
- **The line:** every soul made under the decree comes after every soul made before it. Souls who waited through the night come first, which can push a story soul past noon's place; the decree's souls are moved last, keeping their order.
- **The desk:** `stepShift`, the rule tracker (`ruledOut`) and the evidence it can read (`inspectable`) take the soul at the desk under its own rules (`soulCtx`).
- **Appeals:** an appeal of an afternoon soul is heard under the decree, since the appeal's desk holds that soul alone.
- **The line at dusk:** a soul the sun sets on is seen afresh the next day, under that day's rules, and loses its mark.
- **Where there are none:** Endless never brings a noon decree, and the compiler refuses one on the Daily or the primer.

**The screens**
- **The desk:** from `notice` souls before noon, the raven's news sits under the sun bar: its words, and the new choice's own. From noon, a line says "Since noon: …". The spot is a live region from the start of the shift, so screen readers hear the news when it comes.
- **The rulebook** shows the whims in force for the soul at the desk.
- **The playtest report** marks a mistake made after noon.

**Day 19.** Freyja's whim is drawn again from the ninth soul, and the raven comes two souls earlier. Its words are a draft for your sign-off: "A raven thumps down on the desk with word from Fólkvangr: Freyja has changed her mind, on the last day there is. From the soul after next, she wants others."

**Measured** (40 seeds, from a fresh Day 19 morning)
- **Fairness:** 686 souls, 326 of them after noon. Every one validates under the rules it's judged by, and no soul from before noon comes after one from after it.
- **Effect:** the decree changes where some soul goes on 36 days of 40, mostly its first soul after noon. Before `teach` it was 25 of 40. On the other four days, the first soul after noon fits both whims.
- **Cost to the morning:** on 4 seeds of 12, the afternoon had no slot bound for Fólkvangr. The planner brings one forward from the morning, so one morning soul changes, but the day's mix stays as drawn.
- **The sim can't show it.** Bots judge by where a soul belongs, not by the rules, so what the decree costs a person is for the playtest to show.

**Tests**
- **Engine (4):**
  - the redraw: never the same choice, the same every time, only on days with a decree, never on the Daily;
  - 8 days of souls, each judged and valid under its own rules, in order, with the teaching soul first after noon;
  - the rule tracker reads a soul after noon by the decree (by the morning's rules it would rule out the rule that decides it), and a stamp by the morning's whim is cited and filed as after noon;
  - souls left at dusk lose the decree.
- **Endless (1):** no round brings one.
- **Generator:** the fairness property tests, the oracle comparison and the sweep's ideal bot now read each soul under its own rules. Without that they failed on Day 19, as they should.
- **Compiler (1):** a decree is refused if:
  - the raven comes before the first soul;
  - noon falls past the shortest line;
  - a param has no other choice to draw;
  - the teaching archetype isn't in the day's queue;
  - its words are missing.
- **Report (1).**
- **e2e on the full game** (phone and desktop), from a Day 19 save made in Node:
  - no raven at first;
  - the raven two souls before noon, with an accessibility scan and no sideways scroll;
  - the new whim in the rulebook from noon;
  - a stamp by the morning's whim, cited.
- **Goldens:** Day 19's summaries changed. The Dailies didn't.
- **Also fixed:** on the desk layout, a rulebook long enough to scroll (Day 19's) couldn't be reached by the keyboard. The accessibility scan found it once the raven made the paper shorter. The rules paper is now a named region the keyboard can reach.

**Known limits**
- **One decree a day, and only params.** A decree that adds or repeals a rule would need rule texts that know about noon. None is needed yet.
- **The bots don't feel it** (above).
- **The words are drafts.**

## Sources
- Play: [target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en) · [testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- Steam Next Fest: [June 2027](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/june_2027) · [February 2027](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/feb_2027) · [overview](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest)
- Steam: [release process](https://partner.steamgames.com/doc/store/releasing) · [Steam Cloud](https://partner.steamgames.com/doc/features/cloud?language=english) · [Deck Verified](https://www.steamdeck.com/en/verified) · [Deck compatibility review](https://partner.steamgames.com/doc/steamhardware/compat)
- Steamworks libraries: [steamworks.js](https://github.com/ceifa/steamworks.js/) · [steamworks-ffi-node](https://github.com/ArtyProf/steamworks-ffi-node) · [steam-electron-build (Deck switches)](https://github.com/alexanderthurn/steam-electron-build)
- Capacitor: [Announcing Capacitor 8](https://ionic.io/blog/announcing-capacitor-8) · [8.4 SystemBars](https://capawesome.io/blog/whats-new-in-capacitor-8-4-0/)
- [itch.io HTML5 file limits](https://itch.io/t/893409/zipped-html5-game-number-of-files-limit)
- itch.io access (for §38): [access control](https://itch.io/docs/creators/access-control) · [limited releases](https://itch.io/docs/creators/limited-releases) · [download keys](https://itch.io/docs/creators/download-keys) · [restricted links to an HTML5 game](https://itch.io/t/471212/how-to-distribute-restricted-links-to-an-html5-game) · [download keys and restricted HTML games](https://itch.io/t/4199266/do-download-keys-not-work-for-restricted-html-games)
- Sound (for §39): [ASWG-R001 loudness](http://gameaudiopodcast.com/ASWG-R001.pdf) · [Opus recommended settings](https://wiki.xiph.org/Opus_Recommended_Settings) · [Safari and Ogg Opus](https://bugs.webkit.org/show_bug.cgi?id=238546) · [gaps in AAC loops](https://github.com/Selftend/selftend/issues/2437) · [streamer-safe game music](https://www.dl-sounds.com/streamer-safe-game-music/)
