export function normalizeImagePredictionResponse(response, payload) {
  if (response?.ok && payload?.success === true && payload?.prediction) {
    return {
      success: true,
      ...payload.prediction,
      record_id: payload.record_id,
      type: "image",
    };
  }

  const code = payload?.code || payload?.error?.code || "request_failed";
  const serverMessage =
    typeof payload?.error === "string" ? payload.error : payload?.error?.message;
  const unavailable = response?.status === 503 && code === "model_unavailable";

  return {
    success: false,
    code,
    unavailable,
    error: unavailable
      ? "Mô hình phân tích ảnh hiện không khả dụng. Không có chẩn đoán nào được tạo hoặc lưu."
      : serverMessage || "Không thể phân tích ảnh. Vui lòng thử lại sau.",
  };
}
