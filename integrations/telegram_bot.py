"""Telegram bot — outbound consent messages + inbound reply routing.

Consent messages are sent as plain text (no inline keyboard). The
presenter types ANY natural-language reply on the demo phone — Hindi,
English, Hinglish, emoji — and an LLM classifier resolves the intent
into yes/no, defaulting to "no" on ambiguity. The classification result
fulfils the asyncio.Future the consent agent is awaiting, so reschedule
flows continue immediately.

Pending state per request: each `await_reply(request_id)` registers a
future + the consent context (so the LLM has prompt grounding). When a
text reply arrives we consult the *most recent* pending request, route
the LLM verdict to its future, then send a short Hinglish acknowledgment
back to the customer chat.

If the LLM call fails the handler degrades to a deterministic
yes-token list (no other tokens default to "no"), so the demo never
stalls on a flaky API.

python-telegram-bot's Application is constructed in __init__ so handlers
can be registered BEFORE start() spins up long-polling — otherwise early
messages would miss our handlers entirely.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import secrets
import string
from dataclasses import dataclass
from typing import Any, Callable, Literal

logger = logging.getLogger(__name__)


Outcome = Literal["yes", "no"]
ReplyType = Literal["yes", "no", "unknown"]

SHORT_CODE_ALPHABET = string.ascii_uppercase + string.digits
SHORT_CODE_LENGTH = 4

YES_TOKENS: frozenset[str] = frozenset(
    {"yes", "y", "ok", "okay", "confirm", "accept", "sure", "agreed"}
)
NO_TOKENS: frozenset[str] = frozenset(
    {"no", "n", "reject", "cancel", "keep", "decline"}
)

CALLBACK_PREFIX = "consent_"    # e.g. "consent_yes_<request_id>"

_RE_NONALNUM = re.compile(r"[^\w\s]+")


def generate_short_code() -> str:
    return "".join(
        secrets.choice(SHORT_CODE_ALPHABET) for _ in range(SHORT_CODE_LENGTH)
    )


def classify_reply(text: str) -> ReplyType:
    """Deterministic yes/no/unknown classifier. Strips emoji + punctuation,
    case-insensitive. Used as the fallback when the LLM classifier fails."""
    cleaned = _RE_NONALNUM.sub(" ", text.lower())
    tokens = set(cleaned.split())
    if tokens & YES_TOKENS:
        return "yes"
    if tokens & NO_TOKENS:
        return "no"
    return "unknown"


# Best-effort yes set used in the deterministic fallback when the LLM call
# fails. Includes a few Hindi/Hinglish positives so a flaky-API demo
# moment still gets a sensible classification.
_FALLBACK_YES_TOKENS: frozenset[str] = frozenset(
    {
        "yes", "y", "ok", "okay", "sure", "fine", "agree", "agreed",
        "confirm", "confirmed", "haan", "haanji", "han",
        "chalega", "theek", "tk", "go",
    }
)


async def _interpret_reply(raw_text: str, context: str) -> dict:
    """Ask Claude to classify a customer's free-text reply as yes/no
    intent. Returns {"intent": "yes"|"no", "confidence": ..., "reasoning":
    "..."}. Falls back to a token list on any error so the consent flow
    never stalls."""
    prompt = (
        "A customer replied to a field service reschedule request sent "
        "via Telegram in India.\n\n"
        f"Context: {context}\n"
        f'Customer reply: "{raw_text}"\n\n'
        "Classify as yes or no. No middle ground.\n\n"
        'YES: "ok", "fine", "sure", "yes", "haan", "theek hai", '
        '"chalega", "agreed", "go ahead", "confirm", "👍", '
        '"ho jayega", "bilkul", any positive or agreeable response.\n\n'
        'NO (default for anything unclear): "no", "nahi", "nope", '
        '"cancel", "not ok", "👎", "mat karo", any negative, ambiguous, '
        "or unclear response.\n\n"
        "When in doubt → no.\n\n"
        "Respond as JSON only:\n"
        "{\n"
        '  "intent": "yes" | "no",\n'
        '  "confidence": "high" | "medium" | "low",\n'
        '  "reasoning": "one sentence in English"\n'
        "}"
    )
    try:
        from core.llm import llm_json
        result = await llm_json(prompt, max_tokens=120, temperature=0.2)
        intent = result.get("intent")
        if intent not in ("yes", "no"):
            raise ValueError(f"unexpected intent: {intent!r}")
        return {
            "intent": intent,
            "confidence": result.get("confidence", "low"),
            "reasoning": (result.get("reasoning") or "").strip(),
        }
    except Exception as exc:
        logger.error(
            "LLM interpretation failed: %s — falling back to token match",
            exc,
        )
        cleaned = _RE_NONALNUM.sub(" ", raw_text.lower())
        tokens = set(cleaned.split())
        intent = "yes" if tokens & _FALLBACK_YES_TOKENS else "no"
        return {
            "intent": intent,
            "confidence": "low",
            "reasoning": "fallback token match",
        }


@dataclass
class _Pending:
    key: str                     # request_id
    future: asyncio.Future
    message_id: int | None = None  # for edit-on-reply
    context: str = ""            # human-readable context for the LLM


Sender = Callable[[str, str], Any]   # async (chat_id, text) -> None


class TelegramBot:
    """Outbound send + inbound reply routing. Application is built eagerly
    so handlers can be added pre-start; polling engages only in start()."""

    def __init__(self, token: str, customer_chat_id: str) -> None:
        self._token = token
        self._chat_id = customer_chat_id
        self._pending: dict[str, _Pending] = {}
        self._started: bool = False
        self._sender: Sender | None = None
        self._app: Any = None

        # Eagerly build the Application so tests + extensions can register
        # additional handlers before start(). Register our own handlers
        # right away — python-telegram-bot dispatches to every registered
        # handler once polling begins.
        if not self._token:
            # No token — leave _app as None. start() will raise loudly.
            return
        try:
            from telegram.ext import (
                Application,
                CallbackQueryHandler,
                MessageHandler,
                filters,
            )
        except ImportError:
            # Package missing; leave _app None so start() raises.
            return
        self._app = Application.builder().token(self._token).build()
        self._app.add_handler(
            MessageHandler(filters.TEXT & ~filters.COMMAND, self._on_update)
        )
        self._app.add_handler(CallbackQueryHandler(self._on_callback))

    @property
    def customer_chat_id(self) -> str:
        return self._chat_id

    @property
    def token(self) -> str:
        return self._token

    @property
    def application(self) -> Any:
        """Expose the python-telegram-bot Application so callers can register
        additional handlers pre-start (e.g. in tests or debug harnesses)."""
        return self._app

    async def start(self) -> None:
        """Initialize the Application and begin long-polling. Idempotent."""
        if self._started:
            return
        if not self._token:
            raise RuntimeError(
                "TELEGRAM_BOT_TOKEN is not set; cannot start the Telegram bot."
            )
        if not self._chat_id:
            raise RuntimeError(
                "TELEGRAM_CUSTOMER_CHAT_ID is not set; cannot start the Telegram bot."
            )
        if self._app is None:
            raise RuntimeError(
                "python-telegram-bot not installed. "
                "Add it to requirements.txt or pip install it."
            )
        masked = (self._token[:10] + "…") if len(self._token) > 10 else "(empty)"
        logger.info(
            "TelegramBot starting: token=%s chat_id=%s",
            masked, self._chat_id,
        )
        await self._app.initialize()
        await self._app.start()
        await self._app.updater.start_polling()
        self._sender = self._make_sender(self._app)
        self._started = True
        logger.info(
            "TelegramBot started (long-polling live for chat_id=%s)",
            self._chat_id,
        )

    @staticmethod
    def _make_sender(app: Any) -> Sender:
        async def _send(chat_id: str, text: str) -> None:
            await app.bot.send_message(chat_id=chat_id, text=text)
        return _send

    async def stop(self) -> None:
        """Stop long-polling. Cancels pending await_reply futures."""
        if not self._started:
            return
        try:
            await self._app.updater.stop()
            await self._app.stop()
            await self._app.shutdown()
        except Exception:
            logger.exception("error shutting down Telegram Application")
        self._sender = None
        for p in self._pending.values():
            if not p.future.done():
                p.future.cancel()
        self._pending.clear()
        self._started = False

    # ---- public API -------------------------------------------------------

    async def send_message(
        self,
        text: str,
        *,
        chat_id: str | None = None,
    ) -> None:
        """Plain Telegram message — no inline keyboard. Used for follow-up
        confirmations after a consent flow resolves."""
        if self._app is None:
            raise RuntimeError("TelegramBot not initialized")
        target = chat_id or self._chat_id
        await self._app.bot.send_message(chat_id=target, text=text)

    async def send_consent_message(
        self,
        text: str,
        *,
        request_id: str,
        chat_id: str | None = None,
    ) -> str:
        """Send `text` as a plain Telegram message (no inline keyboard).
        The presenter replies in any natural language on the demo phone;
        the text handler runs the reply through the LLM intent classifier
        and resolves the consent future.
        Returns the request_id (same as the caller provided). The caller
        then awaits reply via await_reply(request_id, context=...)."""
        if self._app is None:
            raise RuntimeError("TelegramBot not initialized (no application)")
        target = chat_id or self._chat_id
        msg = await self._app.bot.send_message(chat_id=target, text=text)
        # Pending entry may not exist yet — caller registers it via
        # await_reply right after send returns. If it already exists,
        # remember the outbound message_id for any future edits.
        pending = self._pending.get(request_id)
        if pending is not None:
            pending.message_id = msg.message_id
        return request_id

    async def await_reply(
        self,
        request_id: str,
        *,
        timeout_secs: float,
        context: str | None = None,
    ) -> tuple[Outcome, str]:
        """Wait for a YES/NO reply tagged with `request_id`. Returns
        (outcome, raw_payload). raw_payload is the callback_data for button
        presses or the raw text for free-text replies. Raises
        asyncio.TimeoutError if no resolution by `timeout_secs`.

        `context` is a short human-readable description of what the
        customer is being asked — handed to the LLM classifier so it can
        ground its yes/no judgment."""
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[tuple[Outcome, str]] = loop.create_future()
        self._pending[request_id] = _Pending(
            key=request_id, future=fut, context=context or "",
        )
        try:
            return await asyncio.wait_for(fut, timeout=timeout_secs)
        finally:
            self._pending.pop(request_id, None)

    # ---- inbound handlers ------------------------------------------------

    async def _on_update(self, update: Any, context: Any) -> None:
        """Customer-text handler. Routes the reply through the LLM intent
        classifier, resolves the most-recent pending consent future, and
        sends a short acknowledgement so the customer sees the reply
        landed."""
        try:
            text = (update.message.text or "").strip()
            chat_id = update.message.chat_id
        except AttributeError:
            return
        if not text:
            return

        # Only accept replies from the configured customer chat — keeps
        # operational chats (groups, the bot itself) out of the loop.
        if self._chat_id and str(chat_id) != str(self._chat_id):
            logger.info(
                "Telegram reply from unknown chat_id=%s ignored: %r",
                chat_id, text,
            )
            return

        if not self._pending:
            logger.warning(
                "Telegram reply received but no pending consent: %r", text,
            )
            return

        # Use the most recent pending request — the consent agent only
        # runs one consent flow at a time per scenario, but ordering by
        # insertion gives us a stable resolution if multiple ever queue.
        request_id = next(reversed(self._pending))
        pending = self._pending[request_id]
        consent_ctx = pending.context or "reschedule request"

        result = await _interpret_reply(text, consent_ctx)
        intent = result["intent"]
        logger.info(
            "Telegram reply %r → intent=%s confidence=%s reasoning=%s",
            text, intent, result["confidence"], result["reasoning"],
        )

        if not pending.future.done():
            pending.future.set_result((intent, text))

        ack = (
            "Got it — confirming the reschedule ✓"
            if intent == "yes"
            else "Understood — keeping your original appointment"
        )
        try:
            await self._app.bot.send_message(chat_id=chat_id, text=ack)
        except Exception:
            logger.exception("failed to send Telegram acknowledgement")

    async def _on_callback(self, update: Any, context: Any) -> None:
        """Inline button handler — the primary reply path."""
        query = update.callback_query
        if query is None:
            return
        data = query.data or ""
        await query.answer()  # clear the spinner on the client
        if not data.startswith(CALLBACK_PREFIX):
            return
        parts = data[len(CALLBACK_PREFIX):].split("_", 1)
        if len(parts) != 2:
            return
        outcome_word, request_id = parts
        if outcome_word not in ("yes", "no"):
            return
        outcome: Outcome = outcome_word  # type: ignore[assignment]
        logger.info(
            "TelegramBot button pressed: outcome=%s request_id=%s",
            outcome, request_id,
        )
        # Edit the original message so the presenter sees what they tapped.
        try:
            edit_text = (
                "✅ Reschedule confirmed"
                if outcome == "yes"
                else "❌ Reschedule declined"
            )
            await query.edit_message_text(edit_text)
        except Exception:
            logger.debug(
                "could not edit original message (button press still works)",
                exc_info=True,
            )
        pending = self._pending.get(request_id)
        if pending is not None and not pending.future.done():
            pending.future.set_result((outcome, data))


# ---- module-level singleton -----------------------------------------------

_bot: TelegramBot | None = None


def get_bot() -> TelegramBot:
    global _bot
    if _bot is None:
        token = os.getenv("TELEGRAM_BOT_TOKEN", "")
        chat_id = os.getenv("TELEGRAM_CUSTOMER_CHAT_ID", "")
        _bot = TelegramBot(token=token, customer_chat_id=chat_id)
    return _bot
