"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TopAppBar } from "@/components/TopAppBar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ADMIN_FLAG } from "@/lib/constants";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/admin";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Login failed.");
        setLoading(false);
        return;
      }
      // Reveal the Admin tab on this browser, then continue where they were headed.
      try {
        window.localStorage.setItem(ADMIN_FLAG, "1");
        window.dispatchEvent(new Event("storage"));
      } catch {
        /* ignore */
      }
      router.replace(next.startsWith("/admin") ? next : "/admin");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-sm flex-col gap-3 px-4 pt-6">
      <h1 className="text-lg font-bold text-[var(--color-ink)]">Admin sign in</h1>
      <p className="text-sm text-[var(--color-muted)]">Enter the admin credentials to manage the library.</p>
      <Input
        autoFocus
        placeholder="Username"
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <Input
        type="password"
        placeholder="Password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
      <Button type="submit" size="lg" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export default function AdminLoginPage() {
  return (
    <div>
      <TopAppBar title="Admin" backHref="/" />
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
