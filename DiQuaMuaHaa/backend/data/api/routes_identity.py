from .runtime import *


@app.post("/api/identity/register")
def identity_register() -> Any:
    """
    Đăng ký khuôn mặt chính chủ cho một driver_id.

    Body JSON:
    {
        "driver_id": "driver_001",
        "name": "Nguyen Van A",   # optional
        "image": "data:image/jpeg;base64,...." hoặc chỉ chuỗi base64
    }
    """
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValueError("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400

    driver_id = str(payload.get("driver_id", "")).strip()
    name = str(payload.get("name") or "").strip()
    if not driver_id:
        return jsonify({"error": "Thiếu 'driver_id'."}), 400

    images = _extract_images_from_payload(payload)
    if not images:
        return jsonify({"error": "Thiếu 'image' hoặc 'images' trong JSON body."}), 400

    try:
        embeddings = _collect_face_embeddings(images)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if len(embeddings) < IDENTITY_MIN_REGISTER_SAMPLES:
        return (
            jsonify(
                {
                    "error": (
                        "Không đủ frame khuôn mặt hợp lệ để đăng ký. "
                        f"Cần >= {IDENTITY_MIN_REGISTER_SAMPLES}, hiện có {len(embeddings)}."
                    )
                }
            ),
            400,
        )

    embedding = _mean_embedding(embeddings)
    image_b64 = images[0]

    embedding_json = json.dumps(embedding)
    created_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_identity_tables(cur)
            cur.execute(
                """
                INSERT INTO driver_identity (driver_id, name, embedding_json, image_base64, created_at)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    embedding_json = VALUES(embedding_json),
                    image_base64 = VALUES(image_base64),
                    created_at = VALUES(created_at)
                """,
                (driver_id, name, embedding_json, image_b64, created_at),
            )
        conn.commit()
    finally:
        conn.close()

    return jsonify(
        {
            "status": "ok",
            "driver_id": driver_id,
            "name": name,
            "created_at": created_at,
            "samples_used": len(embeddings),
        }
    )


@app.post("/api/identity/verify")
def identity_verify() -> Any:
    """
    So khớp tài xế hiện tại với chính chủ đã đăng ký.

    Body JSON:
    {
        "driver_id": "driver_001",
        "image": "data:image/jpeg;base64,...."
    }
    """
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValueError("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400

    driver_id = str(payload.get("driver_id", "")).strip()
    if not driver_id:
        return jsonify({"error": "Thiếu 'driver_id'."}), 400

    images = _extract_images_from_payload(payload)
    if not images:
        return jsonify({"error": "Thiếu 'image' hoặc 'images' trong JSON body."}), 400

    try:
        current_embeddings = _collect_face_embeddings(images)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    if len(current_embeddings) < IDENTITY_MIN_VERIFY_SAMPLES:
        return (
            jsonify(
                {
                    "error": (
                        "Không detect được khuôn mặt ổn định để xác thực. "
                        f"Cần >= {IDENTITY_MIN_VERIFY_SAMPLES} frame hợp lệ."
                    )
                }
            ),
            400,
        )

    embedding_now = _mean_embedding(current_embeddings)

    # Lấy embedding đã đăng ký
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_identity_tables(cur)
            cur.execute(
                """
                SELECT embedding_json, name, image_base64, created_at
                FROM driver_identity WHERE driver_id = %s
                """,
                (driver_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if row is None:
        return jsonify(
            {
                "driver_id": driver_id,
                "has_registered": False,
                "is_owner": False,
                "similarity": None,
                "threshold": None,
                "error": "Chưa có khuôn mặt chính chủ cho driver_id này.",
            }
        )

    try:
        stored_embedding = json.loads(row["embedding_json"])
    except Exception:
        return (
            jsonify({"error": "Không đọc được embedding đã lưu trong database."}),
            500,
        )

    similarity = _cosine_similarity(stored_embedding, embedding_now)
    threshold = IDENTITY_SIM_THRESHOLD

    created_raw = row.get("created_at")
    if hasattr(created_raw, "strftime"):
        registered_at = created_raw.strftime("%Y-%m-%d %H:%M:%S")
    else:
        registered_at = str(created_raw) if created_raw is not None else ""

    reg_name = str(row.get("name") or "").strip()

    return jsonify(
        {
            "driver_id": driver_id,
            "has_registered": True,
            "is_owner": bool(similarity >= threshold),
            "similarity": float(similarity),
            "threshold": float(threshold),
            "samples_used": len(current_embeddings),
            "registered_name": reg_name,
            "profile_image_base64": row.get("image_base64"),
            "registered_at": registered_at,
        }
    )


@app.get("/api/identity/driver_profile")
def identity_driver_profile() -> Any:
    """Trả về tên + ảnh đăng ký + ngày tạo (dùng cho UI sau khi mở khóa / Telegram accept)."""
    driver_id = str(request.args.get("driver_id", "")).strip()
    if not driver_id:
        return jsonify({"error": "Thiếu driver_id."}), 400

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_identity_tables(cur)
            cur.execute(
                """
                SELECT driver_id, name, image_base64, created_at
                FROM driver_identity WHERE driver_id = %s
                """,
                (driver_id,),
            )
            row = cur.fetchone()
    finally:
        conn.close()

    if row is None:
        return jsonify({"error": "Không tìm thấy driver_id trong hệ thống."}), 404

    created_raw = row.get("created_at")
    if hasattr(created_raw, "strftime"):
        registered_at = created_raw.strftime("%Y-%m-%d %H:%M:%S")
    else:
        registered_at = str(created_raw) if created_raw is not None else ""

    reg_name = str(row.get("name") or "").strip()
    did = str(row.get("driver_id") or driver_id)

    return jsonify(
        {
            "driver_id": did,
            "registered_name": reg_name or did,
            "profile_image_base64": row.get("image_base64"),
            "registered_at": registered_at,
        }
    )


@app.post("/api/identity/telegram/bind")
def bind_driver_telegram_owner() -> Any:
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValueError("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400

    driver_id = str(payload.get("driver_id", "")).strip()
    chat_id_raw = payload.get("telegram_chat_id")
    user_id_raw = payload.get("telegram_user_id")
    if not driver_id:
        return jsonify({"error": "Thiếu 'driver_id'."}), 400
    if chat_id_raw is None:
        return jsonify({"error": "Thiếu 'telegram_chat_id'."}), 400

    try:
        chat_id = int(chat_id_raw)
    except Exception:
        return jsonify({"error": "'telegram_chat_id' phải là số."}), 400

    user_id = None
    if user_id_raw is not None:
        try:
            user_id = int(user_id_raw)
        except Exception:
            user_id = None

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_identity_tables(cur)
            cur.execute(
                """
                INSERT INTO driver_telegram_owner
                    (driver_id, telegram_chat_id, telegram_user_id, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    telegram_chat_id = VALUES(telegram_chat_id),
                    telegram_user_id = VALUES(telegram_user_id),
                    updated_at = VALUES(updated_at)
                """,
                (driver_id, chat_id, user_id, now, now),
            )
        conn.commit()
    finally:
        conn.close()

    return jsonify(
        {
            "status": "ok",
            "driver_id": driver_id,
            "telegram_chat_id": chat_id,
            "telegram_user_id": user_id,
        }
    )


@app.post("/api/identity/request_decision")
def request_identity_decision() -> Any:
    try:
        payload = request.get_json(force=True, silent=False)
        if payload is None:
            raise ValueError("Body phải là JSON hợp lệ.")
    except Exception:
        return jsonify({"error": "Không đọc được JSON body."}), 400

    driver_id = str(payload.get("driver_id", "")).strip()
    if not driver_id:
        return jsonify({"error": "Thiếu 'driver_id'."}), 400

    phase = str(payload.get("phase") or "").strip().lower()
    if phase != "auth":
        return jsonify(
            {
                "error": (
                    "Gửi yêu cầu Telegram chỉ được khi xác nhận xe. "
                    "Truyền phase=auth từ bước CAR AUTH (không dùng khi đang lái)."
                )
            }
        ), 400

    similarity = payload.get("similarity")
    threshold = payload.get("threshold")
    reason = str(payload.get("reason", "intruder")).strip() or "intruder"
    timeout_sec = int(payload.get("timeout_sec") or IDENTITY_DECISION_TIMEOUT_SEC)
    timeout_sec = max(10, min(timeout_sec, 300))

    similarity_val = None
    threshold_val = None
    try:
        if similarity is not None:
            similarity_val = float(similarity)
    except Exception:
        similarity_val = None
    try:
        if threshold is not None:
            threshold_val = float(threshold)
    except Exception:
        threshold_val = None

    now_dt = datetime.utcnow()
    now = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    expires_dt = now_dt + timedelta(seconds=timeout_sec)
    expires = expires_dt.strftime("%Y-%m-%d %H:%M:%S")

    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_identity_tables(cur)
            cur.execute(
                """
                SELECT request_id, expires_at
                FROM identity_decision_requests
                WHERE driver_id = %s AND status = 'pending'
                ORDER BY request_id DESC
                LIMIT 1
                """,
                (driver_id,),
            )
            pending_row = cur.fetchone()

            if pending_row:
                req_id = int(pending_row["request_id"])
                exp = pending_row["expires_at"]
                exp_dt = exp if isinstance(exp, datetime) else datetime.strptime(exp, "%Y-%m-%d %H:%M:%S")
                if exp_dt > now_dt:
                    remaining = int((exp_dt - now_dt).total_seconds())
                    return jsonify(
                        {
                            "status": "pending",
                            "request_id": req_id,
                            "driver_id": driver_id,
                            "remaining_sec": remaining,
                        }
                    )
                cur.execute(
                    """
                    UPDATE identity_decision_requests
                    SET status = 'expired', decided_at = %s
                    WHERE request_id = %s
                    """,
                    (now, req_id),
                )

            cur.execute(
                """
                SELECT telegram_chat_id
                FROM driver_telegram_owner
                WHERE driver_id = %s
                LIMIT 1
                """,
                (driver_id,),
            )
            owner_row = cur.fetchone()
            if not owner_row:
                return jsonify({"error": "Chưa bind Telegram chat_id cho driver_id này."}), 400

            chat_id = int(owner_row["telegram_chat_id"])
            cur.execute(
                """
                INSERT INTO identity_decision_requests
                    (driver_id, status, reason, similarity, threshold, requested_at, expires_at, telegram_chat_id)
                VALUES (%s, 'pending', %s, %s, %s, %s, %s, %s)
                """,
                (driver_id, reason, similarity_val, threshold_val, now, expires, chat_id),
            )
            request_id = int(cur.lastrowid)

            try:
                msg_id = _telegram_send_decision_message(
                    chat_id=chat_id,
                    driver_id=driver_id,
                    request_id=request_id,
                    similarity=similarity_val,
                    threshold=threshold_val,
                    timeout_sec=timeout_sec,
                )
            except Exception as exc:
                cur.execute(
                    """
                    UPDATE identity_decision_requests
                    SET status = 'expired', decided_at = %s, reason = %s
                    WHERE request_id = %s
                    """,
                    (now, f"telegram_error:{exc}", request_id),
                )
                conn.commit()
                return jsonify({"error": f"Không gửi được Telegram: {exc}"}), 500

            cur.execute(
                """
                UPDATE identity_decision_requests
                SET telegram_message_id = %s
                WHERE request_id = %s
                """,
                (msg_id, request_id),
            )
        conn.commit()
    finally:
        conn.close()

    return jsonify(
        {
            "status": "pending",
            "request_id": request_id,
            "driver_id": driver_id,
            "remaining_sec": timeout_sec,
        }
    )


@app.get("/api/identity/decision_status")
def identity_decision_status() -> Any:
    request_id_raw = request.args.get("request_id", "").strip()
    if not request_id_raw:
        return jsonify({"error": "Thiếu query 'request_id'."}), 400
    try:
        request_id = int(request_id_raw)
    except Exception:
        return jsonify({"error": "'request_id' phải là số."}), 400

    now_dt = datetime.utcnow()
    now = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    conn = get_mysql_conn()
    try:
        with conn.cursor() as cur:
            _ensure_identity_tables(cur)
            cur.execute(
                """
                SELECT request_id, driver_id, status, reason, requested_at, expires_at, decided_at
                FROM identity_decision_requests
                WHERE request_id = %s
                LIMIT 1
                """,
                (request_id,),
            )
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "request_id không tồn tại."}), 404

            status = str(row["status"])
            expires_at = row["expires_at"]
            exp_dt = (
                expires_at
                if isinstance(expires_at, datetime)
                else datetime.strptime(expires_at, "%Y-%m-%d %H:%M:%S")
            )
            if status == "pending" and exp_dt <= now_dt:
                cur.execute(
                    """
                    UPDATE identity_decision_requests
                    SET status = 'expired', decided_at = %s
                    WHERE request_id = %s
                    """,
                    (now, request_id),
                )
                conn.commit()
                status = "expired"

            remaining_sec = max(0, int((exp_dt - now_dt).total_seconds()))
            return jsonify(
                {
                    "request_id": int(row["request_id"]),
                    "driver_id": row["driver_id"],
                    "status": status,
                    "reason": row.get("reason"),
                    "remaining_sec": remaining_sec,
                }
            )
    finally:
        conn.close()


@app.post("/api/telegram/webhook")
def telegram_webhook() -> Any:
    if TELEGRAM_WEBHOOK_SECRET:
        got = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if got != TELEGRAM_WEBHOOK_SECRET:
            return jsonify({"ok": False, "error": "Invalid secret"}), 403

    payload = request.get_json(silent=True) or {}

    callback = payload.get("callback_query")
    if isinstance(callback, dict):
        callback_id = str(callback.get("id") or "")
        data = str(callback.get("data") or "")
        message = callback.get("message") or {}
        chat = message.get("chat") or {}
        chat_id = int(chat.get("id") or 0)

        parts = data.split(":")
        if len(parts) == 3 and parts[0] == "idr" and parts[1] in ("accept", "reject"):
            action = parts[1]
            try:
                req_id = int(parts[2])
            except Exception:
                _telegram_answer_callback(callback_id, "Yeu cau khong hop le.")
                return jsonify({"ok": True})

            now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            now_dt = datetime.utcnow()
            conn = get_mysql_conn()
            try:
                with conn.cursor() as cur:
                    _ensure_identity_tables(cur)
                    cur.execute(
                        """
                        SELECT request_id, status, expires_at, telegram_chat_id
                        FROM identity_decision_requests
                        WHERE request_id = %s
                        LIMIT 1
                        """,
                        (req_id,),
                    )
                    row = cur.fetchone()
                    if not row:
                        _telegram_answer_callback(callback_id, "Yeu cau khong ton tai.")
                        return jsonify({"ok": True})

                    if int(row.get("telegram_chat_id") or 0) != chat_id:
                        _telegram_answer_callback(callback_id, "Ban khong co quyen xu ly yeu cau nay.")
                        return jsonify({"ok": True})

                    status = str(row.get("status") or "")
                    exp = row.get("expires_at")
                    exp_dt = exp if isinstance(exp, datetime) else datetime.strptime(exp, "%Y-%m-%d %H:%M:%S")
                    if status != "pending" or exp_dt <= now_dt:
                        if exp_dt <= now_dt and status == "pending":
                            cur.execute(
                                """
                                UPDATE identity_decision_requests
                                SET status = 'expired', decided_at = %s
                                WHERE request_id = %s
                                """,
                                (now, req_id),
                            )
                            conn.commit()
                        _telegram_answer_callback(callback_id, "Yeu cau da het han hoac da xu ly.")
                        return jsonify({"ok": True})

                    new_status = "accepted" if action == "accept" else "rejected"
                    cur.execute(
                        """
                        UPDATE identity_decision_requests
                        SET status = %s, decided_at = %s, decided_by_chat_id = %s
                        WHERE request_id = %s
                        """,
                        (new_status, now, chat_id, req_id),
                    )
                conn.commit()
            finally:
                conn.close()

            _telegram_answer_callback(callback_id, "Da ghi nhan lua chon.")
            return jsonify({"ok": True})

    message = payload.get("message")
    if isinstance(message, dict):
        chat = message.get("chat") or {}
        from_user = message.get("from") or {}
        text = str(message.get("text") or "").strip()
        chat_id = int(chat.get("id") or 0)
        user_id = int(from_user.get("id") or 0)

        if text.startswith("/bind"):
            parts = text.split()
            if len(parts) < 2:
                _telegram_send_text(chat_id, "Cach dung: /bind <driver_id>")
                return jsonify({"ok": True})
            driver_id = parts[1].strip()
            if not driver_id:
                _telegram_send_text(chat_id, "driver_id khong hop le.")
                return jsonify({"ok": True})

            now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            conn = get_mysql_conn()
            try:
                with conn.cursor() as cur:
                    _ensure_identity_tables(cur)
                    cur.execute(
                        """
                        INSERT INTO driver_telegram_owner
                            (driver_id, telegram_chat_id, telegram_user_id, created_at, updated_at)
                        VALUES (%s, %s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE
                            telegram_chat_id = VALUES(telegram_chat_id),
                            telegram_user_id = VALUES(telegram_user_id),
                            updated_at = VALUES(updated_at)
                        """,
                        (driver_id, chat_id, user_id, now, now),
                    )
                conn.commit()
            finally:
                conn.close()

            _telegram_send_text(chat_id, f"Da bind thanh cong cho driver_id: {driver_id}")
            return jsonify({"ok": True})

        if text.startswith("/start"):
            _telegram_send_text(chat_id, "Xin chao. Dung lenh: /bind <driver_id> de lien ket xe.")
            return jsonify({"ok": True})

    return jsonify({"ok": True})


