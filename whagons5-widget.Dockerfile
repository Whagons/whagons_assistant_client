# Whagons5 Widget Frontend
# Uses local config from configs/whagons5-widget
#
# In Coolify: set Dockerfile path to "web/whagons5-widget.Dockerfile"

# Stage 1: Build the frontend
FROM node:20-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Install root deps (yaml parser for apply-config)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy configs, scripts, defaults, and web
COPY configs/whagons5-widget ./config
COPY scripts ./scripts
COPY defaults ./defaults
COPY web ./web

# Install web deps
RUN cd web && pnpm install --frozen-lockfile

# Apply config + build
RUN pnpm run build

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
