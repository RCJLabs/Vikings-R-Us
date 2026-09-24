# draft
// FIRST DRAFT (M5 slice): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL flag(name)
{
- flag("loki_detained"):
  The cells behind the long hall are Odin's, which means their walls are very thick and nobody has ever checked the back one.
  At dusk the man you detained is sitting on the end of your table, eating Skögul's apple.
  "Cells are for people who stay in them." # speaker: stranger
- flag("loki_judged"):
  The man with the scars on his lips comes back up the path at dusk, against the flow of the dead, and sits on the end of your table as if he owns it.
  "You let me through. I won't forget it. Nobody ever does anything nice for me." # speaker: stranger
- else:
  At dusk a man you never saw in the queue is sitting on the end of your table. When he smiles, his lips are crossed with small pale scars.
  "You missed me. Everyone does." # speaker: stranger
}
"Your brother writes a good letter. Careful hand. Square." # speaker: stranger
He has one of Ulf's letters. You don't know how.
"He's working for a friend of mine now. We're building a ship up north. A very big ship, out of very small pieces." # speaker: stranger
He looks at his own nails, which are very long and very clean, and smiles at them fondly.
"Odin's people will want a report from you tonight. Who you saw, what he said, who his friends are. Leave my name out of it, and I'll leave your brother's out of mine." # speaker: stranger
* [Write the report. Name him.]
  You write it all down: the borrowed face, the scars, the ship in the north. You write Ulf's name last, and your hand shakes on it.
  Skögul takes the report without reading it and carries it to the hall. She doesn't look at you.
  # fx: flag reported_loki
  # fx: standing odin +2
  # fx: standing loki -2
* [Leave him out of it.]
  You write that you saw a man with a borrowed face and lost him in the queue. It's nearly true.
  He reads it over your shoulder and pats your hand.
  "Lovely." # speaker: stranger
  # fx: flag covered_loki
  # fx: standing loki +2
  # fx: standing odin -1
- When you look up, the end of the table is empty, and the apple core is sitting on your report like a seal.
-> END
