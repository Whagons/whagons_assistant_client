import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger, useSidebar } from "./components/ui/sidebar";
import { AppSidebar } from "./components/app-sidebar";
import { useIsMobile } from "./hooks/use-mobile";
import { ModeToggle } from "./components/mode-toogle";
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import { ConversationCache, Conversation } from "./aichat/utils/memory_cache";
import { useAuth } from "./lib/auth-context";

interface ChatContextType {
  chats: Conversation[];
  setChats: React.Dispatch<React.SetStateAction<Conversation[]>>;
  resetCurrentChat: () => void;
  resetChatTrigger: number;
}

// Create the context
const ChatContext = createContext<ChatContextType | undefined>(undefined);

// Create a custom hook for using the context
export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();

  const [chats, setChats] = useState<Conversation[]>([]);
  const [resetChatTrigger, setResetChatTrigger] = useState(0);
  
  // Function to reset the current chat
  const resetCurrentChat = () => {
    setResetChatTrigger(prev => prev + 1);
  };

  const { isSuperAdmin } = useAuth();

  // Determine current tab based on route
  const getCurrentTab = () => {
    const path = location.pathname;
    if (path.startsWith('/chat')) return 'chat';
    if (path.startsWith('/workflows')) return 'workflows';
    if (path.startsWith('/admin')) return 'admin';
    return 'chat'; // default
  };

  // Handle tab change
  const handleTabChange = (value: string) => {
    if (value === 'chat') {
      navigate('/chat/');
    } else if (value === 'workflows') {
      navigate('/workflows');
    } else if (value === 'admin') {
      navigate('/admin');
    }
  };

  //on mount load conversations from cache, then optionally refresh from server
  useEffect(() => {
    console.log("Layout mounted - starting to load conversations");
    const loadConversations = async () => {
      try {
        // Check if we have cached conversations first
        const hasCached = ConversationCache.has();
        
        // Get conversations (from cache or server if no cache)
        const chats = await ConversationCache.get();
        console.log("Got chats:", chats.length, "items, wasCached:", hasCached);
        setChats(chats);

        // Only do background refresh if we showed cached data
        // (ConversationCache.get() already fetches from server if no cache)
        if (hasCached) {
          // Background refresh to check for updates
          const freshChats = await ConversationCache.fetchConversationsNoCache();
          console.log("Background refresh got:", freshChats.length, "items");
          setChats(freshChats);
        }
      } catch (error) {
        console.error("Failed to load conversations:", error);
      }
    };
    loadConversations();
  }, []);

  // Provide a consistent value object to the context
  const contextValue = {
    chats: chats,
    setChats: setChats,
    resetCurrentChat,
    resetChatTrigger,
  };

  const isWorkflowEditPage = location.pathname.includes('/workflows/') && location.pathname.includes('/edit');

  const TopHeader = () => {
    const { state } = useSidebar();
    const isExpanded = state === "expanded";
    const left = isMobile ? "0" : (isExpanded ? "var(--sidebar-width)" : "0");
    const paddingLeft = isExpanded ? "12px" : "72px";

    return (
      <div className="fixed top-0 right-0 z-[1000] bg-sidebar" style={{ left: left, height: "56px" }}>
        <div className="flex items-center justify-between h-full pl-[72px] pr-3 md:pl-[72px] md:pr-4"
             style={{ paddingLeft: paddingLeft }}>
          <div className="flex items-center gap-3">
            {/* Navigation tabs */}
            <div className="hidden md:block max-w-full">
              <Tabs value={getCurrentTab()} onValueChange={handleTabChange}>
                <TabsList className="h-11 rounded-full bg-sidebar/20 border border-sidebar-border/60 px-1 flex items-center gap-1 backdrop-blur shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] ml-0">
                  <TabsTrigger value="chat" className="text-sm font-medium h-9 px-5 leading-none rounded-full text-foreground/85 hover:bg-sidebar-accent/60 transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                    Chat
                  </TabsTrigger>
                  <TabsTrigger value="workflows" className="text-sm font-medium h-9 px-5 leading-none rounded-full text-foreground/85 hover:bg-sidebar-accent/60 transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                    Workflows
                  </TabsTrigger>
                  {isSuperAdmin && (
                    <TabsTrigger value="admin" className="text-sm font-medium h-9 px-5 leading-none rounded-full text-foreground/85 hover:bg-sidebar-accent/60 transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                      Admin
                    </TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ModeToggle className="h-10 flex items-center justify-center" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <ChatContext.Provider value={contextValue}>
      <SidebarProvider>
        <div className="flex h-screen w-full overflow-x-hidden overscroll-none">
          <AppSidebar />
          {/* Restore fixed sidebar toggle position */}
          <SidebarTrigger className="fixed left-2 top-[12px] z-[1200] hover:bg-white/20 rounded-md p-2 transition-colors [&_svg:not([class*='size-'])]:size-4!" />
          
          <TopHeader />
          
          <main className="flex flex-col flex-1 bg-sidebar pt-14 w-full h-screen overflow-hidden overscroll-none">
            <div className="h-full overflow-hidden pl-2">{children}</div>
          </main>
        </div>
      </SidebarProvider>
    </ChatContext.Provider>
  );
};

export default Layout;
