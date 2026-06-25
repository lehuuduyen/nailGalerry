// ─────────────────────────────────────────────────────────────────────────
//  Shared Google Gemini caller with automatic model fallback.
//
//  Each purpose can use its own API key + model:
//    • Image tagging (auto-tag)  -> tagConfig()  — e.g. a paid key.
//    • Chat (advisor)            -> chatConfig() — e.g. a free key.
//  Both fall back to GEMINI_API_KEY / GEMINI_MODEL if the specific ones are
//  unset. On a quota/credit limit (429) we try the next model in the chain.
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = "gemini-2.5-flash";
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];

export type GeminiConfig = { apiKey?: string; model?: string };

/** Key + model for image tagging — prefers the dedicated (paid) tag key. */
export function tagConfig(): GeminiConfig {
  return {
    apiKey: process.env.GEMINI_TAG_API_KEY || process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_TAG_MODEL || process.env.GEMINI_MODEL || DEFAULT_MODEL,
  };
}

/** Key + model for the advisor chat — prefers the dedicated (free) chat key. */
export function chatConfig(): GeminiConfig {
  return {
    apiKey: process.env.GEMINI_CHAT_API_KEY || process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_CHAT_MODEL || process.env.GEMINI_MODEL || DEFAULT_MODEL,
  };
}

/** Ordered models to try: the chosen one first, then fallbacks. */
function modelChain(primary: string): string[] {
  return [...new Set([primary, ...FALLBACK_MODELS])];
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type GeminiResult = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
};

/**
 * Call Gemini `generateContent` with the given request body and config. Falls
 * back through the model chain on quota/credit (429) errors, and retries
 * transient 5xx. Returns the parsed response, or null if nothing worked.
 */
export async function geminiGenerate(
  body: Record<string, unknown>,
  config: GeminiConfig,
  timeoutMs = 25_000,
): Promise<GeminiResult | null> {
  const apiKey = config.apiKey;
  if (!apiKey) return null;

  const payload = JSON.stringify(body);
  for (const model of modelChain(config.model || DEFAULT_MODEL)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let res: Response;
      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: payload,
            signal: AbortSignal.timeout(timeoutMs),
          },
        );
      } catch {
        if (attempt < 2) {
          await wait(1000 * (attempt + 1));
          continue;
        }
        break; // network error — try the next model.
      }

      if (res.ok) return (await res.json().catch(() => null)) as GeminiResult | null;

      // Quota / prepaid-credit exhausted for this model — try the next model.
      if (res.status === 429) break;
      // Transient server error — retry the same model.
      if ((res.status === 500 || res.status === 503) && attempt < 2) {
        await wait(1000 * (attempt + 1));
        continue;
      }
      // Any other error — give up on this model, move to the next.
      break;
    }
  }
  return null;
}

/** Convenience: pull the first text part out of a Gemini response. */
export function geminiText(result: GeminiResult | null): string | undefined {
  return result?.candidates?.[0]?.content?.parts?.[0]?.text;
}
