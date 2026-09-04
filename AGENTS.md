# Agent Guidelines for Tesla Energy

> Instructions for AI coding assistants working on this codebase.

Tesla Energy shows a Tesla solar + Powerwall site's energy: a `Detail` command that charts
solar, home, Powerwall, and grid for Today / This Week / This Month / Year to Date, and a
menu-bar command that shows live solar wattage and refreshes every ten minutes. Read-only
— nothing here commands the hardware.

## Before making changes

- `.github/docs/SETUP.md` — how the Tesla Fleet API app is registered. Read it before
  touching anything auth-shaped. It is the only place the partner-registration step and
  the `412` it causes are explained.
- Fleet-wide conventions live in Chris's `raycast-extensions` plugin at
  `/Users/messina/Developer/GitHub/chrismessina/raycast-extension-workflows/plugins/raycast-extensions/reference/house-style.md`
  (not in this repo). In short: no `any`, never hand-define `Preferences`/`Arguments`
  (Raycast generates them into `raycast-env.d.ts`), and every `Toast.Style.Failure` gets a
  "Copy Error" action. They are not restated here.
- The existing code in the area you are changing. `src/` is five files; read them.

## The trap: `calendar_history`'s `period` parameter

Six commits in a row fought this one parameter, and two of them reverted the one before:

```
3f75a4d  always request day-granularity   ← "period controls bucket size, not the window"
ea5d70a  use local datetime with TZ offset for the date params
5b044f3  revert to correct API period params   ← undoes both of the above
5438765  correct API period mapping for day view
6d8f4ab  use period=month for month and year
fa6c5c2  pass period=year for year view
```

The settled answer is at `src/tesla.ts:311`:
**`period` sets both the bucket size and the date window, so it must be passed through
verbatim.** `period=day` returns sub-hourly data *for today only* — it does not become a
day-granularity feed for an arbitrary range, which is what `3f75a4d` assumed and what
`5b044f3` had to undo. `start_date`/`end_date` narrow within the calendar period; they
cannot widen it.

Two corollaries, both learned the same expensive way:

- **The date params are full ISO datetimes, not dates.** `getDateRange`
  (`src/utils/energyCalc.ts:5`) returns `toISOString()` output. A bare `YYYY-MM-DD` gets a
  `400` with `cannot parse "" as "T"`. Do not "simplify" the date formatting.
- **The client aggregates, the API does not.** Week/month/year responses go through
  `aggregateToWeek` / `aggregateToMonth` / `aggregateToYear`, which emit a **fixed** slot
  count (7 / days-in-month / 12) and zero-pad the gaps, so the chart axis is stable even
  when Tesla returns fewer entries. Charting the raw `time_series` gives a chart whose
  x-axis silently changes shape with the payload.

### The cache makes a wrong request look sticky

`src/tesla.ts` keeps a module-level `Cache` (namespace `tesla-energy`) with TTLs of 24 h
for sites and site info, and 5 min / 15 min / 60 min for day / week-month / year history.
Cache keys include the period and start date, so a code change that alters the *request*
is not reflected until the TTL expires. The **Refresh action does not bypass the cache** —
it re-runs `loadData`, which hits `getCached` first. When iterating on request shape,
change a cache key or wait out the TTL; do not conclude your edit had no effect.

## Auth: OAuth PKCE through Raycast's proxy

There is no API-key preference, and there is no place to paste a token. `src/tesla.ts:83`
builds an `OAuthService` whose `authorizeUrl` / `tokenUrl` / `refreshTokenUrl` are
**Raycast proxy URLs** (`oauth.raycast.com/v1/...`), hardcoded because Tesla requires a
`client_secret` at token exchange that an extension cannot hold. Those three URLs and the
client ID are bound to Chris's registered Tesla developer app and its region — a fork
cannot reuse them and cannot mint new ones without going through `SETUP.md`. Scope is
`openid offline_access energy_device_data`; `audience` is passed as an extra parameter and
must equal `API_BASE`.

