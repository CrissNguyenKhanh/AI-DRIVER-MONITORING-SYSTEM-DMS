import React, { useEffect, useState } from "react";
import QuickAppsMenu from "./QuickAppsMenu";
import OtoLiveMapPanel, { DMS_OTO_MAP_OPEN_EVENT } from "./OtoLiveMapPanel";

export {
  HAND_LABEL_CLOSES_MENU,
  HAND_LABEL_OPENS_MENU,
  executeQuickAppAction,
  handLabelToQuickAppKey,
} from "./QuickAppsMenu";

/**
 * Lớp vỏ: đặt menu Quick Apps góc dưới phải trên khung video (pointer-events).
 */
export default function HandQuickAppsMenu({ open, onRequestClose }) {
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    const onOpenMap = () => setMapOpen(true);
    window.addEventListener(DMS_OTO_MAP_OPEN_EVENT, onOpenMap);
    return () => window.removeEventListener(DMS_OTO_MAP_OPEN_EVENT, onOpenMap);
  }, []);

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-30">
        <div className="pointer-events-auto absolute bottom-16 right-4 md:bottom-20 md:right-6">
          <QuickAppsMenu open={open} onClose={onRequestClose} />
        </div>
      </div>
      <OtoLiveMapPanel open={mapOpen} onClose={() => setMapOpen(false)} />
    </>
  );
}
