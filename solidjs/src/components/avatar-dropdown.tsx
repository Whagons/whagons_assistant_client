import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useAuth } from "@/lib/auth-context";
import { useNavigate } from "@solidjs/router";
import { createEffect } from "solid-js";

interface AvatarDropdownProps {
    class?: string;
}

function AvatarDropdown(props: AvatarDropdownProps) {
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    createEffect(() => {
        console.log(currentUser());
    });

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase();
    };

    const handleClick = () => {
        navigate('/settings');
    };

    return (
        <div
            class={`w-[80%] border-2 border-border ring-1 ring-border/50 rounded-full cursor-pointer hover:bg-accent transition-colors ${props.class}`}
            onClick={handleClick}
        >
            <div class="flex items-center justify-between w-full px-3 py-1.5">
                <div class="flex items-center gap-2">
                    <Avatar>
                        <AvatarImage src={currentUser()?.photoURL || undefined} />
                        <AvatarFallback>
                            {currentUser()?.displayName ? getInitials(currentUser()?.displayName || '') : 'U'}
                        </AvatarFallback>
                    </Avatar>
                    <span class="text-sm font-medium">
                        {currentUser()?.displayName || 'User'}
                        <span class="text-[10px] text-muted-foreground block">@{currentUser()?.email?.split('@')[0] || 'user'}</span>
                    </span>
                </div>
            </div>
        </div>
    );
}

export default AvatarDropdown;