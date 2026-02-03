# Deployment Guide

This guide explains how to deploy the Assistant application with different configurations (NCA vs Whagons).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    Config Repos (GitHub)                        │
│  ┌─────────────────────┐    ┌─────────────────────────────┐    │
│  │ nca_assistant_config│    │ whagons_assistant_config    │    │
│  │  - app.yaml         │    │  - app.yaml                 │    │
│  │  - logo.svg         │    │  - logo.svg                 │    │
│  │  - whitelist.yaml   │    │  - whitelist.yaml           │    │
│  │  - prompts/         │    │  - prompts/                 │    │
│  └─────────────────────┘    └─────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Cloned at build time
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                whagons_assistant_client                         │
│  ┌─────────────────────┐    ┌─────────────────────────────┐    │
│  │     web/            │    │      backend/               │    │
│  │  nca.Dockerfile     │    │   nca.Dockerfile            │    │
│  │  whagons.Dockerfile │    │   whagons.Dockerfile        │    │
│  └─────────────────────┘    └─────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Deploy to Coolify
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Coolify                                 │
│  ┌─────────────────────┐    ┌─────────────────────────────┐    │
│  │  NCA Frontend       │    │  NCA Backend                │    │
│  │  web/nca.Dockerfile │    │  backend/nca.Dockerfile     │    │
│  └─────────────────────┘    └─────────────────────────────┘    │
│  ┌─────────────────────┐    ┌─────────────────────────────┐    │
│  │  Whagons Frontend   │    │  Whagons Backend            │    │
│  │  web/whagons.Docke..│    │  backend/whagons.Dockerfile │    │
│  └─────────────────────┘    └─────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Deploying NCA Assistant

**Frontend:**
1. Create application in Coolify from `whagons_assistant_client` repo
2. Set Dockerfile path: `web/nca.Dockerfile`
3. Add build argument: `GH_TOKEN` = your GitHub PAT
4. Deploy

**Backend:**
1. Create application in Coolify from `whagons_assistant_client` repo
2. Set Dockerfile path: `backend/nca.Dockerfile`
3. Add build argument: `GH_TOKEN` = your GitHub PAT
4. Add environment variables (secrets - see below)
5. Deploy

### Deploying Whagons Assistant

Same as above, but use:
- Frontend: `web/whagons.Dockerfile`
- Backend: `backend/whagons.Dockerfile`

## Dockerfiles

| Component | NCA | Whagons |
|-----------|-----|---------|
| Frontend | `web/nca.Dockerfile` | `web/whagons.Dockerfile` |
| Backend | `backend/nca.Dockerfile` | `backend/whagons.Dockerfile` |

Each Dockerfile:
1. Clones the appropriate config repo at build time
2. Copies config files (app.yaml, whitelist.yaml, prompts) to the right locations
3. Builds/runs the application

## Build Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `GH_TOKEN` | Yes | GitHub Personal Access Token with `repo` read access |

## Environment Variables (Secrets)

These go in Coolify's environment variables, NOT in the config repo:

### Frontend (.env)

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

### Backend (.env)

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

# Optional
OPENAI_API_KEY=xxx
ANTHROPIC_API_KEY=xxx
```

## Config Repos

### What's in a config repo?

```
config-repo/
├── app.yaml              # App settings (name, auth provider, tools, etc.)
├── favicon.ico           # Browser favicon
├── logo.svg              # Sidebar logo
├── whitelist.yaml        # Email whitelist for access control
├── prompts/
│   ├── system_prompt.md  # AI system prompt
│   └── skills/           # Tool-specific instructions
└── .github/
    └── workflows/
        └── trigger-deploy.yml  # Auto-deploy on push
```

### Creating a new config repo

1. Fork or copy `Desarso/nca_assistant_config`
2. Modify:
   - `app.yaml` — Change app name, auth provider, enabled tools
   - `logo.svg` — Replace with your logo (transparent background!)
   - `prompts/system_prompt.md` — Customize AI personality
   - `whitelist.yaml` — Add authorized emails
3. Set up auto-deploy workflow (see below)

### app.yaml structure

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

## Auto-Deploy on Config Changes

Each config repo has a GitHub Actions workflow that triggers Coolify to rebuild when you push changes.

### Setup

1. In Coolify, generate an API token (Settings > API Tokens)
2. Get your application UUID from Coolify (in the app URL)
3. Add secrets to your config repo:
   - `COOLIFY_TOKEN` — Your Coolify API token
   - `COOLIFY_APP_UUID` — Your application UUID

### Workflow file

`.github/workflows/trigger-deploy.yml`:

```yaml
name: Trigger Coolify Redeploy

on:
  push:
    branches: [main]

jobs:
  redeploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Coolify rebuild
        run: |
          curl -s -X GET \
            "https://coolify.whagons.com/api/v1/deploy?uuid=${{ secrets.COOLIFY_APP_UUID }}" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}"
```

### Multiple apps from one config

If both frontend and backend use the same config repo, you can trigger both:

```yaml
jobs:
  redeploy:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        app_uuid:
          - ${{ secrets.COOLIFY_FRONTEND_UUID }}
          - ${{ secrets.COOLIFY_BACKEND_UUID }}
    steps:
      - name: Trigger Coolify rebuild
        run: |
          curl -s -X GET \
            "https://coolify.whagons.com/api/v1/deploy?uuid=${{ matrix.app_uuid }}" \
            -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}"
```

## Flow Summary

```
1. Push to config repo (e.g., update system_prompt.md)
      │
      ▼
2. GitHub Action triggers Coolify deploy API
      │
      ▼
3. Coolify rebuilds the application
      │
      ▼
4. Dockerfile clones latest config repo
      │
      ▼
5. Config files copied to app locations
      │
      ▼
6. App builds with new config
      │
      ▼
7. New container deployed (~2-3 min total)
```

## Troubleshooting

### Build fails: "GH_TOKEN build arg is required"
- Add `GH_TOKEN` build argument in Coolify with your GitHub PAT

### Build fails: "Repository not found"
- Check that your GitHub token has `repo` read access
- Verify the config repo name is correct in the Dockerfile

### Config changes not applying
- Verify the GitHub Action ran successfully (check Actions tab)
- Check Coolify deployment logs for errors
- Ensure you're pushing to `main` branch

### Logo has white background
- Export logo as SVG or PNG with transparent background
- Don't include `<rect fill="...">` backgrounds in SVG
