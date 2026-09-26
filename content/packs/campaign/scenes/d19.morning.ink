# draft
// FIRST DRAFT (M7): rewrite or sign off. Voice: docs/voice.md. Flags: docs/story-drafts.md.
EXTERNAL flag(name)
EXTERNAL standing(faction)
No decree. The quartermaster has sent the birch bark anyway, blank but for a very small drawing of a wolf in one corner. You don't think he meant to send it.
"Every rule stands," says Skögul. "All of them. The whole book." # speaker: skogul
She has brought two apples today, and she puts one down in front of you.
"The last full shift. Tomorrow isn't a shift. Tomorrow is whatever comes up the path, all at once, until the sun goes out." # speaker: skogul
"So today, do it properly. Every rule, every nail, every lie. Tomorrow you won't have time to be careful." # speaker: skogul
* [Eat the apple.]
  It's a good apple. It's the first thing she's ever given you that isn't a rule.
* ["Will you be here tomorrow?"]
  "I'll be where I'm sent," says Skögul. "Same as you." # speaker: skogul
  She polishes her own apple on her sleeve, and doesn't eat it.
- Muninn is on the table, reading the day's first tally upside down. When you turn it the right way up, he looks at it as if he's never seen a rune before.
// The clerk's contract kept (docs/tech-spec.md §57): for one who said "Not yet" and is still in his favour.
{ flag("clerk_later") && not flag("clerk_contract") && standing("clerk") >= 3: -> clerk }
-> END

=== clerk ===
On your way to the desk the clerk steps into your path, with the sheet of vellum held in both hands, just as he held it yesterday.
"It kept," he says. "I said it would. The fee is still ten rings, and the drawer is still yours until tomorrow. After tomorrow, I'm afraid, there won't be a drawer." # speaker: clerk
"You've been good to the department. I noticed. Noticing is most of my job." # speaker: clerk
* [Sign it now and pay the ten rings. #needs: rings 10]
  # fx: rings -10
  # fx: flag clerk_contract
  # fx: standing clerk +2
  You sign where he points. He sands the ink and rolls it up, and this time he doesn't smile. He nods, once, like a sum that has come out right.
* ["No. Not now either."]
  # fx: flag clerk_later = 0
  "Then I'll file it," he says. He puts the vellum back in the drawer, closes it, and doesn't look at it again.
- -> END
