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
      // Rolling 30-day window — spec mandates rolling windows throughout.
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

// --- Aggregation helpers (totals across all entries) ---

// Note: solar-to-battery flow (battery_energy_imported_from_solar) is counted in both
// totalSolarGenerated (as part of total solar produced) and totalBatteryCharged (as part
// of total energy stored). This is intentional — the two totals measure different flows —
// but means the sidebar numbers will not sum to a single total without accounting for this.
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
