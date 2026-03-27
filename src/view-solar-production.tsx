import { Action, ActionPanel, Color, Detail, Icon, showToast, Toast, environment, Clipboard } from "@raycast/api";
import { withAccessToken } from "@raycast/utils";
import { useEffect, useRef, useState } from "react";
import {
  provider,
  getToken,
  fetchEnergySites,
  fetchEnergyHistory,
  fetchSiteInfo,
  fetchSelfConsumption,
  EnergyHistoryEntry,
  SiteInfo,
  SelfConsumption,
} from "./tesla";
import {
  Period,
  getDateRange,
  formatEnergy,
  aggregateToWeek,
  aggregateToMonth,
  aggregateToYear,
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
  week: "This Week",
  month: "This Month",
  year: "Year to Date",
};

function resolveColor(isDark: boolean, dark: string, light: string): string {
  return isDark ? dark : light;
}

function peakKwh(values: number[]): string {
  const max = Math.max(...values, 0);
  if (max === 0) return "";
  return formatEnergy(max);
}

function xLabelsForDay(entries: EnergyHistoryEntry[]): string[] {
  return entries.map((e) => new Date(e.timestamp).toLocaleTimeString(undefined, { hour: "numeric" }));
}

function buildCharts(entries: EnergyHistoryEntry[], period: Period): string {
  const isDark = environment.appearance === "dark";
  const gridlineColor = isDark ? "#555555" : "#AAAAAA";
  const labelColor = isDark ? "#CCCCCC" : "#555555";
  const opts = { width: 500, height: 134, gridlineColor, labelColor };

  const solarColor = resolveColor(isDark, "#C9A227", "#B8860B");
  const homeColor = resolveColor(isDark, "#7B68EE", "#6A5ACD");
  const batteryPos = resolveColor(isDark, "#30D158", "#248A3D");
  const batteryNeg = resolveColor(isDark, "#30D158", "#248A3D");
  const gridPos = resolveColor(isDark, "#AEAEB2", "#8E8E93");
  const gridNeg = resolveColor(isDark, "#5AC8FA", "#007AFF");

  if (period === "day") {
    const xLabels = xLabelsForDay(entries);
    const solar = solarPoints(entries);
    const home = homePoints(entries);
    const battery = batteryPoints(entries);
    const grid = gridPoints(entries);
    return [
      `### Solar\n\n![Solar](${areaChart(solar, solarColor, { ...opts, xLabels, peakLabel: peakKwh(solar) })})`,
      `### Home\n\n![Home](${areaChart(home, homeColor, { ...opts, xLabels, peakLabel: peakKwh(home) })})`,
      `### Powerwall\n\n![Powerwall](${biChart(battery, batteryPos, batteryNeg, { ...opts, xLabels, peakLabel: peakKwh(battery.map(Math.abs)) })})`,
      `### Grid\n\n![Grid](${biChart(grid, gridPos, gridNeg, { ...opts, xLabels, peakLabel: peakKwh(grid.map(Math.abs)) })})`,
    ].join("\n\n");
  }

  const { buckets, xLabels } =
    period === "week"
      ? aggregateToWeek(entries)
      : period === "month"
        ? aggregateToMonth(entries)
        : aggregateToYear(entries);

  const solar = solarPoints(buckets);
  const home = homePoints(buckets);
  const battery = batteryPoints(buckets);
  const grid = gridPoints(buckets);

  return [
    `### Solar\n\n![Solar](${barChart(solar, solarColor, { ...opts, xLabels, peakLabel: peakKwh(solar) })})`,
    `### Home\n\n![Home](${barChart(home, homeColor, { ...opts, xLabels, peakLabel: peakKwh(home) })})`,
    `### Powerwall\n\n![Powerwall](${biChart(battery, batteryPos, batteryNeg, { ...opts, xLabels, peakLabel: peakKwh(battery.map(Math.abs)) })})`,
    `### Grid\n\n![Grid](${biChart(grid, gridPos, gridNeg, { ...opts, xLabels, peakLabel: peakKwh(grid.map(Math.abs)) })})`,
  ].join("\n\n");
}

