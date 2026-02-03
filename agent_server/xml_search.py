#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import os
import random
import sys
import time
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional
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
    load_dotenv()


def build_url(base_url: str, extra_params: dict) -> str:
    """
    Берём URL из .env (уже с user/key) и добавляем/перезаписываем параметры (query, groupby, maxpassages, lr...).
    """
    p = urlparse(base_url)
    q = dict(parse_qsl(p.query, keep_blank_values=True))
    q.update({k: str(v) for k, v in extra_params.items() if v is not None})
    new_query = urlencode(q, doseq=True)
    return urlunparse((p.scheme, p.netloc, p.path, p.params, new_query, p.fragment))


def parse_xml(xml_bytes: bytes) -> ET.Element:
    return ET.fromstring(xml_bytes)


def get_error(root: ET.Element):
    """
    XMLStock возвращает ошибки в <error code="...">...</error>.
    """
    err = root.find(".//error")
    if err is None:
        return None, None

    code_raw = err.get("code")
    code = None
    if code_raw and code_raw.lstrip("-").isdigit():
        code = int(code_raw)

    text = (err.text or "").strip()
    return code, text


def extract_doc_text(node: ET.Element) -> str:
    """
    Возвращает текст элемента, включая вложенные теги (например <hlword> внутри <passage>),
    но без самих тегов.
    """
    return ET.tostring(node, encoding="unicode", method="text").strip()


def extract_results(root: ET.Element, limit_docs: int = 10, limit_passages: int = 5):
    """
    Достаём первые документы из выдачи: title, url, passages.
    """
    results = []
    for doc in root.findall(".//doc"):
        url = (doc.findtext("url") or "").strip()
        title = (doc.findtext("title") or "").strip()

        passages = []
        for p in doc.findall(".//passages/passage"):
            txt = extract_doc_text(p)
            if txt:
                passages.append(txt)
            if len(passages) >= limit_passages:
                break

        if url:
            results.append((title, url, passages))

        if len(results) >= limit_docs:
            break

    return results


_SEARCH_WORKERS: Optional[List[RateLimitedWorker]] = None
_SEARCH_WORKERS_LOCK = threading.Lock()
_SEARCH_WORKERS_IDX = 0


def _get_search_worker() -> RateLimitedWorker:
    global _SEARCH_WORKERS
    global _SEARCH_WORKERS_IDX
    if _SEARCH_WORKERS is None:
        _load_env()
        delay_base = float(os.getenv("XML_SEARCH_DELAY_BASE", "0.1"))
        delay_jitter = float(os.getenv("XML_SEARCH_DELAY_JITTER", "0.9"))
        count = max(1, int(os.getenv("XML_SEARCH_WORKERS", "1")))
        _SEARCH_WORKERS = [
            RateLimitedWorker(f"xml-search-{idx + 1}", delay_base, delay_jitter)
            for idx in range(count)
        ]
    with _SEARCH_WORKERS_LOCK:
        worker = _SEARCH_WORKERS[_SEARCH_WORKERS_IDX % len(_SEARCH_WORKERS)]
        _SEARCH_WORKERS_IDX += 1
        return worker


def _xml_search_impl(
    query: str,
    docs: int = 10,
    maxpassages: int = 5,
    lr: Optional[int] = None,
    groupby: str = "10",
    base_url: Optional[str] = None,
) -> List[Dict[str, Any]]:
    _load_env()
    base = base_url or os.getenv("XMLSTOCK_GOOGLE_URL")
    if not base:
        raise RuntimeError("XMLSTOCK_GOOGLE_URL is not set")

    maxpassages = max(1, min(5, int(maxpassages)))
    params = {
        "query": query,
        "groupby": groupby,
        "maxpassages": maxpassages,
        "lr": lr,
    }

    url = build_url(base, params)
    root = fetch_with_retries(url)

    code, text = get_error(root)
    if code is not None:
        raise RuntimeError(f"XMLStock error code={code}: {text}")

    results = extract_results(root, limit_docs=int(docs), limit_passages=maxpassages)
    return [
        {"title": title, "url": url, "passages": passages}
        for title, url, passages in results
    ]


