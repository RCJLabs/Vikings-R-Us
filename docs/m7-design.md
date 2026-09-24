# M7 design: Days 7–20, endings and the full campaign

Draft for review. It covers the mechanics M7 builds; the story text comes after, as drafts for you to edit. Decisions marked **(choice)** are mine and cheap to change: they are content (YAML), not engine code.

## What exists

- **Mechanics through Day 12:** registry (6), rune-lens and borrowed blades (7), nails and clippers (8), TRANSFER and pendants (10), forged tallies (11), Loki and DETAIN (12). Day 9 has no spec yet.
- **Story for Days 1–6 and Day 12.** The plain campaign ends after Day 6.
- **Endings:** demoted, alone, and the placeholders for the demo, the slice and the unwritten rest.
- **The oracle is fast (M7.1).** Days 13–20 can add facts without the fairness tests slowing down.

## Design constraints kept

- Every soul's destination follows from its own facts through the rulebook, so every case can still be checked by the solver, the oracle and F1–F8.
- Ravens never lie. Muninn may leave blanks.
- Testimony can lie. Every lie that changes the outcome can be caught.
- Upgrades change speed only.

## Days

| Day | New rule | How it plays |
|---|---|---|
| 9 | none | Day 8's rules, a longer queue. Draupnir pays at night. The first big family choice. |
| 13 | Muninn remembers lives | Muninn now reports one fact about a soul's life (oath broken or kept, faith, whose weapon it was). Huginn keeps reporting how they died, and sometimes adds a true fact that isn't decisive. The ravens can "disagree": both are true, but one points to Valhalla and the other to Hel, and the Order of Judgment decides. Muninn forgets more often as Ragnarök nears. |
| 14 | Hel's hall is full | Straw deaths (sickness, old age) that no earlier rule claims go to the clerk: TRANSFER **(choice: the alternatives are Rán or holding them at the gate)**. The cause now matters for unworthy souls, not only worthy ones. |
| 15 | Odin's claim | A second daily whim. Odin claims the worthy with a visible trait (two or more front wounds, or a true Ulfberht) for Valhalla, ahead of Freyja's whim. A worthy soul both gods claim goes to Valhalla. Stamping it for Freyja is wrong but wins her favour: the faction choice. |
| 16 | Liars forfeit the halls | A soul that would enter Valhalla (or, from Day 17, is spear-marked) but lies goes to Hel. A soul is a liar exactly when it tells a lie, in speech or on a forged tally. Souls are presumed honest until a lie is caught. |
| 17 | The spear-mark loophole | A new body sign: a spear mark cut before death (Ynglinga saga). A straw death with the mark goes to Valhalla, ahead of Hel's overflow. Liars still forfeit it. |
| 18 | none | Draupnir pays. Naglfar is nearly built; Loki's last offer. |
| 19 | none | Every rule, the hardest queue. The last night. |
| 20 | none | Ragnarök: a surge queue (about 20 souls), then the endings. |

Rules accumulate: every rule stays in force to Day 20.

### Rule order (Day 20)

| Order | Rule | Destination |
|---|---|---|
| 90 | Loki in disguise | DETAIN |
| 100 | still breathing | RETURN |
| 200 | outlaw | HEL |
| 300 | baptized | TRANSFER |
| 500 | drowned | RÁN |
| 550 | borrowed weapon | HEL |
| 580 | liar who would enter a hall | HEL |
| 590 | worthy, Odin's claim | VALHALLA |
| 600 | worthy, Freyja's whim | FÓLKVANGR |
| 640 | spear-marked straw death | VALHALLA |
| 700 | worthy | VALHALLA |
| 950 | straw death (Hel is full) | TRANSFER |
| 999 | everyone else | HEL |

Liars lose Fólkvangr too **(choice)**. It keeps the rule to one line: "a liar forfeits the halls of the worthy".

## Engine changes

1. **Muninn's reports (Day 13).** Muninn gets lines that assert life facts (`outlaw`, `faith`, `weaponOwner`). The raven planner gains two knobs:
   - `muninnRecall`: how often Muninn reports a decisive life fact instead of only naming the soul.
   - `huginnAside`: how often Huginn adds a true fact that isn't decisive.

   Both keep F1: every raven line is true.
