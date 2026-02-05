"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/cn";
import { motion } from "motion/react";

export function ChatPanel({
  personId,
  personName,
  stageId,
  stageTitle,
  onClose,
}: {
  personId: Id<"persons">;
  personName: string;
  stageId: Id<"stages">;
  stageTitle: string;
  onClose: () => void;
}) {
  const chatData = useQuery(api.persons.getChatSessionMessages, {
    personId,
    stageId,
  });
  const sendChat = useAction(api.persons.sendStageChat);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = chatData?.messages ?? [];
  const sessionId = chatData?.sessionId as Id<"chatSessions"> | null;

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape key to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || sending) return;

      setSending(true);
      setInput("");
      try {
        await sendChat({
          personId,
          stageId,
          message: text,
          sessionId: sessionId ?? undefined,
        });
      } catch {
        // Error is shown in UI through the failed message state
      } finally {
        setSending(false);
      }
    },
    [input, sending, sendChat, personId, stageId, sessionId],
  );

  // Parse title for display
  const titleMatch = stageTitle.match(/^\[.+?\]\s*-\s*(.+)$/);
  const shortTitle = titleMatch?.[1] ?? stageTitle;

  return (
    <motion.div
      ref={panelRef}
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l-3 border-[var(--frame)] bg-[var(--panel)] sm:w-[420px]"
      role="dialog"
      aria-label={`Chat about ${shortTitle}`}
    >
      {/* ── Header ───────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b-2 border-[var(--frame)] px-4 py-3">
        <button
          onClick={onClose}
          aria-label="Close chat panel"
          className="flex size-8 items-center justify-center rounded-lg border-2 border-[var(--frame)] bg-white transition hover:bg-[var(--paper)]"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M11 3L3 11M3 3L11 11"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{personName}</p>
          <p className="truncate text-xs text-[var(--muted)]">{shortTitle}</p>
        </div>
      </div>

      {/* ── Messages ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !sending && (
          <div className="py-12 text-center">
            <p className="text-pretty text-sm text-[var(--muted)]">
              Ask a question about {personName} during this era. Responses are
              grounded in source evidence.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg: {
            _id: string;
            role: "user" | "assistant";
            content: string;
            citations: string[];
            usedFallback: boolean;
            createdAt: number;
          }) => (
            <ChatMessage key={msg._id} message={msg} />
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="speech-bubble max-w-[85%]">
                <div className="flex gap-1.5">
                  <span className="skeleton size-2 rounded-full" />
                  <span className="skeleton size-2 rounded-full" />
                  <span className="skeleton size-2 rounded-full" />
                </div>
              </div>
            </div>
          )}
        </div>

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="border-t-2 border-[var(--frame)] px-4 py-3"
      >
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="chat-input">
            Message
          </label>
          <textarea
            ref={inputRef}
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={`Ask about ${personName}...`}
            rows={1}
            className="flex-1 resize-none rounded-xl border-2 border-[var(--frame)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label="Send message"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--frame)] bg-[var(--accent)] text-white transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M14 2L7 9M14 2L10 14L7 9M14 2L2 6L7 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </form>
    </motion.div>
  );
}

function ChatMessage({
  message,
}: {
  message: {
    _id: string;
    role: "user" | "assistant";
    content: string;
    citations: string[];
    usedFallback: boolean;
  };
}) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className="max-w-[85%] space-y-2">
        <div
          className={cn(
            "speech-bubble",
            isUser && "speech-bubble--right speech-bubble--user",
          )}
        >
          <p className="whitespace-pre-wrap text-pretty text-sm leading-relaxed">
            {message.content}
          </p>
        </div>

        {/* Fallback banner */}
        {!isUser && message.usedFallback && (
          <div className="fallback-banner">
            Cross-stage retrieval was used — evidence for this specific era was
            limited.
          </div>
        )}

        {/* Citations */}
        {!isUser && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {message.citations.map((cite, i) => (
              <span key={i} className="source-badge">
                [{i + 1}] {cite.split(" — ")[0]}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
