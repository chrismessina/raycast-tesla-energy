import { OAuth } from "@raycast/api";
import { OAuthService, getAccessToken } from "@raycast/utils";
import { Logger } from "@chrismessina/raycast-logger";
import type { Period } from "./utils/energyCalc";

// --- Configuration ---

const API_BASE = "https://fleet-api.prd.na.vn.cloud.tesla.com";

// --- Logger ---

const log = new Logger({
  prefix: "[Tesla]",
  showTimestamp: true,
  enableRedaction: true,
});

// --- OAuth via Raycast PKCE Proxy ---

const client = new OAuth.PKCEClient({
  redirectMethod: OAuth.RedirectMethod.Web,
  providerName: "Tesla",
  providerIcon: "extension-icon.png",
  providerId: "tesla",
  description: "Connect your Tesla account to view solar and Powerwall data",
});

export const provider = new OAuthService({
  client,
  clientId: "9208d53e-8e05-4696-addb-fff21987364a",
  authorizeUrl:
    "https://oauth.raycast.com/v1/authorize/iJYj_0c8sxOGHvexNi0qXCRaBHscvub2yLI7kZMyK4Ky2u5iV3xTuVTNE3LW-0ex07VjFpdLEVEoLB1yD2XlGoVYz8ph_4UjUroi4j4MNVYmvTQeIOZC5HZqR-FFWYliFhI",
  tokenUrl:
    "https://oauth.raycast.com/v1/token/p7q14_mMGdFpROFDg19bzNg2blC7PT5i4a6ngcQP9vOfa6PV5udRzR_zvXopGW1U1u9IVw-BweEiW1oOV7L9yOd8buGsNoPdJMf4wyhZ2A6fStxe1I66z_FOpZwt4Q",
  refreshTokenUrl:
    "https://oauth.raycast.com/v1/refresh-token/xG23f3tmUA9zNOewrzh164GX_4cZ1FzUAmVD1kt9YLigM2OcdKeMPh78YwDZKuXNPM3ipD-BDuQXC_6mo7qPe7MPpX4u701JXxhPoAjx9yjLxf-_3IStAzrpwVHSzA",
  scope: "openid offline_access energy_device_data",
  extraParameters: { audience: API_BASE },
});

// --- Helper ---

let tokenLogged = false;

function decodeJwtClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return { error: "failed to decode JWT" };
  }
}

export function getToken(): string {
  const { token } = getAccessToken();
  if (!tokenLogged) {
    tokenLogged = true;
    const claims = decodeJwtClaims(token);
    log.debug("Access token retrieved", {
      tokenLength: token.length,
      aud: claims["aud"],
      iss: claims["iss"],
      scope: claims["scp"] ?? claims["scope"],
      exp: claims["exp"] ? new Date((claims["exp"] as number) * 1000).toISOString() : undefined,
    });
  }
  return token;
}

// --- API Types ---

export interface EnergySite {
  energy_site_id: number;
  resource_type: string;
  site_name: string;
  id: string;
}

export interface LiveStatus {
  solar_power: number;
  battery_power: number;
  grid_power: number;
  load_power: number;
  percentage_charged: number;
  total_pack_energy: number;
  energy_left: number;
  storm_mode_active: boolean;
  backup_capable: boolean;
  grid_status: string;
  island_status: string;
  timestamp: string;
}

export interface EnergyHistoryEntry {
  timestamp: string;
  solar_energy_exported: number;
  grid_energy_imported: number;
  grid_energy_exported_from_solar: number;
  grid_energy_exported_from_battery: number;
  battery_energy_exported: number;
  battery_energy_imported_from_grid: number;
  battery_energy_imported_from_solar: number;
  consumer_energy_imported_from_grid: number;
  consumer_energy_imported_from_solar: number;
  consumer_energy_imported_from_battery: number;
}

export interface SiteInfo {
  site_name: string;
  time_zone_offset: number;
  installation_time_zone: string;
  components: {
    solar: boolean;
    solar_type: string;
    battery: boolean;
    battery_count?: number;
    grid: boolean;
    load_meter: boolean;
    wall_connectors: unknown[];
  };
  backup_reserve_percent: number;
  default_real_mode: string;
}

export interface SelfConsumption {
  /** Percentage of home consumption powered by solar (0–100) */
  solar: number;
  /** Percentage of home consumption powered by Powerwall battery (0–100) */
  battery: number;
}

// --- API Functions ---

const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const pathWithoutQuery = path.split("?")[0];
  const done = log.time(`GET ${pathWithoutQuery}`);

  log.debug("API request", { method: "GET", url });

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const text = await response.text();
    log.error("API request failed", { status: response.status, path, response: text });
    done({ status: response.status });
    throw new Error(`Tesla API error (${response.status}): ${text}`);
  }

  const data = await response.json();
  log.debug("API response", { status: response.status, path });
  done({ status: response.status });
  return data.response as T;
}

export async function fetchEnergySites(token: string): Promise<EnergySite[]> {
  log.step(1, "Fetching energy sites");
  const products = await apiFetch<unknown[]>("/api/1/products", token);
  const sites = products.filter((p): p is EnergySite => typeof p === "object" && p !== null && "energy_site_id" in p);
  log.info("Found energy sites", {
    count: sites.length,
    sites: sites.map((s) => ({ id: s.energy_site_id, name: s.site_name })),
  });
  return sites;
}

export async function fetchLiveStatus(token: string, siteId: number): Promise<LiveStatus> {
  log.step(2, "Fetching live status", { siteId });
  const status = await apiFetch<LiveStatus>(`/api/1/energy_sites/${siteId}/live_status`, token);
  log.info("Live status", {
    solar: `${status.solar_power}W`,
    battery: `${status.percentage_charged}%`,
    grid: `${status.grid_power}W`,
    load: `${status.load_power}W`,
  });
  return status;
}

export async function fetchSiteInfo(token: string, siteId: number): Promise<SiteInfo> {
  log.step(2, "Fetching site info", { siteId });
  return apiFetch<SiteInfo>(`/api/1/energy_sites/${siteId}/site_info`, token);
}

export async function fetchSelfConsumption(
  token: string,
  siteId: number,
  period: Period,
  startDate: string,
  endDate: string,
): Promise<SelfConsumption | null> {
  const params = new URLSearchParams({
    kind: "self_consumption",
    period,
    start_date: startDate,
    end_date: endDate,
    time_zone: LOCAL_TZ,
  });
  const data = await apiFetch<{ time_series: SelfConsumption[] }>(
    `/api/1/energy_sites/${siteId}/calendar_history?${params}`,
    token,
  );
  return data.time_series?.[0] ?? null;
}

export async function fetchEnergyHistory(
  token: string,
  siteId: number,
  period: Period,
  startDate: string,
  endDate: string,
): Promise<EnergyHistoryEntry[]> {
  log.step(1, "Fetching energy history", { siteId, period, startDate, endDate });
  // Map display period to API granularity: year uses monthly buckets, others use daily.
  const apiPeriod = period === "year" ? "month" : "week";
  const params = new URLSearchParams({
    kind: "energy",
    period: apiPeriod,
    start_date: startDate,
    end_date: endDate,
    time_zone: LOCAL_TZ,
  });
  const data = await apiFetch<{ time_series: EnergyHistoryEntry[] }>(
    `/api/1/energy_sites/${siteId}/calendar_history?${params}`,
    token,
  );
  log.info("Energy history loaded", { entries: data.time_series.length, period });
  return data.time_series;
}
