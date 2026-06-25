import { useState, useEffect } from "react";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import SectionHeader from "@/components/shared/SectionHeader";
import { getNotifications, markAllNotificationsRead, type ApiNotification } from "@/lib/api";

const TYPE_COLOR: Record<string, string> = {
  INVESTMENT_CREATED: "#D4AF37",
  ROI_CREDITED:       "#34d399",
  ROI_CLAIM:          "#34d399",
  PRINCIPAL_RELEASE:  "#60a5fa",
  LEVEL_INCOME:       "#22d3ee",
  BINARY_MATCH:       "#a78bfa",
  DEPOSIT_APPROVED:   "#34d399",
  WITHDRAWAL_SENT:    "#f87171",
  SYSTEM:             "#94a3b8",
};

const TYPE_BG: Record<string, string> = {
  INVESTMENT_CREATED: "rgba(212,175,55,0.1)",
  ROI_CREDITED:       "rgba(52,211,153,0.1)",
  ROI_CLAIM:          "rgba(52,211,153,0.1)",
  PRINCIPAL_RELEASE:  "rgba(96,165,250,0.1)",
  LEVEL_INCOME:       "rgba(34,211,238,0.1)",
  BINARY_MATCH:       "rgba(167,139,250,0.1)",
  DEPOSIT_APPROVED:   "rgba(52,211,153,0.1)",
  WITHDRAWAL_SENT:    "rgba(248,113,113,0.1)",
  SYSTEM:             "rgba(148,163,184,0.1)",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingRead, setMarkingRead] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const result = await getNotifications({ limit: 50 });
        setNotifications(result.data);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const handleMarkAllRead = async () => {
    setMarkingRead(true);
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // silently fail
    } finally {
      setMarkingRead(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <AppLayout pageTitle="Notifications" notificationCount={unreadCount}>
      <PageContainer>
        <div className="flex items-center justify-between mb-5 lg:mb-6">
          <SectionHeader title="Notifications" />
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingRead}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={{ background: "rgba(212,175,55,0.1)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)" }}
            >
              {markingRead
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <CheckCheck className="h-3 w-3" />
              }
              Mark all read
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#D4AF37" }} />
            <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>Loading notifications…</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
              style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.15)" }}
            >
              <Bell className="h-8 w-8" style={{ color: "rgba(212,175,55,0.4)" }} />
            </div>
            <h3 className="text-lg font-semibold font-heading text-foreground mb-1">All caught up</h3>
            <p className="text-sm max-w-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
              You have no notifications right now. They'll appear here when there's activity on your account.
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}
          >
            {notifications.map((notif, i) => {
              const color = TYPE_COLOR[notif.type] ?? TYPE_COLOR.SYSTEM;
              const bg    = TYPE_BG[notif.type]    ?? TYPE_BG.SYSTEM;
              return (
                <div
                  key={notif.id}
                  className="flex items-start gap-3 px-4 py-4 transition-colors hover:bg-white/[0.02]"
                  style={{
                    borderBottom: i < notifications.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    background: notif.isRead ? "transparent" : "rgba(212,175,55,0.02)",
                  }}
                >
                  {/* Icon */}
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-0.5"
                    style={{ background: bg }}
                  >
                    <Bell className="h-4 w-4" style={{ color }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium ${notif.isRead ? "text-foreground/70" : "text-foreground"}`}>
                        {notif.title}
                      </p>
                      <span className="text-[10px] shrink-0 mt-0.5" style={{ color: "rgba(170,179,197,0.5)" }}>
                        {timeAgo(notif.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "rgba(170,179,197,0.6)" }}>
                      {notif.message}
                    </p>
                  </div>

                  {/* Unread indicator */}
                  {!notif.isRead && (
                    <div
                      className="h-2 w-2 rounded-full shrink-0 mt-2"
                      style={{ background: "#D4AF37", boxShadow: "0 0 4px rgba(212,175,55,0.5)" }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PageContainer>
    </AppLayout>
  );
}
