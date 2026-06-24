"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TopAppBar } from "@/components/TopAppBar";
import { NailGrid } from "@/components/NailGrid";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/TagChipGroup";
import { GROUP_BY_KEY } from "@/lib/constants";
import { chatAdvisor, type AdvisorProfile, type AdvisorResult } from "@/lib/ai";
import { ELEMENT_VI } from "@/lib/fengshui";
import { useLibrary } from "@/lib/store";

type Step = "name" | "birthYear" | "color" | "occasion" | "done";
type Message = { role: "bot" | "user"; text: string };

const QUESTION: Record<Exclude<Step, "done">, string> = {
  name: "Hi! I’m your personal nail stylist 💕 What should I call you?",
  birthYear: "Lovely! Which year were you born?",
  color: "What’s your favorite color?",
  occasion: "And what occasion are you planning for?",
};

export default function AdvisorPage() {
  const { published: nails } = useLibrary();
  const [step, setStep] = useState<Step>("name");
  const [messages, setMessages] = useState<Message[]>([{ role: "bot", text: QUESTION.name }]);
  const [draft, setDraft] = useState("");
  const [profile, setProfile] = useState<Partial<AdvisorProfile>>({});
  const [result, setResult] = useState<AdvisorResult | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, result]);

  const colorOptions = GROUP_BY_KEY.color.values;
  const occasionOptions = GROUP_BY_KEY.occasion.values;

  function advance(answer: string) {
    const next: Message[] = [{ role: "user", text: answer }];
    const nextProfile = { ...profile };

    if (step === "name") {
      nextProfile.name = answer;
      next.push({ role: "bot", text: QUESTION.birthYear });
      setStep("birthYear");
    } else if (step === "birthYear") {
      nextProfile.birthYear = parseInt(answer, 10);
      next.push({ role: "bot", text: QUESTION.color });
      setStep("color");
    } else if (step === "color") {
      nextProfile.favoriteColor = answer;
      next.push({ role: "bot", text: QUESTION.occasion });
      setStep("occasion");
    } else if (step === "occasion") {
      nextProfile.occasion = answer;
      const res = chatAdvisor(nextProfile as AdvisorProfile, nails);
      next.push({ role: "bot", text: res.reply });
      setResult(res);
      setStep("done");
    }

    setProfile(nextProfile);
    setMessages((m) => [...m, ...next]);
    setDraft("");
  }

  function submitText() {
    const value = draft.trim();
    if (!value) return;
    if (step === "birthYear") {
      const year = parseInt(value, 10);
      if (Number.isNaN(year) || year < 1900 || year > 2025) return;
    }
    advance(value);
  }

  function restart() {
    setStep("name");
    setMessages([{ role: "bot", text: QUESTION.name }]);
    setProfile({});
    setResult(null);
    setDraft("");
  }

  const composer = useMemo(() => {
    if (step === "color" || step === "occasion") {
      const options = step === "color" ? colorOptions : occasionOptions;
      return (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <Chip key={o} label={o} active={false} onClick={() => advance(o)} />
          ))}
        </div>
      );
    }
    if (step === "name" || step === "birthYear") {
      return (
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitText()}
            inputMode={step === "birthYear" ? "numeric" : "text"}
            placeholder={step === "birthYear" ? "e.g. 1996" : "Your name"}
            className="h-11 flex-1 rounded-full border border-[var(--color-line)] bg-white px-4 text-sm outline-none focus:border-accent"
            autoFocus
          />
          <Button onClick={submitText} disabled={!draft.trim()}>
            Send
          </Button>
        </div>
      );
    }
    return (
      <Button variant="secondary" className="w-full" onClick={restart}>
        Start over
      </Button>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, draft, colorOptions, occasionOptions]);

  return (
    <div className="flex min-h-full flex-col">
      <TopAppBar title="AI Advisor" />

      <div className="flex-1 px-4 py-4">
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role} text={m.text} />
          ))}

          {result && (
            <div className="rounded-3xl bg-white p-4 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="solid">Age {result.age}</Badge>
                <Badge tone="soft">
                  Element: {result.element} ({ELEMENT_VI[result.element]})
                </Badge>
              </div>
              <p className="mt-3 text-xs font-semibold text-[var(--color-muted)]">
                Harmonious colors
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {result.recommendedColors.map((c) => (
                  <Badge key={c} tone="outline">
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {result && (
          <div className="mt-4">
            <h2 className="text-sm font-bold text-[var(--color-ink)]">Picked for you</h2>
            <div className="-mx-4">
              <NailGrid scored={result.recommendations} />
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 border-t border-[var(--color-line)] bg-[var(--color-page)]/95 p-3 backdrop-blur">
        {composer}
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
