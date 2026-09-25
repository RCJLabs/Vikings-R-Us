# draft
// FIRST DRAFT (item 7): rewrite or sign off. Odin at the desk on Day 18, before Loki's last offer tonight
// (docs/tech-spec.md §46). He knows about the ship. The sun holds while he's there.
EXTERNAL flag(name)
The next in line isn't dead. He's tall and old, in a grey hood and a wide hat, and he has one eye.
Two ravens come in over the queue and settle on the beam above the desk. They've never come inside before.
"Don't get up," says Odin. "Nobody in this line knows me in this hat." # speaker: odin
"The ship's nearly built. I've counted the nails that came through my gate with their ends uncut." # speaker: odin
{
- flag("loki_deal"):
  "Some of them came through yours." # speaker: odin
- flag("reported_loki"):
  "None of them came through yours. And you put his name in your report, once. I don't forget a thing like that." # speaker: odin
- else:
  "None of them came through yours. I noticed that too." # speaker: odin
}
"He'll come to your table tonight. He always comes to the last of things." # speaker: odin
* { flag("loki_deal") } ["I gave him names."]
  # fx: standing odin +1
  # fx: flag told_odin
  He nods as if you'd told him the weather. "I know. I wanted to hear whether you'd say it." # speaker: odin
  "Tonight you can rub them out, or not. I've read how it ends, and it doesn't say." # speaker: odin
* { flag("loki_deal") } ["I don't know what you mean."]
  # fx: standing odin -2
  # fx: flag lied_to_odin
  "No," he says. "Of course you don't." He doesn't sound angry, which is worse. # speaker: odin
* { not flag("loki_deal") } ["Let him come."]
  # fx: standing odin +1
  He almost smiles. "Good. I've never liked the end of that story. Perhaps you'll change a line of it." # speaker: odin
* { not flag("loki_deal") } ["Why tell me?"]
  "Because you're the one who stamps them." He taps the desk once, beside the stamps, and your hand is cold for an hour. # speaker: odin
- He goes out the way the dead come in, against the line. Nobody moves aside for him, and nobody touches him.
The ravens stay on the beam for the rest of the day and say nothing at all.
-> END
