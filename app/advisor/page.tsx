"use client";

import { useEffect, useRef, useState } from "react";
import { TopAppBar } from "@/components/TopAppBar";
import { NailGrid } from "@/components/NailGrid";
import { Button } from "@/components/ui/Button";
import type { Nail } from "@/lib/types";

// The conversation is stored server-side (Neon). Each bot turn may pin a grid
// of REAL designs; we just render what the server returns.
type Turn = { role: "user" | "bot"; text: string; designs?: Nail[] };

function greeting(username?: string | null): Turn {
  return {
    role: "bot",
    text: `Hi ${username ? username : "there"}! I'm your personal nail stylist 💕 What's the occasion you're getting your nails done for (party, wedding, work, everyday…)? You can chat in English, Tiếng Việt, or Español.`,
  };
}

export default function AdvisorPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [username, setUsername] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Restore the conversation from the server on mount (survives refresh).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/advisor");
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        setUsername(data.username ?? null);
        setTurns(
          Array.isArray(data.turns) && data.turns.length ? data.turns : [greeting(data.username)],
        );
      } catch {
        if (active) setTurns([greeting()]);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, loading]);

  async function send() {
    const text = draft.trim();
    if (!text || loading) return;
    setTurns((t) => [...t, { role: "user", text }]);
    setDraft("");
    setLoading(true);
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json().catch(() => ({}));
      setTurns((t) => [
        ...t,
        {
          role: "bot",
          text: data.reply ?? "Sorry, I didn't catch that — could you say it again? 💕",
          designs: Array.isArray(data.designs) ? data.designs : undefined,
        },
      ]);
    } catch {
      setTurns((t) => [
        ...t,
        { role: "bot", text: "Network hiccup — please try again 🥲" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function restart() {
    setLoading(true);
    try {
      await fetch("/api/advisor", { method: "DELETE" });
    } catch {
      /* ignore */
    }
    setTurns([greeting(username)]);
    setDraft("");
    setLoading(false);
  }

  return (
    <div className="flex min-h-full flex-col">
      <TopAppBar title="AI Advisor" />

      <div className="flex-1 px-4 py-4">
        <div className="flex flex-col gap-3">
          {turns.map((t, i) =>
            t.role === "bot" ? (
              <div key={i} className="flex flex-col gap-3">
                <Bubble role="bot" text={t.text} />
                {t.designs && t.designs.length > 0 && <NailGrid nails={t.designs} />}
              </div>
            ) : (
              <Bubble key={i} role="user" text={t.text} />
            ),
          )}
          {(loading || !loaded) && <Typing />}
        </div>
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 border-t border-[var(--color-line)] bg-[var(--color-page)]/95 p-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Ignore Enter while an IME (e.g. Vietnamese) is composing.
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Tell me what you're looking for…"
            className="h-11 flex-1 rounded-full border border-[var(--color-line)] bg-white px-4 text-sm outline-none focus:border-accent"
            autoFocus
          />
          <Button onClick={send} disabled={!draft.trim() || loading}>
            Send
          </Button>
        </div>
        {turns.length > 1 && (
          <button
            type="button"
            onClick={restart}
            className="mt-2 w-full text-center text-xs font-medium text-[var(--color-muted)] underline"
          >
            Start over
          </button>
        )}
      </div>
    </div>
  );
}

function Bubble({ role, text }: { role: "bot" | "user"; text: string }) {
  const isBot = role === "bot";
  return (
    <div className={`flex ${isBot ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
          isBot
            ? "rounded-tl-sm bg-white text-[var(--color-ink)] shadow-[var(--shadow-card)]"
            : "rounded-tr-sm bg-accent text-white"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-[var(--shadow-card)]">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-muted)] [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-muted)] [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--color-muted)]" />
      </div>
    </div>
  );
}
