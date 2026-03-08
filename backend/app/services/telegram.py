"""
backend/app/services/telegram.py
=================================
Sends plate-match Telegram alerts via the Bot API sendPhoto endpoint.

Usage
-----
    from app.services.telegram import telegram_service
    await telegram_service.send_alert(...)

The service is disabled (no-op) when TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID
are not set in the environment — this allows the system to run without
Telegram configured during development.

Environment variables
---------------------
  TELEGRAM_BOT_TOKEN   — Bot token from @BotFather
  TELEGRAM_CHAT_ID     — Target chat / group / channel ID (can be negative for groups)
  TELEGRAM_TIMEOUT_SEC — HTTP timeout for Telegram API calls (default: 10)
"""
from __future__ import annotations

import logging
from pathlib import Path

log = logging.getLogger(__name__)

_ALERT_LEVEL_EMOJI = {
    "LOW":      "ℹ️",
    "MEDIUM":   "⚠️",
    "HIGH":     "🚨",
    "CRITICAL": "🔴",
}

_LIST_TYPE_LABEL = {
    "BLACKLIST": "🚫 BLACKLIST",
    "WHITELIST": "✅ WHITELIST",
    "VIP":       "⭐ VIP",
}


class TelegramService:
    """Async Telegram Bot API wrapper — send plate crop + alert caption."""

    def __init__(self, bot_token: str = "", chat_id: str = "", timeout: float = 10.0):
        self._token   = bot_token.strip()
        self._chat_id = chat_id.strip()
        self._timeout = timeout
        self.enabled  = bool(self._token and self._chat_id)
        if not self.enabled:
            log.info(
                "[TelegramService] Bot token or chat ID not configured — "
                "Telegram alerts disabled.  Set TELEGRAM_BOT_TOKEN and "
                "TELEGRAM_CHAT_ID to enable."
            )

    @property
    def _api_base(self) -> str:
        return f"https://api.telegram.org/bot{self._token}"

    async def send_alert(
        self,
        *,
        crop_path: str,
        plate_text: str,
        province: str,
        camera_name: str,
        alert_level: str,
        list_type: str,
        reason: str = "",
        read_id: int = 0,
    ) -> bool:
        """
        Send a plate-match alert photo to Telegram.

        Returns True on success, False on any error (never raises).
        """
        if not self.enabled:
            return False

        try:
            import httpx  # lazy import so the rest of the app works without httpx
        except ImportError:
            log.error("[TelegramService] httpx not installed — cannot send alert")
            return False

        emoji       = _ALERT_LEVEL_EMOJI.get(alert_level.upper(), "⚠️")
        list_label  = _LIST_TYPE_LABEL.get(list_type.upper(), list_type)
        province_str = f"\nจังหวัด: {province}" if province else ""
        reason_str   = f"\nหมายเหตุ: {reason}" if reason else ""
        read_str     = f"\nRead ID: #{read_id}" if read_id else ""

        caption = (
            f"{emoji} {list_label} MATCH\n"
            f"ทะเบียน: {plate_text}{province_str}\n"
            f"กล้อง: {camera_name}"
            f"{reason_str}{read_str}"
        )

        crop_file = Path(crop_path)
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                if crop_file.exists():
                    with open(crop_file, "rb") as f:
                        resp = await client.post(
                            f"{self._api_base}/sendPhoto",
                            data={"chat_id": self._chat_id, "caption": caption},
                            files={"photo": (crop_file.name, f, "image/jpeg")},
                        )
                else:
                    # Fall back to text-only message if crop is missing
                    resp = await client.post(
                        f"{self._api_base}/sendMessage",
                        json={"chat_id": self._chat_id, "text": caption},
                    )

            if resp.status_code == 200:
                log.info(
                    "[TelegramService] Alert sent: plate=%s level=%s",
                    plate_text, alert_level,
                )
                return True
            else:
                log.warning(
                    "[TelegramService] Telegram API returned %d: %s",
                    resp.status_code, resp.text[:200],
                )
                return False

        except Exception as exc:
            log.error("[TelegramService] Failed to send alert: %s", exc)
            return False


# ── Module-level singleton ────────────────────────────────────────────────────
# Instantiated from environment variables at import time.
# In tests, patch telegram_service.enabled = False to suppress network calls.

def _build_service() -> TelegramService:
    import os
    return TelegramService(
        bot_token=os.getenv("TELEGRAM_BOT_TOKEN", ""),
        chat_id=os.getenv("TELEGRAM_CHAT_ID", ""),
        timeout=float(os.getenv("TELEGRAM_TIMEOUT_SEC", "10")),
    )


telegram_service: TelegramService = _build_service()
