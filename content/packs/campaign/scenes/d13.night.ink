# draft
// FIRST DRAFT (M7): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL flag(name)
You are almost asleep when something taps on the shutter: three taps, a pause, then a fourth, as if it has lost count.
It's Muninn. He hops in, settles on the end of your cot and looks at you for a long time.
"I remember you," he says. "I think." # speaker: muninn
"I remember the seeress. He woke her in her grave, you know, and made her sit up and tell him how it ends." # speaker: muninn
"The wolf. The ship. The fire. He knows all of it. He knows whose jaws. He's known since before you were born." # speaker: muninn
"And still he sends you out to choose. Every hero you stamp through is for a battle he knows he loses." # speaker: muninn
The raven shakes himself, and a feather comes loose and drifts down onto your blanket.
"I came to tell you something else. It was important. I've forgotten it." # speaker: muninn
// The jarl at the desk on Day 9 (docs/tech-spec.md §47): Memory keeps it when he's lost the rest.
{
- flag("jarl_bribe"):
  "I remember a jarl, though. Thirty rings on your table, and a stamp for Valhalla. Odd, what stays." # speaker: muninn
- flag("jarl_refused"):
  "I remember a jarl, though. He offered you thirty rings, and you sent him to Hel anyway. Odd, what stays." # speaker: muninn
}
* ["Try. What else did she tell him?"]
  # fx: flag truth +1
  Muninn closes his eyes. For so long that you think he's gone to sleep.
  "Green," he says at last. "She said something about green. After." # speaker: muninn
  "Ask the ones who keep the dead. They remember better than I do now." # speaker: muninn
  He hops back onto the sill. You're left holding the word like a warm stone.
* ["Then why does he keep going?"]
  # fx: standing odin +1
  "Because a host that loses well is better than a host that loses badly. That's what he says." # speaker: muninn
  "I don't remember whether he believes it." # speaker: muninn
  He hops back onto the sill and looks out at the dark.
* ["Does Skögul know?"]
  "Everyone at the gate knows. Nobody says it. That's what a gate is for." # speaker: muninn
  He hops back onto the sill and looks out at the dark.
- In the morning there's a black feather on your blanket, and you remember every word he said, which is more than he will.
-> END
