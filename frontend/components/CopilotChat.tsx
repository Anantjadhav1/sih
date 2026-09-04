"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askCopilot } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  text: string;
}

const GREETING: Message = {
  role: "assistant",
  text: "Ask me about this scenario — I read the current district and conversion level.",
};

/** One-tap prompts so a live demo never has to type. */
const SUGGESTIONS = [
  "Why did flood risk increase?",
  "Who is displaced?",
  "Cite the relevant policy",
];

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
      const reply = await askCopilot(text, districtId, zoneId);
      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
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
    <section className="flex min-h-0 flex-1 flex-col border-t border-border bg-surface-1">
      <header className="flex shrink-0 items-center gap-2 px-4 py-2.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-xs font-semibold">Policy Co-Pilot</h2>
        <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
          {districtName}
        </span>
      </header>

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
            {m.text}
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Consulting policy corpus&hellip;
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
    </section>
  );
}
