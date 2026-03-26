export interface ChartOptions {
  width?: number; // default: 500
  height?: number; // default: 120
  fillOpacity?: number; // default: 0.6
  gridlineColor?: string; // caller resolves: "#555555" dark, "#AAAAAA" light
  labelColor?: string; // axis label color, default: "#888888"
  xLabels?: string[]; // optional x-axis labels (shown at bottom)
  peakLabel?: string; // optional y-axis peak label (shown top-right)
}

// Extra bottom padding when x-axis labels are present
const X_LABEL_HEIGHT = 14;

function escSvg(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Returns evenly-spaced indices for x-axis label placement.
 * Always includes index 0 and the last index, then fills in between.
 */
function pickLabelIndices(n: number, maxLabels: number): number[] {
  if (n <= 1) return [0];
  if (n <= maxLabels) return Array.from({ length: n }, (_, i) => i);
  const indices: number[] = [0];
  const step = (n - 1) / (maxLabels - 1);
  for (let i = 1; i < maxLabels - 1; i++) {
    indices.push(Math.round(i * step));
  }
  indices.push(n - 1);
  return indices;
}

/**
 * Renders a filled area chart with a smooth bezier curve.
 * Used for day-view Solar and Home charts.
 */
export function areaChart(points: number[], color: string, options: ChartOptions = {}): string {
  const {
    width = 500,
    fillOpacity = 0.6,
    gridlineColor = "#555555",
    labelColor = "#888888",
    xLabels,
    peakLabel,
  } = options;
  const hasLabels = xLabels && xLabels.length > 0;
  const chartHeight = (options.height ?? 120) - (hasLabels ? X_LABEL_HEIGHT : 0);
  const totalHeight = chartHeight + (hasLabels ? X_LABEL_HEIGHT : 0);
  const max = Math.max(...points, 1);
  const n = points.length;

  if (n === 0) {
    return toDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}"/>`);
  }

  if (n === 1) {
    const y = chartHeight - (points[0] / max) * (chartHeight - 4);
    return toDataUri(
      [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}">`,
        `  <line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${escSvg(color)}" stroke-width="1.5"/>`,
        `</svg>`,
      ].join("\n"),
    );
  }

  const xs = points.map((_, i) => (i / (n - 1)) * width);
  const ys = points.map((v) => chartHeight - (v / max) * (chartHeight - 4));

  let d = `M ${xs[0]},${ys[0]}`;
  for (let i = 1; i < n; i++) {
    const cpx1 = xs[i - 1] + (xs[i] - xs[i - 1]) / 3;
    const cpy1 = ys[i - 1];
    const cpx2 = xs[i] - (xs[i] - xs[i - 1]) / 3;
    const cpy2 = ys[i];
    d += ` C ${cpx1},${cpy1} ${cpx2},${cpy2} ${xs[i]},${ys[i]}`;
  }

  const fillPath = `${d} L ${xs[n - 1]},${chartHeight} L ${xs[0]},${chartHeight} Z`;
  const midY = chartHeight / 2;

  const labelEls: string[] = [];
  if (hasLabels) {
    const indices = pickLabelIndices(n, 6);
    for (const idx of indices) {
      if (xLabels[idx]) {
        const lx = Math.round(xs[idx]);
        const anchor = idx === 0 ? "start" : idx === n - 1 ? "end" : "middle";
        labelEls.push(
          `  <text x="${lx}" y="${totalHeight - 2}" font-size="9" fill="${escSvg(labelColor)}" text-anchor="${anchor}" font-family="sans-serif">${escSvg(xLabels[idx])}</text>`,
        );
      }
    }
  }

  const peakEl = peakLabel
    ? `  <text x="${width - 2}" y="10" font-size="9" fill="${escSvg(labelColor)}" text-anchor="end" font-family="sans-serif">${escSvg(peakLabel)}</text>`
    : "";

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}">`,
    `  <line x1="0" y1="${midY}" x2="${width}" y2="${midY}" stroke="${escSvg(gridlineColor)}" stroke-width="1" stroke-dasharray="4,4" opacity="0.4"/>`,
    `  <path d="${fillPath}" fill="${escSvg(color)}" fill-opacity="${fillOpacity}"/>`,
    `  <path d="${d}" fill="none" stroke="${escSvg(color)}" stroke-width="1.5"/>`,
    peakEl,
    ...labelEls,
    `</svg>`,
  ].join("\n");

  return toDataUri(svg);
}

/**
 * Renders a vertical bar chart with baseline at bottom.
 * Used for week/month/year Solar and Home charts.
 */
