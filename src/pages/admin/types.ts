export interface ModelConfig {
  id: string;
  display_name: string;
  provider: string;
  description: string;
  context_size: number;
  capabilities: string[];
  enabled: boolean;
  favorite: boolean;
  base_url: string;
  api_key_env: string;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  context_size: number;
  capabilities: string[];
  pricing: {
    prompt: string;
    completion: string;
  };
}

export interface ToolInfo {
  name: string;
  description: string;
}

export interface AdminConfigResponse {
  models: ModelConfig[];
  tools: ToolInfo[];
  environment: Record<string, string>;
  is_super_admin: boolean;
}

export interface SkillFile {
  file_name: string;
  path: string;
  description: string;
  content: string;
}

export interface SystemPromptFile {
  file_name: string;
  path: string;
  content: string;
  type: string;
}

export interface ProviderStatus {
  name: string;
  displayName: string;
  enabled: boolean;
  envVar: string;
}
