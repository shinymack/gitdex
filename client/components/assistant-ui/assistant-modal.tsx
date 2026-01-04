"use client";

import { AssistantModalPrimitive, AssistantRuntimeProvider } from "@assistant-ui/react";
import { Thread } from "./thread";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { BotMessageSquare, Sparkles } from "lucide-react";


export const AssistantModal = ({ owner, repo }: { owner: string; repo: string }) => {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      headers: {
        "x-github-owner": owner,
        "x-github-repo": repo,
      },
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantModalPrimitive.Root>
        <AssistantModalPrimitive.Anchor className="fixed right-6 bottom-6 z-50">
          <AssistantModalPrimitive.Trigger asChild>
            <button className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-transform hover:scale-105 active:scale-95">
              <BotMessageSquare className="h-7 w-7" />
            </button>
          </AssistantModalPrimitive.Trigger>
        </AssistantModalPrimitive.Anchor>
        <AssistantModalPrimitive.Content
          sideOffset={16}
          // - Style: Standard solid background (Reverted glassmorphism)
          className="fixed bottom-6 right-6 h-[85vh] w-[90vw] max-w-[450px] overflow-hidden rounded-2xl border bg-popover shadow-2xl sm:right-7 sm:w-[450px] z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:fade-in data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/50">
              <span className="font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                GitDex Assistant
              </span>
            </div>
            <Thread />
          </div>
        </AssistantModalPrimitive.Content>
      </AssistantModalPrimitive.Root>
    </AssistantRuntimeProvider>
  );
};
