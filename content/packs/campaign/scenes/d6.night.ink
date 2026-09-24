# draft
// FIRST DRAFT (phase 2): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL flag(name)
EXTERNAL sick(id)
EXTERNAL home(id)
{
- flag("geir_hel"):
  You sent Geir Hallsson to Hel. The registry was right, and you were right, and it doesn't help.
  A letter from your mother is waiting. She doesn't know yet.
  "Geir's widow came by with bread. She says he'd want us to have it." # speaker: mother
- flag("geir_spared"):
  You sent Geir Hallsson to Valhalla, registry or no registry.
  The stranger from the gate is sitting on your cot. "Mercy," he says. "It suits you. Odin will notice." # speaker: stranger
- flag("geir_judged"):
  You judged Geir Hallsson today, and sent him where neither the registry nor Geir expected. You still aren't sure why.
- else:
  Somewhere in the queue today there was a man who used to sit at your father's table. You didn't see him.
}
{ flag("promised_medicine") && home("sister"):
  { sick("sister"):
    A scrap of bark comes with the next raven, in Asa's big letters: "WHEN IS THE MEDICINE COMING." Ulf has added, smaller: "She means thank you."
  - else:
    A scrap of bark comes with the next raven, in Asa's big letters: "I AM BETTER. IT WAS YOUR MEDICINE." Ulf says she's told the goats.
  }
}
* [Burn a candle for Geir.]
  It's a small candle. It's what you have.
* [Go to sleep.]
  You sleep badly.
- The registry sits on the table all night, taller than the clerk who brought it.
-> END
