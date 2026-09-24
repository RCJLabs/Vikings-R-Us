# Story drafts and how to write scenes

Everything listed here is **draft writing**. Days 1–3 are on their second draft (M5), written against `docs/voice.md` for you to edit and sign off; everything after Day 3 is first draft. Days 7–11 and 13–20 got theirs in M7. A scene stays marked `# draft` until you sign it off (delete the tag). The compiler counts the drafts: `pnpm content:compile --all` prints `N scenes, N draft, ~W words` per target.

## What is draft

| Piece | Where | Words |
|---|---|---|
| Morning and night scenes, Days 1–3 (second draft) | `content/packs/demo/scenes/d{1,2,3}.{morning,night}.ink` | ~1,820 |
| Morning and night scenes, Days 4–6 | `content/packs/campaign/scenes/d{4,5,6}.{morning,night}.ink` | ~860 |
| Morning and night scenes, Days 7–11 and 13–20 (M7) | `content/packs/campaign/scenes/d{7…11,13…20}.{morning,night}.ink` | ~7,700 |
| Thorvald's first visit (Day 3): three lines | `content/packs/demo/cases/thorvald-1.yaml`, strings `case.thorvald1.*` | 30 |
| Thorvald again (Day 16): three lines | `content/packs/campaign/cases/thorvald-16.yaml`, strings `case.thorvald16.*` | 35 |
| Geir Hallsson, the oathbreaker you knew (Day 6): two lines | `content/packs/campaign/cases/geir.yaml`, strings `case.geir.*` | 20 |
| Oath lines, question answers, Huginn's line, registry crimes (Day 6) | strings `tm.oath.*`, `q.oath.*`, `rv.huginn.outlaw`; core `pool.crimes` | ~90 |
| Decrees, laws, lines and answers for Days 7, 8 and 11 (weapons, nails, tallies) | campaign strings `decree.d7`/`d8`/`d11`, `law.*Blade`, `law.*Ulfberht`, `tm.owner.*`, `tm.blade.*`, `q.owner.*`, `q.blade.*`, `tl.*`, `tell.*`, `q.tally.*` | ~450 |
| Day 12 in the vertical slice (M5): morning and night scenes, Loki's story soul (two lines), the slice's ending | `content/packs/campaign/scenes/d12.{morning,night}.ink`, `cases/loki-12.yaml`, strings `case.loki12.*`, `ending.sliceEnd.*`, `speaker.clerk` | ~830 |
| Days 10 and 12 (M5): the clerk and the baptized, Loki in borrowed faces | campaign strings `decree.d10`/`d12`, `rule.transfer`, `rule.detain`, `law.cross`/`primeSigned`/`hammer`/`stitchedLips`/`plainLips`, `obs.amulet.*`, `obs.lipScars.*`, `tm.creed.*`, `tm.guise.*`, `q.creed.*`, `q.guise.*`, `q.any.deflect.1`, `rv.huginn.baptized`/`primeSigned` | ~420 |
| Days 9 and 13–20 (M7): decrees, rules, Odin's claims, Muninn's lines, the spear mark | campaign strings `decree.d9`, `decree.d13`–`d20`, `rule.helFull`/`odinClaim`/`liars`/`spearMark`, `whim.odin.*`, `law.noMark`, `obs.spearCut.*`, `rv.muninn.*`, `q.blade.plain.*` | ~500 |
| The campaign's endings (M7) | campaign strings `ending.*` | ~320 |
| Speaker names | strings `speaker.*` (demo, campaign) | — |
| Family, shop and ending text (M4.1, M7) | strings `family.*`, `shop.*`, demo `ending.*` | ~250 |

What the drafts set up, so a rewrite can keep or change it on purpose:

