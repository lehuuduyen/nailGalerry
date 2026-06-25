"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TopAppBar } from "@/components/TopAppBar";
import { GradientThumb } from "@/components/GradientThumb";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TrashIcon, UploadIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth-client";
import type { Nail } from "@/lib/types";

export default function AccountPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div>
        <TopAppBar title="Account" />
        <div className="flex justify-center py-20">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopAppBar title={user ? "My account" : "Account"} />
      {user ? <Dashboard /> : <AuthForms />}
    </div>
  );
}

// ── Logged in: profile + my uploads ──────────────────────────────────────

function Dashboard() {
  const { user, logout } = useAuth();
  const [uploads, setUploads] = useState<Nail[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/my-uploads");
        const data = await res.json().catch(() => ({}));
        if (active) setUploads(Array.isArray(data.nails) ? data.nails : []);
      } catch {
        if (active) setUploads([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function onDelete(id: string) {
    if (!window.confirm("Delete this upload? This can't be undone.")) return;
    setBusy(id);
    try {
      const res = await fetch("/api/my-uploads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) setUploads((u) => (u ?? []).filter((n) => n.id !== id));
    } finally {
      setBusy(null);
    }
  }

  const pending = (uploads ?? []).filter((n) => n.status === "pending");
  const approved = (uploads ?? []).filter((n) => n.status !== "pending");

  return (
    <div className="px-4 pb-24 pt-4">
      <div className="flex items-center justify-between gap-3 rounded-3xl bg-accent-tint p-4">
        <div className="min-w-0">
          <p className="text-xs text-[var(--color-muted)]">Signed in as</p>
          <p className="truncate text-base font-bold text-[var(--color-ink)]">@{user!.username}</p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="text-xs font-medium text-[var(--color-muted)] underline"
        >
          Log out
        </button>
      </div>

      <Link href="/upload" className="mt-4 block">
        <Button className="w-full">
          <UploadIcon width={18} height={18} /> Upload a design
        </Button>
      </Link>

      <h2 className="mb-2 mt-6 text-sm font-bold text-[var(--color-ink)]">
        My uploads {uploads && uploads.length > 0 && `(${uploads.length})`}
      </h2>

      {uploads === null ? (
        <div className="flex justify-center py-10">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : uploads.length === 0 ? (
        <div className="rounded-3xl bg-white py-10 text-center text-xs text-[var(--color-muted)] shadow-[var(--shadow-card)]">
          You haven&apos;t uploaded any designs yet.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {pending.length > 0 && (
            <Section title="Waiting for approval" count={pending.length}>
              {pending.map((n) => (
                <UploadRow key={n.id} nail={n} busy={busy === n.id} onDelete={() => onDelete(n.id)} />
              ))}
            </Section>
          )}
          {approved.length > 0 && (
            <Section title="Approved" count={approved.length}>
              {approved.map((n) => (
                <UploadRow key={n.id} nail={n} busy={busy === n.id} onDelete={() => onDelete(n.id)} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-[var(--color-muted)]">
        {title} ({count})
      </p>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function UploadRow({ nail, busy, onDelete }: { nail: Nail; busy: boolean; onDelete: () => void }) {
  const isPending = nail.status === "pending";
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-[var(--shadow-card)]">
      <GradientThumb
        seed={nail.id}
        imageUrl={nail.imageUrl}
        alt={nail.title}
        className="h-16 w-16 shrink-0 overflow-hidden rounded-xl"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{nail.title}</p>
        <div className="mt-1">
          <Badge tone={isPending ? "outline" : "solid"}>
            {isPending ? "Pending" : "Approved"}
          </Badge>
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        aria-label="Delete"
        className="flex h-9 w-9 items-center justify-center rounded-full text-red-500 active:bg-red-50 disabled:opacity-50"
      >
        {busy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
        ) : (
          <TrashIcon width={18} height={18} />
        )}
      </button>
    </div>
  );
}

// ── Logged out: login / register ─────────────────────────────────────────

function AuthForms() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    setLoading(true);
    setError(null);
    const fn = mode === "login" ? login : register;
    const result = await fn(username.trim(), password);
    setLoading(false);
    if (!result.ok) setError(result.error ?? "Something went wrong.");
    // On success the AuthProvider sets `user` and this view swaps to Dashboard.
  }

  return (
    <div className="px-4 pb-24 pt-5">
      <p className="text-sm text-[var(--color-muted)]">
        Create an account to upload your nail designs and track their approval status.
      </p>

      <div className="mt-4 flex gap-1 rounded-full bg-accent-tint p-1">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
              mode === m ? "bg-accent text-white" : "text-[var(--color-muted)]"
            }`}
          >
            {m === "login" ? "Log in" : "Register"}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-[13px] font-semibold text-[var(--color-ink)]">
            Username
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="3–20 letters or numbers"
            className="h-11 w-full rounded-xl border border-[var(--color-line)] bg-white px-3 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-[13px] font-semibold text-[var(--color-ink)]">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="At least 6 characters"
            className="h-11 w-full rounded-xl border border-[var(--color-line)] bg-white px-3 text-sm outline-none focus:border-accent"
          />
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

        <Button
          className="w-full"
          onClick={submit}
          disabled={loading || !username.trim() || !password}
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : mode === "login" ? (
            "Log in"
          ) : (
            "Create account"
          )}
        </Button>
      </div>
    </div>
  );
}
