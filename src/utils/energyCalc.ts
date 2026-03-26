import type { EnergyHistoryEntry } from "../tesla";

export type Period = "day" | "week" | "month" | "year";

/**
 * Formats a Date as a local datetime string with timezone offset:
 * "2026-03-26T00:00:00+07:00" — the format Tesla's calendar_history API requires.
 * Using UTC ISO strings causes a 400 parse error; bare YYYY-MM-DD also fails.
 */
function toLocalISOString(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMin);
  const oh = String(Math.floor(absOffset / 60)).padStart(2, "0");
  const om = String(absOffset % 60).padStart(2, "0");
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${sign}${oh}:${om}`;
}

export function getDateRange(period: Period): { startDate: string; endDate: string } {
  const now = new Date();
  let start: Date;

  switch (period) {
    case "day":
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      break;
    case "week":
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    case "month":
      start = new Date(now);
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      break;
    case "year":
      start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
      break;
  }

  return { startDate: toLocalISOString(start), endDate: toLocalISOString(now) };
}

export function formatEnergy(wh: number): string {
  const abs = Math.abs(wh);
  if (abs >= 1_000_000) return `${(wh / 1_000_000).toFixed(1)} MWh`;
  if (abs >= 1_000) return `${(wh / 1_000).toFixed(1)} kWh`;
  return `${Math.round(wh)} Wh`;
}

export function formatPower(watts: number): string {
  if (Math.abs(watts) >= 1000) return `${(watts / 1000).toFixed(1)} kW`;
  return `${Math.round(watts)} W`;
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

// --- Aggregation helpers (totals across all entries) ---

// Note: solar-to-battery flow (battery_energy_imported_from_solar) is counted in both
// totalSolarGenerated (as part of total solar produced) and totalBatteryCharged (as part
// of total energy stored). This is intentional — the two totals measure different flows —
// but means the sidebar numbers will not sum to a single total without accounting for this.
export function totalSolarGenerated(entries: EnergyHistoryEntry[]): number {
  return entries.reduce(
    (sum, e) =>
      sum + e.solar_energy_exported + e.consumer_energy_imported_from_solar + e.battery_energy_imported_from_solar,
    0,
  );
}

export function totalHomeUsed(entries: EnergyHistoryEntry[]): number {
  return entries.reduce(
    (sum, e) =>
      sum +
      e.consumer_energy_imported_from_solar +
      e.consumer_energy_imported_from_battery +
      e.consumer_energy_imported_from_grid,
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
  return entries.map(
    (e) => e.solar_energy_exported + e.consumer_energy_imported_from_solar + e.battery_energy_imported_from_solar,
  );
}

export function homePoints(entries: EnergyHistoryEntry[]): number[] {
  return entries.map(
    (e) =>
      e.consumer_energy_imported_from_solar +
      e.consumer_energy_imported_from_battery +
      e.consumer_energy_imported_from_grid,
  );
}

export function batteryPoints(entries: EnergyHistoryEntry[]): number[] {
  // Positive = discharging, negative = charging
  return entries.map(
    (e) => e.battery_energy_exported - (e.battery_energy_imported_from_solar + e.battery_energy_imported_from_grid),
  );
}

export function gridPoints(entries: EnergyHistoryEntry[]): number[] {
  // Positive = importing from grid, negative = exporting to grid
  return entries.map(
    (e) => e.grid_energy_imported - (e.grid_energy_exported_from_solar + e.grid_energy_exported_from_battery),
  );
}

/**
 * Aggregates sub-hourly or hourly entries into daily buckets.
 * Used for week/month period views where Tesla returns fine-grained data.
 * The bucket key is the local date string (YYYY-MM-DD) derived from the timestamp.
 */
export function aggregateByDay(entries: EnergyHistoryEntry[]): EnergyHistoryEntry[] {
  const buckets = new Map<string, EnergyHistoryEntry>();
  for (const e of entries) {
    const key = e.timestamp.slice(0, 10); // "YYYY-MM-DD"
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, { ...e });
    } else {
      existing.solar_energy_exported += e.solar_energy_exported;
      existing.grid_energy_imported += e.grid_energy_imported;
      existing.grid_energy_exported_from_solar += e.grid_energy_exported_from_solar;
      existing.grid_energy_exported_from_battery += e.grid_energy_exported_from_battery;
      existing.battery_energy_exported += e.battery_energy_exported;
      existing.battery_energy_imported_from_grid += e.battery_energy_imported_from_grid;
      existing.battery_energy_imported_from_solar += e.battery_energy_imported_from_solar;
      existing.consumer_energy_imported_from_grid += e.consumer_energy_imported_from_grid;
      existing.consumer_energy_imported_from_solar += e.consumer_energy_imported_from_solar;
      existing.consumer_energy_imported_from_battery += e.consumer_energy_imported_from_battery;
    }
  }
  return Array.from(buckets.values());
}

/**
 * Filters out entries with future timestamps.
 * The Tesla API returns monthly buckets for the full upcoming year in "year" period queries,
 * resulting in all-zero entries for months that haven't occurred yet.
 * Apply this before passing year-period data to chart functions.
 */
export function filterFutureEntries(entries: EnergyHistoryEntry[]): EnergyHistoryEntry[] {
  const now = new Date();
  return entries.filter((e) => new Date(e.timestamp) <= now);
}
