"""
Telegram service module.
Handles all Telegram Bot API interactions.
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional
from urllib import parse, request as urlrequest

from src.core.config import TELEGRAM_BOT_TOKEN
from src.core.exceptions import TelegramAPIException


def _telegram_call(method: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Make a call to Telegram Bot API."""
    if not TELEGRAM_BOT_TOKEN:
        raise TelegramAPIException("Missing TELEGRAM_BOT_TOKEN")
    api_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}"
    body = parse.urlencode(payload).encode("utf-8")
    req = urlrequest.Request(api_url, data=body, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urlrequest.urlopen(req, timeout=10) as resp:
        raw = resp.read().decode("utf-8")
        data = json.loads(raw)
        if not data.get("ok"):
            raise TelegramAPIException(f"Telegram API error: {data}")
        return data


def send_decision_message(
    chat_id: int,
    driver_id: str,
    request_id: int,
    similarity: Optional[float],
    threshold: Optional[float],
    timeout_sec: int,
) -> int:
    """
    Send identity verification decision request to Telegram.
    Returns: message_id
    """
    sim_txt = f"{(similarity or 0) * 100:.2f}%" if similarity is not None else "--"
    thr_txt = f"{(threshold or 0) * 100:.2f}%" if threshold is not None else "--"
    text = (
        "CANH BAO XE KHONG CHINH CHU\n"
        f"Driver ID: {driver_id}\n"
        f"Similarity: {sim_txt}\n"
        f"Threshold: {thr_txt}\n"
        f"Thoi gian cho phep phan hoi: {timeout_sec}s\n\n"
        "Chon Accept de cho phep xe di chuyen, Reject de khoa may."
    )
    keyboard = {
        "inline_keyboard": [
            [
                {"text": "Accept", "callback_data": f"idr:accept:{request_id}"},
                {"text": "Reject", "callback_data": f"idr:reject:{request_id}"},
            ]
        ]
    }
    data = _telegram_call(
        "sendMessage",
        {
            "chat_id": str(chat_id),
            "text": text,
            "reply_markup": json.dumps(keyboard, ensure_ascii=True),
        },
    )
    msg = data.get("result") or {}
    msg_id = msg.get("message_id")
    if not isinstance(msg_id, int):
        raise TelegramAPIException("Telegram response missing message_id")
    return msg_id


def answer_callback(callback_query_id: str, text: str) -> None:
    """Answer a callback query (inline keyboard button press)."""
    _telegram_call(
        "answerCallbackQuery",
        {"callback_query_id": callback_query_id, "text": text, "show_alert": "false"},
    )


def send_text(chat_id: int, text: str) -> None:
    """Send a plain text message."""
    _telegram_call("sendMessage", {"chat_id": str(chat_id), "text": text})
