#
# Web container:
# - builds React app
# - serves static files + proxies /api to backend via Caddy (auto HTTPS)
#

FROM node:18-alpine AS build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM caddy:2-alpine
WORKDIR /srv
COPY --from=build /frontend/build /srv
COPY frontend/Caddyfile /etc/caddy/Caddyfile


