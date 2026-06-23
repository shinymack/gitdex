"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { MessageCircle, Sparkles, X, RotateCcw } from "lucide-react";
import { Thread } from "./thread";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export const AssistantModal = ({ owner, repo }: { owner: string; repo: string }) => {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (open && isMobile) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open, isMobile]);

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: `${apiBaseUrl}/api/chat`,
      headers: {
        "x-github-owner": owner,
        "x-github-repo": repo,
      },
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime as any}>
      {/* Backdrop for mobile */}
      {open && isMobile && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <div
        className={cn(
          "fixed top-0 right-0 z-50 flex flex-col bg-popover border-l border-border shadow-2xl transition-transform duration-300 ease-in-out",
          // Desktop: full height sidebar, 480px wide
          "md:h-screen md:w-[480px]",
          // Mobile: full screen
          "h-screen w-full",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/30 shrink-0">
          <span className="font-medium text-foreground flex items-center gap-2 text-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            GitDex Assistant
            <span className="text-muted-foreground font-normal text-xs">
              {owner}/{repo}
            </span>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => runtime.thread.reset()}
              title="Clear chat history"
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
              aria-label="Clear chat"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Thread fills remaining space */}
        <div className="flex-1 min-h-0 flex flex-col">
          <Thread owner={owner} repo={repo} />
        </div>
      </div>

      {/* Trigger button - fixed bottom right, hidden when open on desktop */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-background border border-border shadow-lg text-sm font-medium text-foreground transition-all duration-200 hover:bg-muted hover:shadow-xl active:scale-95 group",
          open && "md:right-[496px]"
        )}
      >
        <MessageCircle className="h-4 w-4 text-primary group-hover:scale-110 transition-transform duration-200" />
        <span>{open ? "Close" : "Ask AI"}</span>
      </button>
    </AssistantRuntimeProvider>
  );
};
