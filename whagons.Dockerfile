# Whagons Assistant Frontend
# Dockerfile path in Coolify: whagons.Dockerfile

FROM node:20-slim AS builder

WORKDIR /app

# Copy package files and install deps
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and config
COPY . .
COPY configs/whagons/app.yaml ./config/app.yaml
COPY configs/whagons/favicon.svg ./src/assets/favicon.svg
COPY configs/whagons/logo.svg ./src/assets/logo.svg

# Whagons-specific env vars for build
ENV VITE_APP_NAME="Whagons Assistant"
ENV VITE_APP_SHORT_NAME="Whagons"
ENV VITE_THEME_COLOR="#D4310A"
ENV VITE_AUTH_PROVIDER="google"

# Build
RUN npm run build

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
