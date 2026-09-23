# Vikings game: 10 concepts

## Context
- `RCJLabs/Vikings-R-Us` was empty when this was written (no commits, no remote branches). No existing code constrains these ideas.
- Assumed constraints: solo dev, web stack shipped as a PWA on GitHub Pages and a TWA on Google Play. The game should work on phones in portrait, run offline and need no server unless noted.
- How to read each concept:
  - **Grounded in** lists established facts about history, myth or earlier games. I checked the key ones.
  - **My read** is my own estimate of scope, market, money and risk. It is speculation.

## Your Oregon Trail idea: caveats first
1. **The Banner Saga already covers "Norse caravan journey."** Set yours apart with short, replayable runs based on real history, not a linear story.
2. **The basic Oregon Trail loop is thin.** Most of it is: continue, get an event, sometimes cross a river or hunt. Modern hits in this format add a second system with real decisions. FTL has ship combat and upgrades, Banner Saga has tactics and 80 Days has route planning. For #1 I use a **trade economy** as that second system (Oregon Trail + *Taipan!*).
3. **Applies to all 10:** a paid Play build competes with your own free GitHub Pages build. Plan from day one for either a web demo with the full game on Play, or an unlock through the Digital Goods API.

It's still my top pick for your constraints. The reasons are at the bottom.

---

## 1. Road to Miklagard: Oregon Trail on the Varangian route (your idea)
**Pitch.** Lead a crew from Birka to Constantinople (Miklagarðr). Buy furs cheap in the north and sell them dear in the south, if the ship, cargo and crew survive the portages, the rapids and the steppe.

**Loop.** Outfit at Birka → travel day by day (pace, rations) → events → towns (trade, rest, recruit) → rapids → arrive, sell, score.

**Key mechanics**
- **Background sets starting silver and score multiplier.** Jarl's son ×1, merchant ×2, outlaw ×3, like Oregon Trail's banker, carpenter and farmer.
- **Ship choice is the first big trade-off.** A karve is fast and light to portage but has a small hold. A knarr carries far more but is slow and brutal to portage. At Kiev you can buy dugouts for the rapids, as the Rus' did.
- **Weight ties the systems together.** More cargo means slower portages, so more days in Pecheneg country and more ambush rolls. Greed is the core tension.
- **Trade.** Towns: Aldeigjuborg, Holmgarðr, Kœnugarðr, Miklagarðr. Prices drift and react to what you sell, and rumors from other traders hint at where prices are good.
- **Rapids replace river crossings.** Seven named rapids. At each one you shoot it, wade and pole through, or portage. The odds depend on water level (season), ship, crew skill and load.
- **Seasonal deadline.** Leave after the ice breaks and clear the Black Sea before autumn storms. Or winter in Kiev: safer, but it costs silver and time and brings its own events.
- **Crew.** Named, with traits (shipwright, skald, healer, interpreter, berserker), health and morale. Low morale means people desert at towns.
- **Runestones replace Oregon Trail's tombstones.**
  - Dead crew get an epitaph built from real runestone wording: "…raised this stone after X, his brother. He died in the east."
  - Stones are stored locally and appear at that spot on later runs.
  - Sharing stones between players would need a backend. Building epitaphs from fixed wording avoids having to moderate free text.
- **Optional 20-second foraging game** (spearfishing, elk hunt) that can be auto-resolved.
- **Ending.** Sell your cargo and optionally join the Varangian Guard. The high-score table looks like runic graffiti in Hagia Sophia.

**Grounded in**
- Constantine VII's *De Administrando Imperio* (c. 950) describes this route: seven named Dnieper rapids (the first, Essoupi, means "Do not sleep"). At the worst rapid crews carried their boats overland, with guards posted against Pechenegs. It also records sacrifices on St. Gregory's island.
- About 30 "Greece runestones" and the Ingvar runestones commemorate men who died in the east.
- A Norseman carved "Halfdan" into Hagia Sophia's gallery.
- The 1985 Oregon Trail saved your party's gravestone to the disk, and the next player found it on the trail.
- **Alternative route (west):** Erik the Red's c. 985 Greenland emigration, where 25 ships sailed and 14 arrived. That's a better attrition hook, but open ocean gives fewer landmarks and towns. It suits a sequel or a second route.

