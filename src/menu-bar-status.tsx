import { Color, Icon, MenuBarExtra, openCommandPreferences, showHUD } from "@raycast/api";
import { useCachedPromise, withAccessToken } from "@raycast/utils";
import { provider, getToken, fetchEnergySites, fetchLiveStatus } from "./tesla";
import { formatPower } from "./utils/energyCalc";

const SUN_ICON = { source: Icon.Sun, tintColor: Color.Yellow };

function batteryTitle(batteryPower: number): string {
  if (batteryPower > 50) return `Discharging: ${formatPower(batteryPower)}`;
  if (batteryPower < -50) return `Charging: ${formatPower(Math.abs(batteryPower))}`;
  return "Standby";
}

function gridTitle(gridPower: number): string {
  if (gridPower > 50) return `Importing: ${formatPower(gridPower)}`;
  if (gridPower < -50) return `Exporting: ${formatPower(Math.abs(gridPower))}`;
  return "Idle";
}

function gridTintColor(gridPower: number): Color {
  if (gridPower > 50) return Color.Orange;
  if (gridPower < -50) return Color.Green;
  return Color.SecondaryText;
}

function Command() {
  const token = getToken();

  const {
    data: status,
    isLoading,
    revalidate,
  } = useCachedPromise(
    async (t: string) => {
      const sites = await fetchEnergySites(t);
      if (sites.length === 0) return null;
      return fetchLiveStatus(t, sites[0].energy_site_id);
    },
    [token],
    { keepPreviousData: true },
  );

  const solarPower = status?.solar_power ?? 0;
  const isProducing = solarPower > 50;
  const title = isProducing ? formatPower(solarPower) : "—";
  const icon = isProducing ? SUN_ICON : { source: Icon.Moon, tintColor: Color.SecondaryText };

  return (
    <MenuBarExtra icon={icon} title={title} isLoading={isLoading}>
      {status && (
        <>
          <MenuBarExtra.Section title="Solar">
            <MenuBarExtra.Item icon={SUN_ICON} title={`Production: ${formatPower(status.solar_power)}`} onAction={() => {}} />
          </MenuBarExtra.Section>
          <MenuBarExtra.Section title="Powerwall">
            <MenuBarExtra.Item
              icon={{ source: Icon.Battery, tintColor: status.percentage_charged > 20 ? Color.Green : Color.Red }}
              title={`Charge: ${Math.round(status.percentage_charged)}%`}
              onAction={() => {}}
            />
            <MenuBarExtra.Item icon={Icon.BatteryCharging} title={batteryTitle(status.battery_power)} onAction={() => {}} />
          </MenuBarExtra.Section>
          <MenuBarExtra.Section title="Grid">
            <MenuBarExtra.Item
              icon={{ source: Icon.Signal3, tintColor: gridTintColor(status.grid_power) }}
              title={gridTitle(status.grid_power)}
              onAction={() => {}}
            />
          </MenuBarExtra.Section>
          <MenuBarExtra.Section title="Home">
            <MenuBarExtra.Item
              icon={{ source: Icon.House, tintColor: Color.Blue }}
              title={`Consumption: ${formatPower(status.load_power)}`}
              onAction={() => {}}
            />
          </MenuBarExtra.Section>
          <MenuBarExtra.Section>
            <MenuBarExtra.Item
              title="Refresh"
              icon={Icon.ArrowClockwise}
              onAction={async () => {
                await revalidate();
                await showHUD("Solar status refreshed");
              }}
            />
            <MenuBarExtra.Item title="Configure" icon={Icon.Gear} onAction={openCommandPreferences} />
          </MenuBarExtra.Section>
        </>
      )}
    </MenuBarExtra>
  );
}

export default withAccessToken(provider)(Command);
