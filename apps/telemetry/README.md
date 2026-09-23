# Alpha telemetry Worker

Opt-in, anonymous play data for the public Daily alpha (see `docs/privacy.md`).
The game only sends anything when the build has a telemetry URL **and** the
player has said yes.

## What it stores

- `shifts`: one row per finished shift (build, mode, Daily number, layout, score).
- `souls`: one row per soul (rule, archetype, stamp, time, tools, kinds of sign looked at or missed).
- `guard_mismatches`: a device that generated a different Daily than the build's checksum table.

Each shift gets a random id on arrival and only the date is kept. Nothing links
rows to a person or to each other across shifts.

## Set up (once)

1. Create a free Cloudflare account and the database:
   `npx wrangler d1 create cots-telemetry`
2. Paste the printed `database_id` into `wrangler.toml`, and check `ALLOWED_ORIGINS`
   (your Pages domain and `https://*.itch.zone`).
3. Add repository secrets `CLOUDFLARE_API_TOKEN` (Workers and D1 edit rights) and
   `CLOUDFLARE_ACCOUNT_ID`, then run the **Deploy telemetry** workflow. It creates
   the tables and deploys.
4. Add a repository variable `TELEMETRY_URL` with the Worker's URL
   (e.g. `https://cots-telemetry.<you>.workers.dev`). The Pages and itch
   deploys pass it to the build as `VITE_TELEMETRY_URL`; without it the game
   shows no telemetry option at all.

## Reading it

```sh
npx wrangler d1 execute cots-telemetry --remote --command \
  "SELECT rule, COUNT(*) AS n, AVG(correct) AS accuracy, AVG(sun_ms) / 1000 AS secs FROM souls GROUP BY rule"
```

Miss rates per sign: `SELECT missed, COUNT(*) FROM souls WHERE correct = 0 GROUP BY missed`.

## Turning it off

Unset the `TELEMETRY_URL` variable and redeploy the web builds. The plan is to
switch it off after the alpha; the Steam and Play builds never send telemetry.
