#
# Web container:
# - builds React app
# - serves static files + proxies /api to backend via Caddy (auto HTTPS)
#

FROM node:18-alpine AS build
# Ensure UTF-8 for source and build output (avoids mojibake in built JS)
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
# package-lock.json in this repo may be out of sync; npm ci is strict and fails.
# For deployment we prefer a tolerant install.
RUN npm install --legacy-peer-deps --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM caddy:2-alpine
WORKDIR /srv
COPY --from=build /frontend/build /srv
COPY frontend/Caddyfile /etc/caddy/Caddyfile


