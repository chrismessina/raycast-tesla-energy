# Contributing to Tesla Energy

Thanks for helping. This guide covers running Tesla Energy locally and sending a change.

## Where changes go

Tesla Energy is published in the [Raycast Store](https://www.raycast.com/chrismessina/tesla-energy).
Open pull requests against [`raycast/extensions`](https://github.com/raycast/extensions/tree/main/extensions/tesla-energy),
not this repository: Raycast reviews every change there, and merged changes sync back here
automatically. Open [issues](https://github.com/chrismessina/raycast-tesla-energy/issues) here or in
`raycast/extensions`, whichever you prefer.

## Run it locally

You need [Raycast](https://www.raycast.com/) and Node.js 22 or later.

1. In Raycast, find Tesla Energy in the Store and choose **Fork Extension** from the action panel.
   Raycast checks out only this extension's folder from `raycast/extensions`.
2. In that folder, run `npm ci`, then `npm run dev`. Raycast opens the development version, and
   saving a file reloads it.

To see real data you need a Tesla account with solar panels or a Powerwall. Raycast asks you to
connect the account on first run. The Today Summary needs Raycast AI (Raycast Pro).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Run the extension in Raycast and reload on save |
| `npm run build` | Build the distribution bundle |
| `npm run lint` | Run Raycast's ESLint and Prettier checks |
| `npm run fix-lint` | Fix what the linter can fix |

## How it works

- `src/tesla.ts` holds the Tesla account connection and the API calls. Sign-in is OAuth with PKCE
  through Raycast's OAuth proxy (`OAuthService` from `@raycast/utils`), and data comes from the
  Tesla Fleet API: energy sites, live status, site info, self-consumption and energy history.
  Energy sites, site info, energy history and each day's AI summary are kept in a Raycast `Cache` with per-kind lifetimes.
- `src/view-solar-production.tsx` is the Solar Production command. It renders the charts in a
  `Detail` view's Markdown and asks Raycast AI (`AI.ask`) for the Today Summary.
- `src/utils/svgChart.ts` draws the area, bar and two-sided charts as SVG and returns them as
  `data:` URIs, so the charts need no chart library.
- `src/utils/energyCalc.ts` has the date ranges for each period, the energy totals and the number
  formatting. `src/utils/theme.ts` has the chart colors and icons.
- `src/menu-bar-status.tsx` is the Solar Status menu bar command.

## Before you open a pull request

- `npm run build`, `npx tsc --noEmit` and `npm run lint` all pass.
- You tried the change in Raycast, including its error and empty states.
- `CHANGELOG.md` has a new entry at the top, dated `{PR_MERGE_DATE}`. Raycast fills in the date
  when the pull request merges.
- New or changed screenshots go in `metadata/`, taken with Raycast's Window Capture.
