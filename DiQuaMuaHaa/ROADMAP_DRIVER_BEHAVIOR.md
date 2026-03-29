# Lộ trình: Hệ thống nhận diện hành vi lái xe với Webcam + Cảnh báo âm thanh

> **Phân biệt “tự train” vs “dùng sẵn”:** Xem **[TRAIN_VS_PRETRAINED.md](TRAIN_VS_PRETRAINED.md)** – mắt buồn ngủ có thể dùng EAR + MediaPipe (không cần train); hành vi lái xe nên dùng dataset State Farm (Kaggle) và model có sẵn.

## Tổng quan

Hệ thống gồm 3 phần chính:
1. **Thu thập dataset** – Giữ tư thế lái xe, bấm nút → tự chụp ảnh từ webcam và lưu vào dataset.
2. **Huấn luyện model** – Train mô hình phân loại hành vi dựa trên dataset đã thu thập.
3. **Ứng dụng real-time** – Webcam nhận diện hành vi liên tục và phát cảnh báo âm thanh khi phát hiện hành vi nguy hiểm.

---

## Giai đoạn 1: Thu thập dataset (Data collection)

### 1.1 Các hành vi cần nhận diện (gợi ý)

| Nhãn (label) | Mô tả | Mức độ |
|--------------|--------|--------|
| `safe_driving` | Hai tay trên vô-lăng, mắt nhìn đường | An toàn |
| `one_hand` | Một tay rời vô-lăng | Cảnh báo nhẹ |
| `no_hands` | Hai tay rời vô-lăng | Nguy hiểm |
| `phone` | Một tay cầm điện thoại / đưa lên tai | Nguy hiểm |
| `eating_drinking` | Ăn / uống khi lái | Cảnh báo |
| `drowsy` | Ngủ gật / mắt lim dim | Rất nguy hiểm |
| `looking_away` | Quay đầu / nhìn ra chỗ khác lâu | Cảnh báo |

Bạn có thể bắt đầu với 3–4 nhãn (ví dụ: `safe_driving`, `one_hand`, `phone`, `drowsy`) rồi mở rộng sau.

### 1.2 Công cụ thu thập ảnh

- **Ngôn ngữ:** Python.
- **Thư viện:** OpenCV (`cv2`) để mở webcam và chụp ảnh, có thể dùng `keyboard` hoặc phím trong OpenCV để bấm nút.
- **Cách hoạt động:**
  - Mở webcam, hiển thị livestream.
  - Người dùng giữ đúng tư thế (ví dụ: hai tay trên vô-lăng).
  - Bấm một phím (ví dụ: `S` = safe, `P` = phone, `O` = one_hand…) → chụp ảnh và lưu vào thư mục tương ứng (ví dụ: `dataset/safe_driving/`, `dataset/phone/`).
- **Lưu ý:**
  - Ánh sáng đa dạng (ngày, đêm, đèn trong xe).
  - Góc máy giống góc lắp thực tế (thường là sau gương chiếu hậu hoặc trước mặt lái).
  - Mỗi nhãn nên có ít nhất 200–500 ảnh (càng nhiều càng tốt).

### 1.3 Cấu trúc dataset đề xuất

```
dataset/
  safe_driving/
    img_0001.jpg, img_0002.jpg, ...
  one_hand/
    ...
  phone/
    ...
  drowsy/
    ...
```

---

## Giai đoạn 2: Chuẩn bị dữ liệu và gán nhãn

- Đã gán nhãn bằng thư mục (mỗi thư mục = 1 lớp).
- Thêm bước:
  - Chia train/val (ví dụ 80/20) để train và đánh giá.
  - Augmentation: xoay nhẹ, lật ngang, thay đổi độ sáng, crop… để model khái quát tốt hơn.

---

## Giai đoạn 3: Huấn luyện model

### 3.1 Lựa chọn mô hình

- **Cách 1 – Đơn giản:** CNN nhỏ (vài layer Conv + MaxPool + Dense) train từ đầu trên ảnh đã resize (ví dụ 224x224). Đủ dùng nếu dataset vài nghìn ảnh.
- **Cách 2 – Mạnh hơn:** Transfer learning với backbone có sẵn:
  - **MobileNetV2 / EfficientNet** (nhẹ, chạy real-time trên CPU/laptop).
  - **ResNet50** nếu có GPU.
- Framework: **PyTorch** hoặc **TensorFlow/Keras** đều được.

### 3.2 Quy trình train

1. Load ảnh từ các thư mục, gán nhãn theo tên thư mục.
2. Chia train/validation, áp dụng augmentation cho tập train.
3. Train: loss = CrossEntropy, optimizer = Adam.
4. Lưu model (file `.pt` / `.pth` hoặc `.h5` / SavedModel) và mapping `label_id → tên hành vi`.

### 3.3 Đánh giá

- Accuracy, confusion matrix trên tập validation.
- Kiểm tra nhầm lẫn giữa các lớp (ví dụ safe vs one_hand, phone vs eating).

---

## Giai đoạn 4: Ứng dụng real-time + Cảnh báo âm thanh

