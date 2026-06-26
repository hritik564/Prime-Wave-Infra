import { useState, useMemo, useCallback, memo } from "react";
import {
  Search, Download, RefreshCw, Settings2, ChevronDown,
  CheckCircle, X, Clock, Shield, AlertTriangle, Wallet,
  TrendingUp, DollarSign, Percent, ArrowDownLeft, Users,
  SlidersHorizontal, ChevronLeft, ChevronRight, MoreHorizontal,
  UserCheck, FileText, BarChart2, Eye, Trash2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import AdminLayout from "./AdminLayout";
import WithdrawalDrawer, { type DrawerWithdrawal } from "./WithdrawalDrawer";
import { ApprovalModal, RejectModal, HoldModal } from "./WithdrawalModals";
import { useToast, ToastContainer } from "@/components/admin/Toast";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const BG     = "hsl(222 62% 7%)";

// ─── Types ────────────────────────────────────────────────────────────────────
type Status   = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "RELEASED";
type Priority = "NORMAL"  | "HIGH"     | "VIP"      | "URGENT";
type PayMeth  = "USDT"    | "BANK"     | "CRYPTO";

interface Withdrawal extends DrawerWithdrawal {}

// ─── Mock data ────────────────────────────────────────────────────────────────
const NAMES  = ["alex","maria","james","sophie","chen","amir","fatima","peter","yuki","ravi","diana","carlos","nina","kwame","li","sarah","omar","elena","dan","priya","ben","ana","raj","mia","sam"];
const FIRSTS = ["Alex","Maria","James","Sophie","Chen","Amir","Fatima","Peter","Yuki","Ravi","Diana","Carlos","Nina","Kwame","Li","Sarah","Omar","Elena","Dan","Priya","Ben","Ana","Raj","Mia","Sam"];
const LASTS  = ["Chen","Rossi","Park","Mueller","Ali","Patel","Kim","Silva","Jones","Nguyen","Osei","García","Ivanova","Brown","Tanaka","Wilson","Hassan","Kowalski","Smith","Sharma","Taylor","Andrade","Khan","Liu","Thompson"];
const COUNTRIES  = ["United States","United Kingdom","India","UAE","Nigeria","Brazil","Singapore","Malaysia","Philippines","Indonesia","Canada","Germany","France","Australia","South Korea"];
const NETWORKS   = ["USDT-TRC20","USDT-ERC20","BTC","ETH","BNB","BANK-TRANSFER"];
const PAY_METHS: PayMeth[] = ["USDT","BANK","CRYPTO"];
const STATUSES: Status[]   = ["PENDING","PENDING","PENDING","APPROVED","APPROVED","RELEASED","REJECTED","CANCELLED"];
const PRIORITIES: Priority[]= ["NORMAL","NORMAL","NORMAL","HIGH","HIGH","VIP","URGENT"];
const RANKS  = ["Bronze","Silver","Gold","Diamond","Ruby","Platinum",null];
const ADMINS = ["finance@pw.io","compliance@pw.io","ops@pw.io","admin@pw.io"];
const TRC20  = () => "T"+Math.random().toString(36).slice(2,36).toUpperCase();
const ERC20  = () => "0x"+Array.from({length:40},()=>"0123456789abcdef"[Math.floor(Math.random()*16)]).join("");
const TXHASH = () => "0x"+Array.from({length:64},()=>"0123456789abcdef"[Math.floor(Math.random()*16)]).join("");
const rnd    = (a:number,b:number) => Math.floor(Math.random()*(b-a+1))+a;
const pick   = <T,>(arr:T[]): T => arr[rnd(0,arr.length-1)];
const seed   = (n:number) => {
  let x = n; return()=>{ x=(x*1664525+1013904223)&0xffffffff; return (x>>>0)/4294967296; };
};

const INITIAL_WITHDRAWALS: Withdrawal[] = Array.from({length:70},(_, i)=>{
  const r    = seed(i*97+13);
  const ui   = Math.floor(r()*NAMES.length);
  const name = NAMES[ui];  const first=FIRSTS[ui]; const last=LASTS[Math.floor(r()*LASTS.length)];
  const status: Status = STATUSES[Math.floor(r()*STATUSES.length)];
  const priority: Priority = PRIORITIES[Math.floor(r()*PRIORITIES.length)];
  const method: PayMeth = PAY_METHS[Math.floor(r()*PAY_METHS.length)];
  const net  = NETWORKS[Math.floor(r()*NETWORKS.length)];
  const amount = [50,100,250,500,750,1000,1500,2000,3500,5000,7500,10000,15000,25000][Math.floor(r()*14)];
  const fee   = Math.round(amount*0.015);
  const daysAgo= Math.floor(r()*14);
  const reqAt  = new Date(Date.now()-daysAgo*86400000-rnd(0,86399)*1000);
  const procAt = (status==="APPROVED"||status==="RELEASED"||status==="REJECTED") ? new Date(reqAt.getTime()+rnd(1800000,28800000)) : null;
  const hasHash= status==="RELEASED"||status==="APPROVED";
  const addr   = net.startsWith("USDT-TRC20") ? TRC20() : (net==="BANK-TRANSFER"?"IBAN: GB29NWBK60161331926819": ERC20());
  const walletType = pick(["INCOME","DEPOSIT","WITHDRAWAL"]);
  return {
    id:`WDR2026${String(i+1).padStart(3,"0")}`,
    username:name, firstName:first, lastName:last,
    memberId:`MEM${String(i+101).padStart(4,"0")}`,
    amount, fee, walletType, paymentMethod:method, network:net,
    walletAddress:addr,
    transactionHash: hasHash ? TXHASH() : null,
    status, priority,
    requestedAt:reqAt, processedAt:procAt,
    assignedAdmin: (status!=="PENDING"||r()>0.5) ? ADMINS[Math.floor(r()*ADMINS.length)] : null,
    country:COUNTRIES[Math.floor(r()*COUNTRIES.length)],
    rank:RANKS[Math.floor(r()*RANKS.length)],
    memberStatus: r()<0.82?"ACTIVE":r()<0.5?"INACTIVE":"SUSPENDED",
    sponsor: r()<0.7 ? NAMES[Math.floor(r()*NAMES.length)] : null,
    depositWallet:  Math.round(r()*8000*100)/100,
    incomeWallet:   Math.round(r()*12000*100)/100,
    withdrawalWallet: amount + Math.round(r()*3000*100)/100,
  };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const $ = (n: number) => `$${n.toLocaleString()}`;
const dtt = (d: Date) => d.toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
const dt  = (d: Date) => d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
const ago = (d: Date) => {
  const s=Math.floor((Date.now()-d.getTime())/1000);
  if(s<60)return"just now";if(s<3600)return`${Math.floor(s/60)}m`;
  if(s<86400)return`${Math.floor(s/3600)}h`;return`${Math.floor(s/86400)}d`;
};

const STATUS_CFG: Record<Status,{color:string;bg:string;label:string}> = {
  PENDING:   {color:"#fbbf24",bg:"rgba(251,191,36,0.12)",  label:"Pending"},
  APPROVED:  {color:"#34d399",bg:"rgba(52,211,153,0.12)",  label:"Approved"},
  REJECTED:  {color:"#f87171",bg:"rgba(248,113,113,0.12)", label:"Rejected"},
  CANCELLED: {color:MUTED,    bg:"rgba(170,179,197,0.08)", label:"Cancelled"},
  RELEASED:  {color:"#60a5fa",bg:"rgba(96,165,250,0.12)",  label:"Released"},
};
const PRI_CFG: Record<Priority,{color:string;bg:string}> = {
  NORMAL: {color:MUTED,     bg:"rgba(170,179,197,0.06)"},
  HIGH:   {color:"#fbbf24", bg:"rgba(251,191,36,0.1)"},
  VIP:    {color:GOLD,      bg:"rgba(212,175,55,0.1)"},
  URGENT: {color:"#f87171", bg:"rgba(248,113,113,0.1)"},
};

// ─── StatusBadge / PriorityBadge ─────────────────────────────────────────────
function StatusBadge({s}:{s:Status}) {
  const c=STATUS_CFG[s];
  return <span style={{fontSize:10,fontWeight:700,color:c.color,background:c.bg,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap"}}>{c.label}</span>;
}
function PriorityBadge({p}:{p:Priority}) {
  const c=PRI_CFG[p];
  return <span style={{fontSize:10,fontWeight:700,color:c.color,background:c.bg,padding:"2px 7px",borderRadius:4,whiteSpace:"nowrap"}}>{p}</span>;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({icon:Icon,label,value,sub,color="rgba(255,255,255,0.78)",bg="#3b3b4a"}: {
  icon:React.ElementType;label:string;value:string;sub?:string;color?:string;bg?:string;
}) {
  return (
    <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"16px 18px",minWidth:0}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <div style={{width:32,height:32,borderRadius:9,background:bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <Icon size={15} style={{color}} />
        </div>
        <span style={{fontSize:11,color:MUTED,fontWeight:500}}>{label}</span>
      </div>
      <div style={{fontSize:22,fontWeight:800,color:"rgba(255,255,255,0.92)",marginBottom:3}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:MUTED}}>{sub}</div>}
    </div>
  );
}

// ─── HighPriorityPanel ────────────────────────────────────────────────────────
function HighPriorityPanel({data,onClick}:{data:Withdrawal[];onClick:(w:Withdrawal)=>void}) {
  const top5=useMemo(()=>data.filter(w=>w.status==="PENDING"&&(w.priority!=="NORMAL"||w.amount>=5000)).sort((a,b)=>{
    const pmap:{[k:string]:number}={URGENT:3,VIP:2,HIGH:1,NORMAL:0};
    return (pmap[b.priority]??0)-(pmap[a.priority]??0)||(b.amount-a.amount);
  }).slice(0,5),[data]);
  return (
    <div style={{background:CARD,border:`1px solid rgba(248,113,113,0.15)`,borderRadius:12,padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}>
        <AlertTriangle size={13} style={{color:"#f87171"}}/>
        <span style={{fontSize:11,fontWeight:700,color:"#f87171",letterSpacing:"0.08em"}}>HIGH PRIORITY</span>
        <span style={{fontSize:10,color:MUTED,marginLeft:"auto"}}>{top5.length} requiring attention</span>
      </div>
      {top5.length===0&&<div style={{fontSize:12,color:MUTED,textAlign:"center",padding:"10px 0"}}>No high-priority items</div>}
      {top5.map((w,i)=>(
        <div key={w.id} onClick={()=>onClick(w)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:i<top5.length-1?`1px solid rgba(255,255,255,0.04)`:"none",cursor:"pointer"}} >
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:10,color:MUTED,width:14}}>{i+1}.</span>
            <div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.82)",fontWeight:500}}>@{w.username}</div>
              <div style={{fontSize:10,color:MUTED,fontFamily:"monospace"}}>{w.id}</div>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:12,fontWeight:700,color:GOLD_L}}>{$(w.amount)}</div>
            <PriorityBadge p={w.priority as Priority}/>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── ProcessingQueue ──────────────────────────────────────────────────────────
function ProcessingQueue({data}:{data:Withdrawal[]}) {
  const buckets = [
    {label:"Pending",     status:"PENDING",   color:"#fbbf24"},
    {label:"Approved",    status:"APPROVED",  color:"#34d399"},
    {label:"Released",    status:"RELEASED",  color:"#60a5fa"},
    {label:"Rejected",    status:"REJECTED",  color:"#f87171"},
    {label:"Cancelled",   status:"CANCELLED", color:MUTED},
  ];
  return (
    <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}>
        <BarChart2 size={13} style={{color:GOLD}}/>
        <span style={{fontSize:11,fontWeight:700,color:MUTED,letterSpacing:"0.08em"}}>PROCESSING QUEUE</span>
      </div>
      {buckets.map(b=>{
        const count=data.filter(w=>w.status===b.status).length;
        const total=data.filter(w=>w.status===b.status).reduce((s,w)=>s+w.amount,0);
        const pct=Math.round((count/data.length)*100);
        return(
          <div key={b.label} style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>{b.label}</span>
              <div style={{display:"flex",gap:8}}>
                <span style={{fontSize:11,fontWeight:600,color:b.color}}>{count}</span>
                <span style={{fontSize:10,color:MUTED}}>{$(total)}</span>
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
function ActionDropdown({ w, onApprove, onReject, onHold, onView, onCancel, onAssign }: {
  w: Withdrawal;
  onApprove:(w:Withdrawal)=>void; onReject:(w:Withdrawal)=>void;
  onHold:(w:Withdrawal)=>void; onView:(w:Withdrawal)=>void;
  onCancel:(w:Withdrawal)=>void; onAssign:(w:Withdrawal)=>void;
}) {
  const [open,setOpen]=useState(false);
  const items=[
    {icon:Eye,         label:"View Details",    color:"rgba(255,255,255,0.7)", fn:()=>onView(w)},
    ...(w.status==="PENDING"?[
      {icon:CheckCircle, label:"Approve",         color:"#34d399", fn:()=>onApprove(w)},
      {icon:X,           label:"Reject",          color:"#f87171", fn:()=>onReject(w)},
      {icon:Clock,       label:"Hold",            color:"#fbbf24", fn:()=>onHold(w)},
      {icon:X,           label:"Cancel",          color:"#f87171", fn:()=>onCancel(w)},
    ]:[]),
    {icon:UserCheck,   label:"Assign Reviewer", color:"rgba(255,255,255,0.7)", fn:()=>onAssign(w)},
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
const WithdrawalRow = memo(function WithdrawalRow({ w, checked, onToggle, onRowClick, onApprove, onReject, onHold, onCancel, onAssign, isHover, onHoverSet }: {
  w:Withdrawal; checked:boolean; onToggle:()=>void; onRowClick:()=>void;
  onApprove:(w:Withdrawal)=>void; onReject:(w:Withdrawal)=>void; onHold:(w:Withdrawal)=>void;
  onCancel:(w:Withdrawal)=>void; onAssign:(w:Withdrawal)=>void;
  isHover:boolean; onHoverSet:(id:string|null)=>void;
}) {
  return (
    <tr
      onMouseEnter={()=>onHoverSet(w.id)} onMouseLeave={()=>onHoverSet(null)}
      style={{background:isHover?"rgba(255,255,255,0.025)":"transparent",cursor:"pointer",transition:"background 0.12s"}}
    >
      <td style={{padding:"11px 14px"}} onClick={e=>e.stopPropagation()}>
        <input type="checkbox" checked={checked} onChange={onToggle} style={{accentColor:GOLD,width:13,height:13}}/>
      </td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}>
        <span style={{fontFamily:"monospace",fontSize:11,color:"#60a5fa"}}>{w.id}</span>
      </td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(212,175,55,0.1)",border:"1px solid rgba(212,175,55,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:GOLD,flexShrink:0}}>
            {w.firstName[0]}{w.lastName[0]}
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.82)"}}>@{w.username}</div>
            <div style={{fontSize:10,color:MUTED,fontFamily:"monospace"}}>{w.memberId}</div>
          </div>
        </div>
      </td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}>
        <span style={{fontSize:13,fontWeight:700,color:w.amount>=5000?GOLD_L:"rgba(255,255,255,0.82)",fontFamily:"monospace"}}>{$(w.amount)}</span>
      </td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}>
        <span style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.65)",background:"rgba(255,255,255,0.06)",padding:"2px 7px",borderRadius:4}}>{w.walletType}</span>
      </td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}>
        <span style={{fontSize:10,color:MUTED}}>{w.network}</span>
      </td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}>
        <div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.65)"}}>{dt(w.requestedAt)}</div>
          <div style={{fontSize:10,color:MUTED}}>{ago(w.requestedAt)}</div>
        </div>
      </td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}><StatusBadge s={w.status as Status}/></td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}><PriorityBadge p={w.priority as Priority}/></td>
      <td style={{padding:"11px 8px"}} onClick={onRowClick}>
        <span style={{fontSize:11,color:w.assignedAdmin?"#60a5fa":MUTED}}>{w.assignedAdmin?w.assignedAdmin.split("@")[0]:"unassigned"}</span>
      </td>
      <td style={{padding:"11px 8px"}} onClick={e=>e.stopPropagation()}>
        <ActionDropdown w={w} onApprove={onApprove} onReject={onReject} onHold={onHold} onView={onRowClick as never} onCancel={onCancel} onAssign={onAssign}/>
      </td>
    </tr>
  );
});

// ─── Analytics ────────────────────────────────────────────────────────────────
const CHART_TOOLTIP: React.CSSProperties = {};
function AnalyticsSection({data}:{data:Withdrawal[]}) {
  const volumeData = useMemo(()=>{
    const days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    return days.map((d,i)=>({
      day:d,
      volume:data.filter(w=>{const dow=w.requestedAt.getDay();return dow===((i+1)%7);}).reduce((s,w)=>s+w.amount,0)/1000,
      count: data.filter(w=>{const dow=w.requestedAt.getDay();return dow===((i+1)%7);}).length,
    }));
  },[data]);
  const statusData = useMemo(()=>([
    {name:"Approved", value:data.filter(w=>w.status==="APPROVED").length,  fill:"#34d399"},
    {name:"Released", value:data.filter(w=>w.status==="RELEASED").length,  fill:"#60a5fa"},
    {name:"Pending",  value:data.filter(w=>w.status==="PENDING").length,   fill:"#fbbf24"},
    {name:"Rejected", value:data.filter(w=>w.status==="REJECTED").length,  fill:"#f87171"},
    {name:"Cancelled",value:data.filter(w=>w.status==="CANCELLED").length, fill:MUTED},
  ]),[data]);
  const rejReasons = [
    {reason:"Invalid Address",count:4},{reason:"Daily Limit",count:3},
    {reason:"Suspicious Activity",count:3},{reason:"KYC Not Verified",count:2},{reason:"Other",count:1},
  ];
  const countryData = useMemo(()=>{
    const map:Record<string,number>={};
    data.forEach(w=>{map[w.country]=(map[w.country]??0)+w.amount;});
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([c,v])=>({country:c.split(" ")[0],volume:Math.round(v/1000)}));
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
        {/* Daily Volume */}
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
        {/* Status Distribution */}
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
        {/* Rejection Reasons */}
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
        {/* Country Distribution */}
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontSize:11,fontWeight:600,color:MUTED,marginBottom:12}}>COUNTRY VOLUME (K$)</div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={countryData} barSize={18}>
              <XAxis dataKey="country" tick={tck} axisLine={false} tickLine={false}/>
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
type ModalKind = "approve" | "reject" | "hold" | "cancel" | "assign" | null;
const ROWS_OPTIONS = [25, 50, 100];
const ADMIN_REVIEWERS = ["alice@primewave.io","bob@primewave.io","compliance@primewave.io","finance@primewave.io"];

export default function WithdrawalsPage() {
  // ── State ──────────────────────────────────────────────────────────────────
  const { toasts, toast, dismiss } = useToast();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>(() => [...INITIAL_WITHDRAWALS]);
  const updateWithdrawal = useCallback((id: string, patch: Partial<Withdrawal>) => {
    setWithdrawals(p => p.map(w => w.id === id ? {...w, ...patch} : w));
  }, []);

  const [search,  setSearch  ] = useState("");
  const [status,  setStatus  ] = useState<Status|"">("");
  const [method,  setMethod  ] = useState<PayMeth|"">("");
  const [wallet,  setWallet  ] = useState("");
  const [country, setCountry ] = useState("");
  const [minAmt,  setMinAmt  ] = useState("");
  const [maxAmt,  setMaxAmt  ] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [page,    setPage    ] = useState(1);
  const [rowsPer, setRowsPer ] = useState(25);
  const [selected,setSelected] = useState<Set<string>>(new Set());
  const [hovered, setHovered ] = useState<string|null>(null);
  const [drawerW, setDrawerW ] = useState<Withdrawal|null>(null);
  const [modalW,  setModalW  ] = useState<Withdrawal|null>(null);
  const [modal,   setModal   ] = useState<ModalKind>(null);
  const [assignReviewer, setAssignReviewer] = useState(ADMIN_REVIEWERS[0]);

  // ── Filtered data ──────────────────────────────────────────────────────────
  const filtered = useMemo(()=>{
    const q=search.toLowerCase();
    return withdrawals.filter(w=>{
      if(status&&w.status!==status)return false;
      if(method&&w.paymentMethod!==method)return false;
      if(wallet&&w.walletType!==wallet)return false;
      if(country&&w.country!==country)return false;
      if(minAmt&&w.amount<Number(minAmt))return false;
      if(maxAmt&&w.amount>Number(maxAmt))return false;
      if(q&&!w.username.includes(q)&&!w.id.toLowerCase().includes(q)&&!w.memberId.toLowerCase().includes(q)&&!(w.transactionHash??'').toLowerCase().includes(q))return false;
      return true;
    });
  },[withdrawals,search,status,method,wallet,country,minAmt,maxAmt]);

  const pages     = Math.max(1,Math.ceil(filtered.length/rowsPer));
  const safePage  = Math.min(page,pages);
  const pageData  = filtered.slice((safePage-1)*rowsPer,safePage*rowsPer);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const pending   = withdrawals.filter(w=>w.status==="PENDING");
  const todayAcc  = withdrawals.filter(w=>w.status==="APPROVED"&&w.processedAt&&new Date(w.processedAt).toDateString()===new Date().toDateString());
  const todayRej  = withdrawals.filter(w=>w.status==="REJECTED"&&w.processedAt&&new Date(w.processedAt).toDateString()===new Date().toDateString());
  const pendingAmt= pending.reduce((s,w)=>s+w.amount,0);
  const todayPay  = todayAcc.reduce((s,w)=>s+w.amount,0);
  const approved  = withdrawals.filter(w=>w.status==="APPROVED"||w.status==="RELEASED");
  const total     = approved.length+withdrawals.filter(w=>w.status==="REJECTED").length;
  const rate      = total>0?((approved.length/total)*100).toFixed(1):"0.0";

  // ── Handlers ───────────────────────────────────────────────────────────────
  const openDrawer = useCallback((w:Withdrawal)=>setDrawerW(w),[]);
  const openApprove= useCallback((w:Withdrawal)=>{setModalW(w);setModal("approve");},[]);
  const openReject = useCallback((w:Withdrawal)=>{setModalW(w);setModal("reject");},[]);
  const openHold   = useCallback((w:Withdrawal)=>{setModalW(w);setModal("hold");},[]);
  const openCancel = useCallback((w:Withdrawal)=>{setModalW(w);setModal("cancel");},[]);
  const openAssign = useCallback((w:Withdrawal)=>{setModalW(w);setModal("assign");},[]);
  const closeModal = useCallback(()=>{setModal(null);setModalW(null);},[]);

  const confirmApprove = useCallback((comment: string) => {
    if(!modalW) return;
    updateWithdrawal(modalW.id, { status:"APPROVED", processedAt:new Date(), assignedAdmin:"admin@primewave.io" });
    setDrawerW(d => d?.id===modalW.id ? {...d, status:"APPROVED", processedAt:new Date(), assignedAdmin:"admin@primewave.io"} : d);
    toast(`Withdrawal ${modalW.id} approved${comment?" — "+comment.slice(0,40):""}`, "success");
    closeModal();
  }, [modalW, updateWithdrawal, toast, closeModal]);

  const confirmReject = useCallback((reason: string, _comment: string) => {
    if(!modalW) return;
    updateWithdrawal(modalW.id, { status:"REJECTED", processedAt:new Date(), assignedAdmin:"admin@primewave.io" });
    setDrawerW(d => d?.id===modalW.id ? {...d, status:"REJECTED", processedAt:new Date()} : d);
    toast(`Withdrawal ${modalW.id} rejected: ${reason}`, "error");
    closeModal();
  }, [modalW, updateWithdrawal, toast, closeModal]);

  const confirmHold = useCallback((reason: string, _date: string) => {
    if(!modalW) return;
    updateWithdrawal(modalW.id, { assignedAdmin:"compliance@primewave.io" });
    toast(`Withdrawal ${modalW.id} placed on hold — ${reason}`, "warn");
    closeModal();
  }, [modalW, updateWithdrawal, toast, closeModal]);

  const confirmCancel = useCallback(() => {
    if(!modalW) return;
    updateWithdrawal(modalW.id, { status:"CANCELLED", processedAt:new Date() });
    setDrawerW(d => d?.id===modalW.id ? {...d, status:"CANCELLED", processedAt:new Date()} : d);
    toast(`Withdrawal ${modalW.id} cancelled`, "warn");
    closeModal();
  }, [modalW, updateWithdrawal, toast, closeModal]);

  const confirmAssign = useCallback(() => {
    if(!modalW) return;
    updateWithdrawal(modalW.id, { assignedAdmin: assignReviewer });
    toast(`Assigned ${assignReviewer} to ${modalW.id}`, "info");
    closeModal();
  }, [modalW, assignReviewer, updateWithdrawal, toast, closeModal]);

  const toggleRow  = useCallback((id:string)=>setSelected(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;}),[]);
  const toggleAll  = useCallback(()=>{
    if(pageData.every(w=>selected.has(w.id))) setSelected(s=>{const n=new Set(s);pageData.forEach(w=>n.delete(w.id));return n;});
    else setSelected(s=>{const n=new Set(s);pageData.forEach(w=>n.add(w.id));return n;});
  },[pageData,selected]);
  const allChecked = pageData.length>0&&pageData.every(w=>selected.has(w.id));

  // ── Selects styling ────────────────────────────────────────────────────────
  const sel:React.CSSProperties={background:"rgba(255,255,255,0.04)",border:`1px solid ${BORDER}`,borderRadius:8,padding:"7px 11px",fontSize:11,color:"rgba(255,255,255,0.7)",outline:"none",cursor:"pointer"};

  return (
    <AdminLayout>
    <div style={{padding:"24px 28px",minHeight:"100vh",background:BG,boxSizing:"border-box"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,gap:12}}>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:800,color:"rgba(255,255,255,0.92)"}}>Withdrawal Control Center</h1>
          <p style={{margin:"4px 0 0",fontSize:12,color:MUTED}}>Review, approve, reject and monitor every withdrawal request.</p>
        </div>
        <div style={{display:"flex",gap:8,flexShrink:0}}>
          <button style={{...sel,display:"flex",alignItems:"center",gap:5}}><RefreshCw size={11}/>Refresh</button>
          <button style={{...sel,display:"flex",alignItems:"center",gap:5}}><Download size={11}/>Export</button>
          <button style={{display:"flex",alignItems:"center",gap:5,padding:"7px 14px",background:"rgba(212,175,55,0.1)",border:"1px solid rgba(212,175,55,0.3)",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:700,color:GOLD_L}}>
            <Settings2 size={11}/>Settlement Settings
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        <StatCard icon={FileText}     label="Total Requests"       value={String(withdrawals.length)}      sub="All time"                        color="#60a5fa" bg="rgba(96,165,250,0.12)"/>
        <StatCard icon={Clock}        label="Pending Approval"     value={String(pending.length)}          sub={$(pendingAmt)+" pending"}         color="#fbbf24" bg="rgba(251,191,36,0.12)"/>
        <StatCard icon={CheckCircle}  label="Approved Today"       value={String(todayAcc.length)}         sub={$(todayPay)+" approved"}          color="#34d399" bg="rgba(52,211,153,0.12)"/>
        <StatCard icon={X}            label="Rejected Today"       value={String(todayRej.length)}         sub="Requires follow-up"               color="#f87171" bg="rgba(248,113,113,0.12)"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
        <StatCard icon={DollarSign}   label="Total Pending Amount" value={$(pendingAmt)}                   sub={`${pending.length} requests`}     color={GOLD}    bg="rgba(212,175,55,0.12)"/>
        <StatCard icon={TrendingUp}   label="Today's Payout"       value={$(todayPay)}                     sub="Released withdrawals"             color="#34d399" bg="rgba(52,211,153,0.12)"/>
        <StatCard icon={Clock}        label="Avg Processing Time"  value="4.2 hrs"                         sub="Past 7 days"                      color="#a78bfa" bg="rgba(167,139,250,0.12)"/>
        <StatCard icon={Percent}      label="Success Rate"         value={`${rate}%`}                      sub="Approved / total"                 color="#34d399" bg="rgba(52,211,153,0.12)"/>
      </div>

      {/* Priority + Queue row */}
      <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:14,marginBottom:24}}>
        <HighPriorityPanel data={withdrawals} onClick={openDrawer}/>
        <ProcessingQueue   data={withdrawals}/>
      </div>

      {/* Filter bar */}
      <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:12,padding:"12px 16px",marginBottom:14}}>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,flex:"1 1 220px",background:"rgba(255,255,255,0.04)",border:`1px solid ${BORDER}`,borderRadius:8,padding:"7px 11px"}}>
            <Search size={12} style={{color:MUTED,flexShrink:0}}/>
            <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search username, ID, hash…" style={{background:"none",border:"none",outline:"none",fontSize:12,color:"rgba(255,255,255,0.75)",width:"100%"}}/>
            {search&&<X size={11} style={{color:MUTED,cursor:"pointer",flexShrink:0}} onClick={()=>setSearch("")}/>}
          </div>
          <select value={status} onChange={e=>{setStatus(e.target.value as Status|"");setPage(1);}} style={sel}>
            <option value="">All Statuses</option>
            {(["PENDING","APPROVED","REJECTED","CANCELLED","RELEASED"] as Status[]).map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <select value={method} onChange={e=>{setMethod(e.target.value as PayMeth|"");setPage(1);}} style={sel}>
            <option value="">All Methods</option>
            {(["USDT","BANK","CRYPTO"] as PayMeth[]).map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          <select value={wallet} onChange={e=>{setWallet(e.target.value);setPage(1);}} style={sel}>
            <option value="">All Wallets</option>
            {["INCOME","DEPOSIT","WITHDRAWAL"].map(w=><option key={w} value={w}>{w}</option>)}
          </select>
          <button onClick={()=>setShowFilter(f=>!f)} style={{...sel,display:"flex",alignItems:"center",gap:5}}>
            <SlidersHorizontal size={11}/>{showFilter?"Less":"More"} <ChevronDown size={10} style={{transform:showFilter?"rotate(180deg)":"none",transition:"transform 0.2s"}}/>
          </button>
        </div>
        {showFilter&&(
          <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
            <select value={country} onChange={e=>{setCountry(e.target.value);setPage(1);}} style={sel}>
              <option value="">All Countries</option>
              {COUNTRIES.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" value={minAmt} onChange={e=>{setMinAmt(e.target.value);setPage(1);}} placeholder="Min $" style={{...sel,width:80}}/>
            <input type="number" value={maxAmt} onChange={e=>{setMaxAmt(e.target.value);setPage(1);}} placeholder="Max $" style={{...sel,width:80}}/>
            {(search||status||method||wallet||country||minAmt||maxAmt)&&(
              <button onClick={()=>{setSearch("");setStatus("");setMethod("");setWallet("");setCountry("");setMinAmt("");setMaxAmt("");setPage(1);}} style={{...sel,color:"#f87171",borderColor:"rgba(248,113,113,0.2)"}}>
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
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead style={{position:"sticky",top:0,zIndex:10,background:"hsl(222 62% 10%)"}}>
              <tr>
                {[
                  {content:<input type="checkbox" checked={allChecked} onChange={toggleAll} style={{accentColor:GOLD,width:13,height:13}}/>,    w:"44px"},
                  {content:"Withdrawal ID", w:"130px"},{content:"Member",w:"180px"},{content:"Amount",w:"100px"},
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
              {pageData.map(w=>(
                <WithdrawalRow
                  key={w.id} w={w}
                  checked={selected.has(w.id)}
                  onToggle={()=>toggleRow(w.id)}
                  onRowClick={()=>openDrawer(w)}
                  onApprove={openApprove} onReject={openReject} onHold={openHold} onCancel={openCancel} onAssign={openAssign}
                  isHover={hovered===w.id}
                  onHoverSet={setHovered}
                />
              ))}
              {pageData.length===0&&(
                <tr><td colSpan={11} style={{padding:"48px",textAlign:"center",color:MUTED,fontSize:12}}>No withdrawals match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 4px"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:11,color:MUTED}}>Rows:</span>
          {ROWS_OPTIONS.map(n=>(
            <button key={n} onClick={()=>{setRowsPer(n);setPage(1);}} style={{padding:"3px 9px",background:rowsPer===n?"rgba(212,175,55,0.1)":"transparent",border:`1px solid ${rowsPer===n?"rgba(212,175,55,0.3)":BORDER}`,borderRadius:5,cursor:"pointer",fontSize:11,color:rowsPer===n?GOLD_L:MUTED}}>{n}</button>
          ))}
          <span style={{fontSize:11,color:MUTED,marginLeft:8}}>Showing {(safePage-1)*rowsPer+1}–{Math.min(safePage*rowsPer,filtered.length)} of {filtered.length}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={safePage<=1} style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${BORDER}`,borderRadius:6,cursor:safePage<=1?"not-allowed":"pointer",padding:"5px 8px",color:safePage<=1?MUTED:"rgba(255,255,255,0.7)",display:"flex"}}><ChevronLeft size={13}/></button>
          {Array.from({length:Math.min(pages,7)},(_,i)=>{
            const pg=pages<=7?i+1:(safePage<=4?i+1:(safePage>=pages-3?pages-6+i:safePage-3+i));
            return <button key={pg} onClick={()=>setPage(pg)} style={{width:28,height:28,background:pg===safePage?"rgba(212,175,55,0.12)":"rgba(255,255,255,0.04)",border:`1px solid ${pg===safePage?"rgba(212,175,55,0.3)":BORDER}`,borderRadius:6,cursor:"pointer",fontSize:11,color:pg===safePage?GOLD_L:"rgba(255,255,255,0.6)",display:"flex",alignItems:"center",justifyContent:"center"}}>{pg}</button>;
          })}
          <button onClick={()=>setPage(p=>Math.min(pages,p+1))} disabled={safePage>=pages} style={{background:"rgba(255,255,255,0.04)",border:`1px solid ${BORDER}`,borderRadius:6,cursor:safePage>=pages?"not-allowed":"pointer",padding:"5px 8px",color:safePage>=pages?MUTED:"rgba(255,255,255,0.7)",display:"flex"}}><ChevronRight size={13}/></button>
        </div>
      </div>

      {/* Analytics */}
      <AnalyticsSection data={withdrawals}/>

      {/* Drawer */}
      <WithdrawalDrawer withdrawal={drawerW} onClose={()=>setDrawerW(null)} onApprove={openApprove} onReject={openReject} onHold={openHold}/>

      {/* Modals */}
      {modal==="approve"&&modalW&&<ApprovalModal w={modalW} onClose={closeModal} onConfirm={confirmApprove}/>}
      {modal==="reject" &&modalW&&<RejectModal   w={modalW} onClose={closeModal} onConfirm={confirmReject}/>}
      {modal==="hold"   &&modalW&&<HoldModal     w={modalW} onClose={closeModal} onConfirm={confirmHold}/>}

      {/* Cancel confirm */}
      {modal==="cancel"&&modalW&&(
        <div style={{position:"fixed",inset:0,zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.6)"}}>
          <div style={{background:"hsl(222 62% 8%)",border:`1px solid ${BORDER}`,borderRadius:14,padding:24,width:360,boxShadow:"0 24px 60px rgba(0,0,0,0.7)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
              <div style={{width:36,height:36,borderRadius:10,background:"rgba(248,113,113,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}><X size={18} style={{color:"#f87171"}}/></div>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.9)"}}>Cancel Withdrawal</div>
                <div style={{fontSize:11,color:MUTED}}>{modalW.id} · {$(modalW.amount)}</div>
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
                <div style={{fontSize:11,color:MUTED}}>{modalW.id}</div>
              </div>
            </div>
            <div style={{fontSize:11,fontWeight:600,color:MUTED,marginBottom:8}}>SELECT REVIEWER</div>
            {ADMIN_REVIEWERS.map(r=>(
              <div key={r} onClick={()=>setAssignReviewer(r)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:assignReviewer===r?"rgba(96,165,250,0.08)":"rgba(255,255,255,0.025)",border:`1px solid ${assignReviewer===r?"rgba(96,165,250,0.3)":BORDER}`,borderRadius:8,cursor:"pointer",marginBottom:6}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:assignReviewer===r?"#60a5fa":"transparent",border:`1.5px solid ${assignReviewer===r?"#60a5fa":MUTED}`,flexShrink:0}}/>
                <span style={{fontSize:12,color:assignReviewer===r?"rgba(255,255,255,0.85)":MUTED}}>{r}</span>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:14}}>
              <button onClick={closeModal} style={{flex:1,padding:"9px 0",background:"rgba(255,255,255,0.04)",border:`1px solid ${BORDER}`,borderRadius:8,cursor:"pointer",fontSize:12,color:MUTED}}>Cancel</button>
              <button onClick={confirmAssign} style={{flex:2,padding:"9px 0",background:"rgba(96,165,250,0.12)",border:"1px solid rgba(96,165,250,0.3)",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:600,color:"#60a5fa"}}>Assign Reviewer</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismiss}/>
    </div>
    </AdminLayout>
  );
}
