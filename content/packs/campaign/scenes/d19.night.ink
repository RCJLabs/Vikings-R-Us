# draft
// FIRST DRAFT (M7): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL flag(name)
The last night. Nobody sleeps. Up at the hall they are singing, and it doesn't sound like a celebration.
Skögul sits on the end of your table with her spear across her knees, and for once she isn't eating.
"Tomorrow I ride. All of us do. Choosers ride out with the host. You'll stay at the gate. Someone has to stamp the ones who come up the path." # speaker: skogul
{ flag("owes_skogul"):
  She takes the small book out of her belt, tears out the page with your name on it, and feeds it to the lamp.
  "Call it wages." # speaker: skogul
  # fx: flag owes_skogul = 0
  The page curls and goes out.
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
* ["Freyja."]
  # fx: standing freyja +3
  "She'll know. She always knows." # speaker: skogul
* ["Hel, and the quiet dead."]
  # fx: standing hel +3
  "Someone should." # speaker: skogul
* ["Nobody. I stamp."]
  Skögul smiles, for the first time since you've known her.
  "Then you're a chooser." # speaker: skogul
- She goes out into the dark toward the hall. At the door she stops, and doesn't turn round.
"You did well. I don't say that." # speaker: skogul
-> END
