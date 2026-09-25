# Sound brief

For commissioning the game's music, ambience and sound effects. The game's system for them is built ([`tech-spec.md`](tech-spec.md) §39); what it lacks is the sound. Today every build plays only synthesised placeholder effects. Each file below drops into place as it arrives, and nothing else plays until it does: placeholder music would be worse than silence.

## What the sound has to do

**The game.** A new Valkyrie judges the dead at a gate before dusk, for twenty days until Ragnarök, with a family at home to feed. It's a dark comedy with a serious core: an afterlife run as a bureaucracy, at the edge of a battlefield, with petty and dangerous gods.

**It's a game of reading and looking.** The player reads testimony, a rulebook and story scenes, and studies bodies for small signs. Sound must never compete with that. That means:
- no sung words;
- nothing that demands attention in a loop heard for ten minutes;
- melody saved for the title, the night and the endings.

**Where it plays.** Each place has a bed: music, ambience, or both.

| Place | Screens | How long a player stays | Notes |
|---|---|---|---|
| Title | Title, menus, save slots | Seconds to minutes | The game's theme |
| Gate | A shift | 6 to 11 minutes a day | Music, a tension stem and ambience. Heard most, so the most restraint |
| Morning | The decree and the morning's story scene | 1 to 3 minutes | Mostly under story text |
| Tally | The audit, a Daily's or Endless's results | Under a minute | Numbers being read |
| Night | Home, bills, letters, the night's scene | 1 to 3 minutes | The family's warmth, and worry |
| Ending | An ending's text | 1 to 2 minutes | Plays once. The full game adds three moods, and the demo one |

**The tension stem rises as the sun sinks.** It's silent through the first half of the day, then climbs on an S-curve to full at dusk. The calm gate music gives up about a third of its level as it does. The stem must work at every level from silent to full against the music. So:
- it's the same length, tempo and key as the music, starting together;
- the pair loop together for as long as a shift lasts;
- it adds pressure (pulse, low drones, a clock-like figure), not a new melody.

**Music drops under story text.** While a scene or an ending is on screen, the music falls to 0.4 (about −8 dB) and the ambience to 0.55 (about −5 dB). The music should still be recognisable at that level, so avoid anything that depends on quiet detail.

**Cues mark what the player does.** Each is short and distinct, and each goes with something visible. Nobody needs sound to play, so the cues need no captions; keep it that way.

| Cue | When | Files | Length |
|---|---|---|---|
| stamp | A stamp comes down on the writ | 3 variants | ≤ 0.4 s |
| send | The soul is sent on its way | 2 variants | ≤ 0.5 s |
| flip | The body is turned over | 1 | ≤ 0.4 s |
| inspect | A sign is looked at (often) | 1 | ≤ 0.1 s |
| feather | The feather held to the lips | 1 | ≤ 0.8 s |
| tool | A tool taken up (rune-lens, clippers) | 1 | ≤ 0.2 s |
| found | A lie caught | 1 | ≤ 0.5 s |
| miss | Two papers compared that don't conflict | 1 | ≤ 0.4 s |
| answer | A soul answers a question | 1 | ≤ 0.3 s |
| citation | A mistake cited | 1 | ≤ 0.8 s |
| dusk | The sun goes down | 1 | ≤ 3 s |
| coins | The shift's pay counted | 1 | ≤ 1 s |

**Most players hear it through a phone, a laptop or a Steam Deck.** Small speakers give little bass. The stamp's weight needs a knock in the middle as well as a thump, and the tension can't live only below 100 Hz.

## The files

Names are exact: lower case with hyphens, one file per name in each format below. They go in `assets/<pack>/sound/`. The lists they come from are `content/packs/<pack>/sound.yaml`.

