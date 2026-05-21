import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Car,
  CheckCircle2,
  Clock3,
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
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Làm mới dữ liệu
          </button>
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
          </section>
        </section>
      </div>
    </main>
  );
}
