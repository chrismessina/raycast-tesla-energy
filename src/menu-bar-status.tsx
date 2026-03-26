import { Color, Icon, MenuBarExtra, openCommandPreferences, showHUD } from "@raycast/api";
import { useCachedPromise, withAccessToken } from "@raycast/utils";
import { provider, getToken, fetchEnergySites, fetchLiveStatus } from "./tesla";

function formatPower(watts: number): string {
  if (Math.abs(watts) >= 1000) {
    return `${(watts / 1000).toFixed(1)} kW`;
  }
  return `${Math.round(watts)} W`;
}

function Command() {
  const token = getToken();

  const {
    data: status,
    isLoading,
    revalidate,
  } = useCachedPromise(
    async () => {
      const sites = await fetchEnergySites(token);
      if (sites.length === 0) return null;
      return fetchLiveStatus(token, sites[0].energy_site_id);
    },
    [],
    { keepPreviousData: true },
  );

  const solarPower = status?.solar_power ?? 0;
  const isProducing = solarPower > 50;
  const title = isProducing ? formatPower(solarPower) : "—";
  const icon = isProducing
    ? { source: Icon.Sun, tintColor: Color.Yellow }
    : { source: Icon.Moon, tintColor: Color.SecondaryText };

  return (
    <MenuBarExtra icon={icon} title={title} isLoading={isLoading}>
      {status && (
        <>
          <MenuBarExtra.Section title="Solar">
            <MenuBarExtra.Item
              icon={{ source: Icon.Sun, tintColor: Color.Yellow }}
              title={`Production: ${formatPower(status.solar_power)}`}
            />
          </MenuBarExtra.Section>
          <MenuBarExtra.Section title="Powerwall">
            <MenuBarExtra.Item
              icon={{ source: Icon.Battery, tintColor: status.percentage_charged > 20 ? Color.Green : Color.Red }}
              title={`Charge: ${Math.round(status.percentage_charged)}%`}
            />
            <MenuBarExtra.Item
              icon={Icon.BatteryCharging}
              title={
                status.battery_power > 50
                  ? `Discharging: ${formatPower(status.battery_power)}`
                  : status.battery_power < -50
                    ? `Charging: ${formatPower(Math.abs(status.battery_power))}`
                    : "Standby"
              }
            />
          </MenuBarExtra.Section>
          <MenuBarExtra.Section title="Grid">
            <MenuBarExtra.Item
              icon={{
                source: Icon.Signal3,
                tintColor:
                  status.grid_power > 50 ? Color.Orange : status.grid_power < -50 ? Color.Green : Color.SecondaryText,
              }}
              title={
                status.grid_power > 50
                  ? `Importing: ${formatPower(status.grid_power)}`
                  : status.grid_power < -50
                    ? `Exporting: ${formatPower(Math.abs(status.grid_power))}`
                    : "Idle"
              }
            />
          </MenuBarExtra.Section>
          <MenuBarExtra.Section title="Home">
            <MenuBarExtra.Item
              icon={{ source: Icon.House, tintColor: Color.Blue }}
              title={`Consumption: ${formatPower(status.load_power)}`}
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