- **Day 1:** Skögul trains you: the stamp, the wage, two forgiven mistakes, the brass pin for catching liars. The first letter home is from Ulf; Grandfather died of sickness (so he's in Hel, not Valhalla, and Asa doesn't know). Writing the truth tells only Ulf.
- **Day 2:** The quartermaster's birch-bark decree. Ulf loses his boatyard work; the roof over Asa's bed needs 5 rings (`roof_mended`).
- **Day 3:** Skögul hints that one soul has come back twice (Thorvald). Thorvald mentions he feels fine while everyone else looks cold. At night a stranger (Loki, unnamed) says "Lovely nails." and reacts to how you stamped Thorvald (home, Valhalla or Hel). His lips are crossed with small stitch scars: the Day 12 tell. The dead woman's nails grow: Naglfar foreshadowing.
- **Day 4:** Freyja claims her share. Your answer moves Freyja's or Odin's standing. Ulf sweeps a smithy.
- **Day 5:** Rán and the drowned. At night Asa has the winter fever (`fx: family sister sick`) unless she's already sick or away. Skögul can lend you 10 rings (`owes_skogul`).
- **Day 6:** Odin's clerks bring the registry. Oathbreakers keep the ring they broke (the cue). Geir Hallsson, who sat at your father's table, is in the registry and says he isn't. The night depends on his stamp: his widow's bread (`geir_hel`), or the stranger praising your mercy (`geir_spared`, +1 Loki).
- **Day 7:** The rune-lens, owners' runes and copied Ulfberhts (the copies are spelled right). At night Ulf's smith is taken for selling fake Ulfberhts, and Ulf carved the letters. Pay his share of the fine, 15 rings (`ulf_fine_paid`), or let him face it (`ulf_debt`).
- **Day 8:** Naglfar and the clippers. At night the stranger asks you not to clip, now and then, and offers a place on the ship for anyone you name: give him your family's names (`loki_deal`, Loki +2), refuse (`refused_loki`) or ask who he is.
- **Day 9:** Draupnir's payday. If you owe Skögul, pay her back (−10) or put it off. At night Ulf is offered shipyard work in the north by a man with very clean hands: tell him to go (`ulf_shipyard`, +10 rings from his advance) or stay (`ulf_home`).
- **Day 10:** The clerk of the White Christ sets up his table. Shaking his hand is clerk +1. At night: the man baptized twenty times for the shirts. Help with the form (`helped_clerk`, clerk +1) or ask about his end of the table (`heard_pension`).
- **Day 11:** Forged tallies and their three tells. At night a carver has been selling families better tallies for their dead; he offered one for Grandfather (or, if she's gone, for Mother). Tell the truth (`letters_honest`), ask for his name (`reported_carver`, Odin +1) or tell a kindness (`letters_kind`). If Asa is sick, a healer will cure her for the winter for 15 rings (`fx: family sister well`).
- **Day 12:** Skögul explains Brokkr's scars; the clerk of the White Christ has his own table. If you met the stranger, tell Skögul (`told_skogul`, Odin +1) or keep quiet (`kept_quiet`, Loki +1). The story soul Hrafn Sigurdsson is Loki and knows you: DETAIN sets `loki_detained` (Odin +1), VALHALLA `loki_in_valhalla` (Loki +2). At night the stranger comes back either way, holding a letter from home. If Ulf went north he is building Loki's ship; if he stayed, Loki knows about the Ulfberhts. He'll leave your brother (or family) out of his report if you leave him out of yours: name him (`reported_loki`, Odin +2, Loki −2) or cover for him (`covered_loki`, Loki +2, Odin −1).
- **Day 13 (the midpoint twist):** both ravens report. At night Muninn tells you Odin woke the seeress and knows how it ends, his own death included. Ask what else she said (`truth` +1: "something green, after"), ask why Odin goes on (Odin +1), or ask whether Skögul knows.
- **Day 14:** Hel's hall is full and her straw deaths go to the clerk, who has "plenty of room" (offering help is clerk +1). At night Móðguðr, who keeps the bridge to Hel, says Hel is on strike until someone at the gate says the quiet dead count. Ask about Grandfather (`truth` +1: he sits near Baldr, who walks out into the new world after the fire). Then side with Hel (`sided_hel`, Hel +2, Odin −1), with Odin (Odin +1, Hel −1), or neither.
- **Day 15:** Freyja asks you to send her the souls Odin now claims. Side with her (`sided_freyja`, Freyja +2, Odin −1), with the decree (`sided_odin`, Odin +2, Freyja −1), or with the Order. At night a ferryman at the fjord's mouth offers the family a shore the wolf won't reach: 20 rings now (`ferryman`), 60 on the day.
- **Day 16:** Liars forfeit the halls. Thorvald is in the queue, still alive (story soul, RETURN; `thorvald16_judged`, `thorvald16_returned`). At dusk he tells you about Hoddmímir's wood, where nothing finds you: ask about it and Skögul tells the song of the two who survive the fire (`truth` +1, `wood_known`).
- **Day 17 (the family's fate):** Skögul tells how Odin marked himself with a spear. At night home asks where the family should be when the horn blows. The ship (if you have Loki's deal, or Ulf is at the shipyard: `loki_deal`), the ferry (`ferryman`, or pay the 20 now), Hoddmímir's wood (if you know of it: `wood`), or home together (`stay_home`). Each choice drops the others.
- **Day 18:** The last Draupnir. The clerk offers a transfer to his department, "unaffected" by Ragnarök, for a 10-ring fee (`clerk_contract`, clerk +2). At night Loki's last offer: keep the deal (Loki +1) or break it (`broke_loki`, Loki −3, Odin +1); without a deal, take it now (`loki_deal`, which replaces Day 17's plan) or refuse.
- **Day 19 (the last night):** Skögul will ride out tomorrow; she forgives your debt. If you've learned anything of the after, she tells the rest of the song: the green earth, Baldr, the gold game pieces in the grass (`truth` +1). Then who you ride with in your heart: Odin, Freyja or Hel +2, or nobody.
- **Day 20:** Ragnarök. The horn, the einherjar riding out, the surge queue. The night's scene sets nothing; it shows where your family is (wood, ferry, ship or home) before the ending.
- **The slice's jump (Days 4–11):** a vertical-slice run jumps from Day 3's night to Day 12 (`campaign.yaml` `slice`). The jump stands in for the skipped days: +30 rings, Odin, Freyja and the clerk +1, and the flags `slice` and `ulf_shipyard` (Ulf found work at a shipyard in the north). Day 12's morning opens with a paragraph summing up those days when `slice` is set.

