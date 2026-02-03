# Deployment Configs

Each subdirectory contains a complete configuration for a deployment.

## Adding a New Config

1. **Create the directory:**
   ```bash
   mkdir -p configs/<name>/prompts/skills
   ```

2. **Copy from an existing config:**
   ```bash
   cp -r configs/whagons/* configs/<name>/
   ```

3. **Edit the config files:**
   - `app.yaml` - App name, auth provider, tools, allowed hosts
   - `prompts/system_prompt.md` - AI personality/instructions
   - `prompts/skills/*.md` - Tool-specific instructions
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

5. **Add npm scripts to `package.json`:**
   ```json
   "use:<name>": "ln -sfn configs/<name> config && echo 'Switched to <name> config'",
   "dev:<name>": "npm run use:<name> && npm run dev"
   ```

6. **Test locally:**
   ```bash
   npm run dev:<name>
   ```

7. **Deploy to Coolify:**
   - Create new application from `whagons_assistant_client` repo
   - Set Dockerfile path: `web/<name>.Dockerfile`
   - Add environment variables (Firebase, etc.)
   - Deploy

## Config Structure

```
configs/<name>/
├── app.yaml              # Main config (name, auth, tools, etc.)
├── favicon.ico           # Browser favicon
├── logo.svg              # Sidebar logo (transparent background!)
├── whitelist.yaml        # Access control
└── prompts/
    ├── system_prompt.md          # AI system prompt
    ├── audio_system_prompt.md    # Voice mode prompt
    ├── language_instructions.md  # Language handling
    └── skills/                   # Tool instructions
        ├── browser_navigate.md
        ├── execute_typescript.md
        └── ...
```

## app.yaml Reference

```yaml
app:
  name: "My Assistant"        # Display name
  short_name: "Assistant"     # PWA short name
  theme_color: "#000000"      # Theme color

auth:
  provider: "google"          # "google" or "microsoft"
  tenant: ""                  # MS tenant (if microsoft)

deploy:
  allowed_hosts:
    - "assistant.example.com"
  port: 3000

backend:
  port: 8080
  base_path: "/api/v1"
  model_name: "gemini-2.0-flash"
  
  tools:                      # Enabled tools
    - Search
    - Brave_Search
    - Execute_TypeScript
    - Generate_Image
    - Browser_Navigate
    - Browser_Alert
    - Browser_Prompt
    - Sandbox_Run
    - List_Skill_Files
    - Read_Skill_File
    - Edit_Skill_File
  
  memory:
    enabled: false
    provider: "gemini"
    falkordb_database: "my_memory"
  
  skills:
    enabled: true
  
  ts_runtime_tools:           # For Execute_TypeScript
    - web
    - tavily
    - math
    # - graph                 # Requires MS_TENANT_ID, MS_APP_ID, MS_SECRET
```
