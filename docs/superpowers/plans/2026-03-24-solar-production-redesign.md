# Solar Production Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate Solar Production and Energy History commands with a single unified command featuring SVG charts (area for day view, bars for other periods) and a period dropdown.

**Architecture:** Two new utility files (`svgChart.ts`, `energyCalc.ts`) provide pure functions for chart rendering and data aggregation respectively. The rewritten `view-solar-production.tsx` composes them into a `Detail` view with SVG charts in the markdown pane and totals in the metadata sidebar. `view-history.tsx` is deleted.

**Tech Stack:** Raycast API (`Detail`, `Detail.Metadata`), `@raycast/utils` (`withAccessToken`), TypeScript, inline SVG via base64 data URIs, existing `tesla.ts` API layer.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/utils/energyCalc.ts` | **Create** | Date ranges, display formatters, aggregation helpers, per-entry series helpers |
| `src/utils/svgChart.ts` | **Create** | `areaChart`, `barChart`, `biChart` — pure SVG chart functions |
| `src/view-solar-production.tsx` | **Rewrite** | Unified Solar Production command with period dropdown and chart layout |
| `src/view-history.tsx` | **Delete** | Superseded by view-solar-production |
| `package.json` | **Modify** | Remove `view-history` command entry |
| `CLAUDE.md` | **Modify** | Update command descriptions |
| `TODO.md` | **Maintain** | Shared progress tracking |

---

## Task 1: Create `src/utils/energyCalc.ts`

**Files:**
- Create: `src/utils/energyCalc.ts`

This is a pure TypeScript module — no Raycast imports, no side effects. All functions are exported and testable in isolation.

- [ ] **Step 1: Create the file with `getDateRange` and display helpers**

```typescript
// src/utils/energyCalc.ts
import type { EnergyHistoryEntry } from "../tesla";

export type Period = "day" | "week" | "month" | "year";

export function getDateRange(period: Period): { startDate: string; endDate: string } {
  const now = new Date();
  const end = now.toISOString();
  let start: Date;

  switch (period) {
    case "day":
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      break;
    case "week":
      // Rolling 7-day window — not calendar-aligned. Tesla API may return
      // fewer than 7 daily points near week boundaries.
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      break;
    case "month":
      // Rolling 30-day window — intentionally differs from old view-history.tsx
      // which used setMonth(-1). Spec mandates rolling windows throughout.
      start = new Date(now);
      start.setDate(start.getDate() - 30);
      break;
    case "year":
      start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      break;
  }

  return { startDate: start.toISOString(), endDate: end };
}

export function formatEnergy(wh: number): string {
  const abs = Math.abs(wh);
  if (abs >= 1_000_000) return `${(wh / 1_000_000).toFixed(1)} MWh`;
  if (abs >= 1_000) return `${(wh / 1_000).toFixed(1)} kWh`;
  return `${Math.round(wh)} Wh`;
}

