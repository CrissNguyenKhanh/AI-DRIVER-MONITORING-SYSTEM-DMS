"""Driving session management routes.

Handles starting/ending driving sessions and recording alerts
for various driver behavior events (drowsiness, smoking, phone usage).
"""
from __future__ import annotations

from data.api.runtime import *


@app.post("/api/session/start")
def driving_session_start() -> Any:
    """Bắt đầu phiên lái (sau khi tài xế đã active)."""
    payload = request.get_json(silent=True) or {}
    driver_id = (payload.get("driver_id") or "").strip() or None
    label = (payload.get("label") or "").strip() or None
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_driving_session_tables(cur)
            if driver_id:
                cur.execute(
                    "SELECT driver_id FROM driver_identity WHERE driver_id = %s LIMIT 1",
                    (driver_id,),
                )
                if not cur.fetchone():
                    return jsonify({"error": "driver_id chua duoc dang ky."}), 404
            cur.execute(
                """
                INSERT INTO driving_sessions (driver_id, label, started_at, ended_at)
                VALUES (%s, %s, %s, NULL)
                """,
                (driver_id, label, now),
            )
            sid = cur.lastrowid
        conn.commit()
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()

    return jsonify({"session_id": int(sid), "started_at": now, "driver_id": driver_id})


@app.post("/api/session/end")
def driving_session_end() -> Any:
    """Kết thúc phiên lái (ghi ended_at)."""
    payload = request.get_json(silent=True) or {}
    try:
        session_id = int(payload.get("session_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "Thiếu hoặc sai 'session_id'."}), 400

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    n = 0
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_driving_session_tables(cur)
            cur.execute(
                """
                UPDATE driving_sessions
                SET ended_at = %s
                WHERE id = %s AND ended_at IS NULL
                """,
                (now, session_id),
            )
            n = cur.rowcount
        conn.commit()
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()

    if not n:
        return jsonify({"error": "session_id không tồn tại hoặc đã kết thúc."}), 404
    return jsonify({"ok": True, "session_id": session_id, "ended_at": now})


@app.post("/api/session/alert")
def driving_session_alert() -> Any:
    """Tăng số lần cảnh báo theo loại (delta mặc định 1)."""
    payload = request.get_json(silent=True) or {}
    try:
        session_id = int(payload.get("session_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "Thiếu hoặc sai 'session_id'."}), 400

    alert_type = (payload.get("alert_type") or "").strip().lower()
    if alert_type not in DRIVING_ALERT_TYPES:
        return (
            jsonify(
                {
                    "error": f"alert_type không hợp lệ. Cho phép: {sorted(DRIVING_ALERT_TYPES)}",
                }
            ),
            400,
        )

    try:
        delta = int(payload.get("delta", 1))
    except (TypeError, ValueError):
        return jsonify({"error": "'delta' phải là số nguyên."}), 400
    if delta < 1 or delta > 1000:
        return jsonify({"error": "'delta' phải trong [1, 1000]."}), 400

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_driving_session_tables(cur)
            cur.execute(
                "SELECT id FROM driving_sessions WHERE id = %s LIMIT 1",
                (session_id,),
            )
            if not cur.fetchone():
                return jsonify({"error": "session_id không tồn tại."}), 404
            cur.execute(
                """
                INSERT INTO driving_session_alerts (session_id, alert_type, count)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE count = count + VALUES(count)
                """,
                (session_id, alert_type, delta),
            )
            cur.execute(
                """
                SELECT count FROM driving_session_alerts
                WHERE session_id = %s AND alert_type = %s
                """,
                (session_id, alert_type),
            )
            row = cur.fetchone()
            total = int(row["count"]) if row else delta
        conn.commit()
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()

    return jsonify(
        {"ok": True, "session_id": session_id, "alert_type": alert_type, "count": total}
    )


@app.post("/api/session/location")
def driving_session_location() -> Any:
    """Ghi mot diem GPS cho phien lai dang ton tai."""
    payload = request.get_json(silent=True) or {}
    try:
        session_id = int(payload.get("session_id"))
        lat = float(payload.get("lat"))
        lng = float(payload.get("lng"))
    except (TypeError, ValueError):
        return jsonify({"error": "Thieu hoac sai session_id/lat/lng."}), 400

    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return jsonify({"error": "Toa do GPS khong hop le."}), 400

    def _optional_float(key: str) -> float | None:
        raw = payload.get(key)
        if raw is None or raw == "":
            return None
        try:
            return float(raw)
        except (TypeError, ValueError):
            return None

    accuracy = _optional_float("accuracy")
    speed = _optional_float("speed")
    heading = _optional_float("heading")
    recorded_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_driving_session_tables(cur)
            cur.execute(
                "SELECT id FROM driving_sessions WHERE id = %s LIMIT 1",
                (session_id,),
            )
            if not cur.fetchone():
                return jsonify({"error": "session_id khong ton tai."}), 404
            cur.execute(
                """
                INSERT INTO driving_session_locations
                    (session_id, lat, lng, accuracy, speed, heading, recorded_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (session_id, lat, lng, accuracy, speed, heading, recorded_at),
            )
            location_id = int(cur.lastrowid)
        conn.commit()
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()

    return jsonify(
        {
            "ok": True,
            "location_id": location_id,
            "session_id": session_id,
            "recorded_at": recorded_at,
        }
    )


@app.get("/api/session/list")
def driving_sessions_list() -> Any:
    """Danh sách phiên gần đây (kèm tổng cảnh báo)."""
    try:
        limit = min(100, max(1, int(request.args.get("limit", "30"))))
    except ValueError:
        limit = 30
    driver_id = (request.args.get("driver_id") or "").strip() or None

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_driving_session_tables(cur)
            if driver_id:
                cur.execute(
                    """
                    SELECT id, driver_id, label, started_at, ended_at
                    FROM driving_sessions
                    WHERE driver_id = %s
                    ORDER BY started_at DESC
                    LIMIT %s
                    """,
                    (driver_id, limit),
                )
            else:
                cur.execute(
                    """
                    SELECT id, driver_id, label, started_at, ended_at
                    FROM driving_sessions
                    ORDER BY started_at DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
            sessions = cur.fetchall() or []
            out: List[Dict[str, Any]] = []
            for s in sessions:
                sid = int(s["id"])
                cur.execute(
                    """
                    SELECT alert_type, count FROM driving_session_alerts
                    WHERE session_id = %s
                    """,
                    (sid,),
                )
                alerts = {str(r["alert_type"]): int(r["count"]) for r in (cur.fetchall() or [])}
                out.append(
                    {
                        "session_id": sid,
                        "driver_id": s.get("driver_id"),
                        "label": s.get("label"),
                        "started_at": _session_dt_iso(s.get("started_at")),
                        "ended_at": _session_dt_iso(s.get("ended_at")),
                        "alerts": alerts,
                    }
                )
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()

    return jsonify({"sessions": out})


def _session_dt_iso(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    return str(v)


@app.get("/api/session/<int:session_id>")
def driving_session_detail(session_id: int) -> Any:
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_driving_session_tables(cur)
            cur.execute(
                """
                SELECT id, driver_id, label, started_at, ended_at
                FROM driving_sessions WHERE id = %s LIMIT 1
                """,
                (session_id,),
            )
            s = cur.fetchone()
            if not s:
                return jsonify({"error": "Không tìm thấy phiên."}), 404
            cur.execute(
                """
                SELECT alert_type, count FROM driving_session_alerts
                WHERE session_id = %s
                """,
                (session_id,),
            )
            alerts = {str(r["alert_type"]): int(r["count"]) for r in (cur.fetchall() or [])}
            cur.execute(
                """
                SELECT lat, lng, accuracy, speed, heading, recorded_at
                FROM driving_session_locations
                WHERE session_id = %s
                ORDER BY recorded_at ASC
                LIMIT 1000
                """,
                (session_id,),
            )
            locations = [
                {
                    "lat": float(r["lat"]),
                    "lng": float(r["lng"]),
                    "accuracy": r.get("accuracy"),
                    "speed": r.get("speed"),
                    "heading": r.get("heading"),
                    "recorded_at": _session_dt_iso(r.get("recorded_at")),
                }
                for r in (cur.fetchall() or [])
            ]
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()

    return jsonify(
        {
            "session_id": int(s["id"]),
            "driver_id": s.get("driver_id"),
            "label": s.get("label"),
            "started_at": _session_dt_iso(s.get("started_at")),
            "ended_at": _session_dt_iso(s.get("ended_at")),
            "alerts": alerts,
            "locations": locations,
        }
    )
