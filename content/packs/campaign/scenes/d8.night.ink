# draft
// FIRST DRAFT (M7): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL flag(name)
The clippings jar is full by dusk. Skögul carries it off to the fire and leaves you to stack the slates.
{ flag("met_loki"):
  When you turn back, the man with the scarred lips is sitting at the end of your table again, watching the smoke go up.
- else:
  When you turn back, a man is sitting at the end of your table, watching the smoke go up. When he smiles, his lips are crossed with small pale scars.
}
"Such a waste. All those years of growing, and up it goes." # speaker: stranger
He picks up your clippers, opens and shuts them, and puts them down precisely where they were.
"Everyone tells the story of the ship wrong. They say it's made of nails, as if that's the strange part. The strange part is who's building it. Carpenters. Ordinary men with families, who needed the work." # speaker: stranger
"It will sail whatever you do. Odin knows that. But it would be a kindness to finish it sooner, while the weather holds. And those who help get to ride in it. When the fire comes, there's no safer place than the deck of the ship that brought it." # speaker: stranger
"So. Don't clip. Not every time. Now and then, when a soul has lovely hands, let them go as they are. And when the ship sails, there will be room aboard for anyone you name." # speaker: stranger
* [Give him your family's names.]
  # fx: flag loki_deal
  # fx: standing loki +2
  You say them out loud. He repeats them back very carefully, as if he's writing them on something.
  "Done. I never forget a name. It's one of my few virtues." # speaker: stranger
  He shakes your hand. His palm is warm and very dry.
* ["No."]
  # fx: flag refused_loki
  "Of course not. Not yet." # speaker: stranger
  He seems pleased, as if you've passed something.
* ["Who are you?"]
  "Someone who notices nails." # speaker: stranger
  He waits, politely, for a better question. When you don't ask one, he nods as if you have.
- Skögul comes back from the fire smelling of burnt horn. The end of the table is empty.
Beside your clippers lies one long, pale curl of nail that never went into the jar. # fx: flag met_loki
-> END
