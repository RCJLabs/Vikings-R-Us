# draft
// FIRST DRAFT (M7): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL flag(name)
The last night. Nobody sleeps. Up at the hall they are singing, and it doesn't sound like a celebration.
{ flag("broke_loki"):
  There's nobody at the far end of your table tonight in a borrowed face. You hadn't expected to miss him.
}
Skögul sits on the end of your table with her spear across her knees, and for once she isn't eating.
"Tomorrow I ride. All of us do. Choosers ride out with the host. You'll stay at the gate. Someone has to stamp the ones who come up the path." # speaker: skogul
{ flag("owes_skogul"):
  She takes the small book out of her belt, tears out the page with your name on it, and feeds it to the lamp.
  "Call it wages." # speaker: skogul
  # fx: flag owes_skogul = 0
  The page curls and goes out.
}
{ flag("skogul_paid"):
  "I paid the quartermaster for you once, the night he came for your wings. I'd do it again. Don't tell him that." # speaker: skogul
}
{ flag("told_skogul"):
  "You told me about the stranger, the day he came in a borrowed face. You didn't have to. I wrote it down, the way I write everything down." # speaker: skogul
}
{ flag("kept_quiet"):
  "You kept something from me, the day he came in a borrowed face. I knew. You'd have been a poor chooser if you told me everything." # speaker: skogul
}
* { flag("truth") >= 1 } ["What happens after?"]
  # fx: flag truth +1
  Skögul looks at you for a long time.
  "Who've you been talking to?" # speaker: skogul
  You tell her. She sighs.
  "The seeress told him the rest, too. He never talks about it. After the fire, the earth comes up out of the sea again, green, and nobody has to sow it. Baldr comes back. Some of the gods' children. Two people out of a wood. They find the old gold game pieces lying in the grass, and start again." # speaker: skogul
  "It's a song. But it's his song, and he's never once said it's wrong." # speaker: skogul
* ["Were you ever afraid? Before a battle?"]
  "Every time," says Skögul. "Then you ride anyway, and after a while you forget which one you are." # speaker: skogul
- She stands and slings the spear over her shoulder.
"Who do you ride with, in your heart? Everybody gets asked, the last night." # speaker: skogul
* ["Odin."]
  # fx: standing odin +3
  "Good. He'll need it." # speaker: skogul
  { flag("sided_odin"):
    "You told Freyja as much, the day they both wanted the same souls. He heard." # speaker: skogul
  }
* ["Freyja."]
  # fx: standing freyja +3
  "She'll know. She always knows." # speaker: skogul
  { flag("sided_freyja"):
    "You told her so once already. She keeps a list too." # speaker: skogul
  }
* ["Hel, and the quiet dead."]
  # fx: standing hel +3
  "Someone should." # speaker: skogul
  { flag("sided_hel"):
    "You said it at the gate once, with the whole queue listening. Down there, they remember." # speaker: skogul
  }
* ["Nobody. I stamp."]
  Skögul smiles, for the first time since you've known her.
  "Then you're a chooser." # speaker: skogul
- She goes out into the dark toward the hall. At the door she stops, and doesn't turn round.
"You did well. I don't say that." # speaker: skogul
-> END
