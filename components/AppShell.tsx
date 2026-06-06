import { BottomTabBar } from "./BottomTabBar";

/**
 * Mobile-only app frame: a centered phone-width column with a fixed bottom tab
 * bar. Only the inner <main> scrolls. On wide screens it just floats centered.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] items-stretch justify-center overflow-hidden sm:py-6">
      <div className="relative flex h-full w-full max-w-[430px] flex-col overflow-hidden bg-[var(--color-page)] sm:rounded-[2rem] sm:shadow-2xl">
        <main className="no-scrollbar flex-1 overflow-y-auto pb-16">{children}</main>
        <BottomTabBar />
      </div>
    </div>
  );
}
