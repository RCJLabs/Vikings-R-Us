# draft
// FIRST DRAFT (M7): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL flag(name)
{
- flag("thorvald16_returned"):
  At dusk Thorvald comes back up the path with his cap in his hands.
  "Sent home again," he says. "My mother says I should stop trying." # speaker: thorvald
- flag("thorvald16_judged"):
  At dusk Thorvald comes back up the path with his cap in his hands. Wherever you sent him, they sent him straight back. Nobody down there wanted a man with a heartbeat.
  "They were very nice about it," he says. "Mostly." # speaker: thorvald
- else:
  At dusk the broad man with the braided beard is still sitting at the end of the queue, where the sun ran out on him, with his cap in his hands.
  "I'll come back tomorrow, shall I?" # speaker: thorvald
}
Skögul sits on the end of the table with her supper. Thorvald sits down next to her without being asked.
{ flag("asked_twice"):
  "You asked me once if anyone ever came back twice," Skögul says to you, as if he isn't there. "That's him. He comes back every time." # speaker: skogul
}
"I thought it was today. I was sure. I'd slept three nights in a wood up in the hills, and something came out of the trees and trod on me, and I thought, this is it, Thorvald." # speaker: thorvald
"But nothing finds you in that wood. Not properly. Not even dying. Hoddmímir's wood, the old people call it." # speaker: thorvald
Skögul stops chewing.
* ["What's Hoddmímir's wood?"]
  # fx: flag truth +1
  # fx: flag wood_known
  Thorvald shrugs. Skögul puts down her bread.
  "It's in the old songs. When the fire comes, two people hide in that wood, and the fire doesn't find them. They live on the morning dew. After, they walk out into the new world and start again." # speaker: skogul
  "It's a song. It's only a song." # speaker: skogul
  She says it twice, which she never does. Thorvald looks from her to you and back, delighted, like a man who's just found out he's been lucky all along.
* ["Go home, Thorvald."]
  "Home. Yes. Good. I'll take the road this time. It's safer than the hills." # speaker: thorvald
  He goes off down the path whistling, trips over nothing, gets up, and goes on.
- The last of the light goes. Somewhere up in the hills, a long way off, there's a wood you can't see from here.
-> END
