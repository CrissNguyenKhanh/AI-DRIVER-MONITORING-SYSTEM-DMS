/**
 * getUserMedia chỉ có trong "secure context": HTTPS hoặc localhost/127.0.0.1.
 * Mở http://192.168.x.x trên điện thoại → isSecureContext === false → không có mediaDevices.
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

/** Thông báo tiếng Việt khi không gọi được camera */
export function getWebcamSupportErrorMessage() {
  if (!isCameraSecureContext()) {
    return (
      "Trình duyệt chặn camera vì trang không chạy ở chế độ bảo mật (HTTPS hoặc localhost). " +
      "Địa chỉ http://IP-máy-tính sẽ không bật được webcam và không hiện nút Allow. " +
      "Hãy mở https://<cùng-IP>:5173 (chạy npm run dev — server đã bật HTTPS), chọn Advanced → Proceed, rồi thử Activate Camera lại."
    );
  }
  if (!hasGetUserMedia()) {
    return (
      "Trình duyệt không hỗ trợ truy cập camera (getUserMedia). " +
      "Thử Chrome/Safari bản mới, hoặc kiểm tra trang đã là HTTPS/localhost."
    );
  }
  return "";
}
