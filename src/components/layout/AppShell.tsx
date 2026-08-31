import { Sidebar } from "./Sidebar";
import { PageTransition } from "./PageTransition";
import { AccountStatusBanner } from "./AccountStatusBanner";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fluent-app-shell flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AccountStatusBanner />
        <PageTransition>{children}</PageTransition>
      </div>
    </div>
  );
}
