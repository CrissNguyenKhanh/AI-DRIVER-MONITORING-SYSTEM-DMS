import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, MapPinned, Navigation, RefreshCw, X } from "lucide-react";

/** Cùng tên event với `executeQuickAppAction("maps")` trong QuickAppsMenu. */
export const DMS_OTO_MAP_OPEN_EVENT = "dms-open-oto-map";

const DEFAULT_CENTER = [21.0285, 105.8542]; // Hà Nội — hiển thị trước khi có GPS
const TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ||
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

function carSvgHtml(headingDeg) {
  const h = Number.isFinite(headingDeg) ? headingDeg : 0;
  return `
  <div class="oto-car-marker-root" style="transform: translate(-50%, -50%) rotate(${h}deg); width:52px;height:52px;">
    <svg viewBox="0 0 64 64" width="52" height="52" aria-hidden="true" class="drop-shadow-[0_4px_12px_rgba(0,0,0,0.45)]">
      <defs>
        <linearGradient id="otoBody" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#22d3ee"/>
          <stop offset="100%" style="stop-color:#0284c7"/>
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="30" rx="15" ry="22" fill="url(#otoBody)" stroke="#e0f2fe" stroke-width="1.8"/>
      <path d="M22 22 Q32 10 42 22 L40 34 Q32 30 24 34 Z" fill="#bae6fd" opacity="0.95"/>
      <rect x="20" y="44" width="24" height="8" rx="2" fill="#0c4a6e"/>
      <rect x="14" y="26" width="6" height="14" rx="1.5" fill="#164e63"/>
      <rect x="44" y="26" width="6" height="14" rx="1.5" fill="#164e63"/>
      <ellipse cx="32" cy="52" rx="10" ry="3" fill="#000" opacity="0.25"/>
    </svg>
  </div>`;
}

function makeCarIcon(headingDeg) {
  return L.divIcon({
    className: "oto-leaflet-car-icon",
    html: carSvgHtml(headingDeg),
    iconSize: [52, 52],
    iconAnchor: [26, 26],
    popupAnchor: [0, -24],
  });
}

function MapResizeAndFollow({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    const id = requestAnimationFrame(() => map.invalidateSize());
    return () => cancelAnimationFrame(id);
  }, [map]);
  useEffect(() => {
    map.setView(center, zoom, { animate: true, duration: 0.35 });
  }, [center[0], center[1], zoom, map]);
  return null;
}

async function reverseGeocodeClient(lat, lng) {
  const u = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  u.searchParams.set("latitude", String(lat));
  u.searchParams.set("longitude", String(lng));
  u.searchParams.set("localityLanguage", "vi");
  const res = await fetch(u.toString());
  if (!res.ok) return null;
  return res.json();
}