2. **Liars (Day 16).** A fact can be marked `fromLies`. It is never sampled: it is true exactly when the soul tells a lie. The generator plans lies before judging, so `liar` is part of the truth the rulebook reads.
   - **Solver:** a caught lie (a contradiction, or a forged tally's tell) makes `liar` true at trust 4. Otherwise it is presumed false.
   - **Oracle:** in each world, `liar` must equal "some line is false in this world", and it is presumed false.
   - **Checks:** F6 already requires a decisive `liar` that breaks its presumption to be proven, so a worthy liar's lie must be catchable. No new check is needed.
3. **Spear mark (Day 17).** A fact, an observation (front, salience 2), a world constraint (only straw deaths carry it) and drawings in all three art styles.
4. **Endings state.** The run counts souls sent to each hall and nails left uncut (Naglfar). Endings can read three new paths:
   - `sent.<DEST>`
   - `naglfar`
   - derived: `ragnarok` (the host's strength) and `lead.<faction>` (one faction's standing minus the highest other).

   All are integer math. The fields are optional, so old saves load unchanged.

## Endings

Checked each night in this order. The first that holds ends the run. Faction endings wait for Day 20's night.

| Order | Ending | When |
|---|---|---|
| 10 | Demoted | two nights in a row below −30 rings (exists) |
| 20 | Alone | the whole family gone (exists) |
| 100 | Naglfar Sails Early | from Day 18: a deal with Loki, and enough nails left uncut |
| 200 | Rebirth (true ending) | Day 20: the truth learned (story flags), a strong host, family at home |
| 300 | Smuggled Home | Day 20: the ferryman paid (story), 60+ rings, someone left to smuggle |
| 400 | The Transfer | Day 20: the clerk's contract signed, clerk standing 4+ |
| 500 | Hel's Steward | Day 20: Hel leads the factions, standing 3+ |
| 510 | Freyja's Own | Day 20: Freyja leads, standing 3+ |
| 520 | Chooser Eternal | Day 20: Odin leads |
| 990 | The Wolf Wins | Day 20: the host is too weak |
| 1000 | The Last Stand | Day 20, otherwise |

- **Host strength** = 2 × worthy einherjar − unworthy + 2 × Fólkvangr + 2 × Hel − 2 × uncut nails. This is the plan's formula scaled by two, so it stays integer.
- **Bots must reach every ending.** The campaign sim gains story policies (side with Loki, save for the ferryman, and so on).

## Economy

The problem: by Day 6 a competent player has about 126 rings and nothing to buy.

- **Winter bills.** The hearth goes from 8 rings to 14 by Day 18, and medicine from 12 to 18.
- **New upgrades (speed only).** Each new tool gets one, and so do the ravens and questioning. They cost 20–40 rings.
- **Story costs.** Choices in the story cost rings: the healer, a brother's debt, the clerk's fee, the ferryman. The ferryman (Smuggled Home) is the big goal to save for.
- **Tuning.** `pnpm sim campaign` sets the numbers; the target is a careful player ending Day 20 with savings, only if they skipped the ferryman.

## Endless (last in M7; first to cut)

Walk the days' rules in order, five souls per day's rules, three strikes, no sun. The score is the souls judged. It reuses the day specs, so it needs no new content.

## Order of work

- M7.2: this document.
- M7.3: Days 9, 13–15 (Muninn's reports, Hel's overflow, Odin's claim).
- M7.4: Day 16 (liars) and Day 17 (spear mark, art).
- M7.5: Days 18–20, the 20-day campaign, endings state and conditions, economy.
- M7.6: story drafts for Days 7–11 and 13–20.
- M7.7: bots reach every ending; every day meets the generation gates; Endless if time allows.

## Open questions for you

1. Hel's overflow goes to the clerk (TRANSFER). Would you rather use Rán, or hold them at the gate (DETAIN)?
2. Liars lose Fólkvangr as well as Valhalla. Or only Valhalla?
3. Spear-marked souls count as worthy einherjar at Ragnarök. Keep that?
