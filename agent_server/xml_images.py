#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from typing import List, Optional
import threading
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse

import requests
from pathlib import Path
from rate_limiter import RateLimitedWorker
try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional dependency for CLI usage
    def load_dotenv(*_args, **_kwargs):
        return None


def _load_env() -> None:
    candidates = [
        Path(__file__).resolve().parent.parent / ".env",
        Path(__file__).resolve().parent / ".env",
    ]
    for candidate in candidates:
        if candidate.is_file():
            load_dotenv(candidate)
            return
    _load_env()


IMG_EXT_RE = re.compile(r"\.(jpg|jpeg|png|webp|gif|bmp|tiff)(\?.*)?$", re.IGNORECASE)


def build_url(base_url: str, extra_params: dict) -> str:
    """Добавляет/перезаписывает GET-параметры к URL из .env."""
    p = urlparse(base_url)
    q = dict(parse_qsl(p.query, keep_blank_values=True))
    q.update({k: str(v) for k, v in extra_params.items() if v is not None})
    return urlunparse((p.scheme, p.netloc, p.path, p.params, urlencode(q, doseq=True), p.fragment))


def parse_xml(xml_bytes: bytes) -> ET.Element:
    return ET.fromstring(xml_bytes)


def get_error(root: ET.Element):
    """Ошибки приходят в <error code="...">...</error>, при этом HTTP=200 часто сохраняется."""
    err = root.find(".//error")
    if err is None:
        return None, None
    code_raw = err.get("code")
    code = int(code_raw) if code_raw and code_raw.lstrip("-").isdigit() else None
    msg = (err.text or "").strip()
    return code, msg


def fetch_with_retries(url: str, retries: int = 5, wait_s: float = 2.0):
    """
    Для Yandex Live бывают ситуации "нет свободных каналов" / "высокая загрузка" —
    они прямо рекомендуют перезапрос. :contentReference[oaicite:7]{index=7}
    """
    last_err = None
    for attempt in range(1, retries + 1):
        r = requests.get(url, timeout=40)
        if r.status_code != 200:
            # 500-502/503 тоже описаны у них как "перезапросить/превышение частоты" :contentReference[oaicite:8]{index=8}
            last_err = f"HTTP {r.status_code}"
            time.sleep(wait_s)
            continue

        root = parse_xml(r.content)
        code, msg = get_error(root)

        # 20-25, 110 — "перезапросить/подождать" :contentReference[oaicite:9]{index=9}
        if code in (20, 21, 22, 23, 24, 25, 110):
            last_err = f"code={code}: {msg}"
            if code in (20, 110):
                time.sleep(10.0)
            else:
                time.sleep(wait_s)
            continue

        return root, r.text  # XML готов (или ошибка не “ретраибельная”)

    raise RuntimeError(f"Не удалось получить ответ после ретраев. Последняя ошибка: {last_err}")


def textify(elem: ET.Element) -> str:
    """Достаёт текст из элемента, включая вложенные теги."""
    return ET.tostring(elem, encoding="unicode", method="text").strip()


def looks_like_image_url(s: str) -> bool:
    if not s:
        return False
    if not (s.startswith("http://") or s.startswith("https://")):
        return False
    # Чаще всего в выдаче есть ссылки без расширения (CDN/прокси), но расширение — хороший сигнал.
    return bool(IMG_EXT_RE.search(s)) or ("/images" in s.lower()) or ("img" in s.lower())


def extract_urls(root: ET.Element):
    """
    Универсальный сбор ссылок:
    - берём все текстовые ноды, которые похожи на URL
    - отдельно собираем "image-like" URL
    - отдельно собираем прочие URL (как page/source)
    Т.к. точная схема XML для картинок у XMLStock может меняться.
    """
    all_urls = []
    for el in root.iter():
        if el.text:
            t = el.text.strip()
            if t.startswith("http://") or t.startswith("https://"):
                all_urls.append(t)

    # уникализация с сохранением порядка
    seen = set()
    uniq = []
    for u in all_urls:
        if u not in seen:
            seen.add(u)
            uniq.append(u)

    img_urls = [u for u in uniq if looks_like_image_url(u)]
    page_urls = [u for u in uniq if u not in set(img_urls)]
    return img_urls, page_urls


_IMAGES_WORKERS: Optional[List[RateLimitedWorker]] = None
_IMAGES_WORKERS_LOCK = threading.Lock()
_IMAGES_WORKERS_IDX = 0


def _get_images_worker() -> RateLimitedWorker:
    global _IMAGES_WORKERS
    global _IMAGES_WORKERS_IDX
    if _IMAGES_WORKERS is None:
        _load_env()
        delay_base = float(os.getenv("XML_IMAGES_DELAY_BASE", "1.0"))
        delay_jitter = float(os.getenv("XML_IMAGES_DELAY_JITTER", "0.0"))
        count = max(1, int(os.getenv("XML_IMAGES_WORKERS", "1")))
        _IMAGES_WORKERS = [
            RateLimitedWorker(f"xml-images-{idx + 1}", delay_base, delay_jitter)
            for idx in range(count)
        ]
    with _IMAGES_WORKERS_LOCK:
        worker = _IMAGES_WORKERS[_IMAGES_WORKERS_IDX % len(_IMAGES_WORKERS)]
        _IMAGES_WORKERS_IDX += 1
        return worker


