"""Admin dashboard routes for driver identity and trip analytics."""
from __future__ import annotations

import csv
import hashlib
from collections import Counter, defaultdict
from pathlib import Path

from data.api.runtime import *
from src.core.config import BASE_DIR
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split


FACE_CSV_PATH = BASE_DIR / "driver_training" / "collect" / "data" / "landmarks.csv"
HAND_CSV_PATH = BASE_DIR / "driver_training" / "collect" / "hand_dataset.csv"
SMOKING_CSV_PATH = (
    BASE_DIR / "driver_training" / "collect" / "data" / "smoking_landmarks_binary.csv"
)


def _dt_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return str(value)


def _duration_minutes(started_at: Any, ended_at: Any) -> float:
    if not started_at:
        return 0.0
    start = started_at if isinstance(started_at, datetime) else datetime.strptime(str(started_at), "%Y-%m-%d %H:%M:%S")
    end = ended_at if isinstance(ended_at, datetime) else datetime.utcnow()
    return max(0.0, round((end - start).total_seconds() / 60, 1))


def _route_seed(driver_id: str, session_id: int) -> int:
    raw = f"{driver_id}:{session_id}".encode("utf-8")
    return int(hashlib.sha1(raw).hexdigest()[:8], 16)


def _route_points(driver_id: str, session_id: int) -> list[dict[str, Any]]:
    """Return stable demo route points until real GPS samples are persisted."""
    seed = _route_seed(driver_id, session_id)
    base_lat = 21.0285 + ((seed % 900) - 450) / 100000.0
    base_lng = 105.8542 + (((seed // 1000) % 900) - 450) / 100000.0
    points: list[dict[str, Any]] = []
    for i in range(6):
        points.append(
            {
                "lat": round(base_lat + i * 0.003 + ((seed >> i) % 7) / 10000.0, 6),
                "lng": round(base_lng + i * 0.004 - ((seed >> (i + 3)) % 7) / 10000.0, 6),
                "label": f"P{i + 1}",
            }
        )
    return points


def _load_labeled_csv(csv_path: Path) -> tuple[np.ndarray, np.ndarray, dict[str, int]]:
    labels: list[str] = []
    rows: list[list[float]] = []
    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if not row:
                continue
            try:
                vec = [float(v) for v in row[1:]]
            except ValueError:
                continue
            labels.append(str(row[0]).strip())
            rows.append(vec)
    if not rows:
        raise ValueError("CSV rong hoac khong doc duoc du lieu.")
    label_to_idx = {label: idx for idx, label in enumerate(sorted(set(labels)))}
    y = np.asarray([label_to_idx[label] for label in labels], dtype=np.int64)
    X = np.asarray(rows, dtype=np.float32)
    return X, y, label_to_idx


def _evaluate_classifier(
    *,
    key: str,
    title: str,
    csv_path: Path,
    model_obj: Any,
    model_path: Path,
    expected_features: int | None = None,
    test_size: float = 0.2,
) -> dict[str, Any]:
    base: dict[str, Any] = {
        "key": key,
        "title": title,
        "model_path": str(model_path),
        "csv_path": str(csv_path),
        "available": bool(model_obj is not None and csv_path.exists()),
    }
    if model_obj is None:
        return {**base, "error": "Model chua duoc load hoac chua ton tai."}
    if not csv_path.exists():
        return {**base, "error": "Khong tim thay dataset CSV."}

    try:
        X, y, label_to_idx = _load_labeled_csv(csv_path)
        if expected_features is not None and X.shape[1] != expected_features:
            return {
                **base,
                "available": False,
                "samples": int(X.shape[0]),
                "features": int(X.shape[1]),
                "error": f"So feature dataset ({X.shape[1]}) khong khop model ({expected_features}).",
            }

        counts = Counter(int(v) for v in y.tolist())
        stratify = y if len(counts) > 1 and min(counts.values()) >= 2 else None
        _, X_test, _, y_test = train_test_split(
            X,
            y,
            test_size=test_size,
            random_state=42,
            stratify=stratify,
        )
        y_pred = model_obj.predict(X_test)
        labels_order = [idx for _, idx in sorted(label_to_idx.items(), key=lambda kv: kv[1])]
        class_names = [label for label, _ in sorted(label_to_idx.items(), key=lambda kv: kv[1])]
        report = classification_report(
            y_test,
            y_pred,
            labels=labels_order,
            target_names=class_names,
            output_dict=True,
            zero_division=0,
        )
        cm = confusion_matrix(y_test, y_pred, labels=labels_order)

        return {
            **base,
            "available": True,
            "samples": int(X.shape[0]),
            "features": int(X.shape[1]),
            "train_samples": int(X.shape[0] - X_test.shape[0]),
            "test_samples": int(X_test.shape[0]),
            "classes": class_names,
            "class_distribution": {
                class_names[idx]: int(counts.get(idx, 0))
                for idx in range(len(class_names))
            },
            "accuracy": float(accuracy_score(y_test, y_pred)),
            "macro_precision": float(report["macro avg"]["precision"]),
            "macro_recall": float(report["macro avg"]["recall"]),
            "macro_f1": float(report["macro avg"]["f1-score"]),
            "weighted_f1": float(report["weighted avg"]["f1-score"]),
            "per_class": {
                name: {
                    "precision": float(report[name]["precision"]),
                    "recall": float(report[name]["recall"]),
                    "f1": float(report[name]["f1-score"]),
                    "support": int(report[name]["support"]),
                }
                for name in class_names
            },
            "confusion_matrix": cm.astype(int).tolist(),
            "split": "80/20 random_state=42",
        }
    except Exception as exc:
        return {**base, "available": False, "error": str(exc)}


@app.get("/api/admin/model_analytics")
def admin_model_analytics() -> Any:
    """Evaluate loaded ML models against their local CSV datasets."""
    hand_features = None
    try:
        hand_features = int(hand_vec_len)
    except Exception:
        hand_features = None

    models = [
        _evaluate_classifier(
            key="face_landmarks",
            title="Face Landmark Drowsiness",
            csv_path=FACE_CSV_PATH,
            model_obj=model,
            model_path=MODEL_PATH,
            test_size=0.2,
        ),
        _evaluate_classifier(
            key="hand_gesture",
            title="Hand Gesture Control",
            csv_path=HAND_CSV_PATH,
            model_obj=hand_model,
            model_path=HAND_MODEL_PATH,
            expected_features=hand_features,
            test_size=0.15,
        ),
        _evaluate_classifier(
            key="smoking",
            title="Smoking Detection",
            csv_path=SMOKING_CSV_PATH,
            model_obj=smoking_model,
            model_path=SMOKING_MODEL_PATH,
            test_size=0.2,
        ),
    ]

    return jsonify(
        {
            "models": models,
            "generated_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        }
    )


@app.get("/api/admin/drivers")
def admin_drivers_overview() -> Any:
    """Full admin overview: drivers, owner binding, sessions, alerts, and stats."""
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_driving_session_tables(cur)

            cur.execute(
                """
                SELECT
                    di.driver_id,
                    di.name,
                    di.image_base64,
                    di.created_at,
                    dto.telegram_chat_id,
                    dto.telegram_user_id,
                    dto.updated_at AS telegram_updated_at
                FROM driver_identity di
                LEFT JOIN driver_telegram_owner dto ON dto.driver_id = di.driver_id
                ORDER BY di.created_at DESC
                """
            )
            driver_rows = cur.fetchall() or []

            cur.execute(
                """
                SELECT id, driver_id, label, started_at, ended_at
                FROM driving_sessions
                ORDER BY started_at DESC
                LIMIT 500
                """
            )
            session_rows = cur.fetchall() or []

            cur.execute(
                """
                SELECT session_id, alert_type, count
                FROM driving_session_alerts
                """
            )
            alert_rows = cur.fetchall() or []

            cur.execute(
                """
                SELECT session_id, lat, lng, accuracy, speed, heading, recorded_at
                FROM driving_session_locations
                ORDER BY recorded_at ASC
                LIMIT 5000
                """
            )
            location_rows = cur.fetchall() or []

            cur.execute(
                """
                SELECT request_id, driver_id, status, reason, similarity, threshold,
                       requested_at, expires_at, decided_at, decided_by_chat_id,
                       telegram_chat_id, telegram_message_id
                FROM identity_decision_requests
                ORDER BY requested_at DESC
                LIMIT 300
                """
            )
            decision_rows = cur.fetchall() or []
    finally:
        conn.close()

    alerts_by_session: dict[int, dict[str, int]] = defaultdict(dict)
    for row in alert_rows:
        sid = int(row["session_id"])
        alerts_by_session[sid][str(row["alert_type"])] = int(row["count"] or 0)

    locations_by_session: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in location_rows:
        sid = int(row["session_id"])
        locations_by_session[sid].append(
            {
                "lat": float(row["lat"]),
                "lng": float(row["lng"]),
                "accuracy": row.get("accuracy"),
                "speed": row.get("speed"),
                "heading": row.get("heading"),
                "recorded_at": _dt_text(row.get("recorded_at")),
                "label": f"G{len(locations_by_session[sid]) + 1}",
            }
        )

    sessions_by_driver: dict[str, list[dict[str, Any]]] = defaultdict(list)
    active_session_ids = set()
    alert_totals: dict[str, int] = defaultdict(int)
    total_minutes = 0.0
    timeline: dict[str, dict[str, int]] = defaultdict(lambda: {"sessions": 0, "alerts": 0})

    for row in session_rows:
        sid = int(row["id"])
        did = str(row.get("driver_id") or "unknown")
        alerts = alerts_by_session.get(sid, {})
        alert_count = sum(alerts.values())
        duration_min = _duration_minutes(row.get("started_at"), row.get("ended_at"))
        total_minutes += duration_min
        if row.get("ended_at") is None:
            active_session_ids.add(sid)
        for key, value in alerts.items():
            alert_totals[key] += value
        day = (_dt_text(row.get("started_at")) or "")[:10] or "unknown"
        timeline[day]["sessions"] += 1
        timeline[day]["alerts"] += alert_count
        route = locations_by_session.get(sid, [])
        has_real_gps = len(route) > 0
        sessions_by_driver[did].append(
            {
                "session_id": sid,
                "label": row.get("label"),
                "started_at": _dt_text(row.get("started_at")),
                "ended_at": _dt_text(row.get("ended_at")),
                "duration_min": duration_min,
                "alerts": alerts,
                "alert_count": alert_count,
                "status": "active" if sid in active_session_ids else "completed",
                "route": route if has_real_gps else _route_points(did, sid),
                "route_source": "gps" if has_real_gps else "demo",
                "location_count": len(route),
                "last_location": route[-1] if has_real_gps else None,
                "address": (
                    f"GPS: {route[-1]['lat']:.5f}, {route[-1]['lng']:.5f}"
                    if has_real_gps
                    else "Chua co GPS that - dang hien thi lo trinh mo phong"
                ),
            }
        )

    decisions_by_driver: dict[str, list[dict[str, Any]]] = defaultdict(list)
    decision_status_totals: dict[str, int] = defaultdict(int)
    for row in decision_rows:
        did = str(row.get("driver_id") or "unknown")
        status = str(row.get("status") or "unknown")
        decision_status_totals[status] += 1
        decisions_by_driver[did].append(
            {
                "request_id": int(row["request_id"]),
                "status": status,
                "reason": row.get("reason"),
                "similarity": row.get("similarity"),
                "threshold": row.get("threshold"),
                "requested_at": _dt_text(row.get("requested_at")),
                "expires_at": _dt_text(row.get("expires_at")),
                "decided_at": _dt_text(row.get("decided_at")),
                "decided_by_chat_id": row.get("decided_by_chat_id"),
                "telegram_chat_id": row.get("telegram_chat_id"),
                "telegram_message_id": row.get("telegram_message_id"),
            }
        )

    drivers = []
    for row in driver_rows:
        did = str(row["driver_id"])
        sessions = sessions_by_driver.get(did, [])
        decisions = decisions_by_driver.get(did, [])
        driver_alerts: dict[str, int] = defaultdict(int)
        for session in sessions:
            for key, value in session["alerts"].items():
                driver_alerts[key] += int(value)
        drivers.append(
            {
                "driver_id": did,
                "name": row.get("name") or did,
                "image_base64": row.get("image_base64"),
                "registered_at": _dt_text(row.get("created_at")),
                "telegram": {
                    "chat_id": row.get("telegram_chat_id"),
                    "user_id": row.get("telegram_user_id"),
                    "updated_at": _dt_text(row.get("telegram_updated_at")),
                    "bound": row.get("telegram_chat_id") is not None,
                },
                "address": "Chua co dia chi co dinh trong DB",
                "sessions": sessions,
                "decisions": decisions,
                "stats": {
                    "sessions": len(sessions),
                    "active_sessions": sum(1 for s in sessions if s["status"] == "active"),
                    "total_minutes": round(sum(s["duration_min"] for s in sessions), 1),
                    "total_alerts": sum(driver_alerts.values()),
                    "gps_points": sum(int(s.get("location_count") or 0) for s in sessions),
                    "alerts": dict(driver_alerts),
                },
            }
        )

    return jsonify(
        {
            "drivers": drivers,
            "stats": {
                "drivers": len(drivers),
                "registered_drivers": len(drivers),
                "active_sessions": len(active_session_ids),
                "sessions": len(session_rows),
                "total_minutes": round(total_minutes, 1),
                "total_alerts": sum(alert_totals.values()),
                "gps_points": len(location_rows),
                "alerts": dict(alert_totals),
                "decisions": dict(decision_status_totals),
            },
            "timeline": [
                {"date": day, **values}
                for day, values in sorted(timeline.items())
            ][-14:],
        }
    )