Flags the drafts set: `told_skogul`, `kept_quiet`, `loki_judged`, `loki_detained`, `loki_in_valhalla`, `reported_loki`, `covered_loki` (Day 12); `asked_about_lies`, `asked_twice`, `asked_namesake`, `letters_kind`, `letters_honest`, `roof_mended`, `met_loki`, `promised_medicine`, `owes_skogul`; from Thorvald's stamps `thorvald_met`, `thorvald_returned`, `thorvald_valhalla`, `thorvald16_judged`, `thorvald16_returned`; from Geir's `geir_judged`, `geir_hel`, `geir_spared`; Days 7–20: `ulf_fine_paid`, `ulf_debt`, `loki_deal`, `refused_loki`, `ulf_shipyard`, `ulf_home`, `helped_clerk`, `heard_pension`, `reported_carver`, `truth` (a count), `sided_hel`, `sided_freyja`, `sided_odin`, `ferryman`, `ferryman_doubted`, `wood_known`, `wood`, `stay_home`, `clerk_contract`, `broke_loki`. The endings read `loki_deal`, `truth`, `wood`, `ferryman` and `clerk_contract`; later scenes read the rest.

## Endings and the story choices that reach them

Endings are checked every night in order; the first that holds ends the run (`content/packs/campaign/campaign.yaml`). Standing moves through the story choices above and through wrong stamps (a soul sent where a god wanted it).

| Ending | Needs | Reached through |
|---|---|---|
| Naglfar sails early | Day 18 or later, `loki_deal`, 6+ souls sent on with their nails uncut | Loki's deal (Day 8, the ship on Day 17, or Day 18), then leaving nails long on purpose. Each is a citation. |
| The green earth (the true ending) | Day 20, `wood`, `truth` 3+, a strong host (ragnarok 40+), someone at home | Asking on Days 13, 14, 16 and 19 (three of the four), and Hoddmímir's wood on Day 17 |
| Smuggled home | Day 20, `ferryman`, 60+ rings, someone at home | The ferry (Day 15 or 17), and saving the fare |
| The transfer | Day 20, `clerk_contract`, clerk standing 4+ | The contract (Day 18), and helping the clerk (Days 10 and 14) |
| Hel's steward | Day 20, Hel leads the factions, Hel 3+ | Siding with Hel (Days 14 and 19) |
| Freyja's own | Day 20, Freyja leads, Freyja 3+ | Siding with Freyja (Days 4, 15 and 19) |
| Chooser eternal | Day 20, Odin leads | Siding with Odin |
| The wolf wins | Day 20, a weak host (ragnarok 0 or less) | Judging badly |
| The last stand | Day 20, otherwise | Everything else |

