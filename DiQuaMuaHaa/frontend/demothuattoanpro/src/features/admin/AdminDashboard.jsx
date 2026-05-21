import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Car,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  MapPinned,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getDmsApiBase } from "../../config/apiEndpoints";

const API_BASE = getDmsApiBase();

const ALERT_LABELS = {
  phone: "Dùng điện thoại",
  smoking: "Hút thuốc",
  drowsy: "Buồn ngủ",
  identity_lock: "Khóa danh tính",
  landmark_risk: "Rủi ro landmark",
  other: "Khác",
};

const ALERT_COLORS = {
  phone: "#f97316",
  smoking: "#ef4444",
  drowsy: "#eab308",
  identity_lock: "#8b5cf6",
  landmark_risk: "#06b6d4",
  other: "#64748b",
};

function fmtNumber(value) {
  return new Intl.NumberFormat("vi-VN").format(Number(value || 0));
}

function fmtDate(value) {
  if (!value) return "--";
  const d = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function imageSrc(raw) {
  if (!raw) return "";
  return raw.startsWith("data:") ? raw : `data:image/jpeg;base64,${raw}`;
}

function safeFileName(value) {
  return String(value || "driver")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "driver";
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\r?\n/g, " ");
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadTextFile(filename, content, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["\ufeff", content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildDriverCsv(driver) {
  const rows = [];
  rows.push(["DMS DRIVER REPORT"]);
  rows.push(["Driver ID", driver.driver_id]);
  rows.push(["Name", driver.name]);
  rows.push(["Registered at", driver.registered_at]);
  rows.push(["Telegram bound", driver.telegram?.bound ? "yes" : "no"]);
  rows.push(["Telegram chat id", driver.telegram?.chat_id || ""]);
  rows.push(["Total sessions", driver.stats?.sessions || 0]);
  rows.push(["Active sessions", driver.stats?.active_sessions || 0]);
  rows.push(["Total minutes", driver.stats?.total_minutes || 0]);
  rows.push(["Total alerts", driver.stats?.total_alerts || 0]);
  rows.push(["GPS points", driver.stats?.gps_points || 0]);
  rows.push([]);

  rows.push(["ALERT SUMMARY"]);
  rows.push(["Alert type", "Count"]);
  Object.entries(driver.stats?.alerts || {}).forEach(([key, value]) => {
    rows.push([ALERT_LABELS[key] || key, value]);
  });
  rows.push([]);

  rows.push(["SESSION HISTORY"]);
  rows.push([
    "Session ID",
    "Status",
    "Started at",
    "Ended at",
    "Duration min",
    "Alert count",
    "Route source",
    "GPS points",
    "Address",
    "Alerts JSON",
  ]);
  (driver.sessions || []).forEach((session) => {
    rows.push([
      session.session_id,
      session.status,
      session.started_at,
      session.ended_at || "",
      session.duration_min,
      session.alert_count,
      session.route_source,
      session.location_count,
      session.address,
      JSON.stringify(session.alerts || {}),
    ]);
  });
  rows.push([]);

  rows.push(["TELEGRAM DECISIONS"]);
  rows.push([
    "Request ID",
    "Status",
    "Reason",
    "Similarity",
    "Threshold",
    "Requested at",
    "Decided at",
    "Telegram chat id",
  ]);
  (driver.decisions || []).forEach((item) => {
    rows.push([
      item.request_id,
      item.status,
      item.reason || "",
      item.similarity ?? "",
      item.threshold ?? "",
      item.requested_at,
      item.decided_at || "",
      item.telegram_chat_id || "",
    ]);
  });
  rows.push([]);

  rows.push(["GPS ROUTE POINTS"]);
  rows.push(["Session ID", "Point", "Lat", "Lng", "Accuracy", "Speed", "Heading", "Recorded at"]);
  (driver.sessions || []).forEach((session) => {
    (session.route || []).forEach((point, idx) => {
      rows.push([
        session.session_id,
        point.label || idx + 1,
        point.lat,
        point.lng,
        point.accuracy ?? "",
        point.speed ?? "",
        point.heading ?? "",
        point.recorded_at || "",
      ]);
    });
  });

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function exportDriverCsv(driver) {
  if (!driver) return;
  const stamp = new Date().toISOString().slice(0, 10);
  downloadTextFile(
    `dms_report_${safeFileName(driver.driver_id)}_${stamp}.csv`,
    buildDriverCsv(driver),
  );
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openDriverPdfReport(driver) {
  if (!driver) return;
  const alertRows = Object.entries(driver.stats?.alerts || {})
    .map(
      ([key, value]) =>
        `<tr><td>${htmlEscape(ALERT_LABELS[key] || key)}</td><td>${htmlEscape(value)}</td></tr>`,
    )
    .join("");
  const sessionRows = (driver.sessions || [])
    .map(
      (session) => `
        <tr>
          <td>#${htmlEscape(session.session_id)}</td>
          <td>${htmlEscape(session.status)}</td>
          <td>${htmlEscape(fmtDate(session.started_at))}</td>
          <td>${htmlEscape(fmtDate(session.ended_at))}</td>
          <td>${htmlEscape(session.duration_min)} phút</td>
          <td>${htmlEscape(session.alert_count)}</td>
          <td>${htmlEscape(session.route_source === "gps" ? "GPS thật" : "Mô phỏng")}</td>
          <td>${htmlEscape(session.location_count || 0)}</td>
        </tr>`,
    )
    .join("");
  const decisionRows = (driver.decisions || [])
    .slice(0, 20)
    .map(
      (item) => `
        <tr>
          <td>#${htmlEscape(item.request_id)}</td>
          <td>${htmlEscape(item.status)}</td>
          <td>${htmlEscape(item.reason || "")}</td>
          <td>${typeof item.similarity === "number" ? htmlEscape(`${(item.similarity * 100).toFixed(1)}%`) : "--"}</td>
          <td>${htmlEscape(fmtDate(item.requested_at))}</td>
          <td>${htmlEscape(fmtDate(item.decided_at))}</td>
        </tr>`,
    )
    .join("");
  const latestRoute = driver.sessions?.[0]?.route || [];
  const routeRows = latestRoute
    .map(
      (point, idx) => `
        <tr>
          <td>${htmlEscape(point.label || idx + 1)}</td>
          <td>${htmlEscape(point.lat)}</td>
          <td>${htmlEscape(point.lng)}</td>
          <td>${htmlEscape(point.accuracy ?? "")}</td>
          <td>${htmlEscape(point.recorded_at || "")}</td>
        </tr>`,
    )
    .join("");

  const reportHtml = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>DMS Report - ${htmlEscape(driver.driver_id)}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;margin:0;color:#0f172a;background:#f8fafc}
    main{max-width:980px;margin:0 auto;padding:28px}
    header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #0f172a;padding-bottom:18px;margin-bottom:22px}
    h1{font-size:28px;margin:0 0 8px}
    h2{font-size:17px;margin:26px 0 10px}
    .muted{color:#64748b;font-size:12px}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}
    .tile{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:12px}
    .tile b{display:block;font-size:22px;margin-top:4px}
    table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #cbd5e1}
    th,td{border-bottom:1px solid #e2e8f0;text-align:left;padding:8px;font-size:12px;vertical-align:top}
    th{background:#e2e8f0;font-size:11px;text-transform:uppercase;color:#475569}
    .profile{display:flex;gap:14px;align-items:center}
    .avatar{width:72px;height:72px;border-radius:8px;object-fit:cover;border:1px solid #cbd5e1}
    .badge{display:inline-block;border-radius:999px;background:#dcfce7;color:#166534;padding:4px 8px;font-weight:700;font-size:11px}
    @media print{body{background:#fff} main{padding:0}.no-print{display:none}}
  </style>
</head>
<body>
  <main>
    <button class="no-print" onclick="window.print()" style="float:right;margin-bottom:16px;padding:8px 14px;border:0;border-radius:8px;background:#0f172a;color:white;font-weight:700">In / Lưu PDF</button>
    <header>
      <div class="profile">
        ${imageSrc(driver.image_base64) ? `<img class="avatar" src="${htmlEscape(imageSrc(driver.image_base64))}" />` : ""}
        <div>
          <h1>Báo cáo giám sát tài xế</h1>
          <div><b>${htmlEscape(driver.name || driver.driver_id)}</b> · <code>${htmlEscape(driver.driver_id)}</code></div>
          <div class="muted">Ngày xuất báo cáo: ${htmlEscape(fmtDate(new Date().toISOString()))}</div>
        </div>
      </div>
      <div>
        <span class="badge">${driver.telegram?.bound ? "Đã liên kết Telegram" : "Chưa liên kết Telegram"}</span>
        <div class="muted" style="margin-top:8px">Chat ID: ${htmlEscape(driver.telegram?.chat_id || "--")}</div>
      </div>
    </header>

    <section class="grid">
      <div class="tile">Tổng phiên<b>${htmlEscape(driver.stats?.sessions || 0)}</b></div>
      <div class="tile">Phút lái<b>${htmlEscape(driver.stats?.total_minutes || 0)}</b></div>
      <div class="tile">Cảnh báo<b>${htmlEscape(driver.stats?.total_alerts || 0)}</b></div>
      <div class="tile">Điểm GPS<b>${htmlEscape(driver.stats?.gps_points || 0)}</b></div>
    </section>

    <h2>Tổng hợp cảnh báo</h2>
    <table><thead><tr><th>Loại</th><th>Số lần</th></tr></thead><tbody>${alertRows || "<tr><td colspan='2'>Không có cảnh báo</td></tr>"}</tbody></table>

    <h2>Lịch sử phiên lái</h2>
    <table><thead><tr><th>Phiên</th><th>Trạng thái</th><th>Bắt đầu</th><th>Kết thúc</th><th>Thời lượng</th><th>Cảnh báo</th><th>Route</th><th>GPS</th></tr></thead><tbody>${sessionRows || "<tr><td colspan='8'>Chưa có phiên lái</td></tr>"}</tbody></table>

    <h2>Quyết định Telegram</h2>
    <table><thead><tr><th>Request</th><th>Status</th><th>Reason</th><th>Similarity</th><th>Requested</th><th>Decided</th></tr></thead><tbody>${decisionRows || "<tr><td colspan='6'>Chưa có quyết định</td></tr>"}</tbody></table>

    <h2>GPS route gần nhất</h2>
    <table><thead><tr><th>Điểm</th><th>Lat</th><th>Lng</th><th>Accuracy</th><th>Recorded at</th></tr></thead><tbody>${routeRows || "<tr><td colspan='5'>Chưa có GPS thật</td></tr>"}</tbody></table>
  </main>
  <script>setTimeout(() => window.print(), 300)</script>
</body>
</html>`;

  const reportWindow = window.open("", "_blank", "width=1100,height=800");
  if (!reportWindow) return;
  reportWindow.document.open();
  reportWindow.document.write(reportHtml);
  reportWindow.document.close();
}

function StatTile({ icon: Icon, label, value, tone = "cyan", detail }) {
  const toneMap = {
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  };
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${toneMap[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-right text-xs font-medium text-slate-500">{label}</span>
      </div>
      <div className="mt-4 text-2xl font-bold text-slate-950">{value}</div>
      {detail && <div className="mt-1 text-xs text-slate-500">{detail}</div>}
    </section>
  );
}

function DriverAvatar({ driver }) {
  const src = imageSrc(driver?.image_base64);
  if (src) {
    return (
      <img
        src={src}
        alt={driver?.name || driver?.driver_id}
        className="h-12 w-12 rounded-lg object-cover ring-1 ring-slate-200"
      />
    );
  }
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500 ring-1 ring-slate-200">
      <UserRound className="h-6 w-6" />
    </div>
  );
}

function RoutePreview({ points = [] }) {
  if (!points.length) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        Chưa có lộ trình
      </div>
    );
  }

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const w = 640;
  const h = 240;
  const pad = 28;
  const xy = points.map((p) => {
    const x = pad + ((p.lng - minLng) / Math.max(0.00001, maxLng - minLng)) * (w - pad * 2);
    const y = h - pad - ((p.lat - minLat) / Math.max(0.00001, maxLat - minLat)) * (h - pad * 2);
    return { ...p, x, y };
  });
  const path = xy.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-[#f8fafc]">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-48 w-full">
        <defs>
          <linearGradient id="adminRoute" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="55%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <path d="M0 72 C120 20 180 118 320 66 S520 36 640 92" fill="none" stroke="#e2e8f0" strokeWidth="18" />
        <path d="M0 178 C150 130 250 210 390 160 S530 132 640 172" fill="none" stroke="#e2e8f0" strokeWidth="14" />
        <polyline points={path} fill="none" stroke="url(#adminRoute)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="7" />
        {xy.map((p, idx) => (
          <g key={`${p.lat}-${p.lng}`}>
            <circle cx={p.x} cy={p.y} r={idx === 0 || idx === xy.length - 1 ? 9 : 6} fill={idx === 0 ? "#22c55e" : idx === xy.length - 1 ? "#ef4444" : "#0f172a"} stroke="#fff" strokeWidth="3" />
            <text x={p.x + 11} y={p.y - 8} fill="#334155" fontSize="12" fontWeight="700">{p.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [modelData, setModelData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/drivers`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Không tải được admin data");
      setData(json);
      setSelectedId((prev) => prev || json?.drivers?.[0]?.driver_id || "");
      const modelRes = await fetch(`${API_BASE}/api/admin/model_analytics`);
      const modelJson = await modelRes.json();
      if (modelRes.ok) setModelData(modelJson);
    } catch (err) {
      setError(err.message || "Không tải được admin data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const drivers = data?.drivers || [];
  const selected = drivers.find((d) => d.driver_id === selectedId) || drivers[0] || null;
  const sessions = selected?.sessions || [];
  const latestSession = sessions[0] || null;

  const alertChart = useMemo(() => {
    const alerts = selected?.stats?.alerts || data?.stats?.alerts || {};
    return Object.entries(alerts).map(([key, value]) => ({
      key,
      name: ALERT_LABELS[key] || key,
      value,
      color: ALERT_COLORS[key] || ALERT_COLORS.other,
    }));
  }, [selected, data]);

  const driverBars = useMemo(
    () =>
      drivers.map((d) => ({
        name: d.name || d.driver_id,
        sessions: d.stats?.sessions || 0,
        alerts: d.stats?.total_alerts || 0,
      })),
    [drivers],
  );

  const timeline = data?.timeline || [];
  const modelAnalytics = modelData?.models || [];

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-cyan-700">
              <ShieldCheck className="h-4 w-4" />
              DMS Admin Control
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              Quản trị tài xế, danh tính và lịch trình
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => exportDriverCsv(selected)}
              disabled={!selected}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Xuất CSV
            </button>
            <button
              type="button"
              onClick={() => openDriverPdfReport(selected)}
              disabled={!selected}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-sm font-semibold text-cyan-800 shadow-sm transition hover:bg-cyan-100 disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              In PDF
            </button>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Làm mới dữ liệu
          </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile icon={UserRound} label="Tài xế đã đăng ký" value={fmtNumber(data?.stats?.drivers)} tone="cyan" />
          <StatTile icon={Activity} label="Phiên đang chạy" value={fmtNumber(data?.stats?.active_sessions)} tone="green" />
          <StatTile icon={CalendarClock} label="Tổng phiên lái" value={fmtNumber(data?.stats?.sessions)} tone="amber" />
          <StatTile icon={AlertTriangle} label="Tổng cảnh báo" value={fmtNumber(data?.stats?.total_alerts)} tone="rose" detail={`${fmtNumber(data?.stats?.total_minutes)} phút ghi nhận`} />
        </section>

        <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold">Danh sách tài xế</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {fmtNumber(drivers.length)}
              </span>
            </div>
            <div className="max-h-[650px] overflow-y-auto p-2">
              {drivers.map((driver) => {
                const active = driver.driver_id === selected?.driver_id;
                return (
                  <button
                    key={driver.driver_id}
                    type="button"
                    onClick={() => setSelectedId(driver.driver_id)}
                    className={`mb-2 flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
                      active
                        ? "border-cyan-300 bg-cyan-50"
                        : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <DriverAvatar driver={driver} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-950">
                        {driver.name || driver.driver_id}
                      </span>
                      <span className="block truncate font-mono text-xs text-slate-500">
                        {driver.driver_id}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <Car className="h-3.5 w-3.5" />
                        {fmtNumber(driver.stats?.sessions)} phiên
                        <span className="text-slate-300">|</span>
                        {fmtNumber(driver.stats?.total_alerts)} cảnh báo
                      </span>
                    </span>
                    {driver.telegram?.bound && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                  </button>
                );
              })}
              {!drivers.length && !loading && (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  Chưa có tài xế nào trong database
                </div>
              )}
            </div>
          </aside>

          <section className="grid gap-5">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              {selected ? (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="flex gap-4">
                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
                      {imageSrc(selected.image_base64) ? (
                        <img src={imageSrc(selected.image_base64)} alt={selected.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <UserRound className="h-10 w-10" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-2xl font-bold">{selected.name}</h2>
                      <p className="mt-1 font-mono text-sm text-slate-500">{selected.driver_id}</p>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                        <div>Đăng ký: <b className="text-slate-900">{fmtDate(selected.registered_at)}</b></div>
                        <div>Telegram: <b className={selected.telegram?.bound ? "text-emerald-700" : "text-rose-700"}>{selected.telegram?.bound ? "Đã liên kết" : "Chưa liên kết"}</b></div>
                        <div>Chat ID: <b className="font-mono text-slate-900">{selected.telegram?.chat_id || "--"}</b></div>
                        <div>Địa chỉ: <b className="text-slate-900">{selected.address}</b></div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatTile icon={Car} label="Phiên" value={fmtNumber(selected.stats?.sessions)} tone="cyan" />
                    <StatTile icon={Clock3} label="Phút lái" value={fmtNumber(selected.stats?.total_minutes)} tone="green" />
                    <StatTile icon={Activity} label="Đang chạy" value={fmtNumber(selected.stats?.active_sessions)} tone="amber" />
                    <StatTile icon={MapPinned} label="Điểm GPS" value={fmtNumber(selected.stats?.gps_points)} tone="rose" />
                  </div>
                </div>
              ) : (
                <div className="py-10 text-center text-slate-500">Chọn một tài xế để xem chi tiết</div>
              )}
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold">Biểu đồ cảnh báo</h3>
                  <span className="text-xs text-slate-500">Theo tài xế đang chọn</span>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={alertChart} dataKey="value" nameKey="name" innerRadius={58} outerRadius={94} paddingAngle={3}>
                        {alertChart.map((entry) => (
                          <Cell key={entry.key} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {alertChart.map((a) => (
                    <div key={a.key} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
                        {a.name}
                      </span>
                      <b>{fmtNumber(a.value)}</b>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold">Hoạt động theo ngày</h3>
                  <span className="text-xs text-slate-500">14 ngày gần nhất</span>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeline}>
                      <defs>
                        <linearGradient id="sessionsFill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#0891b2" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#0891b2" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="sessions" name="Phiên" stroke="#0891b2" fill="url(#sessionsFill)" strokeWidth={2} />
                      <Area type="monotone" dataKey="alerts" name="Cảnh báo" stroke="#f97316" fill="#fed7aa" fillOpacity={0.24} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">So sánh tài xế</h3>
                <span className="text-xs text-slate-500">Phiên lái và cảnh báo</span>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={driverBars}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="sessions" name="Phiên" fill="#0f766e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="alerts" name="Cảnh báo" fill="#e11d48" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <MapPinned className="h-5 w-5 text-cyan-700" />
                  <h3 className="font-semibold">Lộ trình gần nhất</h3>
                </div>
                <RoutePreview points={latestSession?.route || []} />
                <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                  <div>Phiên: <b className="text-slate-900">{latestSession?.session_id || "--"}</b></div>
                  <div>Trạng thái: <b className={latestSession?.status === "active" ? "text-emerald-700" : "text-slate-900"}>{latestSession?.status || "--"}</b></div>
                  <div>Nguồn route: <b className={latestSession?.route_source === "gps" ? "text-emerald-700" : "text-amber-700"}>{latestSession?.route_source === "gps" ? "GPS thật" : "Mô phỏng"}</b></div>
                  <div>Số điểm GPS: <b className="text-slate-900">{fmtNumber(latestSession?.location_count)}</b></div>
                  <div>Bắt đầu: <b className="text-slate-900">{fmtDate(latestSession?.started_at)}</b></div>
                  <div>Kết thúc: <b className="text-slate-900">{fmtDate(latestSession?.ended_at)}</b></div>
                  <div className="sm:col-span-2">Địa chỉ: <b className="text-slate-900">{latestSession?.address || "--"}</b></div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="mb-4 font-semibold">Quyết định Telegram</h3>
                <div className="space-y-3">
                  {(selected?.decisions || []).slice(0, 6).map((item) => (
                    <div key={item.request_id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-xs text-slate-500">#{item.request_id}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          item.status === "accepted"
                            ? "bg-emerald-100 text-emerald-700"
                            : item.status === "rejected"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                        }`}>
                          {item.status}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-600">
                        {fmtDate(item.requested_at)} · similarity{" "}
                        {typeof item.similarity === "number" ? `${(item.similarity * 100).toFixed(1)}%` : "--"}
                      </div>
                    </div>
                  ))}
                  {!selected?.decisions?.length && (
                    <div className="rounded-lg border border-dashed border-slate-300 px-3 py-8 text-center text-sm text-slate-500">
                      Chưa có request Telegram
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="font-semibold">Lịch sử phiên lái</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3">Phiên</th>
                      <th className="px-5 py-3">Thời gian</th>
                      <th className="px-5 py-3">Thời lượng</th>
                      <th className="px-5 py-3">Cảnh báo</th>
                      <th className="px-5 py-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sessions.map((session) => (
                      <tr key={session.session_id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-mono">#{session.session_id}</td>
                        <td className="px-5 py-3">
                          <div>{fmtDate(session.started_at)}</div>
                          <div className="text-xs text-slate-500">{fmtDate(session.ended_at)}</div>
                        </td>
                        <td className="px-5 py-3">{fmtNumber(session.duration_min)} phút</td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(session.alerts || {}).map(([key, value]) => (
                              <span key={key} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                {ALERT_LABELS[key] || key}: {value}
                              </span>
                            ))}
                            {!Object.keys(session.alerts || {}).length && <span className="text-slate-400">Không có</span>}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-bold ${
                            session.status === "active"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}>
                            {session.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!sessions.length && (
                      <tr>
                        <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                          Tài xế này chưa có phiên lái
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Model Analytics</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Accuracy, precision/recall/F1 và confusion matrix từ dataset local.
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {modelData?.generated_at ? `Cập nhật ${fmtDate(modelData.generated_at)}` : "Đang tải"}
                  </span>
                </div>
              </div>
              <div className="grid gap-5 p-5">
                {modelAnalytics.map((modelItem) => (
                  <ModelAnalyticsPanel key={modelItem.key} model={modelItem} />
                ))}
                {!modelAnalytics.length && (
                  <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
                    Chưa tải được dữ liệu đánh giá model
                  </div>
                )}
              </div>
            </section>
          </section>
        </section>
      </div>
    </main>
  );
}

function pct(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return `${(value * 100).toFixed(1)}%`;
}

function ModelAnalyticsPanel({ model }) {
  if (!model?.available) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="font-bold text-amber-950">{model?.title || "Model"}</h4>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
            Chưa sẵn sàng
          </span>
        </div>
        <p className="mt-2 text-sm text-amber-800">{model?.error || "Không có dữ liệu đánh giá."}</p>
        <p className="mt-2 break-all font-mono text-xs text-amber-700">{model?.model_path}</p>
      </div>
    );
  }

  const classes = model.classes || [];
  const matrix = model.confusion_matrix || [];
  const maxCell = Math.max(1, ...matrix.flat().map((v) => Number(v || 0)));

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-bold text-slate-950">{model.title}</h4>
          <p className="mt-1 text-xs text-slate-500">
            {fmtNumber(model.samples)} mẫu · {fmtNumber(model.features)} features · split {model.split}
          </p>
        </div>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
          Đã đánh giá
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricBox label="Accuracy" value={pct(model.accuracy)} />
        <MetricBox label="Precision" value={pct(model.macro_precision)} />
        <MetricBox label="Recall" value={pct(model.macro_recall)} />
        <MetricBox label="Macro F1" value={pct(model.macro_f1)} />
        <MetricBox label="Weighted F1" value={pct(model.weighted_f1)} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-3 text-sm font-semibold text-slate-700">Confusion matrix</div>
          <div
            className="grid min-w-max gap-1"
            style={{ gridTemplateColumns: `120px repeat(${classes.length}, minmax(68px, 1fr))` }}
          >
            <div />
            {classes.map((name) => (
              <div key={`head-${name}`} className="truncate rounded bg-slate-100 px-2 py-1 text-center text-xs font-bold text-slate-600">
                {name}
              </div>
            ))}
            {matrix.map((row, rowIdx) => (
              <React.Fragment key={classes[rowIdx] || rowIdx}>
                <div className="truncate rounded bg-slate-100 px-2 py-2 text-xs font-bold text-slate-600">
                  True: {classes[rowIdx]}
                </div>
                {row.map((value, colIdx) => {
                  const intensity = Number(value || 0) / maxCell;
                  const isHit = rowIdx === colIdx;
                  return (
                    <div
                      key={`${rowIdx}-${colIdx}`}
                      className="rounded px-2 py-2 text-center text-sm font-bold"
                      style={{
                        background: isHit
                          ? `rgba(16, 185, 129, ${0.16 + intensity * 0.72})`
                          : `rgba(244, 63, 94, ${0.08 + intensity * 0.55})`,
                        color: intensity > 0.55 ? "#0f172a" : "#334155",
                      }}
                    >
                      {value}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-3 text-sm font-semibold text-slate-700">Precision / Recall theo class</div>
          <div className="space-y-2">
            {classes.map((name) => {
              const item = model.per_class?.[name] || {};
              return (
                <div key={name} className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <b className="truncate">{name}</b>
                    <span className="text-xs text-slate-500">{fmtNumber(item.support)} mẫu test</span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-600">
                    <span>P: <b className="text-slate-900">{pct(item.precision)}</b></span>
                    <span>R: <b className="text-slate-900">{pct(item.recall)}</b></span>
                    <span>F1: <b className="text-slate-900">{pct(item.f1)}</b></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricBox({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-950">{value}</div>
    </div>
  );
}