**Build notes.** DOM/SVG UI. Events are data (conditions on region, season, crew and cargo mapped to effects). Seeded RNG for daily runs. IndexedDB for saves and runestones. No backend.

**My read**
- Art load is low to medium: a scrolling river strip, a map and event cards. A Gotland picture-stone style would be cheap and distinctive.
- Content load is high. Expect 100+ events for replayability, and more writing than code.
- Money: paid, with the first leg (Birka to Holmgarðr) free on the web.
- Risks:
  - Players will have seen most events after a few runs.
  - Trade exploits.
  - Comparisons to Banner Saga.
  - Enslaved people were the route's biggest real commodity. Decide early how to handle that; most games leave it out.

**Comparables.** The Oregon Trail, The Banner Saga, *Taipan!*, FTL, Organ Trail.

---

## 2. Chooser of the Slain: Valkyrie judgment sim (Papers, Please-like)
**Pitch.** You're a new Valkyrie working the battlefield shift. Every corpse is a case: check their gear, wounds and witnesses, then stamp them to Valhalla, Fólkvangr, Hel, or "not dead, just drunk." Odin's rules change daily, Freyja picks first and Loki slips you bribes.

**Loop.** Morning order with a new rule → cases on a timer → inspect → check the rulebook → stamp → end-of-day quotas and standing with Odin, Freyja and Hel → story scene.

**Key mechanics**
- **Evidence.**
  - Weapon in hand: whose is it? A borrowed one means fraud.
  - Where the wound is: in the back means they fled.
  - Oath-rings, rune inscriptions on gear (light Futhark reading) and personal items.
  - Testimony from Odin's two ravens, which can disagree.
- **Rules pile up day by day, Papers, Please-style.** Day 1: "weapon in hand → Valhalla." Later days add Freyja's half, oathbreakers, proof of berserker status, baptized warriors ("not our department"), shapeshifters and Loki's fakes.
- **Ragnarök quota.** Odin needs N warriors by the end, which pushes quota against getting cases right. The ending depends on who you sent.
- **Recurring characters.** A warrior who keeps almost dying, a feuding family whose Valhalla seating depends on you, and Loki's deals.

**Grounded in**
- "Valkyrie" means "chooser of the slain."
- The Eddic poem *Grímnismál* gives Freyja half the slain.
- Snorri sends those who die of sickness or old age to Hel.
- Odin's ravens report to him daily.
- The lore is thin enough that you can invent the rules.

**Build notes.**
- Cases come from a seed. Generate the correct answer under today's rules, inject N contradictions based on difficulty, then check the player's stamp against the correct answer.
- Build portraits from parts (face, beard, helmet, wounds, gear) to get lots of variety from little art.
- No backend.

**My read**
- Most original hook of the ten, and the best chance of going viral with streamers. That's Not My Neighbor (2024) showed a small inspection game can take off.
- That audience is on PC, and inspection screens are cramped on phones. Plan a desktop build (itch or Steam) alongside Play.
- Content-heavy: the daily rules have to stay fair and fresh.
- A dark-comedy tone fits the "Vikings-R-Us" name.

**Comparables.** Papers, Please; That's Not My Neighbor; Return of the Obra Dinn.

---

## 3. Hnefi: Hnefatafl roguelite
**Pitch.** Hnefatafl, the Vikings' own board game, played as Balatro-style runs. Get the king (the *hnefi*) out across harder and harder boards while collecting runes that bend the rules.

**Loop.** Branching map of about 8–10 matches → win → pick a rune, a new piece, a board blessing or silver → shop → boss matches.

**Key mechanics**
- **Boards grow** from 7×7 to 9×9 to 11×11.
- **Two modes to play:** defender runs (get the king out) and attacker runs (capture the king).
- **Runes change rules:**
  - Raidho: one diagonal move per match.
  - Isa: freeze an enemy piece for 2 turns.
  - Algiz: a piece survives one capture.
  - Thurisaz: a thorn piece kills attackers next to it.
  - Kenaz: see the AI's next move.
- **New pieces.** A shieldmaiden needs to be surrounded on three sides to be captured. An archer captures at range 2.
- **Bosses with rule twists.** Jörmungandr: board edges are sea, so only corners count. Fenrir: a piece that can't be stopped. A jarl whose men capture from one side only.

**Grounded in.** The Viking-age rules are lost. Modern rules are reconstructions, mostly from Linnaeus's 1732 account of Sámi *tablut*. So bending the rules is honest to the theme: every hall played differently.

