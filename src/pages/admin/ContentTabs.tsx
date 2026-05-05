import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ToolInfo, SkillFile, SystemPromptFile } from "./types";

// ── Tools Tab ──

interface ToolsTabProps {
  tools: ToolInfo[];
}

export function ToolsTab({ tools }: ToolsTabProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold mb-4">Enabled Tools ({tools.length})</h2>
      <div className="grid gap-3">
        {tools.map((tool) => (
          <div key={tool.name} className="p-4 rounded-lg bg-card/50 border border-border">
            <h3 className="font-medium font-mono">{tool.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{tool.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Skills Tab ──

interface SkillsTabProps {
  skills: SkillFile[];
  selectedSkill: SkillFile | null;
  setSelectedSkill: (skill: SkillFile | null) => void;
}

export function SkillsTab({ skills, selectedSkill, setSelectedSkill }: SkillsTabProps) {
  return (
    <div className="flex gap-4 h-[calc(100vh-220px)]">
      <div className={`${selectedSkill ? "w-1/3 min-w-[280px]" : "w-full"} flex flex-col transition-all duration-200`}>
        <h2 className="text-lg font-semibold mb-4 shrink-0">Skill Files ({skills.length})</h2>
        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {skills.map((skill) => (
            <button
              key={skill.path}
              onClick={() => setSelectedSkill(selectedSkill?.path === skill.path ? null : skill)}
              className={`w-full p-3 rounded-lg border text-left transition-colors ${
                selectedSkill?.path === skill.path
                  ? "bg-primary/10 border-primary/50"
                  : "bg-card/50 border-border hover:bg-muted/30"
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

      {selectedSkill && (
        <div className="flex-1 flex flex-col border-l border-border pl-4 min-w-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold font-mono truncate">{selectedSkill.file_name}</h2>
              <p className="text-xs text-muted-foreground truncate">{selectedSkill.path}</p>
            </div>
            <CloseButton onClick={() => setSelectedSkill(null)} />
          </div>
          <div className="flex-1 overflow-y-auto bg-card/30 rounded-lg border border-border p-6 min-h-0">
            <article className="markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedSkill.content}</ReactMarkdown>
            </article>
          </div>
        </div>
      )}
    </div>
  );
}

// ── System Prompts Tab ──

interface PromptsTabProps {
  prompts: SystemPromptFile[];
  selectedPrompt: SystemPromptFile | null;
  setSelectedPrompt: (prompt: SystemPromptFile | null) => void;
}

export function PromptsTab({ prompts, selectedPrompt, setSelectedPrompt }: PromptsTabProps) {
  return (
    <div className="flex gap-4 h-[calc(100vh-220px)]">
      <div className={`${selectedPrompt ? "w-1/3 min-w-[280px]" : "w-full"} flex flex-col transition-all duration-200`}>
        <h2 className="text-lg font-semibold mb-4 shrink-0">System Prompts ({prompts.length})</h2>
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {["shared", "client"].map((type) => {
            const typePrompts = prompts.filter((p) => p.type === type);
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
                          ? "bg-primary/10 border-primary/50"
                          : "bg-card/50 border-border hover:bg-muted/30"
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

      {selectedPrompt && (
        <div className="flex-1 flex flex-col border-l border-border pl-4 min-w-0">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold font-mono truncate">{selectedPrompt.file_name}</h2>
              <p className="text-xs text-muted-foreground truncate">{selectedPrompt.path}</p>
            </div>
            <CloseButton onClick={() => setSelectedPrompt(null)} />
          </div>
          <div className="flex-1 overflow-y-auto bg-card/30 rounded-lg border border-border p-6 min-h-0">
            {selectedPrompt.content ? (
              <article className="markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedPrompt.content}</ReactMarkdown>
              </article>
            ) : (
              <p className="text-muted-foreground italic">(empty)</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared close button ──

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-2 hover:bg-muted/30 rounded-lg transition-colors text-muted-foreground hover:text-foreground shrink-0 ml-2"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}
