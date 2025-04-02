import {
  MessageSquare,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Link } from "react-router-dom";
import { useChatContext } from "@/layout";

// // Menu items.
// const items = [
//   // {
//   //   title: "Home",
//   //   url: "#",
//   //   icon: Home,
//   // },
//   // {
//   //   title: "Inbox",
//   //   url: "#",
//   //   icon: Inbox,
//   // },
//   // {
//   //   title: "Calendar",
//   //   url: "#",
//   //   icon: Calendar,
//   // },
//   // {
//   //   title: "Search",
//   //   url: "#",
//   //   icon: Search,
//   // },
//   {
//     title: "Settings",
//     url: "/settings",
//     icon: Settings,
//   },
// ];





export function AppSidebar() {
  const { chats } = useChatContext();
  const { setOpenMobile } = useSidebar();

  // Group chats by age
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const lastMonth = new Date(today);
  lastMonth.setDate(lastMonth.getDate() - 30);

  const currentYear = today.getFullYear();

  // Group chats by time periods
  const groupedChats = {
    today: chats.filter(chat => new Date(chat.created_at) >= today),
    yesterday: chats.filter(chat => {
      const chatDate = new Date(chat.created_at);
      return chatDate >= yesterday && chatDate < today;
    }),
    lastWeek: chats.filter(chat => {
      const chatDate = new Date(chat.created_at);
      return chatDate >= lastWeek && chatDate < yesterday;
    }),
    lastMonth: chats.filter(chat => {
      const chatDate = new Date(chat.created_at);
      return chatDate >= lastMonth && chatDate < lastWeek;
    }),
    byMonth: chats.filter(chat => {
      const chatDate = new Date(chat.created_at);
      return chatDate.getFullYear() === currentYear && chatDate < lastMonth;
    }),
    byYear: chats.filter(chat => {
      const chatDate = new Date(chat.created_at);
      return chatDate.getFullYear() < currentYear;
    })
  };

  // Group chats by month for the current year
  const monthlyGroups = groupedChats.byMonth.reduce((acc, chat) => {
    const date = new Date(chat.created_at);
    const month = date.toLocaleString('default', { month: 'long' });
    if (!acc[month]) {
      acc[month] = [];
    }
    acc[month].push(chat);
    return acc;
  }, {} as Record<string, typeof groupedChats.byMonth>);

  // Group chats by year for older chats
  const yearlyGroups = groupedChats.byYear.reduce((acc, chat) => {
    const year = new Date(chat.created_at).getFullYear();
    if (!acc[year]) {
      acc[year] = [];
    }
    acc[year].push(chat);
    return acc;
  }, {} as Record<string, typeof groupedChats.byYear>);

  const renderChatSection = (title: string, chats: typeof groupedChats.today) => {
    if (chats.length === 0) return null;
    
    return (
      <div className="mb-4">
        <SidebarGroupLabel className="text-sm font-medium text-gray-500 dark:text-gray-400 px-3 mb-2">
          {title}
        </SidebarGroupLabel>
        <SidebarMenu className="space-y-1">
          {chats.map((chat) => (
            <SidebarMenuItem key={chat.id}>
              <SidebarMenuButton asChild>
                <Link
                  to={`/chat/${chat.id}`}
                  onClick={() => setOpenMobile(false)}
                  className="flex items-center gap-2 px-3 py-2 text-base md:text-sm font-medium text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <MessageSquare className="h-5 w-5 md:h-4 md:w-4" />
                  <span className="truncate">{chat.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </div>
    );
  };
  
  return (
    <Sidebar>
      <SidebarContent className="bg-[#e9ecef] dark:bg-[#15202b]">
        <SidebarGroup>
          <div className="flex items-center justify-between p-3">
            <SidebarGroupLabel className="text-base font-medium">Chats</SidebarGroupLabel>
            <a href="/">
              <button className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors">
                + New Chat
              </button>
            </a>
          </div>
          <SidebarGroupContent>
            <div className="max-h-[90vh] overflow-y-auto scrollbar">
              {renderChatSection("Today", groupedChats.today)}
              {renderChatSection("Yesterday", groupedChats.yesterday)}
              {renderChatSection("Last 7 Days", groupedChats.lastWeek)}
              {renderChatSection("Last 30 Days", groupedChats.lastMonth)}
              {Object.entries(monthlyGroups)
                .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
                .map(([month, chats]) => renderChatSection(month, chats))}
              {Object.entries(yearlyGroups)
                .sort(([a], [b]) => Number(b) - Number(a))
                .map(([year, chats]) => renderChatSection(year, chats))}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
