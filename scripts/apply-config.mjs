#!/usr/bin/env node
/**
 * apply-config.mjs
 * 
 * Copies static assets from config/ (deployment-specific overrides) 
 * and defaults/ (universal base files) into the right places.
 * 
 * Config repo overrides take priority over defaults.
 * Does NOT touch .env files — those are managed manually.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIG_DIR = join(ROOT, 'config');
const DEFAULTS_DIR = join(ROOT, 'defaults');
const WEB_DIR = join(ROOT, 'web');
const BACKEND_DIR = join(ROOT, 'backend');

// Load app.yaml for frontend config values (non-secret)
const configPath = join(CONFIG_DIR, 'app.yaml');
if (!existsSync(configPath)) {
  console.error('Error: config/app.yaml not found. Clone your config repo into config/');
  process.exit(1);
}

const config = parse(readFileSync(configPath, 'utf-8'));

// ============================================
// Frontend: Generate web/.env (non-secret values only)
// ============================================
const envLines = [
  `VITE_APP_NAME=${config.app.name}`,
  `VITE_APP_SHORT_NAME=${config.app.short_name}`,
  `VITE_THEME_COLOR=${config.app.theme_color}`,
  `VITE_AUTH_PROVIDER=${config.auth.provider}`,
  `VITE_AUTH_TENANT=${config.auth.tenant || ''}`,
  `VITE_ALLOWED_HOSTS=${(config.deploy.allowed_hosts || []).join(',')}`,
  `VITE_DEV_PORT=${config.deploy.port || 3000}`,
];

// Append to existing .env if it exists (don't overwrite secrets)
const webEnvPath = join(WEB_DIR, '.env');
if (existsSync(webEnvPath)) {
  const existing = readFileSync(webEnvPath, 'utf-8');
  // Remove any lines we're about to write (by key), keep the rest
  const keysToWrite = envLines.map(l => l.split('=')[0]);
  const keptLines = existing.split('\n').filter(line => {
    const key = line.split('=')[0];
    return !keysToWrite.includes(key) && line.trim() !== '';
  });
  const merged = [...keptLines, '', '# From config (auto-generated)', ...envLines];
  writeFileSync(webEnvPath, merged.join('\n') + '\n');
} else {
  writeFileSync(webEnvPath, envLines.join('\n') + '\n');
}
console.log('Updated web/.env (non-secret config values)');

// ============================================
// Frontend: Copy static assets
// ============================================
function copyIfExists(src, dest, label) {
  if (existsSync(src)) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    console.log(`Copied ${label}`);
    return true;
  }
  return false;
}

copyIfExists(join(CONFIG_DIR, 'favicon.ico'), join(WEB_DIR, 'src', 'assets', 'favicon.ico'), 'favicon.ico');
copyIfExists(join(CONFIG_DIR, 'logo.svg'), join(WEB_DIR, 'src', 'assets', 'logo.svg'), 'logo.svg');

// PWA icons
const pwaIconsDir = join(CONFIG_DIR, 'pwa-icons');
if (existsSync(pwaIconsDir)) {
  const pwaDestDir = join(WEB_DIR, 'src', 'assets', 'favicon_io');
  for (const icon of readdirSync(pwaIconsDir)) {
    copyIfExists(join(pwaIconsDir, icon), join(pwaDestDir, icon), `pwa-icons/${icon}`);
  }
}

// ============================================
// Backend: Copy prompts (defaults first, then config overrides)
// ============================================
const targetPromptsDir = existsSync(BACKEND_DIR) ? join(BACKEND_DIR, 'prompts') : join(ROOT, 'prompts');
mkdirSync(join(targetPromptsDir, 'skills'), { recursive: true });

// Step 1: Copy defaults
const defaultPromptsDir = join(DEFAULTS_DIR, 'prompts');
if (existsSync(defaultPromptsDir)) {
  for (const file of readdirSync(defaultPromptsDir).filter(f => f.endsWith('.md'))) {
    copyFileSync(join(defaultPromptsDir, file), join(targetPromptsDir, file));
    console.log(`Copied default prompts/${file}`);
  }
  const defaultSkillsDir = join(defaultPromptsDir, 'skills');
  if (existsSync(defaultSkillsDir)) {
    for (const file of readdirSync(defaultSkillsDir).filter(f => f.endsWith('.md'))) {
      copyFileSync(join(defaultSkillsDir, file), join(targetPromptsDir, 'skills', file));
      console.log(`Copied default prompts/skills/${file}`);
    }
  }
}

// Step 2: Config overrides (overwrites defaults where present)
const configPromptsDir = join(CONFIG_DIR, 'prompts');
if (existsSync(configPromptsDir)) {
  for (const file of readdirSync(configPromptsDir).filter(f => f.endsWith('.md'))) {
    copyFileSync(join(configPromptsDir, file), join(targetPromptsDir, file));
    console.log(`Override prompts/${file}`);
  }
  const configSkillsDir = join(configPromptsDir, 'skills');
  if (existsSync(configSkillsDir)) {
    for (const file of readdirSync(configSkillsDir).filter(f => f.endsWith('.md'))) {
      copyFileSync(join(configSkillsDir, file), join(targetPromptsDir, 'skills', file));
      console.log(`Override prompts/skills/${file}`);
    }
  }
}

// ============================================
// Backend: Copy whitelist
// ============================================
const whitelistSrc = join(CONFIG_DIR, 'whitelist.yaml');
if (existsSync(whitelistSrc)) {
  const targetConfigDir = existsSync(BACKEND_DIR) ? join(BACKEND_DIR, 'config') : ROOT;
  mkdirSync(targetConfigDir, { recursive: true });
  copyFileSync(whitelistSrc, join(targetConfigDir, 'whitelist.yaml'));
  console.log('Copied whitelist.yaml');
}

// ============================================
// Backend: Write app.yaml to backend config dir (for Go to read)
// ============================================
const targetAppYaml = existsSync(BACKEND_DIR) ? join(BACKEND_DIR, 'config', 'app.yaml') : join(ROOT, 'app.yaml');
mkdirSync(dirname(targetAppYaml), { recursive: true });
copyFileSync(configPath, targetAppYaml);
console.log('Copied app.yaml to backend config');

// ============================================
// Backend: Append non-secret config to backend .env
// ============================================
const b = config.backend || {};
const backendEnvPath = existsSync(BACKEND_DIR) ? join(BACKEND_DIR, '.env') : join(ROOT, 'backend.env');
const backendConfigLines = [];

// TS runtime tools
const tsTools = (b.ts_runtime_tools || ['web', 'tavily', 'math']).join(',');
backendConfigLines.push(`TS_RUNTIME_TOOLS=${tsTools}`);

if (existsSync(backendEnvPath)) {
  const existing = readFileSync(backendEnvPath, 'utf-8');
  const keysToWrite = backendConfigLines.map(l => l.split('=')[0]);
  const keptLines = existing.split('\n').filter(line => {
    const key = line.split('=')[0];
    return !keysToWrite.includes(key) && line.trim() !== '';
  });
  const merged = [...keptLines, '', '# From config (auto-generated)', ...backendConfigLines];
  writeFileSync(backendEnvPath, merged.join('\n') + '\n');
} else {
  writeFileSync(backendEnvPath, ['# From config (auto-generated)', ...backendConfigLines].join('\n') + '\n');
}
console.log('Updated backend .env (non-secret config values)');

console.log('\nConfig applied successfully.');
