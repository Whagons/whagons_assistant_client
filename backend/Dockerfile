FROM ghcr.io/astral-sh/uv:debian-slim

# Install Node.js and npm
RUN apt-get update && \
    apt-get install -y curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements file
# Copy backend code only into /app to keep import root consistent
COPY . .
ENV PYTHONPATH=/app:/app/backend

EXPOSE 8000

# Run the application
CMD ["sh", "-c", "uv run migrate.py && uv run index.py"]