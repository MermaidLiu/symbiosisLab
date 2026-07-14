import { Sidebar } from "./Sidebar";
import { PageTransition } from "./PageTransition";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fluent-app-shell flex h-screen overflow-hidden">
      <Sidebar />
      <PageTransition>{children}</PageTransition>
    </div>
  );
}
