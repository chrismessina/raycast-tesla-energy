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

This is a Raycast extension with two commands, both backed by a single API module:

**`src/tesla.ts`** — shared Tesla Fleet API client. All API types, OAuth configuration, and fetch functions live here. Every command imports from this module.

**`src/view-solar-production.tsx`** — `Detail` view command showing historical energy charts and totals. Period dropdown (Today / Past 7 Days / Past 30 Days / Past Year) via ActionPanel. Renders 4 SVG charts (Solar, Home, Powerwall, Grid) as base64 data URIs in the markdown pane; energy totals in the metadata sidebar. Uses `fetchEnergySites` + `fetchEnergyHistory`. Utility modules: `src/utils/energyCalc.ts` (date ranges, aggregation, chart series), `src/utils/svgChart.ts` (areaChart for day view, barChart/biChart for other periods).

**`src/menu-bar-status.tsx`** — `MenuBarExtra` command polling every 10 minutes. Shows live solar wattage in the menu bar title. The only command using `fetchLiveStatus`.

### OAuth Flow

Authentication uses Raycast's PKCE proxy (`oauth.raycast.com`) as middleware between the extension and Tesla's OAuth server. The proxied `authorizeUrl`, `tokenUrl`, and `refreshTokenUrl` in `tesla.ts` are pre-configured. All commands are wrapped with `withAccessToken(provider)` from `@raycast/utils`.

The required OAuth scope is `energy_device_data` — this covers all read operations (solar, Powerwall, grid, history).

### Tesla Fleet API

- **Base URL (NA):** `https://fleet-api.prd.na.vn.cloud.tesla.com`
- Entry point: `GET /api/1/products` → returns all products, filtered by presence of `energy_site_id`
- Live data: `GET /api/1/energy_sites/{id}/live_status` — used only by `menu-bar-status`
- History: `GET /api/1/energy_sites/{id}/calendar_history?kind=energy` — used by `view-solar-production`

All commands use `sites[0]` — multi-site support is not implemented.

### Logging

Uses `@chrismessina/raycast-logger` with redaction enabled. The `Logger` instance in `tesla.ts` is the only logger. Users can enable verbose logging via the extension preference `verboseLogging`.

## Tesla Developer Setup

See `SETUP.md` for the full procedure to register a Tesla Fleet API application, generate EC keys, host the public key, complete partner registration (required to avoid `412` errors), and configure the Raycast PKCE proxy.
