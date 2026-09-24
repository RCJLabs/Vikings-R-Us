# draft
// SECOND DRAFT (M5): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL rings()
Ulf's reply comes before you have your boots off. The raven that brings it stays on the sill, as if it expects an answer tonight.
"The boatwright let me go today. He says there'll be no ships to build if the world is ending. He isn't wrong, and he isn't sorry." # speaker: ulf
"I'll find something. Old Hrolf needs his nets mended, and there's always ice to cut." # speaker: ulf
"The roof is the trouble. The storm took the ridge turf, and there's a hole over Asa's bed the size of a shield. We need rope and pitch before the snow. Five rings would do it." # speaker: ulf
"I hate asking. Mother doesn't know I'm asking." # speaker: ulf
{ rings() < 5:
  You count what you have out on the blanket. It doesn't come to five, however you count it.
}
{ rings() >= 5:
  You count what you have out on the blanket. It comes to five, and a little more.
}
* [Send five rings. #needs: rings 5]
  You wrap five rings in a scrap of linen and tie it to the raven's leg. It weighs them with one black eye, as if checking your sums.
  # fx: rings -5
  # fx: flag roof_mended
  Asa will sleep dry by the end of the week. You sleep better for knowing it.
* [Send nothing yet.]
  You write that you'll send what you can at the end of the week, and that Asa should sleep with her head at the other end of the bed.
  The raven leaves with the letter and without the rings, and doesn't look back.
- The fire in the long hall burns low. Nobody here has to pay for it.
-> END
