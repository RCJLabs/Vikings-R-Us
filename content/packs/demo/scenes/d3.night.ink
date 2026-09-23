# draft
// DRAFT: placeholder writing to be rewritten (docs/story-drafts.md).
EXTERNAL flag(name)
The queue is empty and the light is going when you notice the man sitting on the end of your table.
He is looking at a dead woman's hands. "Lovely nails," he says. # speaker: stranger
Afterwards, you won't be able to say what he was wearing.
{ flag("thorvald_returned"):
  "You sent the unlucky one back. Kind. He'll be here again, you know. Some men are made for this gate." # speaker: stranger
}
{ flag("thorvald_valhalla"):
  "You sent a living man to Odin's hall. I haven't laughed like that in a hundred years." # speaker: stranger
  # fx: standing loki +1
}
* ["Who are you?"]
  "A friend of the family. Not yours. Well. Not yet." # speaker: stranger
* ["The gate is closed."]
  "It's never closed. That's rather the problem." # speaker: stranger
* [Say nothing.]
  He seems to like that best of all.
  # fx: standing loki +1
- When you look up from the dead woman's hands, he's gone, and her nails are a little longer than they were. # fx: flag met_loki
-> END