export function formatDate(timestamp: string, period: Period): string {
  const date = new Date(timestamp);
  if (period === "day") {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (period === "week" || period === "month") {
    return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
```

- [ ] **Step 2: Add aggregation helpers**

Append to `src/utils/energyCalc.ts`:

```typescript
// --- Aggregation helpers (totals across all entries) ---

export function totalSolarGenerated(entries: EnergyHistoryEntry[]): number {
  return entries.reduce(
    (sum, e) => sum + e.solar_energy_exported + e.consumer_energy_imported_from_solar + e.battery_energy_imported_from_solar,
    0,
  );
}

export function totalHomeUsed(entries: EnergyHistoryEntry[]): number {
  return entries.reduce(
    (sum, e) => sum + e.consumer_energy_imported_from_solar + e.consumer_energy_imported_from_battery + e.consumer_energy_imported_from_grid,
    0,
  );
}

export function totalBatteryDischarged(entries: EnergyHistoryEntry[]): number {
  return entries.reduce((sum, e) => sum + e.battery_energy_exported, 0);
}

export function totalBatteryCharged(entries: EnergyHistoryEntry[]): number {
  return entries.reduce(
    (sum, e) => sum + e.battery_energy_imported_from_solar + e.battery_energy_imported_from_grid,
    0,
  );
}

export function totalGridNet(entries: EnergyHistoryEntry[]): number {
  return entries.reduce(
    (sum, e) => sum + e.grid_energy_imported - e.grid_energy_exported_from_solar - e.grid_energy_exported_from_battery,
    0,
  );
}

// --- Per-entry series helpers (one value per data point, for charts) ---

export function solarPoints(entries: EnergyHistoryEntry[]): number[] {
  return entries.map((e) => e.solar_energy_exported + e.consumer_energy_imported_from_solar + e.battery_energy_imported_from_solar);
}

export function homePoints(entries: EnergyHistoryEntry[]): number[] {
  return entries.map((e) => e.consumer_energy_imported_from_solar + e.consumer_energy_imported_from_battery + e.consumer_energy_imported_from_grid);
}

export function batteryPoints(entries: EnergyHistoryEntry[]): number[] {
  // Positive = discharging, negative = charging
  return entries.map((e) => e.battery_energy_exported - (e.battery_energy_imported_from_solar + e.battery_energy_imported_from_grid));
}

export function gridPoints(entries: EnergyHistoryEntry[]): number[] {
  // Positive = importing from grid, negative = exporting to grid
  return entries.map((e) => e.grid_energy_imported - (e.grid_energy_exported_from_solar + e.grid_energy_exported_from_battery));
}

export function filterFutureEntries(entries: EnergyHistoryEntry[]): EnergyHistoryEntry[] {
  const now = new Date();
  return entries.filter((e) => new Date(e.timestamp) <= now);
}
```

- [ ] **Step 3: Build to verify no type errors**

```bash
npm run build
```

Expected: `ready - built extension successfully`

- [ ] **Step 4: Commit**

```bash
git add src/utils/energyCalc.ts
git commit -m "feat: add energyCalc utility (date ranges, formatters, aggregation helpers)"
```

---

## Task 2: Create `src/utils/svgChart.ts`

**Files:**
- Create: `src/utils/svgChart.ts`

Pure SVG generation — no Raycast imports. Returns base64 data URIs suitable for markdown image embeds.

- [ ] **Step 1: Create file with shared types and `escSvg` helper**

```typescript
// src/utils/svgChart.ts

export interface ChartOptions {
  width?: number;         // default: 500
  height?: number;        // default: 120
  fillOpacity?: number;   // default: 0.6
  gridlineColor?: string; // caller resolves: "#555555" dark, "#AAAAAA" light
}

function escSvg(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toDataUri(svg: string): string {
  const b64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${b64}`;
}
```

- [ ] **Step 2: Add `areaChart`**

Append to `src/utils/svgChart.ts`:

```typescript
/**
 * Renders a filled area chart with a smooth bezier curve.
 * Used for day-view Solar and Home charts.
 */
export function areaChart(points: number[], color: string, options: ChartOptions = {}): string {
  const { width = 500, height = 120, fillOpacity = 0.6, gridlineColor = "#555555" } = options;
  const max = Math.max(...points, 1);
  const n = points.length;

  if (n === 0) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`;
    return toDataUri(svg);
  }

  // Map points to SVG coordinates
  const xs = points.map((_, i) => (i / (n - 1)) * width);
  const ys = points.map((v) => height - (v / max) * (height - 4));

  // Build smooth cubic bezier path
  let d = `M ${xs[0]},${ys[0]}`;
  for (let i = 1; i < n; i++) {
    const cpx1 = xs[i - 1] + (xs[i] - xs[i - 1]) / 3;
    const cpy1 = ys[i - 1];
    const cpx2 = xs[i] - (xs[i] - xs[i - 1]) / 3;
    const cpy2 = ys[i];
    d += ` C ${cpx1},${cpy1} ${cpx2},${cpy2} ${xs[i]},${ys[i]}`;
  }

  // Close fill area along the bottom
  const fillPath = `${d} L ${xs[n - 1]},${height} L ${xs[0]},${height} Z`;
  const midY = height / 2;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `  <line x1="0" y1="${midY}" x2="${width}" y2="${midY}" stroke="${escSvg(gridlineColor)}" stroke-width="1" stroke-dasharray="4,4" opacity="0.4"/>`,
    `  <path d="${fillPath}" fill="${escSvg(color)}" fill-opacity="${fillOpacity}"/>`,
    `  <path d="${d}" fill="none" stroke="${escSvg(color)}" stroke-width="1.5"/>`,
    `</svg>`,
  ].join("\n");

  return toDataUri(svg);
}
```

- [ ] **Step 3: Add `barChart`**

Append to `src/utils/svgChart.ts`:

```typescript
/**
 * Renders a vertical bar chart with baseline at bottom.
 * Used for week/month/year Solar and Home charts.
 */
export function barChart(values: number[], color: string, options: ChartOptions = {}): string {
  const { width = 500, height = 120, gridlineColor = "#555555" } = options;
  const max = Math.max(...values, 1);
  const n = values.length;

  if (n === 0) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`;
    return toDataUri(svg);
  }

  const barW = Math.max(1, Math.floor((width / n) * 0.7));
  const gap = width / n;
  const midY = height / 2;

  const bars = values
    .map((v, i) => {
      const barH = Math.max(1, (v / max) * (height - 4));
      const x = Math.round(i * gap + (gap - barW) / 2);
      const y = height - barH;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${escSvg(color)}" rx="1"/>`;
    })
    .join("\n");

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `  <line x1="0" y1="${midY}" x2="${width}" y2="${midY}" stroke="${escSvg(gridlineColor)}" stroke-width="1" stroke-dasharray="4,4" opacity="0.4"/>`,
    bars,
    `</svg>`,
  ].join("\n");

  return toDataUri(svg);
}
```

- [ ] **Step 4: Add `biChart`**

Append to `src/utils/svgChart.ts`:

```typescript
/**
 * Renders a bidirectional vertical bar chart with baseline at vertical midpoint.
 * Positive values extend upward (positiveColor), negative values extend downward (negativeColor).
 * Used for Powerwall and Grid charts across all periods.
 */
