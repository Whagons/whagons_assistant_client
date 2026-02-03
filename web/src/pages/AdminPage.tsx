import { useState, useEffect, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { authFetch } from "@/lib/utils";
import { HOST } from "@/aichat/utils/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Types matching backend responses
interface ModelConfig {
  id: string;
  display_name: string;
  provider: string;
  description: string;
  context_size: number;
  capabilities: string[];
  enabled: boolean;
  base_url: string;
  api_key_env: string;
}

interface ToolInfo {
  name: string;
  description: string;
}

interface AdminConfigResponse {
  models: ModelConfig[];
  tools: ToolInfo[];
  environment: Record<string, string>;
  is_super_admin: boolean;
}

interface SkillFile {
  file_name: string;
  path: string;
  description: string;
  content: string;
}

interface SystemPromptFile {
  file_name: string;
  path: string;
  content: string;
  type: string;
}

// Provider status derived from environment variables
interface ProviderStatus {
  name: string;
  displayName: string;
  enabled: boolean;
  envVar: string;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("config");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Data states
  const [config, setConfig] = useState<AdminConfigResponse | null>(null);
  const [skills, setSkills] = useState<SkillFile[]>([]);
  const [prompts, setPrompts] = useState<SystemPromptFile[]>([]);
  
  // Filter states for models
  const [modelSearch, setModelSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  
  // Selected states for side panel view
  const [selectedSkill, setSelectedSkill] = useState<SkillFile | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<SystemPromptFile | null>(null);

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Load all data in parallel
      const [configRes, skillsRes, promptsRes] = await Promise.all([
        authFetch(`${HOST}/api/v1/admin/config`),
        authFetch(`${HOST}/api/v1/admin/skills`),
        authFetch(`${HOST}/api/v1/admin/prompts`)
      ]);

      if (!configRes.ok || !skillsRes.ok || !promptsRes.ok) {
        throw new Error("Failed to load admin data");
      }

      const [configData, skillsData, promptsData] = await Promise.all([
        configRes.json(),
        skillsRes.json(),
        promptsRes.json()
      ]);

      setConfig(configData);
      setSkills(skillsData.skills || []);
      setPrompts(promptsData.prompts || []);
    } catch (err) {
      console.error("Error loading admin data:", err);
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  // Derive provider statuses from environment variables
  const providerStatuses = useMemo((): ProviderStatus[] => {
    if (!config?.environment) return [];
    
    const providers: ProviderStatus[] = [
      { name: "gemini", displayName: "Google Gemini", enabled: false, envVar: "GEMINI_API_KEY" },
      { name: "openrouter", displayName: "OpenRouter", enabled: false, envVar: "OPENROUTER_API_KEY" },
      { name: "groq", displayName: "Groq", enabled: false, envVar: "GROQ_API_KEY" },
      { name: "cerebras", displayName: "Cerebras", enabled: false, envVar: "CEREBRAS_API_KEY" },
      { name: "fireworks", displayName: "Fireworks AI", enabled: false, envVar: "FIREWORKS_AI_KEY" },
      { name: "openai", displayName: "OpenAI", enabled: false, envVar: "OPENAI_API_KEY" },
      { name: "anthropic", displayName: "Anthropic", enabled: false, envVar: "ANTHROPIC_API_KEY" },
    ];

    return providers.map(p => ({
      ...p,
      enabled: config.environment[p.envVar]?.includes("[SET") || false
    }));
  }, [config?.environment]);

  // Get unique providers from models for filter
  const availableProviders = useMemo(() => {
    if (!config?.models) return [];
    const providers = [...new Set(config.models.map(m => m.provider))];
    return providers.sort();
  }, [config?.models]);

  // Filter models based on search and provider
  const filteredModels = useMemo(() => {
    if (!config?.models) return [];
    
    return config.models.filter(model => {
      const matchesSearch = modelSearch === "" || 
        model.display_name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        model.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
        model.description.toLowerCase().includes(modelSearch.toLowerCase());
      
      const matchesProvider = providerFilter === "all" || model.provider === providerFilter;
      
      return matchesSearch && matchesProvider;
    });
  }, [config?.models, modelSearch, providerFilter]);

  // Get feature flags from environment
  const featureFlags = useMemo(() => {
    if (!config?.environment) return [];
    
    const flags = [
      { 
        name: "Memory System", 
        key: "MEMORY_ENABLED", 
        enabled: config.environment["MEMORY_ENABLED"] === "true",
        description: "Persistent memory using FalkorDB"
      },
      { 
        name: "Skill Selector", 
        key: "SKILL_SELECTOR_ENABLED", 
        enabled: !config.environment["SKILL_SELECTOR_ENABLED"]?.includes("false"),
        description: "AI-powered skill document selection"
      },
    ];
    
    return flags;
  }, [config?.environment]);

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">Loading admin data...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto h-full overflow-auto">
      <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="prompts">System Prompts</TabsTrigger>
        </TabsList>

        {/* Configuration Tab */}
        <TabsContent value="config" className="space-y-8">
          {/* Providers Section */}
          <section>
            <h2 className="text-lg font-semibold mb-4">API Providers</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {providerStatuses.map((provider) => (
                <div 
                  key={provider.name}
                  className={`p-4 rounded-lg border flex items-center gap-3 ${
                    provider.enabled 
                      ? 'bg-green-500/5 border-green-500/30' 
                      : 'bg-muted/20 border-border/50'
                  }`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full ${provider.enabled ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                  <div>
                    <p className={`font-medium text-sm ${provider.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {provider.displayName}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Feature Flags Section */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Features</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {featureFlags.map((flag) => (
                <div 
                  key={flag.key}
                  className={`p-4 rounded-lg border flex items-start gap-3 ${
                    flag.enabled 
                      ? 'bg-green-500/5 border-green-500/30' 
                      : 'bg-muted/20 border-border/50'
                  }`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${flag.enabled ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                  <div>
                    <p className={`font-medium text-sm ${flag.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {flag.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{flag.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Models Section */}
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <h2 className="text-lg font-semibold">
                Models ({filteredModels.length}{filteredModels.length !== config?.models.length ? ` of ${config?.models.length}` : ''})
              </h2>
              <div className="flex flex-col sm:flex-row gap-2">
                {/* Search Input */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search models..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="w-full sm:w-64 px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
                  />
                  {modelSearch && (
                    <button
                      onClick={() => setModelSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  )}
                </div>
                {/* Provider Filter */}
                <select
                  value={providerFilter}
                  onChange={(e) => setProviderFilter(e.target.value)}
                  className="px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="all">All Providers</option>
                  {availableProviders.map(provider => (
                    <option key={provider} value={provider}>{provider}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="grid gap-3">
              {filteredModels.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No models match your search criteria
                </div>
              ) : (
                filteredModels.map((model) => (
                  <div 
                    key={model.id}
                    className={`p-4 rounded-lg border ${model.enabled ? 'bg-card/50 border-border' : 'bg-muted/20 border-border/50 opacity-60'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{model.display_name}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${model.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {model.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{model.description}</p>
                      </div>
                      <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                        {model.provider}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="text-muted-foreground">ID: <code className="bg-muted/50 px-1 rounded">{model.id}</code></span>
                      <span className="text-muted-foreground">Context: <code className="bg-muted/50 px-1 rounded">{model.context_size.toLocaleString()}</code></span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {model.capabilities.map((cap) => (
                        <span key={cap} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </TabsContent>

        {/* Tools Tab */}
        <TabsContent value="tools" className="space-y-4">
          <h2 className="text-lg font-semibold mb-4">Enabled Tools ({config?.tools.length || 0})</h2>
          <div className="grid gap-3">
            {config?.tools.map((tool) => (
              <div 
                key={tool.name}
                className="p-4 rounded-lg bg-card/50 border border-border"
              >
                <h3 className="font-medium font-mono">{tool.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{tool.description}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Skills Tab */}
        <TabsContent value="skills">
          <div className="flex gap-4 h-[calc(100vh-220px)]">
            {/* Skills List */}
            <div className={`${selectedSkill ? 'w-1/3 min-w-[280px]' : 'w-full'} flex flex-col transition-all duration-200`}>
              <h2 className="text-lg font-semibold mb-4 shrink-0">Skill Files ({skills.length})</h2>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {skills.map((skill) => (
                  <button
                    key={skill.path}
                    onClick={() => setSelectedSkill(selectedSkill?.path === skill.path ? null : skill)}
                    className={`w-full p-3 rounded-lg border text-left transition-colors ${
                      selectedSkill?.path === skill.path 
                        ? 'bg-primary/10 border-primary/50' 
                        : 'bg-card/50 border-border hover:bg-muted/30'
                    }`}
                  >
                    <h3 className="font-medium font-mono text-sm">{skill.file_name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{skill.path}</p>
                    {skill.description && !selectedSkill && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{skill.description}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Skill Content Panel */}
            {selectedSkill && (
              <div className="flex-1 flex flex-col border-l border-border pl-4 min-w-0">
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold font-mono truncate">{selectedSkill.file_name}</h2>
                    <p className="text-xs text-muted-foreground truncate">{selectedSkill.path}</p>
                  </div>
                  <button
                    onClick={() => setSelectedSkill(null)}
                    className="p-2 hover:bg-muted/30 rounded-lg transition-colors text-muted-foreground hover:text-foreground shrink-0 ml-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto bg-card/30 rounded-lg border border-border p-6 min-h-0">
                  <article className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {selectedSkill.content}
                    </ReactMarkdown>
                  </article>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* System Prompts Tab */}
        <TabsContent value="prompts">
          <div className="flex gap-4 h-[calc(100vh-220px)]">
            {/* Prompts List */}
            <div className={`${selectedPrompt ? 'w-1/3 min-w-[280px]' : 'w-full'} flex flex-col transition-all duration-200`}>
              <h2 className="text-lg font-semibold mb-4 shrink-0">System Prompts ({prompts.length})</h2>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {/* Group prompts by type */}
                {['shared', 'client'].map((type) => {
                  const typePrompts = prompts.filter(p => p.type === type);
                  if (typePrompts.length === 0) return null;
                  
                  return (
                    <div key={type}>
                      <h3 className="text-sm font-medium mb-2 text-muted-foreground capitalize">{type}</h3>
                      <div className="space-y-2">
                        {typePrompts.map((prompt) => (
                          <button
                            key={prompt.path}
                            onClick={() => setSelectedPrompt(selectedPrompt?.path === prompt.path ? null : prompt)}
                            className={`w-full p-3 rounded-lg border text-left transition-colors ${
                              selectedPrompt?.path === prompt.path 
                                ? 'bg-primary/10 border-primary/50' 
                                : 'bg-card/50 border-border hover:bg-muted/30'
                            }`}
                          >
                            <h3 className="font-medium font-mono text-sm">{prompt.file_name}</h3>
                            <p className="text-xs text-muted-foreground mt-1">{prompt.path}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Prompt Content Panel */}
            {selectedPrompt && (
              <div className="flex-1 flex flex-col border-l border-border pl-4 min-w-0">
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold font-mono truncate">{selectedPrompt.file_name}</h2>
                    <p className="text-xs text-muted-foreground truncate">{selectedPrompt.path}</p>
                  </div>
                  <button
                    onClick={() => setSelectedPrompt(null)}
                    className="p-2 hover:bg-muted/30 rounded-lg transition-colors text-muted-foreground hover:text-foreground shrink-0 ml-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto bg-card/30 rounded-lg border border-border p-6 min-h-0">
                  {selectedPrompt.content ? (
                    <article className="markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedPrompt.content}
                      </ReactMarkdown>
                    </article>
                  ) : (
                    <p className="text-muted-foreground italic">(empty)</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
