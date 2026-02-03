# Frontend Deployment Configs

Each subdirectory contains a configuration for a frontend deployment.

**Note:** Backend configuration (tools, skills, memory, etc.) is handled by the backend repo. Frontend configs only contain UI/branding settings.

## Adding a New Config

1. **Create the directory:**
   ```bash
   mkdir -p configs/<name>
   ```

2. **Copy from an existing config:**
   ```bash
   cp configs/whagons/app.yaml configs/<name>/
   cp configs/whagons/whitelist.yaml configs/<name>/
   cp configs/whagons/favicon.ico configs/<name>/
   cp configs/whagons/logo.svg configs/<name>/
   ```

3. **Edit the config files:**
   - `app.yaml` - App name, auth provider
   - `whitelist.yaml` - Authorized emails/domains
   - `favicon.ico`, `logo.svg` - Branding

4. **Create the Dockerfile:**
   ```bash
   cp web/whagons.Dockerfile web/<name>.Dockerfile
   ```
   
   Then edit it to use your config:
   ```dockerfile
   COPY configs/<name> ./config
   ```

5. **Test locally:**
   ```bash
   npm run use:<name> && npm run dev
   ```

6. **Deploy to Coolify:**
   - Create new application from `whagons_assistant_client` repo
   - Set Dockerfile path: `web/<name>.Dockerfile`
   - Add environment variables (Firebase, backend URL, etc.)
   - Deploy

## Config Structure

```
configs/<name>/
├── app.yaml              # App name, auth provider
├── favicon.ico           # Browser favicon
├── logo.svg              # Sidebar logo (transparent background!)
└── whitelist.yaml        # Access control (optional)
```

## app.yaml Reference

```yaml
app:
  name: "My Assistant"        # Display name
  short_name: "Assistant"     # PWA short name
  theme_color: "#000000"      # Theme color

auth:
  provider: "google"          # "google" or "microsoft"
  tenant: ""                  # MS tenant domain (if microsoft)
```

## Backend Configuration

Tools, skills, memory, and other backend settings are configured in the **backend repo** (`whagons_assistant/configs/<client_id>/app.yaml`).

The backend uses `CLIENT_ID` environment variable to determine which config to load.
