from .runtime import *


@app.post("/api/driving/session/start")
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


@app.post("/api/driving/session/end")
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


@app.post("/api/driving/session/alert")
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


@app.get("/api/driving/sessions")
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


@app.get("/api/driving/session/<int:session_id>")
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
        }
    )


socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")
