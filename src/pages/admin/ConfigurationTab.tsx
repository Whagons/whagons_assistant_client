import { useRef } from "react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import type { ModelConfig, ProviderStatus } from "./types";

const FAVORITE_MODEL_TYPE = "FAVORITE_MODEL";

// ── Draggable Model Card ──

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
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [{ isOver, canDrop }, drop] = useDrop({
    accept: FAVORITE_MODEL_TYPE,
    canDrop: () => model.favorite,
    drop: (item: { id: string; index: number }) => {
      if (item.id !== model.id && model.favorite) moveFavorite(item.id, model.id);
    },
    collect: (monitor) => ({ isOver: monitor.isOver(), canDrop: monitor.canDrop() }),
  });

  drag(drop(ref));

  return (
    <div
      ref={ref}
      className={`p-4 rounded-lg border transition-all ${
        model.enabled ? "bg-card/50 border-border" : "bg-muted/20 border-border/50 opacity-60"
      } ${model.favorite ? "ring-1 ring-yellow-500/50 cursor-grab active:cursor-grabbing" : ""} ${
        isDragging ? "opacity-40 scale-[0.98]" : ""
      } ${isOver && canDrop ? "ring-2 ring-primary bg-primary/5" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); toggleFavorite(model.id, model.favorite); }}
              className={`mt-0.5 p-1 rounded hover:bg-muted/50 transition-colors ${
                model.favorite ? "text-yellow-500 hover:text-yellow-600" : "text-muted-foreground/40 hover:text-yellow-500"
              }`}
              title={model.favorite ? "Remove from favorites" : "Add to favorites"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={model.favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{model.display_name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full ${model.enabled ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                {model.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{model.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">{model.provider}</span>
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(model.id, model.display_name); }}
              className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Delete model"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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
              cap === "vision" ? "bg-blue-500/20 text-blue-400" : cap === "pdf" ? "bg-red-500/20 text-red-400" : "bg-primary/10 text-primary"
            }`}
          >
            {cap}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Configuration Tab ──

interface ConfigurationTabProps {
  providerStatuses: ProviderStatus[];
  featureFlags: Array<{ name: string; key: string; enabled: boolean; description: string }>;
  filteredModels: ModelConfig[];
  totalModelCount: number;
  favoriteCount: number;
  modelSearch: string;
  setModelSearch: (v: string) => void;
  providerFilter: string;
  setProviderFilter: (v: string) => void;
  availableProviders: string[];
  toggleFavorite: (id: string, current: boolean) => void;
  moveFavorite: (dragId: string, hoverId: string) => void;
  removeModel: (id: string, name: string) => void;
}

export default function ConfigurationTab({
  providerStatuses,
  featureFlags,
  filteredModels,
  totalModelCount,
  favoriteCount,
  modelSearch,
  setModelSearch,
  providerFilter,
  setProviderFilter,
  availableProviders,
  toggleFavorite,
  moveFavorite,
  removeModel,
}: ConfigurationTabProps) {
  return (
    <div className="space-y-8">
      {/* Providers */}
      <section>
        <h2 className="text-lg font-semibold mb-4">API Providers</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {providerStatuses.map((provider) => (
            <div
              key={provider.name}
              className={`p-4 rounded-lg border flex items-center gap-3 ${
                provider.enabled ? "bg-green-500/5 border-green-500/30" : "bg-muted/20 border-border/50"
              }`}
            >
              <div className={`w-2.5 h-2.5 rounded-full ${provider.enabled ? "bg-green-500" : "bg-muted-foreground/30"}`} />
              <p className={`font-medium text-sm ${provider.enabled ? "text-foreground" : "text-muted-foreground"}`}>
                {provider.displayName}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Flags */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Features</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {featureFlags.map((flag) => (
            <div
              key={flag.key}
              className={`p-4 rounded-lg border flex items-start gap-3 ${
                flag.enabled ? "bg-green-500/5 border-green-500/30" : "bg-muted/20 border-border/50"
              }`}
            >
              <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${flag.enabled ? "bg-green-500" : "bg-muted-foreground/30"}`} />
              <div>
                <p className={`font-medium text-sm ${flag.enabled ? "text-foreground" : "text-muted-foreground"}`}>{flag.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{flag.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Models */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold">
              Models ({filteredModels.length}{filteredModels.length !== totalModelCount ? ` of ${totalModelCount}` : ""})
            </h2>
            <p className="text-sm text-muted-foreground">
              <span className="text-yellow-500">{favoriteCount}/5</span> favorites selected - click star to toggle, drag to reorder
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search models..."
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                className="w-full sm:w-64 px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
              />
              {modelSearch && (
                <button onClick={() => setModelSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  x
                </button>
              )}
            </div>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="all">All Providers</option>
              {availableProviders.map((provider) => (
                <option key={provider} value={provider}>{provider}</option>
              ))}
            </select>
          </div>
        </div>

        <DndProvider backend={HTML5Backend}>
          <div className="grid gap-3">
            {filteredModels.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No models match your search criteria</div>
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
    </div>
  );
}
