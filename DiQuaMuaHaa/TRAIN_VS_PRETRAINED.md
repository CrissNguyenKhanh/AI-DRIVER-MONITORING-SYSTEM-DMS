# Nên tự train hay dùng dataset/model có sẵn?

Tài liệu này phân tách rõ: **phần nào không cần train** (dùng sẵn), **phần nào nên dùng dataset có sẵn**, và **phần nào nên/cần tự train**.

---

## 1. Không cần tự train – Dùng sẵn

### 1.1 Nhận diện mắt buồn ngủ (drowsiness)

**Ý tưởng:** Mắt nhắm lâu → cảnh báo buồn ngủ. **Không cần** dataset hay train model riêng.

| Cách làm | Công cụ | Ghi chú |
|----------|---------|--------|
| **EAR (Eye Aspect Ratio)** | **MediaPipe Face Mesh** hoặc **dlib** | Định vị landmark mắt (điểm góc mắt, mí mắt) → tính tỉ lệ EAR. Mắt nhắm thì EAR giảm. Đếm số frame EAR < ngưỡng → cảnh báo. **Không cần train**, chạy real-time tốt. |
| **Pre-trained mắt mở/đóng** (tùy chọn) | Model .keras / .h5 từ GitHub hoặc Kaggle | Nếu muốn dùng CNN “mắt mở vs mắt nhắm”: có sẵn dataset (Kaggle Drowsiness, ~11k ảnh) và nhiều repo đã train sẵn; tải model về dùng luôn, không bắt buộc tự train. |

**Tài nguyên gợi ý:**

- **MediaPipe:** [Driver Drowsiness Detection Using Mediapipe (LearnOpenCV)](https://learnopencv.com/driver-drowsiness-detection-using-mediapipe-in-python), [Drowsiness-Detection-With-MediaPipe (GitHub)](https://github.com/Saikat2345/Drowsiness-Detection-With-MediaPipe)
- **dlib + EAR:** [Eye Aspect Ratio and Drowsiness detector (Medium)](https://medium.com/analytics-vidhya/eye-aspect-ratio-ear-and-drowsiness-detector-using-dlib-a0b2c292d706)
- **Dataset mắt (nếu muốn train/eval):** Kaggle “Drowsiness Detection Dataset” (open/closed eyes, yawning)

**Kết luận:** Phần **mắt buồn ngủ** có thể làm hoàn toàn bằng EAR + MediaPipe/dlib, không cần tự train. Chỉ cần tích hợp vào pipeline webcam của bạn.

---

### 1.2 Phát hiện khuôn mặt (face detection)

Dùng luôn model có sẵn để crop vùng mặt lái xe (sau đó mới đưa vào drowsiness hoặc hành vi):

- **OpenCV Haar Cascade** (face frontal)
- **MediaPipe Face Detection**
- **dlib** (face + 68 landmarks)

Không cần train.

---

## 2. Nên dùng dataset có sẵn – Hành vi lái xe (distracted driver)

### 2.1 Dataset: State Farm Distracted Driver Detection (Kaggle)

- **Link:** [State Farm Distracted Driver Detection | Kaggle](https://www.kaggle.com/c/state-farm-distracted-driver-detection/data)
- **Nội dung:** Ảnh camera dashboard, 10 lớp hành vi:
  - c0: safe driving  
  - c1: texting - right  
  - c2: talking on phone - right  
  - c3: texting - left  
  - c4: talking on phone - left  
  - c5: operating radio  
  - c6: drinking  
  - c7: reaching behind  
  - c8: hair and makeup  
  - c9: talking to passenger  

**Cách dùng:**

| Cách | Mô tả |
|------|--------|
| **Dùng model người khác đã train** | Tìm trên GitHub/Kaggle notebook: nhiều người đã train CNN/ResNet/MobileNet trên bộ này, có thể tải weights về chạy inference. **Không cần tự train.** |
| **Tự train / fine-tune** | Tải dataset từ Kaggle → train hoặc fine-tune (MobileNetV2, EfficientNet, ResNet). Dùng khi bạn muốn chỉnh lại lớp (gộp nhãn, thêm lớp) hoặc tối ưu cho phần cứng của bạn. |

**Kết luận:** Phần **nhận diện hành vi lái xe** (điện thoại, uống nước, safe, v.v.) **nên dùng dataset State Farm** (và có thể dùng luôn model đã train sẵn). Chỉ khi cần hành vi rất đặc thù hoặc góc camera khác mới cân nhắc thu thập thêm và tự train/fine-tune.

---

### 2.2 Dataset khác (bổ sung nếu cần)

- **Kaggle – Drowsiness Detection:** ảnh mắt mở/nhắm, ngáp; dùng nếu bạn muốn thêm **CNN mắt** thay vì chỉ EAR.
- Các bộ “driver behavior”, “driver monitoring” trên Kaggle / GitHub: có thể dùng để mở rộng lớp hoặc so sánh.

---

## 3. Khi nào nên tự train?

Tự train (hoặc fine-tune) khi:

- Bạn cần **thêm hành vi** không có trong State Farm (ví dụ: hút thuốc, gạt nước, tay chỉ vào màn hình).
- **Góc camera / loại xe** khác nhiều so với ảnh State Farm → model có sẵn kém, bạn thu thập thêm ảnh và fine-tune.
- Bạn muốn **gộp/nhóm lại** các lớp (ví dụ: mọi “phone” gộp một lớp) và train lại cho gọn.

Khi đó: dùng script thu thập ảnh (giữ tư thế + bấm nút) như trong `ROADMAP_DRIVER_BEHAVIOR.md`, thu thêm ảnh → fine-tune từ model State Farm hoặc train nhánh mới.

---

## 4. Tóm tắt nhanh

| Thành phần | Nên làm | Dataset / model gợi ý |
|------------|--------|------------------------|
| **Mắt buồn ngủ** | **Không cần train** | EAR + MediaPipe Face Mesh (hoặc dlib). Tùy chọn: pre-trained mắt mở/đóng từ Kaggle/GitHub. |
| **Face detection** | **Dùng sẵn** | OpenCV Haar, MediaPipe, dlib. |
| **Hành vi lái xe** (phone, eating, safe, …) | **Dùng dataset có sẵn** (có thể dùng luôn model đã train) | **State Farm Distracted Driver** (Kaggle). GitHub: State-Farm-Distracted-Driver-Detection, DistractedDriver, v.v. |
| **Hành vi đặc thù / góc camera lạ** | **Tự train hoặc fine-tune** | Thu thập ảnh bằng script data_collection.py, fine-tune từ model State Farm hoặc train từ đầu. |

---

## 5. Kiến trúc hệ thống đề xuất (kết hợp “dùng sẵn” + “dataset có sẵn”)

```
Webcam
  │
  ├─► Face detection (MediaPipe/dlib) ─► Crop mặt
  │         │
  │         ├─► Drowsiness: EAR từ landmark mắt (MediaPipe/dlib) ─► Cảnh báo âm thanh nếu nhắm lâu
  │         │
  │         └─► (Tùy chọn) CNN mắt mở/đóng đã train sẵn
  │
  └─► Toàn frame (hoặc crop cabin)
            │
            └─► Model hành vi (State Farm đã train sẵn hoặc bạn fine-tune)
                      │
                      └─► phone / drinking / safe / ... ─► Cảnh báo âm thanh theo nhãn nguy hiểm
```

Như vậy: **mắt buồn ngủ** bạn không cần tự train; **hành vi lái xe** nên dùng dataset (và model) State Farm có sẵn; chỉ khi cần hành vi hoặc môi trường rất riêng thì mới tự thu thập và train/fine-tune.
