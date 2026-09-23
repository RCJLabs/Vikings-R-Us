# Privacy (Daily Shift alpha)

Chooser of the Slain runs in your browser and keeps your settings, Daily results
and an unfinished Daily in your browser's storage on your device. There are no
accounts, ads or third-party trackers. The page is served by GitHub Pages or
itch.io, which, like any web host, see your IP address when you load it.

## Optional play data (alpha only)

If you say yes when asked, or tick "Share anonymous play data" in Settings, the
game sends one record when you finish a shift. For each soul it contains:

- which rule applied, what you stamped and whether that was right;
- how much sun it took, and the sun spent on tools, questions and wrong compares;
- which tools you used, and which *kinds* of sign you looked at or missed
  (for example "skin" or "hands", not what you saw);
- the soul's type and difficulty, and the build's version.

It also says which build and layout you used, and the Daily's number. It never
contains a name, an account, an id that links your shifts together, or anything
you type. The game's server (a Cloudflare Worker) keeps the date a record
arrived, not the time, and doesn't store your IP address; Cloudflare handles it
to deliver the request, as any host would.

If your device ever generates a different Daily from everyone else's, the game
(again, only if you opted in) sends the two checksums and your browser's
user-agent string, so the bug can be found.

This data exists to tune the game: which rules and signs trip people up, and how
long souls really take. It's switched off after the alpha, and the Steam and
Google Play versions don't send any.

You can turn it off any time in Settings. Questions: open an issue on the
project's GitHub page.

## Reports and feedback

"Report this soul" and "Send feedback" open a GitHub issue form, filled in with
the soul's seed, what you did with it, and your browser, screen size and
language. Nothing is sent until you submit the form yourself, on GitHub, under
your GitHub account.
