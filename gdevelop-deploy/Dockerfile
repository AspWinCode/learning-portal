# Multi-stage build for GDevelop Web App
FROM node:20-alpine AS builder

# Build arguments
ARG PUBLIC_URL=/gdevelop
ARG NODE_OPTIONS=--max-old-space-size=4096

WORKDIR /app

# Copy source first (postinstall scripts need project files)
COPY . .

WORKDIR /app/newIDE/app
ENV NODE_OPTIONS=${NODE_OPTIONS}
RUN npm ci --legacy-peer-deps

WORKDIR /app/newIDE/app
ENV PUBLIC_URL=${PUBLIC_URL}
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/newIDE/app/build /usr/share/nginx/html
COPY --from=builder /app/newIDE/app/resources/GDJS /usr/share/nginx/html/GDJS
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
