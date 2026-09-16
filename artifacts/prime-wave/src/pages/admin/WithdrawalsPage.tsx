import { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import {
  Search, Download, RefreshCw, Settings2, ChevronDown,
  CheckCircle, X, Clock, Shield, AlertTriangle, Wallet,
  TrendingUp, DollarSign, Percent, ArrowDownLeft, Users,
  SlidersHorizontal, ChevronLeft, ChevronRight, MoreHorizontal,
  UserCheck, FileText, BarChart2, Eye, Loader2,
  ShieldX,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { RotateCcw } from "lucide-react";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuth } from "@/providers/AuthProvider";
import AdminLayout from "./AdminLayout";
import WithdrawalDrawer, { type DrawerWithdrawal, type DrawerAuditLog } from "./WithdrawalDrawer";
import { ApprovalModal, RejectModal, RejectAndRefundModal, HoldModal, ManualReviewModal } from "./WithdrawalModals";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  getAdminWithdrawals,
  getAdminWithdrawalStats,
  getAdminWithdrawalById,
  adminApproveWithdrawal,
  adminRejectWithdrawal,
  adminRejectAndRefundBroadcastUnknown,
  adminReprocessWithdrawal,
  adminMoveWithdrawalToManualReview,
  adminHoldWithdrawal,
  adminUpdateWithdrawalNotes,
  type AdminWithdrawalItem,
  type AdminWithdrawalStats,
  type AdminWithdrawalDetail,
  type AdminWithdrawalStatus,
  getAdminWithdrawalDisplayStatus,
} from "@/lib/api";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const BG     = "hsl(222 62% 7%)";

// ─── Types ────────────────────────────────────────────────────────────────────
type Status   = "PENDING" | "APPROVED" | "UNDER_REVIEW" | "MANUAL_REVIEW" | "VALIDATING" | "QUEUED" | "PROCESSING" | "SIGNED" | "BROADCASTING" | "BROADCAST_UNKNOWN" | "CONFIRMING" | "COMPLETED" | "FAILED" | "REJECTED" | "CANCELLED";
type Priority = "NORMAL"  | "HIGH"     | "VIP"       | "URGENT";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const $   = (n: number | string) => `$${Number(n).toLocaleString()}`;
const dt  = (d: Date) => d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
const ago = (d: Date) => {
  const s=Math.floor((Date.now()-d.getTime())/1000);
  if(s<60)return"just now";if(s<3600)return`${Math.floor(s/60)}m`;
  if(s<86400)return`${Math.floor(s/3600)}h`;return`${Math.floor(s/86400)}d`;
};

function canApproveStatus(status: string): boolean {
  return getAdminWithdrawalDisplayStatus(status) === "PENDING";
}

function canRejectStatus(status: string): boolean {
  return ["PENDING", "APPROVED", "UNDER_REVIEW", "MANUAL_REVIEW"].includes(
    getAdminWithdrawalDisplayStatus(status),
  );
}

function canMoveToManualReviewStatus(status: string): boolean {
  return getAdminWithdrawalDisplayStatus(status) === "APPROVED";
}

export function canRejectAndRefundBroadcastUnknownStatus(status: string): boolean {
  return getAdminWithdrawalDisplayStatus(status) === "BROADCAST_UNKNOWN";
}

function derivePriority(amount: number): Priority {
  if (amount >= 10000) return "URGENT";
  if (amount >= 5000)  return "VIP";
  if (amount >= 1000)  return "HIGH";
  return "NORMAL";
}

function mapToDrawerWithdrawal(item: AdminWithdrawalItem | AdminWithdrawalDetail): DrawerWithdrawal {
  const amountNum = parseFloat(item.amount);
  const detail = item as AdminWithdrawalDetail;
  const wallet = detail.user?.wallet;
  return {
    id:               item.id,
    username:         item.user.username,
    firstName:        item.user.firstName,
    lastName:         item.user.lastName,
    memberId:         item.user.id.slice(0, 8).toUpperCase(),
    amount:           amountNum,
    fee:              0,
    walletType:       "WITHDRAWAL",
    paymentMethod:    "USDT",
    network:          item.network,
    walletAddress:    item.walletAddress,
    transactionHash:  item.txHash,
    status:           getAdminWithdrawalDisplayStatus(item.status),
    priority:         derivePriority(amountNum),
    requestedAt:      new Date(item.createdAt),
    processedAt:      item.approvedAt ? new Date(item.approvedAt) : item.completedAt ? new Date(item.completedAt) : null,
    assignedAdmin:    item.approver?.email ?? item.completer?.email ?? null,
    country:          "—",
    rank:             null,
    memberStatus:     item.user.status,
    sponsor:          item.user.sponsor?.username ?? null,
    depositWallet:    wallet ? parseFloat(wallet.depositWallet)    : 0,
    incomeWallet:     wallet ? parseFloat(wallet.incomeWallet)     : 0,
    withdrawalWallet: wallet ? parseFloat(wallet.withdrawalWallet) : 0,
    timelineEvents: detail.events?.map((event) => ({
      eventType: event.eventType,
      details: event.details,
      createdAt: event.createdAt,
    })),
  };
}

// ─── Status & Priority configs ────────────────────────────────────────────────
const STATUS_CFG: Record<string,{color:string;bg:string;label:string}> = {
  PENDING:      {color:"#fbbf24",bg:"rgba(251,191,36,0.12)",  label:"Pending"},
  APPROVED:     {color:"#34d399",bg:"rgba(52,211,153,0.12)",  label:"Approved"},
  REJECTED:     {color:"#f87171",bg:"rgba(248,113,113,0.12)", label:"Rejected"},
  CANCELLED:    {color:MUTED,    bg:"rgba(170,179,197,0.08)", label:"Cancelled"},
  COMPLETED:    {color:"#60a5fa",bg:"rgba(96,165,250,0.12)",  label:"Completed"},
  UNDER_REVIEW: {color:"#f97316",bg:"rgba(249,115,22,0.12)",  label:"Under Review"},
  MANUAL_REVIEW:{color:"#c084fc",bg:"rgba(192,132,252,0.12)", label:"Manual Review"},
  PROCESSING:   {color:"#818cf8",bg:"rgba(129,140,248,0.10)", label:"Processing"},
  CONFIRMING:   {color:"#60a5fa",bg:"rgba(96,165,250,0.12)",  label:"Confirming"},
  BROADCAST_UNKNOWN:{color:"#f97316",bg:"rgba(249,115,22,0.12)", label:"Broadcast Unknown"},
  FAILED:       {color:"#f87171",bg:"rgba(248,113,113,0.08)", label:"Failed"},
};
const PRI_CFG: Record<Priority,{color:string;bg:string}> = {
  NORMAL: {color:MUTED,     bg:"rgba(170,179,197,0.06)"},
  HIGH:   {color:"#fbbf24", bg:"rgba(251,191,36,0.1)"},
  VIP:    {color:GOLD,      bg:"rgba(212,175,55,0.1)"},
  URGENT: {color:"#f87171", bg:"rgba(248,113,113,0.1)"},
};