export function biChart(
  values: number[],
  positiveColor: string,
  negativeColor: string,
  options: ChartOptions = {},
): string {
  const { width = 500, height = 120, gridlineColor = "#555555" } = options;
  const absMax = Math.max(...values.map(Math.abs), 1);
  const n = values.length;
  const midY = height / 2;

  if (n === 0) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`;
    return toDataUri(svg);
  }

  const barW = Math.max(1, Math.floor((width / n) * 0.7));
  const gap = width / n;

  const bars = values
    .map((v, i) => {
      if (v === 0) return "";
      const barH = Math.max(1, (Math.abs(v) / absMax) * (midY - 2));
      const x = Math.round(i * gap + (gap - barW) / 2);
      const color = v > 0 ? positiveColor : negativeColor;
      const y = v > 0 ? midY - barH : midY;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${escSvg(color)}" rx="1"/>`;
    })
    .join("\n");

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `  <line x1="0" y1="${midY}" x2="${width}" y2="${midY}" stroke="${escSvg(gridlineColor)}" stroke-width="1" opacity="0.6"/>`,
    bars,
    `</svg>`,
  ].join("\n");

  return toDataUri(svg);
}
```

- [ ] **Step 5: Build to verify no type errors**

```bash
npm run build
```

Expected: `ready - built extension successfully`

- [ ] **Step 6: Commit**

```bash
git add src/utils/svgChart.ts
git commit -m "feat: add svgChart utility (areaChart, barChart, biChart)"
```

---

## Task 3: Rewrite `src/view-solar-production.tsx`

**Files:**
- Modify: `src/view-solar-production.tsx` (full rewrite)

This is the main command. It composes the utilities from Tasks 1 and 2 into a `Detail` view.

- [ ] **Step 1: Write the new command**

Replace the entire contents of `src/view-solar-production.tsx`:

```typescript
import { Action, ActionPanel, Color, Detail, Icon, showToast, Toast, environment } from "@raycast/api";
import { withAccessToken } from "@raycast/utils";
import { useEffect, useState } from "react";
import { provider, getToken, fetchEnergySites, fetchEnergyHistory, EnergyHistoryEntry } from "./tesla";
import {
  Period,
  getDateRange,
  formatEnergy,
  filterFutureEntries,
  totalSolarGenerated,
  totalHomeUsed,
  totalBatteryDischarged,
  totalBatteryCharged,
  totalGridNet,
  solarPoints,
  homePoints,
  batteryPoints,
  gridPoints,
} from "./utils/energyCalc";
import { areaChart, barChart, biChart } from "./utils/svgChart";

const PERIOD_LABELS: Record<Period, string> = {
  day: "Today",
  week: "Past 7 Days",
  month: "Past 30 Days",
  year: "Past Year",
};

function resolveColor(dark: string, light: string): string {
  return environment.appearance === "dark" ? dark : light;
}

