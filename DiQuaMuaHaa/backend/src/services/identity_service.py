"""
Identity service module.
Handles face embedding, verification, and registration business logic.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from src.core.config import IDENTITY_SIM_THRESHOLD, IDENTITY_MIN_VERIFY_SAMPLES
from src.core.exceptions import IdentityVerificationException
from src.repositories.identity_repository import (
    get_driver_identity,
    save_driver_identity,
    get_telegram_owner,
    save_telegram_owner,
    create_decision_request as repo_create_decision_request,
    get_pending_decision as repo_get_pending_decision,
    get_decision_status as repo_get_decision_status,
    update_decision_status as repo_update_decision_status,
)
from src.services.telegram_service import send_decision_message
from src.utils.image_processing import (
    extract_images_from_payload,
    collect_face_embeddings,
    mean_embedding,
)
from src.utils.embeddings import cosine_similarity


def register_driver_identity(
    driver_id: str,
    name: str,
    images: List[str],
    min_samples: int = 3,
) -> Dict[str, Any]:
    """
    Register driver identity with face embeddings.
    
    Args:
        driver_id: Unique driver identifier
        name: Driver name
        images: List of base64-encoded face images
        min_samples: Minimum valid embeddings required
        
    Returns:
        Dict with status, driver_id, name, created_at, samples_used
        
    Raises:
        IdentityVerificationException: If insufficient samples or invalid images
    """
    if not driver_id:
        raise IdentityVerificationException("Thiếu 'driver_id'.")
    if not name:
        raise IdentityVerificationException("Thiếu 'name'.")
    if not images:
        raise IdentityVerificationException("Thiếu 'image' hoặc 'images'.")
    
    # Collect embeddings from images
    embeddings = collect_face_embeddings(images)
    
    if len(embeddings) < min_samples:
        raise IdentityVerificationException(
            f"Không detect được khuôn mặt ổn định. "
            f"Cần >= {min_samples} frame hợp lệ, nhưng chỉ có {len(embeddings)}."
        )
    
    embedding = mean_embedding(embeddings)
    image_b64 = images[0]
    
    embedding_json = json.dumps(embedding)
    created_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    
    # Save to database
    save_driver_identity(driver_id, name, embedding_json, image_b64, created_at)
    
    return {
        "status": "ok",
        "driver_id": driver_id,
        "name": name,
        "created_at": created_at,
        "samples_used": len(embeddings),
    }


def verify_driver_identity(
    driver_id: str,
    images: List[str],
    min_samples: int = 2,
) -> Dict[str, Any]:
    """
    Verify current driver against registered identity.
    
    Args:
        driver_id: Driver identifier to verify
        images: List of base64-encoded face images
        min_samples: Minimum valid embeddings required
        
    Returns:
        Dict with driver_id, has_registered, is_owner, similarity, threshold
    """
    if not driver_id:
        raise IdentityVerificationException("Thiếu 'driver_id'.")
    if not images:
        raise IdentityVerificationException("Thiếu 'image' hoặc 'images'.")
    
    # Get current embeddings
    current_embeddings = collect_face_embeddings(images)
    
    if len(current_embeddings) < min_samples:
        raise IdentityVerificationException(
            f"Không detect được khuôn mặt ổn định để xác thực. "
            f"Cần >= {min_samples} frame hợp lệ."
        )
    
    embedding_now = mean_embedding(current_embeddings)
    
    # Get registered embedding from database
    row = get_driver_identity(driver_id)
    
    if row is None:
        return {
            "driver_id": driver_id,
            "has_registered": False,
            "is_owner": False,
            "similarity": None,
            "threshold": None,
            "error": "Chưa có khuôn mặt chính chủ cho driver_id này.",
        }
    
    try:
        stored_embedding = json.loads(row["embedding_json"])
    except Exception as exc:
        raise IdentityVerificationException(
            "Không đọc được embedding đã lưu trong database."
        ) from exc
    
    similarity = cosine_similarity(stored_embedding, embedding_now)
    threshold = IDENTITY_SIM_THRESHOLD
    
    created_raw = row.get("created_at")
    if hasattr(created_raw, "strftime"):
        registered_at = created_raw.strftime("%Y-%m-%d %H:%M:%S")
    else:
        registered_at = str(created_raw) if created_raw is not None else ""
    
    return {
        "driver_id": driver_id,
        "has_registered": True,
        "is_owner": bool(similarity >= threshold),
        "similarity": float(similarity),
        "threshold": float(threshold),
        "samples_used": len(current_embeddings),
        "registered_name": str(row.get("name") or "").strip(),
        "profile_image_base64": row.get("image_base64"),
        "registered_at": registered_at,
    }


def get_driver_profile(driver_id: str) -> Optional[Dict[str, Any]]:
    """Get driver profile (name, image, created_at)."""
    row = get_driver_identity(driver_id)
    if row is None:
        return None
    
    created_raw = row.get("created_at")
    if hasattr(created_raw, "strftime"):
        registered_at = created_raw.strftime("%Y-%m-%d %H:%M:%S")
    else:
        registered_at = str(created_raw) if created_raw is not None else ""
    
    return {
        "driver_id": driver_id,
        "name": str(row.get("name") or "").strip(),
        "profile_image_base64": row.get("image_base64"),
        "registered_at": registered_at,
    }


def bind_telegram_owner(
    driver_id: str,
    chat_id: int,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Bind Telegram chat_id to driver for identity decisions."""
    if not driver_id:
        raise IdentityVerificationException("Thiếu 'driver_id'.")
    if not chat_id:
        raise IdentityVerificationException("Thiếu 'chat_id'.")
    
    save_telegram_owner(driver_id, chat_id, user_id)
    
    return {
        "status": "ok",
        "driver_id": driver_id,
        "telegram_chat_id": chat_id,
    }


