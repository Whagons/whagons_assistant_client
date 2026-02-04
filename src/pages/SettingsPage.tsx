import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ModelSelector } from "@/components/model-selector";

export default function SettingsPage() {
  const navigate = useNavigate();
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [useLegacyToolViz, setUseLegacyToolViz] = useState<boolean>(false);

  useEffect(() => {
    // Load saved model preference
    const savedModel = localStorage.getItem("preferred_model");
    if (savedModel) {
      setSelectedModel(savedModel);
    }
    
    // Load tool visualization preference
    const legacyMode = localStorage.getItem("use_legacy_tool_viz") === "1";
    setUseLegacyToolViz(legacyMode);
  }, []);

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    // Save to localStorage
    localStorage.setItem("preferred_model", modelId);
    console.log("Selected model:", modelId);
  };

  const handleToolVizChange = (useLegacy: boolean) => {
    setUseLegacyToolViz(useLegacy);
    if (useLegacy) {
      localStorage.setItem("use_legacy_tool_viz", "1");
    } else {
      localStorage.removeItem("use_legacy_tool_viz");
    }
    console.log("Tool visualization mode:", useLegacy ? "legacy" : "timeline");
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back</span>
      </button>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      
      <div className="space-y-8">
        {/* AI Model Section */}
        <div>
          <h2 className="text-lg font-semibold mb-2">Default Model</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Select the default AI model for new conversations
          </p>
          <ModelSelector 
            value={selectedModel} 
            onChange={handleModelChange}
            className="max-w-md"
          />
          <p className="text-xs text-muted-foreground mt-2">
            This will be used as the default when starting a new conversation
          </p>
        </div>

        {/* Tool Visualization Section */}
        <div className="border-t pt-6">
          <h2 className="text-lg font-semibold mb-2">Tool Visualization</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Choose how tool execution is displayed in conversations
          </p>
          
          <div className="space-y-3">
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
              <input
                type="radio"
                name="toolViz"
                checked={!useLegacyToolViz}
                onChange={() => handleToolVizChange(false)}
                className="mt-1"
              />
              <div>
                <div className="font-medium">Timeline View</div>
                <p className="text-sm text-muted-foreground">
                  Shows a unified timeline with animated progress indicators for all tool operations. 
                  Provides detailed visibility into code execution steps.
                </p>
              </div>
            </label>
            
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
              <input
                type="radio"
                name="toolViz"
                checked={useLegacyToolViz}
                onChange={() => handleToolVizChange(true)}
                className="mt-1"
              />
              <div>
                <div className="font-medium">Legacy View</div>
                <p className="text-sm text-muted-foreground">
                  Shows tool calls and results as separate expandable message boxes. 
                  Traditional view for those who prefer discrete tool messages.
                </p>
              </div>
            </label>
          </div>
          
          <p className="text-xs text-muted-foreground mt-3">
            Changes take effect immediately for new tool executions. Reload the page to apply to existing conversations.
          </p>
        </div>
      </div>
    </div>
  );
}