function buildCharts(entries: EnergyHistoryEntry[], period: Period): string {
  const isDark = environment.appearance === "dark";
  const gridlineColor = isDark ? "#555555" : "#AAAAAA";
  const opts = { width: 500, height: 120, gridlineColor };

  const solar = solarPoints(entries);
  const home = homePoints(entries);
  const battery = batteryPoints(entries);
  const grid = gridPoints(entries);

  const solarColor = resolveColor("#C9A227", "#B8860B");
  const homeColor = resolveColor("#7B68EE", "#6A5ACD");
  const batteryPos = resolveColor("#30D158", "#248A3D");
  const batteryNeg = resolveColor("#30D158", "#248A3D");
  const gridPos = resolveColor("#AEAEB2", "#8E8E93");
  const gridNeg = resolveColor("#5AC8FA", "#007AFF");

  if (period === "day") {
    return [
      `![Solar](${areaChart(solar, solarColor, opts)})`,
      `![Home](${areaChart(home, homeColor, opts)})`,
      `![Powerwall](${biChart(battery, batteryPos, batteryNeg, opts)})`,
      `![Grid](${biChart(grid, gridPos, gridNeg, opts)})`,
    ].join("\n\n");
  }

  return [
    `![Solar](${barChart(solar, solarColor, opts)})`,
    `![Home](${barChart(home, homeColor, opts)})`,
    `![Powerwall](${biChart(battery, batteryPos, batteryNeg, opts)})`,
    `![Grid](${biChart(grid, gridPos, gridNeg, opts)})`,
  ].join("\n\n");
}

