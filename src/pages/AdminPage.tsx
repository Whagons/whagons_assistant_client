import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { authFetch } from "@/lib/utils";
import { HOST } from "@/aichat/utils/utils";
import { ModelsCache } from "@/aichat/utils/memory_cache";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

// Types matching backend responses
interface ModelConfig {
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

// OpenRouter model from search
interface OpenRouterModel {
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

// Drag item type
const FAVORITE_MODEL_TYPE = "FAVORITE_MODEL";

// localStorage key for favorite order
const FAVORITE_ORDER_KEY = "admin_favorite_models_order";

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

// Draggable Model Card Component
interface DraggableModelCardProps {
  model: ModelConfig;
  index: number;
  toggleFavorite: (id: string, current: boolean) => void;
  moveFavorite: (dragId: string, hoverId: string) => void;
  onDelete?: (id: string, name: string) => void;
}

function DraggableModelCard({ model, index, toggleFavorite, moveFavorite, onDelete }: DraggableModelCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  
  const [{ isDragging }, drag] = useDrag({
    type: FAVORITE_MODEL_TYPE,
    item: () => ({ id: model.id, index }),
    canDrag: model.favorite,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: FAVORITE_MODEL_TYPE,
    canDrop: () => model.favorite,
    drop: (item: { id: string; index: number }) => {
      if (item.id !== model.id && model.favorite) {
        moveFavorite(item.id, model.id);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  // Combine drag and drop refs on the whole card
  drag(drop(ref));

  return (
    <div 
      ref={ref}
      className={`p-4 rounded-lg border transition-all ${
        model.enabled ? 'bg-card/50 border-border' : 'bg-muted/20 border-border/50 opacity-60'
      } ${model.favorite ? 'ring-1 ring-yellow-500/50 cursor-grab active:cursor-grabbing' : ''} ${
        isDragging ? 'opacity-40 scale-[0.98]' : ''
      } ${isOver && canDrop ? 'ring-2 ring-primary bg-primary/5' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          {/* Favorite star button */}
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); toggleFavorite(model.id, model.favorite); }}
              className={`mt-0.5 p-1 rounded hover:bg-muted/50 transition-colors ${
                model.favorite 
                  ? 'text-yellow-500 hover:text-yellow-600' 
                  : 'text-muted-foreground/40 hover:text-yellow-500'
              }`}
              title={model.favorite ? "Remove from favorites" : "Add to favorites"}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="18" 
                height="18" 
                viewBox="0 0 24 24" 
                fill={model.favorite ? "currentColor" : "none"}
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{model.display_name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full ${model.enabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {model.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{model.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
            {model.provider}
          </span>
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(model.id, model.display_name); }}
              className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Delete model"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs ml-12">
        <span className="text-muted-foreground">ID: <code className="bg-muted/50 px-1 rounded">{model.id}</code></span>
        <span className="text-muted-foreground">Context: <code className="bg-muted/50 px-1 rounded">{model.context_size.toLocaleString()}</code></span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 ml-12">
        {model.capabilities.map((cap) => (
          <span 
            key={cap} 
            className={`text-xs px-2 py-0.5 rounded-full ${
              cap === 'vision' ? 'bg-blue-500/20 text-blue-400' :
              cap === 'pdf' ? 'bg-red-500/20 text-red-400' :
              'bg-primary/10 text-primary'
            }`}
          >
            {cap}
          </span>
        ))}
      </div>
    </div>
  );
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
  
  // Favorite order state (stored in localStorage)
  const [favoriteOrder, setFavoriteOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(FAVORITE_ORDER_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  
  // Selected states for side panel view
  const [selectedSkill, setSelectedSkill] = useState<SkillFile | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<SystemPromptFile | null>(null);

  // Model search/add states
  const [openRouterSearch, setOpenRouterSearch] = useState("");
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addingModel, setAddingModel] = useState<string | null>(null);
  const [isDefaultList, setIsDefaultList] = useState(true);
  const [defaultModelsLoaded, setDefaultModelsLoaded] = useState(false);

  useEffect(() => {
    loadAdminData();
  }, []);

  // Load default vision models when Add Models tab is first selected
  useEffect(() => {
    if (activeTab === "add-models" && !defaultModelsLoaded && openRouterModels.length === 0) {
      loadDefaultModels();
    }
  }, [activeTab, defaultModelsLoaded]);

  const loadDefaultModels = async () => {
    setSearchLoading(true);
    try {
      const response = await authFetch(`${HOST}/api/v1/admin/models/search`);
      if (!response.ok) throw new Error("Failed to load models");
      const data = await response.json();
      setOpenRouterModels(data.models || []);
      setIsDefaultList(true);
      setDefaultModelsLoaded(true);
    } catch (err) {
      console.error("Error loading default models:", err);
    } finally {
      setSearchLoading(false);
    }
  };

  // Save favorite order to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(FAVORITE_ORDER_KEY, JSON.stringify(favoriteOrder));
  }, [favoriteOrder]);

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

  // Filter and sort models - favorites at top, respecting order
  const filteredModels = useMemo(() => {
    if (!config?.models) return [];
    
    const filtered = config.models.filter(model => {
      const matchesSearch = modelSearch === "" || 
        model.display_name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        model.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
        model.description.toLowerCase().includes(modelSearch.toLowerCase());
      
      const matchesProvider = providerFilter === "all" || model.provider === providerFilter;
      
      return matchesSearch && matchesProvider;
    });

    // Sort: favorites first (in order), then non-favorites
    return filtered.sort((a, b) => {
      const aIsFav = a.favorite;
      const bIsFav = b.favorite;
      
      if (aIsFav && !bIsFav) return -1;
      if (!aIsFav && bIsFav) return 1;
      
      // Both favorites - sort by order
      if (aIsFav && bIsFav) {
        const aIndex = favoriteOrder.indexOf(a.id);
        const bIndex = favoriteOrder.indexOf(b.id);
        // If not in order array, put at end
        const aPos = aIndex === -1 ? 999 : aIndex;
        const bPos = bIndex === -1 ? 999 : bIndex;
        return aPos - bPos;
      }
      
      // Both non-favorites - keep original order
      return 0;
    });
  }, [config?.models, modelSearch, providerFilter, favoriteOrder]);

  // Count favorite models
  const favoriteCount = useMemo(() => {
    if (!config?.models) return 0;
    return config.models.filter(m => m.favorite).length;
  }, [config?.models]);

  // Toggle favorite status for a model
  const toggleFavorite = async (modelId: string, currentFavorite: boolean) => {
    const newFavorite = !currentFavorite;
    
    // Check if we're at the limit (5 favorites)
    if (newFavorite && favoriteCount >= 5) {
      toast.error("Maximum 5 favorites allowed", {
        description: "Please remove a favorite before adding a new one.",
      });
      return;
    }

    try {
      const response = await authFetch(
        `${HOST}/api/v1/admin/models/favorite?model_id=${encodeURIComponent(modelId)}&favorite=${newFavorite}`,
        { method: "PATCH" }
      );

      if (!response.ok) {
        throw new Error("Failed to update favorite status");
      }

      // Update local state
      setConfig(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          models: prev.models.map(m => 
            m.id === modelId ? { ...m, favorite: newFavorite } : m
          )
        };
      });

      // Update favorite order
      if (newFavorite) {
        // Add to end of order
        setFavoriteOrder(prev => [...prev.filter(id => id !== modelId), modelId]);
      } else {
        // Remove from order
        setFavoriteOrder(prev => prev.filter(id => id !== modelId));
      }

      // Invalidate the shared models cache so other components get updated favorites
      ModelsCache.invalidate();

      toast.success(newFavorite ? "Added to favorites" : "Removed from favorites");
    } catch (err) {
      console.error("Error toggling favorite:", err);
      toast.error("Failed to update favorite status");
    }
  };

  // Move a favorite model in the order (for drag and drop)
  const moveFavorite = useCallback((dragId: string, hoverId: string) => {
    setFavoriteOrder(prev => {
      const dragIndex = prev.indexOf(dragId);
      const hoverIndex = prev.indexOf(hoverId);
      
      if (dragIndex === -1 || hoverIndex === -1) return prev;
      
      const newOrder = [...prev];
      newOrder.splice(dragIndex, 1);
      newOrder.splice(hoverIndex, 0, dragId);
      return newOrder;
    });
  }, []);

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

  // Search OpenRouter models
  const searchOpenRouterModels = async () => {
    if (!openRouterSearch.trim()) {
      // If search is cleared, reload default list
      loadDefaultModels();
      return;
    }
    
    setSearchLoading(true);
    try {
      const response = await authFetch(
        `${HOST}/api/v1/admin/models/search?q=${encodeURIComponent(openRouterSearch)}`
      );
      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
      setOpenRouterModels(data.models || []);
      setIsDefaultList(false);
    } catch (err) {
      console.error("Search error:", err);
      toast.error("Failed to search models");
    } finally {
      setSearchLoading(false);
    }
  };

  // Add a model from OpenRouter
  const addModelFromSearch = async (model: OpenRouterModel) => {
    setAddingModel(model.id);
    try {
      const response = await authFetch(`${HOST}/api/v1/admin/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: model.id,
          display_name: model.name,
          provider: "openrouter",
          description: model.description || `${model.name} via OpenRouter`,
          context_size: model.context_size || 128000,
          capabilities: model.capabilities || ["text", "reasoning", "tools"],
        }),
      });

      if (!response.ok) throw new Error("Failed to add model");
      
      toast.success(`Added ${model.name}`);
      // Reload config to get updated models
      loadAdminData();
      // Remove from search results
      setOpenRouterModels(prev => prev.filter(m => m.id !== model.id));
    } catch (err) {
      console.error("Add model error:", err);
      toast.error("Failed to add model");
    } finally {
      setAddingModel(null);
    }
  };

  // Remove a custom model
  const removeModel = async (modelId: string, displayName: string) => {
    if (!confirm(`Remove "${displayName}" from your models?`)) return;
    
    try {
      const response = await authFetch(
        `${HOST}/api/v1/admin/models?model_id=${encodeURIComponent(modelId)}`,
        { method: "DELETE" }
      );

      if (!response.ok) throw new Error("Failed to remove model");
      
      toast.success(`Removed ${displayName}`);
      loadAdminData();
    } catch (err) {
      console.error("Remove model error:", err);
      toast.error("Failed to remove model");
    }
  };

  // Check if a model is already added
  const isModelAdded = useCallback((modelId: string) => {
    return config?.models.some(m => m.id === modelId) ?? false;
  }, [config?.models]);

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
    <div className="p-6 max-w-6xl mx-auto h-full overflow-auto scrollbar">
      <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="add-models">Add Models</TabsTrigger>
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
              <div>
                <h2 className="text-lg font-semibold">
                  Models ({filteredModels.length}{filteredModels.length !== config?.models.length ? ` of ${config?.models.length}` : ''})
                </h2>
                <p className="text-sm text-muted-foreground">
                  <span className="text-yellow-500">{favoriteCount}/5</span> favorites selected - click star to toggle, drag to reorder
                </p>
              </div>
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
            
            <DndProvider backend={HTML5Backend}>
              <div className="grid gap-3">
                {filteredModels.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No models match your search criteria
                  </div>
                ) : (
                  filteredModels.map((model, index) => (
                    <DraggableModelCard
                      key={model.id}
                      model={model}
                      index={index}
                      toggleFavorite={toggleFavorite}
                      moveFavorite={moveFavorite}
                      onDelete={removeModel}
                    />
                  ))
                )}
              </div>
            </DndProvider>
          </section>
        </TabsContent>