function formatCoords(lat, lng) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export default function OtoLiveMapPanel({ open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [heading, setHeading] = useState(null);
  const [placeLabel, setPlaceLabel] = useState("");
  const [watchOn, setWatchOn] = useState(false);
  const watchIdRef = useRef(null);

  const center = lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER;
  const zoom = lat != null ? 17 : 12;
  const carIcon = useMemo(
    () => makeCarIcon(heading != null ? -heading : 0),
    [heading]
  );

  const applyPosition = useCallback((pos) => {
    const c = pos.coords;
    setLat(c.latitude);
    setLng(c.longitude);
    setAccuracy(
      typeof c.accuracy === "number" ? Math.round(c.accuracy) : null
    );
    setHeading(typeof c.heading === "number" && !Number.isNaN(c.heading) ? c.heading : null);
    setErr("");
  }, []);

  const fetchPlace = useCallback(async (la, ln) => {
    try {
      const data = await reverseGeocodeClient(la, ln);
      if (!data) {
        setPlaceLabel("");
        return;
      }
      const parts = [
        data.locality,
        data.city || data.localityInfo?.administrative?.[1]?.name,
        data.principalSubdivision,
        data.countryName,
      ].filter(Boolean);
      setPlaceLabel(parts.join(", ") || "");
    } catch {
      setPlaceLabel("");
    }
  }, []);

  useEffect(() => {
    if (lat == null || lng == null) return;
    const t = setTimeout(() => fetchPlace(lat, lng), 300);
    return () => clearTimeout(t);
  }, [lat, lng, fetchPlace]);

  const locateOnce = useCallback(() => {
    if (!navigator.geolocation) {
      setErr("Trình duyệt không hỗ trợ định vị (Geolocation).");
      return;
    }
    setLoading(true);
    setErr("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPosition(pos);
        setLoading(false);
      },
      (e) => {
        setLoading(false);
        if (e.code === 1)
          setErr("Bạn đã từ chối quyền vị trí. Hãy bật trong cài đặt trình duyệt.");
        else if (e.code === 2) setErr("Không lấy được vị trí (timeout / không khả dụng).");
        else setErr("Lỗi khi lấy vị trí. Thử lại sau.");
      },
      { enableHighAccuracy: true, timeout: 14_000, maximumAge: 0 }
    );
  }, [applyPosition]);

  useEffect(() => {
    if (!open) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setWatchOn(false);
      return;
    }
    locateOnce();
  }, [open, locateOnce]);

  useEffect(() => {
    if (!open || !watchOn || !navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => applyPosition(pos),
      () => setErr("Mất tín hiệu khi theo dõi. Thử bật lại."),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 }
    );
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [open, watchOn, applyPosition]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const gmapsHref =
    lat != null && lng != null
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : "https://www.google.com/maps";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Bản đồ Otoi"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm"
        aria-label="Đóng"
        onClick={() => onClose?.()}
      />
      <div
        className="relative z-[1] w-full max-w-5xl overflow-hidden rounded-3xl border border-cyan-400/35 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-[0_0_0_1px_rgba(34,211,238,0.12),0_24px_80px_rgba(0,0,0,0.65)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.12),transparent_55%)]" />

        <header className="relative flex flex-wrap items-start justify-between gap-3 border-b border-cyan-500/20 px-5 py-4 sm:px-6">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300/90">
              <MapPinned className="h-3.5 w-3.5" strokeWidth={2.5} />
              Otoi · Bản đồ nhúng
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">
              Dẫn đường theo xe của bạn
            </h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-400">
              Vị trí lấy qua API Geolocation của trình duyệt; biểu tượng trên bản đồ là ô tô
              (xoay theo hướng di chuyển nếu thiết bị hỗ trợ).
            </p>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-600/80 bg-slate-800/80 text-slate-200 transition hover:border-cyan-500/50 hover:bg-slate-700 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="relative grid gap-4 p-4 sm:grid-cols-[minmax(0,320px)_1fr] sm:p-5">
          <aside className="flex flex-col gap-3 rounded-2xl border border-slate-700/80 bg-slate-900/60 p-4 backdrop-blur-md">
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
              <Navigation className="h-4 w-4 text-cyan-400" />
              Thông tin vị trí
            </div>

            <label className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Địa chỉ ước tính
            </label>
            <div className="min-h-[2.75rem] rounded-xl border border-slate-600/60 bg-slate-950/80 px-3 py-2 text-sm leading-snug text-slate-200">
              {placeLabel || (lat != null ? "Đang tra cứu…" : "Chưa có vị trí")}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] font-medium uppercase text-slate-500">
                  Vĩ độ
                </span>
                <div className="mt-0.5 rounded-lg border border-slate-700 bg-slate-950/90 px-2 py-1.5 font-mono text-xs text-cyan-100">
                  {lat != null ? lat.toFixed(6) : "—"}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-medium uppercase text-slate-500">
                  Kinh độ
                </span>
                <div className="mt-0.5 rounded-lg border border-slate-700 bg-slate-950/90 px-2 py-1.5 font-mono text-xs text-cyan-100">
                  {lng != null ? lng.toFixed(6) : "—"}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
              {accuracy != null && (
                <span className="rounded-full border border-slate-600/60 bg-slate-800/80 px-2.5 py-1">
                  Sai số ~{accuracy} m
                </span>
              )}
              {heading != null && (
                <span className="rounded-full border border-slate-600/60 bg-slate-800/80 px-2.5 py-1">
                  Hướng {Math.round(heading)}°
                </span>
              )}
            </div>

            {err && (
              <p className="rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-xs text-amber-100">
                {err}
              </p>
            )}

            <div className="mt-auto flex flex-col gap-2 pt-1">
              <button
                type="button"
                disabled={loading}
                onClick={locateOnce}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-600 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/25 transition hover:brightness-110 disabled:opacity-60"
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
                {loading ? "Đang định vị…" : "Làm mới vị trí"}
              </button>
              <button
                type="button"
                onClick={() => setWatchOn((w) => !w)}
                className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                  watchOn
                    ? "border-cyan-400/60 bg-cyan-950/50 text-cyan-100"
                    : "border-slate-600 bg-slate-800/80 text-slate-200 hover:border-slate-500"
                }`}
              >
                <Crosshair className="h-4 w-4" />
                {watchOn ? "Đang theo dõi GPS" : "Theo dõi liên tục"}
              </button>
              <a
                href={gmapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-center text-[11px] text-slate-500 underline-offset-2 hover:text-cyan-300 hover:underline"
              >
                Mở cùng tọa độ trên Google Maps (tab mới)
              </a>
            </div>
          </aside>

          <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-2xl border border-slate-700/90 shadow-inner sm:min-h-[420px]">
            <MapContainer
              center={center}
              zoom={zoom}
              className="h-full min-h-[280px] w-full sm:min-h-[420px]"
              scrollWheelZoom
              zoomControl
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url={TILE_URL}
                subdomains="abcd"
              />
              <MapResizeAndFollow center={center} zoom={zoom} />
              {lat != null && lng != null && (
                <Marker position={[lat, lng]} icon={carIcon}>
                  <Popup>
                    <div className="text-xs font-medium text-slate-800">
                      <strong>Otoi</strong>
                      <br />
                      {formatCoords(lat, lng)}
                    </div>
                  </Popup>
                </Marker>
              )}
            </MapContainer>

            {lat == null && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/40">
                <p className="rounded-full border border-cyan-500/30 bg-slate-900/90 px-4 py-2 text-xs text-cyan-100">
                  Đang chờ GPS…
                </p>
              </div>
            )}
          </div>
        </div>

        <footer className="border-t border-slate-800/80 px-5 py-3 text-center text-[10px] text-slate-500">
          Bản đồ nền CARTO Voyager (OSM). Có thể đặt{" "}
          <code className="text-cyan-600/90">VITE_MAP_TILE_URL</code> trong{" "}
          <code className="text-cyan-600/90">.env</code> để dùng tile tùy chỉnh.
        </footer>
      </div>
    </div>
  );
}
