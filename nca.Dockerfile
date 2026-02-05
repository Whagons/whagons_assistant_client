# NCA Assistant Frontend
# Dockerfile path in Coolify: nca.Dockerfile

FROM node:20-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files and install deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and config
COPY . .
COPY configs/nca/app.yaml ./config/app.yaml
COPY configs/nca/favicon.ico ./src/assets/favicon.ico
COPY configs/nca/logo.svg ./src/assets/logo.svg

# NCA-specific env vars for build
ENV VITE_APP_NAME="NCA Assistant"
ENV VITE_AUTH_PROVIDER="microsoft"
ENV VITE_AUTH_TENANT="novastone-ca.com"

# Build
RUN pnpm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

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
