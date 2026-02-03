# Stroki

Сервис для автоматического заполнения таблиц (CSV/XLSX) по данным из интернета с использованием LLM и поиска.

## Возможности

- Загрузка CSV/XLSX, автоопределение входных столбцов и целевых задач (до 3 входов и до 3 задач).
- Поиск информации в интернете через XMLStock (Google) и извлечение ответов LLM.
- Поиск картинок через XMLStock (Yandex Live) с фильтрацией водяных знаков.
- Прогресс обработки по сессии.
- Логи поисковых запросов и статистика запусков.

## Архитектура

Сервисы (см. `docker-compose.yaml`):

- `frontend` — React UI, загружает файл и показывает прогресс.
- `agent_server` — FastAPI + обработчик строк, LLM, интеграции поиска.
- `postgres` — хранение сессий, загрузок, опросов.
- `nginx` — reverse proxy и SSL.
- `pgadmin` — админка базы (опционально).

Ключевые компоненты внутри `agent_server`:

- `main.py` — API, пайплайн обработки строк, прогресс, работа с БД.
- `xml_search.py` — Google XMLStock: поиск, ретраи, rate limit.
- `xml_images.py` — Yandex Live XMLStock: поиск картинок, ретраи, rate limit.
- `watermark.py` — фильтрация картинок с водяными знаками.
- `rate_limiter.py` — общие воркеры и очередь на запросы к XMLStock.

### Поток данных

1) Пользователь отправляет файл + запрос (UI/HTTP).
2) `agent_server` сохраняет загрузку и инициирует сессию.
3) LLM выбирает `inputs` и `tasks` (до 3).
4) Для каждой строки запускается поиск (Google XMLStock), выбираются релевантные страницы.
5) LLM формирует ответы для `tasks`.
6) При необходимости запускается поиск картинок (Yandex Live XMLStock).
7) Результат сохраняется в CSV/XLSX и отдается пользователю.

### Ограничение запросов и воркеры

Для соблюдения лимитов поставщика используются общие воркеры:

- Google XMLStock: пул `XML_SEARCH_WORKERS`, задержка между запросами `XML_SEARCH_DELAY_BASE` + `XML_SEARCH_DELAY_JITTER`.
- Yandex Live XMLStock: пул `XML_IMAGES_WORKERS`, задержка между запросами `XML_IMAGES_DELAY_BASE` + `XML_IMAGES_DELAY_JITTER`.

Распределение запросов между воркерами — round-robin.

## Установка и запуск

Требования:

- Docker и Docker Compose.

Шаги:

1) Скопируйте `.env` и заполните ключи API:
   - `PROXY_API_KEY`
   - `PROXY_BASE_URL`
   - `XMLSTOCK_GOOGLE_URL`
   - `XMLSTOCK_YANDEXLIVE_URL`
2) Запуск:

```bash
docker compose up -d --build
```

3) Логи:

```bash
docker compose logs -f agent_server
```

## Конфигурация (`.env`)

Основные параметры:

- `PROXY_MODEL`, `PROXY_API_KEY`, `PROXY_BASE_URL` — доступ к LLM.
- `XMLSTOCK_GOOGLE_URL`, `XMLSTOCK_YANDEXLIVE_URL` — XMLStock endpoints.
- `MAX_CONCURRENCY` — параллелизм по строкам.
- `XML_SEARCH_WORKERS` — число воркеров Google (поиск).
- `XML_IMAGES_WORKERS` — число воркеров Yandex (картинки).
- `XML_SEARCH_DELAY_BASE`, `XML_SEARCH_DELAY_JITTER` — задержка между поисковыми запросами.
- `XML_IMAGES_DELAY_BASE`, `XML_IMAGES_DELAY_JITTER` — задержка между запросами картинок.
- `LLM_RETRIES`, `LLM_RETRY_WAIT` — ретраи LLM и пауза.
- `SAVE_LOGS` — запись логов поисковых запросов.
- `RECURSION_LIMIT` — лимит глубины графа.

Пример:

```env
MAX_CONCURRENCY=6
XML_SEARCH_WORKERS=12
XML_IMAGES_WORKERS=3
XML_SEARCH_DELAY_BASE=0.1
XML_SEARCH_DELAY_JITTER=0.9
XML_IMAGES_DELAY_BASE=1.0
XML_IMAGES_DELAY_JITTER=0.0
LLM_RETRIES=3
LLM_RETRY_WAIT=2.0
```

## API

Основные эндпоинты:

- `POST /api/process` — обработка файла (multipart: `file`, `query`, `session_id`).
- `POST /api/session/start` — создание сессии.
- `POST /api/session/end` — завершение сессии.
- `GET /api/progress?session_id=...` — прогресс.
- `POST /api/survey` — сохранение опроса.

## Форматы входа/выхода

- Вход: CSV, XLSX.
- Выход: CSV/XLSX с добавленными столбцами задач и/или картинок `image_1..image_5`.

## Логи и диагностика

- Поисковые логи: `logs/xml_search/*.json`
- Статистика запуска: `logs/count_*.txt`
- Общие логи: `docker compose logs -f agent_server`

Если видите ошибки 110/20 от XMLStock — увеличьте задержки или уменьшите воркеры.

## Разработка

Локально:

```bash
docker compose up -d --build
```

Код:

- `agent_server/` — backend
- `frontend/` — UI
- `nginx/` — reverse proxy

## Ограничения

- Производительность зависит от лимитов XMLStock и LLM.
- Частые 110/202/20 ошибки означают перегрузку поставщика.
