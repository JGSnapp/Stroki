#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
from functools import lru_cache
from io import BytesIO
from typing import Any

import requests

# Модель YOLOv8n для детекции ватермарок (текст/логотипы). Файл весов: best.pt :contentReference[oaicite:5]{index=5}
HF_REPO = "qfisch/yolov8n-watermark-detection"
HF_FILENAME = "best.pt"

TIMEOUT = 20
MAX_BYTES = 15 * 1024 * 1024  # 15 MB
DEFAULT_CONF = 0.25


def download_image(url: str) -> Any:
    headers = {"User-Agent": "Mozilla/5.0 (watermark-checker)"}
    with requests.get(url, stream=True, timeout=TIMEOUT, headers=headers) as r:
        r.raise_for_status()

        buf = BytesIO()
        total = 0
        for chunk in r.iter_content(chunk_size=64 * 1024):
            if not chunk:
                continue
            total += len(chunk)
            if total > MAX_BYTES:
                raise ValueError(f"Файл слишком большой (> {MAX_BYTES/1024/1024:.0f} MB).")
            buf.write(chunk)

    buf.seek(0)
    from PIL import Image

    return Image.open(buf).convert("RGB")


@lru_cache(maxsize=1)
def _load_model():
    try:
        from huggingface_hub import hf_hub_download
        from ultralytics import YOLO
    except Exception as exc:
        raise RuntimeError(
            "Watermark detection dependencies are missing. "
            "Install optional requirements or disable watermark checks."
        ) from exc

    weights_path = hf_hub_download(repo_id=HF_REPO, filename=HF_FILENAME)
    return YOLO(weights_path)


def has_watermark(image: Any, conf: float = DEFAULT_CONF) -> bool:
    model = _load_model()
    res = model.predict(image, conf=conf, verbose=False)[0]
    n = 0 if res.boxes is None else len(res.boxes)
    return n > 0


def has_watermark_url(url: str, conf: float = DEFAULT_CONF) -> bool:
    image = download_image(url)
    return has_watermark(image, conf=conf)


def main():
    print("Скачиваю веса модели с Hugging Face (первый раз)…")
    weights_path = hf_hub_download(repo_id=HF_REPO, filename=HF_FILENAME)
    model = YOLO(weights_path)

    print("\nВставь URL изображения (Enter — выход).")
    while True:
        url = input("URL> ").strip()
        if not url:
            print("Выход.")
            return 0

        try:
            img = download_image(url)

            # YOLO принимает PIL Image напрямую
            res = model.predict(img, conf=DEFAULT_CONF, verbose=False)[0]
            n = 0 if res.boxes is None else len(res.boxes)

            if n > 0:
                print(f"ЕСТЬ (найдено областей: {n})")
            else:
                print("НЕТ")

            print()

        except requests.RequestException as e:
            print(f"Ошибка сети/скачивания: {e}\n", file=sys.stderr)
        except Exception as e:
            print(f"Ошибка: {e}\n", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
