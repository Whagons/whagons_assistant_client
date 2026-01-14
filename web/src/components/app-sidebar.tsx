import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { Link } from "react-router-dom";
import NCALogo from "@/assets/NCALogo";
import AvatarDropdown from "./avatar-dropdown";

export function AppSidebar() {
  return (
    <Sidebar collapsible="offcanvas" side="left" variant="sidebar">
      <SidebarContent className="bg-sidebar flex flex-col h-screen">
        <div className="p-3 flex flex-col items-center">
          <NCALogo
            fill="#535353"
            darkFill="#d1d5db"
            width={180}
            height={50}
          />
          <Link
            to="/chat/"
            className="rounded-md px-3 py-2 mt-5 text-sm font-medium w-full text-white gradient-button transition-colors block text-center"
          >
            + New Chat
          </Link>
        </div>
        
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto overflow-x-hidden scrollbar p-2">
            <p className="text-sm text-gray-500 p-4">Chat history will appear here</p>
          </div>
        </div>
        
        <div className="p-4 mt-auto">
          <AvatarDropdown className="w-full" />
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
