from __future__ import annotations

import re

import httpx

# Публичный JSON Google Translate (часто доступен с серверов без API-ключа).
_GTX_URL = "https://translate.googleapis.com/translate_a/single"
_MYMEMORY_GET = "https://api.mymemory.translated.net/get"
_LIBRE_URLS = (
    "https://libretranslate.com/translate",
    "https://translate.argosopentech.com/translate",
)

_CHUNK_GTX = 3800
_CHUNK_MEMORY = 480

_UA = {"User-Agent": "Mozilla/5.0 (compatible; LK-Oper-Ruk/1.0; +https://localhost)"}


def mostly_russian(text: str, *, min_letters: int = 16, ratio: float = 0.28) -> bool:
    letters = [c for c in text if c.isalpha()]
    if len(letters) < min_letters:
        return False
    cy = 0
    for c in letters:
        o = ord(c)
        if 0x0400 <= o <= 0x04FF or c in "ёЁ":
            cy += 1
    return (cy / len(letters)) >= ratio


def _chunks_by_len(text: str, max_len: int) -> list[str]:
    if len(text) <= max_len:
        return [text]
    sentences = re.split(r"(?<=[.!?])\s+", text)
    out: list[str] = []
    buf = ""
    for sent in sentences:
        if not sent:
            continue
        if len(buf) + len(sent) + 1 <= max_len:
            buf = f"{buf} {sent}".strip()
        else:
            if buf:
                out.append(buf)
            if len(sent) > max_len:
                for i in range(0, len(sent), max_len):
                    out.append(sent[i : i + max_len])
                buf = ""
            else:
                buf = sent
    if buf:
        out.append(buf)
    return out if out else [text[:max_len]]


def _parse_gtx(data: object) -> str:
    """Разбор ответа translate_a/single (массив пар [перевод, оригинал, ...])."""
    if not isinstance(data, list) or not data:
        return ""
    row0 = data[0]
    if not isinstance(row0, list):
        return ""
    parts: list[str] = []
    for item in row0:
        if isinstance(item, list) and len(item) >= 2:
            tr, orig = item[0], item[1]
            if isinstance(tr, str) and isinstance(orig, str):
                parts.append(tr)
    return "".join(parts)


async def _translate_gtx(client: httpx.AsyncClient, chunk: str) -> str | None:
    # q передаём сырой строкой — httpx сам закодирует params (иначе двойное кодирование и «%20» в тексте).
    r = await client.get(
        _GTX_URL,
        params={"client": "gtx", "sl": "en", "tl": "ru", "dt": "t", "q": chunk},
        headers=_UA,
    )
    if r.status_code >= 400:
        return None
    try:
        data = r.json()
    except Exception:  # noqa: BLE001
        return None
    out = _parse_gtx(data).strip()
    return out or None


async def _translate_mymemory(client: httpx.AsyncClient, chunk: str) -> str | None:
    r = await client.get(
        _MYMEMORY_GET,
        params={"q": chunk, "langpair": "en|ru"},
        headers=_UA,
    )
    if r.status_code >= 400:
        return None
    try:
        data = r.json()
    except Exception:  # noqa: BLE001
        return None
    if not isinstance(data, dict):
        return None
    rd = data.get("responseData")
    if not isinstance(rd, dict):
        return None
    out = str(rd.get("translatedText") or "").strip()
    return out or None


async def _translate_libre(client: httpx.AsyncClient, chunk: str) -> str | None:
    for url in _LIBRE_URLS:
        try:
            r = await client.post(
                url,
                json={"q": chunk, "source": "en", "target": "ru", "format": "text"},
                headers={**_UA, "Content-Type": "application/json"},
            )
            if r.status_code >= 400:
                continue
            data = r.json()
            if not isinstance(data, dict):
                continue
            out = str(data.get("translatedText") or "").strip()
            if out:
                return out
        except (httpx.TimeoutException, httpx.RequestError):
            continue
        except Exception:  # noqa: BLE001
            continue
    return None


async def _translate_chunk(client: httpx.AsyncClient, chunk: str) -> str | None:
    for fn in (_translate_gtx, _translate_mymemory, _translate_libre):
        try:
            t = await fn(client, chunk)
            if t:
                return t
        except (httpx.TimeoutException, httpx.RequestError):
            continue
        except Exception:  # noqa: BLE001
            continue
    if len(chunk) > _CHUNK_MEMORY:
        parts: list[str] = []
        for sub in _chunks_by_len(chunk, _CHUNK_MEMORY):
            p = await _translate_mymemory(client, sub) or await _translate_gtx(client, sub)
            if not p:
                return None
            parts.append(p)
        return " ".join(parts).strip() or None
    return None


async def horoscope_text_to_russian(text: str) -> str:
    """EN→RU: Google gtx → MyMemory → LibreTranslate (всё через httpx, без блокировок)."""
    raw = (text or "").strip()
    if not raw:
        return raw
    if mostly_russian(raw):
        return raw

    chunks = _chunks_by_len(raw, _CHUNK_GTX)
    timeout = httpx.Timeout(18.0, connect=5.0)
    translated: list[str] = []

    async with httpx.AsyncClient(timeout=timeout) as client:
        for ch in chunks:
            piece = await _translate_chunk(client, ch)
            if piece:
                translated.append(piece)

    result = " ".join(translated).strip()
    if result:
        return result
    return (
        "Не удалось перевести гороскоп на русский (сервис перевода недоступен). "
        "Попробуйте обновить блок позже."
    )
