# Solar Production Command — Redesign Spec

**Date:** 2026-03-24
**Status:** Approved

---

## Overview

Redesign the Solar Production command into a unified energy dashboard with historical charts inspired by the NetZero app. Remove the separate Energy History command, absorbing its functionality into Solar Production via a period dropdown. The menu bar command is unchanged.

---

## Command Changes

### Remove `view-history`

- Delete `src/view-history.tsx`
- Remove the `view-history` command entry from `package.json`

### Rewrite `view-solar-production`

- Command name in `package.json` stays `view-solar-production` for continuity; title becomes "Solar Production"
- Switches from `live_status` to `calendar_history` as its primary data source
- Adds a period dropdown: **Today / Past 7 Days / Past 30 Days / Past Year**
- Default period: `day`

---

## Data Flow

### API

All data comes from `fetchEnergyHistory` (already in `tesla.ts`), called with the selected period. No new API functions needed.

- `day` — sub-hourly granularity (Tesla returns up to ~5-minute intervals; expect up to ~288 points for a full day, fewer for a partial day)
- `week` — daily granularity (~7 points)
- `month` — daily granularity (~30 points)
- `year` — monthly granularity (~12 points, including future months with all-zero values)

The `live_status` endpoint is no longer used in this command — that remains exclusively in `menu-bar-status.tsx`.

### Date ranges

Reuse `getDateRange(period)` logic from the old `view-history.tsx`, migrated into `src/utils/energyCalc.ts`. All ranges are **rolling windows** (not calendar-aligned):

- `day` — midnight today → now
- `week` — 7 days ago → now
- `month` — 30 days ago → now
- `year` — 365 days ago → now

Period labels in the sidebar reflect this: **Today / Past 7 Days / Past 30 Days / Past Year**.

### Empty data and future entries

- If `fetchEnergySites` returns an empty array, show an error state matching the existing behavior in the current commands (Toast + Detail error view with Retry action).
- If `entries` is empty, render each chart as a flat baseline (no bars, no curve) with a "No data" note in the sidebar.
- For `year` view, Tesla returns entries for future months with all-zero values. Filter these out before charting: exclude any entry whose `timestamp` is in the future.

---

## Layout

### Markdown pane — 4 stacked SVG charts

Rendered as `![](data:image/svg+xml;base64,...)` images in the markdown string, stacked vertically. Each chart is full pane width (~500px) and ~120px tall. No text or labels inside the SVGs — purely visual.

| # | Chart | Color (dark / light) | Day chart type | Week/Month/Year chart type |
|---|-------|----------------------|----------------|---------------------------|
| 1 | Solar | `#C9A227` / `#B8860B` | Area | Vertical bars |
| 2 | Home | `#7B68EE` / `#6A5ACD` | Area | Vertical bars |
| 3 | Powerwall | `#30D158` / `#248A3D` | Bidirectional bars | Bidirectional bars |
| 4 | Grid | `#AEAEB2` / `#8E8E93` | Bidirectional bars | Bidirectional bars |

**Day view:** Area charts with a smooth filled curve. A single faint horizontal gridline at midpoint for scale reference. Matches NetZero's bell-curve aesthetic.

**Week/month/year view:** Vertical bar charts. Bidirectional charts (Powerwall, Grid) have the baseline at vertical midpoint — positive values above, negative values below.

**Theme resolution:** The caller resolves all color strings using `environment.appearance` before passing them to the chart functions. Each chart function receives pre-resolved `color` (and for `biChart`, `positiveColor` and `negativeColor`). The caller also resolves and passes `gridlineColor` in `ChartOptions` — using `#555555` for dark mode and `#AAAAAA` for light mode.

### Metadata sidebar

Mirrors NetZero's right-side totals. Populated by aggregating the `EnergyHistoryEntry[]` array using helpers from `energyCalc.ts`.

```
Solar Production
  ☀️  X.X kWh Generated

Home Consumption
  🏠  X.X kWh Used

Powerwall
  🔋  X.X kWh Discharged
      X.X kWh Charged

Grid
  ⚡  X.X kWh Net  (negative = net exporter)

─────────────────
Period: Today / Past 7 Days / Past 30 Days / Past Year
```

### Refresh action

The command retains a "Refresh" action in the `ActionPanel` that re-fetches data for the currently selected period. It does not reset the period selector.

---

## New File: `src/utils/svgChart.ts`

Three exported functions. All receive a pre-resolved color string from the caller (see Theme resolution above). Chart backgrounds are transparent.

### Shared options

