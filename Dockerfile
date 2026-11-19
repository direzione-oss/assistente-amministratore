# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend Python + Static Frontend
FROM python:3.12-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATABASE_PATH=/app/data/studio_condominiale.db

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/app /app/backend/app
COPY SERRA_Mobile /app/SERRA_Mobile
COPY --from=frontend-builder /build/frontend/dist /app/frontend/dist

RUN mkdir -p /app/data /app/data/archivio_ia /app/data/archivio_ia/Sopralluoghi /app/data/archivio_ia/Interventi /app/data/archivio_ia/Solleciti

WORKDIR /app/backend
EXPOSE 8018

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8018"]
