# --- ETAPA 1: Construir la aplicación de React (Pong) ---
FROM node:18-alpine AS builder
WORKDIR /app/pong-client
COPY pong-client/package*.json ./
RUN npm install
COPY pong-client/ ./
RUN npm run build

# --- Build the portal documentation from the repository's canonical Markdown files ---
FROM python:3.12-alpine AS readme-builder
WORKDIR /docs
RUN pip install --no-cache-dir Markdown==3.11.2
COPY README*.md ./
COPY docker/render_readme.py ./render_readme.py
RUN if [ -f README.en.md ]; then \
        python render_readme.py README.en.md /output/en.html; \
    else \
        python render_readme.py README.md /output/en.html; \
    fi \
    && if [ -f README.es.md ]; then \
        python render_readme.py README.es.md /output/es.html; \
    else \
        python render_readme.py README.md /output/es.html; \
    fi

# --- ETAPA 2: Servir con Nginx ---
FROM nginx:alpine

# Copiar tus archivos estáticos originales del frontend
COPY frontend/ /usr/share/nginx/html/
COPY public/ /usr/share/nginx/html/public/
COPY --from=readme-builder /output/ /usr/share/nginx/html/readme-content/

# Copiar tu archivo de configuración de Nginx original
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copiar el resultado compilado de React (Pong) a la subcarpeta /pong
COPY --from=builder /app/pong-client/dist /usr/share/nginx/html/pong

EXPOSE 80
