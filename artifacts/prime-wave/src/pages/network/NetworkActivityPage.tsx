import { Activity, Clock, Bell, ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";

const GOLD = "#D4AF37";
const MUTED = "rgba(170,179,197,0.55)";
const C_R = "#a78bfa";
const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 16,
  padding: 24,
};

const features = [
  { icon: Clock,        label: "Full Activity Timeline",   desc: "Complete chronological log of every network event — joins, investments, payouts" },
  { icon: Activity,     label: "Network Events Feed",      desc: "Live feed of team member activity with filter and search capabilities" },
  { icon: ArrowUpRight, label: "Investment Milestones",    desc: "Track when team members reach investment and earnings thresholds" },
  { icon: Bell,         label: "Event Notifications",      desc: "Get alerted when important network events happen in real time" },
];

export default function NetworkActivityPage() {
  return (
    <AppLayout>
      <PageContainer>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 48 }}>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={CARD}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: `${C_R}18`,
                border: `1px solid ${C_R}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Activity size={22} color={C_R} />
              </div>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>Activity</h1>
                <p style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>Timeline · Events · Milestones · History</p>
              </div>
              <div style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 20,
                background: `${GOLD}12`, border: `1px solid ${GOLD}22`,
                fontSize: 11, fontWeight: 700, color: GOLD }}>
                Next Milestone
              </div>
            </div>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.65, marginBottom: 24 }}>
              Activity will become your network's full history — a searchable, filterable timeline
              of every event across your entire downline, with real-time event streaming.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {features.map(({ icon: Icon, label, desc }) => (
                <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "12px 14px", background: "rgba(255,255,255,0.025)", borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.05)" }}>
                  <Icon size={15} color={C_R} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{label}</p>
                    <p style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, padding: "12px 16px", borderRadius: 10,
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
              fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
              💡 Activity is already tracked — visit <strong style={{ color: "rgba(255,255,255,0.7)" }}>Network Overview</strong> to
              see the live Activity Timeline with your most recent network events.
            </div>
          </motion.div>
        </div>
      </PageContainer>
    </AppLayout>
  );
}
