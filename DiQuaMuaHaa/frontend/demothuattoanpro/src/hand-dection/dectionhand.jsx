import React, { useEffect, useRef, useState } from "react";
import { getDmsApiBase } from "../config/apiEndpoints";
import { getWebcamSupportErrorMessage } from "../utils/cameraContext";

import sukunaVideo from "./video/khanhvideo.mp4";
const API_INTERVAL_MS = 1000; // ms, tần suất gọi API khi webcam bật

const HAND_LABEL_MAP = {
  stop: {
    vi: "Dừng lại",
    color: "bg-red-600",
    textColor: "text-red-50",
    desc: "Ký hiệu tay yêu cầu dừng xe khẩn cấp hoặc ngay lập tức.",
    voice: "Dừng lại",
  },
  go: {
    vi: "Đi tiếp",
    color: "bg-emerald-500",
    textColor: "text-emerald-50",
    desc: "Ký hiệu tay cho phép tiếp tục di chuyển.",
    voice: "Đi tiếp",
  },
  turn_left: {
    vi: "Rẽ trái",
    color: "bg-sky-500",
    textColor: "text-sky-50",
    desc: "Ký hiệu tay báo hiệu rẽ trái.",
    voice: "Rẽ trái",
  },
  turn_right: {
    vi: "Rẽ phải",
    color: "bg-indigo-500",
    textColor: "text-indigo-50",
    desc: "Ký hiệu tay báo hiệu rẽ phải.",
    voice: "Rẽ phải",
  },
  slow_down: {
    vi: "Giảm tốc",
    color: "bg-amber-500",
    textColor: "text-slate-900",
    desc: "Ký hiệu tay yêu cầu giảm tốc độ.",
    voice: "Giảm tốc",
  },
  help: {
    vi: "Cần hỗ trợ",
    color: "bg-fuchsia-600",
    textColor: "text-fuchsia-50",
    desc: "Ký hiệu tay cầu cứu, cần trợ giúp.",
    voice: "Tôi cần hỗ trợ",
  },
  ok: {
    vi: "OK",
    color: "bg-emerald-600",
    textColor: "text-emerald-50",
    desc: "Ký hiệu tay xác nhận mọi thứ ổn.",
    voice: "Mọi thứ ổn",
  },
  thank_you: {
    vi: "Cảm ơn",
    color: "bg-teal-500",
    textColor: "text-teal-50",
    desc: "Ký hiệu tay thể hiện lời cảm ơn.",
    voice: "Cảm ơn",
  },
  no_sign: {
    vi: "Không ký hiệu",
    color: "bg-slate-600",
    textColor: "text-slate-50",
    desc: "Không phát hiện ký hiệu tay đặc biệt.",
    voice: "",
  },
  emergency: {
    vi: "Khẩn cấp",
    color: "bg-red-700",
    textColor: "text-red-50",
    desc: "Ký hiệu tay báo hiệu tình huống khẩn cấp.",
    voice: "Khẩn cấp",
  },
  sukuna: {
    vi: "Chế độ sukuna",
    color: "bg-fuchsia-700",
    textColor: "text-fuchsia-50",
    desc: "Hiệu ứng đặc biệt kích hoạt khi nhận diện ký hiệu Sukuna.",
    voice: "Chế độ sukuna",
  },
};