- Both commands wrap their default export with `withAccessToken(provider)`. `getToken()`
  calls `getAccessToken()` under the hood, so it only works **inside** the wrapped
  component — never at module scope, never in a util.
- The menu-bar command passes `token` as a *typed argument* to `useCachedPromise`, not via
  closure (`src/menu-bar-status.tsx:27`). Capturing it in the closure re-introduces a stale
  token after a refresh.
- **A menu-bar command launched in the background cannot run interactive OAuth.**
  `OAuthErrorBoundary` (`src/menu-bar-status.tsx:133`) catches exactly the errors whose
  message mentions `OAuth` or `background`, re-throws everything else, and renders
  `AuthErrorFallback` — a `!` in the menu bar with a "Sign in" item that launches the view
  command. If you widen that predicate you will swallow real crashes into a fake sign-in
  prompt.

## When the API is unreachable

`apiFetch` (`src/tesla.ts:192`) checks `response.ok` explicitly — `fetch` resolves on a
500, it does not reject — logs the status and body, and throws
`Tesla API error (<status>): <body>`. Keep that shape:

- The view command catches it into `error` state and renders an error `Detail` with Retry
  and Copy Error. Do not swallow a failure into an empty `entries` array; an empty array
  renders "No data available for this period", which is a claim about the site, not about
  the request.
- The menu bar has no error branch. `useCachedPromise` with `keepPreviousData` keeps
  showing the last good reading, and `status` is undefined on a cold failure, so the menu
  is empty apart from the title. That is a known thin spot, not a considered design.
- **`412 Precondition Failed` is not an auth bug.** It means the client ID is not
  registered in the region, and no amount of re-authenticating fixes it. Same for `403`
  with `partner_not_registered`. Send it to `SETUP.md` Part 4, and do not add a
  sign-in-again prompt for it.

## Things that look like bugs and are not

- **`sites[0]` everywhere.** Multi-site accounts are not supported; both commands take the
  first energy site. Deliberate, and the place to start if support is wanted.
- **Solar→battery energy is double-counted on purpose.** `battery_energy_imported_from_solar`
  is in both `totalSolarGenerated` and `totalBatteryCharged` — see the comment at
  `src/utils/energyCalc.ts:60`. The sidebar totals measure different flows and are not
  meant to sum.
- **Charts are SVG data URIs in the markdown pane**, generated in `src/utils/svgChart.ts`
  and URI-encoded (`encodeURIComponent`, not base64). Day view uses `areaChart` /
  `biAreaChart`; multi-period uses `barChart` / `biChart`. `src/utils/theme.ts` is the
  single source of truth for chart hex colors and their matching Raycast `Color` tints —
  add colors there, not inline.
- **`verboseLogging` has no reference in `src/`.** `@chrismessina/raycast-logger` reads the
  preference itself; `log.debug` and `log.time` are silent unless it is on, while
  `info`/`warn`/`error` always print.
- **The AI "Today Summary" fails silently by design** (`src/view-solar-production.tsx:232`).
  It is gated on `environment.canAccess(AI)` and the `showTodaySummary` preference, streams
  in, and caches for an hour. A missing summary is not an error worth a toast.

## Commands

```bash
npm run dev       # ray develop
npm run build     # ray build
npm run lint      # ray lint   (npm run fix-lint applies --fix)
npx tsc --noEmit  # separate gate — ray build strips types and will not catch type errors
```

**There are no tests.** No `test` script, no suite — nothing will catch a regression for
you. Charts, toasts, the menu bar, and the OAuth fallback are all eyes-only — run
`npm run dev` and look at them before reporting done.

## Repo shape

This is the **standalone mirror**; the Store copy lives in `raycast/extensions`.
`.github/workflows/sync-from-upstream.yml` pulls upstream changes back here, tracking file
hashes in `.github/upstream-sync-state.json`. Files present here but absent upstream (this
file, `LICENSE`, `TODO.md`, `docs/`) are not synced and must not be added to a Store PR.
`docs/superpowers/`, `.claude/`, and `.github/docs/.private/` are gitignored.
