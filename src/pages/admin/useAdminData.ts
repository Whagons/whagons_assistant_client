import { useState, useEffect, useMemo, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import { HOST } from "@/aichat/utils/utils";
import { toast } from "sonner";
import type {
  ModelConfig,
  OpenRouterModel,
  AdminConfigResponse,
  SkillFile,
  SystemPromptFile,
  ProviderStatus,
} from "./types";

const FAVORITE_ORDER_KEY = "admin_favorite_models_order";

export function useAdminData() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [config, setConfig] = useState<AdminConfigResponse | null>(null);
  const [skills, setSkills] = useState<SkillFile[]>([]);
  const [prompts, setPrompts] = useState<SystemPromptFile[]>([]);

  // Filter states for models
  const [modelSearch, setModelSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<string>("all");

  // Favorite order state
  const [favoriteOrder, setFavoriteOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(FAVORITE_ORDER_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Selected states for side panels
  const [selectedSkill, setSelectedSkill] = useState<SkillFile | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<SystemPromptFile | null>(null);

  // Model search/add states
  const [openRouterSearch, setOpenRouterSearch] = useState("");
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addingModel, setAddingModel] = useState<string | null>(null);
  const [isDefaultList, setIsDefaultList] = useState(true);
  const [defaultModelsLoaded, setDefaultModelsLoaded] = useState(false);

  // Save favorite order to localStorage
  useEffect(() => {
    localStorage.setItem(FAVORITE_ORDER_KEY, JSON.stringify(favoriteOrder));
  }, [favoriteOrder]);

  // ── Data loading ──

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [configRes, skillsRes, promptsRes] = await Promise.all([
        authFetch(`${HOST}/api/v1/admin/config`),
        authFetch(`${HOST}/api/v1/admin/skills`),
        authFetch(`${HOST}/api/v1/admin/prompts`),
      ]);

      if (!configRes.ok || !skillsRes.ok || !promptsRes.ok) {
        throw new Error("Failed to load admin data");
      }

      const [configData, skillsData, promptsData] = await Promise.all([
        configRes.json(),
        skillsRes.json(),
        promptsRes.json(),
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

  useEffect(() => {
    loadAdminData();
  }, []);

  // ── Derived values ──

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
    return providers.map((p) => ({
      ...p,
      enabled: config.environment[p.envVar]?.includes("[SET") || false,
    }));
  }, [config?.environment]);

  const availableProviders = useMemo(() => {
    if (!config?.models) return [];
    return [...new Set(config.models.map((m) => m.provider))].sort();
  }, [config?.models]);

  const filteredModels = useMemo(() => {
    if (!config?.models) return [];
    const filtered = config.models.filter((model) => {
      const matchesSearch =
        modelSearch === "" ||
        model.display_name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        model.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
        model.description.toLowerCase().includes(modelSearch.toLowerCase());
      const matchesProvider = providerFilter === "all" || model.provider === providerFilter;
      return matchesSearch && matchesProvider;
    });

    return filtered.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      if (a.favorite && b.favorite) {
        const aPos = favoriteOrder.indexOf(a.id);
        const bPos = favoriteOrder.indexOf(b.id);
        return (aPos === -1 ? 999 : aPos) - (bPos === -1 ? 999 : bPos);
      }
      return 0;
    });
  }, [config?.models, modelSearch, providerFilter, favoriteOrder]);

  const favoriteCount = useMemo(() => {
    if (!config?.models) return 0;
    return config.models.filter((m) => m.favorite).length;
  }, [config?.models]);

  const featureFlags = useMemo(() => {
    if (!config?.environment) return [];
    return [
      {
        name: "Memory System",
        key: "MEMORY_ENABLED",
        enabled: config.environment["MEMORY_ENABLED"] === "true",
        description: "Persistent memory using FalkorDB",
      },
      {
        name: "Skill Selector",
        key: "SKILL_SELECTOR_ENABLED",
        enabled: !config.environment["SKILL_SELECTOR_ENABLED"]?.includes("false"),
        description: "AI-powered skill document selection",
      },
    ];
  }, [config?.environment]);

  // ── Actions ──

  const toggleFavorite = async (modelId: string, currentFavorite: boolean) => {
    const newFavorite = !currentFavorite;
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
      if (!response.ok) throw new Error("Failed to update favorite status");

      setConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          models: prev.models.map((m) => (m.id === modelId ? { ...m, favorite: newFavorite } : m)),
        };
      });

      if (newFavorite) {
        setFavoriteOrder((prev) => [...prev.filter((id) => id !== modelId), modelId]);
      } else {
        setFavoriteOrder((prev) => prev.filter((id) => id !== modelId));
      }

      toast.success(newFavorite ? "Added to favorites" : "Removed from favorites");
    } catch (err) {
      console.error("Error toggling favorite:", err);
      toast.error("Failed to update favorite status");
    }
  };

  const moveFavorite = useCallback((dragId: string, hoverId: string) => {
    setFavoriteOrder((prev) => {
      const dragIndex = prev.indexOf(dragId);
      const hoverIndex = prev.indexOf(hoverId);
      if (dragIndex === -1 || hoverIndex === -1) return prev;
      const newOrder = [...prev];
      newOrder.splice(dragIndex, 1);
      newOrder.splice(hoverIndex, 0, dragId);
      return newOrder;
    });
  }, []);

  const searchOpenRouterModels = async () => {
    if (!openRouterSearch.trim()) {
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
      loadAdminData();
      setOpenRouterModels((prev) => prev.filter((m) => m.id !== model.id));
    } catch (err) {
      console.error("Add model error:", err);
      toast.error("Failed to add model");
    } finally {
      setAddingModel(null);
    }
  };

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

  const isModelAdded = useCallback(
    (modelId: string) => config?.models.some((m) => m.id === modelId) ?? false,
    [config?.models]
  );

  return {
    loading,
    error,
    config,
    skills,
    prompts,
    modelSearch,
    setModelSearch,
    providerFilter,
    setProviderFilter,
    selectedSkill,
    setSelectedSkill,
    selectedPrompt,
    setSelectedPrompt,
    openRouterSearch,
    setOpenRouterSearch,
    openRouterModels,
    searchLoading,
    addingModel,
    isDefaultList,
    defaultModelsLoaded,
    providerStatuses,
    availableProviders,
    filteredModels,
    favoriteCount,
    featureFlags,
    toggleFavorite,
    moveFavorite,
    searchOpenRouterModels,
    addModelFromSearch,
    removeModel,
    isModelAdded,
    loadDefaultModels,
  };
}
