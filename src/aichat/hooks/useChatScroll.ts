import { useState, useRef, useCallback } from "react";

export interface UseChatScrollReturn {
  chatContainerRef: React.RefObject<HTMLDivElement>;
  inputContainerRef: React.RefObject<HTMLDivElement>;
  showScrollToBottom: boolean;
  scrollBtnLeft: number | undefined;
  scrollPositions: Record<string, number>;
  scrollToBottom: () => void;
  instantScrollToBottom: () => void;
  scrollContainerToBottom: () => void;
  saveScrollPosition: (conversationId: string) => void;
  updateScrollBottomVisibility: () => void;
  updateScrollButtonPosition: () => void;
}

export function useChatScroll(): UseChatScrollReturn {
  const chatContainerRef = useRef<HTMLDivElement>(null!);
  const inputContainerRef = useRef<HTMLDivElement>(null!);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [scrollBtnLeft, setScrollBtnLeft] = useState<number | undefined>(undefined);
  const [scrollPositions, setScrollPositions] = useState<Record<string, number>>({});

  const scrollToBottom = useCallback(() => {
    const lastUser = document.getElementById("last-user-message");
    const target = lastUser || document.getElementById("last-message");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const instantScrollToBottom = useCallback(() => {
    const lastUser = document.getElementById("last-user-message");
    const target = lastUser || document.getElementById("last-message");
    if (target) {
      target.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, []);

  const scrollContainerToBottom = useCallback(() => {
    if (!chatContainerRef.current) return;
    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    setShowScrollToBottom(false);
  }, []);

  const updateScrollButtonPosition = useCallback(() => {
    try {
      const rect = inputContainerRef.current?.getBoundingClientRect();
      if (rect) {
        setScrollBtnLeft(rect.left + rect.width / 2);
      }
    } catch {}
  }, []);

  const updateScrollBottomVisibility = useCallback(() => {
    if (!chatContainerRef.current) return;
    const distanceFromBottom =
      chatContainerRef.current.scrollHeight -
      chatContainerRef.current.scrollTop -
      chatContainerRef.current.clientHeight;
    setShowScrollToBottom(distanceFromBottom > 120);
    updateScrollButtonPosition();
  }, [updateScrollButtonPosition]);

  const saveScrollPosition = useCallback(
    (conversationId: string) => {
      if (chatContainerRef.current && conversationId) {
        setScrollPositions((prev) => ({
          ...prev,
          [conversationId]: chatContainerRef.current!.scrollTop,
        }));
      }
    },
    []
  );

  return {
    chatContainerRef,
    inputContainerRef,
    showScrollToBottom,
    scrollBtnLeft,
    scrollPositions,
    scrollToBottom,
    instantScrollToBottom,
    scrollContainerToBottom,
    saveScrollPosition,
    updateScrollBottomVisibility,
    updateScrollButtonPosition,
  };
}