function StatusBadge({s}:{s:string}) {
  const display = getAdminWithdrawalDisplayStatus(s);
  const c=STATUS_CFG[display] ?? STATUS_CFG.PENDING;
  return <span style={{fontSize:10,fontWeight:700,color:c.color,background:c.bg,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap"}}>{c.label}</span>;
}
function PriorityBadge({p}:{p:Priority}) {
  const c=PRI_CFG[p];
  return <span style={{fontSize:10,fontWeight:700,color:c.color,background:c.bg,padding:"2px 7px",borderRadius:4,whiteSpace:"nowrap"}}>{p}</span>;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({icon:Icon,label,value,sub,color="rgba(255,255,255,0.78)",bg="#3b3b4a",loading}: {
  icon:React.ElementType;label:string;value:string;sub?:string;color?:string;bg?:string;loading?:boolean;
}) {
  return (
    <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"16px 18px",minWidth:0}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <div style={{width:32,height:32,borderRadius:9,background:bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <Icon size={15} style={{color}} />
        </div>
        <span style={{fontSize:11,color:MUTED,fontWeight:500}}>{label}</span>
      </div>
      {loading ? (
        <div style={{height:26,width:80,background:"rgba(255,255,255,0.06)",borderRadius:6,animation:"pulse 1.5s infinite"}}/>
      ) : (
        <div style={{fontSize:22,fontWeight:800,color:"rgba(255,255,255,0.92)",marginBottom:3}}>{value}</div>
      )}
      {sub&&<div style={{fontSize:11,color:MUTED}}>{sub}</div>}
    </div>
  );
}

// ─── HighPriorityPanel ────────────────────────────────────────────────────────
function HighPriorityPanel({data,onClick}:{data:AdminWithdrawalItem[];onClick:(w:AdminWithdrawalItem)=>void}) {
  const top5=useMemo(()=>data.filter(w=>w.status==="PENDING").sort((a,b)=>{
    const amtA=parseFloat(a.amount), amtB=parseFloat(b.amount);
    return amtB-amtA;
  }).slice(0,5),[data]);
  return (
    <div style={{background:CARD,border:`1px solid rgba(248,113,113,0.15)`,borderRadius:12,padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}>
        <AlertTriangle size={13} style={{color:"#f87171"}}/>
        <span style={{fontSize:11,fontWeight:700,color:"#f87171",letterSpacing:"0.08em"}}>HIGH PRIORITY</span>
        <span style={{fontSize:10,color:MUTED,marginLeft:"auto"}}>{top5.length} requiring attention</span>
      </div>
      {top5.length===0&&<div style={{fontSize:12,color:MUTED,textAlign:"center",padding:"10px 0"}}>No high-priority items</div>}
      {top5.map((w,i)=>{
        const amt=parseFloat(w.amount);
        const pri=derivePriority(amt);
        return (
          <div key={w.id} onClick={()=>onClick(w)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:i<top5.length-1?`1px solid rgba(255,255,255,0.04)`:"none",cursor:"pointer"}} >
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:10,color:MUTED,width:14}}>{i+1}.</span>
              <div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.82)",fontWeight:500}}>@{w.user.username}</div>
                <div style={{fontSize:10,color:MUTED,fontFamily:"monospace"}}>{w.id.slice(0,16)}…</div>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:12,fontWeight:700,color:GOLD_L}}>{$(amt)}</div>
              <PriorityBadge p={pri}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ProcessingQueue ──────────────────────────────────────────────────────────
function ProcessingQueue({stats}:{stats:AdminWithdrawalStats|null}) {
  const total = stats ? (stats.totalCount || 1) : 1;
  const buckets = stats ? [
    {label:"Pending",   count:stats.pendingCount,   amount:parseFloat(stats.pendingAmount),   color:"#fbbf24"},
    {label:"Approved",  count:stats.approvedCount,  amount:0,                                  color:"#34d399"},
    {label:"Completed", count:stats.completedCount, amount:parseFloat(stats.completedAmount), color:"#60a5fa"},
    {label:"Rejected",  count:stats.rejectedCount,  amount:0,                                  color:"#f87171"},
    {label:"Cancelled", count:stats.cancelledCount, amount:0,                                  color:MUTED},
  ] : [];
  return (
    <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}>
        <BarChart2 size={13} style={{color:GOLD}}/>
        <span style={{fontSize:11,fontWeight:700,color:MUTED,letterSpacing:"0.08em"}}>PROCESSING QUEUE</span>
      </div>
      {!stats && <div style={{fontSize:12,color:MUTED,textAlign:"center",padding:"10px 0"}}>Loading…</div>}
      {buckets.map(b=>{
        const pct=Math.round((b.count/total)*100);
        return(
          <div key={b.label} style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>{b.label}</span>
              <div style={{display:"flex",gap:8}}>
                <span style={{fontSize:11,fontWeight:600,color:b.color}}>{b.count}</span>
                {b.amount > 0 && <span style={{fontSize:10,color:MUTED}}>{$(b.amount)}</span>}
              </div>
            </div>
            <div style={{height:4,background:"rgba(255,255,255,0.06)",borderRadius:2}}>
              <div style={{height:"100%",borderRadius:2,background:b.color,width:`${pct}%`,transition:"width 0.3s ease"}}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ActionDropdown ───────────────────────────────────────────────────────────
function ActionDropdown({ w, onApprove, onReject, onRejectAndRefund, onReprocess, onHold, onMoveToManualReview, onView, onCancel, onAssign, canMutate = true }: {
  w: AdminWithdrawalItem;
  onApprove:(w:AdminWithdrawalItem)=>void; onReject:(w:AdminWithdrawalItem)=>void;
  onRejectAndRefund:(w:AdminWithdrawalItem)=>void;
  onReprocess:(w:AdminWithdrawalItem)=>void;
  onHold:(w:AdminWithdrawalItem)=>void; onMoveToManualReview:(w:AdminWithdrawalItem)=>void; onView:(w:AdminWithdrawalItem)=>void;
  onCancel:(w:AdminWithdrawalItem)=>void; onAssign:(w:AdminWithdrawalItem)=>void;
  canMutate?: boolean;
}) {
  const [open,setOpen]=useState(false);
  const isActionable = canApproveStatus(w.status) || canRejectStatus(w.status);
  const items=[
    {icon:Eye,         label:"View Details",    color:"rgba(255,255,255,0.7)", fn:()=>onView(w)},
    ...(canMutate && canApproveStatus(w.status)?[
      {icon:CheckCircle, label:"Approve",         color:"#34d399", fn:()=>onApprove(w)},
    ]:[]),
    ...(canMutate && canRejectStatus(w.status)?[
      {icon:X,           label:"Reject",          color:"#f87171", fn:()=>onReject(w)},
    ]:[]),
    ...(canMutate && canRejectAndRefundBroadcastUnknownStatus(w.status)?[
      {icon:ShieldX,     label:"Reject & Refund", color:"#f87171", fn:()=>onRejectAndRefund(w)},
    ]:[]),
    ...(canMutate && canMoveToManualReviewStatus(w.status)?[
      {icon:AlertTriangle, label:"Move to Manual Review", color:"#c084fc", fn:()=>onMoveToManualReview(w)},
    ]:[]),
    {icon:Users,       label:"View Member",     color:"rgba(255,255,255,0.7)", fn:()=>{}},
    {icon:Shield,      label:"Audit Trail",     color:"rgba(255,255,255,0.7)", fn:()=>onView(w)},
  ];
  return (
    <div style={{position:"relative"}}>
      <button onClick={e=>{e.stopPropagation();setOpen(o=>!o);}} style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${BORDER}`,borderRadius:6,cursor:"pointer",color:MUTED,padding:"4px 7px",display:"flex",alignItems:"center"}}>
        <MoreHorizontal size={14}/>
      </button>
      {open&&(
        <>
          <div style={{position:"fixed",inset:0,zIndex:99}} onClick={()=>setOpen(false)}/>
          <div style={{position:"absolute",right:0,top:"110%",zIndex:100,background:"hsl(222 62% 10%)",border:`1px solid ${BORDER}`,borderRadius:10,padding:"4px",minWidth:170,boxShadow:"0 8px 30px rgba(0,0,0,0.5)"}}>
            {items.map((it,i)=>(
              <button key={i} onClick={e=>{e.stopPropagation();it.fn();setOpen(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"8px 10px",background:"none",border:"none",borderRadius:7,cursor:"pointer",color:it.color,fontSize:12,textAlign:"left"}}>
                <it.icon size={12}/>{it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Table Row (memoized) ─────────────────────────────────────────────────────
const WithdrawalRow = memo(function WithdrawalRow({ w, checked, onToggle, onRowClick, onApprove, onReject, onRejectAndRefund, onReprocess, onHold, onMoveToManualReview, onCancel, onAssign, isHover, onHoverSet, canMutate = true }: {
  w:AdminWithdrawalItem; checked:boolean; onToggle:()=>void; onRowClick:()=>void;
  onApprove:(w:AdminWithdrawalItem)=>void; onReject:(w:AdminWithdrawalItem)=>void;
  onRejectAndRefund:(w:AdminWithdrawalItem)=>void;
  onReprocess:(w:AdminWithdrawalItem)=>void;
  onHold:(w:AdminWithdrawalItem)=>void; onMoveToManualReview:(w:AdminWithdrawalItem)=>void;
  onCancel:(w:AdminWithdrawalItem)=>void; onAssign:(w:AdminWithdrawalItem)=>void;
  isHover:boolean; onHoverSet:(id:string|null)=>void;
  canMutate?: boolean;
}) {
  const amt = parseFloat(w.amount);
  const pri = derivePriority(amt);
  return (
    <tr
      onMouseEnter={()=>onHoverSet(w.id)} onMouseLeave={()=>onHoverSet(null)}
      style={{background:isHover?"rgba(255,255,255,0.025)":"transparent",cursor:"pointer",transition:"background 0.12s"}}
    >
      <td style={{padding:"11px 14px"}} onClick={e=>e.stopPropagation()}>
        <input type="checkbox" checked={checked} onChange={onToggle} style={{accentColor:GOLD,width:13,height:13}}/>
      </td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}>
        <span style={{fontFamily:"monospace",fontSize:11,color:"#60a5fa"}}>{w.id.slice(0,16)}…</span>
      </td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(212,175,55,0.1)",border:"1px solid rgba(212,175,55,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:GOLD,flexShrink:0}}>
            {w.user.firstName[0]}{w.user.lastName[0]}
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.82)"}}>@{w.user.username}</div>
            <div style={{fontSize:10,color:MUTED,fontFamily:"monospace"}}>{w.user.id.slice(0,8).toUpperCase()}</div>
          </div>
        </div>
      </td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}>
        <span style={{fontSize:13,fontWeight:700,color:amt>=5000?GOLD_L:"rgba(255,255,255,0.82)",fontFamily:"monospace"}}>{$(amt)}</span>
      </td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}>
        <span style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.65)",background:"rgba(255,255,255,0.06)",padding:"2px 7px",borderRadius:4}}>WITHDRAWAL</span>
      </td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}>
        <span style={{fontSize:10,color:MUTED}}>{w.network}</span>
      </td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}>
        <div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.65)"}}>{dt(new Date(w.createdAt))}</div>
          <div style={{fontSize:10,color:MUTED}}>{ago(new Date(w.createdAt))}</div>
        </div>
      </td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}><StatusBadge s={w.status}/></td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}><PriorityBadge p={pri}/></td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}>
        <span style={{fontSize:11,color:w.approver||w.completer?"#60a5fa":MUTED}}>
          {w.approver?.email?.split("@")[0] ?? w.completer?.email?.split("@")[0] ?? "unassigned"}
        </span>
      </td>
      <td style={{padding:"11px 8px"}} onClick={e=>e.stopPropagation()}>
         <ActionDropdown w={w} onApprove={onApprove} onReject={onReject} onRejectAndRefund={onRejectAndRefund} onReprocess={onReprocess} onHold={onHold} onMoveToManualReview={onMoveToManualReview} onView={onRowClick as never} onCancel={onCancel} onAssign={onAssign} canMutate={canMutate}/>
      </td>
    </tr>
  );
});

// ─── Analytics ────────────────────────────────────────────────────────────────
function AnalyticsSection({data, stats}:{data:AdminWithdrawalItem[];stats:AdminWithdrawalStats|null}) {
  const volumeData = useMemo(()=>{
    const days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    return days.map((d,i)=>({
      day:d,
      volume:data.filter(w=>{const dow=new Date(w.createdAt).getDay();return dow===((i+1)%7);}).reduce((s,w)=>s+parseFloat(w.amount),0)/1000,
      count: data.filter(w=>{const dow=new Date(w.createdAt).getDay();return dow===((i+1)%7);}).length,
    }));
  },[data]);
  const statusData = useMemo(()=>stats ? [
    {name:"Approved",  value:stats.approvedCount,   fill:"#34d399"},
    {name:"Completed", value:stats.completedCount,  fill:"#60a5fa"},
    {name:"Pending",   value:stats.pendingCount,    fill:"#fbbf24"},
    {name:"Rejected",  value:stats.rejectedCount,   fill:"#f87171"},
    {name:"Cancelled", value:stats.cancelledCount,  fill:MUTED},
  ] : [],[stats]);
  const rejReasons = [
    {reason:"Invalid Address",count:4},{reason:"Daily Limit",count:3},
    {reason:"Suspicious Activity",count:3},{reason:"KYC Not Verified",count:2},{reason:"Other",count:1},
  ];
  const networkData = useMemo(()=>{
    const map:Record<string,number>={};
    data.forEach(w=>{const net=w.network;map[net]=(map[net]??0)+parseFloat(w.amount);});
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([n,v])=>({network:n,volume:Math.round(v/1000)}));
  },[data]);
  const tck = {fontSize:10,fill:"rgba(170,179,197,0.6)"} as const;
  const ttip = {background:"hsl(222 62% 10%)",border:`1px solid ${BORDER}`,borderRadius:8,fontSize:11};
  return (
    <div style={{marginTop:24}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
        <BarChart2 size={14} style={{color:GOLD}}/>
        <span style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.82)",letterSpacing:"0.05em"}}>WITHDRAWAL ANALYTICS</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontSize:11,fontWeight:600,color:MUTED,marginBottom:12}}>DAILY WITHDRAWAL VOLUME (K$)</div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={volumeData} barSize={18}>
              <XAxis dataKey="day" tick={tck} axisLine={false} tickLine={false}/>
              <YAxis tick={tck} axisLine={false} tickLine={false} width={28}/>
              <Tooltip contentStyle={ttip} cursor={{fill:"rgba(255,255,255,0.03)"}}/>
              <Bar dataKey="volume" fill={GOLD} radius={[4,4,0,0]} opacity={0.85}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontSize:11,fontWeight:600,color:MUTED,marginBottom:12}}>STATUS DISTRIBUTION</div>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={2} dataKey="value">
                {statusData.map((e,i)=><Cell key={i} fill={e.fill} opacity={0.85}/>)}
              </Pie>
              <Legend iconSize={8} wrapperStyle={{fontSize:10,color:MUTED}}/>
              <Tooltip contentStyle={ttip}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontSize:11,fontWeight:600,color:MUTED,marginBottom:12}}>REJECTION REASONS</div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={rejReasons} layout="vertical" barSize={14}>
              <XAxis type="number" tick={tck} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="reason" tick={{fontSize:9,fill:"rgba(170,179,197,0.6)"}} axisLine={false} tickLine={false} width={90}/>
              <Tooltip contentStyle={ttip} cursor={{fill:"rgba(255,255,255,0.03)"}}/>
              <Bar dataKey="count" fill="#f87171" radius={[0,4,4,0]} opacity={0.8}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontSize:11,fontWeight:600,color:MUTED,marginBottom:12}}>VOLUME BY NETWORK (K$)</div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={networkData} barSize={18}>
              <XAxis dataKey="network" tick={tck} axisLine={false} tickLine={false}/>
              <YAxis tick={tck} axisLine={false} tickLine={false} width={28}/>
              <Tooltip contentStyle={ttip} cursor={{fill:"rgba(255,255,255,0.03)"}}/>
              <Bar dataKey="volume" fill="#60a5fa" radius={[4,4,0,0]} opacity={0.8}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
type ModalKind = "approve" | "reject" | "reject-refund" | "reprocess" | "hold" | "manual-review" | "cancel" | "assign" | null;
const ROWS_OPTIONS = [25, 50, 100];
const ADMIN_REVIEWERS = ["alice@primewave.io","bob@primewave.io","compliance@primewave.io","finance@primewave.io"];
const DEBOUNCE_MS = 400;

// ─── Mobile card ─────────────────────────────────────────────────────────────
function MobileWithdrawalCard({ w, onClick, onReprocess, onReject, onRejectAndRefund, onApprove, onMoveToManualReview, canMutate = true }: {
  w: AdminWithdrawalItem;
  onClick: () => void;
  onReprocess: (w: AdminWithdrawalItem) => void;
  onReject: (w: AdminWithdrawalItem) => void;
  onRejectAndRefund: (w: AdminWithdrawalItem) => void;
  onApprove: (w: AdminWithdrawalItem) => void;
  onMoveToManualReview: (w: AdminWithdrawalItem) => void;
  canMutate?: boolean;
}) {
  const displayStatus = getAdminWithdrawalDisplayStatus(w.status);
  const cfg = STATUS_CFG[displayStatus] ?? STATUS_CFG.PENDING;
  const sc = cfg.color;
  const priority = derivePriority(parseFloat(w.amount));
  const pc = priority === "URGENT" ? "#f87171" : priority === "VIP" ? "#a78bfa" : priority === "HIGH" ? "#fbbf24" : MUTED;
   const isActionable = canApproveStatus(w.status) || canRejectStatus(w.status) || canRejectAndRefundBroadcastUnknownStatus(w.status) || canMoveToManualReviewStatus(w.status);
  return (
    <div style={{ borderBottom: `1px solid ${BORDER}` }}>
      <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", cursor: "pointer" }}>
        <div style={{ width: 38, height: 38, borderRadius: 19, background: `${sc}12`, border: `1.5px solid ${sc}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: sc, flexShrink: 0 }}>
          {(w.user.username?.[0] ?? "?").toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>@{w.user.username}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: sc, background: `${sc}1a`, padding: "1px 6px", borderRadius: 4 }}>{cfg.label}</span>
            {priority !== "NORMAL" && <span style={{ fontSize: 10, color: pc }}>{priority}</span>}
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 11 }}>
            <span style={{ color: GOLD, fontWeight: 700 }}>{$(parseFloat(w.amount))}</span>
            <span style={{ color: MUTED }}>{w.network}</span>
          </div>
        </div>
        <ChevronRight size={14} style={{ color: MUTED, flexShrink: 0 }} />
      </div>
      {canMutate && isActionable && (
        <div style={{ display: "flex", gap: 8, padding: "0 14px 12px" }}>
          {canApproveStatus(w.status) && (
            <button
              onClick={e => { e.stopPropagation(); onApprove(w); }}
              style={{ flex: 1, padding: "7px 0", background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#34d399" }}
            >✓ Approve</button>
          )}
          {canRejectStatus(w.status) && <button
            onClick={e => { e.stopPropagation(); onReject(w); }}
            style={{ flex: 1, padding: "7px 0", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#f87171" }}
          >✕ Reject</button>}
          {canRejectAndRefundBroadcastUnknownStatus(w.status) && <button
            onClick={e => { e.stopPropagation(); onRejectAndRefund(w); }}
            style={{ flex: 1, padding: "7px 0", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#f87171" }}
          >↩ Reject & Refund</button>}
          {canMoveToManualReviewStatus(w.status) && <button
            onClick={e => { e.stopPropagation(); onMoveToManualReview(w); }}
            style={{ flex: 1, padding: "7px 0", background: "rgba(192,132,252,0.1)", border: "1px solid rgba(192,132,252,0.3)", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#c084fc" }}
          >↗ Manual Review</button>}
        </div>
      )}
    </div>
  );
}

export default function WithdrawalsPage() {
  const { isMobile } = useResponsive();
  const { toasts, toast, dismiss } = useToast();
  const { role } = useAuth();
  const isStaffOperations = role === "STAFF_OPERATIONS";

  // ── Data state ─────────────────────────────────────────────────────────────
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawalItem[]>([]);
  const [stats, setStats] = useState<AdminWithdrawalStats | null>(null);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filter / pagination state ──────────────────────────────────────────────
  const [search,     setSearch    ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status,     setStatus    ] = useState<AdminWithdrawalStatus | "">("");
  const [wallet,     setWallet    ] = useState("");
  const [minAmt,     setMinAmt    ] = useState("");
  const [maxAmt,     setMaxAmt    ] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [page,       setPage      ] = useState(1);
  const [rowsPer,    setRowsPer   ] = useState(25);
  const [sortBy,     setSortBy    ] = useState<"createdAt" | "amount">("createdAt");
  const [sortOrder,  setSortOrder ] = useState<"asc" | "desc">("desc");

  // ── UI state ───────────────────────────────────────────────────────────────
  const [selected,       setSelected      ] = useState<Set<string>>(new Set());
  const [hovered,        setHovered       ] = useState<string|null>(null);
  const [drawerW,        setDrawerW       ] = useState<DrawerWithdrawal|null>(null);
  const [drawerDetail,   setDrawerDetail  ] = useState<AdminWithdrawalDetail|null>(null);
  const [drawerLoading,  setDrawerLoading ] = useState(false);
  const [modalW,         setModalW        ] = useState<AdminWithdrawalItem|null>(null);
  const [modal,          setModal         ] = useState<ModalKind>(null);
  const [actionLoading,  setActionLoading ] = useState(false);
  const [assignReviewer, setAssignReviewer] = useState(ADMIN_REVIEWERS[0]);

  // ── Debounce search ────────────────────────────────────────────────────────
  const debounceTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { setDebouncedQ(val); setPage(1); }, DEBOUNCE_MS);
  };

  // ── Fetch withdrawals ──────────────────────────────────────────────────────
  const fetchWithdrawals = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await getAdminWithdrawals({
        page,
        limit:     rowsPer,
        status:    status || undefined,
        search:    debouncedQ || undefined,
        minAmount: minAmt ? Number(minAmt) : undefined,
        maxAmount: maxAmt ? Number(maxAmt) : undefined,
        sortBy,
        sortOrder,
      });
      setWithdrawals(res.withdrawals);
      setMeta(res.meta);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load withdrawals");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, rowsPer, status, debouncedQ, minAmt, maxAmt, sortBy, sortOrder]);

  // ── Fetch stats ────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const s = await getAdminWithdrawalStats();
      setStats(s);
    } catch {
      /* non-fatal */
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { void fetchWithdrawals(); }, [fetchWithdrawals]);
  useEffect(() => { void fetchStats(); }, [fetchStats]);

  // ── Open drawer ────────────────────────────────────────────────────────────
  const openDrawer = useCallback(async (item: AdminWithdrawalItem) => {
    setDrawerW(mapToDrawerWithdrawal(item));
    setDrawerDetail(null);
    setDrawerLoading(true);
    try {
      const detail = await getAdminWithdrawalById(item.id);
      setDrawerDetail(detail);
      setDrawerW(mapToDrawerWithdrawal(detail));
    } catch {
      /* keep basic drawer open */
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  const closeDrawer = useCallback(() => { setDrawerW(null); setDrawerDetail(null); }, []);

  // ── Action handlers ────────────────────────────────────────────────────────
  const openApprove    = useCallback((w:AdminWithdrawalItem)=>{setModalW(w);setModal("approve");},[]);
  const openReject     = useCallback((w:AdminWithdrawalItem)=>{setModalW(w);setModal("reject");},[]);
  const openRejectAndRefund = useCallback((w:AdminWithdrawalItem)=>{setModalW(w);setModal("reject-refund");},[]);
  const openReprocess  = useCallback((w:AdminWithdrawalItem)=>{setModalW(w);setModal("reprocess");},[]);
  const openHold    = useCallback((w:AdminWithdrawalItem)=>{setModalW(w);setModal("hold");},[]);
  const openManualReview = useCallback((w:AdminWithdrawalItem)=>{setModalW(w);setModal("manual-review");},[]);
  const openCancel  = useCallback((w:AdminWithdrawalItem)=>{setModalW(w);setModal("cancel");},[]);
  const openAssign  = useCallback((w:AdminWithdrawalItem)=>{setModalW(w);setModal("assign");},[]);
  const closeModal  = useCallback(()=>{setModal(null);setModalW(null);},[]);

  const openDrawerApprove = useCallback((dw: DrawerWithdrawal) => {
    const item = withdrawals.find(w => w.id === dw.id);
    if (item) { setModalW(item); setModal("approve"); }
  }, [withdrawals]);
  const openDrawerReject = useCallback((dw: DrawerWithdrawal) => {
    const item = withdrawals.find(w => w.id === dw.id);
    if (item) { setModalW(item); setModal("reject"); }
  }, [withdrawals]);
  const openDrawerHold = useCallback((dw: DrawerWithdrawal) => {
    const item = withdrawals.find(w => w.id === dw.id);
    if (item) { setModalW(item); setModal("hold"); }
  }, [withdrawals]);

  const refreshRowAndStats = useCallback(async (id: string) => {
    const [freshDetail] = await Promise.allSettled([
      getAdminWithdrawalById(id),
      fetchStats(),
    ]);
    if (freshDetail.status === "fulfilled") {
      const d = freshDetail.value;
      setWithdrawals(p => p.map(w => w.id === id ? d : w));
      if (drawerW?.id === id) {
        setDrawerW(mapToDrawerWithdrawal(d));
        setDrawerDetail(d);
      }
    }
  }, [drawerW, fetchStats]);

  const confirmApprove = useCallback(async (comment: string) => {
    if (isStaffOperations) return;
    if (!modalW) return;
    setActionLoading(true);
    try {
      await adminApproveWithdrawal(modalW.id, comment || undefined);
      toast(`Withdrawal approved`, "success");
      closeModal();
      await refreshRowAndStats(modalW.id);
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Approval failed", "error");
    } finally {
      setActionLoading(false);
    }
  }, [modalW, closeModal, toast, refreshRowAndStats, isStaffOperations]);

  const confirmReject = useCallback(async (reason: string, comment: string) => {
    if (isStaffOperations) return;
    if (!modalW) return;
    setActionLoading(true);
    try {
      await adminRejectWithdrawal(modalW.id, reason, comment || undefined);
      toast(`Withdrawal rejected: ${reason}`, "error");
      closeModal();
      await refreshRowAndStats(modalW.id);
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Rejection failed", "error");
    } finally {
      setActionLoading(false);
    }
  }, [modalW, closeModal, toast, refreshRowAndStats, isStaffOperations]);

  const confirmRejectAndRefund = useCallback(async (reason: string) => {
    if (isStaffOperations) return;
    if (!modalW || !canRejectAndRefundBroadcastUnknownStatus(modalW.status)) return;
    setActionLoading(true);
    try {
      const result = await adminRejectAndRefundBroadcastUnknown(modalW.id, reason);
      toast(
        result.alreadyReconciled
          ? "Withdrawal was already rejected and refunded"
          : `Withdrawal rejected and refunded ${$(result.refundedAmount)}`,
        "success",
      );
      closeModal();
      await refreshRowAndStats(modalW.id);
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Reject and refund failed", "error");
    } finally {
      setActionLoading(false);
    }
  }, [modalW, closeModal, toast, refreshRowAndStats, isStaffOperations]);

  const confirmHold = useCallback(async (reason: string, date: string) => {
    if (isStaffOperations) return;
    if (!modalW) return;
    setActionLoading(true);
    try {
      await adminHoldWithdrawal(modalW.id, reason, date || undefined);
      toast(`Withdrawal placed on hold — ${reason}`, "warn");
      closeModal();
      await refreshRowAndStats(modalW.id);
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Hold failed", "error");
    } finally {
      setActionLoading(false);
    }
  }, [modalW, closeModal, toast, refreshRowAndStats, isStaffOperations]);

  const confirmReprocess = useCallback(async () => {
    if (isStaffOperations) return;
    if (!modalW) return;
    setActionLoading(true);
    try {
      await adminReprocessWithdrawal(modalW.id);
      toast(`Withdrawal queued for reprocessing`, "success");
      closeModal();
      await refreshRowAndStats(modalW.id);
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Reprocess failed", "error");
    } finally {
      setActionLoading(false);
    }
  }, [modalW, closeModal, toast, refreshRowAndStats, isStaffOperations]);

  const confirmManualReview = useCallback(async (reason: string) => {
    if (isStaffOperations) return;
    if (!modalW || !canMoveToManualReviewStatus(modalW.status)) return;
    setActionLoading(true);
    try {
      const result = await adminMoveWithdrawalToManualReview(modalW.id, reason);
      toast(
        result.alreadyReconciled
          ? "Withdrawal was already in manual review"
          : "Withdrawal moved to manual review",
        "success",
      );
      closeModal();
      await refreshRowAndStats(modalW.id);
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : "Manual review reconciliation failed", "error");
    } finally {
      setActionLoading(false);
    }
  }, [modalW, closeModal, toast, refreshRowAndStats, isStaffOperations]);

  const confirmCancel = useCallback(() => {
    closeModal();
    toast("Cancel action not yet supported via API", "warn");
  }, [closeModal, toast]);

  const confirmAssign = useCallback(() => {
    if (!modalW) return;
    toast(`Assign Reviewer — Coming Soon`, "info");
    closeModal();
  }, [modalW, closeModal, toast]);

  const handleSaveNote = useCallback(async (text: string) => {
    if (!drawerDetail) return;
    await adminUpdateWithdrawalNotes(drawerDetail.id, text);
  }, [drawerDetail]);

  // ── Selection ──────────────────────────────────────────────────────────────
  const toggleRow  = useCallback((id:string)=>setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;}),[]);
  const toggleAll  = useCallback(()=>{
    if(withdrawals.every(w=>selected.has(w.id))) setSelected(s=>{const n=new Set(s);withdrawals.forEach(w=>n.delete(w.id));return n;});
    else setSelected(s=>{const n=new Set(s);withdrawals.forEach(w=>n.add(w.id));return n;});
  },[withdrawals,selected]);
  const allChecked = withdrawals.length>0&&withdrawals.every(w=>selected.has(w.id));

  // ── Selects styling ────────────────────────────────────────────────────────
  const sel:React.CSSProperties={background:"rgba(255,255,255,0.04)",border:`1px solid ${BORDER}`,borderRadius:8,padding:"7px 11px",fontSize:11,color:"rgba(255,255,255,0.7)",outline:"none",cursor:"pointer"};

  const pages = meta.totalPages || 1;

  return (
    <AdminLayout>
    <div style={{padding: isMobile ? 0 : "24px 28px",minHeight:"100vh",background:BG,boxSizing:"border-box"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,gap:12,flexWrap:"wrap"}}>
        <div>
          <h1 style={{margin:0,fontSize:isMobile?16:22,fontWeight:800,color:"rgba(255,255,255,0.92)"}}>Withdrawal Control Center</h1>
          {!isMobile && <p style={{margin:"4px 0 0",fontSize:12,color:MUTED}}>Review, approve, reject and monitor every withdrawal request.</p>}
        </div>
        <div style={{display:"flex",gap:8,flexShrink:0}}>
          <button onClick={()=>{void fetchWithdrawals();void fetchStats();}} style={{...sel,display:"flex",alignItems:"center",gap:5}}>
            {loading ? <Loader2 size={11} style={{animation:"spin 1s linear infinite"}}/> : <RefreshCw size={11}/>}
          </button>
          {!isMobile && <button style={{...sel,display:"flex",alignItems:"center",gap:5}}><Download size={11}/>Export</button>}
          {!isMobile && (
            <button style={{display:"flex",alignItems:"center",gap:5,padding:"7px 14px",background:"rgba(212,175,55,0.1)",border:"1px solid rgba(212,175,55,0.3)",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:700,color:GOLD_L}}>
              <Settings2 size={11}/>Settings
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div style={{background:"rgba(248,113,113,0.06)",border:"1px solid rgba(248,113,113,0.2)",borderRadius:10,padding:"14px 18px",marginBottom:20,display:"flex",alignItems:"center",gap:10}}>
          <AlertTriangle size={14} style={{color:"#f87171",flexShrink:0}}/>
          <span style={{fontSize:12,color:"#f87171",flex:1}}>{error}</span>
          <button onClick={()=>void fetchWithdrawals()} style={{fontSize:11,color:"#f87171",background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:6,padding:"4px 10px",cursor:"pointer"}}>Retry</button>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{display:"grid",gridTemplateColumns:`repeat(${isMobile?2:4},1fr)`,gap:12,marginBottom:20}}>
        <StatCard icon={FileText}    label="Total Requests"   value={statsLoading?"—":String(stats?.totalCount??0)}       sub="All time"                                             color="#60a5fa" bg="rgba(96,165,250,0.12)"    loading={statsLoading}/>
        <StatCard icon={Clock}       label="Pending Approval" value={statsLoading?"—":String(stats?.pendingCount??0)}      sub={stats?`${$(stats.pendingAmount)} pending`:""}         color="#fbbf24" bg="rgba(251,191,36,0.12)"   loading={statsLoading}/>
        <StatCard icon={CheckCircle} label="Approved Today"   value={statsLoading?"—":String(stats?.approvedToday??0)}    sub={stats?`${$(stats.approvedTodayAmount)} released`:""}  color="#34d399" bg="rgba(52,211,153,0.12)"   loading={statsLoading}/>
        <StatCard icon={X}           label="Rejected Today"   value={statsLoading?"—":String(stats?.rejectedToday??0)}    sub="Requires follow-up"                                   color="#f87171" bg="rgba(248,113,113,0.12)"  loading={statsLoading}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:`repeat(${isMobile?2:4},1fr)`,gap:12,marginBottom:24}}>
        <StatCard icon={DollarSign}  label="Total Pending Amount" value={statsLoading?"—":$(stats?.pendingAmount??0)}      sub={stats?`${stats.pendingCount} requests`:""}            color={GOLD}    bg="rgba(212,175,55,0.12)"   loading={statsLoading}/>
        <StatCard icon={TrendingUp}  label="Today's Payout"       value={statsLoading?"—":$(stats?.approvedTodayAmount??0)} sub="Completed withdrawals"                               color="#34d399" bg="rgba(52,211,153,0.12)"   loading={statsLoading}/>
        <StatCard icon={Clock}       label="Avg Processing Time"  value="4.2 hrs"                                           sub="Past 7 days"                                         color="#a78bfa" bg="rgba(167,140,250,0.12)"/>
        <StatCard icon={Percent}     label="Success Rate"         value={statsLoading?"—":`${stats?.successRate??0}%`}     sub="Approved / total"                                    color="#34d399" bg="rgba(52,211,153,0.12)"   loading={statsLoading}/>
      </div>

      {/* Priority + Queue row */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1.4fr 1fr",gap:14,marginBottom:24}}>
        <HighPriorityPanel data={withdrawals} onClick={w=>void openDrawer(w)}/>
        {!isMobile && <ProcessingQueue stats={stats}/>}
      </div>

      {/* Filter bar */}
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"12px 16px",marginBottom:14}}>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,flex:"1 1 220px",background:"rgba(255,255,255,0.04)",border:`1px solid ${BORDER}`,borderRadius:8,padding:"7px 11px"}}>
            <Search size={12} style={{color:MUTED,flexShrink:0}}/>
            <input value={search} onChange={e=>handleSearchChange(e.target.value)} placeholder="Search username, ID, address…" style={{background:"none",border:"none",outline:"none",fontSize:12,color:"rgba(255,255,255,0.75)",width:"100%"}}/>
            {search&&<X size={11} style={{color:MUTED,cursor:"pointer",flexShrink:0}} onClick={()=>{setSearch("");setDebouncedQ("");setPage(1);}}/>}
          </div>
          <select value={status} onChange={e=>{setStatus(e.target.value as AdminWithdrawalStatus|"");setPage(1);}} style={sel}>
            <option value="">All Statuses</option>
            {(["PENDING","APPROVED","UNDER_REVIEW","MANUAL_REVIEW","PROCESSING","CONFIRMING","BROADCAST_UNKNOWN","COMPLETED","FAILED","REJECTED","CANCELLED"] as AdminWithdrawalStatus[]).map(s=><option key={s} value={s}>{STATUS_CFG[s]?.label ?? s}</option>)}
          </select>
          <select value={sortBy} onChange={e=>{setSortBy(e.target.value as "createdAt"|"amount");setPage(1);}} style={sel}>
            <option value="createdAt">Sort: Date</option>
            <option value="amount">Sort: Amount</option>
          </select>
          <select value={sortOrder} onChange={e=>{setSortOrder(e.target.value as "asc"|"desc");setPage(1);}} style={sel}>
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </select>
          <button onClick={()=>setShowFilter(f=>!f)} style={{...sel,display:"flex",alignItems:"center",gap:5}}>
            <SlidersHorizontal size={11}/>{showFilter?"Less":"More"} <ChevronDown size={10} style={{transform:showFilter?"rotate(180deg)":"none",transition:"transform 0.2s"}}/>
          </button>
        </div>
        {showFilter&&(
          <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
            <input type="number" value={minAmt} onChange={e=>{setMinAmt(e.target.value);setPage(1);}} placeholder="Min $" style={{...sel,width:80}}/>
            <input type="number" value={maxAmt} onChange={e=>{setMaxAmt(e.target.value);setPage(1);}} placeholder="Max $" style={{...sel,width:80}}/>
            {(search||status||wallet||minAmt||maxAmt)&&(
              <button onClick={()=>{setSearch("");setDebouncedQ("");setStatus("");setWallet("");setMinAmt("");setMaxAmt("");setPage(1);}} style={{...sel,color:"#f87171",borderColor:"rgba(248,113,113,0.2)"}}>
                <X size={11}/> Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bulk actions */}
      {selected.size>0&&(
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 14px",background:"rgba(212,175,55,0.06)",border:`1px solid rgba(212,175,55,0.15)`,borderRadius:9,marginBottom:12}}>
          <span style={{fontSize:12,color:GOLD_L,fontWeight:600}}>{selected.size} selected</span>
          {[{label:"Bulk Approve",c:"#34d399"},{label:"Bulk Reject",c:"#f87171"},{label:"Bulk Hold",c:"#fbbf24"},{label:"Export",c:MUTED},{label:"Assign Reviewer",c:"#a78bfa"}].map(b=>(
            <button key={b.label} style={{padding:"5px 11px",background:"rgba(255,255,255,0.05)",border:`1px solid ${BORDER}`,borderRadius:6,cursor:"pointer",fontSize:11,color:b.c}}>{b.label}</button>
          ))}
          <button onClick={()=>setSelected(new Set())} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:MUTED}}><X size={13}/></button>
        </div>
      )}

      {/* Table */}
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,overflow:"hidden",marginBottom:10}}>
        {isMobile ? (
          <div>
            {loading
              ? Array.from({length:5},(_,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 14px",borderBottom:`1px solid ${BORDER}`}}>
                    <div style={{width:38,height:38,borderRadius:19,background:"rgba(255,255,255,0.06)",flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{width:120,height:12,background:"rgba(255,255,255,0.06)",borderRadius:4,marginBottom:7}}/>
                      <div style={{width:80,height:10,background:"rgba(255,255,255,0.04)",borderRadius:4}}/>
                    </div>
                  </div>
                ))
              : withdrawals.length===0
                ? <div style={{padding:"48px",textAlign:"center",color:MUTED,fontSize:12}}>{error ? "Error loading withdrawals." : "No withdrawals match your filters."}</div>
                : withdrawals.map(w=><MobileWithdrawalCard key={w.id} w={w} onClick={()=>void openDrawer(w)} onReprocess={openReprocess} onReject={openReject} onRejectAndRefund={openRejectAndRefund} onApprove={openApprove} onMoveToManualReview={openManualReview} canMutate={!isStaffOperations}/>)
            }
          </div>
        ) : (
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead style={{position:"sticky",top:0,zIndex:10,background:"hsl(222 62% 10%)"}}>
                <tr>
                  {[
                    {content:<input type="checkbox" checked={allChecked} onChange={toggleAll} style={{accentColor:GOLD,width:13,height:13}}/>,    w:"44px"},
                    {content:"Withdrawal ID", w:"140px"},{content:"Member",w:"180px"},{content:"Amount",w:"100px"},
                    {content:"Wallet",w:"100px"},{content:"Network",w:"110px"},{content:"Requested",w:"110px"},
                    {content:"Status",w:"100px"},{content:"Priority",w:"90px"},{content:"Assigned",w:"110px"},{content:"",w:"50px"},
                  ].map((col,i)=>(
                    <th key={i} style={{padding:"10px 8px",textAlign:"left",fontSize:10,fontWeight:700,color:MUTED,letterSpacing:"0.07em",whiteSpace:"nowrap",borderBottom:`1px solid ${BORDER}`,width:col.w}}>
                      {col.content}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({length:5}).map((_,i)=>(
                  <tr key={i}>
                    {Array.from({length:11}).map((_,j)=>(
                      <td key={j} style={{padding:"13px 8px"}}>
                        <div style={{height:12,background:"rgba(255,255,255,0.05)",borderRadius:4,width:j===2?"120px":j===3?"60px":"80px"}}/>
                      </td>
                    ))}
                  </tr>
                ))}
                {!loading && withdrawals.map(w=>(
                  <WithdrawalRow
                    key={w.id} w={w}
                    checked={selected.has(w.id)}
                    onToggle={()=>toggleRow(w.id)}
                    onRowClick={()=>void openDrawer(w)}
                     onApprove={openApprove} onReject={openReject} onRejectAndRefund={openRejectAndRefund} onReprocess={openReprocess} onHold={openHold} onMoveToManualReview={openManualReview} onCancel={openCancel} onAssign={openAssign}
                    canMutate={!isStaffOperations}
                    isHover={hovered===w.id}
                    onHoverSet={setHovered}
                  />
                ))}
                {!loading && withdrawals.length===0&&(
                  <tr><td colSpan={11} style={{padding:"48px",textAlign:"center",color:MUTED,fontSize:12}}>
                    {error ? "Error loading withdrawals." : "No withdrawals match your filters."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 4px"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:11,color:MUTED}}>Rows:</span>
          {ROWS_OPTIONS.map(n=>(
            <button key={n} onClick={()=>{setRowsPer(n);setPage(1);}} style={{padding:"3px 9px",background:rowsPer===n?"rgba(212,175,55,0.1)":"transparent",border:`1px solid ${rowsPer===n?"rgba(212,175,55,0.3)":BORDER}`,borderRadius:5,cursor:"pointer",fontSize:11,color:rowsPer===n?GOLD_L:MUTED}}>{n}</button>
          ))}
          <span style={{fontSize:11,color:MUTED,marginLeft:8}}>
            {meta.total === 0 ? "No results" : `Showing ${(page-1)*rowsPer+1}–${Math.min(page*rowsPer,meta.total)} of ${meta.total}`}
          </span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1} style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${BORDER}`,borderRadius:6,cursor:page<=1?"not-allowed":"pointer",padding:"5px 8px",color:page<=1?MUTED:"rgba(255,255,255,0.7)",display:"flex"}}><ChevronLeft size={13}/></button>
          {Array.from({length:Math.min(pages,7)},(_,i)=>{
            const pg=pages<=7?i+1:(page<=4?i+1:(page>=pages-3?pages-6+i:page-3+i));
            return <button key={pg} onClick={()=>setPage(pg)} style={{width:28,height:28,background:pg===page?"rgba(212,175,55,0.12)":"rgba(255,255,255,0.04)",border:`1px solid ${pg===page?"rgba(212,175,55,0.3)":BORDER}`,borderRadius:6,cursor:"pointer",fontSize:11,color:pg===page?GOLD_L:"rgba(255,255,255,0.6)",display:"flex",alignItems:"center",justifyContent:"center"}}>{pg}</button>;
          })}
          <button onClick={()=>setPage(p=>Math.min(pages,p+1))} disabled={page>=pages} style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${BORDER}`,borderRadius:6,cursor:page>=pages?"not-allowed":"pointer",padding:"5px 8px",color:page>=pages?MUTED:"rgba(255,255,255,0.7)",display:"flex"}}><ChevronRight size={13}/></button>
        </div>
      </div>

      {/* Analytics */}
      <AnalyticsSection data={withdrawals} stats={stats}/>

      {/* Drawer */}
      <WithdrawalDrawer
        withdrawal={drawerW}
        onClose={closeDrawer}
         onApprove={isStaffOperations ? undefined : openDrawerApprove}
         onReject={isStaffOperations ? undefined : openDrawerReject}
         onHold={isStaffOperations ? undefined : openDrawerHold}
        adminLogs={drawerDetail?.adminLogs as DrawerAuditLog[] | undefined}
        onSaveNote={drawerDetail ? handleSaveNote : undefined}
      />

      {/* Modals */}
      {!isStaffOperations && modal==="approve"&&modalW&&(
        <ApprovalModal
          w={{id:modalW.id,amount:parseFloat(modalW.amount),fee:0,username:modalW.user.username,walletType:"WITHDRAWAL",network:modalW.network,status:getAdminWithdrawalDisplayStatus(modalW.status),destinationAddress:modalW.walletAddress}}
          onClose={closeModal}
          onConfirm={(comment)=>void confirmApprove(comment)}
        />
      )}
      {!isStaffOperations && modal==="reject"&&modalW&&(
        <RejectModal
          w={{id:modalW.id,amount:parseFloat(modalW.amount),fee:0,username:modalW.user.username,walletType:"WITHDRAWAL",network:modalW.network,status:getAdminWithdrawalDisplayStatus(modalW.status),destinationAddress:modalW.walletAddress}}
          onClose={closeModal}
          onConfirm={(reason,comment)=>void confirmReject(reason,comment)}
        />
      )}
      {!isStaffOperations && modal==="reject-refund"&&modalW&&(
        <RejectAndRefundModal
          w={{id:modalW.id,amount:parseFloat(modalW.amount),fee:0,username:modalW.user.username,walletType:"WITHDRAWAL",network:modalW.network,status:getAdminWithdrawalDisplayStatus(modalW.status),destinationAddress:modalW.walletAddress}}
          onClose={closeModal}
          onConfirm={(reason)=>void confirmRejectAndRefund(reason)}
        />
      )}
      {!isStaffOperations && modal==="hold"&&modalW&&(
        <HoldModal
          w={{id:modalW.id,amount:parseFloat(modalW.amount),fee:0,username:modalW.user.username,walletType:"WITHDRAWAL",network:modalW.network,status:getAdminWithdrawalDisplayStatus(modalW.status),destinationAddress:modalW.walletAddress}}
          onClose={closeModal}
          onConfirm={(reason,date)=>void confirmHold(reason,date)}
        />
      )}
      {!isStaffOperations && modal==="manual-review"&&modalW&&(
        <ManualReviewModal
          w={{id:modalW.id,amount:parseFloat(modalW.amount),fee:0,username:modalW.user.username,walletType:"WITHDRAWAL",network:modalW.network,status:getAdminWithdrawalDisplayStatus(modalW.status),destinationAddress:modalW.walletAddress}}
          onClose={closeModal}
          onConfirm={(reason)=>void confirmManualReview(reason)}
        />
      )}

      {/* Reprocess confirm */}
      {!isStaffOperations && modal==="reprocess"&&modalW&&(
        <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.6)"}}>
          <div style={{background:"hsl(222 62% 8%)",border:`1px solid ${BORDER}`,borderRadius:14,padding:24,width:380,boxShadow:"0 24px 60px rgba(0,0,0,0.7)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <div style={{width:36,height:36,borderRadius:10,background:"rgba(96,165,250,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}><RotateCcw size={18} style={{color:"#60a5fa"}}/></div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.9)"}}>Re-process Withdrawal</div>
                <div style={{fontSize:11,color:MUTED}}>@{modalW.user.username} · {$(parseFloat(modalW.amount))} · {modalW.status}</div>
              </div>
            </div>
            <p style={{fontSize:12,color:MUTED,lineHeight:1.6,margin:"0 0 16px"}}>
              This will push the withdrawal into the automated queue (<span style={{color:"#60a5fa",fontWeight:600}}>QUEUED</span>) so the engine picks it up for processing. The member's funds remain locked until it completes or is rejected.
            </p>
            <div style={{display:"flex",gap:8}}>
              <button onClick={closeModal} style={{flex:1,padding:"9px 0",background:"rgba(255,255,255,0.04)",border:`1px solid ${BORDER}`,borderRadius:8,cursor:"pointer",fontSize:12,color:MUTED}}>Back</button>
              <button onClick={()=>void confirmReprocess()} style={{flex:2,padding:"9px 0",background:"rgba(96,165,250,0.12)",border:"1px solid rgba(96,165,250,0.3)",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600,color:"#60a5fa"}}>Re-process Withdrawal</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirm */}
      {modal==="cancel"&&modalW&&(
        <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.6)"}}>
          <div style={{background:"hsl(222 62% 8%)",border:`1px solid ${BORDER}`,borderRadius:14,padding:24,width:360,boxShadow:"0 24px 60px rgba(0,0,0,0.7)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <div style={{width:36,height:36,borderRadius:10,background:"rgba(248,113,113,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}><X size={18} style={{color:"#f87171"}}/></div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.9)"}}>Cancel Withdrawal</div>
                <div style={{fontSize:11,color:MUTED}}>{modalW.id.slice(0,16)}… · {$(parseFloat(modalW.amount))}</div>
              </div>
            </div>
            <p style={{fontSize:12,color:MUTED,lineHeight:1.6,margin:"0 0 16px"}}>This will mark the withdrawal as cancelled. The amount will not be deducted from the member's wallet.</p>
            <div style={{display:"flex",gap:8}}>
              <button onClick={closeModal} style={{flex:1,padding:"9px 0",background:"rgba(255,255,255,0.04)",border:`1px solid ${BORDER}`,borderRadius:8,cursor:"pointer",fontSize:12,color:MUTED}}>Back</button>
              <button onClick={confirmCancel} style={{flex:2,padding:"9px 0",background:"rgba(248,113,113,0.12)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600,color:"#f87171"}}>Cancel Withdrawal</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign reviewer */}
      {modal==="assign"&&modalW&&(
        <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.6)"}}>
          <div style={{background:"hsl(222 62% 8%)",border:`1px solid ${BORDER}`,borderRadius:14,padding:24,width:360,boxShadow:"0 24px 60px rgba(0,0,0,0.7)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <div style={{width:36,height:36,borderRadius:10,background:"rgba(96,165,250,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}><UserCheck size={18} style={{color:"#60a5fa"}}/></div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.9)"}}>Assign Reviewer</div>
                <div style={{fontSize:11,color:MUTED}}>{modalW.id.slice(0,16)}… — Coming Soon</div>
              </div>
            </div>
            <p style={{fontSize:12,color:MUTED,lineHeight:1.6,margin:"0 0 16px"}}>Reviewer assignment will be available in a future update.</p>
            <div style={{display:"flex",gap:8}}>
              <button onClick={closeModal} style={{flex:1,padding:"9px 0",background:"rgba(255,255,255,0.04)",border:`1px solid ${BORDER}`,borderRadius:8,cursor:"pointer",fontSize:12,color:MUTED}}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Action loading overlay */}
      {actionLoading && (
        <div style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.4)"}}>
          <div style={{background:"hsl(222 62% 10%)",border:`1px solid ${BORDER}`,borderRadius:12,padding:"20px 28px",display:"flex",alignItems:"center",gap:12}}>
            <Loader2 size={18} style={{color:GOLD,animation:"spin 1s linear infinite"}}/>
            <span style={{fontSize:13,color:"rgba(255,255,255,0.82)"}}>Processing…</span>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
      <ToastContainer toasts={toasts} onDismiss={dismiss}/>
    </div>
    </AdminLayout>
  );
}
