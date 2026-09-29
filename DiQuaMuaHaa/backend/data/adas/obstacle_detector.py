from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

import numpy as np

from .config import ADASConfig


class RoadObjectDetector:
    """Lazy local-model detector. Missing artifacts never trigger downloads."""

    def __init__(
        self,
        config: ADASConfig,
        model_loader: Callable[[str], Any] | None = None,
    ):
        self.config = config
        self.model_path: Path = config.object_model_path
        self._model_loader = model_loader
        self._model: Any | None = None
        self._load_attempted = False
        self._load_error = False

    def _default_loader(self, path: str) -> Any:
        from ultralytics import YOLO  # Lazy optional dependency.

        return YOLO(path)

    def ensure_loaded(self) -> bool:
        if self._model is not None:
            return True
        if self._load_attempted or not self.config.object_detector_enabled:
            return False
        self._load_attempted = True
        if not self.model_path.is_file():
            return False
        try:
            loader = self._model_loader or self._default_loader
            self._model = loader(str(self.model_path))
            return True
        except Exception:
            self._load_error = True
            self._model = None
            return False

    def status(self) -> dict[str, Any]:
        present = self.model_path.is_file()
        if not self.config.object_detector_enabled:
            reason = "disabled"
        elif not present:
            reason = "model_missing"
        elif self._load_error:
            reason = "load_failed"
        elif self._model is None:
            reason = "not_loaded"
        else:
            reason = None
        return {
            "available": self._model is not None,
            "artifact_present": present,
            "enabled": self.config.object_detector_enabled,
            "reason": reason,
        }

    def detect(self, frame: np.ndarray) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        if not self.ensure_loaded():
            return [], self.status()
        height, width = frame.shape[:2]
        try:
            prediction = self._model.predict(
                source=frame,
                conf=self.config.object_confidence,
                imgsz=self.config.object_image_size,
                verbose=False,
            )[0]
            boxes = prediction.boxes
            xyxy = boxes.xyxy.cpu().numpy()
            confidences = boxes.conf.cpu().numpy()
            class_ids = boxes.cls.cpu().numpy().astype(int)
            names = prediction.names
        except Exception:
            return [], {**self.status(), "available": False, "reason": "inference_failed"}

        detections: list[dict[str, Any]] = []
        allowed = set(self.config.road_classes)
        for coords, confidence, class_id in zip(xyxy, confidences, class_ids):
            label = str(names.get(class_id, class_id) if isinstance(names, dict) else names[class_id])
            if label not in allowed:
                continue
            x1, y1, x2, y2 = [float(value) for value in coords]
            x1, y1 = max(0.0, x1), max(0.0, y1)
            x2, y2 = min(float(width), x2), min(float(height), y2)
            if x2 <= x1 or y2 <= y1:
                continue
            x, y = x1 / width, y1 / height
            box_width, box_height = (x2 - x1) / width, (y2 - y1) / height
            detections.append(
                {
                    "class": label,
                    "confidence": round(float(confidence), 4),
                    "bbox": {
                        "x": round(x, 5),
                        "y": round(y, 5),
                        "width": round(box_width, 5),
                        "height": round(box_height, 5),
                    },
                    "center": {
                        "x": round(x + box_width / 2, 5),
                        "y": round(y + box_height / 2, 5),
                    },
                }
            )
        return detections, self.status()
