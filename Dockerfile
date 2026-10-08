# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.25-bookworm AS backend
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/ cmd/
COPY internal/ internal/
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /samal ./cmd/server

FROM python:3.12-slim-bookworm AS python-deps
RUN python -m venv /opt/venv
COPY ml/requirements.lock.txt /tmp/requirements.lock.txt
RUN /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.lock.txt

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 samal && useradd --uid 10001 --gid samal --create-home samal
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONUTF8=1 PYTHONDONTWRITEBYTECODE=1
COPY --from=python-deps /opt/venv /opt/venv
COPY --from=backend /samal /usr/local/bin/samal
COPY --from=frontend /build/dist ./frontend/dist
COPY ml/ ./ml/
COPY scripts/ ./scripts/
COPY LICENSE THIRD_PARTY_NOTICES.md /usr/share/doc/samal/
COPY licenses/ /usr/share/doc/samal/licenses/
RUN mkdir -p /app/runtime && chown samal:samal /app/runtime
USER samal
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD ["/opt/venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=4).read()"]
CMD ["samal", "-root", "/app", "-addr", "0.0.0.0:8080", "-python", "/opt/venv/bin/python"]
