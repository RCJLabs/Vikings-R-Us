# draft
// FIRST DRAFT (M7): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL rings()
"Draupnir drips tonight," says Skögul. "For the last time." # speaker: skogul
"And they say the ship's nearly built. The dead who came up from the north this week all had very short nails and very tired hands." # speaker: skogul
She isn't eating. She's sharpening a spear, which you've never seen her do.
Down the table the clerk clears his throat, and clears it again, and comes over with a sheet of vellum held in both hands.
"A contract. Quite standard. When the horn blows, our department will be unaffected. We aren't in the song. We'd like to offer you a transfer." # speaker: clerk
"A table of your own. A warm room. A pension. There's a small fee for the paperwork, ten rings. It's the vellum, you see. Calves don't grow on trees." # speaker: clerk
Skögul goes on sharpening the spear.
* { rings() >= 10 } [Sign it and pay the ten rings.]
  # fx: rings -10
  # fx: flag clerk_contract
  # fx: standing clerk +2
  You sign where he points. He sands the ink, blows on it and rolls it up with a small, private smile.
  "Welcome to the department. Nothing changes until the horn. And then, well. Everything does, but not for you." # speaker: clerk
  Skögul's whetstone doesn't stop, not for a moment.
* ["Not yet."]
  "Of course. It will keep. Vellum does." # speaker: clerk
  He goes back to his table and puts the contract in a drawer, on top, where he can see it.
* ["My place is at this gate."]
  # fx: standing odin +1
  The clerk nods slowly, as if you've said something in a language he respects but doesn't speak.
  Skögul's whetstone stops, just for a moment, and then goes on.
- The queue is the longest it's ever been, and the quietest. The dead can tell, too.
-> END
