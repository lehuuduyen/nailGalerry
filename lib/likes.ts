// Client helper for the heart ("tym") counter. POST = like (+1), DELETE =
// unlike (−1). Returns the authoritative new count from the server, or null on
// failure (caller keeps its optimistic value).
export async function sendLike(id: string, liking: boolean): Promise<number | null> {
  try {
    const res = await fetch("/api/likes", {
      method: liking ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return typeof data.count === "number" ? data.count : null;
  } catch {
    return null;
  }
}
