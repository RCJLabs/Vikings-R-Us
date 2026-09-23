# draft
// DRAFT: placeholder writing to be rewritten (docs/story-drafts.md).
EXTERNAL sick(id)
EXTERNAL home(id)
A letter from your mother this time. Her hand is shakier than Ulf's.
"Your brother has found work at the smithy, sweeping. The smith is kind and the floor is warm." # speaker: mother
{
- not home("sister"):
  "The house is quiet without Asa. Your aunt writes that she's eating well." # speaker: mother
- sick("sister"):
  "Asa is still unwell. The medicine helps, but it is dear." # speaker: mother
- else:
  "Asa has a little cough. It's the damp. Don't worry." # speaker: mother
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