The two failures (demoted, and an empty house) can end any night.

## Writing a scene

One Ink file per scene in a pack's `scenes/` folder. The file name is the scene id: `d3.night.ink` is `scene.d3.night`. A day plays its scenes by naming them in its day spec:

```yaml
scenes: { morning: scene.d3.morning, night: scene.d3.night }
```

Scenes keep no Ink state from one to the next. Memory across days lives in the run's **flags**, which scenes read and set.

**Reading the run.** Declare what you use; these are the only externals the game provides:

```ink
EXTERNAL flag(name)      // a flag's value, 0 if never set
EXTERNAL standing(faction)   // odin, freyja, hel, loki, clerk
EXTERNAL rings()
EXTERNAL day()
EXTERNAL home(id)        // 1 if that family member isn't gone
EXTERNAL sick(id)        // 1 if they're sick tonight
```

**Changing the run.** Only through `# fx:` tags. They're collected as the scene plays and applied once when it ends:

```ink
You send what you can. # fx: rings -5
# fx: standing freyja +1
# fx: flag owes_loki            (sets it to 1)
# fx: flag thorvald +1          (adds 1)
# fx: flag deals = 2            (sets it to 2)
# fx: family sister sick        (or: well)
```

A tag on its own line attaches to the next line of text, which is fine inside a choice's branch. **Don't put fx tags on a choice line.** Ink can attach them to the choice instead of the text, and then they never fire. The compiler rejects them there.

**Choices.** Write each choice's whole text in brackets and what happens on the following lines:

```ink
* ["What if they lie?"]
  "They will." # speaker: skogul
```

The game echoes the picked option as its own line (so a reply never appears without the question it answers). Text outside the brackets would print a second time, so the compiler rejects it. Put a `speaker:` tag only on lines that are that character's words; narration has no speaker.

**Other tags.**
- `# speaker: skogul` names who is talking. It needs a `speaker.skogul` string.
- `# draft` as the first line marks the whole scene as placeholder writing.

**What the compiler checks** (`pnpm content:compile`):
- Ink errors and warnings.
- Only the externals above.
- Choices written as `[whole text]`.
- Every fx tag parses, reached or not, and is plain text.
- Every day's scene exists and every scene is played by some day.
- Speaker strings exist.
- Family members named in effects exist.

It also walks **every choice path** of each scene in three sample runs: a fresh one, one gone badly (everyone sick, every flag set, in debt) and one gone well (someone already gone). Each path must end within 500 paths. These walks are a smoke test, not a proof over all runs: a condition that only goes wrong at, say, exactly 7 rings isn't covered.

## Writing a story soul

A story soul is a case written for the story, one YAML file per soul in a pack's `cases/` folder. It's generated like any other soul, from truth constraints, lies and personas, but with a fixed name and look and its own seed, so it's the same soul in every run. A day places it in the queue:

```yaml
queue:
  scripted:
    - { case: case.thorvald1, at: 4 }   # 0-based position; generated souls keep theirs
```

Fields:
- `expect`: where it must be sent. The compiler generates the soul for every day that places it, under every day param choice (Freyja's whims), and fails if it can't be made or would go elsewhere.
- `lines`: string keys for extra things the soul says. They claim nothing, so they can't change the judgment.
- `when`: a run condition (the same language as endings) for whether it appears at all.
- `onStamp`: story effects by the stamp used, applied at the audit. `'*'` matches any stamp; an unjudged soul does nothing.

Define a story soul in the pack of the day that places it (demo for Days 1–3, campaign after). The compiler reports a soul no day places.
