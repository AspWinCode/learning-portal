#
# Web container:
# - builds React app
# - serves static files + proxies /api to backend via Caddy (auto HTTPS)
#

FROM node:20-alpine AS build
# Ensure UTF-8 for source and build output (avoids mojibake in built JS)
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
# В проде запросы идут на тот же домен; Caddy проксирует /api/* на backend. Не использовать localhost.
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
ARG REACT_APP_API_URL=
ENV REACT_APP_API_URL=$REACT_APP_API_URL
# Ensure UTF-8: normalize line endings for TSX (CRLF can break encoding on some systems)
RUN for f in src/pages/SalesReinviteEventPage.tsx src/pages/FinancialModelPage.tsx src/pages/ReportsPage.tsx; do [ -f "$f" ] && sed -i 's/\r$$//' "$f"; done
RUN npm run build

FROM caddy:2-alpine
WORKDIR /srv
COPY --from=build /frontend/build /srv
COPY frontend/Caddyfile /etc/caddy/Caddyfile