        {/* Add Models Tab */}
        <TabsContent value="add-models" className="space-y-4">
          {/* Search Section */}
          <section>
            <h2 className="text-lg font-semibold mb-2">Search OpenRouter Models</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Search for models available on OpenRouter and add them to your model list.
            </p>
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Search models (e.g., 'claude', 'gpt-4', 'llama')..."
                  value={openRouterSearch}
                  onChange={(e) => setOpenRouterSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchOpenRouterModels()}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                {openRouterSearch && (
                  <button
                    onClick={() => {
                      setOpenRouterSearch("");
                      loadDefaultModels();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title="Clear and show popular models"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
              <button
                onClick={searchOpenRouterModels}
                disabled={searchLoading || !openRouterSearch.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {searchLoading ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.3-4.3"/>
                  </svg>
                )}
                Search
              </button>
            </div>

            {/* Loading state */}
            {searchLoading && openRouterModels.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <span className="ml-2 text-muted-foreground">Loading models...</span>
              </div>
            )}

            {/* Search Results / Default List */}
            {openRouterModels.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground mb-2">
                  {isDefaultList 
                    ? `Popular vision models (${openRouterModels.length}) - supports text + image input`
                    : `Found ${openRouterModels.length} models matching "${openRouterSearch}"`
                  }
                </p>
                {openRouterModels.map((model) => {
                  const alreadyAdded = isModelAdded(model.id);
                  // Extract original provider from model ID (e.g., "google/gemini-3" -> "Google")
                  const originalProvider = model.id.includes('/') 
                    ? model.id.split('/')[0].charAt(0).toUpperCase() + model.id.split('/')[0].slice(1)
                    : 'Unknown';
                  return (
                    <div 
                      key={model.id}
                      className={`p-4 rounded-lg border ${alreadyAdded ? 'bg-green-500/5 border-green-500/30' : 'bg-card/50 border-border'}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium">{model.name}</h3>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400" title="Will be routed through OpenRouter API">
                              via OpenRouter
                            </span>
                            <span className="text-xs text-muted-foreground">
                              (from {originalProvider})
                            </span>
                            {alreadyAdded && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                                Added
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 font-mono">{model.id}</p>
                          {model.description && (
                            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{model.description}</p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1">
                            {model.capabilities?.map((cap) => (
                              <span 
                                key={cap} 
                                className={`text-xs px-2 py-0.5 rounded-full ${
                                  cap === 'vision' ? 'bg-blue-500/20 text-blue-400' : 'bg-primary/10 text-primary'
                                }`}
                              >
                                {cap}
                              </span>
                            ))}
                            {model.context_size && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {(model.context_size / 1000).toFixed(0)}k ctx
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => addModelFromSearch(model)}
                          disabled={alreadyAdded || addingModel === model.id}
                          className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-1.5 shrink-0"
                        >
                          {addingModel === model.id ? (
                            <div className="w-3 h-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                          ) : alreadyAdded ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="12" y1="5" x2="12" y2="19"/>
                              <line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                          )}
                          {alreadyAdded ? "Added" : "Add"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
