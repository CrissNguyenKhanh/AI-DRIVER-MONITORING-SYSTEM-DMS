/**
 * getUserMedia chi co trong "secure context": HTTPS hoac localhost/127.0.0.1.
 * Localhost HTTP van duoc trinh duyet cho phep camera; HTTP qua IP LAN thi khong.
 */
export function isCameraSecureContext() {
  if (typeof window === "undefined") return true;
  return window.isSecureContext === true;
}

export function hasGetUserMedia() {
  return Boolean(
    typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function",
  );
}

/** Thong bao tieng Viet khi khong goi duoc camera */
export function getWebcamSupportErrorMessage() {
  if (!isCameraSecureContext()) {
    return (
      "Trinh duyet chan camera vi trang khong o secure context. " +
      "Hay mo bang http://localhost:5173 hoac http://127.0.0.1:5173 tren chinh may nay. " +
      "Neu mo bang http://IP-may-tinh:5173 tu dien thoai/may khac thi browser se khong cho camera tren HTTP."
    );
  }
  if (!hasGetUserMedia()) {
    return (
      "Trinh duyet khong ho tro truy cap camera (getUserMedia). " +
      "Thu Chrome/Safari ban moi, hoac kiem tra quyen camera cua trinh duyet."
    );
  }
  return "";
}
