import { TrendingUp, Zap, Award, BarChart } from "lucide-react";
import { motion } from "framer-motion";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";

const GOLD = "#D4AF37";
const MUTED = "rgba(170,179,197,0.55)";
const C_OK = "#34d399";
const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 16,
  padding: 24,
};

const features = [
  { icon: TrendingUp, label: "Income Forecast",         desc: "Projected binary, ROI, and salary income for the week and month ahead" },
  { icon: BarChart,   label: "Growth Forecast",         desc: "Monthly team growth and investment volume projections with confidence scores" },
  { icon: Zap,        label: "Qualification Forecasts", desc: "Track your progress toward Binary Match, Orbit, and Salary rank qualifications" },
  { icon: Award,      label: "Opportunity Alerts",      desc: "Get notified when you're within reach of the next income milestone" },
];

export default function NetworkForecastsPage() {
  return (
    <AppLayout>
      <PageContainer>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 48 }}>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} style={CARD}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: `${C_OK}18`,
                border: `1px solid ${C_OK}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <TrendingUp size={22} color={C_OK} />
              </div>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>Forecasts</h1>
                <p style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>Income · Growth · Qualification · Opportunities</p>
              </div>
              <div style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 20,
                background: `${GOLD}12`, border: `1px solid ${GOLD}22`,
                fontSize: 11, fontWeight: 700, color: GOLD }}>
                Next Milestone
              </div>
            </div>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", lineHeight: 1.65, marginBottom: 24 }}>
              Forecasts will give you a forward-looking view of your network — income projections,
              growth trends, qualification progress, and opportunity windows all in one place.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {features.map(({ icon: Icon, label, desc }) => (
                <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "12px 14px", background: "rgba(255,255,255,0.025)", borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.05)" }}>
                  <Icon size={15} color={C_OK} style={{ marginTop: 2, flexShrink: 0 }} />
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
              💡 Forecasting models are already running — visit <strong style={{ color: "rgba(255,255,255,0.7)" }}>Network Overview</strong> to
              see Income Forecast, Growth Forecast, and your Opportunity Cards.
            </div>
          </motion.div>
        </div>
      </PageContainer>
    </AppLayout>
  );
}
