# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development mode (hot-reload in Raycast)
npm run build        # Build for production
npm run lint         # Run ESLint
npm run fix-lint     # Auto-fix lint issues
npm run publish      # Publish to Raycast Store
```

## Architecture

Two commands backed by a shared API module and two utility modules:

**`src/tesla.ts`** — Tesla Fleet API client. All API types, OAuth config, and fetch functions. `LOCAL_TZ` is a module-level constant used by both calendar history fetch functions. Exports: `provider`, `getToken`, `fetchEnergySites`, `fetchLiveStatus`, `fetchSiteInfo`, `fetchEnergyHistory`, `fetchSelfConsumption`.

**`src/view-solar-production.tsx`** — `Detail` view command. Period switcher (Today / Past 7 Days / Past 30 Days / Past Year) via ActionPanel. Renders 4 SVG charts (Solar, Home, Powerwall, Grid) as data URIs in the markdown pane; energy totals and self-consumption percentages in the metadata sidebar. Site ID is cached in a `useRef` so `fetchEnergySites` is only called once per mount, not on every period switch. `siteInfo` is cached in state (fetched once, reused).

**`src/menu-bar-status.tsx`** — `MenuBarExtra` command, auto-refreshes every 10 minutes. Shows live solar wattage in the menu bar title. Uses `useCachedPromise` with `keepPreviousData`; token is passed as a typed argument (not captured by closure) to avoid stale-closure issues on token refresh.

**`src/utils/energyCalc.ts`** — Pure TypeScript, no Raycast imports. Exports: `Period` type, `getDateRange`, `formatEnergy`, `formatPower`, `aggregateByDay`, `filterFutureEntries`, aggregation helpers (`totalSolarGenerated` etc.), and chart series extractors (`solarPoints` etc.). Tesla returns sub-hourly data even for week/month periods — always call `aggregateByDay` before charting those periods.

**`src/utils/svgChart.ts`** — SVG chart generators returning data URIs (`encodeURIComponent`, not base64). `areaChart` for day-view Solar/Home; `barChart` for multi-period Solar/Home; `biChart` for Powerwall and Grid (bidirectional). All three accept `xLabels` and `peakLabel` options.

### OAuth Flow

Raycast's PKCE proxy (`oauth.raycast.com`) sits between the extension and Tesla's OAuth server. The proxied `authorizeUrl`, `tokenUrl`, and `refreshTokenUrl` are hardcoded in `tesla.ts`. All commands wrap their export with `withAccessToken(provider)` from `@raycast/utils`. Required scope: `energy_device_data`.

### Tesla Fleet API

- **Base URL (NA):** `https://fleet-api.prd.na.vn.cloud.tesla.com`
- `GET /api/1/products` — entry point, filtered by `energy_site_id`
- `GET /api/1/energy_sites/{id}/live_status` — used by `menu-bar-status` only
- `GET /api/1/energy_sites/{id}/site_info` — Powerwall count, timezone, components
- `GET /api/1/energy_sites/{id}/calendar_history?kind=energy` — historical data, used by `view-solar-production`
- `GET /api/1/energy_sites/{id}/calendar_history?kind=self_consumption` — returns `{ solar: %, battery: % }` aggregate per period

All commands use `sites[0]` — multi-site support is not implemented.

### Logging

Uses `@chrismessina/raycast-logger` with redaction enabled. The `Logger` instance in `tesla.ts` is the only logger. JWT claims (aud, iss, scope, exp) are logged once on first token use. Verbose logging can be enabled via the extension preference `verboseLogging`.

## Tesla Developer Setup

See `.github/docs/SETUP.md` for the full procedure: registering a Tesla Fleet API application, generating EC keys, hosting the public key via GitHub Pages, completing partner registration (required to avoid `412 Precondition Failed`), and configuring the Raycast PKCE proxy.