**Build notes.**
- Alpha-beta search in a Web Worker. 7×7 and 9×9 are easy; 11×11 needs move ordering and a time cap.
- Balance by running thousands of AI-vs-AI games in Node. Tafl rule sets are known for favoring one side, and modifiers make that worse.
- No backend. Daily seeded run.

**My read**
- Lowest risk of the ten. It has the smallest art and content load, replayability comes from the rules rather than writing, it fits portrait perfectly, and matches take 3–8 minutes.
- Weaker hook: most players don't know tafl, so the tutorial matters.
- Balatro-likes are getting crowded.
- A free plain-tafl web page might send search traffic to it.

**Comparables.** Balatro, Shotgun King, Pawnbarian.

---

## 4. Einherjar: Valhalla auto-battler
**Pitch.** In Valhalla the chosen dead fight all day, fall, rise at dusk and feast. That's already an auto-battler loop. Draft warriors, set your shield wall and watch it clash.

**Loop.** Mead-hall shop (buy, sell, merge) → set formation → 20–30 s automatic battle against another player's saved team or a bot → repeat until 10 wins or out of lives.

**Key mechanics**
- **Shield wall.** Shield units buff their neighbors. When one dies, the gap exposes both sides, so formation is the skill.
- **Death gives fame.** Everyone rises at dusk, so units that fell gain fame (upgrades). Losing hurts less.
- **Unit types that combine:**
  - Berserkers: rage stacks.
  - Shieldmaidens: the wall.
  - Skalds: scale with total fame.
  - Úlfheðnar: wolf pack.
  - Seiðr workers: weaken enemies.
  - Jomsvikings: earn gold.
- **Odin's daily decree.** One modifier for everyone, plus a leaderboard.

**Grounded in.** Snorri's *einherjar* fight every day, are healed, and feast every night.

**Build notes.**
- Seeded combat so a fight plays out the same on any device.
- Player-vs-player means storing each player's team after every round, via Supabase or a Cloudflare Worker with D1. This is the only concept that really needs a backend.
- Ship offline against bots first.

**My read**
- Best free-to-play fit after the idle game, and natural on phones.
- Balance never ends, player-vs-player needs enough players to start, and the genre is crowded (Super Auto Pets, Backpack Battles, The Bazaar).
- The shield wall and fame mechanics are the difference, and they have to prove themselves in a prototype.

**Comparables.** Super Auto Pets, Backpack Battles, Hearthstone Battlegrounds.

---

## 5. Landnám: claim Iceland by fire
**Pitch.** It's 874, Iceland is empty, and the law says you own what you can carry fire around in one day. Walk your claim before sunset, then keep your household, and your grandchildren's feuds, alive.