function powerwallLabel(siteInfo: SiteInfo | null): string {
  const count = siteInfo?.components?.battery_count;
  if (!count || count <= 0) return "Powerwall";
  return `Powerwall ${count}x`;
}

function Command() {
  const token = getToken();
  const siteIdRef = useRef<number | null>(null);
  const [entries, setEntries] = useState<EnergyHistoryEntry[]>([]);
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [selfConsumption, setSelfConsumption] = useState<SelfConsumption | null>(null);
  const [period, setPeriod] = useState<Period>("day");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function resolveSiteId(): Promise<number | null> {
    if (siteIdRef.current !== null) return siteIdRef.current;
    const sites = await fetchEnergySites(token);
    if (sites.length === 0) return null;
    siteIdRef.current = sites[0].energy_site_id;
    return siteIdRef.current;
  }

  async function loadData(p: Period) {
    try {
      setIsLoading(true);
      setError(null);

      const siteId = await resolveSiteId();
      if (siteId === null) {
        setError("No Tesla energy sites found on your account.");
        return;
      }

      const { startDate, endDate } = getDateRange(p);

      const [historyData, info, sc] = await Promise.all([
        fetchEnergyHistory(token, siteId, p, startDate, endDate),
        siteInfo === null ? fetchSiteInfo(token, siteId) : Promise.resolve(siteInfo),
        fetchSelfConsumption(token, siteId, p, startDate, endDate),
      ]);

      setEntries(historyData);
      setSelfConsumption(sc);
      if (siteInfo === null) setSiteInfo(info);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(message);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to load data",
        message,
        primaryAction: {
          title: "Copy Error",
          onAction: () => Clipboard.copy(message),
        },
      });
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
            <Action
              title="Copy Error"
              icon={Icon.Clipboard}
              shortcut={{ modifiers: ["cmd"], key: "c" }}
              onAction={() => Clipboard.copy(error)}
            />
          </ActionPanel>
        }
      />
    );
  }

  const hasData = entries.length > 0;
  const periodLabel = PERIOD_LABELS[period];
  const pwLabel = powerwallLabel(siteInfo);
  const chartsMarkdown = isLoading
    ? ""
    : hasData
      ? `## ${periodLabel}\n\n${buildCharts(entries, period)}`
      : `## ${periodLabel}\n\n_No data available for this period._`;

  return (
    <Detail
      isLoading={isLoading}
      markdown={chartsMarkdown}
      metadata={
        hasData ? (
          <Detail.Metadata>
            {selfConsumption && (
              <>
                <Detail.Metadata.Label
                  title="Self-Powered"
                  text={`${selfConsumption.solar + selfConsumption.battery}%`}
                  icon={{ source: Icon.Leaf, tintColor: Color.Green }}
                />
                <Detail.Metadata.Label title="☀️ Solar" text={`${selfConsumption.solar}%`} />
                <Detail.Metadata.Label title="🔋 Powerwall" text={`${selfConsumption.battery}%`} />
                <Detail.Metadata.Label
                  title="⚡ Grid"
                  text={`${100 - selfConsumption.solar - selfConsumption.battery}%`}
                />
                <Detail.Metadata.Separator />
              </>
            )}
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
              title={`${pwLabel} Discharged`}
              text={formatEnergy(totalBatteryDischarged(entries))}
              icon={{ source: Icon.Battery, tintColor: Color.Green }}
            />
            <Detail.Metadata.Label
              title={`${pwLabel} Charged`}
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
            <Action title="This Week" onAction={() => setPeriod("week")} />
            <Action title="This Month" onAction={() => setPeriod("month")} />
            <Action title="Year to Date" onAction={() => setPeriod("year")} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

export default withAccessToken(provider)(Command);
