export interface ChartOptions {
  width?: number; // default: 500
  height?: number; // default: 120
  fillOpacity?: number; // default: 0.6
  gridlineColor?: string; // caller resolves: "#555555" dark, "#AAAAAA" light
}

function escSvg(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

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

  if (n === 1) {
    const y = height - (points[0] / max) * (height - 4);
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
      `  <line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${escSvg(color)}" stroke-width="1.5"/>`,
      `</svg>`,
    ].join("\n");
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

  const gap = width / n;
  const barW = Math.max(1, Math.floor(gap * 0.85));
  const midY = height / 2;

  const bars = values
    .map((v, i) => {
      if (v <= 0) return "";
      const barH = Math.max(1, (v / max) * (height - 4));
      const x = Math.round(i * gap + (gap - barW) / 2);
      const y = height - barH;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${escSvg(color)}" rx="2"/>`;
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

  const gap = width / n;
  const barW = Math.max(1, Math.floor(gap * 0.85));

  const bars = values
    .map((v, i) => {
      if (v === 0) return "";
      const barH = Math.max(1, (Math.abs(v) / absMax) * (midY - 2));
      const x = Math.round(i * gap + (gap - barW) / 2);
      const color = v > 0 ? positiveColor : negativeColor;
      const y = v > 0 ? midY - barH : midY;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${escSvg(color)}" rx="2"/>`;
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
