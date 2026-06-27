"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TopAppBar } from "@/components/TopAppBar";
import { PublishedNailCard } from "@/components/PublishedNailCard";
import { Button } from "@/components/ui/Button";
import { InstagramIcon } from "@/components/icons";
import { ADMIN_FLAG } from "@/lib/constants";
import { useLibrary } from "@/lib/store";

type Mode = "post" | "profile" | "published";

export default function AdminPage() {
  const router = useRouter();
  const {
    nails,
    importFromUrl,
    importProfile,
    importSamplePosts,
    tagPending,
    approveNail,
    approveAllPending,
    removeMany,
    clearLibrary,
  } = useLibrary();

  // Reaching this page means proxy.ts let the request through (authenticated),
  // so mark this browser as an admin to reveal the Admin tab.
  useEffect(() => {
    try {
      window.localStorage.setItem(ADMIN_FLAG, "1");
      window.dispatchEvent(new Event("storage"));
    } catch {
      /* ignore */
    }
  }, []);

  const [mode, setMode] = useState<Mode>("profile");
  const [value, setValue] = useState("");
  const [count, setCount] = useState(30);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [tagging, setTagging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pendingNails = useMemo(() => nails.filter((n) => n.status === "pending"), [nails]);
  const approvedNails = useMemo(() => nails.filter((n) => n.status !== "pending"), [nails]);

  async function onImport() {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    const result =
      mode === "profile" ? await importProfile(trimmed, count) : await importFromUrl(trimmed);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Import failed.");
      return;
    }
    const added = result.count ?? 0;
    const skipped = result.skipped ?? 0;
    if (added === 0) {
      setNotice(
        skipped > 0
          ? `Không có gì mới — ${skipped} bài gần đây đã có. Tăng số lượng để lấy bài cũ hơn.`
          : "Không tìm thấy bài nào.",
      );
    } else {
      setNotice(
        `Đã import ${added} bài vào "Đợi duyệt"` +
          (skipped > 0 ? ` (${skipped} bài đã có)` : "") +
          ". Mở tab Published designs để gắn tag & duyệt.",
      );
      if (mode === "post") setValue("");
    }
  }

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        setError(null);
        setNotice(null);
      }}
      className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
        mode === m ? "bg-accent text-white" : "text-[var(--color-muted)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <TopAppBar title="Admin" />

      <div className="flex justify-end px-4 pt-3">
        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.removeItem(ADMIN_FLAG);
            } catch {
              /* ignore */
            }
            router.push("/");
          }}
          className="text-xs font-medium text-[var(--color-muted)] underline"
        >
          Đăng xuất / ẩn admin
        </button>
      </div>

      <div className="px-4 pt-2">
        <div className="flex gap-1 rounded-full bg-accent-tint p-1">
          {tab("profile", "Whole profile")}
          {tab("post", "Single post")}
          {tab("published", "Published designs")}
        </div>
      </div>

      {mode === "published" ? (
        <div className="px-4 pb-24 pt-3">
          {selected.size > 0 && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-2xl bg-accent-tint px-3 py-2">
              <span className="text-xs font-medium text-[var(--color-ink)]">
                Đã chọn {selected.size}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-xs font-medium text-[var(--color-muted)] underline"
                >
                  Bỏ chọn
                </button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Xoá ${selected.size} thiết kế đã chọn? Ảnh sẽ bị xoá khỏi R2.`,
                      )
                    ) {
                      removeMany([...selected]);
                      setSelected(new Set());
                    }
                  }}
                >
                  Xoá đã chọn ({selected.size})
                </Button>
              </div>
            </div>
          )}

          {/* ── Đợi duyệt ────────────────────────────────────────────── */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[var(--color-ink)]">
              Đợi duyệt {pendingNails.length > 0 && `(${pendingNails.length})`}
            </h2>
            {pendingNails.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={tagging}
                  onClick={async () => {
                    setTagging(true);
                    setError(null);
                    setNotice(`Đang gọi Gemini gắn tag… (0/${pendingNails.length})`);
                    const { tagged, failed } = await tagPending(({ tagged, failed }) => {
                      setNotice(
                        `Đang gọi Gemini gắn tag… đã xong ${tagged + failed}/${pendingNails.length}` +
                          (failed ? ` (${failed} lỗi)` : ""),
                      );
                    });
                    setTagging(false);
                    if (tagged === 0 && failed === 0) {
                      setNotice("Không có bài nào cần gắn tag (đã gắn trước đó).");
                    } else {
                      setNotice(
                        `Đã gắn tag ${tagged} bài` +
                          (failed ? `, ${failed} bài lỗi (thử lại sau)` : "") +
                          ". Kiểm tra rồi duyệt.",
                      );
                    }
                  }}
                >
                  {tagging ? "Đang gắn tag…" : `Gọi Gemini (${pendingNails.length})`}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const n = approveAllPending();
                    setNotice(`Đã duyệt & publish ${n} bài.`);
                  }}
                >
                  Duyệt tất cả ({pendingNails.length})
                </Button>
              </div>
            )}
          </div>

          {notice && (
            <p className="mb-3 rounded-xl bg-green-50 px-3 py-2 text-xs text-green-700">{notice}</p>
          )}

          {pendingNails.length === 0 ? (
            <div className="mb-5 rounded-3xl bg-white py-8 text-center text-xs text-[var(--color-muted)] shadow-[var(--shadow-card)]">
              Không có bài nào đợi duyệt.
            </div>
          ) : (
            <div className="mb-6 flex flex-col gap-4">
              {pendingNails.map((nail) => (
                <PublishedNailCard
                  key={nail.id}
                  nail={nail}
                  selected={selected.has(nail.id)}
                  onToggleSelect={() => toggleSelect(nail.id)}
                  onApprove={() => approveNail(nail.id)}
                />
              ))}
            </div>
          )}

          {/* ── Đã duyệt ─────────────────────────────────────────────── */}
          <h2 className="mb-2 text-sm font-bold text-[var(--color-ink)]">
            Đã duyệt {approvedNails.length > 0 && `(${approvedNails.length})`}
          </h2>
          {approvedNails.length === 0 ? (
            <div className="rounded-3xl bg-white py-8 text-center text-xs text-[var(--color-muted)] shadow-[var(--shadow-card)]">
              Chưa có thiết kế nào được duyệt.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {approvedNails.map((nail) => (
                <PublishedNailCard
                  key={nail.id}
                  nail={nail}
                  selected={selected.has(nail.id)}
                  onToggleSelect={() => toggleSelect(nail.id)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 pb-24 pt-2">
          <div className="rounded-3xl bg-accent-tint p-4">
            <p className="text-sm font-semibold text-[var(--color-ink)]">Import from Instagram</p>

            <p className="mt-2 text-xs text-[var(--color-muted)]">
              {mode === "profile"
                ? "Dán link profile (vd instagram.com/nailssxatzi). Ảnh được tải lên R2 ngay và đưa vào “Đợi duyệt” — KHÔNG gọi Gemini lúc import."
                : "Dán link bài viết, hoặc chuột phải vào ảnh → “Copy image address” rồi dán link ảnh trực tiếp."}
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onImport()}
                inputMode="url"
                placeholder={
                  mode === "profile"
                    ? "https://www.instagram.com/nailssxatzi/"
                    : "https://www.instagram.com/p/…"
                }
                className="h-11 w-full rounded-full border border-[var(--color-line)] bg-white px-4 text-sm outline-none focus:border-accent"
              />

              {mode === "profile" && (
                <>
                  <label className="flex items-center justify-between gap-2 px-1 text-xs text-[var(--color-muted)]">
                    Lấy bao nhiêu bài gần đây
                    <select
                      value={count}
                      onChange={(e) => setCount(Number(e.target.value))}
                      className="h-9 rounded-full border border-[var(--color-line)] bg-white px-3 text-sm text-[var(--color-ink)] outline-none focus:border-accent"
                    >
                      <option value={12}>12</option>
                      <option value={30}>30</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                    </select>
                  </label>
                  <p className="px-1 text-[11px] text-[var(--color-muted)]">
                    Để lấy thêm bài cũ hơn, tăng số này rồi import lại (bài đã có tự bỏ qua).
                  </p>
                </>
              )}

              <Button className="w-full" onClick={onImport} disabled={loading || !value.trim()}>
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {mode === "profile" ? "Đang tải & lưu R2…" : "Đang tải…"}
                  </>
                ) : (
                  <>
                    <InstagramIcon width={18} height={18} />
                    {mode === "profile" ? "Import profile" : "Import post"}
                  </>
                )}
              </Button>
            </div>

            {error && (
              <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
            )}
            {notice && (
              <p className="mt-2 rounded-xl bg-green-50 px-3 py-2 text-xs text-green-700">
                {notice}
              </p>
            )}

            <button
              type="button"
              onClick={importSamplePosts}
              className="mt-2 text-xs font-medium text-accent underline"
            >
              Hoặc tải bài mẫu (demo)
            </button>

            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="text-[11px] text-[var(--color-muted)]">{nails.length} bài trong catalog</p>
              {nails.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Xoá toàn bộ thư viện (designs + favorites)? Không thể hoàn tác.",
                      )
                    ) {
                      clearLibrary();
                      setError(null);
                      setNotice("Đã xoá sạch thư viện.");
                    }
                  }}
                  className="text-[11px] font-medium text-red-600 underline"
                >
                  Clear library
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
