import Sidebar from "./Sidebar";
import TopNavbar from "./TopNavbar";
import BottomNav from "./BottomNav";
import ImpersonationBanner from "./ImpersonationBanner";

interface AppLayoutProps {
  children: React.ReactNode;
  pageTitle?: string;
  notificationCount?: number;
}

export default function AppLayout({
  children,
  pageTitle,
  notificationCount,
}: AppLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar — desktop only */}
      <aside
        className="hidden lg:flex shrink-0 flex-col"
        style={{ width: "var(--sidebar-width, 256px)" }}
      >
        <Sidebar />
      </aside>

      {/* Main area */}
      <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
        <TopNavbar
          pageTitle={pageTitle}
          notificationCount={notificationCount}
        />
        <ImpersonationBanner />
        {/* pb-16 reserves space above the fixed bottom nav on mobile */}
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          {children}
        </main>
      </div>

      {/* Bottom Nav — mobile only */}
      <BottomNav />
    </div>
  );
}
