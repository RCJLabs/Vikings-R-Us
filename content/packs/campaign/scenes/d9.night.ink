# draft
// FIRST DRAFT (M7): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL flag(name)
EXTERNAL home(id)
{ not home("brother"): -> without_ulf }
Ulf has written on both sides of the bark and down the edges.
{ flag("ulf_fine_paid") || flag("ulf_debt"):
  "Hallbjorn died in the fighting yesterday. The jarl's cousin was next to him, and came home with a bent sword and a great deal to say about it. The smithy's shut for good." # speaker: ulf
}
"Good news, for once. I've been offered work." # speaker: ulf
"A shipyard in the north, past the last farms. They want men who can shape a plank and carve a straight line, and they pay in advance: a month's silver before I've lifted an adze." # speaker: ulf
{ flag("ulf_debt"):
  "It would pay the jarl his fine, with some over. I could stop dreading the Thing." # speaker: ulf
}
{ flag("ulf_fine_paid"):
  "The fine's paid, thanks to you, so the silver would be ours. For the winter, and a bit over for Asa." # speaker: ulf
}
"The man who hired me was very courteous. He had the cleanest hands I've ever seen on a shipwright. He sends you his regards. He said you'd know him." # speaker: ulf
{ home("mother"):
  "Mother doesn't want me to go. She says the north is cold and strange and full of giants. I told her it's only a shipyard." # speaker: ulf
}
"You see more of the world than we do now. Tell me what to do, and I'll do it." # speaker: ulf
* ["Go. We need the silver."]
  # fx: flag ulf_shipyard
  # fx: rings +10
  You tell him to go, to wrap up warm, and to write every week. The raven comes back before dawn with ten rings of hacksilver from his advance, and a note: "Don't spend it all on clippers."
* ["Don't go. We'll manage."]
  # fx: flag ulf_home
  You tell him to stay home, and that you'll manage the rest from here, somehow. You don't know how. You write it very firmly so he won't notice.
* ["Ask him what they're building."]
  The raven goes and comes back. Ulf's answer is one line.
  "A ship. A very big one. They didn't say who for." # speaker: ulf
  ** ["Go, then."]
     # fx: flag ulf_shipyard
     # fx: rings +10
     He goes. The raven comes back before dawn with ten rings from his advance, and no note at all.
  ** ["Stay."]
     # fx: flag ulf_home
     He stays. The next letter from home is the happiest in weeks.
- Up at the hall, somebody is counting Draupnir's rings out loud, and getting it wrong, and starting again.
-> END

=== without_ulf ===
Your mother's letter is short.
"I keep setting a place for your brother. Asa tells me off for it." # speaker: mother
"A man came asking for carpenters for a shipyard in the north. Very polite. He asked after you by name. I told him we have nobody left who can hold an adze." # speaker: mother
* [Write that you miss Ulf too.]
  You write it. It's the first time you've said it, even to yourself.
* [Ask what the man looked like.]
  "Clean," she writes back. "His hands especially. I didn't like him." # speaker: mother
- Up at the hall, somebody is counting Draupnir's rings out loud, and getting it wrong, and starting again.
-> END
