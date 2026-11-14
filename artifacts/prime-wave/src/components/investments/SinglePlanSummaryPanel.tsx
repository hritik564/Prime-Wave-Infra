import type { SinglePlanSummary } from "@/lib/api";

const money = (value: string) => `$${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SinglePlanPolicyPanel() {
  return <section className="rounded-xl border border-border bg-card p-5 text-foreground space-y-3">
    <h2 className="font-semibold text-lg">Prime Wave Single — locked investment policy</h2>
    <p>0.8% daily ROI · 0.4% per scheduled cycle · Optional auto-compounding · No fixed maturity</p>
    <p>Non-working: 3× total entitlement = 2× ROI + original principal.<br />
      Working: 5× total entitlement = 4× ROI + original principal.</p>
    <p className="text-sm text-muted-foreground">New SINGLE investments share one member-level cap. Compounding never increases original capital.
      Legacy accounting stays separate. Minimum contribution: (all previous investments + 1) × $100, in whole $100 increments.</p>
    <p className="text-sm text-muted-foreground">Working status is permanent after an eligible personal referral in each actual binary leg.
      Spillover does not qualify. Processing: 00:00 and 12:00 Europe/London.</p>
    <p className="text-sm text-amber-400">Principal settlement is disabled pending approved settlement rules. These policy values cannot be edited here.</p>
  </section>;
}

export default function SinglePlanSummaryPanel({ summary }: { summary: SinglePlanSummary }) {
  const maximum = Number(summary.maxRoi);
  const progress = maximum > 0 ? Math.min(100, Number(summary.roiAccrued) / maximum * 100) : 0;
  return <section className="rounded-2xl border border-border bg-card p-5 mb-5 text-foreground space-y-4" aria-label="Single plan member accounting">
    <div className="flex flex-wrap justify-between gap-2">
      <h2 className="font-semibold">Single-plan member entitlement</h2>
      <span className="text-sm text-amber-400">{summary.tier}× total · {summary.tier === 5 ? "Working — permanent" : "Non-working"}</span>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {[
        ["Original contributed capital", summary.originalCapital], ["Maximum ROI", summary.maxRoi],
        ["Cumulative ROI earned", summary.roiAccrued], ["Remaining ROI", summary.remainingRoi],
        ["ROI claimed", summary.roiClaimed], ["ROI compounded", summary.roiCompounded],
        ["Claimable ROI", summary.claimableRoi], ["Original principal returned", summary.principalReturned],
        ["Principal still owed", summary.principalOwed],
      ].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{money(value)}</p></div>)}
    </div>
    <div role="progressbar" aria-label="ROI cap progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}
      className="h-2 rounded-full bg-muted overflow-hidden">
      <div className="h-full bg-amber-400" style={{ width: `${progress}%` }} />
    </div>
    <p className="text-xs text-muted-foreground">{progress.toFixed(2)}% of ROI entitlement earned. {Number(summary.remainingRoi) === 0 && maximum > 0 ? "ROI cap reached; further accrual and compounding have stopped." : "All new SINGLE investments share this pool."}</p>
    <p className="text-xs text-muted-foreground">{summary.qualifiedAt
      ? `Permanently qualified on ${new Date(summary.qualifiedAt).toLocaleString()}.`
      : "Working qualification requires a personally sponsored active, investment-eligible member in each binary leg; spillover is excluded."}</p>
    <p className="text-xs text-amber-400">Principal is included in total entitlement but is not currently claimable. {summary.settlement.reason}.</p>
    <p className="text-xs text-muted-foreground">Legacy investments, other income and wallet transfers are excluded from this account.</p>
  </section>;
}
