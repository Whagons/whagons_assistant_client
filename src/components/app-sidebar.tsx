import { useState, useEffect, useMemo, useCallback } from "react";
import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { Link, useParams, useNavigate } from "react-router-dom";

import AvatarDropdown from "./avatar-dropdown";
import { useChatContext } from "@/layout";
import { MessageCache, ConversationCache, Conversation } from "@/aichat/utils/memory_cache";
import { HOST } from "@/aichat/utils/utils";
import { authFetch } from "@/lib/utils";

export function AppSidebar() {
  const { chats, setChats } = useChatContext();
  const params = useParams();
  const navigate = useNavigate();
  const currentChatId = params.id;

  const [pinnedChatIds, setPinnedChatIds] = useState<string[]>([]);
  const [confirmDeleteChatId, setConfirmDeleteChatId] = useState<string | null>(null);

  // Load pinned chats from localStorage on mount
  useEffect(() => {
    try {
      const storedPinnedIds = localStorage.getItem('pinnedChatIds');
      if (storedPinnedIds) {
        setPinnedChatIds(JSON.parse(storedPinnedIds));
      }
    } catch (error) {
      console.error("Error loading pinned chats from localStorage:", error);
      localStorage.removeItem('pinnedChatIds');
    }
  }, []);

  // Save pinned chats to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('pinnedChatIds', JSON.stringify(pinnedChatIds));
    } catch (error) {
      console.error("Error saving pinned chats to localStorage:", error);
    }
  }, [pinnedChatIds]);

  // Group chats by time periods
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const yesterday = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d;
  }, [today]);

  const lastWeek = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 7);
    return d;
  }, [today]);

  const lastMonth = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return d;
  }, [today]);

  const currentYear = today.getFullYear();

  // Filter non-pinned chats
  const nonPinnedChats = useMemo(() => 
    chats.filter(chat => !pinnedChatIds.includes(chat.id)),
    [chats, pinnedChatIds]
  );

  // Helper to get date from chat (fallback to updated_at if created_at is missing)
  const getChatDate = (chat: { created_at?: string; updated_at: string }) => 
    new Date(chat.created_at || chat.updated_at);

  // Group chats
  const groupedChats = useMemo(() => ({
    today: nonPinnedChats.filter((chat) => getChatDate(chat) >= today),
    yesterday: nonPinnedChats.filter((chat) => {
      const chatDate = getChatDate(chat);
      return chatDate >= yesterday && chatDate < today;
    }),
    lastWeek: nonPinnedChats.filter((chat) => {
      const chatDate = getChatDate(chat);
      return chatDate >= lastWeek && chatDate < yesterday;
    }),
    lastMonth: nonPinnedChats.filter((chat) => {
      const chatDate = getChatDate(chat);
      return chatDate >= lastMonth && chatDate < lastWeek;
    }),
    byMonth: nonPinnedChats.filter((chat) => {
      const chatDate = getChatDate(chat);
      return chatDate.getFullYear() === currentYear && chatDate < lastMonth;
    }),
    byYear: nonPinnedChats.filter((chat) => {
      const chatDate = getChatDate(chat);
      return chatDate.getFullYear() < currentYear;
    }),
  }), [nonPinnedChats, today, yesterday, lastWeek, lastMonth, currentYear]);

  const pinnedChats = useMemo(() => 
    chats.filter(chat => pinnedChatIds.includes(chat.id))
         .sort((a, b) => pinnedChatIds.indexOf(a.id) - pinnedChatIds.indexOf(b.id)),
    [chats, pinnedChatIds]
  );

  // Group by month
  const monthlyGroups = useMemo(() => {
    return groupedChats.byMonth.reduce<Record<string, Conversation[]>>(
      (acc, chat) => {
        const date = getChatDate(chat);
        const month = date.toLocaleString("default", { month: "long" });
        if (!acc[month]) {
          acc[month] = [];
        }
        acc[month].push(chat);
        return acc;
      },
      {}
    );
  }, [groupedChats.byMonth]);

  // Group by year
  const yearlyGroups = useMemo(() => {
    return groupedChats.byYear.reduce<Record<number, Conversation[]>>(
      (acc, chat) => {
        const year = getChatDate(chat).getFullYear();
        if (!acc[year]) {
          acc[year] = [];
        }
        acc[year].push(chat);
        return acc;
      },
      {}
    );
  }, [groupedChats.byYear]);

  // Handlers
  const pinChat = useCallback((chatId: string) => {
    setPinnedChatIds(prev => {
      if (prev.length < 10 && !prev.includes(chatId)) {
        return [...prev, chatId];
      }
      return prev;
    });
  }, []);

  const unpinChat = useCallback((chatId: string) => {
    setPinnedChatIds(prev => prev.filter(id => id !== chatId));
  }, []);

  const deleteChat = useCallback(async (chatToDelete: Conversation) => {
    const originalChats = [...chats];
    const originalPinnedIds = [...pinnedChatIds];
    const chatId = chatToDelete.id;

    // Optimistic UI Update
    setChats(prev => prev.filter(chat => chat.id !== chatId));
    setPinnedChatIds(prev => prev.filter(id => id !== chatId));

    try {
      const response = await authFetch(`${HOST}/api/v1/chats/conversations/${chatId}`, { 
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete: ${response.status}`);
      }

      // Clear caches
      await ConversationCache.delete(chatId);
      sessionStorage.removeItem(`messages-${chatId}`);

      // Navigate away if current chat was deleted
      if (currentChatId === chatId) {
        navigate("/chat/");
      }

    } catch (error) {
      console.error("Error deleting chat:", error);
      alert(`Failed to delete chat: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Rollback
      setChats(originalChats);
      setPinnedChatIds(originalPinnedIds);
    }
  }, [chats, pinnedChatIds, currentChatId, navigate, setChats]);

  const renderChatSection = (title: string, chatsToRender: Conversation[]) => {
    if (chatsToRender.length === 0) return null;

    return (
      <div className="mb-4">
        <div className="text-xs font-bold text-gray-700 dark:text-gray-400 px-3 mb-2">
          {title}
        </div>
        <div className="space-y-1">
          {chatsToRender.map((chat) => (
            <div key={chat.id} className="group/menu-item relative">
              <Link
                to={`/chat/${chat.id}`}
                className={`group/link relative flex items-center gap-2 pl-3 pr-10 py-2 text-base md:text-[13px] font-medium rounded-md hover:bg-white dark:hover:bg-gray-700 w-full overflow-hidden transition-colors ${
                  currentChatId === chat.id
                    ? "bg-white dark:bg-gray-700"
                    : "text-[#696a6a] dark:text-gray-200"
                }`}
              >
                <span className="truncate font-bold">{chat.title}</span>
              </Link>
              
              {/* Hover buttons */}
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end text-gray-500 dark:text-gray-400 transition-transform transform translate-x-[102%] group-hover/menu-item:translate-x-0 group-hover/menu-item:pointer-events-auto">
                <div className="relative z-10 flex items-center pr-1 bg-transparent rounded-r-md gap-1">
                  {pinnedChatIds.includes(chat.id) ? (
                    <button
                      className="rounded-md p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                      title="Unpin chat"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); unpinChat(chat.id); }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="2" x2="22" y1="2" y2="22"/>
                        <path d="M12 17v5"/>
                        <path d="M9 14v-4"/>
                        <path d="M15 14v-4"/>
                        <path d="M9 5h6"/>
                        <path d="M16 7l1 5v3H7v-3l1-5"/>
                      </svg>
                    </button>
                  ) : (
                    <button
                      className="rounded-md p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                      title="Pin chat"
                      disabled={pinnedChatIds.length >= 10}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); pinChat(chat.id); }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 17v5"/>
                        <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
                      </svg>
                    </button>
                  )}
                  <button
                    className="rounded-md p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600"
                    title="Delete chat"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteChatId(chat.id); }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18"/>
                      <path d="m6 6 12 12"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const chatToDelete = useMemo(() => {
    if (!confirmDeleteChatId) return null;
    return chats.find(chat => chat.id === confirmDeleteChatId) || null;
  }, [confirmDeleteChatId, chats]);

  return (
    <>
      <Sidebar collapsible="offcanvas" side="left" variant="sidebar">
        <SidebarContent className="bg-sidebar flex flex-col h-screen">
          <div className="p-3 flex flex-col items-center">
            <svg className="h-[50px] w-auto text-gray-900 dark:text-white" viewBox="0 0 43 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g clipPath="url(#clip0_312_7)">
                <path d="M1.2002 2.20001C0.600195 2.20001 0.200195 1.80001 0.200195 1.20001C0.200195 0.600012 0.700195 0.200012 1.2002 0.200012C1.8002 0.200012 2.2002 0.600012 2.2002 1.20001C2.2002 1.80001 1.8002 2.20001 1.2002 2.20001Z" fill="currentColor"/>
                <path d="M0.7998 0.19998C1.2998 0.0999803 1.8998 0.39998 1.9998 0.999981C2.0998 1.49998 1.7998 2.09998 1.1998 2.19998C0.699802 2.29998 0.0998011 1.99998 -0.000198857 1.39998C-0.100199 0.89998 0.2998 0.39998 0.7998 0.19998ZM24.5998 10.3C23.9998 10.3 23.5998 10.7 23.5998 11.3C23.5998 11.9 24.0998 12.3 24.5998 12.3C25.1998 12.3 25.5998 11.9 25.5998 11.3C25.5998 10.8 25.0998 10.3 24.5998 10.3Z" fill="currentColor"/>
                <path d="M29.9 16.6C31.6 13.7 34 8.3 34.9 6.2L38.25 13.45L41.6 20.7V20.8H42.5L34.9 4.2L34.5 5.1C34.4 5.4 31.2 12.8 29.1 16.3C27.3 19.4 24.9 20.9 21.6 20.9C17.2 20.9 13.6 17.3 13.6 13C13.6 8.7 17.2 5.1 21.6 5.1C24.3 5.1 26.9 6.5 28.4 8.7H29.4C27.8 5.9 24.9 4.2 21.7 4.3C16.8 4.3 12.8 8.2 12.8 13C12.8 17.8 16.8 21.7 21.7 21.7C25.3 21.6 27.9 20 29.9 16.6ZM1.8 5.5C3.9 6.9 9.7 11.5 11.8 20.6V20.7H12.7V20.5C10.1 9 1.7 4.3 1.6 4.3L1 4V20.8H1.9L1.8 5.5Z" fill="currentColor"/>
              </g>
              <defs>
                <clipPath id="clip0_312_7">
                  <rect width="43" height="22" fill="currentColor"/>
                </clipPath>
              </defs>
            </svg>
            <Link
              to="/chat/"
              className="rounded-md px-3 py-2 mt-5 text-sm font-medium w-full text-white gradient-button transition-colors block text-center"
            >
              + New Chat
            </Link>
          </div>
          
          <div className="flex-1 overflow-hidden">
            <div className="h-full overflow-y-auto overflow-x-hidden scrollbar p-2">
              {renderChatSection("Pinned", pinnedChats)}
              {renderChatSection("Today", groupedChats.today)}
              {renderChatSection("Yesterday", groupedChats.yesterday)}
              {renderChatSection("Last 7 Days", groupedChats.lastWeek)}
              {renderChatSection("Last 30 Days", groupedChats.lastMonth)}
              
              {Object.entries(monthlyGroups)
                .sort(([aMonth], [bMonth]) => 
                  new Date(`1 ${bMonth} 2000`).getMonth() - new Date(`1 ${aMonth} 2000`).getMonth()
                )
                .map(([month, monthChats]) => (
                  <div key={month}>{renderChatSection(month, monthChats)}</div>
                ))}
              
              {Object.entries(yearlyGroups)
                .sort(([a], [b]) => Number(b) - Number(a))
                .map(([year, yearChats]) => (
                  <div key={year}>{renderChatSection(String(year), yearChats)}</div>
                ))}
            </div>
          </div>
          
          <div className="p-4 mt-auto">
            <AvatarDropdown className="w-full" />
          </div>
        </SidebarContent>
      </Sidebar>

      {/* Delete confirmation dialog */}
      {chatToDelete && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setConfirmDeleteChatId(null)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 m-4 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Confirm Deletion
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              Are you sure you want to delete the chat "<span className="font-medium">{chatToDelete.title}</span>"?
              This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setConfirmDeleteChatId(null)}
                className="px-4 py-2 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteChat(chatToDelete);
                  setConfirmDeleteChatId(null);
                }}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
