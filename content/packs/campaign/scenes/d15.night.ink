# draft
// FIRST DRAFT (M7): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL home(id)
EXTERNAL rings()
{
- home("mother"):
  Your mother's letter is written very small, to fit more on the bark.
  "There's a ferryman at the mouth of the fjord. He's been there since the autumn. People say he's older than the rocks, and he won't give his name." # speaker: mother
  "He says there's a shore across the water the wolf will never reach. He'll carry anyone there when the horn blows. Twenty rings now, to hold a place. A hundred more on the day." # speaker: mother
  "The Olafssons paid him. Old Bera paid him. Everyone with rings is paying him, and everyone without is pretending they don't believe in him." # speaker: mother
  "You're closer to the gods than we are. Is there such a shore?" # speaker: mother
- home("brother"):
  Ulf's letter is short and very square.
  "There's a ferryman at the mouth of the fjord. He says there's a shore the wolf won't reach. Twenty rings now to hold a place, a hundred more on the day the horn blows." # speaker: ulf
  "I think he's a liar. I think I'd pay him anyway. Tell me I'm a fool." # speaker: ulf
- else:
  Your aunt writes for Asa. A ferryman at the mouth of the fjord says there's a shore the wolf will never reach. Twenty rings now to hold a place, a hundred more on the day the horn blows.
}
You don't know. Nobody at the gate has ever mentioned a shore. But nobody at the gate ever mentions anything.
* [Send twenty rings for a place on the ferry. #needs: rings 20]
  # fx: rings -20
  # fx: flag ferryman
  You wrap the rings in your answer. A hundred more by the day the horn blows. You start counting before the raven's out of sight.
* [Tell them to wait.]
  # fx: flag ferryman_doubted
  You write that you'll ask around. You don't know who you'd ask.
* [Tell them the gods will hold.]
  # fx: standing odin +1
  You write it firmly, the way Skögul says things. It looks less firm on the bark.
- On the shingle below the gate, where nobody ever lands, a small grey boat has been drawn up that wasn't there this morning. There's nobody in it.
-> END
