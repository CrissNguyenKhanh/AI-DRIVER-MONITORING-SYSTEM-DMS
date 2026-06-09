# test_phone_webcam.py
# Chạy: python test_phone_webcam.py

import torch

# Patch torch.load before importing anything from ultralytics
_original_torch_load = torch.load


def _patched_torch_load(f, *args, **kwargs):
    kwargs.setdefault("weights_only", False)
    return _original_torch_load(f, *args, **kwargs)


torch.load = _patched_torch_load

import cv2
from ultralytics import YOLO

# COCO pretrained — class 67 = cell phone
model = YOLO("yolov8n.pt")

PHONE_CLASS_ID = 67
CONF_THRESHOLD = 0.4

cap = cv2.VideoCapture(0)  # 0 = webcam mặc định
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

print("📷 Webcam đang chạy... Nhấn 'Q' để thoát")

while True:
    ret, frame = cap.read()
    if not ret:
        print("❌ Không đọc được frame từ webcam")
        break

    results = model(frame, classes=[PHONE_CLASS_ID], conf=CONF_THRESHOLD, verbose=False)

    phone_count = 0

    for result in results:
        for box in result.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = float(box.conf[0])
            phone_count += 1

            # Vẽ bbox
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

            # Label
            label = f"Phone {conf:.0%}"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
            cv2.rectangle(frame, (x1, y1 - th - 10), (x1 + tw + 6, y1), (0, 255, 0), -1)
            cv2.putText(
                frame,
                label,
                (x1 + 3, y1 - 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 0, 0),
                2,
            )

    # Status góc trên trái
    status = f"PHONE DETECTED: {phone_count}" if phone_count > 0 else "No phone"
    color = (0, 0, 255) if phone_count > 0 else (200, 200, 200)
    cv2.putText(frame, status, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.0, color, 2)

    cv2.imshow("Phone Detection - Press Q to quit", frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()
print("✅ Đã thoát")