```ts
interface ChartOptions {
  width?: number;          // default: 500
  height?: number;         // default: 120
  fillOpacity?: number;    // default: 0.6 — for area fill
  gridlineColor?: string;  // default: "#555555" (dark) or "#AAAAAA" (light) — caller resolves via environment.appearance
}
```

### `areaChart(points: number[], color: string, options?: ChartOptions): string`

- Normalizes `points` to chart width
- Smooth curve via cubic bezier (control points derived from adjacent slopes)
- Fills below the curve to the bottom baseline
- Single faint horizontal gridline at vertical midpoint
- Returns base64 SVG data URI

### `barChart(values: number[], color: string, options?: ChartOptions): string`

- Vertical bars, evenly spaced, baseline at bottom
- Returns base64 SVG data URI

### `biChart(values: number[], positiveColor: string, negativeColor: string, options?: ChartOptions): string`

- Bidirectional vertical bars, baseline at vertical midpoint
- Positive values extend upward (positiveColor), negative values extend downward (negativeColor)
- Returns base64 SVG data URI

---

## New File: `src/utils/energyCalc.ts`

Pure aggregation functions and date range utilities.

### Date ranges

```ts
function getDateRange(period: Period): { startDate: string; endDate: string }
```

Migrated from `view-history.tsx` (rolling windows as described above). Note: the Tesla API's `week` period granularity returns daily data points; the rolling 7-day window may not align to a calendar week boundary, so the API may return fewer than 7 points near boundaries. Add a code comment noting this.

### Display helpers

Migrated from `view-history.tsx` into `energyCalc.ts`:

```ts
function formatEnergy(wh: number): string   // e.g. 500 → "500 Wh", 1431 → "1.4 kWh", 1_200_000 → "1.2 MWh"
function formatDate(timestamp: string, period: Period): string  // period-aware date label
```

### Aggregation helpers

All inputs are `EnergyHistoryEntry[]`. All outputs are in Wh (display layer converts to kWh).

```ts
// Total solar generated = all destinations solar was routed to
function totalSolarGenerated(entries): number
// = Σ (solar_energy_exported + consumer_energy_imported_from_solar + battery_energy_imported_from_solar)

// Total home consumption = all sources home drew from
function totalHomeUsed(entries): number
// = Σ (consumer_energy_imported_from_solar + consumer_energy_imported_from_battery + consumer_energy_imported_from_grid)

// Powerwall discharged (energy sent out of battery)
function totalBatteryDischarged(entries): number
// = Σ battery_energy_exported

// Powerwall charged (energy stored into battery)
function totalBatteryCharged(entries): number
// = Σ (battery_energy_imported_from_solar + battery_energy_imported_from_grid)

// Grid net: positive = net importer, negative = net exporter
function totalGridNet(entries): number
// = Σ (grid_energy_imported - grid_energy_exported_from_solar - grid_energy_exported_from_battery)
```

### Per-entry chart series helpers

Used to extract the signed value per data point for each chart.

```ts
// Solar area/bar chart — total generated per entry
function solarPoints(entries): number[]
// = entries.map(e => e.solar_energy_exported + e.consumer_energy_imported_from_solar + e.battery_energy_imported_from_solar)

// Home area/bar chart — total consumed per entry
function homePoints(entries): number[]
// = entries.map(e => e.consumer_energy_imported_from_solar + e.consumer_energy_imported_from_battery + e.consumer_energy_imported_from_grid)

// Powerwall signed net per entry (positive = discharging, negative = charging)
function batteryPoints(entries): number[]
// = entries.map(e => e.battery_energy_exported - (e.battery_energy_imported_from_solar + e.battery_energy_imported_from_grid))

// Grid signed net per entry (positive = importing, negative = exporting)
function gridPoints(entries): number[]
// = entries.map(e => e.grid_energy_imported - (e.grid_energy_exported_from_solar + e.grid_energy_exported_from_battery))
```

---

## Files Affected

| File | Change |
|------|--------|
| `src/view-solar-production.tsx` | Full rewrite |
| `src/view-history.tsx` | Delete |
| `src/utils/svgChart.ts` | New file |
| `src/utils/energyCalc.ts` | New file |
| `package.json` | Remove `view-history` command; update Solar Production description |
| `CLAUDE.md` | Update commands section: remove `view-history`, note Solar Production now covers all time periods with period dropdown |

---

## Out of Scope

- Caching / request deduplication (deferred)
- Multi-site support (deferred)
- Live data overlay on day chart (deferred — menu bar covers live data)
- Vehicle charging data (not available in `energy_device_data` scope)
- Localization of units (sidebar uses text, making this straightforward later)
- Calendar-aligned week/month ranges (rolling windows match existing behavior)