**The demo and the full game** (`assets/core/sound/`, plus the demo's one):

| File | Place | Loops | Length |
|---|---|---|---|
| title | Title | yes | 60–90 s |
| gate | Gate, music | yes | 60 s |
| gate-tension | Gate, tension stem | yes | exactly as `gate` |
| gate-wind | Gate, ambience: wind off the battlefield, distant crows | yes | 30 s |
| morning | Morning, music | yes | 45–60 s |
| dawn | Morning, ambience | yes | 30 s |
| tally | Tally | yes | 30–45 s |
| night | Night, music | yes | 60–90 s |
| hearth | Night, ambience: fire, wind outside | yes | 30 s |
| ending | An ending without its own music (the demo's end, the slice's) | once | 60–90 s |
| ending-lost (demo pack) | Demoted, or the house left empty | once | 60–90 s |
| stamp-1, stamp-2, stamp-3, send-1, send-2, flip, inspect, feather, tool, found, miss, answer, citation, dusk, coins | The cues above | once | as above |

**The full game only** (`assets/campaign/sound/`):

| File | Place | Loops | Length |
|---|---|---|---|
| ragnarok | Day 20's gate, the surge before the battle | yes | 60 s |
| ragnarok-tension | Its tension stem | yes | exactly as `ragnarok` |
| ragnarok-storm | Its ambience | yes | 30 s |
| ending-glory | Odin's and Freyja's endings: a god's host carries the day | once | 60–90 s |
| ending-dark | Hel's hall, Naglfar sailing, the wolf, the last stand | once | 60–90 s |
| ending-home | The family's endings: smuggled home, the transfer, rebirth | once | 60–90 s |

**Scope for a quote:**
- 12 to 16 minutes of music across 13 pieces, two of them tension stems;
- 4 ambience loops;
- 15 short effects.

## Delivery

- **Masters:** WAV, 48 kHz, 24-bit, stereo. Cues can be mono.
- **For the game:** each file twice.
  - Ogg Opus (`.ogg`): 128 kbps for music, 64–96 kbps for ambience.
  - AAC in MP4 (`.m4a`), about 160 kbps.

  Opus loops without a gap wherever it plays. The AAC copy is for Safari before 18.4, which can't play Ogg Opus, and Safari loops AAC cleanly. Chrome and Firefox can leave a gap in AAC, so they get the Opus. For example: `ffmpeg -i gate.wav -c:a libopus -b:a 128k gate.ogg` and `ffmpeg -i gate.wav -c:a aac -b:a 160k gate.m4a`.
- **Loops:**
  - an exact length in samples, seamless at the join, with no fade in or out;
  - a stem the same length as its music, down to the sample.

  The game decodes each loop whole, which is what keeps loops gapless and stems in step. It costs memory: 60 s of stereo is about 23 MB decoded. So loops stay within the lengths above.
- **Pieces that play once** end naturally, within 90 s.
- **Levels:**
  - ASWG-R001, the published game-audio recommendation, is −18 LUFS for portable devices, −24 for home consoles, and true peak no higher than −1 dBTP.
  - Most players here are on phones, laptops and the Deck, so the whole game should land near −18.
  - Deliver music around −20 LUFS integrated, ambience around −30, and cues peaking near −6 dBFS, all at or below −1 dBTP.
  - The game's default volumes are then set by measuring its output, once the files are in.

## How it goes in, and how to check it

1. Put the files in the folders above, then run `pnpm content:compile --all`. Each target's line says how many of its files are there (`sound 9 of 26 files`); whatever's missing stays silent.
2. `pnpm dev` plays them. Settings gains Music and Ambience volumes once a build has any.
   - `?sound=sketch` swaps in the dev build's sketches instead: drones and noise that show the beds, the tension and the ducking, and nothing more.
3. **Acceptance:**
   - every loop joins without a gap or a click, in Chrome, Firefox and Safari and on a phone;
   - a stem stays in step with its music through a whole 11-minute shift;
   - nothing clips;
   - under story text the music is still itself;
   - on a phone speaker the stamp still lands.
   - And an honest test against silence: anything that loses to silence doesn't ship.

## Rights

- **Work for hire, or an exclusive licence,** covering the game on every platform and store (Steam, Google Play, the web), its store pages and trailers, and a soundtrack release if you want one.
- **Streams and videos of the game, by anyone, must be free to use the music.** Music registered with Content ID gets streamers' videos claimed even when the game licensed it properly. So:
  - no Content ID or similar registration of the game's music, by the composer or any distributor;
  - no collecting-society (PRO) registration that would lead to claims, unless the contract settles it in writing.

  Streamers are this game's marketing.
- **Keep the stems** as well as the mixes, for trailers.

## Style (to settle with the composer)

- **The gate is an office in the mist:** dry and procedural, the stamp and the quill in the foreground. Frame drum, low strings or drones, a bowed lyre (tagelharpa) are a start, sparingly.
- **The gods are distant horns,** not a choir.
- **The night is small and warm,** a hearth tune with worry under it.
- **Ragnarök is the gate's material, broken.**
- **The clerk's department** may nod to plainchant, but the comedy is about bureaucracy, never belief (the build plan's rule).
- **Avoid the trailer "epic Viking" sound** (massed choirs, taiko, chanted names). It fights the comedy and it's everywhere.
- **Symbols to avoid** are in the art brief. The same care applies to any words or runes in titles and credits.

## Sources

From search results:
- [ASWG-R001 loudness recommendations](http://gameaudiopodcast.com/ASWG-R001.pdf) · [a guide to balancing a game's loudness](https://vndev.wiki/Guide:Balancing_a_Game's_Loudness)
- [Opus recommended settings (Xiph)](https://wiki.xiph.org/Opus_Recommended_Settings)
- [Safari and Ogg Opus: WebKit bug 238546](https://bugs.webkit.org/show_bug.cgi?id=238546) · [Opus browser support](https://www.testmuai.com/learning-hub/opus-audio-codec-browser-support/)
- [Gaps in AAC loops across browsers](https://github.com/Selftend/selftend/issues/2437) · [Web Audio discussion of gapless loops](https://github.com/WebAudio/web-audio-api/discussions/2505)
- [Streamer-safe game music](https://www.dl-sounds.com/streamer-safe-game-music/) · [music licensing for game developers](https://www.foximusic.com/blog/music-licensing-for-game-developers-guide/)
