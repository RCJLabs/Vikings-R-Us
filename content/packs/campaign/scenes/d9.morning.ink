# draft
// FIRST DRAFT (M7): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL flag(name)
EXTERNAL rings()
No decree this morning. The quartermaster has sent a blank strip of birch bark instead, which Skögul says is the same thing but cheaper.
"Ninth night," she says. "Draupnir drips." # speaker: skogul
"Odin's ring. Every ninth night it drips eight more just like itself. Some of them come to the gate, for the chooser." # speaker: skogul
"The queue's longer. It always is on a payday. The dead can smell it." # speaker: skogul
* ["What happens to the rest of Draupnir's rings?"]
  "Odin gives them to people he wants something from." # speaker: skogul
  She looks at the eight-ring space on the table where tonight's pay will sit.
  "So, everyone." # speaker: skogul
* [Get the stamps ready.]
  You ink them one by one. Skögul watches you do it and doesn't correct anything, which is the nearest she comes to praise.
- { flag("owes_skogul"): -> debt }
-> queue

=== debt ===
She takes out a small book and opens it at a page with your name on it, and a 10, and nothing else.
"I'm not a jarl. But I write things down." # speaker: skogul
* [Pay her back now. #needs: rings 10]
  # fx: rings -10
  # fx: flag owes_skogul = 0
  You count ten rings onto the table. She sweeps them into her pouch without counting them again and draws a line through the page.
  "Good. Now I don't have to like you for any reason." # speaker: skogul
* ["After Draupnir."]
  "After Draupnir," she agrees, and writes that down too. # speaker: skogul
- -> queue

=== queue ===
The first soul is already at the table, dripping on the slates and looking hopefully at your belt.
-> END
