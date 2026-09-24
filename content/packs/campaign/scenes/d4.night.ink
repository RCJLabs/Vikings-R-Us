# draft
// FIRST DRAFT (phase 2): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL flag(name)
EXTERNAL sick(id)
EXTERNAL home(id)
A letter from your mother this time. Her hand is shakier than Ulf's, and she's written around a grease spot rather than waste the bark.
"Your brother has found work at the smithy in the valley, sweeping. Hallbjorn the smith is kind and the floor is warm." # speaker: mother
{ flag("roof_mended"):
  "Old Hrolf died this morning, in his chair by the fire, with his boots on. He and Ulf finished our roof two days before. It's the best roof in the valley, and the last thing he made." # speaker: mother
- else:
  "The roof is no better. Ulf says after the thaw. Everyone says after the thaw." # speaker: mother
}
{
- not home("sister"):
  "The house is quiet without Asa. Your aunt writes that she's eating well." # speaker: mother
- sick("sister"):
  "Asa is still unwell. The medicine helps, but it is dear." # speaker: mother
- else:
  "Asa has a little cough. It's the damp. Don't worry." # speaker: mother
}
"What is it like there? Do they feed you? Have you seen anyone from home?" # speaker: mother
{ flag("hrolf_judged"):
  You have, this morning. You don't know how to put Hrolf on bark.
}
"Tell me the gods are kind to you." # speaker: mother
* [Tell her they are.]
  You tell her the gods are kind. It's the first real lie you've told since you took the stamp.
  # fx: flag letters_kind +1
* [Tell her about Freyja.]
  You describe the feather cloak and the smell of apples. Your mother will read it to anyone who visits.
  # fx: flag letters_honest +1
- You fall asleep before the candle does.
-> END