**Loop.** Land on a generated coast → fire claim → seasons (4 turns a year) → neighbors, feuds, the Althing (Iceland's national assembly) → heir inherits → repeat for generations.

**Key mechanics**
- **Fire claim (the hook).**
  - Drag your torch-bearer's route. Terrain sets speed: lava is slow, rivers need a ford, glaciers can't be crossed.
  - The sun is the timer. Close the loop before sunset or you claim nothing.
  - The enclosed area becomes your land, like Qix or Paper.io. What's inside matters: meadow (hay), birch (fuel), coast and driftwood, bird cliffs, hot springs.
- **Seasons.**
  - Summer: assign labor to hay, fishing, driftwood and trade.
  - Autumn: decide how many animals your hay can carry through winter.
  - Winter: survival checks.
  - Spring: lambing and the local assembly.
- **Feuds escalate.** Compensation, then a lawsuit at the Althing (a procedure mini-game where the wrong wording voids your case), then violence, then outlawry.
- **The land pushes back.** Cutting the birch causes a fuel crisis, overgrazing causes erosion, and volcanoes erupt.
- **Each generation ends with an auto-written saga** you can share.

**Grounded in**
- Iceland's *Book of Settlements* (Landnámabók) limits a man's claim to what he and his crew could carry fire around in a day. A woman's claim was what she could walk around on a spring day leading a two-year-old heifer, which could be a second claim mode.
- The Althing was founded in 930.
- In Njáls saga the big lawsuit falls apart on procedure and ends in a fight.
- Iceland was deforested after settlement.
- The Eldgjá eruption was around 939.
- Conversion to Christianity was voted at the Althing around 1000.

**Build notes.** Noise-based terrain. Point-in-polygon or raster fill to compute claims. Simple AI settlers and an event system. No backend.

**My read**
- Most distinctive mechanic on the list, and the biggest scope. It's really two games: an action claim and a management sim.
- Prototype the fire claim alone first. If it isn't fun in 2 weeks, drop the concept.
- Paid.

**Comparables.** Dead in Vinland, King of Dragon Pass / Six Ages, Frostpunk, Qix.

---

## 6. Galdr: draw runes, survive the Yule nights
**Pitch.** The undead draugr and the Wild Hunt besiege your longhouse for twelve winter nights. You fight by drawing runes with your finger. Draw two quickly on top of each other and they fuse into a bind-rune.

**Loop.** Night: enemies advance in lanes → draw runes to cast spells → survive to dawn → day: carve new runes, fortify, recruit villagers → next night. Night 12 is the Wild Hunt.

**Key mechanics**
- **Spells.** Kenaz is fire, Isa freezes, Algiz wards, Thurisaz raises a thorn wall, Sowilo is a sun-strike, and so on. Clean, fast strokes score critical hits.
- **Bind-runes are combos you discover.** For example, Isa + Kenaz makes a steam burst. They're logged in a codex.
- **Breath meter.** *Galdr* is chanted, so longer runes cost more breath.

**Grounded in**
- *Galdr* means a spoken or sung spell.
- The Elder Futhark has 24 runes; their names are reconstructions.
- The draugr come from the sagas (Glámr in Grettis saga).
- The Wild Hunt comes from later Scandinavian folklore and isn't recorded in the Viking age. That's fine for a fantasy setting.

**Build notes.** A $P or $1 shape recognizer, about 100–200 lines of JS with no ML. $P handles runes drawn in several strokes. Canvas lanes. No backend.

**My read**
- The most touch-native concept. Desktop can't copy the input well.
- The risk is misrecognition feeling unfair. Pick runes that look clearly different (Fehu/Ansuz and Isa/Laguz are near-twins), make the matching forgiving, and give clear feedback.
- Wave defense gets samey without the bind-rune discovery layer.
- Money: free-to-play with a rewarded revive, or paid.

**Comparables.** Magic Touch: Wizard for Hire (Nitrome; draw symbols to pop balloons), Plants vs. Zombies.

---

## 7. Strandhögg: raid tactics
**Pitch.** Beach the ship, grab what you can and get back aboard before the English militia arrives. Tactics on a small grid where you can see everything, and every extra turn ashore is greed.

**Loop.** Campaign map (coasts of Britain, Frankia and Ireland) → pick a target from your scouting → tactical mission → sail home → spend loot, recruit, pay the jarl → next season.

**Key mechanics**
- **Alarm track.** Each turn ashore raises the alarm. Church bells and signal fires bring waves of reinforcements. Leaving early is often right.
- **Loot is physical.** Chests, silver and livestock have to be carried (*strandhögg* means a cattle raid). Carriers can't fight, which makes escort puzzles.
- **Enemies show what they'll do next,** as in Into the Breach, so turns are puzzles, not dice rolls.
- **Map hazards and raiders.** The tide shrinks the beach, fire spreads across thatch roofs, and named raiders die permanently.

**Grounded in.** *Strandhögg* means a coastal raid for cattle or supplies. The Lindisfarne raid was in 793. The *fyrd* was the Anglo-Saxon militia.

**Build notes.** Enemies pick their moves at the start of each turn and show them. That AI is much simpler than one that plans ahead. Portrait 6×8 grid. Maps built from templates.

**My read**
- Delivers the core Viking fantasy most directly.
- Highest art and animation load, and the hardest to make feel good. Into the Breach is a harsh comparison.
- Paid. Probably too big for a first game here.

**Comparables.** Into the Breach, Bad North (the reverse: you defend against Viking raiders).

---

## 8. Yggdrasil: climb the World Tree
**Pitch.** Climb from the roots, where the dragon Níðhöggr gnaws, to the eagle at the top, one realm at a time, with real climbing technique as the mechanics.

**Loop.** Read the route from the ground and plan your beta → climb (two thumbs control two hands) → graded as onsight, flash or redpoint → next route. Each realm changes the rock.

**Key mechanics**
- **Pump per forearm.** Crimps and slopers pump you faster, jugs let you shake out, and bad body position costs more.
- **Techniques you unlock:** flagging (reach without barn-dooring), drop-knee, heel hook, dyno (a timed flick) and matching.
- **Realm hazards:**
  - Niflheim: ice, and holds break.
  - Muspelheim: hot holds you can't hang on.
  - Jötunheim: giant-scale moves.
  - Svartalfheim: dark, and a lantern reveals holds.
- **A rival climber.** Ratatoskr, the squirrel messenger of the myth, races you and shouts beta. Some of it is true and some is insults.
- **Route-setter mode.** Build routes and share them as links with the route encoded in the URL, so no backend.

**Grounded in**
- In the myth, the dragon Níðhöggr gnaws Yggdrasil's roots and an eagle sits at the top. The squirrel Ratatoskr runs up and down carrying insults between them.
- A more historical version: Faroese and Icelandic cliff-egging, where men were lowered on ropes for eggs and fulmars spat oil at them.

**Build notes.** A 2D body with two-joint arms on a light physics layer (Planck.js or custom Verlet). Portrait suits vertical routes.

**My read**
- The only concept where you have an advantage other devs don't: coaching expertise nobody can fake, and an existing audience to launch to.
- Whether your climbing followers turn into players is speculation.
- Climbing games have a proven audience: Jusant, Getting Over It, A Difficult Game About Climbing.
- How the climbing feels decides everything and can eat months.
- The Viking layer is a skin. This sells to climbers and climbing-game fans more than to Viking fans.

**Comparables.** Jusant, Getting Over It, A Difficult Game About Climbing.

---

## 9. Ragnarök: idle game where the apocalypse is the reset
**Pitch.** Grow from one longhouse to the nine realms. Then Ragnarök burns it down, and two survivors hiding in the World Tree reseed the reborn world. In idle-game terms, that's the prestige reset, taken straight from the myth.

**Loop.** Gather and automate resources → raids and expeditions on timers that keep running while you're offline → unlock realms → Fimbulwinter penalties → Ragnarök battle, scored on how well you prepared → rebirth with permanent upgrades.

**Key mechanics**
- **Each realm adds a layer with its own mechanic.** Forging in Svartalfheim, *seiðr* magic multipliers in Vanaheim, defense in Jötunheim, and in Helheim you trade your dead for boons.
- **Ragnarök is an event you prepare for,** not a button.
- **Mid-game quest.** Craft Gleipnir, the chain that binds the wolf Fenrir, from its six impossible ingredients: a cat's footfall, a woman's beard, a mountain's roots, a bear's sinews, a fish's breath and a bird's spittle.

**Grounded in**
- Líf and Lífþrasir survive Ragnarök hidden in the World Tree and repopulate the world.
- Fimbulwinter is three winters with no summer.
- The Gleipnir ingredients are from Snorri.

**Build notes.** break_infinity.js for big numbers. Offline progress calculated from timestamps. Exportable saves. The lightest art of the ten: icons plus one world illustration that changes as you progress. No backend.

**My read**
- The most commercially practical option on Play: short check-ins, rewarded ads, and paid multipliers. Quick to get to a first version.
- Crowded genre and the least original. Success depends entirely on tuning the numbers.
- Google's main mobile ad network, AdMob, only works in native apps. A TWA needs web ad options, and those are thinner.

**Comparables.** A Dark Room, Cookie Clicker, Kittens Game.

---

## 10. Mead Hall: feast-night management with a seating puzzle
**Pitch.** You run the jarl's mead hall. Every feast could blow up: seat guests by rank and grudge, keep the mead and the skald going, and stop brawls before they become blood feuds.

**Loop.** Guests arrive and the game pauses while you seat them → real-time serving → pick the skald's story → end of night: reputation, silver, gossip → consequences carry into the next feast.

**Key mechanics**
- **Seating puzzle.** Honor depends on distance from the high seat. Keep feuding families apart. Some pairings create alliances or marriages.
- **Real-time serving, Diner Dash-style.** Pour, serve and watch drunkenness rise. Drunk guests boast, and boasting leads to flyting, a ritual exchange of insults.
- **Flyting mini-game.** Trade alliterative insults, like Monkey Island's insult sword-fighting but with kennings (Norse poetic metaphors).
- **The skald's story must suit the room.** Praise the wrong ancestor and it's an insult.

**Grounded in.** The high seat (*öndvegi*) marked rank. The Eddic poem *Lokasenna* is Loki's flyting at Ægir's feast.

**Build notes.** A small simulation of guests with needs and grudges, plus a scheduler. Board-game-token art keeps animation cheap. No backend.

**My read**
- Most casual-friendly, and the best tonal fit for the "R-Us" name.
- The puzzle wants thinking and the serving wants speed, so keep seating paused.
- Art load grows fast if you go beyond tokens. The casual market is crowded.
- Money: free-to-play with ads between nights, or paid.

**Comparables.** Diner Dash, Overcooked, The Secret of Monkey Island.

---

## Side-by-side (my estimates: rough full-time solo time, compare them to each other rather than trusting the numbers)
| # | Concept | Genre | First playable | Full game | Art | Content | Tech risk | Backend | Money fit |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Road to Miklagard | Journey + trade | 2–3 wk | 3–5 mo | Low–Med | High | Low | No | Paid + web demo |
| 2 | Chooser of the Slain | Judgment sim | 1–2 wk | 2–4 mo | Med | High | Low | No | Paid (PC too) |
| 3 | Hnefi | Board roguelite | 1–2 wk | 2–3 mo | Low | Low | Low–Med | No | Paid |
| 4 | Einherjar | Auto-battler | 3–4 wk | 3–4 mo | Med | Med | Med | Yes (player-vs-player) | Free-to-play |
| 5 | Landnám | Claim + survival sim | 2 wk (claim only) | 5–8 mo | Med | High | Med | No | Paid |
| 6 | Galdr | Rune drawing + defense | 1 wk | 2–3 mo | Med | Med | Med | No | Free-to-play or paid |
| 7 | Strandhögg | Tactics | 3–4 wk | 4–6 mo | High | High | Med | No | Paid |
| 8 | Yggdrasil | Climbing | 2–3 wk | 3–5 mo | Med | Med | High (how it feels) | No | Paid / realm packs |
| 9 | Ragnarök | Idle | 1–2 wk | 2–3 mo + tuning | Low | Med | Low | No | Free-to-play (best) |
| 10 | Mead Hall | Serving + puzzle | 2–3 wk | 3–4 mo | Med–High | Med | Low | No | Free-to-play or paid |

## Recommendation (my opinion)
**Build #1 as Oregon Trail + *Taipan!***
- It fits your constraints: turn-based, portrait, offline, and low art.
- "Oregon Trail with Vikings" explains itself.
- The real route supplies the structure for free: landmarks, towns, rapids and a deadline.
- The trade and weight systems keep it from being "press continue."
- **Test before committing.** Build the travel, trade and one-portage loop with about 20 events (2–3 weeks) and play it ten times. If decisions still matter once the events repeat, the systems are working and the rest is writing.
- **Runner-up: #3 Hnefi,** if you want the lowest risk. It can't run out of content.
- **Worth a real look: #8 Yggdrasil.** It's the only one where you have an advantage other devs don't.
- **Cheap extras if you pick #1:** tafl as a gambling game in towns (#3), and flyting at feasts in Kiev (#10).

## Sources (for the historical and market claims I checked)
- [Dnieper rapids](https://en.wikipedia.org/wiki/Dnieper_rapids) · [Route from the Varangians to the Greeks](https://en.wikipedia.org/wiki/Route_from_the_Varangians_to_the_Greeks)
- [The Oregon Trail (1985)](https://en.wikipedia.org/wiki/The_Oregon_Trail_(1985_video_game)) · [Oregon Trail tombstones format](https://moddingwiki.shikadi.net/wiki/Oregon_Trail_tombstones_format)
- [Land-taking in Viking Age Iceland](https://oldnorse.org/2022/04/29/viking-age-iceland-land-taking-and-establishing-order/)
- [Viking Ship Museum: Vikings in Greenland](https://www.vikingeskibsmuseet.dk/en/professions/viking-ships-on-voyages/longer-voyages/skjoldungen-in-southwest-greenland-2016/the-history)
- [That's Not My Neighbor (itch.io)](https://nachogames.itch.io/thats-not-my-neighbor) · [Magic Touch: Wizard for Hire](https://nitrome.fandom.com/wiki/Magic_Touch:_Wizard_for_Hire)
