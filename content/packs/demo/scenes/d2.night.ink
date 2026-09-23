# draft
// DRAFT: placeholder writing to be rewritten (docs/story-drafts.md).
EXTERNAL rings()
Ulf's reply comes before you've taken your boots off.
"The boatwright let me go. He says there'll be no ships to build if the world is ending, and he isn't wrong." # speaker: ulf
"We need rope and pitch for the roof before the snow. Five rings would do it." # speaker: ulf
{ rings() < 5:
  You count what you have. It isn't five.
}
* { rings() >= 5 } [Send five rings.]
  You wrap five rings in a scrap of linen. The raven weighs them with its eyes.
  # fx: rings -5
  # fx: flag roof_mended
* [Send nothing yet.]
  You write that you'll send what you can at the end of the week, and hope the snow holds off.
- The barracks fire burns low. Nobody here has to pay for it.
-> END
