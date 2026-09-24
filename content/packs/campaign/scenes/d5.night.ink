# draft
// FIRST DRAFT (phase 2): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL flag(name)
EXTERNAL sick(id)
EXTERNAL home(id)
The raven is late, and when it comes the letter is in Ulf's hand again, pressed hard enough to tear.
"Solveig Arnesdottir went out with the herring boats this morning and didn't come back." # speaker: ulf
{ home("mother"):
  "Mother's at her house with the children, and most of our bread." # speaker: ulf
}
{ not home("sister"): -> away }
{ sick("sister"):
  "Asa is worse. The healer came again. She says it's the winter fever, and that we did the right things." # speaker: ulf
- else:
  "Asa has the winter fever. It came on this morning. The healer says medicine now, or it will be bad by the end of the week." # speaker: ulf
  # fx: family sister sick
}
{ not flag("roof_mended"):
  "The rain comes in over her bed. I've put the big pot under it. She says it plays tunes." # speaker: ulf
}
"I know what it costs. I'm sorry to ask." # speaker: ulf
* ["I'll send it."]
  You mean it, whatever the numbers say.
  # fx: flag promised_medicine
* [Ask Skögul for an advance on your wage.]
  Skögul counts out ten rings without a word and writes something in a small book.
  # fx: rings +10
  # fx: flag owes_skogul
* [Write that you'll send what you can.]
  It's true, and it feels like a lie.
- Outside, the sea is still loud. Rán has had a good day.
{ flag("solveig_judged"):
  You think of Solveig at your table this morning, dripping, asking you to tell them about the loom. You didn't. You add it at the bottom, very small.
}
-> END

=== away ===
"Asa writes from our aunt's house. She says the goats there are stupid, and she misses you." # speaker: ulf
-> END