def _xml_images_impl(
    query: str,
    limit: int = 30,
    lr: Optional[int] = None,
    page: int = 0,
    device: Optional[str] = None,
    domain: Optional[str] = None,
    base_url: Optional[str] = None,
) -> List[str]:
    _load_env()
    base = base_url or os.getenv("XMLSTOCK_YANDEXLIVE_URL")
    if not base:
        raise RuntimeError("XMLSTOCK_YANDEXLIVE_URL is not set")

    params = {
        "tbm": "images",
        "query": query,
        "lr": lr,
        "page": page,
        "device": device,
        "domain": domain,
    }
    url = build_url(base, params)
    root, _raw_xml = fetch_with_retries(url)

    code, msg = get_error(root)
    if code is not None:
        raise RuntimeError(f"XMLStock error code={code}: {msg}")

    img_urls, _page_urls = extract_urls(root)
    if limit <= 0:
        return []
    return img_urls[:limit]


def xml_images(
    query: str,
    limit: int = 30,
    lr: Optional[int] = None,
    page: int = 0,
    device: Optional[str] = None,
    domain: Optional[str] = None,
    base_url: Optional[str] = None,
) -> List[str]:
    worker = _get_images_worker()
    return worker.submit(_xml_images_impl, query, limit, lr, page, device, domain, base_url)


def main():
    load_dotenv()

    base_url = os.getenv("XMLSTOCK_YANDEXLIVE_URL")
    if not base_url:
        print("Нет XMLSTOCK_YANDEXLIVE_URL в .env", file=sys.stderr)
        return 2

    ap = argparse.ArgumentParser(description="XMLStock Yandex Live: поиск по картинкам (tbm=images)")
    ap.add_argument("--query", help="Текстовый запрос (если не задан — спросим в консоли).")
    ap.add_argument("--lr", type=int, default=None, help="Регион (опционально).")
    ap.add_argument("--page", type=int, default=0, help="Страница (с нуля).")
    ap.add_argument("--device", choices=["desktop", "mobile"], default=None, help="Устройство (опционально).")
    ap.add_argument("--domain", default=None, help="Доменная зона (ru/by/kz/com.tr), опционально.")
    ap.add_argument("--reverse-image-url", default=None, help="URL картинки для reverse поиска (image:URL).")
    ap.add_argument("--limit", type=int, default=30, help="Сколько картинок вывести (до 30 обычно).")
    ap.add_argument("--dump", default=None, help="Файл, куда сохранить сырой XML (для отладки).")
    args = ap.parse_args()

    # Включаем режим картинок :contentReference[oaicite:10]{index=10}
    params = {
        "tbm": "images",
        "lr": args.lr,
        "page": args.page,
        "device": args.device,
        "domain": args.domain,
        # GET-параметры имеют приоритет над настройками по умолчанию :contentReference[oaicite:11]{index=11}
    }

    if args.reverse_image_url:
        # reverse image search: query=image:URL :contentReference[oaicite:12]{index=12}
        params["query"] = f"image:{args.reverse_image_url}"
    else:
        q = args.query or input("Введите текстовый запрос для Яндекс.Картинок: ").strip()
        if not q:
            print("Пустой запрос.", file=sys.stderr)
            return 2
        params["query"] = q

    url = build_url(base_url, params)
    print(f"\nURL запроса:\n{url}\n")

    try:
        root, raw_xml = fetch_with_retries(url)
    except Exception as e:
        print(f"Ошибка запроса: {e}", file=sys.stderr)
        return 3

    if args.dump:
        with open(args.dump, "w", encoding="utf-8") as f:
            f.write(raw_xml)
        print(f"Сырой XML сохранён в: {args.dump}\n")

    code, msg = get_error(root)
    if code is not None:
        # Таблица кодов ошибок у них отдельной страницей :contentReference[oaicite:13]{index=13}
        print(f"XMLStock вернул ошибку code={code}: {msg}", file=sys.stderr)
        return 4

    img_urls, page_urls = extract_urls(root)

    if not img_urls:
        print("Картинки не распознаны по эвристикам.")
        print("Совет: запусти с --dump out.xml и пришли сюда кусок структуры (без ключа), я подстрою парсер.")
        return 0

    print(f"Найдено ссылок, похожих на картинки: {len(img_urls)}")
    print(f"Других ссылок (возможные страницы-источники): {len(page_urls)}\n")

    lim = max(1, min(args.limit, len(img_urls)))
    for i in range(lim):
        print(f"{i+1}. {img_urls[i]}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
