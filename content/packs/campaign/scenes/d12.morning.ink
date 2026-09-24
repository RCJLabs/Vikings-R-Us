# draft
// FIRST DRAFT (M5 slice): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL flag(name)
{ flag("slice"):
  Nine days pass at the gate.
  Freyja came down in a cloak of feathers and took her share. The drowned came up the path dripping, and Rán's people came for them. The quartermaster added a registry, a rune-lens and a pair of clippers to your table, and a clerk of the White Christ set up a table of his own at the end of yours, with a stamp that says TRANSFER.
  Ulf writes that he has found work at last: a shipyard far in the north, good silver, strange timber. He doesn't say what they're building.
}
Skögul is at the table before you. She isn't eating anything, which is how you know it's bad.
"Odin knows he's here." # speaker: skogul
"Loki. He's been walking up the path with the dead, wearing their faces. Nobody knows for how long." # speaker: skogul
She draws a finger across her own lips, side to side, four times.
"A dwarf called Brokkr sewed his mouth shut once, for betting his head and losing it. The stitches came out. The scars didn't. Whatever face he wears, he can't hide those." # speaker: skogul
"Find him and stamp DETAIN. Don't let him talk to you while you do it. He's very good at talking." # speaker: skogul
At the end of the table the clerk looks up from his ledger.
"We have a word for him too. Several, in fact." # speaker: clerk
* { flag("met_loki") } ["I've seen those scars before."]
  Skögul turns, very slowly, to look at you.
  "Where?" # speaker: skogul
  You tell her about the man on the end of your table on your third night, and the dead woman's nails.
  { flag("loki_deal"):
    You leave out the names you gave him.
  }
  "Then he's already picked you out. That's worse." # speaker: skogul
  # fx: flag told_skogul
  # fx: standing odin +1
* { flag("met_loki") } [Say nothing about the stranger.]
  You think about the man on the end of the table, and his lovely manners, and say nothing at all.
  # fx: flag kept_quiet
  # fx: standing loki +1
* { not flag("met_loki") } ["What does he want?"]
  "Nails," says Skögul, and doesn't explain. # speaker: skogul
- The queue is the longest you have seen it. Somewhere in it is a man in a borrowed face, and he already knows yours.
-> END
