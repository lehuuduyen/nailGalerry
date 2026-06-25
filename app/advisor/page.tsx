"use client";

import { useEffect, useRef, useState } from "react";
import { TopAppBar } from "@/components/TopAppBar";
import { NailGrid } from "@/components/NailGrid";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { chatAdvisor, type AdvisorProfile, type AdvisorResult } from "@/lib/ai";
import { ELEMENT_VI } from "@/lib/fengshui";
import { useLibrary } from "@/lib/store";

// A "result" message is an inline marker that renders the recommendations
// at that point in the conversation, so later chat flows below the designs.
type Message = { role: "bot" | "user" | "result"; text?: string };

const GREETING = "Hi! I’m your personal nail stylist 💕 What should I call you?";

export default function AdvisorPage() {
  const { published: nails } = useLibrary();
  const [messages, setMessages] = useState<Message[]>([{ role: "bot", text: GREETING }]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<Partial<AdvisorProfile>>({});
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, result, loading]);

  async function send() {
    const text = draft.trim();
    if (!text || loading) return;
    const history: Message[] = [...messages, { role: "user", text }];
    setMessages(history);
    setDraft("");
    setLoading(true);

    let data: {
      reply?: string;
      name?: string;
      birthYear?: number;
      favoriteColor?: string;
      occasion?: string;
      ready?: boolean;
    } = {};
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      data = await res.json();
    } catch {
      data = { reply: "Sorry, I had a hiccup — could you try again?" };
    }
    setLoading(false);

    setMessages((m) => [...m, { role: "bot", text: data.reply ?? "Tell me a little more!" }]);

    // Merge any facts the model gathered this turn.
    const merged: Partial<AdvisorProfile> = {
      name: data.name ?? profile.name,
      birthYear: data.birthYear ?? profile.birthYear,
      favoriteColor: data.favoriteColor ?? profile.favoriteColor,
      occasion: data.occasion ?? profile.occasion,
    };
    setProfile(merged);

    if (
      data.ready &&
      !result &&
      merged.name &&
      merged.birthYear &&
      merged.favoriteColor &&
      merged.occasion
    ) {
      setResult(chatAdvisor(merged as AdvisorProfile, nails));
      // Pin the designs into the conversation flow so further chat stays below.
      setMessages((m) => [...m, { role: "result" }]);
    }
  }

  function restart() {
    setMessages([{ role: "bot", text: GREETING }]);
    setDraft("");
    setProfile({});
    setResult(null);
  }

  return (
    <div className="flex min-h-full flex-col">
      <TopAppBar title="AI Advisor" />

      <div className="flex-1 px-4 py-4">
        <div className="flex flex-col gap-3">
          {messages.map((m, i) =>
            m.role === "result" ? (
              result && <ResultBlock key={i} result={result} />
            ) : (
              <Bubble key={i} role={m.role} text={m.text ?? ""} />
            ),
          )}
          {loading && <Typing />}
        </div>

        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 border-t border-[var(--color-line)] bg-[var(--color-page)]/95 p-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Ignore Enter while an IME (e.g. Vietnamese) is still composing —
              // otherwise the half-typed text stays in the box after sending.
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={result ? "Ask me anything else…" : "Type your reply…"}
            className="h-11 flex-1 rounded-full border border-[var(--color-line)] bg-white px-4 text-sm outline-none focus:border-accent"
            autoFocus
          />
          <Button onClick={send} disabled={!draft.trim() || loading}>
            Send
          </Button>
        </div>
        {result && (
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

function ResultBlock({ result }: { result: AdvisorResult }) {
  return (
    <div>
      <div className="rounded-3xl bg-white p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="solid">Age {result.age}</Badge>
          <Badge tone="soft">
            Element: {result.element} ({ELEMENT_VI[result.element]})
          </Badge>
        </div>
        <p className="mt-3 text-xs font-semibold text-[var(--color-muted)]">Harmonious colors</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {result.recommendedColors.map((c) => (
            <Badge key={c} tone="outline">
              {c}
            </Badge>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <h2 className="text-sm font-bold text-[var(--color-ink)]">Picked for you</h2>
        <NailGrid scored={result.recommendations} />
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
