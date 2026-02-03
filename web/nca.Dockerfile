# NCA Assistant Frontend
# Uses: Desarso/nca_assistant_config
#
# Build args required:
#   GH_TOKEN - GitHub token with repo read access
#
# In Coolify: set Dockerfile path to "web/nca.Dockerfile"

# Stage 1: Build the frontend
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Clone NCA config repo (private — needs GH_TOKEN)
ARG GH_TOKEN
RUN if [ -z "$GH_TOKEN" ]; then echo "ERROR: GH_TOKEN build arg is required" && exit 1; fi && \
    git clone https://x-access-token:${GH_TOKEN}@github.com/Desarso/nca_assistant_config.git config

# Install root deps (yaml parser for apply-config)
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest
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