export function barChart(values: number[], color: string, options: ChartOptions = {}): string {
  const { width = 500, gridlineColor = "#555555", labelColor = "#888888", xLabels, peakLabel } = options;
  const hasLabels = xLabels && xLabels.length > 0;
  const chartHeight = (options.height ?? 120) - (hasLabels ? X_LABEL_HEIGHT : 0);
  const totalHeight = chartHeight + (hasLabels ? X_LABEL_HEIGHT : 0);
  const max = Math.max(...values, 1);
  const n = values.length;

  if (n === 0) {
    return toDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}"/>`);
  }

  const gap = width / n;
  const barW = Math.max(1, Math.floor(gap * 0.85));
  const midY = chartHeight / 2;

  const bars = values
    .map((v, i) => {
      if (v <= 0) return "";
      const barH = Math.max(1, (v / max) * (chartHeight - 4));
      const x = Math.round(i * gap + (gap - barW) / 2);
      const y = chartHeight - barH;
      return `  <rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${escSvg(color)}" rx="2"/>`;
    })
    .join("\n");

  const labelEls: string[] = [];
  if (hasLabels) {
    const indices = pickLabelIndices(n, 7);
    for (const idx of indices) {
      if (xLabels[idx]) {
        const lx = Math.round(idx * gap + gap / 2);
        const anchor = idx === 0 ? "start" : idx === n - 1 ? "end" : "middle";
        labelEls.push(
          `  <text x="${lx}" y="${totalHeight - 2}" font-size="9" fill="${escSvg(labelColor)}" text-anchor="${anchor}" font-family="sans-serif">${escSvg(xLabels[idx])}</text>`,
        );
      }
    }
  }

  const peakEl = peakLabel
    ? `  <text x="${width - 2}" y="10" font-size="9" fill="${escSvg(labelColor)}" text-anchor="end" font-family="sans-serif">${escSvg(peakLabel)}</text>`
    : "";

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}">`,
    `  <line x1="0" y1="${midY}" x2="${width}" y2="${midY}" stroke="${escSvg(gridlineColor)}" stroke-width="1" stroke-dasharray="4,4" opacity="0.4"/>`,
    bars,
    peakEl,
    ...labelEls,
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
  const { width = 500, gridlineColor = "#555555", labelColor = "#888888", xLabels, peakLabel } = options;
  const hasLabels = xLabels && xLabels.length > 0;
  const chartHeight = (options.height ?? 120) - (hasLabels ? X_LABEL_HEIGHT : 0);
  const totalHeight = chartHeight + (hasLabels ? X_LABEL_HEIGHT : 0);
  const absMax = Math.max(...values.map(Math.abs), 1);
  const n = values.length;
  const midY = chartHeight / 2;

  if (n === 0) {
    return toDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}"/>`);
  }

  const gap = width / n;
  const barW = Math.max(1, Math.floor(gap * 0.85));

  const bars = values
    .map((v, i) => {
      if (v === 0) return "";
      const barH = Math.max(1, (Math.abs(v) / absMax) * (midY - 2));
      const x = Math.round(i * gap + (gap - barW) / 2);
      const barColor = v > 0 ? positiveColor : negativeColor;
      const y = v > 0 ? midY - barH : midY;
      return `  <rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${escSvg(barColor)}" rx="2"/>`;
    })
    .join("\n");

  const labelEls: string[] = [];
  if (hasLabels) {
    const indices = pickLabelIndices(n, 7);
    for (const idx of indices) {
      if (xLabels[idx]) {
        const lx = Math.round(idx * gap + gap / 2);
        const anchor = idx === 0 ? "start" : idx === n - 1 ? "end" : "middle";
        labelEls.push(
          `  <text x="${lx}" y="${totalHeight - 2}" font-size="9" fill="${escSvg(labelColor)}" text-anchor="${anchor}" font-family="sans-serif">${escSvg(xLabels[idx])}</text>`,
        );
      }
    }
  }

  const peakEl = peakLabel
    ? `  <text x="${width - 2}" y="10" font-size="9" fill="${escSvg(labelColor)}" text-anchor="end" font-family="sans-serif">${escSvg(peakLabel)}</text>`
    : "";

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}">`,
    `  <line x1="0" y1="${midY}" x2="${width}" y2="${midY}" stroke="${escSvg(gridlineColor)}" stroke-width="1" opacity="0.6"/>`,
    bars,
    peakEl,
    ...labelEls,
    `</svg>`,
  ].join("\n");

  return toDataUri(svg);
}
