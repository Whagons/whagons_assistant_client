# Whagons Assistant Frontend
# Uses local config from configs/whagons
#
# In Coolify: set Dockerfile path to "web/whagons.Dockerfile"

# Stage 1: Build the frontend
FROM node:20-slim AS builder

WORKDIR /app

# Install root deps (yaml parser for apply-config)
COPY package.json package-lock.json ./
RUN npm ci

# Copy configs, scripts, defaults, and web
COPY configs/whagons ./config
COPY scripts ./scripts
COPY defaults ./defaults
COPY web ./web

# Install web deps
RUN cd web && npm ci

# Apply config + build
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

COPY --from=builder /app/web/dist /usr/share/nginx/html

# SPA fallback
RUN echo 'server { \
    listen 3000; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
