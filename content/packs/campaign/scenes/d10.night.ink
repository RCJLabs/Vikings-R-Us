# draft
// FIRST DRAFT (M7): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL flag(name)
EXTERNAL home(id)
At dusk the clerk is still at his table, writing by a lamp that smells of good beeswax. Yours smells of fish.
His forms are stacked as high as his elbow, and he has one soul left: a big man with a cross at his neck, sitting on the path with his arms folded.
"He says he was baptized twenty times," says the clerk. "Every Easter, by whoever was handing out the shirts. A christening comes with a new white shirt, you see. He says the last one was scratchy." # speaker: clerk
"I have a form for baptized. I don't have a form for twenty." # speaker: clerk
* ["Put him down once. He only needs to arrive once."]
  # fx: standing clerk +1
  # fx: flag helped_clerk
  The clerk looks at you as if you've performed a small miracle.
  "Once. Of course. The rest are duplicates." # speaker: clerk
  He writes it down, and then writes himself a note about duplicates, and underlines it.
  "If you ever tire of your own table, there's always room at ours. We are very short of people who can count." # speaker: clerk
* ["Send him to me. We'll take anyone."]
  "You can't have him. He's ours twenty times over." # speaker: clerk
  He hugs the forms to his chest as if you might take those too.
* ["What's it like, down your end?"]
  # fx: flag heard_pension
  "Warm. Well lit. Quiet, mostly. A great deal of singing on feast days, and a great deal of paperwork on all the others." # speaker: clerk
  "And we have pensions. I don't suppose you know what those are." # speaker: clerk
  You don't. He explains. It takes until the lamp gutters, and at the end you're still not sure, but it sounds warm.
- The big man is let through at last, down the clerk's end of the table. He asks if there's a shirt.
{ home("mother"): -> hill }
-> END

// Ragna's chest (docs/tech-spec.md §50): trouble money can't fix. The hill mends any woman who climbs it
// (Fjölsvinnsmál), and you can carry her up before sunrise, at the cost of the morning at the gate. Waiting
// brings one more chance, the last, on Night 13 (scene.d13.night).
=== hill ===
The raven comes late, with a letter in your mother's hand, pressed hard, as always. # beat
"The healer came about my cough. She's a fusser. She says there's a hill past the falls that mends any woman who climbs it, however long she's been ill. The old women call it Lyfjaberg." # speaker: mother
"I told her I'm not climbing anything in this snow, and I'm not asking you to carry me. You have your work." # speaker: mother
{
- home("brother") && not flag("ulf_shipyard"):
  Under it, in Ulf's square hand:
  "She's worse than she says. The healer says medicine won't mend it, only the hill, and it only gets worse from here. It's a day's climb for a well man, and she isn't one." # speaker: ulf
- home("sister"):
  Under it, in Asa's big careful letters: "Mama coughs all night. The healer says only the hill can mend it, and it gets worse till then. You can fly, can't you?"
}
You could fly her up before the sun, and be back at the gate late, with the queue already halfway down the path.
- (choose)
* [Fly her up at dawn.]
  # fx: sun -120
  # fx: flag ragna_hill
  You write that she's to be at the door before first light, wrapped up warm, and that you won't hear another word about it.
* [Send the healer silver instead.]
  You wrap ten rings in a note asking what the hill's cure costs, brought down. The raven is back before the lamp is out, with the rings, and a scrap of bark around them in a hand you don't know.
  "The hill doesn't come down."
  -> choose
* [Let her rest until the thaw.]
  # fx: flag ragna_waits
  You write that she's to rest and keep warm, and that the hill will still be there in the spring. You don't think about how far off the spring is.
- -> END
