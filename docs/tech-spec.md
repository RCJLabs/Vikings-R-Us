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
- **Gamepad** (polled each frame, with edge detection):
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
- No gamepad or focus graph yet (M6, with the Deck). Keyboard play uses native focus plus the keymap.
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
- **The woodcut was chosen** (September 2026) and is the default. After the choice, its hands were redrawn: open hands with fingers and a thumb, and a fist closed round the grip with the thumb over the index finger. The held weapon now shows from behind too, though `grip` stays a front-view sign (the back view has no hand hotspots).
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

## Sources
- Play: [target API level requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en) · [testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- Steam Next Fest: [June 2027](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/june_2027) · [February 2027](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/feb_2027) · [overview](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest)
- Steam: [release process](https://partner.steamgames.com/doc/store/releasing) · [Steam Cloud](https://partner.steamgames.com/doc/features/cloud?language=english) · [Deck Verified](https://www.steamdeck.com/en/verified) · [Deck compatibility review](https://partner.steamgames.com/doc/steamhardware/compat)
- Steamworks libraries: [steamworks.js](https://github.com/ceifa/steamworks.js/) · [steamworks-ffi-node](https://github.com/ArtyProf/steamworks-ffi-node) · [steam-electron-build (Deck switches)](https://github.com/alexanderthurn/steam-electron-build)
- Capacitor: [Announcing Capacitor 8](https://ionic.io/blog/announcing-capacitor-8) · [8.4 SystemBars](https://capawesome.io/blog/whats-new-in-capacitor-8-4-0/)
- [itch.io HTML5 file limits](https://itch.io/t/893409/zipped-html5-game-number-of-files-limit)
