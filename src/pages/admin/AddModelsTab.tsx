import type { OpenRouterModel } from "./types";

interface AddModelsTabProps {
  openRouterSearch: string;
  setOpenRouterSearch: (v: string) => void;
  openRouterModels: OpenRouterModel[];
  searchLoading: boolean;
  isDefaultList: boolean;
  addingModel: string | null;
  searchOpenRouterModels: () => void;
  addModelFromSearch: (model: OpenRouterModel) => void;
  isModelAdded: (id: string) => boolean;
  loadDefaultModels: () => void;
}

export default function AddModelsTab({
  openRouterSearch,
  setOpenRouterSearch,
  openRouterModels,
  searchLoading,
  isDefaultList,
  addingModel,
  searchOpenRouterModels,
  addModelFromSearch,
  isModelAdded,
  loadDefaultModels,
}: AddModelsTabProps) {
  return (
    <div className="space-y-4">
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
                onClick={() => { setOpenRouterSearch(""); loadDefaultModels(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title="Clear and show popular models"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
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
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            )}
            Search
          </button>
        </div>

        {searchLoading && openRouterModels.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="ml-2 text-muted-foreground">Loading models...</span>
          </div>
        )}

        {openRouterModels.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-2">
              {isDefaultList
                ? `Popular vision models (${openRouterModels.length}) - supports text + image input`
                : `Found ${openRouterModels.length} models matching "${openRouterSearch}"`}
            </p>
            {openRouterModels.map((model) => {
              const alreadyAdded = isModelAdded(model.id);
              const originalProvider = model.id.includes("/")
                ? model.id.split("/")[0].charAt(0).toUpperCase() + model.id.split("/")[0].slice(1)
                : "Unknown";
              return (
                <div
                  key={model.id}
                  className={`p-4 rounded-lg border ${alreadyAdded ? "bg-green-500/5 border-green-500/30" : "bg-card/50 border-border"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium">{model.name}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400" title="Will be routed through OpenRouter API">
                          via OpenRouter
                        </span>
                        <span className="text-xs text-muted-foreground">(from {originalProvider})</span>
                        {alreadyAdded && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">Added</span>
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
                              cap === "vision" ? "bg-blue-500/20 text-blue-400" : "bg-primary/10 text-primary"
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
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
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
    </div>
  );
}
