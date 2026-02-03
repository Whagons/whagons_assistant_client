# Deployment Guide

This guide explains how to deploy the Assistant application with different configurations (NCA, Whagons, etc.).

## Architecture Overview

```
whagons_assistant_client/
├── configs/                    # All deployment configs (version controlled)
│   ├── whagons/               # Whagons Assistant config
│   │   ├── app.yaml
│   │   ├── logo.svg
│   │   ├── whitelist.yaml
│   │   └── prompts/
│   ├── nca/                   # NCA Assistant config
│   │   ├── app.yaml
│   │   ├── logo.svg
│   │   ├── whitelist.yaml
│   │   └── prompts/
│   └── whagons5-widget/       # Whagons5 integrated widget (future)
├── config -> configs/whagons   # Symlink to active config (for local dev)
├── web/
│   ├── whagons.Dockerfile     # Uses configs/whagons
│   └── nca.Dockerfile         # Uses configs/nca
└── defaults/                   # Fallback prompts/skills
```

## Local Development

### Switch configs with npm scripts

```bash
# Switch to whagons config
npm run use:whagons

# Switch to nca config  
npm run use:nca

# Run with specific config
npm run dev:whagons
npm run dev:nca

# Check which config is active
ls -la config
```

The `config` symlink points to the active configuration in `configs/`.

## Deployment (Coolify)

### Dockerfiles

| Deployment | Dockerfile | Config Used |
|------------|------------|-------------|
| Whagons | `web/whagons.Dockerfile` | `configs/whagons` |
| NCA | `web/nca.Dockerfile` | `configs/nca` |

Each Dockerfile copies the appropriate config directory at build time.

### Setup in Coolify

1. Create application from `whagons_assistant_client` repo
2. Set Dockerfile path (e.g., `web/whagons.Dockerfile`)
3. Add environment variables (secrets - see below)
4. Deploy

**No GH_TOKEN required** - configs are now part of the repo.

## Environment Variables (Secrets)

These go in Coolify's environment variables:

### Frontend

```bash
# Firebase (required)
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=xxx
VITE_FIREBASE_PROJECT_ID=xxx
VITE_FIREBASE_STORAGE_BUCKET=xxx
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx
VITE_FIREBASE_APP_ID=xxx

# Backend URL
VITE_CHAT_HOST=https://your-backend-url.com
```

### Backend

```bash
# Google AI / Gemini
GOOGLE_API_KEY=xxx

# Firebase Admin
FIREBASE_PROJECT_ID=xxx
FIREBASE_PRIVATE_KEY=xxx
FIREBASE_CLIENT_EMAIL=xxx

# Microsoft Graph (for NCA with graph tools)
MS_TENANT_ID=xxx
MS_APP_ID=xxx
MS_SECRET=xxx

# Search tools
TAVILY_API_KEY=xxx
BRAVE_API_KEY=xxx
```

## Config Structure

### app.yaml

```yaml
app:
  name: "My Assistant"
  short_name: "Assistant"
  theme_color: "#000000"

auth:
  provider: "google"        # or "microsoft"
  tenant: ""                # Microsoft tenant if using MS auth

deploy:
  allowed_hosts:
    - "assistant.example.com"
  port: 3000

backend:
  port: 8000
  base_path: "/api/v1"
  model_name: "gemini-2.0-flash"
  
  tools:                    # Enable/disable tools
    - Search
    - Brave_Search
    - Execute_TypeScript
    - Generate_Image
    # ... etc
  
  memory:
    enabled: false
    provider: "gemini"
    falkordb_database: "my_memory"
  
  skills:
    enabled: true
  
  ts_runtime_tools:         # Tools for Execute_TypeScript
    - web
    - tavily
    - math
```

### Directory contents

```
configs/<deployment>/
├── app.yaml              # App settings (name, auth provider, tools, etc.)
├── favicon.ico           # Browser favicon
├── logo.svg              # Sidebar logo
├── whitelist.yaml        # Email whitelist for access control
└── prompts/
    ├── system_prompt.md  # AI system prompt
    └── skills/           # Tool-specific instructions
```

## Adding a New Deployment

1. Create directory: `configs/<name>/`
2. Copy from existing config: `cp -r configs/whagons/* configs/<name>/`
3. Modify app.yaml, prompts, branding
4. Create Dockerfile: `web/<name>.Dockerfile`
5. Add npm script to package.json:
   ```json
   "use:<name>": "ln -sfn configs/<name> config && echo 'Switched to <name> config'",
   "dev:<name>": "npm run use:<name> && npm run dev"
   ```
6. Set up Coolify app with new Dockerfile path

## Troubleshooting

### Config changes not applying locally
- Check symlink: `ls -la config`
- Rerun: `npm run use:whagons` (or whichever config)

### Build fails in Coolify
- Check Dockerfile path is correct
- Verify `configs/<name>` directory exists and has app.yaml

### Logo has white background
- Export logo as SVG or PNG with transparent background
