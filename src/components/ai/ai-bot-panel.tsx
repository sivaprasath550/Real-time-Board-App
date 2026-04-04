"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AiNote = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function AiBotPanel({
  open,
  onClose,
  boardId,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  onToast?: (msg: string) => void;
}) {
  const [notes, setNotes] = useState<AiNote[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const toast = (msg: string) => onToast?.(msg);

  const visible = open && !!boardId;

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setLoading(false);
    setNotes([]);
    setMessages([]);
    setInput("");
    setActiveNoteId(null);

    void (async () => {
      try {
        const res = await fetch(`/api/ai/notes?boardId=${encodeURIComponent(boardId)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { notes: AiNote[] };
        setNotes(data.notes ?? []);
      } catch {
        /* ignore */
      }
    })();
  }, [visible, boardId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, notes.length]);

  const quoteNote = (note: AiNote) => {
    const quote = `\n\n[Note from BoardBot: ${note.title}]\n${note.content}\n`;
    setInput((v) => (v.trim().length ? v + quote : `[Ask BoardBot about: ${note.title}]` + quote));
    setActiveNoteId(note.id);
  };

  const send = async () => {
    if (!input.trim()) return;
    if (loading) return;
    setLoading(true);
    setError(null);

    const userMsg: ChatMessage = {
      id: newId(),
      role: "user",
      content: input.trim(),
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);

    const payload = { boardId, message: userMsg.content };
    setInput("");

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : "AI request failed";
        setError(msg);
        toast?.(msg);
        setLoading(false);
        return;
      }

      const assistant: ChatMessage = {
        id: newId(),
        role: "assistant",
        content: String(data.answer ?? ""),
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, assistant]);

      const notesAdded = (data.notesAdded ?? []) as AiNote[];
      if (notesAdded.length) {
        setNotes((n) => [...notesAdded, ...n].slice(0, 30));
        toast?.(`BoardBot added ${notesAdded.length} note(s)`);
      }
    } finally {
      setLoading(false);
    }
  };

  const onOverlayClick = () => onClose();

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-stretch justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="BoardBot"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onOverlayClick} />
      <div className="relative flex h-full w-full max-w-[420px] flex-col border-l border-white/10 bg-[#0b0f19]/95 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/20 ring-1 ring-indigo-400/25">
              <Bot className="h-4 w-4 text-indigo-200" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">BoardBot</p>
              <p className="text-xs text-slate-300/80">Ask for notes, actions & clarity</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" type="button" onClick={onClose} className="h-9 w-9 rounded-xl p-0">
            ✕
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {notes.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300/70">AI Notes</p>
                <span className="text-[11px] text-slate-300/60">{notes.length} saved</span>
              </div>
              <div className="space-y-2">
                {notes.slice(0, 10).map((n) => (
                  <Card
                    key={n.id}
                    className={cn(
                      "cursor-pointer p-3 transition-colors",
                      activeNoteId === n.id ? "border-indigo-400/40 bg-indigo-500/10" : "border-white/10 bg-white/5",
                    )}
                    onClick={() => setActiveNoteId(n.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{n.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-200/70">{n.content}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        className="h-8 w-8 shrink-0 rounded-xl p-0 text-white/80 hover:text-white"
                        title="Insert into prompt"
                        onClick={(e) => {
                          e.stopPropagation();
                          quoteNote(n);
                        }}
                      >
                        +
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {messages.length > 0 ? (
            <div className="space-y-2">
              {messages.slice(-12).map((m) => (
                <div key={m.id} className={cn("rounded-2xl border p-3", m.role === "user" ? "border-indigo-400/25 bg-indigo-500/10" : "border-white/10 bg-white/5")}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300/70">
                    {m.role === "user" ? "You" : "BoardBot"}
                  </div>
                  <pre className="mt-1 whitespace-pre-wrap text-sm text-slate-100/90">{m.content}</pre>
                </div>
              ))}
              {loading && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center gap-2 text-sm text-slate-200/80">
                    <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-200/85">Try one:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  "Generate 5 demo-ready improvements for this whiteboard",
                  "Make a checklist for what judges will ask and how to answer",
                  "Summarize the board into action items and risks",
                ].map((q) => (
                  <Button
                    key={q}
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-9 rounded-xl bg-white/5"
                    onClick={() => setInput(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-white/10 p-4">
          {error && <p className="mb-2 text-sm text-red-300">{error}</p>}
          <div className="flex items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={boardId ? "Ask BoardBot for notes..." : "Open a board first"}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <Button type="button" variant="primary" size="sm" disabled={loading || !input.trim()} onClick={() => void send()} className="shrink-0">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
              <span className="hidden sm:inline">Send</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