function DectionHand() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const prevLabelRef = useRef(null);

  const [status, setStatus] = useState("idle"); // idle | loading | active | error
  const [errorMsg, setErrorMsg] = useState("");
  const [apiResult, setApiResult] = useState(null);
  const [apiError, setApiError] = useState("");
  const [apiLoading, setApiLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const startWebcam = async () => {
    const supportErr = getWebcamSupportErrorMessage();
    if (supportErr) {
      setErrorMsg(supportErr);
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStatus("active");
    } catch (err) {
      setErrorMsg(err.message || "Không thể mở webcam");
      setStatus("error");
    }
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus("idle");
  };

  useEffect(() => {
    startWebcam();
    return () => stopWebcam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gọi API hand liên tục khi webcam đang bật
  useEffect(() => {
    if (status !== "active") return undefined;

    let cancelled = false;
    let timeoutId;

    const loop = async () => {
      if (cancelled) return;

      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        if (!cancelled) timeoutId = setTimeout(loop, API_INTERVAL_MS);
        return;
      }

      try {
        setApiLoading(true);
        setApiError("");

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0);
        const imageBase64 = canvas.toDataURL("image/jpeg", 0.85);

        const res = await fetch(
          `${getDmsApiBase()}/api/hand/predict_from_frame`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ image: imageBase64 }),
          },
        );

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error || "Gọi API hand thất bại");
        }

        setApiResult(data);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        setApiError(err.message || "Không gọi được API hand");
      } finally {
        setApiLoading(false);
      }

      if (cancelled) return;
      timeoutId = setTimeout(loop, API_INTERVAL_MS);
    };

    loop();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [status]);

  const rawLabel = (apiResult?.label || "unknown").toString().trim();
  const rawProb = typeof apiResult?.prob === "number" ? apiResult.prob : null;
  const CONFIDENCE_THRESHOLD = 0.75;

  // Chuẩn hóa label: map theo key HAND_LABEL_MAP (không phân biệt hoa/thường)
  const normalizedKey =
    Object.keys(HAND_LABEL_MAP).find(
      (k) => k.toLowerCase() === rawLabel.toLowerCase(),
    ) || rawLabel.toLowerCase();

  const currentLabel = normalizedKey;
  const labelInfo = HAND_LABEL_MAP[currentLabel] || {
    vi: currentLabel,
    color: "bg-slate-600",
    textColor: "text-slate-50",
    desc: "Chưa đủ dữ liệu hoặc nhãn không xác định.",
    voice: "",
  };

  // Phát giọng nói khi ký hiệu tay thay đổi (và đủ tự tin)
  useEffect(() => {
    const label = currentLabel;
    // Chỉ phát giọng nói khi:
    //  - Có label rõ ràng (không phải no_sign/unknown)
    //  - Độ tin cậy từ backend đủ cao
    if (!label || label === "no_sign" || label === "unknown") {
      prevLabelRef.current = label || null;
      return;
    }

    if (
      label !== prevLabelRef.current &&
      rawProb !== null &&
      rawProb >= CONFIDENCE_THRESHOLD
    ) {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          const info = HAND_LABEL_MAP[label];
          const text = info?.voice || info?.vi || label;
          if (text) {
            const utter = new SpeechSynthesisUtterance(text);
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utter);
          }
        } catch {
          // ignore audio errors
        }
      }
    }

    prevLabelRef.current = label || null;
  }, [currentLabel]);

  const scoreEntries = apiResult?.scores
    ? Object.entries(apiResult.scores).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-white">
          Hand Sign Detection (Deaf Driver Assist)
        </h1>

        {/* Khối chẩn đoán tổng quan */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-xs mb-1">
              Phát hiện ký hiệu tay từ webcam → MediaPipe Hands → model ký hiệu
              tay cho tài xế khiếm thính/khiếm thanh, đồng thời phát giọng nói
              tương ứng.
            </p>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${labelInfo.color} ${labelInfo.textColor}`}
              >
                {labelInfo.vi || currentLabel}
              </span>
              {typeof apiResult?.prob === "number" && (
                <span className="text-xs text-slate-300">
                  Độ tin cậy:{" "}
                  <span className="font-semibold">
                    {(apiResult.prob * 100).toFixed(1)}%
                  </span>
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-300 max-w-xl">
              {labelInfo.desc}
            </p>
          </div>
          <div className="text-right text-[11px] text-slate-400">
            <div>
              API hand:{" "}
              {status === "active"
                ? apiLoading
                  ? "đang gọi..."
                  : "đang cập nhật định kỳ"
                : "tạm dừng (webcam tắt)"}
            </div>
            <div>
              Webcam: {status === "active" ? "ĐANG BẬT" : status.toUpperCase()}
            </div>
            {lastUpdated && <div>Cập nhật: {lastUpdated}</div>}
          </div>
        </div>

        {/* Khối webcam */}
        <div className="bg-slate-800 rounded-xl overflow-hidden shadow-xl">
          {currentLabel === "sukuna" ? (
            <div className="relative aspect-video bg-black">
              {/* Video nền Sukuna */}
              <video
                src={sukunaVideo}
                autoPlay
                loop
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />

              {/* Vầng hào quang & overlay màu */}
              <div className="pointer-events-none absolute inset-0">
                {/* vòng tròn phát sáng */}
                <div className="absolute inset-0 bg-radial-at-center from-fuchsia-500/35 via-transparent to-transparent blur-3xl opacity-70" />
                {/* lớp tối tạo chiều sâu */}
                <div className="absolute inset-0 bg-gradient-to-tr from-black/85 via-black/40 to-fuchsia-900/60 mix-blend-multiply" />
              </div>

              {/* Webcam thu nhỏ nổi phía dưới bên phải */}
              <div className="absolute bottom-4 right-4 w-60 h-36 rounded-2xl overflow-hidden border-2 border-fuchsia-400 shadow-[0_0_35px_rgba(232,121,249,0.95)]">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
                {/* viền trong animate */}
                <div className="pointer-events-none absolute inset-0 border border-fuchsia-300/60 rounded-2xl animate-pulse" />
              </div>

              {/* Badge & mô tả chế độ Sukuna */}
              <div className="absolute left-6 bottom-6 space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-fuchsia-600/90 text-xs font-semibold uppercase tracking-[0.25em] text-fuchsia-50 shadow-[0_0_26px_rgba(232,121,249,1)]">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-fuchsia-200 animate-ping" />
                  Sukuna mode
                </div>
                <p className="text-sm text-fuchsia-100/90 max-w-xs">
                  Ký hiệu Sukuna được nhận diện. Hệ thống chuyển sang hiệu ứng đặc biệt với nền
                  video và khung hình phát sáng.
                </p>
              </div>

              {/* Chữ trang trí lớn ở nền */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="text-6xl md:text-7xl font-black tracking-[0.3em] text-fuchsia-200/15">
                  SUKUNA
                </span>
              </div>
            </div>
          ) : (
            <div className="relative aspect-video bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
              {status === "loading" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                  <span className="text-white text-lg">
                    Đang kết nối webcam...
                  </span>
                </div>
              )}
              {status === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-red-400 gap-4 px-4 text-center">
                  <span className="text-lg">❌ {errorMsg}</span>
                  <span className="text-xs text-red-200">
                    Kiểm tra lại quyền truy cập camera trong trình duyệt
                    (Settings → Privacy → Camera).
                  </span>
                  <button
                    onClick={startWebcam}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-white text-sm font-medium"
                  >
                    Thử lại
                  </button>
                </div>
              )}
              {status === "active" && (
                <>
                  <div className="absolute bottom-3 left-3 px-3 py-1 bg-green-600/90 rounded text-white text-sm font-medium flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-200 animate-pulse" />
                    Webcam đang hoạt động
                  </div>

                  {currentLabel === "no_sign" && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-slate-900/70 border border-dashed border-slate-400 rounded-2xl px-6 py-4 text-center max-w-sm mx-auto">
                        <p className="text-sm font-semibold text-slate-100 mb-1">
                          Không phát hiện ký hiệu tay
                        </p>
                        <p className="text-xs text-slate-300">
                          Đưa bàn tay vào khung hình và giữ ổn định 1–2 giây để
                          hệ thống nhận diện ký hiệu.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="p-4 flex items-center justify-between border-t border-slate-700">
            <span className="text-slate-400 text-sm">
              {status === "active"
                ? "Webcam đã bật. Ký hiệu tay sẽ được nhận diện và đọc thành tiếng."
                : status === "error"
                  ? "Cấp quyền truy cập camera trong trình duyệt để tiếp tục."
                  : "Nhấn Bật webcam để bắt đầu."}
            </span>
            <div className="flex gap-2">
              {status === "active" ? (
                <button
                  onClick={stopWebcam}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white text-sm font-medium"
                >
                  Tắt webcam
                </button>
              ) : (
                <button
                  onClick={startWebcam}
                  disabled={status === "loading"}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-white text-sm font-medium"
                >
                  Bật webcam
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Phân bố xác suất cho từng ký hiệu tay */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
          <h2 className="text-white font-semibold text-sm mb-1">
            Phân bố xác suất theo ký hiệu tay
          </h2>
          <p className="text-slate-400 text-xs">
            Xác suất dự đoán từ landmark bàn tay (frame webcam → MediaPipe Hands
            → model hand). Cập nhật mỗi giây khi webcam bật.
          </p>

          {apiError && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/60 rounded px-3 py-2">
              Lỗi API hand: {apiError}
            </div>
          )}

          {scoreEntries.length > 0 ? (
            <div className="space-y-2">
              {scoreEntries.map(([key, value]) => {
                const info = HAND_LABEL_MAP[key] || {
                  vi: key,
                  color: "bg-slate-600",
                };
                const pct = value * 100;
                return (
                  <div key={key} className="text-xs text-slate-200">
                    <div className="flex justify-between mb-1">
                      <span className="font-medium">
                        {info.vi}{" "}
                        <span className="text-slate-400">({key})</span>
                      </span>
                      <span className="text-slate-300">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${info.color}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Chưa có dữ liệu dự đoán. Hãy bật webcam và kiểm tra lại API
              backend cho hand.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default DectionHand;