def xml_search(
    query: str,
    docs: int = 10,
    maxpassages: int = 5,
    lr: Optional[int] = None,
    groupby: str = "10",
    base_url: Optional[str] = None,
) -> List[Dict[str, Any]]:
    worker = _get_search_worker()
    return worker.submit(_xml_search_impl, query, docs, maxpassages, lr, groupby, base_url)


def fetch_with_retries(url: str, retries: int = 8, min_wait: float = 5.0, max_wait: float = 10.0):
    """
    Для гибридного режима XMLStock возможны коды:
      - 210: поставлен в очередь (повторить позже)
      - 202: ещё не обработан (повторить позже)
    Рекомендуемые интервалы 5–10 секунд. :contentReference[oaicite:4]{index=4}
    """
    for attempt in range(1, retries + 1):
        r = requests.get(url, timeout=30)
        r.raise_for_status()

        root = parse_xml(r.content)
        code, text = get_error(root)

        if code in (210, 202, 110):
            wait_s = random.uniform(min_wait, max_wait)
            print(f"[{attempt}/{retries}] code={code}: {text or 'не готово'} -> жду {wait_s:.0f}с и повторяю…")
            time.sleep(wait_s)
            continue

        return root  # либо нормальный ответ, либо другая ошибка

    raise RuntimeError("Не дождались результата: слишком долго 210/202 (очередь/не готово).")


def main():
    _load_env()

    base_url = os.getenv("XMLSTOCK_GOOGLE_URL")
    if not base_url:
        print("Не найден XMLSTOCK_URL в .env/окружении.", file=sys.stderr)
        return 2

    ap = argparse.ArgumentParser(description="Проверка XMLStock Yandex.XML Proxy + вывод passages")
    ap.add_argument("--query", help="Поисковый запрос. Если не задан — будет запрос из консоли.")
    ap.add_argument("--lr", type=int, default=None, help="Регион (например 213 для Москвы), опционально.")
    ap.add_argument("--docs", type=int, default=10, help="Сколько документов вывести (по умолчанию 10).")
    ap.add_argument("--maxpassages", type=int, default=5, help="Сколько passages просить (1..5).")
    ap.add_argument("--groupby", default="10", help="Простой groupby (например '10'), опционально.")
    args = ap.parse_args()

    query = args.query
    if not query:
        query = input("Введите поисковый запрос: ").strip()
    if not query:
        print("Пустой запрос — нечего искать.", file=sys.stderr)
        return 2

    # maxpassages: 1..5 (это именно “фрагменты/пассажи” для сниппета). :contentReference[oaicite:5]{index=5}
    maxpassages = max(1, min(5, int(args.maxpassages)))

    params = {
        "query": query,
        "groupby": args.groupby,
        "maxpassages": maxpassages,
        "lr": args.lr,
    }

    url = build_url(base_url, params)
    print(f"Запрос: {query}")
    print(f"URL: {url}\n")

    try:
        root = fetch_with_retries(url)
    except Exception as e:
        print(f"Ошибка запроса: {e}", file=sys.stderr)
        return 3

    code, text = get_error(root)
    if code is not None:
        # Полный список кодов ошибок у XMLStock на странице “Коды ошибок”. :contentReference[oaicite:6]{index=6}
        print(f"XMLStock вернул ошибку code={code}: {text}", file=sys.stderr)
        return 4

    results = extract_results(root, limit_docs=args.docs, limit_passages=maxpassages)

    print("ОК: ответ получен.\n")
    if not results:
        print("Документов не распарсилось (возможно пустая выдача или другой формат).")
        return 0

    for i, (title, url, passages) in enumerate(results, 1):
        print(f"{i}. {title or '(без заголовка)'}")
        print(f"   {url}")
        if passages:
            print("   Фрагменты:")
            for p in passages:
                print(f"    - {p}")
        print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
