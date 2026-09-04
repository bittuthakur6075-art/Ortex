import { useEffect, useState } from "react"
import ReactApexChart from "react-apexcharts"

/* ============================================================
   Theme-aware ApexCharts wrappers for the Admin dashboards.

   Colors are read live from the CSS custom properties (--primary,
   --success, …) so charts track the app's light/dark theme, and a
   MutationObserver on <html class> re-renders on theme toggle.
   ============================================================ */

// Tailwind palette hexes for the semantic accents the dashboards use.
export const CHART_COLORS = {
  emerald: "#10b981",
  amber: "#f59e0b",
  blue: "#3b82f6",
  violet: "#8b5cf6",
  orange: "#f97316",
  rose: "#f43f5e",
  red: "#ef4444",
  slate: "#64748b",
}

function cssHsl(name, alpha) {
  if (typeof window === "undefined") return ""
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!v) return ""
  return alpha != null ? `hsl(${v} / ${alpha})` : `hsl(${v})`
}

/** Re-render on theme (html.class) change so chart colors update live. */
function useTheme() {
  const [, force] = useState(0)
  useEffect(() => {
    const obs = new MutationObserver(() => force((n) => n + 1))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => obs.disconnect()
  }, [])
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  return {
    dark,
    primary: cssHsl("--primary") || "#3f57e0",
    accent: cssHsl("--accent") || "#8b5cf6",
    success: cssHsl("--success") || "#16a34a",
    foreColor: cssHsl("--muted-foreground") || "#6b7280",
    border: cssHsl("--border") || "#e5e7eb",
  }
}

/** Shared base options merged into every chart. */
function baseOptions(t) {
  return {
    chart: {
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily: "inherit",
      foreColor: t.foreColor,
      animations: { enabled: true, speed: 450, easing: "easeinout" },
      parentHeightOffset: 0,
    },
    grid: {
      borderColor: t.border,
      strokeDashArray: 4,
      padding: { left: 4, right: 8, top: 0, bottom: 0 },
    },
    dataLabels: { enabled: false },
    legend: {
      position: "bottom",
      horizontalAlign: "left",
      fontSize: "12px",
      markers: { width: 9, height: 9, radius: 3 },
      itemMargin: { horizontal: 10, vertical: 4 },
      labels: { colors: t.foreColor },
    },
    tooltip: { theme: t.dark ? "dark" : "light", style: { fontSize: "12px" } },
    states: { hover: { filter: { type: "lighten", value: 0.08 } } },
    stroke: { curve: "smooth", lineCap: "round" },
  }
}

function deepMerge(a, b) {
  const out = { ...a }
  for (const k of Object.keys(b || {})) {
    if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && typeof a[k] === "object") {
      out[k] = deepMerge(a[k], b[k])
    } else {
      out[k] = b[k]
    }
  }
  return out
}

/** Low-level wrapper: type + series + options (merged onto the themed base). */
export function ApexChart({ type = "bar", series, options = {}, height = 240 }) {
  const t = useTheme()
  const merged = deepMerge(baseOptions(t), options)
  return <ReactApexChart type={type} series={series} options={merged} height={height} />
}

/**
 * Horizontal bars. `series` is [{ name, data }] (usually one). `distributed`
 * paints each bar its own color from `colors`. `valueFormatter` styles the
 * axis + tooltip values (e.g. currency).
 */
export function BarChart({
  categories,
  series,
  colors,
  height = 240,
  distributed = false,
  valueFormatter,
  barHeight = "62%",
}) {
  const t = useTheme()
  const fmt = valueFormatter || ((v) => v)
  return (
    <ApexChart
      type="bar"
      height={height}
      series={series}
      options={{
        colors: colors || [t.primary],
        plotOptions: {
          bar: { horizontal: true, distributed, borderRadius: 5, borderRadiusApplication: "end", barHeight },
        },
        xaxis: {
          categories,
          labels: { formatter: (v) => fmt(v), style: { fontSize: "11px" } },
          axisBorder: { show: false },
          axisTicks: { show: false },
        },
        yaxis: { labels: { style: { fontSize: "12px" } } },
        legend: { show: false },
        tooltip: { y: { formatter: (v) => fmt(v) } },
      }}
    />
  )
}

/** Grouped / stacked vertical columns. `series` is [{ name, data }, …]. */
export function ColumnChart({
  categories,
  series,
  colors,
  height = 240,
  stacked = false,
  valueFormatter,
  columnWidth = "55%",
}) {
  const t = useTheme()
  const fmt = valueFormatter || ((v) => v)
  return (
    <ApexChart
      type="bar"
      height={height}
      series={series}
      options={{
        colors: colors || [t.primary, CHART_COLORS.emerald],
        chart: { stacked },
        plotOptions: { bar: { horizontal: false, borderRadius: 5, borderRadiusApplication: "end", columnWidth } },
        xaxis: {
          categories,
          labels: { style: { fontSize: "11px" } },
          axisBorder: { show: false },
          axisTicks: { show: false },
        },
        yaxis: { labels: { formatter: (v) => fmt(v), style: { fontSize: "11px" } } },
        legend: { show: series.length > 1 },
        tooltip: { y: { formatter: (v) => fmt(v) } },
      }}
    />
  )
}

/** Smooth gradient area — Minimal-style trend chart. `series` is [{ name, data }, …]. */
export function AreaChart({ categories, series, colors, height = 240, valueFormatter }) {
  const t = useTheme()
  const fmt = valueFormatter || ((v) => v)
  return (
    <ApexChart
      type="area"
      height={height}
      series={series}
      options={{
        colors: colors || [t.primary, CHART_COLORS.emerald],
        stroke: { curve: "smooth", width: 2, lineCap: "round" },
        fill: {
          type: "gradient",
          gradient: { shadeIntensity: 1, opacityFrom: 0.38, opacityTo: 0.03, stops: [0, 92, 100] },
        },
        markers: { size: 0, strokeWidth: 0, hover: { size: 5 } },
        xaxis: {
          categories,
          labels: { style: { fontSize: "11px" } },
          axisBorder: { show: false },
          axisTicks: { show: false },
          tooltip: { enabled: false },
        },
        yaxis: { labels: { formatter: (v) => fmt(v), style: { fontSize: "11px" } } },
        legend: { show: series.length > 1 },
        tooltip: { y: { formatter: (v) => fmt(v) } },
      }}
    />
  )
}

/** Donut. `labels` + `series` (numbers). Center total optional via `totalLabel`. */
export function DonutChart({ labels, series, colors, height = 240, valueFormatter, totalLabel }) {
  const t = useTheme()
  const fmt = valueFormatter || ((v) => v)
  return (
    <ApexChart
      type="donut"
      height={height}
      series={series}
      options={{
        labels,
        colors: colors || [t.primary, CHART_COLORS.amber, CHART_COLORS.orange, CHART_COLORS.rose],
        stroke: { width: 2, colors: [cssHsl("--card") || "#fff"] },
        legend: { position: "right", show: true },
        plotOptions: {
          pie: {
            donut: {
              size: "70%",
              labels: {
                show: true,
                total: {
                  show: true,
                  label: totalLabel || "Total",
                  fontSize: "12px",
                  color: t.foreColor,
                  formatter: (w) => fmt(w.globals.seriesTotals.reduce((a, b) => a + b, 0)),
                },
                value: { formatter: (v) => fmt(v) },
              },
            },
          },
        },
        tooltip: { y: { formatter: (v) => fmt(v) } },
      }}
    />
  )
}
