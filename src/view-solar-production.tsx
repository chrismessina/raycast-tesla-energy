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
  const periodLabel = PERIOD_LABELS[period];
  const chartsMarkdown = hasData
    ? `## ${periodLabel}\n\n${buildCharts(entries, period)}`
    : `## ${periodLabel}\n\n_No data available for this period._`;

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
            <Detail.Metadata.Label title="Period" text={periodLabel} />
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
