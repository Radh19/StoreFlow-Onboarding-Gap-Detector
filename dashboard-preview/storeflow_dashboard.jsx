import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Papa from "papaparse";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, Cell,
} from "recharts";
import {
  Upload, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, HelpCircle,
  Clock, Users, Activity, ChevronDown, ChevronRight, X, Plus, Sparkles,
  Loader2, FileWarning, Download, Link2, XCircle,
} from "lucide-react";

/* ---------------------------------------------------------
   TOKENS
--------------------------------------------------------- */
const C = {
  bg: "#0B1220", panel: "#121B2E", panelAlt: "#0F1729",
  border: "#1E2A42", borderLight: "#26344C",
  text: "#E7ECF5", muted: "#8B98B0", faint: "#5B6A85",
  teal: "#4FD1C5", tealDim: "#2A4A48",
  amber: "#F0A83E", amberDim: "#4A3D22",
  red: "#F0556D", redDim: "#4A222C",
  green: "#6EE7A0", greenDim: "#22402E",
  purple: "#B39DFF", purpleDim: "#332B54",
};
const FONT_DISPLAY = "'Space Grotesk', 'Segoe UI', sans-serif";
const FONT_MONO = "'IBM Plex Mono', 'SFMono-Regular', monospace";

const STEPS = ["signup", "verify_email", "add_store_details", "add_first_product", "connect_payment", "store_launched"];
const STEP_LABELS = { signup: "Sign Up", verify_email: "Verify Email", add_store_details: "Store Details", add_first_product: "First Product", connect_payment: "Connect Payment", store_launched: "Launched" };
const EFFORT_BY_STEP = { signup: 1, verify_email: 1, add_store_details: 2, add_first_product: 2, connect_payment: 3 };
const CHANNEL_PALETTE = ["#4FD1C5", "#E86BAE", "#6EE7A0", "#F0A83E", "#B39DFF", "#F0556D", "#5EA8F0"];

const TIER_META = {
  observed: { label: "Observed pattern", short: "High", color: C.green, dim: C.greenDim, icon: CheckCircle2 },
  hypothesis: { label: "AI hypothesis", short: "Medium", color: C.amber, dim: C.amberDim, icon: HelpCircle },
  needs_validation: { label: "Needs validation", short: "Low", color: C.red, dim: C.redDim, icon: AlertTriangle },
};

/* ---------------------------------------------------------
   CSV NORMALIZATION — flexible column mapping so real exports
   from Segment/Amplitude/warehouse CSVs "just work".
--------------------------------------------------------- */
const FIELD_ALIASES = {
  channel: ["channel", "acquisition_channel", "source", "utm_source"],
  businessType: ["business_type", "businesstype", "category", "vertical"],
  sellerType: ["seller_type", "sellertype", "merchant_type", "merchant_size"],
  device: ["device", "platform", "device_type"],
  week: ["week", "cohort_week", "signup_week", "signup_date", "date"],
  stepsCompleted: ["steps_completed", "stepscompleted", "funnel_step_count"],
  droppedAtStep: ["dropped_at_step", "droppedatstep", "drop_step", "last_step_before_drop"],
  activated: ["activated", "is_activated", "launched", "store_launched"],
  daysToActivate: ["days_to_activate", "daystoactivate", "time_to_activate", "days_to_launch"],
};

