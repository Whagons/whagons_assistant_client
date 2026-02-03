# NCA Assistant Backend
# Uses: Desarso/nca_assistant_config
#
# Build args required:
#   GH_TOKEN - GitHub token with repo read access
#
# In Coolify: set Dockerfile path to "backend/nca.Dockerfile"

FROM ghcr.io/astral-sh/uv:debian-slim

# Install git for cloning config repo
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Clone NCA config repo (private — needs GH_TOKEN)
ARG GH_TOKEN
RUN if [ -z "$GH_TOKEN" ]; then echo "ERROR: GH_TOKEN build arg is required" && exit 1; fi && \
    git clone https://x-access-token:${GH_TOKEN}@github.com/Desarso/nca_assistant_config.git /tmp/config

# Copy config files to appropriate locations
RUN mkdir -p /app/config /app/prompts/skills

# Copy app.yaml and whitelist.yaml to config/
RUN cp /tmp/config/app.yaml /app/config/ && \
    cp /tmp/config/whitelist.yaml /app/config/

# Copy prompts (config overrides defaults, so copy config prompts)
RUN cp -r /tmp/config/prompts/* /app/prompts/ 2>/dev/null || true

# Clean up
RUN rm -rf /tmp/config

# Copy application code
COPY . .

EXPOSE 8000

# Run the application
CMD ["sh", "-c", "uv run migrate.py && uv run index.py"]
