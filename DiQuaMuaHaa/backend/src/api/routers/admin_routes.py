"""Admin dashboard routes for driver identity and trip analytics."""
from __future__ import annotations

import hashlib
from collections import defaultdict

from data.api.runtime import *


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