### 4.1 Pipeline real-time

1. Mở webcam (OpenCV).
2. Mỗi frame (hoặc mỗi N frame để giảm tải):
   - Preprocess giống lúc train (resize, normalize).
   - Đưa vào model → ra nhãn (và có thể xác suất).
3. Hiển thị:
   - Ảnh từ webcam.
   - Nhãn dự đoán + độ tin cậy (nếu có).
4. Logic cảnh báo:
   - Nếu nhãn thuộc nhóm “nguy hiểm” (ví dụ `phone`, `no_hands`, `drowsy`) → kích hoạt cảnh báo âm thanh.

### 4.2 Cảnh báo âm thanh

- **Cách 1:** Phát file âm thanh (`.wav`, `.mp3`) khi phát hiện hành vi nguy hiểm.
  - Thư viện: `playsound`, `pygame.mixer`, hoặc `winsound` (chỉ Windows).
- **Cách 2:** TTS (Text-to-Speech) đọc câu cảnh báo (ví dụ: “Cảnh báo: đang sử dụng điện thoại”).
  - Thư viện: `pyttsx3` (offline) hoặc `gTTS` (online).
- Tránh spam: chỉ phát cảnh báo khi hành vi nguy hiểm xuất hiện liên tục trong vài giây (ví dụ 2–3 giây) và có “cooldown” giữa hai lần cảnh báo (ví dụ 5–10 giây).

### 4.3 Cải thiện trải nghiệm

- Hiển thị FPS để tối ưu (giảm resolution hoặc bỏ frame nếu cần).
- Vẽ bounding box hoặc text overlay rõ ràng (màu đỏ cho nguy hiểm, xanh cho an toàn).
- Có thể thêm “chế độ thu thập dữ liệu” trong cùng app: bấm phím để chụp ảnh theo nhãn (như Giai đoạn 1) để mở rộng dataset sau này.

---

## Giai đoạn 5: Triển khai “xịn” (production-style)

- **Đóng gói:** Dùng PyInstaller hoặc similar để build file `.exe` (Windows) cho người dùng không cần cài Python.
- **Cấu hình:** Cho phép bật/tắt từng loại cảnh báo, ngưỡng confidence, độ nhạy (số giây duy trì trước khi báo).
- **Log:** Ghi lại thời điểm và loại hành vi nguy hiểm (để phân tích sau hoặc báo cáo).
- **Giao diện:** Có thể làm GUI đơn giản (Tkinter, PyQt) hoặc web (Flask/FastAPI + stream ảnh lên browser, cảnh báo qua âm thanh + notification).

---

## Thứ tự làm việc đề xuất (checklist)

| # | Công việc | Công cụ / Ghi chú |
|---|-----------|-------------------|
| 1 | Tạo script thu thập ảnh: webcam + bấm phím → lưu ảnh theo nhãn | Python, OpenCV |
| 2 | Thu thập ảnh cho ít nhất 3–4 hành vi, mỗi lớp 200+ ảnh | Webcam thật hoặc mô phỏng |
| 3 | Script load dataset, chia train/val, augmentation | PyTorch ImageFolder hoặc Keras ImageDataGenerator |
| 4 | Train model (CNN đơn giản hoặc transfer learning) | PyTorch / TensorFlow |
| 5 | Lưu model + danh sách nhãn | .pth / .h5 |
| 6 | Script real-time: webcam → model → hiển thị nhãn | OpenCV + model |
| 7 | Thêm logic cảnh báo: nhãn nguy hiểm → phát âm thanh | playsound / pyttsx3 |
| 8 | Tối ưu FPS, tránh cảnh báo spam (debounce + cooldown) | — |
| 9 | (Tùy chọn) GUI hoặc đóng gói .exe | Tkinter / PyInstaller |

---

## Cấu trúc thư mục gợi ý cho project

```
DiQuaMuaHaa/
  backend/                 # API nếu làm phiên bản web
  driver_behavior/         # Project chính
    data_collection.py     # Thu thập ảnh (webcam + nút bấm)
    dataset/               # Ảnh đã thu thập (theo từng thư mục nhãn)
    train.py               # Train model
    model/                 # File model đã train (.pth, .h5)
    labels.json            # Mapping id → tên hành vi
    inference.py           # Real-time webcam + cảnh báo âm thanh
    assets/
      alert_sound.wav      # File âm thanh cảnh báo
    requirements.txt
  README.md
```

---

## Tài liệu / tài nguyên tham khảo

- OpenCV: đọc webcam, hiển thị, chụp ảnh.
- PyTorch hoặc TensorFlow: tutorial Image Classification.
- Driver monitoring: tìm “driver behavior recognition dataset” hoặc “distracted driver” để tham khảo thêm cách gán nhãn và kiến trúc model.

Khi bạn sẵn sàng, có thể bắt đầu từ **Bước 1: script thu thập ảnh** (data collection) trong thư mục `driver_behavior`. Nếu bạn muốn, tôi có thể viết giúp skeleton code cho `data_collection.py` và `inference.py` (real-time + cảnh báo âm thanh) theo đúng lộ trình trên.
