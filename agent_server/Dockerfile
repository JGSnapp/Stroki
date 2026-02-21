FROM python:3.11-slim AS base

RUN groupadd -r app && useradd --no-log-init -r -g app app

WORKDIR /app

ARG INSTALL_WATERMARK=0

COPY requirements*.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt \
    && if [ "$INSTALL_WATERMARK" = "1" ]; then pip install --no-cache-dir -r requirements-watermark.txt; fi

COPY . ./

RUN mkdir -p /app/uploads && chown -R app:app /app/uploads

USER app

ENV PYTHONUNBUFFERED=1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