def request_identity_decision(
    driver_id: str,
    reason: str,
    similarity: float,
    threshold: float,
    timeout_sec: int = 30,
) -> Dict[str, Any]:
    """
    Request owner decision via Telegram when identity verification fails.
    
    Returns:
        Dict with status, request_id, driver_id, remaining_sec (if pending)
    """
    try:
        request_id, result = repo_create_decision_request(
            driver_id=driver_id,
            reason=reason,
            similarity=similarity,
            threshold=threshold,
            timeout_sec=timeout_sec,
        )
        
        # If result is int, it's remaining seconds for existing pending request
        if isinstance(result, int):
            return {
                "status": "pending",
                "request_id": request_id,
                "driver_id": driver_id,
                "remaining_sec": result,
            }
        
        # New request created, send Telegram message
        chat_id = result
        try:
            msg_id = send_decision_message(
                chat_id=chat_id,
                driver_id=driver_id,
                request_id=request_id,
                similarity=similarity,
                threshold=threshold,
                timeout_sec=timeout_sec,
            )
        except Exception as exc:
            # Update request to expired if Telegram fails
            repo_update_decision_status(
                request_id=request_id,
                status="expired",
                reason=f"telegram_error:{exc}",
            )
            raise IdentityVerificationException(f"Không gửi được Telegram: {exc}") from exc
        
        return {
            "status": "pending",
            "request_id": request_id,
            "driver_id": driver_id,
            "telegram_chat_id": chat_id,
            "timeout_sec": timeout_sec,
        }
        
    except ValueError as exc:
        raise IdentityVerificationException(str(exc)) from exc


def get_identity_decision_status(request_id: int) -> Optional[Dict[str, Any]]:
    """Get decision status by request_id."""
    return repo_get_decision_status(request_id)


def process_identity_decision(
    request_id: int,
    decision: str,  # "accept" or "reject"
    decided_by_chat_id: int,
) -> Dict[str, Any]:
    """Process owner's decision (accept/reject)."""
    status = "accepted" if decision == "accept" else "rejected"
    
    updated = repo_update_decision_status(
        request_id=request_id,
        status=status,
        decided_by_chat_id=decided_by_chat_id,
    )
    
    if not updated:
        raise IdentityVerificationException("Không tìm thấy request_id hoặc đã hết hạn.")
    
    return {
        "status": "ok",
        "request_id": request_id,
        "decision": status,
    }