function lowerKeyMap(row) {
  const map = {};
  Object.keys(row).forEach((k) => (map[k.trim().toLowerCase()] = row[k]));
  return map;
}
function pick(map, aliases) {
  for (const a of aliases) if (map[a] !== undefined && map[a] !== null && map[a] !== "") return map[a];
  return null;
}
function toWeekBucket(val) {
  if (val === null || val === undefined || val === "") return null;
  const s = String(val).trim();
  // Try parsing as a date regardless of format (YYYY-MM-DD, MM/DD/YYYY,
  // "May 4 2026", ISO with time, etc.) — only fall back to the raw string
  // if it genuinely isn't a recognizable date, so non-date "week" labels
  // (like "W1") still work as categorical buckets.
  const d = new Date(s);
  if (!isNaN(d.getTime()) && /\d/.test(s)) {
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    return monday.toISOString().slice(0, 10);
  }
  return s;
}
function toBool(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim().toLowerCase();
  if (["1", "true", "yes", "y", "activated"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return null;
}
function normalizeRow(raw) {
  const map = lowerKeyMap(raw);
  const channel = pick(map, FIELD_ALIASES.channel);
  const businessType = pick(map, FIELD_ALIASES.businessType);
  const sellerType = pick(map, FIELD_ALIASES.sellerType);
  const device = pick(map, FIELD_ALIASES.device);
  const week = toWeekBucket(pick(map, FIELD_ALIASES.week));
  const daysToActivateRaw = pick(map, FIELD_ALIASES.daysToActivate);
  const daysToActivate = daysToActivateRaw != null && daysToActivateRaw !== "" ? Number(daysToActivateRaw) : null;

  let stepsCompleted = pick(map, FIELD_ALIASES.stepsCompleted);
  stepsCompleted = stepsCompleted != null ? Number(stepsCompleted) : null;

  const droppedRaw = pick(map, FIELD_ALIASES.droppedAtStep);
  const droppedAtStep = droppedRaw ? String(droppedRaw).trim().toLowerCase().replace(/\s+/g, "_") : null;

  let activated = toBool(pick(map, FIELD_ALIASES.activated));

  if (stepsCompleted == null) {
    if (droppedAtStep && droppedAtStep !== "none" && STEPS.includes(droppedAtStep)) {
      stepsCompleted = STEPS.indexOf(droppedAtStep);
    } else if (activated === true) {
      stepsCompleted = 6;
    }
  }
  if (activated == null && stepsCompleted != null) activated = stepsCompleted >= 6;
  if (!channel || stepsCompleted == null) return null;

  return {
    channel: String(channel).trim(),
    businessType: businessType ? String(businessType).trim() : null,
    sellerType: sellerType ? String(sellerType).trim() : null,
    device: device ? String(device).trim() : null,
    week,
    stepsCompleted: Math.max(0, Math.min(6, stepsCompleted)),
    droppedAtStep: stepsCompleted < 6 ? (STEPS[stepsCompleted] || null) : null,
    activated: !!activated,
    daysToActivate: Number.isFinite(daysToActivate) ? daysToActivate : null,
  };
}
function detectMatchedColumn(headers, aliases) {
  const lowerHeaders = headers.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    if (lowerHeaders.includes(alias)) return alias;
  }
  return null;
}

function parseCSVFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const valid = [];
        let skipped = 0;
        (results.data || []).forEach((r) => {
          const n = normalizeRow(r);
          if (n) valid.push(n); else skipped += 1;
        });
        const headers = results.meta?.fields || [];
        const weekColumnUsed = detectMatchedColumn(headers, FIELD_ALIASES.week);
        const otherWeekColumns = FIELD_ALIASES.week.filter(
          (a) => a !== weekColumnUsed && headers.map((h) => h.trim().toLowerCase()).includes(a)
        );
        resolve({ rows: valid, skipped, total: results.data.length, weekColumnUsed, otherWeekColumns });
      },
      error: (err) => reject(err),
    });
  });
}
function downloadTemplate() {
  const header = "channel,business_type,seller_type,device,cohort_week,steps_completed,activated,days_to_activate";
  const sample = [
    "Instagram Ad,Fashion,First-time seller,Mobile,2026-05-04,4,0,",
    "Google Ad,Electronics,Existing business,Desktop,2026-05-04,6,1,4",
    "Organic,Home Decor,First-time seller,Mobile,2026-05-11,6,1,3",
  ].join("\n");
  const blob = new Blob([header + "\n" + sample], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "onboarding_data_template.csv"; a.click();
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------
   AI CALL — routed through a local backend proxy (src/api_server.py)
   that holds the real Groq API key server-side. A browser can never
   safely hold a real API key directly — anyone could open devtools and
   read it — so this dashboard talks to your own local server instead.

   Run `python src/api_server.py`, then this dashboard's calls will work.
   If that server isn't running, you'll get a clear "can't reach the
   local AI server" error instead of a silent failure.
--------------------------------------------------------- */
const AI_PROXY_URL = "http://localhost:8787/api/cohort-explanation";

async function fetchCohortExplanation({ channel, n, activationRate, dropStep, dropPct, tier, evidenceBullets }) {
  let res;
  try {
    res = await fetch(AI_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel, n, activationRate, dropStep, dropPct, tier, evidenceBullets }),
    });
  } catch (networkErr) {
    throw new Error(`Can't reach the local AI server at ${AI_PROXY_URL}. Run "python src/api_server.py" in another terminal first, and make sure GROQ_API_KEY is set in your .env.`);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Local AI server returned a non-JSON response (HTTP ${res.status}). Check its terminal output for errors.`);
  }

  if (!res.ok) {
    throw new Error(data?.error || `Local AI server error (HTTP ${res.status})`);
  }
  return data;
}

/* ---------------------------------------------------------
   SMALL UI PRIMITIVES
--------------------------------------------------------- */
function Badge({ tier }) {
  const meta = TIER_META[tier];
  const Icon = meta.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: meta.dim, color: meta.color, fontFamily: FONT_MONO, fontSize: 11, border: `1px solid ${meta.color}33` }}>
      <Icon size={12} strokeWidth={2.5} />{meta.label}
    </span>
  );
}
function KpiCard({ icon: Icon, label, value, sub, accent, delta }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px", flex: "1 1 200px", minWidth: 180 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Icon size={15} color={accent || C.teal} />
        <span style={{ color: C.muted, fontSize: 12, fontFamily: FONT_MONO, textTransform: "uppercase" }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 600 }}>{value}</span>
        {delta != null && (
          <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 12.5, color: delta >= 0 ? C.green : C.red, fontFamily: FONT_MONO }}>
            {delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      {sub && <div style={{ color: C.faint, fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ background: active ? C.panel : "transparent", color: active ? C.text : C.muted, border: `1px solid ${active ? C.borderLight : "transparent"}`, borderBottom: active ? `2px solid ${C.teal}` : "2px solid transparent", padding: "9px 16px", borderRadius: "8px 8px 0 0", fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}
function FilterChip({ active, onClick, children, color }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, background: active ? `${color}22` : "transparent", border: `1px solid ${active ? color : C.border}`, color: active ? C.text : C.faint, padding: "5px 12px", borderRadius: 999, fontSize: 12, cursor: "pointer" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />{children}
    </button>
  );
}
function Stars({ n }) {
  return <span style={{ color: C.amber, letterSpacing: 1, fontSize: 13 }}>{"★".repeat(n)}{"☆".repeat(5 - n)}</span>;
}

/* Robust numeric input — deliberately NOT type="number", which has a known
   React bug where the DOM can get stuck showing a stale string (e.g. "035")
   even when state is correctly 35. This strips leading zeros and non-digits
   at keystroke time and only re-syncs from the parent value while unfocused,
   so typing never fights the browser's native number-field quirks. */
function NumberField({ value, onChange, width = 50 }) {
  const [raw, setRaw] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setRaw(String(value));
  }, [value]);

  const handleChange = (e) => {
    let cleaned = e.target.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
    setRaw(cleaned);
    onChange(cleaned === "" ? 0 : Number(cleaned));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={raw}
      onFocus={(e) => { focused.current = true; e.target.select(); }}
      onBlur={() => { focused.current = false; setRaw(String(value)); }}
      onChange={handleChange}
      style={{ width, background: "transparent", border: "none", color: C.text, fontFamily: FONT_MONO, fontSize: 12.5, outline: "none" }}
    />
  );
}

/* ---------------------------------------------------------
   UPLOAD BAR — lives at the top of the page in every state,
   not a separate gating screen.
--------------------------------------------------------- */
function UploadBar({ hasData, fileName, uploadInfo, filteredCount, onFile, onClear, error, loading }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div style={{ marginBottom: 18 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
          background: dragging ? `${C.teal}0d` : C.panel,
          border: `2px dashed ${dragging ? C.teal : C.borderLight}`,
          borderRadius: 12, padding: "14px 18px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Upload size={18} color={C.teal} />
          {hasData ? (
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{fileName}</div>
              <div style={{ color: C.faint, fontSize: 11.5 }}>
                {uploadInfo.used.toLocaleString()} rows used{uploadInfo.skipped ? `, ${uploadInfo.skipped} skipped` : ""} · {filteredCount.toLocaleString()} in current filter
                {uploadInfo.weekColumnUsed && <> · using <b style={{ color: C.muted }}>"{uploadInfo.weekColumnUsed}"</b> for weekly trends</>}
              </div>
              {uploadInfo.otherWeekColumns?.length > 0 && (
                <div style={{ color: C.amber, fontSize: 11, marginTop: 2 }}>
                  ⚠ Also found {uploadInfo.otherWeekColumns.map((c) => `"${c}"`).join(", ")} — if trends look wrong, rename whichever column you don't want used.
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{loading ? "Parsing your file..." : "Drop your onboarding CSV here, or browse"}</div>
              <div style={{ color: C.faint, fontSize: 11.5 }}>expects columns like channel, business_type, device, steps_completed / activated</div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={downloadTemplate} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, padding: "8px 14px", borderRadius: 8, fontSize: 12.5, cursor: "pointer" }}>
            <Download size={13} /> Template
          </button>
          <button onClick={() => inputRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6, background: C.tealDim, border: `1px solid ${C.teal}66`, color: C.teal, padding: "8px 14px", borderRadius: 8, fontSize: 12.5, cursor: "pointer" }}>
            <Upload size={13} /> {hasData ? "Upload different file" : "Browse file"}
          </button>
          {hasData && (
            <button onClick={onClear} title="Clear current data" style={{ display: "flex", alignItems: "center", background: "transparent", border: `1px solid ${C.border}`, color: C.faint, padding: "8px 10px", borderRadius: 8, cursor: "pointer" }}>
              <X size={14} />
            </button>
          )}
          <input ref={inputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
        </div>
      </div>
      {error && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, color: C.red, fontSize: 13, background: C.redDim, border: `1px solid ${C.red}66`, borderRadius: 8, padding: "10px 14px", marginTop: 8 }}>
          <FileWarning size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 14, textAlign: "center", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>No data loaded yet</div>
      <div>Drop a CSV in the bar above, or browse for a file, to see the dashboard.</div>
    </div>
  );
}

/* ---------------------------------------------------------
   MAIN COMPONENT
--------------------------------------------------------- */
export default function StoreFlowDashboard() {
  const [rawRows, setRawRows] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploadInfo, setUploadInfo] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);

  const [tab, setTab] = useState("overview");
  const [filters, setFilters] = useState({ channels: new Set(), businessTypes: new Set(), devices: new Set(), sellerTypes: new Set() });
  const [expanded, setExpanded] = useState(new Set());
  const [expandedEvidence, setExpandedEvidence] = useState(new Set());
  const [contributingSegments, setContributingSegments] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [annForm, setAnnForm] = useState({ week: "", label: "" });
  const [aov, setAov] = useState(350);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [targetBenchmark, setTargetBenchmark] = useState(40);
  const [industryBenchmark, setIndustryBenchmark] = useState(35);
  const [spikeThreshold, setSpikeThreshold] = useState(35);
  const [explanations, setExplanations] = useState({});
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState(null);

  const handleFile = useCallback(async (file) => {
    setLoadingFile(true);
    setUploadError(null);
    try {
      const { rows, skipped, total, weekColumnUsed, otherWeekColumns } = await parseCSVFile(file);
      if (!rows.length) {
        const stillShowingOld = rawRows ? ` Still showing your previous file (${fileName}) below — nothing has changed.` : "";
        setUploadError(`"${file.name}" had no usable rows. Make sure it has a channel column and either steps_completed, dropped_at_step, or activated.${stillShowingOld}`);
        setLoadingFile(false);
        return;
      }
      setRawRows(rows);
      setFileName(file.name);
      setUploadInfo({ used: rows.length, skipped, total, weekColumnUsed, otherWeekColumns });
      setFilters({
        channels: new Set([...new Set(rows.map((r) => r.channel))]),
        businessTypes: new Set([...new Set(rows.map((r) => r.businessType).filter(Boolean))]),
        devices: new Set([...new Set(rows.map((r) => r.device).filter(Boolean))]),
        sellerTypes: new Set([...new Set(rows.map((r) => r.sellerType).filter(Boolean))]),
      });
      setExplanations({});
      setExpanded(new Set());
    } catch (e) {
      setUploadError(`Couldn't parse "${file.name}" — please make sure it's a valid CSV.${rawRows ? ` Still showing your previous file (${fileName}) below.` : ""}`);
    }
    setLoadingFile(false);
  }, []);

  const clearFile = () => { setRawRows(null); setFileName(null); setUploadInfo(null); setExplanations({}); };

  const dims = useMemo(() => {
    if (!rawRows) return { channels: [], businessTypes: [], devices: [], sellerTypes: [], hasWeek: false };
    return {
      channels: [...new Set(rawRows.map((r) => r.channel))],
      businessTypes: [...new Set(rawRows.map((r) => r.businessType).filter(Boolean))],
      devices: [...new Set(rawRows.map((r) => r.device).filter(Boolean))],
      sellerTypes: [...new Set(rawRows.map((r) => r.sellerType).filter(Boolean))],
      hasWeek: rawRows.some((r) => r.week),
    };
  }, [rawRows]);

  const channelColor = useMemo(() => {
    const map = {};
    dims.channels.forEach((ch, i) => (map[ch] = CHANNEL_PALETTE[i % CHANNEL_PALETTE.length]));
    return map;
  }, [dims.channels]);

  const toggleFilter = (dim, val) => {
    setFilters((prev) => {
      const next = new Set(prev[dim]);
      next.has(val) ? next.delete(val) : next.add(val);
      return { ...prev, [dim]: next.size ? next : prev[dim] };
    });
  };

  const filteredRows = useMemo(() => {
    if (!rawRows) return [];
    return rawRows.filter((r) =>
      filters.channels.has(r.channel) &&
      (!r.businessType || filters.businessTypes.has(r.businessType)) &&
      (!r.device || filters.devices.has(r.device)) &&
      (!r.sellerType || filters.sellerTypes.has(r.sellerType))
    );
  }, [rawRows, filters]);

  const overall = useMemo(() => {
    if (!filteredRows.length) return null;
    const activated = filteredRows.filter((r) => r.activated).length;
    const activationRate = (activated / filteredRows.length) * 100;
    const byChannel = {};
    dims.channels.filter((c) => filters.channels.has(c)).forEach((ch) => {
      const rows = filteredRows.filter((r) => r.channel === ch);
      byChannel[ch] = rows.length ? (rows.filter((r) => r.activated).length / rows.length) * 100 : 0;
    });
    const entries = Object.entries(byChannel);
    const worst = entries.length ? entries.sort((a, b) => a[1] - b[1])[0] : null;
    const times = filteredRows.filter((r) => r.daysToActivate != null).map((r) => r.daysToActivate);
    const medianDays = times.length ? [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] : null;
    return { activationRate, byChannel, worst, medianDays, total: filteredRows.length, activated };
  }, [filteredRows, dims.channels, filters.channels]);

  const funnelByChannel = useMemo(() => {
    const activeChannels = dims.channels.filter((c) => filters.channels.has(c));
    return activeChannels.map((ch) => {
      const rows = filteredRows.filter((r) => r.channel === ch);
      const total = rows.length;
      const stepData = STEPS.map((step, i) => {
        const count = rows.filter((r) => r.stepsCompleted >= i + 1).length;
        return { step, label: STEP_LABELS[step], count, pct: total ? Math.round((count / total) * 1000) / 10 : 0 };
      });
      return { channel: ch, total, steps: stepData };
    });
  }, [filteredRows, dims.channels, filters.channels]);

  const weeklyTrend = useMemo(() => {
    if (!dims.hasWeek) return [];
    const weeks = [...new Set(filteredRows.map((r) => r.week).filter(Boolean))].sort();
    const activeChannels = dims.channels.filter((c) => filters.channels.has(c));
    return weeks.map((w) => {
      const row = { week: w };
      activeChannels.forEach((ch) => {
        const rows = filteredRows.filter((r) => r.week === w && r.channel === ch);
        row[ch] = rows.length ? Math.round((rows.filter((r) => r.activated).length / rows.length) * 1000) / 10 : null;
      });
      return row;
    });
  }, [filteredRows, dims, filters.channels]);

  const spikes = useMemo(() => {
    if (weeklyTrend.length < 2) return [];
    const found = [];
    const threshold = spikeThreshold / 100;
    dims.channels.filter((c) => filters.channels.has(c)).forEach((ch) => {
      for (let w = 1; w < weeklyTrend.length; w++) {
        const prev = weeklyTrend[w - 1][ch], cur = weeklyTrend[w][ch];
        if (prev != null && cur != null && prev > 0 && Math.abs(cur - prev) / prev > threshold) {
          found.push({ channel: ch, week: weeklyTrend[w].week, from: prev, to: cur, drop: cur < prev });
        }
      }
    });
    return found;
  }, [weeklyTrend, dims.channels, filters.channels, spikeThreshold]);

  const cohortInsights = useMemo(() => {
    const activeChannels = dims.channels.filter((c) => filters.channels.has(c));

    const avgDropAtStep = {};
    STEPS.forEach((step, i) => {
      const rates = activeChannels.map((ch) => {
        const rows = filteredRows.filter((r) => r.channel === ch);
        if (!rows.length) return null;
        const before = rows.filter((r) => r.stepsCompleted >= i).length;
        const after = rows.filter((r) => r.stepsCompleted >= i + 1).length;
        return before ? ((before - after) / before) * 100 : null;
      }).filter((v) => v != null);
      avgDropAtStep[step] = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    });

    return activeChannels.map((ch) => {
      const rows = filteredRows.filter((r) => r.channel === ch);
      const n = rows.length;
      const activationRate = n ? (rows.filter((r) => r.activated).length / n) * 100 : 0;

      let worstStep = null, worstDrop = -Infinity;
      STEPS.forEach((step, i) => {
        const before = rows.filter((r) => r.stepsCompleted >= i).length;
        const after = rows.filter((r) => r.stepsCompleted >= i + 1).length;
        const dropPct = before ? ((before - after) / before) * 100 : 0;
        if (i > 0 && dropPct > worstDrop) { worstDrop = dropPct; worstStep = step; }
      });

      const bullets = [];
      const signals = [];

      const sampleSizePassed = n >= 50;
      signals.push({ label: "Sample Size", threshold: "≥ 50", actual: n.toLocaleString(), passed: sampleSizePassed });

      const hasDevice = rows.some((r) => r.device);
      let devicePct = null;
      if (hasDevice) {
        const devCounts = {};
        rows.forEach((r) => { if (r.device) devCounts[r.device] = (devCounts[r.device] || 0) + 1; });
        const top = Object.entries(devCounts).sort((a, b) => b[1] - a[1])[0];
        if (top) {
          devicePct = Math.round((top[1] / n) * 100);
          if (devicePct >= 60) bullets.push(`${devicePct}% of ${ch} traffic is ${top[0]}`);
        }
      }
      signals.push({ label: "Device Concentration", threshold: "≥ 60%", actual: hasDevice && devicePct != null ? `${devicePct}%` : "N/A", passed: hasDevice && devicePct != null && devicePct >= 60 });

      const hasSeller = rows.some((r) => r.sellerType);
      let firstTimePct = null;
      if (hasSeller) {
        const firstTimeCount = rows.filter((r) => (r.sellerType || "").toLowerCase().includes("first")).length;
        firstTimePct = Math.round((firstTimeCount / n) * 100);
        if (firstTimePct >= 55) bullets.push(`${firstTimePct}% are first-time sellers`);
      }
      signals.push({ label: "First-time Sellers", threshold: "≥ 55%", actual: hasSeller && firstTimePct != null ? `${firstTimePct}%` : "N/A", passed: hasSeller && firstTimePct != null && firstTimePct >= 55 });

      const hasBiz = rows.some((r) => r.businessType);
      let bizPct = null, topBizName = null;
      if (hasBiz) {
        const bizCounts = {};
        rows.forEach((r) => { if (r.businessType) bizCounts[r.businessType] = (bizCounts[r.businessType] || 0) + 1; });
        const top = Object.entries(bizCounts).sort((a, b) => b[1] - a[1])[0];
        if (top) {
          bizPct = Math.round((top[1] / n) * 100);
          topBizName = top[0];
          if (bizPct >= 40) bullets.push(`${bizPct}% of ${ch} merchants are ${top[0]}`);
        }
      }
      signals.push({ label: "Business Type Concentration", threshold: "≥ 40%", actual: hasBiz && bizPct != null ? `${bizPct}%` : "N/A", passed: hasBiz && bizPct != null && bizPct >= 40 });

      const ratio = avgDropAtStep[worstStep] > 0 ? worstDrop / avgDropAtStep[worstStep] : 1;
      if (ratio >= 1.3) bullets.push(`${ch}'s drop at ${STEP_LABELS[worstStep]} is ${ratio.toFixed(1)}x the cross-channel average`);
      signals.push({ label: "Worst-Step Drop", threshold: "≥ 1.3× Avg", actual: `${ratio.toFixed(1)}×`, passed: ratio >= 1.3 });

      const signalCount = signals.filter((s) => s.passed).length;

      let tier;
      if (n < 50) tier = "needs_validation";
      else if (dims.hasWeek) {
        const series = weeklyTrend.map((w) => w[ch]).filter((v) => v != null);
        const mean = series.reduce((a, b) => a + b, 0) / (series.length || 1);
        const variance = series.reduce((a, b) => a + (b - mean) ** 2, 0) / (series.length || 1);
        const cv = mean ? Math.sqrt(variance) / mean : 1;
        tier = cv > 0.25 ? "hypothesis" : "observed";
      } else {
        tier = "hypothesis";
      }

      const times = rows.filter((r) => r.daysToActivate != null).map((r) => r.daysToActivate);
      const medianDays = times.length ? [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] : null;

      const impactTier = worstDrop >= 25 ? "High" : worstDrop >= 15 ? "Medium" : "Low";
      const effortScore = EFFORT_BY_STEP[worstStep] || 2;
      const effortTier = effortScore === 1 ? "Low" : effortScore === 2 ? "Medium" : "High";
      const priorityMap = { "High-Low": 5, "High-Medium": 4, "High-High": 3, "Medium-Low": 4, "Medium-Medium": 3, "Medium-High": 2, "Low-Low": 2, "Low-Medium": 1, "Low-High": 1 };
      const priority = priorityMap[`${impactTier}-${effortTier}`] || 3;

      const potentialLift = Math.max(0, targetBenchmark - activationRate);
      const expectedMerchants = Math.round((potentialLift / 100) * n);
      const expectedGmv = Math.round(expectedMerchants * aov);

      return {
        channel: ch, n, activationRate: Math.round(activationRate * 10) / 10,
        worstStep, worstDrop: Math.round(worstDrop * 10) / 10, tier, bullets, signalCount, signals,
        medianDays, impactTier, effortTier, priority, potentialLift: Math.round(potentialLift * 10) / 10,
        expectedMerchants, expectedGmv,
      };
    });
  }, [filteredRows, dims, filters.channels, weeklyTrend, targetBenchmark, aov]);

  const runExplanations = useCallback(async () => {
    setExplaining(true);
    setExplainError(null);
    try {
      const results = await Promise.all(
        cohortInsights.map(async (c) => {
          try {
            const exp = await fetchCohortExplanation({
              channel: c.channel, n: c.n, activationRate: c.activationRate,
              dropStep: c.worstStep, dropPct: c.worstDrop, tier: c.tier, evidenceBullets: c.bullets,
            });
            return [c.channel, exp];
          } catch (e) {
            console.error(`AI explanation failed for ${c.channel}:`, e);
            return [c.channel, { why: `⚠ ${e.message}`, fix: "—", metric: "—" }];
          }
        })
      );
      setExplanations(Object.fromEntries(results));
    } catch (e) {
      setExplainError("Couldn't reach the AI service. Try again in a moment.");
    }
    setExplaining(false);
  }, [cohortInsights]);

  const execSummary = useMemo(() => {
    if (!overall || !cohortInsights.length) return null;
    const wowDelta = weeklyTrend.length >= 2
      ? (() => {
          const last = weeklyTrend[weeklyTrend.length - 1], prev = weeklyTrend[weeklyTrend.length - 2];
          const chs = Object.keys(last).filter((k) => k !== "week");
          const lastAvg = chs.reduce((a, k) => a + (last[k] || 0), 0) / (chs.length || 1);
          const prevAvg = chs.reduce((a, k) => a + (prev[k] || 0), 0) / (chs.length || 1);
          return lastAvg - prevAvg;
        })()
      : null;

    const stepDropTotals = {};
    STEPS.forEach((step, i) => {
      const before = filteredRows.filter((r) => r.stepsCompleted >= i).length;
      const after = filteredRows.filter((r) => r.stepsCompleted >= i + 1).length;
      stepDropTotals[step] = i > 0 ? Math.max(0, before - after) : 0;
    });
    const totalAbandoned = Object.values(stepDropTotals).reduce((a, b) => a + b, 0);
    const topAbandonEntry = Object.entries(stepDropTotals).sort((a, b) => b[1] - a[1])[0];
    const topAbandonPct = totalAbandoned ? Math.round((topAbandonEntry[1] / totalAbandoned) * 100) : 0;

    // Opportunity Merchants = (Target Activation − Current Activation) × Total Merchants
    // Single aggregate calculation, not a sum of per-cohort figures — this is
    // the headline "if we hit our target" number. Cohort Insights / Priority
    // tab still show per-channel breakdowns separately, for prioritization.
    const opportunityMerchants = Math.max(0, Math.round(((targetBenchmark - overall.activationRate) / 100) * overall.total));
    const opportunityGmv = opportunityMerchants * aov;

    const needsInvestigation = cohortInsights.filter((c) => c.tier !== "observed").length + spikes.length;

    let execInsight = null;
    const worstCohort = [...cohortInsights].sort((a, b) => b.worstDrop - a.worstDrop)[0];
    if (worstCohort) {
      const others = cohortInsights.filter((c) => c.channel !== worstCohort.channel);
      const comparableRates = others.map((c) => {
        const rows = filteredRows.filter((r) => r.channel === c.channel);
        const i = STEPS.indexOf(worstCohort.worstStep);
        const before = rows.filter((r) => r.stepsCompleted >= i).length;
        const after = rows.filter((r) => r.stepsCompleted >= i + 1).length;
        return { channel: c.channel, rate: before ? ((before - after) / before) * 100 : 0 };
      }).filter((c) => c.rate >= 0);
      const lowest = comparableRates.sort((a, b) => a.rate - b.rate)[0];
      if (lowest && lowest.rate > 0) {
        const ratio = worstCohort.worstDrop / lowest.rate;
        if (ratio >= 1.3) {
          execInsight = `${worstCohort.channel} merchants abandon ${STEP_LABELS[worstCohort.worstStep]} ${ratio.toFixed(1)}x more often than ${lowest.channel} merchants.`;
        }
      }
    }

    return { wowDelta, topAbandonStep: topAbandonEntry?.[0], topAbandonPct, opportunityMerchants, opportunityGmv, needsInvestigation, execInsight };
  }, [overall, cohortInsights, weeklyTrend, filteredRows, spikes, aov, targetBenchmark]);

  const alerts = useMemo(() => {
    const list = [];
    spikes.forEach((s) => list.push({ type: s.drop ? "critical" : "info", text: `${s.channel} activation ${s.drop ? "dropped" : "rose"} ${Math.abs(s.to - s.from).toFixed(1)} pts in ${s.week}`, channel: s.channel, step: null }));
    cohortInsights.forEach((c) => {
      if (c.tier === "needs_validation") list.push({ type: "warning", text: `${c.channel} needs more data before its explanation can be trusted (n=${c.n})`, channel: c.channel, step: c.worstStep });
      if (overall && c.activationRate < industryBenchmark - 5) list.push({ type: "warning", text: `${c.channel} is ${(industryBenchmark - c.activationRate).toFixed(1)} pts below the industry benchmark`, channel: c.channel, step: c.worstStep });
    });
    return list;
  }, [spikes, cohortInsights, overall, industryBenchmark]);

  const openContributingSegments = (channel, step) => {
    const stepIndex = STEPS.indexOf(step);
    // "At risk" = merchants who actually reached this step and had a chance
    // to drop here (not everyone who signed up). Drop rate is computed
    // against that exposed population, not just as a share of the drop pile.
    const atRisk = filteredRows.filter((r) => r.channel === channel && r.stepsCompleted >= stepIndex);
    const dropped = atRisk.filter((r) => r.stepsCompleted === stepIndex);
    const overallRate = atRisk.length ? (dropped.length / atRisk.length) * 100 : 0;

    const buildSegment = (rows, keyFn) => {
      const atRiskBy = {}, droppedBy = {};
      rows.atRisk.forEach((r) => { const k = keyFn(r); if (k) atRiskBy[k] = (atRiskBy[k] || 0) + 1; });
      rows.dropped.forEach((r) => { const k = keyFn(r); if (k) droppedBy[k] = (droppedBy[k] || 0) + 1; });
      return Object.keys(atRiskBy).map((k) => {
        const n = atRiskBy[k];
        const d = droppedBy[k] || 0;
        const rate = n ? (d / n) * 100 : 0;
        const deltaPoints = rate - overallRate;
        const ratio = overallRate > 0 ? rate / overallRate : 1;
        let tier = "normal";
        if (ratio >= 1.5) tier = "abnormal";
        else if (Math.abs(deltaPoints) >= 2) tier = "elevated";
        return { key: k, n, dropped: d, rate: Math.round(rate * 10) / 10, deltaPoints: Math.round(deltaPoints * 10) / 10, tier };
      }).sort((a, b) => b.rate - a.rate);
    };

    setContributingSegments({
      channel, step, totalAtRisk: atRisk.length, totalDropped: dropped.length, overallRate: Math.round(overallRate * 10) / 10,
      byDevice: buildSegment({ atRisk, dropped }, (r) => r.device),
      byBiz: buildSegment({ atRisk, dropped }, (r) => r.businessType),
    });
  };

  const toggleExpand = (ch) => setExpanded((prev) => { const n = new Set(prev); n.has(ch) ? n.delete(ch) : n.add(ch); return n; });
  const toggleEvidence = (ch) => setExpandedEvidence((prev) => { const n = new Set(prev); n.has(ch) ? n.delete(ch) : n.add(ch); return n; });
  const addAnnotation = () => { if (!annForm.week || !annForm.label) return; setAnnotations((prev) => [...prev, { ...annForm }]); setAnnForm({ week: "", label: "" }); };
  const removeAnnotation = (index) => setAnnotations((prev) => prev.filter((_, i) => i !== index));

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: 24, fontFamily: FONT_DISPLAY, color: C.text }}>
      <GlobalStyle />
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.teal, boxShadow: `0 0 8px ${C.teal}` }} />
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: C.muted, letterSpacing: 1 }}>ONBOARDING GAP DETECTOR</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "6px 0 0" }}>StoreFlow Merchant Funnel</h1>
      </div>

      <UploadBar
        hasData={!!rawRows}
        fileName={fileName}
        uploadInfo={uploadInfo}
        filteredCount={filteredRows.length}
        onFile={handleFile}
        onClear={clearFile}
        error={uploadError}
        loading={loadingFile}
      />

      {!rawRows ? (
        <EmptyState />
      ) : (
        <>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", marginBottom: 18, display: "flex", flexWrap: "wrap", gap: 16 }}>
            <FilterGroup label="Channel" values={dims.channels} active={filters.channels} onToggle={(v) => toggleFilter("channels", v)} colorFn={(v) => channelColor[v]} />
            {dims.businessTypes.length > 0 && <FilterGroup label="Business type" values={dims.businessTypes} active={filters.businessTypes} onToggle={(v) => toggleFilter("businessTypes", v)} colorFn={() => C.teal} />}
            {dims.devices.length > 0 && <FilterGroup label="Device" values={dims.devices} active={filters.devices} onToggle={(v) => toggleFilter("devices", v)} colorFn={() => C.amber} />}
            {dims.sellerTypes.length > 0 && <FilterGroup label="Seller type" values={dims.sellerTypes} active={filters.sellerTypes} onToggle={(v) => toggleFilter("sellerTypes", v)} colorFn={() => C.purple} />}
          </div>

          {!overall ? (
            <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>No rows match the current filters.</div>
          ) : (
            <>
              {execSummary && (
                <div style={{ background: `linear-gradient(135deg, ${C.panel}, ${C.panelAlt})`, border: `1px solid ${C.borderLight}`, borderRadius: 12, padding: 20, marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Sparkles size={16} color={C.teal} />
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Weekly Summary</h3>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5, color: "#D5DCEA" }}>
                    {execSummary.wowDelta != null && (
                      <li>Activation {execSummary.wowDelta >= 0 ? "increased" : "decreased"} <b style={{ color: execSummary.wowDelta >= 0 ? C.green : C.red }}>{execSummary.wowDelta >= 0 ? "+" : ""}{execSummary.wowDelta.toFixed(1)}%</b> week over week</li>
                    )}
                    {overall.worst && <li><b>{overall.worst[0]}</b> remains the weakest acquisition source at {overall.worst[1].toFixed(1)}% activation</li>}
                    {execSummary.topAbandonStep && <li><b>{STEP_LABELS[execSummary.topAbandonStep]}</b> contributes {execSummary.topAbandonPct}% of total abandonment</li>}
                    <li>Estimated opportunity: <b style={{ color: C.teal }}>+{execSummary.opportunityMerchants} additional activated merchants</b> (~${execSummary.opportunityGmv.toLocaleString()} GMV) if overall activation reached the {targetBenchmark}% target</li>
                    <li><b style={{ color: execSummary.needsInvestigation ? C.amber : C.green }}>{execSummary.needsInvestigation}</b> cohort signal{execSummary.needsInvestigation === 1 ? "" : "s"} require investigation</li>
                  </ul>
                  {execSummary.execInsight && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}`, fontSize: 13.5, color: C.text, fontStyle: "italic" }}>💡 {execSummary.execInsight}</div>
                  )}
                </div>
              )}

              {alerts.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
                  {alerts.map((a, i) => (
                    <div key={i} onClick={() => a.step && openContributingSegments(a.channel, a.step)} style={{ cursor: a.step ? "pointer" : "default", display: "flex", alignItems: "center", gap: 10, background: a.type === "critical" ? C.redDim : C.amberDim, border: `1px solid ${a.type === "critical" ? C.red : C.amber}44`, borderRadius: 8, padding: "9px 14px", fontSize: 13 }}>
                      {a.type === "critical" ? "🚨" : "⚠️"} {a.text} {a.step && <span style={{ marginLeft: "auto", color: C.faint, fontSize: 11 }}>click for contributing segments →</span>}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                <KpiCard icon={Activity} label="Activation rate" value={`${overall.activationRate.toFixed(1)}%`} sub={`${overall.activated.toLocaleString()} of ${overall.total.toLocaleString()} merchants`} delta={execSummary?.wowDelta} />
                <KpiCard icon={Users} label="Total merchants" value={overall.total.toLocaleString()} sub="In current filter" />
                <KpiCard icon={TrendingDown} label="Worst channel" value={overall.worst?.[0] || "—"} sub={overall.worst ? `${overall.worst[1].toFixed(1)}% activation` : ""} accent={C.red} />
                <KpiCard icon={Clock} label="Median time-to-launch" value={overall.medianDays != null ? `${overall.medianDays}d` : "—"} accent={C.amber} />
                <KpiCard icon={AlertTriangle} label="GMV opportunity" value={`$${(execSummary?.opportunityGmv || 0).toLocaleString()}`} sub={`+${execSummary?.opportunityMerchants || 0} merchants to reach ${targetBenchmark}% target`} accent={C.purple} />
              </div>

              <div style={{ marginBottom: 20 }}>
                <button onClick={() => setShowAssumptions((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: C.faint, fontSize: 12.5, cursor: "pointer", padding: 0 }}>
                  {showAssumptions ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  ⚙ Assumptions behind the $ and benchmark figures
                </button>
                {showAssumptions && (
                  <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", marginTop: 10, fontSize: 12.5, color: C.muted, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 16px" }}>
                    <AssumptionInput label="Assumed avg. first-order value" prefix="$" value={aov} onChange={setAov} />
                    <AssumptionInput label="Target activation" suffix="%" value={targetBenchmark} onChange={setTargetBenchmark} />
                    <AssumptionInput label="Industry benchmark" suffix="%" value={industryBenchmark} onChange={setIndustryBenchmark} />
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 18, overflowX: "auto" }}>
                <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>Funnel</TabButton>
                <TabButton active={tab === "trends"} onClick={() => setTab("trends")}>Trends &amp; Spikes</TabButton>
                <TabButton active={tab === "insights"} onClick={() => setTab("insights")}>Cohort Insights</TabButton>
                <TabButton active={tab === "priority"} onClick={() => setTab("priority")}>Opportunity Priority</TabButton>
                <TabButton active={tab === "benchmarks"} onClick={() => setTab("benchmarks")}>Benchmarks</TabButton>
              </div>

              {tab === "overview" && <FunnelTab funnelByChannel={funnelByChannel} channelColor={channelColor} onDrillDown={openContributingSegments} />}
              {tab === "trends" && <TrendsTab weeklyTrend={weeklyTrend} channelColor={channelColor} spikes={spikes} annotations={annotations} annForm={annForm} setAnnForm={setAnnForm} addAnnotation={addAnnotation} removeAnnotation={removeAnnotation} hasWeek={dims.hasWeek} spikeThreshold={spikeThreshold} setSpikeThreshold={setSpikeThreshold} />}
              {tab === "insights" && (
                <InsightsTab cohortInsights={cohortInsights} channelColor={channelColor} expanded={expanded} toggleExpand={toggleExpand} explanations={explanations} explaining={explaining} explainError={explainError} runExplanations={runExplanations} expandedEvidence={expandedEvidence} toggleEvidence={toggleEvidence} />
              )}
              {tab === "priority" && <PriorityTab cohortInsights={cohortInsights} />}
              {tab === "benchmarks" && <BenchmarksTab overall={overall} cohortInsights={cohortInsights} targetBenchmark={targetBenchmark} industryBenchmark={industryBenchmark} channelColor={channelColor} />}
            </>
          )}

          {contributingSegments && <ContributingSegmentsModal data={contributingSegments} onClose={() => setContributingSegments(null)} />}

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.border}`, color: C.faint, fontSize: 11, fontFamily: FONT_MONO }}>
            All analysis runs client-side on your uploaded file. WHY/FIX/METRIC text is generated live via the Groq API when you click "Generate AI explanations" on the Cohort Insights tab.
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   SUB-COMPONENTS
--------------------------------------------------------- */
function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
      html, body { margin: 0; padding: 0; background: ${C.bg}; min-height: 100%; }
      * { box-sizing: border-box; }
      button { font-family: inherit; }
      input { font-family: inherit; }
      ::-webkit-scrollbar { height: 6px; width: 6px; }
      ::-webkit-scrollbar-thumb { background: ${C.borderLight}; border-radius: 3px; }
      @keyframes spin { to { transform: rotate(360deg); } }
    `}</style>
  );
}
function FilterGroup({ label, values, active, onToggle, colorFn }) {
  return (
    <div>
      <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: C.faint, marginBottom: 6, textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {values.map((v) => <FilterChip key={v} active={active.has(v)} onClick={() => onToggle(v)} color={colorFn(v)}>{v}</FilterChip>)}
      </div>
    </div>
  );
}
function AssumptionInput({ label, prefix, suffix, value, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {label}
      <span style={{ display: "flex", alignItems: "center", background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px" }}>
        {prefix}
        <NumberField value={value} onChange={onChange} width={50} />
        {suffix}
      </span>
    </label>
  );
}
function FunnelTab({ funnelByChannel, channelColor, onDrillDown }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {funnelByChannel.map((f) => (
        <div key={f.channel} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: channelColor[f.channel] }} />
            <span style={{ fontWeight: 600, fontSize: 14.5 }}>{f.channel}</span>
            <span style={{ color: C.faint, fontSize: 12, fontFamily: FONT_MONO }}>n={f.total}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", overflowX: "auto", gap: 4, paddingBottom: 4 }}>
            {f.steps.map((s, i) => (
              <React.Fragment key={s.step}>
                <div onClick={() => i > 0 && onDrillDown(f.channel, s.step)} style={{ minWidth: 108, textAlign: "center", padding: "10px 6px", borderRadius: 8, background: C.panelAlt, cursor: i > 0 ? "pointer" : "default", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 17, fontWeight: 600 }}>{s.count.toLocaleString()}</div>
                  <div style={{ fontSize: 11, color: channelColor[f.channel] }}>{s.pct}%</div>
                </div>
                {i < f.steps.length - 1 && <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />}
              </React.Fragment>
            ))}
          </div>
          <div style={{ color: C.faint, fontSize: 11.5, marginTop: 8 }}>Click any step (except the first) to see which segments contributed most to that drop.</div>
        </div>
      ))}
    </div>
  );
}
function TrendsTab({ weeklyTrend, channelColor, spikes, annotations, annForm, setAnnForm, addAnnotation, removeAnnotation, hasWeek, spikeThreshold, setSpikeThreshold }) {
  if (!hasWeek) {
    return <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 30, textAlign: "center", color: C.muted }}>Your CSV doesn't include a date/week column, so week-over-week trend and spike detection aren't available. Add a `cohort_week` or `date` column to enable this view.</div>;
  }
  const channels = Object.keys(weeklyTrend[0] || {}).filter((k) => k !== "week");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>Weekly activation rate by channel</h3>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={weeklyTrend} margin={{ top: 36, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
            <XAxis dataKey="week" stroke={C.muted} fontSize={11} />
            <YAxis stroke={C.muted} fontSize={12} unit="%" />
            <Tooltip contentStyle={{ background: C.panelAlt, border: `1px solid ${C.borderLight}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: C.muted, marginBottom: 4 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {channels.map((ch) => <Line key={ch} type="monotone" dataKey={ch} stroke={channelColor[ch]} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />)}
            {annotations.map((a, i) => (
              <ReferenceLine key={i} x={a.week} stroke={C.amber} strokeWidth={1.5} strokeDasharray="4 4"
                label={{ value: `${i + 1}`, position: "top", fill: C.bg, fontSize: 10, fontWeight: 700 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>

        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
          <select value={annForm.week} onChange={(e) => setAnnForm({ ...annForm, week: e.target.value })} style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "6px 8px", fontSize: 12 }}>
            <option value="">Week...</option>
            {weeklyTrend.map((w) => <option key={w.week} value={w.week}>{w.week}</option>)}
          </select>
          <input placeholder="e.g. New product upload UI released" value={annForm.label} onChange={(e) => setAnnForm({ ...annForm, label: e.target.value })} style={{ flex: 1, minWidth: 200, background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "6px 10px", fontSize: 12 }} />
          <button onClick={addAnnotation} style={{ display: "flex", alignItems: "center", gap: 6, background: C.tealDim, border: `1px solid ${C.teal}44`, color: C.teal, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}><Plus size={13} /> Annotate</button>
        </div>

        {annotations.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
            {annotations.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: C.panelAlt, border: `1px solid ${C.amber}33`, borderRadius: 6, padding: "6px 10px", fontSize: 12.5 }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: C.amber, color: C.bg, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ color: C.muted, fontFamily: FONT_MONO, fontSize: 11 }}>{a.week}</span>
                <span style={{ color: C.text }}>{a.label}</span>
                <button onClick={() => removeAnnotation(i)} style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.faint, cursor: "pointer", display: "flex" }}><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <p style={{ color: C.faint, fontSize: 11.5, marginTop: 8 }}>Annotate deploys, campaigns, or pricing changes so a trend change has a documented explanation next to it. Numbered markers on the chart correspond to the list above.</p>
      </div>
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Detected spikes (&gt;{spikeThreshold}% week-over-week move)</h3>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.muted }}>
            Sensitivity
            <span style={{ display: "flex", alignItems: "center", background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px" }}>
              <NumberField value={spikeThreshold} onChange={setSpikeThreshold} width={40} />
              %
            </span>
          </label>
        </div>
        <p style={{ color: C.faint, fontSize: 11.5, margin: "0 0 14px" }}>Lower this if your data has smaller but still meaningful swings — a smaller synthetic anomaly may not clear the default 35% threshold. When a spike lands on a week you've annotated, the likely cause is surfaced automatically.</p>
        {spikes.length === 0 ? <p style={{ color: C.muted, fontSize: 13 }}>No anomalies detected in this filtered view.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {spikes.map((s, i) => {
              const relatedEvents = annotations.filter((a) => a.week === s.week);
              return (
                <div key={i} style={{ background: C.panelAlt, border: `1px solid ${s.drop ? C.redDim : C.greenDim}`, borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                    {s.drop ? <TrendingDown size={16} color={C.red} /> : <TrendingUp size={16} color={C.green} />}
                    <span style={{ fontSize: 13 }}><b>{s.channel}</b> activation {s.drop ? "fell" : "rose"} from {s.from.toFixed(1)}% to {s.to.toFixed(1)}% in {s.week}</span>
                  </div>
                  {relatedEvents.length > 0 && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6, background: C.panel }}>
                      <span style={{ fontSize: 10.5, color: C.faint, fontFamily: FONT_MONO, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
                        <Link2 size={11} /> Possible related event{relatedEvents.length > 1 ? "s" : ""}
                      </span>
                      {relatedEvents.map((a, j) => (
                        <span key={j} style={{ fontSize: 13, color: C.amber, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.amber, flexShrink: 0 }} />
                          {a.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
function InsightsTab({ cohortInsights, channelColor, expanded, toggleExpand, explanations, explaining, explainError, runExplanations, expandedEvidence, toggleEvidence }) {
  const hasAny = Object.keys(explanations).length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
        {explainError && <span style={{ color: C.red, fontSize: 12.5 }}>{explainError}</span>}
        <button onClick={runExplanations} disabled={explaining} style={{ display: "flex", alignItems: "center", gap: 8, background: C.tealDim, border: `1px solid ${C.teal}66`, color: C.teal, padding: "9px 16px", borderRadius: 8, cursor: explaining ? "default" : "pointer", fontSize: 13 }}>
          {explaining ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Sparkles size={14} />}
          {explaining ? "Generating..." : hasAny ? "Regenerate AI explanations" : "Generate AI explanations"}
        </button>
      </div>
      {cohortInsights.map((c) => {
        const isOpen = expanded.has(c.channel);
        const isEvidenceOpen = expandedEvidence.has(c.channel);
        const meta = TIER_META[c.tier];
        const exp = explanations[c.channel];
        return (
          <div key={c.channel} style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
            <div onClick={() => toggleExpand(c.channel)} role="button" tabIndex={0} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "transparent", border: "none", color: C.text, padding: 16, cursor: "pointer", flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {isOpen ? <ChevronDown size={16} color={C.muted} /> : <ChevronRight size={16} color={C.muted} />}
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: channelColor[c.channel] }} />
                <span style={{ fontWeight: 600, fontSize: 14.5 }}>{c.channel}</span>
                <Badge tier={c.tier} />
                <button
                  onClick={(e) => { e.stopPropagation(); toggleEvidence(c.channel); }}
                  style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: FONT_MONO, fontSize: 11, color: meta.color, textDecoration: "underline", textDecorationStyle: "dotted" }}
                  title="Click to see each signal's threshold and actual value"
                >
                  Confidence: {meta.short} · Evidence: {c.signalCount}/5 signals
                  {isEvidenceOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </button>
              </div>
              <div style={{ display: "flex", gap: 16, fontFamily: FONT_MONO, fontSize: 12, color: C.muted }}>
                <span>n={c.n}</span><span>{c.activationRate}%</span>
                <span style={{ color: C.red }}>drops at {STEP_LABELS[c.worstStep]}</span>
              </div>
            </div>

            {isEvidenceOpen && (
              <div style={{ padding: "0 20px 16px", borderTop: `1px solid ${C.border}` }} onClick={(e) => e.stopPropagation()}>
                <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO, margin: "14px 0 8px", textTransform: "uppercase" }}>Evidence signal breakdown</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left" }}>
                      <th style={{ padding: "4px 8px 4px 0", color: C.faint, fontWeight: 500, fontSize: 11 }}>Signal</th>
                      <th style={{ padding: "4px 8px", color: C.faint, fontWeight: 500, fontSize: 11 }}>Threshold</th>
                      <th style={{ padding: "4px 8px", color: C.faint, fontWeight: 500, fontSize: 11 }}>Actual</th>
                      <th style={{ padding: "4px 0", color: C.faint, fontWeight: 500, fontSize: 11 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.signals.map((s) => (
                      <tr key={s.label} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: "8px 8px 8px 0", color: C.text }}>{s.label}</td>
                        <td style={{ padding: "8px 8px", color: C.muted, fontFamily: FONT_MONO }}>{s.threshold}</td>
                        <td style={{ padding: "8px 8px", color: C.text, fontFamily: FONT_MONO }}>{s.actual}</td>
                        <td style={{ padding: "8px 0" }}>
                          {s.passed
                            ? <CheckCircle2 size={16} color={C.green} />
                            : <XCircle size={16} color={C.red} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {isOpen && (
              <div style={{ padding: "0 20px 20px", borderTop: `1px solid ${C.border}` }}>
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 6, fontFamily: FONT_MONO, textTransform: "uppercase" }}>Evidence</div>
                  {c.bullets.length ? (
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#D5DCEA", display: "flex", flexDirection: "column", gap: 4 }}>
                      {c.bullets.map((b, i) => <li key={i}>✓ {b}</li>)}
                    </ul>
                  ) : <p style={{ color: C.faint, fontSize: 12.5, margin: 0 }}>No strong contributing signals detected in this cohort beyond the funnel shape itself.</p>}
                </div>
                {exp ? (
                  <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                    <InsightRow label="WHY" color={C.red} text={exp.why} />
                    <InsightRow label="FIX" color={C.green} text={exp.fix} />
                    <InsightRow label="METRIC" color={C.teal} text={exp.metric} />
                  </div>
                ) : (
                  <p style={{ color: C.faint, fontSize: 12.5, marginTop: 14 }}>Click "Generate AI explanations" above to have the AI write the WHY/FIX/METRIC for every cohort based on this evidence.</p>
                )}
                <div style={{ display: "flex", gap: 20, marginTop: 14, fontSize: 12, color: C.muted, flexWrap: "wrap" }}>
                  <span>Median time-to-launch: <b style={{ color: C.text }}>{c.medianDays != null ? `${c.medianDays}d` : "—"}</b></span>
                  <span>Potential lift to target: <b style={{ color: C.teal }}>+{c.potentialLift}%</b> (~{c.expectedMerchants} merchants, ~${c.expectedGmv.toLocaleString()})</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
function InsightRow({ label, color, text }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, color, background: `${color}18`, border: `1px solid ${color}44`, borderRadius: 6, padding: "3px 8px", flexShrink: 0, minWidth: 58, textAlign: "center" }}>{label}</span>
      <span style={{ fontSize: 13, color: "#D5DCEA", lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}
function PriorityTab({ cohortInsights }) {
  const sorted = [...cohortInsights].sort((a, b) => b.priority - a.priority);
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: C.panelAlt, textAlign: "left" }}>
            {["Opportunity", "Drop Step", "Impact", "Effort", "Priority", "Expected Lift"].map((h) => (
              <th key={h} style={{ padding: "10px 16px", color: C.muted, fontFamily: FONT_MONO, fontSize: 11, fontWeight: 500, textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.channel} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: "12px 16px", fontWeight: 600 }}>{c.channel}</td>
              <td style={{ padding: "12px 16px", color: C.muted }}>{STEP_LABELS[c.worstStep]}</td>
              <td style={{ padding: "12px 16px" }}><ImpactPill tier={c.impactTier} /></td>
              <td style={{ padding: "12px 16px" }}><ImpactPill tier={c.effortTier} muted /></td>
              <td style={{ padding: "12px 16px" }}><Stars n={c.priority} /></td>
              <td style={{ padding: "12px 16px", color: C.teal, fontFamily: FONT_MONO, fontSize: 12.5 }}>+{c.expectedMerchants} merchants</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: C.faint, fontSize: 11.5, padding: "12px 16px" }}>Effort is a fixed heuristic per funnel step (Sign Up/Verify Email = Low, Store Details/Product = Medium, Payment = High) — adjust in code to match your actual engineering estimates.</p>
    </div>
  );
}
function ImpactPill({ tier, muted }) {
  const color = tier === "High" ? C.red : tier === "Medium" ? C.amber : C.green;
  return <span style={{ fontSize: 12, fontWeight: 600, color: muted ? C.muted : color }}>{tier}</span>;
}
function BenchmarksTab({ overall, cohortInsights, targetBenchmark, industryBenchmark, channelColor }) {
  const data = cohortInsights.map((c) => ({ channel: c.channel, rate: c.activationRate }));
  const legendItems = [
    { label: "Company average", value: overall.activationRate, color: C.muted },
    { label: "Target", value: targetBenchmark, color: C.teal },
    { label: "Industry benchmark", value: industryBenchmark, color: C.amber },
  ];
  const worst = [...cohortInsights].sort((a, b) => a.activationRate - b.activationRate)[0];
  const gapToAvg = worst ? Math.max(0, overall.activationRate - worst.activationRate) : 0;
  const gapToIndustry = worst ? Math.max(0, industryBenchmark - worst.activationRate) : 0;

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>Activation vs. benchmarks</h3>

      {worst && (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: C.redDim, border: `1px solid ${C.red}44`, borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <TrendingDown size={16} color={C.red} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 13, color: "#F0D7DC", lineHeight: 1.5 }}>
            <b style={{ color: C.text }}>{worst.channel}</b> is the weakest performer at <b>{worst.activationRate}%</b> activation —
            {gapToAvg > 0 && <> {gapToAvg.toFixed(1)} pts below the company average</>}
            {gapToAvg > 0 && gapToIndustry > 0 && " and"}
            {gapToIndustry > 0 && <> {gapToIndustry.toFixed(1)} pts below the industry benchmark</>}.
            {" "}The biggest drop happens at <b>{STEP_LABELS[worst.worstStep]}</b> ({worst.worstDrop}% of this cohort's drop-off){worst.bullets.length ? <>, and {worst.bullets[0].toLowerCase()}</> : ""}.
            {" "}See the Cohort Insights tab for the full evidence and a recommended fix.
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
          <XAxis dataKey="channel" stroke={C.muted} fontSize={11} />
          <YAxis stroke={C.muted} fontSize={12} unit="%" />
          <Tooltip
            contentStyle={{ background: C.panelAlt, border: `1px solid ${C.borderLight}`, borderRadius: 8, fontSize: 12 }}
            itemStyle={{ color: C.text }}
            labelStyle={{ color: C.muted, marginBottom: 4 }}
            formatter={(value) => [`${value}%`, "Activation rate"]}
          />
          <ReferenceLine y={overall.activationRate} stroke={C.muted} strokeDasharray="3 3" strokeWidth={1.5} />
          <ReferenceLine y={targetBenchmark} stroke={C.teal} strokeDasharray="3 3" strokeWidth={1.5} />
          <ReferenceLine y={industryBenchmark} stroke={C.amber} strokeDasharray="3 3" strokeWidth={1.5} />
          <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
            {data.map((d) => <Cell key={d.channel} fill={channelColor[d.channel]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
        {legendItems.map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="20" height="10"><line x1="0" y1="5" x2="20" y2="5" stroke={item.color} strokeWidth="2" strokeDasharray="3 3" /></svg>
            <span style={{ fontSize: 12.5, color: C.muted }}>{item.label}</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: item.color, fontWeight: 600 }}>{item.value.toFixed(1)}%</span>
          </div>
        ))}
      </div>

      <p style={{ color: C.faint, fontSize: 11.5, marginTop: 12 }}>Company average, target, and industry benchmark are editable above the tabs — set them to match your real economics.</p>
    </div>
  );
}
const TIER_STYLE = {
  normal: { label: "Normal", color: C.muted, dot: false },
  elevated: { label: null, color: C.amber, dot: false }, // shows "+X%" instead of a fixed label
  abnormal: { label: "Abnormally High", color: C.red, dot: true },
};

function SegmentTable({ title, rows }) {
  if (!rows.length) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT_MONO, marginBottom: 8, textTransform: "uppercase" }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th style={{ padding: "4px 0", color: C.faint, fontWeight: 500, fontSize: 11 }}>Segment</th>
            <th style={{ padding: "4px 0", color: C.faint, fontWeight: 500, fontSize: 11 }}>Drop Rate</th>
            <th style={{ padding: "4px 0", color: C.faint, fontWeight: 500, fontSize: 11 }}>vs Average</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const meta = TIER_STYLE[r.tier];
            return (
              <tr key={r.key} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={{ padding: "8px 0", color: C.text }}>{r.key}</td>
                <td style={{ padding: "8px 0", fontFamily: FONT_MONO, color: C.text }}>{r.rate}%</td>
                <td style={{ padding: "8px 0" }}>
                  {meta.dot && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: meta.color }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: meta.color }} />{meta.label}</span>}
                  {!meta.dot && meta.label && <span style={{ color: meta.color }}>{meta.label}</span>}
                  {!meta.dot && !meta.label && <span style={{ color: meta.color, fontFamily: FONT_MONO }}>{r.deltaPoints > 0 ? "+" : ""}{r.deltaPoints}%</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ContributingSegmentsModal({ data, onClose }) {
  const worst = [...data.byDevice, ...data.byBiz].filter((r) => r.tier === "abnormal").sort((a, b) => b.rate - a.rate)[0];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#00000099", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.borderLight}`, borderRadius: 12, padding: 24, width: 480, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>Contributing segments: {data.channel} → {STEP_LABELS[data.step]}</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer" }}><X size={18} /></button>
        </div>

        {data.totalDropped === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.greenDim, border: `1px solid ${C.green}44`, borderRadius: 8, padding: "14px 16px", marginTop: 12 }}>
            <CheckCircle2 size={18} color={C.green} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: C.text }}>
              All {data.totalAtRisk} {data.channel} merchants who reached this step made it through — 0% drop-off, nothing to break down.
            </span>
          </div>
        ) : (
          <>
            <p style={{ color: C.faint, fontSize: 12, marginBottom: 16 }}>
              {data.totalDropped} of {data.totalAtRisk} merchants who reached this step dropped here (overall rate: {data.overallRate}%). Drop rate below is per-segment, not just share of the drop pile.
            </p>

            {worst && (
              <div style={{ background: C.redDim, border: `1px solid ${C.red}44`, borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 13, color: "#F0D7DC" }}>
                "<b style={{ color: C.text }}>{worst.key}</b> users are abandoning {STEP_LABELS[data.step]} at {(worst.rate / data.overallRate).toFixed(1)}x the normal rate."
              </div>
            )}

            <SegmentTable title="By device" rows={data.byDevice} />
            <SegmentTable title="By business type" rows={data.byBiz} />

            {data.byDevice.length === 0 && data.byBiz.length === 0 && <p style={{ color: C.faint, fontSize: 12.5 }}>Upload device/business_type columns to enable segment-level breakdowns.</p>}
          </>
        )}
      </div>
    </div>
  );
}
