import { createContext, useContext } from "react";

/**
 * DmsContext — chia sẻ trạng thái DMS read-only xuống các component con.
 *
 * Dữ liệu trong context:
 *   status            — "idle"|"loading"|"auth"|"active"|"locked"|"error"
 *   driverId          — string
 *   wsConnected       — boolean
 *   apiResult         — object | null
 *   apiLoading        — boolean
 *   apiError          — string
 *   identityOwner     — true | false | null
 *   identityHasRegistered — boolean
 *   identitySimilarity — number | null
 *   identitySamples   — number
 *   identityError     — string
 *   phoneIconActive   — boolean
 *   phoneDetectionRef — ref
 *   phoneError        — string
 *   smokingIconActive — boolean
 *   smokingResult     — object | null
 *   smokingSecRef     — ref
 *   smokingError      — string
 *   drivingSessionId      — number | null
 *   drivingSessionStartedAt — string | null
 *   sessionAlertCounts — { phone, smoking, drowsy }
 *   frameCount        — number
 *   lastUpdated       — string | null
 *   faceMeshRef       — ref
 */
const DmsContext = createContext(null);

/**
 * Trả về DMS context. Throw nếu dùng ngoài DmsProvider.
 */
export function useDmsContext() {
  const ctx = useContext(DmsContext);
  if (!ctx) throw new Error("useDmsContext must be used inside <DmsProvider>");
  return ctx;
}

export default DmsContext;
