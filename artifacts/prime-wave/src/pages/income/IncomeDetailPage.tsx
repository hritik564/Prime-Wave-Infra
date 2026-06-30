import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  TrendingUp, GitMerge, RefreshCw, DollarSign, Users,
  ArrowLeft, Sparkles, Clock,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";

const GOLD = "#D4AF37";
const MUTED = "rgba(170,179,197,0.55)";
const CARD = "hsl(221, 59%, 12%)";

const ENGINE_META: Record<string, {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  sprint: string;
}> = {
  roi: {
    title:    "ROI Details",
    subtitle: "Daily return on your active investments",
    icon:     TrendingUp,
    color:    "#D4AF37",
    bg:       "rgba(212,175,55,0.12)",
    sprint:   "26B",
  },
  binary: {
    title:    "Binary Details",
    subtitle: "Matching income from your binary network",
    icon:     GitMerge,
    color:    "#a78bfa",
    bg:       "rgba(167,139,250,0.12)",
    sprint:   "26B",
  },
  orbit: {
    title:    "Orbit Details",
    subtitle: "Binary orbit rewards and cycles",
    icon:     RefreshCw,
    color:    "#60a5fa",
    bg:       "rgba(96,165,250,0.12)",
    sprint:   "26B",
  },
  salary: {
    title:    "Salary Details",
    subtitle: "Rank-based monthly salary income",
    icon:     DollarSign,
    color:    "#fb923c",
    bg:       "rgba(251,146,60,0.12)",
    sprint:   "26B",
  },
  level: {
    title:    "Level Income Details",
    subtitle: "Instant referral level income",
    icon:     Users,
    color:    "#34d399",
    bg:       "rgba(52,211,153,0.12)",
    sprint:   "26B",
  },
};

export default function IncomeDetailPage({ engine }: { engine: string }) {
  const [, navigate] = useLocation();
  const meta = ENGINE_META[engine] ?? ENGINE_META.roi;
  const Icon = meta.icon;

  return (
    <AppLayout pageTitle={meta.title} notificationCount={0}>
      <PageContainer>
        <div className="space-y-6 pb-8">

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-3"
          >
            <button
              onClick={() => navigate("/income")}
              className="flex h-9 w-9 items-center justify-center rounded-xl transition-all"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <ArrowLeft className="h-4 w-4" style={{ color: MUTED }} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-foreground">{meta.title}</h1>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>{meta.subtitle}</p>
            </div>
          </motion.div>

          {/* Coming soon card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.35 }}
            className="rounded-2xl p-8 flex flex-col items-center text-center gap-4"
            style={{ background: CARD, border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ background: meta.bg, border: `1px solid ${meta.color}30` }}
            >
              <Icon className="h-7 w-7" style={{ color: meta.color }} />
            </div>

            <div>
              <p className="text-base font-semibold text-foreground mb-1">
                Detailed View — Sprint {meta.sprint}
              </p>
              <p className="text-sm max-w-sm" style={{ color: MUTED }}>
                The full {meta.title.toLowerCase()} page with historical charts, breakdown tables,
                and lifetime analytics is coming in Sprint {meta.sprint}.
              </p>
            </div>

            {/* Planned features preview */}
            <div className="w-full max-w-sm rounded-xl p-4 text-left space-y-2.5"
              style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: MUTED }}>
                Planned for this page
              </p>
              {[
                "Lifetime earnings breakdown",
                "Daily / monthly trend charts",
                "Cycle-by-cycle history",
                "Engine-specific metrics",
              ].map(item => (
                <div key={item} className="flex items-center gap-2">
                  <Sparkles className="h-3 w-3 shrink-0" style={{ color: meta.color }} />
                  <span className="text-xs" style={{ color: MUTED }}>{item}</span>
                </div>
              ))}
            </div>

            {/* Back to overview */}
            <button
              onClick={() => navigate("/income")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90"
              style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}30` }}
            >
              <Clock className="h-4 w-4" />
              Back to Income Center
            </button>
          </motion.div>

        </div>
      </PageContainer>
    </AppLayout>
  );
}
