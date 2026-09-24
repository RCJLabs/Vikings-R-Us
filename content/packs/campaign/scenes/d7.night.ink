# draft
// FIRST DRAFT (M7): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL home(id)
EXTERNAL rings()
{ not home("brother"): -> without_ulf }
Ulf's letter is short, and the hand isn't as square as usual.
"The jarl's men came for Hallbjorn the smith this morning. He's been selling Ulfberhts. Well. Swords that say Ulfberht." # speaker: ulf
"I carved the letters. I didn't know what they said. I copied what he chalked on the steel. I thought it was a blessing." # speaker: ulf
"The jarl says whoever carved them pays a share of the fine: fifteen rings by the new moon, or he names me at the Thing. You know what happens to men who are named." # speaker: ulf
You do. Their names go in a ledger taller than the clerk who carries it.
"Don't tell Mother. She thinks I'm still sweeping." # speaker: ulf
* { rings() >= 15 } [Send the fifteen rings.]
  # fx: rings -15
  # fx: flag ulf_fine_paid
  You count them out twice and wrap them tight in your answer so they won't clink on the raven's leg. It's most of what you had put by. Ulf will know that.
* [Tell him to speak for himself at the Thing.]
  # fx: flag ulf_debt
  You write that a man who carved in good faith should say so, out loud, in front of everyone. It's what your father would have said. Whether it worked for your father is another matter.
* [Tell him to find work that pays the fine.]
  # fx: flag ulf_debt
  You write that he should take any work he can get and pay the jarl himself. You'll help when you can.
- The raven takes your answer and goes. Behind you, the pile of the day's swords says ULFBERHT, ULFBERHT, ULFBERHT, spelled right every time.
-> END

=== without_ulf ===
Your mother writes that the jarl has closed the smithy in the valley, and that everyone is talking about swords.
"Your grandfather always said a sword is only as honest as the hand holding it. I don't know what he'd make of all this." # speaker: mother
* [Write back about the rune-lens.]
  You describe the lens, and the crosses in the wrong places. She'll read it to anyone who visits.
  # fx: flag letters_honest +1
  It will make the house sound busier than it is.
* [Write that you're well.]
  # fx: flag letters_kind +1
  You write that you're well and that the work is easy. Both of those are nearly true.
- You fall asleep reading the runes on the day's borrowed blades, over and over, like a song you can't stop.
-> END
