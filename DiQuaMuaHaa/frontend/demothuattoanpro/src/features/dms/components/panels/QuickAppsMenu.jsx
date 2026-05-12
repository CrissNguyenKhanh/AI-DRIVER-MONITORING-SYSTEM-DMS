import React from "react";
import { DMS_OTO_MAP_OPEN_EVENT } from "./OtoLiveMapPanel";

/** Nhan backend / model train_hands (collect_hands KEY_MAP) */
export const HAND_LABEL_OPENS_MENU = "open";
/** Dong menu khi khong con ky hieu (hoac nut Dong) */
export const HAND_LABEL_CLOSES_MENU = "no_sign";

const APPS = {
  maps: {
    key: "maps",
    label: "Bản đồ Otoi",
    hint: "Ban do nhung + GPS (khong redirect)",
    url: "https://www.google.com/maps",
    icon: "🗺",
  },
  music: {
    key: "music",
    label: "Spotify",
    hint: "Ky hieu music",
    url: "https://open.spotify.com/",
    icon: "🎵",
  },
  phonecall: {
    key: "phonecall",
    label: "Goi dien",
    hint: "Ky hieu phonecall",
    url: "",
    icon: "📞",
  },
};

/**
 * Map nhan tay tu API -> key trong APPS (chi khi menu dang mo cho map/music/phone).
 */
export function handLabelToQuickAppKey(label) {
  if (!label) return null;
  const k = String(label).toLowerCase().trim();
  if (k === "map") return "maps";
  if (k === "music") return "music";
  if (k === "phonecall") return "phonecall";
  return null;
}

export function executeQuickAppAction(appKey) {
  if (appKey === "phonecall") {
    try {
      window.location.href = "tel:";
    } catch {
      /* ignore */
    }
    return;
  }
  if (appKey === "maps") {
    try {
      window.dispatchEvent(new CustomEvent(DMS_OTO_MAP_OPEN_EVENT));
    } catch {
      /* ignore */
    }
    return;
  }
  const app = APPS[appKey];
  if (!app?.url) return;
  try {
    window.open(app.url, "_blank", "noopener,noreferrer");
  } catch {
    /* ignore */
  }
}

export default function QuickAppsMenu({ open, onClose }) {
  if (!open) return null;

  return (
    <div
      className="rounded-2xl border border-cyan-500/50 bg-slate-900/95 p-3 shadow-[0_0_40px_rgba(34,211,238,0.25)] backdrop-blur-md min-w-[220px]"
      role="dialog"
      aria-label="Quick Apps"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-cyan-200">
          Quick Apps
        </span>
        {typeof onClose === "function" && (
          <button
            type="button"
            onClick={() => onClose()}
            className="rounded-lg px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            Dong
          </button>
        )}
      </div>
      <p className="mb-3 text-[10px] leading-snug text-slate-400">
        Hien no_sign (khong ky hieu) hoac nut Dong de tat menu.
      </p>
      <div className="flex flex-col gap-2">
        {Object.values(APPS).map((app) => (
          <button
            key={app.key}
            type="button"
            onClick={() => executeQuickAppAction(app.key)}
            className="flex items-center gap-3 rounded-xl border border-slate-600/80 bg-slate-800/90 px-3 py-2 text-left text-sm text-slate-100 transition hover:border-cyan-500/60 hover:bg-slate-800"
          >
            <span className="text-xl" aria-hidden>
              {app.icon}
            </span>
            <span>
              <span className="block font-semibold">{app.label}</span>
              <span className="text-[10px] text-slate-400">{app.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
