# Art brief

For commissioning the art (build plan M5). **The woodcut is the chosen direction** (September 2026) and the game's default art. Two directions were prototyped in code, woodcut and pixel; the pixel prototype and the placeholder remain for comparison on the art trial page (`pnpm art:sheet` writes `dist/art-sheet/index.html`) and in the game with `?art=pixel` or `?art=placeholder`. The prototypes show readability and cost. They are not a test of how final art will look on a stream or a store page; an artist's samples are.

## What the art has to do

The art draws dead souls standing at a gate. The game reads **signs** off the body, and every sign has a gameplay **salience** (3 obvious, 2 noticeable, 1 subtle). The art must meet it at the size a small phone shows the body, and every sign must stay readable without colour (shape or texture carries it too).

**Frame and layout.** 300×420 units (5:7), a front view and a back view. The anchors are fixed so that taps land in the same places in any style (`packages/art/src/layout.ts`):

- head centred at (150, 96), about 44 units across the radius;
- hands at y 300, x = 150 ± (half + 26), where half is 46, 58 or 64 by build (lean, broad, heavy);
- front wound sites (128, 216), (168, 238), (142, 262); back (130, 208), (170, 232), (150, 258);
- neck items: ornament centred at x 150, amulet on its own cord at x ≈ 128, broken oath-ring at x ≈ 180;
- hotspot regions: hair, face, neck, chest, each hand, and the back.
- the back view is the same soul turned round: the weapon hand is on the other side of the frame, the fist shows its back (knuckles down the outer side, no fingers or thumb), and the weapon passes behind the forearm, leaning out enough to show. The weapon is not a sign from behind; it's there so the body doesn't change when it's turned.

**Sizes it is seen at** (CSS pixels, measured in the game):

| Screen | Body on screen |
|---|---|
| 360×740 phone | 166×232 (pixel art in whole device pixels: 133×187) |
| 412×915 phone | 233×326 |
| 740×360 phone, landscape | 216×302 |
| 1280×800 (Steam Deck) | 377×528 |
| 1920×1080 | 613×858 |

**The signs** (from the content; the art sheet has every value):

| Sign | Values | Salience | Notes |
|---|---|---|---|
| Weapon in hand | weapon, none; right or left hand | 3 / 2 | The weapon drawn is the one the soul names: axe, sword, spear or seax |
| Front wounds | 0–3 | 3 | Countable at phone size |
| Back wounds | 0–3 | 3 | Back view |
| Skin | normal, fever flush | 3 | Fever is a texture (stipple, dither), not only red |
| Lips | dry, sea-foam | 2 | Foam as bubbles |
| Lip scars (Day 12) | none, stitched | **1** | Loki's tell. Meant to be the hardest sign: findable, not obvious |
| Hair | dark, fair, red, grey | 3 | Each colour has its own texture |
| Ornament | none, amber, silver | 2 | |
| Amulet (Day 10) | none, hammer, cross, hammer and cross | 2 | Silhouettes must differ (Mjölnir's head is wider than tall) |
| Feather (tool) | still, stirs | 3 | Stirring needs marks outside the face |
| Nails (Day 8) | trimmed, long | 2 | |
| Rune-lens readings (Day 7) | owner's runes, maker's mark | 2 | Abstract staves; the text chip reads them out |
| Cues | breath fog, broken oath-ring, wrong grip, fresh tally | 2 | Hints to use a tool |

**Variety.** Men and women, three builds, four beards, four hair colours, old age marks (60+), four weapons, and cosmetic tunic colours. Registry portraits are head-and-shoulders crops in the same style.

## Deliverables by direction

**Woodcut (vector).** Layered SVG parts on the 300×420 frame. Outline weight about 4 units, detail lines about 2, hatching for shade, four or five flat washes on paper. One drawing serves every screen, portraits and larger store art.

**Pixel.** 100×140 pixels, one art pixel per 3 frame units, an indexed palette of at most 32 colours, PNG layers per part with palette slots for tunic and hair, selective 1-pixel outlines, no anti-aliasing. Store art at larger sizes has to be drawn separately.

**Acceptance.** A provider passes the contract tests (`pnpm test`: every value drawn differently, hotspots inside the frame, the declared visibility at least the gameplay salience), and on a real 360-pixel phone every salience 2 or 3 sign can be told apart at full size and every salience 1 sign through the 3× loupe.

## Style guide (to fill in with the artist)

- Palette, as named tokens, with the UI's own (dark brown ground, parchment, gold).
- Line weights or pixel rules, shading, texture codes for each sign.
- Typography: a body face covering Old Norse letters (á ǫ ø ð þ) and a rune face for rune text.
- Motion: what moves, and its reduced-motion fallback.
- **Symbols to avoid.** No runes or signs that extremists have appropriated: the Othala rune (above all with serifs or wings), doubled Sowilo, the Wolfsangel, the black sun, a lone Tyr rune as an emblem, Algiz as a "life rune", the valknut as a logo. Rune text in the game stays as abstract staves read out in text.

## Store capsules (for the Steam page, M6)

Sizes as last known; **check them in Steamworks when commissioning** (this environment couldn't reach Valve's docs):

| Asset | Size |
|---|---|
| Header capsule | 920×430 |
| Small capsule | 462×174 |
| Main capsule | 1232×706 |
| Vertical capsule | 748×896 |
| Page background | 1438×810 |
| Screenshots | 1920×1080 |
| Library capsule | 600×900 |
| Library header | 920×430 |
| Library hero | 3840×1240 (no text) |
| Library logo | 1280×720, transparent |

Valve limits capsule text to the game's name (no review quotes or badges); check the current rule. The name, *Chooser of the Slain*, must read at the small capsule's size. A first idea: the gate table in the mist, a stamp coming down on a writ, the queue of the dead behind.
