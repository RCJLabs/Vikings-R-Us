# Story drafts and how to write scenes

Everything listed here is **draft writing**. Days 1–3 are on their second draft (M5), written against `docs/voice.md` for you to edit and sign off; everything after Day 3 is still first-draft placeholder. A scene stays marked `# draft` until you sign it off (delete the tag). The compiler counts the drafts: `pnpm content:compile --all` prints `N scenes, N draft, ~W words` per target.

## What is draft

| Piece | Where | Words |
|---|---|---|
| Morning and night scenes, Days 1–3 (second draft) | `content/packs/demo/scenes/d{1,2,3}.{morning,night}.ink` | ~1,820 |
| Morning and night scenes, Days 4–6 | `content/packs/campaign/scenes/d{4,5,6}.{morning,night}.ink` | ~860 |
| Thorvald's first visit (Day 3): three lines | `content/packs/demo/cases/thorvald-1.yaml`, strings `case.thorvald1.*` | 30 |
| Geir Hallsson, the oathbreaker you knew (Day 6): two lines | `content/packs/campaign/cases/geir.yaml`, strings `case.geir.*` | 20 |
| Oath lines, question answers, Huginn's line, registry crimes (Day 6) | strings `tm.oath.*`, `q.oath.*`, `rv.huginn.outlaw`; core `pool.crimes` | ~90 |
| Decrees, laws, lines and answers for Days 7, 8 and 11 (weapons, nails, tallies) | campaign strings `decree.d7`/`d8`/`d11`, `law.*Blade`, `law.*Ulfberht`, `tm.owner.*`, `tm.blade.*`, `q.owner.*`, `q.blade.*`, `tl.*`, `tell.*`, `q.tally.*` | ~450 |
| Days 10 and 12 (M5): the clerk and the baptized, Loki in borrowed faces | campaign strings `decree.d10`/`d12`, `rule.transfer`, `rule.detain`, `law.cross`/`primeSigned`/`hammer`/`stitchedLips`/`plainLips`, `obs.amulet.*`, `obs.lipScars.*`, `tm.creed.*`, `tm.guise.*`, `q.creed.*`, `q.guise.*`, `q.any.deflect.1`, `rv.huginn.baptized`/`primeSigned` | ~420 |
| Speaker names | strings `speaker.*` (demo, campaign) | — |
| Family, shop and ending text (M4.1) | strings `family.*`, `shop.*`, `ending.*` | ~150 |

What the drafts set up, so a rewrite can keep or change it on purpose:

- **Day 1:** Skögul trains you: the stamp, the wage, two forgiven mistakes, the brass pin for catching liars. The first letter home is from Ulf; Grandfather died of sickness (so he's in Hel, not Valhalla, and Asa doesn't know). Writing the truth tells only Ulf.
- **Day 2:** The quartermaster's birch-bark decree. Ulf loses his boatyard work; the roof over Asa's bed needs 5 rings (`roof_mended`).
- **Day 3:** Skögul hints that one soul has come back twice (Thorvald). Thorvald mentions he feels fine while everyone else looks cold. At night a stranger (Loki, unnamed) says "Lovely nails." and reacts to how you stamped Thorvald (home, Valhalla or Hel). His lips are crossed with small stitch scars: the Day 12 tell. The dead woman's nails grow: Naglfar foreshadowing.
- **Day 4:** Freyja claims her share. Your answer moves Freyja's or Odin's standing.
- **Day 5:** Rán and the drowned. At night Asa has the winter fever (`fx: family sister sick`) unless she's already sick or away. Skögul can lend you 10 rings (`owes_skogul`).
- **Day 6:** Odin's clerks bring the registry. Oathbreakers keep the ring they broke (the cue). Geir Hallsson, who sat at your father's table, is in the registry and says he isn't. The night depends on his stamp: his widow's bread (`geir_hel`), or the stranger praising your mercy (`geir_spared`, +1 Loki).

Flags the drafts set: `asked_about_lies`, `asked_twice`, `asked_namesake`, `letters_kind`, `letters_honest`, `roof_mended`, `met_loki`, `promised_medicine`, `owes_skogul`; from Thorvald's stamp `thorvald_met`, `thorvald_returned`, `thorvald_valhalla`; from Geir's `geir_judged`, `geir_hel`, `geir_spared`. Nothing reads most of them yet; they exist for later days and endings.

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
