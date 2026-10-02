"use client";

import { useEffect, useRef, useState } from "react";
import { Blocks, BookOpen, ChevronDown, Satellite, Send, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askCopilot } from "@/lib/api";
import type { Citation } from "@/lib/api";
import { retrieveSources } from "@/lib/search";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
}

const GREETING: Message = {
  role: "assistant",
  text:
    "Ask me about this place. I check the research library, ISRO's survey data and " +
    "decisions sealed on the blockchain first, and show which sources I used.",
};

/** One-tap prompts so a live demo never has to type. */
const SUGGESTIONS = [
  "Why did flood risk increase?",
  "How has this area grown?",
  "Has anything been decided here?",
];

/** Where each kind of source comes from, in words a non-specialist follows. */
const SOURCE_KIND: Record<Citation["kind"], { icon: LucideIcon; label: string }> = {
  library: { icon: BookOpen, label: "Research library (sample entry)" },
  isro: { icon: Satellite, label: "ISRO survey data" },
  ledger: { icon: Blocks, label: "Blockchain ledger" },
};

export default function CopilotChat({
  districtId,
  districtName,
  zoneId = null,
}: {
  districtId: string;
  districtName: string;
  /** When set, the co-pilot answers about this zone rather than the district. */
  zoneId?: string | null;
}) {
  // Folded by default so the results stay the focus; one click opens it
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // A new scope is a new conversation - old answers describe a different place
  useEffect(() => {
    setMessages([GREETING]);
  }, [districtId, zoneId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setLoading(true);
    try {
      // Retrieve first: the library passages worth sending with the question
      const sources = retrieveSources(text).map((e) => ({
        id: e.id,
        title: e.title,
        org: e.org,
        date: e.date,
        text: e.description,
      }));
      const reply = await askCopilot(text, districtId, zoneId, sources);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: reply.response, citations: reply.citations },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Copilot backend unreachable. Check the FastAPI server on :8000.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className={cn(
        "flex shrink-0 flex-col border-t border-border bg-surface-1",
        open && "h-80"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex shrink-0 items-center gap-2 px-4 py-2.5 text-left hover:bg-accent/30"
      >
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold">Ask the AI Co-Pilot</span>
        <span className="text-[10px] text-muted-foreground">about {districtName}</span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform",
            !open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-2"
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[92%] rounded-lg px-3 py-2 text-xs leading-relaxed",
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "border border-border bg-surface-2/70 text-foreground"
            )}
          >
            {/* Answers keep their paragraph breaks: answer, then the evidence */}
            <p className="whitespace-pre-line">{m.text}</p>

            {/* Every numbered claim points at one of these */}
            {m.citations && m.citations.length > 0 && (
              <ol className="mt-2 space-y-1 border-t border-border pt-2">
                {m.citations.map((c) => {
                  const kind = SOURCE_KIND[c.kind];
                  return (
                    <li key={c.n} className="flex gap-1.5 text-[10px] leading-snug">
                      <span className="font-mono font-semibold text-primary">[{c.n}]</span>
                      <span className="min-w-0">
                        <span className="font-medium">{c.title}</span>
                        <span className="block text-muted-foreground">
                          <kind.icon className="mr-1 inline h-2.5 w-2.5 align-[-1px]" />
                          {kind.label} &middot; {c.detail}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Checking the evidence&hellip;
          </div>
        )}
      </div>

      {messages.length === 1 && (
        <div className="flex shrink-0 flex-wrap gap-1.5 px-4 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-border bg-surface-2/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2 border-t border-border p-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="Ask about this scenario…"
          className="h-9 border-0 bg-transparent text-xs shadow-none focus-visible:ring-0"
        />
        <Button
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          aria-label="Send message"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
        </>
      )}
    </section>
  );
}
