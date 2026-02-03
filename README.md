# Whagons Assistant Client

React/TypeScript frontend for Whagons Assistant.

## Local Development

```bash
# Install dependencies
npm install

# Create .env with Firebase config
cat > .env << 'EOF'
VITE_CHAT_HOST=http://localhost:8080
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
EOF

# Run dev server
npm run dev
```

## Deployment Configs

Each deployment has its own config in `configs/`:

```
configs/
├── nca/
│   ├── app.yaml      # App name, auth provider
│   ├── favicon.ico
│   └── logo.svg
└── whagons/
    ├── app.yaml
    ├── favicon.ico
    └── logo.svg
```

## Dockerfiles

| Dockerfile | Deployment | Auth |
|------------|------------|------|
| `nca.Dockerfile` | NCA Assistant | Microsoft |
| `whagons.Dockerfile` | Whagons Assistant | Google |

### Coolify Setup

1. Create application from `whagons_assistant_client` repo
2. Set Dockerfile path to `nca.Dockerfile` or `whagons.Dockerfile`
3. Add environment variables (Firebase config)
4. Deploy

## Environment Variables

Required:
```
VITE_CHAT_HOST=https://your-backend.com
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Optional:
```
VITE_FIREBASE_MEASUREMENT_ID=...
VITE_APP_NAME=My Assistant
VITE_AUTH_PROVIDER=google
VITE_AUTH_TENANT=
```
