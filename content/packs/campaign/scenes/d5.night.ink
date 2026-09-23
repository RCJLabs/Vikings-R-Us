# draft
// DRAFT: placeholder writing to be rewritten (docs/story-drafts.md).
EXTERNAL sick(id)
EXTERNAL home(id)
The raven is late, and when it comes the letter is in Ulf's hand again, pressed hard enough to tear.
{ not home("sister"): -> away }
{ sick("sister"):
  "Asa is worse. The healer came again. She says it's the winter fever, and that we did the right things." # speaker: ulf
- else:
  "Asa has the winter fever. It came on this morning. The healer says medicine now, or it will be bad by the end of the week." # speaker: ulf
  # fx: family sister sick
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
-> END

=== away ===
"Asa writes from our aunt's house. She says the goats there are stupid, and she misses you." # speaker: ulf
-> END