function Command() {
  const token = getToken();
  const [entries, setEntries] = useState<EnergyHistoryEntry[]>([]);
  const [period, setPeriod] = useState<Period>("day");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadData(p: Period) {
    try {
      setIsLoading(true);
      setError(null);

      const sites = await fetchEnergySites(token);
      if (sites.length === 0) {
        setError("No Tesla energy sites found on your account.");
        return;
      }

      const { startDate, endDate } = getDateRange(p);
      let data = await fetchEnergyHistory(token, sites[0].energy_site_id, p, startDate, endDate);

      if (p === "year") {
        data = filterFutureEntries(data);
      }

      setEntries(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(message);
      showToast({ style: Toast.Style.Failure, title: "Failed to load data", message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData(period);
  }, [period]);

  if (error) {
    return (
      <Detail
        markdown={`# Error\n\n${error}`}
        actions={
          <ActionPanel>
            <Action title="Retry" icon={Icon.ArrowClockwise} onAction={() => loadData(period)} />
          </ActionPanel>
        }
      />
    );
  }

  const hasData = entries.length > 0;
  const chartsMarkdown = hasData ? buildCharts(entries, period) : "_No data available for this period._";

  return (
    <Detail
      isLoading={isLoading}
      markdown={chartsMarkdown}
      metadata={
        hasData ? (
          <Detail.Metadata>
            <Detail.Metadata.Label
              title="Solar Production"
              text={`${formatEnergy(totalSolarGenerated(entries))} Generated`}
              icon={{ source: Icon.Sun, tintColor: Color.Yellow }}
            />
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label
              title="Home Consumption"
              text={`${formatEnergy(totalHomeUsed(entries))} Used`}
              icon={{ source: Icon.House, tintColor: Color.Blue }}
            />
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label
              title="Powerwall Discharged"
              text={formatEnergy(totalBatteryDischarged(entries))}
              icon={{ source: Icon.Battery, tintColor: Color.Green }}
            />
            <Detail.Metadata.Label
              title="Powerwall Charged"
              text={formatEnergy(totalBatteryCharged(entries))}
              icon={{ source: Icon.BatteryCharging, tintColor: Color.Green }}
            />
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label
              title="Grid Net"
              text={formatEnergy(totalGridNet(entries))}
              icon={{ source: Icon.Signal3, tintColor: totalGridNet(entries) < 0 ? Color.Green : Color.Orange }}
            />
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label title="Period" text={PERIOD_LABELS[period]} />
          </Detail.Metadata>
        ) : null
      }
      actions={
        <ActionPanel>
          <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={() => loadData(period)} />
          <ActionPanel.Section title="Period">
            <Action title="Today" onAction={() => setPeriod("day")} />
            <Action title="Past 7 Days" onAction={() => setPeriod("week")} />
            <Action title="Past 30 Days" onAction={() => setPeriod("month")} />
            <Action title="Past Year" onAction={() => setPeriod("year")} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

export default withAccessToken(provider)(Command);
```

- [ ] **Step 2: Build to verify no type errors**

```bash
npm run build
```

Expected: `ready - built extension successfully`

- [ ] **Step 3: Run in Raycast and verify the command loads**

```bash
npm run dev
```

Open "Solar Production" in Raycast. Verify:
- Charts render (4 SVG images visible in markdown pane)
- Sidebar shows energy totals
- No console errors

- [ ] **Step 4: Commit**

```bash
git add src/view-solar-production.tsx
git commit -m "feat: rewrite Solar Production as unified chart dashboard"
```

---

## Task 4: Delete `view-history` and update `package.json`

**Files:**
- Delete: `src/view-history.tsx`
- Modify: `package.json`

- [ ] **Step 1: Remove `view-history.tsx`**

```bash
rm src/view-history.tsx
```

- [ ] **Step 2: Update the Solar Production command and remove `view-history` from `package.json`**

In `package.json`, update the Solar Production command entry:

```json
{
  "name": "view-solar-production",
  "title": "Solar Production",
  "subtitle": "Tesla Energy",
  "description": "View solar production, Powerwall, home consumption, and grid data by time period",
  "mode": "view"
}
```

Then remove the `view-history` command block entirely:

```json
{
  "name": "view-history",
  "title": "View Energy History",
  "subtitle": "Tesla Energy",
  "description": "View historical solar production and energy usage",
  "mode": "view"
}
```

- [ ] **Step 3: Build to verify nothing broke**

```bash
npm run build
```

Expected: `ready - built extension successfully`

- [ ] **Step 4: Commit**

```bash
git add package.json
git rm src/view-history.tsx
git commit -m "chore: remove view-history command (absorbed into Solar Production)"
```

---

## Task 5: Add period dropdown to the Detail view

The `Detail` component doesn't support a native dropdown. The period selector is currently in the `ActionPanel`. To improve discoverability, add a `List.Dropdown`-style experience by noting the current period in the markdown heading.

- [ ] **Step 1: Add period label to the markdown heading**

In `view-solar-production.tsx`, update `chartsMarkdown` to prepend a heading:

```typescript
const periodLabel = PERIOD_LABELS[period];
const chartsMarkdown = hasData
  ? `## ${periodLabel}\n\n${buildCharts(entries, period)}`
  : `## ${periodLabel}\n\n_No data available for this period._`;
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/view-solar-production.tsx
git commit -m "feat: show current period label as markdown heading in Solar Production"
```

---

## Task 6: Inspect raw API response for vehicle fields

Per the investigation into whether `calendar_history` already returns vehicle charging fields under `energy_device_data` scope, add a temporary debug log and document the outcome.

- [ ] **Step 1: Add raw entry logging to `fetchEnergyHistory` in `tesla.ts`**

Add before the final `return` in `fetchEnergyHistory`:

```typescript
if (data.time_series.length > 0) {
  log.debug("calendar_history first entry (raw field inspection)", data.time_series[0]);
}
```

- [ ] **Step 2: Run dev, trigger Solar Production, check verbose logs**

```bash
npm run dev
```

Enable verbose logging in Raycast preferences, open Solar Production, inspect the `[Tesla] calendar_history first entry` log. Look for any `vehicle_*` fields not currently in `EnergyHistoryEntry`.

- [ ] **Step 3: Update `TODO.md` Vehicle Field Investigation section with findings, then decide:**

- **If `vehicle_*` fields ARE present** → update `TODO.md` noting field names; mark "Vehicle charging chart" as doable without scope expansion; leave it in Future Work.
- **If `vehicle_*` fields are NOT present** → update `TODO.md` noting scope expansion would be required; mark "Vehicle charging chart" in Future Work accordingly.

Either way this task is done once `TODO.md` is updated.

- [ ] **Step 4: Remove the debug log from `tesla.ts`**

- [ ] **Step 5: Commit**

```bash
git add src/tesla.ts TODO.md
git commit -m "chore: inspect calendar_history fields for vehicle data; update TODO"
```

---

## Task 7: Update docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `TODO.md`

- [ ] **Step 1: Update `CLAUDE.md` commands section**

Replace the commands section to reflect:
- `view-solar-production` — unified chart dashboard, period dropdown (Today/Past 7 Days/Past 30 Days/Past Year), SVG charts in markdown pane, totals in metadata sidebar
- `menu-bar-status` — live data only (unchanged)
- Remove `view-history` entry

- [ ] **Step 2: Mark all TODO.md items complete, add future work notes**

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md TODO.md
git commit -m "docs: update CLAUDE.md and TODO.md after Solar Production redesign"
```

---

## Future Work (not in this plan)

- **Vehicle charging chart:** Inspect raw `calendar_history` response (Task 6) to confirm whether `vehicle_*` fields are already returned under `energy_device_data` scope. If present, add a 5th chart panel and `EnergyHistoryEntry` fields at no additional API cost.
- **Caching / request deduplication:** All three commands currently make independent API calls on initialization.
- **Live data overlay on day chart:** Show current power as a dot/marker on the area chart.
- **Calendar-aligned date ranges:** Replace rolling windows with true calendar week/month if user preference warrants it.
