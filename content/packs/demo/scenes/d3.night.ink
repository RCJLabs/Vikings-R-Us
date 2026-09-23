# draft
// SECOND DRAFT (M5): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL flag(name)
The last soul has gone down the path and the light is going. You are stacking the day's slates when you notice the man sitting on the far end of your table.
He wasn't there a moment ago. He sits very comfortably, as if he's been there all afternoon.
He is holding a dead woman's hand up to the last of the light, turning it this way and that, the way a jeweller holds a ring.
"Lovely nails." # speaker: stranger
They are. Long and pale and curved, longer than they have any right to be.
He lays the hand back on her chest, gently, and pats it.
"Don't mind me. I like to watch the new ones. It's the only time anyone here does anything interesting." # speaker: stranger
{ flag("thorvald_returned"):
  "You sent the unlucky one home. Kind of you. He'll be back, you know. Some men are made for this gate the way some roofs are made for rain." # speaker: stranger
}
{ flag("thorvald_valhalla"):
  "And you sent a living man to Odin's hall. He'll wake up on the mead bench with his heart still beating." # speaker: stranger
  He laughs until he has to wipe his eyes.
  "I haven't enjoyed a morning so much in a hundred years. Thank you." # speaker: stranger
  # fx: standing loki +1
}
{ flag("thorvald_met") && not flag("thorvald_returned") && not flag("thorvald_valhalla"):
  "You sent the unlucky one down to Hel with his heart still beating. She'll be cross. She's cross with everyone." # speaker: stranger
}
* ["Who are you?"]
  "A friend of the family." # speaker: stranger
  He smiles at you, pleasantly.
  "Not yours. Well. Not yet." # speaker: stranger
* ["The gate is closed."]
  "It's never closed. That's rather the problem with it." # speaker: stranger
* [Say nothing.]
  You go on stacking slates. He seems to like that best of all.
  # fx: standing loki +1
- You look down to set the last slate on the pile. When you look up, the end of the table is empty.
Afterwards you can't say what he was wearing, or the colour of his eyes. Only that when he smiled, his lips were crossed with small pale scars, like old stitches.
The dead woman's nails are a little longer than they were. # fx: flag met_loki
-> END
