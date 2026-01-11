import { A, useNavigate } from '@solidjs/router';
import { Component, Show, createMemo, createSignal, onMount } from 'solid-js';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModeToggle } from '@/components/mode-toogle';
import { useAuth } from '@/lib/auth-context';
import { auth, signOut } from '@/lib/firebase';
import { authFetch } from '@/lib/utils';

const SettingsPage: Component = () => {
  const HOST = import.meta.env.VITE_CHAT_HOST;
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const displayName = createMemo(() => currentUser()?.displayName || 'User');
  const emailHandle = createMemo(() => currentUser()?.email?.split('@')[0] || 'user');

  // Admin gating via env list (comma-separated emails)
  const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((s: string) => s.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = createMemo(() => {
    const email = currentUser()?.email?.toLowerCase();
    return !!email && ADMIN_EMAILS.includes(email);
  });

  // Stats & models
  const [messageCount, setMessageCount] = createSignal<number | null>(null);
  const [sessionCount, setSessionCount] = createSignal<number | null>(null);
  const [lastActive, setLastActive] = createSignal<string | null>(null);
  const [models, setModels] = createSignal<string[]>([]);

  const handleClearMemories = async () => {
    const url = new URL(`${HOST}/chat/history`);
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      // Optionally, provide feedback to the user (e.g., a success message)
      alert('Chat history cleared!');
    } catch (error) {
      console.error('Failed to clear chat history:', error);
      alert('Failed to clear chat history.');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (e) {
      console.error('Sign out failed', e);
    }
  };

  onMount(async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      // Sessions and last active
      const resp = await authFetch(`${HOST}/api/v1/chats/users/${user.uid}/conversations`);
      if (resp.ok) {
        const data = await resp.json();
        const conversations = Array.isArray(data.conversations) ? data.conversations : [];
        setSessionCount(conversations.length || 0);
        const latest = conversations
          .map((c: any) => new Date(c.updated_at))
          .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0];
        if (latest) setLastActive(latest.toDateString());

        // Compute total messages by verifying each conversation
        const counts = await Promise.all(
          conversations.map(async (c: any) => {
            try {
              const r = await authFetch(`${HOST}/api/v1/chats/conversations/${c.id}/verify`);
              if (!r.ok) return 0;
              const d = await r.json();
              return Number(d.message_count) || 0;
            } catch {
              return 0;
            }
          })
        );
        const total = counts.reduce((a: number, b: number) => a + b, 0);
        setMessageCount(total);
      }

      // Models listing
      const mresp = await authFetch(`${HOST}/api/v1/chats/models`);
      if (mresp.ok) {
        const mdata = await mresp.json();
        const list = Array.isArray(mdata.models) ? mdata.models.map((m: any) => String(m)) : [];
        setModels(list);
      }
    } catch (e) {
      console.warn('Settings init failed', e);
    }
  });

  return (
    <div class="h-full w-full px-4 py-6">
      <div class="h-full max-w-6xl mx-auto">
        {/* Header */}
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <A href="/chat/" class="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
              <span class="text-sm">Back to Chat</span>
            </A>
            <span class="ml-2 text-xl font-semibold">Settings</span>
          </div>
          <div class="flex items-center gap-2">
            <ModeToggle />
            <button class="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent" onClick={handleSignOut}>Sign out</button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="account" class="w-full">
          <div class="flex items-center justify-between mb-6">
            <TabsList>
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="customization">Customization</TabsTrigger>
              <TabsTrigger value="history">History & Memory</TabsTrigger>
              <TabsTrigger value="models">Models</TabsTrigger>
              <TabsTrigger value="attachments">Attachments</TabsTrigger>
              <Show when={isAdmin()}>
                <TabsTrigger value="users">Users</TabsTrigger>
              </Show>
            </TabsList>
            <TabsIndicator />
          </div>

          {/* Account */}
          <TabsContent value="account">
            <div class="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Profile card */}
              <div class="md:col-span-8 bg-card/30 border border-border/60 rounded-2xl p-5 shadow-sm">
                <div class="text-sm text-muted-foreground mb-3">Profile</div>
                <div class="flex items-center gap-4">
                  <Avatar>
                    <AvatarImage src={currentUser()?.photoURL || undefined} />
                    <AvatarFallback>{displayName().slice(0,1)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div class="text-lg font-semibold">{displayName()}</div>
                    <div class="text-sm text-muted-foreground">{currentUser()?.email}</div>
                  </div>
                </div>
              </div>
              {/* Stat tiles */}
              <div class="md:col-span-4 grid grid-cols-3 md:grid-cols-3 gap-5">
                <div class="col-span-1 bg-card/30 border border-border/60 rounded-2xl p-5 text-center shadow-sm">
                  <div class="text-xs text-muted-foreground mb-1">Messages</div>
                  <div class="text-3xl md:text-4xl font-extrabold tracking-tight">{messageCount() ?? '—'}</div>
                </div>
                <div class="col-span-1 bg-card/30 border border-border/60 rounded-2xl p-5 text-center shadow-sm">
                  <div class="text-xs text-muted-foreground mb-1">Sessions</div>
                  <div class="text-3xl md:text-4xl font-extrabold tracking-tight">{sessionCount() ?? '—'}</div>
                </div>
                <div class="col-span-1 bg-card/30 border border-border/60 rounded-2xl p-5 text-center shadow-sm">
                  <div class="text-xs text-muted-foreground mb-1">Last Active</div>
                  <div class="text-base md:text-xl font-extrabold tracking-tight leading-tight whitespace-pre-line">{lastActive() ?? '—'}</div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Customization */}
          <TabsContent value="customization">
            <div class="space-y-4">
              <div class="bg-card/30 border border-border/60 rounded-2xl p-5 shadow-sm">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="font-medium">Theme</div>
                    <div class="text-sm text-muted-foreground">Toggle light/dark</div>
                  </div>
                  <ModeToggle />
                </div>
              </div>
              <div class="bg-card/30 border border-border/60 rounded-2xl p-5 shadow-sm">
                <div class="font-medium mb-1">Preferences</div>
                <div class="text-sm text-muted-foreground">More options coming soon.</div>
              </div>
            </div>
          </TabsContent>

          {/* History & Memory */}
          <TabsContent value="history">
            <div class="bg-card/30 border border-border/60 rounded-2xl p-5 shadow-sm">
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium">Chat history</div>
                  <div class="text-sm text-muted-foreground">Delete stored messages and context.</div>
                </div>
                <button class="px-3 py-2 rounded-md bg-destructive text-white hover:bg-destructive/90" onClick={handleClearMemories}>Clear Memories</button>
              </div>
            </div>
          </TabsContent>

          {/* Models */}
          <TabsContent value="models">
            <div class="grid gap-3 md:grid-cols-2">
              <div class="bg-card/30 border border-border/60 rounded-2xl p-5 shadow-sm">
                <div class="font-medium mb-1">Available Models</div>
                <Show when={models().length > 0} fallback={<div class="text-sm text-muted-foreground">Loading models…</div>}>
                  <ul class="text-sm list-disc ml-5 space-y-1 text-muted-foreground">
                    {models().map((m) => (
                      <li>{m}</li>
                    ))}
                  </ul>
                </Show>
              </div>
              <div class="bg-card/30 border border-border/60 rounded-2xl p-5 shadow-sm">
                <div class="font-medium mb-1">Tools</div>
                <ul class="text-sm list-disc ml-5 space-y-1 text-muted-foreground">
                  <li>Browsing</li>
                  <li>File attachments</li>
                  <li>Code interpreter</li>
                </ul>
              </div>
            </div>
          </TabsContent>

          {/* Attachments */}
          <TabsContent value="attachments">
            <div class="bg-card/30 border border-border/60 rounded-2xl p-5 shadow-sm">
              <div class="font-medium mb-1">Attachments</div>
              <div class="text-sm text-muted-foreground">Upload and manage files (coming soon).</div>
            </div>
          </TabsContent>

          {/* Users (admin-gated placeholder) */}
          <TabsContent value="users">
            <div class="bg-card/30 border border-border/60 rounded-2xl p-5 shadow-sm">
              <div class="font-medium mb-1">Users</div>
              <div class="text-sm text-muted-foreground">Admin-only view. Permissions to be implemented.</div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SettingsPage;
