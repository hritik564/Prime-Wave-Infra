import { useState, useMemo, useCallback, useRef } from "react";
import {
  X, Clock, CheckCircle, ShieldX, Wallet, TrendingUp, ArrowDownLeft,
  Users, Shield, FileText, Pin, Download, Search, UserPlus,
  Zap, Copy, Globe, CalendarDays, BadgeCheck, KeyRound, LogIn,
  ChevronRight, Activity, BarChart2, AlertTriangle,
} from "lucide-react";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const BG     = "hsl(222 62% 7%)";
const BG2    = "hsl(222 62% 10%)";

export interface DrawerWithdrawal {
  id: string; username: string; firstName: string; lastName: string;
  memberId: string; amount: number; fee: number;
  walletType: string; paymentMethod: string; network: string;
  walletAddress: string; transactionHash: string | null;
  status: string; priority: string; requestedAt: Date;
  processedAt: Date | null; assignedAdmin: string | null;
  country: string; rank: string | null; memberStatus: string;
  sponsor: string | null;
  depositWallet: number; incomeWallet: number; withdrawalWallet: number;
}

export interface DrawerAuditLog {
  id:        string;
  action:    string;
  details:   Record<string, unknown>;
  createdAt: string;
  admin:     { email: string; firstName: string; lastName: string };
}

const $ = (n: number) => n === 0 ? "—" : `$${n.toLocaleString()}`;
const dt  = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const dtt = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const ago = (d: Date) => {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
};
const initials = (f: string, l: string) => `${f[0]??'?'}${l[0]??''}`.toUpperCase();

const STATUS_CFG: Record<string,{color:string;bg:string}> = {
  PENDING:   {color:"#fbbf24",bg:"rgba(251,191,36,0.12)"},
  APPROVED:  {color:"#34d399",bg:"rgba(52,211,153,0.12)"},
  REJECTED:  {color:"#f87171",bg:"rgba(248,113,113,0.12)"},
  CANCELLED: {color:MUTED,   bg:"rgba(170,179,197,0.08)"},
  RELEASED:  {color:"#60a5fa",bg:"rgba(96,165,250,0.12)"},
  COMPLETED: {color:"#60a5fa",bg:"rgba(96,165,250,0.12)"},
};
const PRI_CFG: Record<string,{color:string;bg:string}> = {
  NORMAL: {color:MUTED,     bg:"rgba(170,179,197,0.06)"},
  HIGH:   {color:"#fbbf24", bg:"rgba(251,191,36,0.1)" },
  VIP:    {color:GOLD,      bg:"rgba(212,175,55,0.1)" },
  URGENT: {color:"#f87171", bg:"rgba(248,113,113,0.1)"},
};

function Pill({label,color,bg}:{label:string;color:string;bg:string}) {
  return <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.05em",color,background:bg,padding:"2px 8px",borderRadius:4}}>{label}</span>;
}
function Row({label,value,accent}:{label:string;value:React.ReactNode;accent?:boolean}) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid rgba(255,255,255,0.04)`}}>
      <span style={{fontSize:12,color:MUTED,flexShrink:0,marginRight:8}}>{label}</span>
      <span style={{fontSize:12,fontWeight:500,color:accent?GOLD_L:"rgba(255,255,255,0.8)",textAlign:"right"}}>{value}</span>
    </div>
  );
}
function SecTitle({title}:{title:string}) {
  return <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",color:MUTED,marginBottom:10}}>{title}</div>;
}
function Card({children,style}:{children:React.ReactNode;style?:React.CSSProperties}) {
  return <div style={{background:BG2,border:`1px solid ${BORDER}`,borderRadius:10,padding:"12px 14px",marginBottom:14,...style}}>{children}</div>;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = ["Summary","Member","Wallet","Payment","Timeline","Notes","Audit"] as const;
type Tab = typeof TABS[number];
const TAB_ICONS:Record<Tab,React.ElementType> = {
  Summary:Zap, Member:Users, Wallet:Wallet, Payment:BarChart2,
  Timeline:Activity, Notes:FileText, Audit:Shield,
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Summary
// ─────────────────────────────────────────────────────────────────────────────
function SummaryTab({w}:{w:DrawerWithdrawal}) {
  const net = w.amount - w.fee;
  const sc = STATUS_CFG[w.status] ?? STATUS_CFG.PENDING;
  const pc = PRI_CFG[w.priority]  ?? PRI_CFG.NORMAL;
  return (
    <div>
      <Card>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
          <Pill label={w.status}   color={sc.color} bg={sc.bg}/>
          <Pill label={w.priority} color={pc.color} bg={pc.bg}/>
        </div>
        <Row label="Withdrawal ID"    value={<span style={{fontFamily:"monospace",fontSize:11}}>{w.id}</span>} />
        <Row label="Requested Amount" value={$(w.amount)}         accent />
        <Row label="Processing Fee"   value={<span style={{color:"#f87171"}}>{w.fee > 0 ? $(w.fee) : "—"}</span>} />
        <Row label="Net Amount"       value={<span style={{color:"#34d399",fontWeight:700}}>{$(net)}</span>} />
        <Row label="Wallet Type"      value={w.walletType} />
        <Row label="Network"          value={w.network} />
        <Row label="Request Time"     value={dtt(w.requestedAt)} />
        {w.processedAt && <Row label="Processed" value={dtt(w.processedAt)} />}
        {w.assignedAdmin && <Row label="Assigned Admin" value={<span style={{color:"#60a5fa"}}>{w.assignedAdmin}</span>} />}
      </Card>
      {w.status === "PENDING" && (
        <div style={{background:"rgba(251,191,36,0.05)",border:"1px solid rgba(251,191,36,0.15)",borderRadius:9,padding:"10px 12px",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
          <AlertTriangle size={12} style={{color:"#fbbf24",flexShrink:0}}/>
          <span style={{fontSize:11,color:"#fbbf24"}}>Awaiting admin review and approval.</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Member
// ─────────────────────────────────────────────────────────────────────────────
function MemberTab({w}:{w:DrawerWithdrawal}) {
  return (
    <div>
      <Card style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:44,height:44,borderRadius:"50%",background:"rgba(212,175,55,0.1)",border:`1.5px solid rgba(212,175,55,0.3)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:GOLD,flexShrink:0}}>
          {initials(w.firstName,w.lastName)}
        </div>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:"rgba(255,255,255,0.9)"}}>@{w.username}</div>
          <div style={{fontSize:11,color:MUTED,marginTop:2}}>{w.firstName} {w.lastName}</div>
          <div style={{fontSize:10,color:MUTED,fontFamily:"monospace",marginTop:1}}>{w.memberId}</div>
        </div>
      </Card>
      <Row label="Rank"          value={w.rank ?? "Unranked"} />
      <Row label="Status"        value={<Pill label={w.memberStatus} color={w.memberStatus==="ACTIVE"?"#34d399":w.memberStatus==="SUSPENDED"?"#f87171":MUTED} bg={w.memberStatus==="ACTIVE"?"rgba(52,211,153,0.1)":w.memberStatus==="SUSPENDED"?"rgba(248,113,113,0.1)":"rgba(170,179,197,0.06)"}/>} />
      <Row label="Country"       value={w.country} />
      <Row label="Sponsor"       value={w.sponsor?`@${w.sponsor}`:"—"} />
      <div style={{display:"flex",gap:8,marginTop:14}}>
        {[
          {icon:BadgeCheck,label:"Approve KYC",color:"#34d399",bg:"rgba(52,211,153,0.08)"},
          {icon:KeyRound,  label:"Reset Pass",  color:"#60a5fa",bg:"rgba(96,165,250,0.08)"},
          {icon:LogIn,     label:"Login As",    color:GOLD,      bg:"rgba(212,175,55,0.08)"},
        ].map(a=>(
          <div key={a.label} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",flex:1,background:a.bg,border:`1px solid rgba(255,255,255,0.04)`,borderRadius:8,cursor:"pointer",justifyContent:"center"}}>
            <a.icon size={11} style={{color:a.color}}/><span style={{fontSize:10,color:a.color,fontWeight:500}}>{a.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Wallet
// ─────────────────────────────────────────────────────────────────────────────
function WalletTab({w}:{w:DrawerWithdrawal}) {
  const wallets = [
    {label:"Withdrawal Wallet",balance:w.withdrawalWallet,color:GOLD},
    {label:"Income Wallet",    balance:w.incomeWallet,    color:"#34d399"},
    {label:"Deposit Wallet",   balance:w.depositWallet,   color:"#60a5fa"},
  ];
  return (
    <div>
      <SecTitle title="WALLET BALANCES"/>
      {wallets.map(wl=>(
        <div key={wl.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:BG2,border:`1px solid ${BORDER}`,borderRadius:9,padding:"11px 13px",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:28,height:28,borderRadius:7,background:`${wl.color}15`,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Wallet size={12} style={{color:wl.color}}/>
            </div>
            <span style={{fontSize:12,color:"rgba(255,255,255,0.7)"}}>{wl.label}</span>
          </div>
          <span style={{fontSize:14,fontWeight:700,color:wl.color,fontFamily:"monospace"}}>{$(wl.balance)}</span>
        </div>
      ))}
      <SecTitle title="RECENT TRANSFERS"/>
      {[
        {label:"Income Credit",    amount:w.incomeWallet*0.3,  sign:"+",color:"#34d399",date:new Date(w.requestedAt.getTime()-86400000*2)},
        {label:"Withdrawal Request",amount:w.amount,           sign:"−",color:"#fbbf24",date:w.requestedAt},
        {label:"ROI Credit",       amount:w.depositWallet*0.1, sign:"+",color:"#34d399",date:new Date(w.requestedAt.getTime()-86400000*7)},
      ].map((t,i)=>(
        <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid rgba(255,255,255,0.04)`}}>
          <div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.75)"}}>{t.label}</div>
            <div style={{fontSize:10,color:MUTED}}>{dt(t.date)}</div>
          </div>
          <span style={{fontSize:12,fontWeight:700,color:t.color,fontFamily:"monospace"}}>{t.sign}${Math.round(t.amount).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Payment
// ─────────────────────────────────────────────────────────────────────────────
function PaymentTab({w}:{w:DrawerWithdrawal}) {
  const [copied,setCopied] = useState(false);
  const copyAddr = () => { navigator.clipboard?.writeText(w.walletAddress).catch(()=>{}); setCopied(true); setTimeout(()=>setCopied(false),1500); };
  return (
    <div>
      <SecTitle title="PAYMENT DETAILS"/>
      <Row label="Payment Method" value={w.paymentMethod}/>
      <Row label="Network"        value={w.network}/>
      <div style={{padding:"10px 0",borderBottom:`1px solid rgba(255,255,255,0.04)`}}>
        <div style={{fontSize:12,color:MUTED,marginBottom:6}}>Wallet Address</div>
        <div style={{display:"flex",alignItems:"center",gap:8,background:BG2,border:`1px solid ${BORDER}`,borderRadius:8,padding:"9px 11px"}}>
          <span style={{fontFamily:"monospace",fontSize:11,color:"rgba(255,255,255,0.75)",flex:1,wordBreak:"break-all"}}>{w.walletAddress}</span>
          <button onClick={copyAddr} style={{background:"none",border:"none",cursor:"pointer",color:copied?"#34d399":MUTED,flexShrink:0}}>
            <Copy size={12}/>
          </button>
        </div>
      </div>
      {w.transactionHash ? (
        <div style={{padding:"10px 0",borderBottom:`1px solid rgba(255,255,255,0.04)`}}>
          <div style={{fontSize:12,color:MUTED,marginBottom:6}}>Transaction Hash</div>
          <div style={{background:BG2,border:`1px solid ${BORDER}`,borderRadius:8,padding:"9px 11px"}}>
            <span style={{fontFamily:"monospace",fontSize:10,color:"#60a5fa",wordBreak:"break-all"}}>{w.transactionHash}</span>
          </div>
        </div>
      ) : (
        <Row label="Transaction Hash" value={<span style={{color:MUTED,fontSize:11}}>Pending confirmation</span>}/>
      )}
      <Row label="Destination"   value={w.paymentMethod==="BANK"?"Bank Account":"Crypto Wallet"}/>
      <Row label="Amount"        value={`$${w.amount.toLocaleString()}`} accent/>
      <Row label="Fee"           value={<span style={{color:"#f87171"}}>{w.fee > 0 ? `$${w.fee.toLocaleString()}` : "—"}</span>}/>
      <Row label="Net"           value={<span style={{color:"#34d399",fontWeight:700}}>${(w.amount-w.fee).toLocaleString()}</span>}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Timeline
// ─────────────────────────────────────────────────────────────────────────────
type TxEvent = {label:string;time:Date;admin:string;color:string;icon:React.ElementType;done:boolean};
function buildTimeline(w:DrawerWithdrawal): TxEvent[] {
  const b = w.requestedAt.getTime();
  const events: TxEvent[] = [
    {label:"Withdrawal Requested",time:w.requestedAt,                          admin:w.username,           color:"#60a5fa",icon:ArrowDownLeft, done:true},
    {label:"Queued for Review",   time:new Date(b+300000),                     admin:"system",             color:"#fbbf24",icon:Clock,         done:true},
    {label:"Assigned to Admin",   time:new Date(b+1800000),                    admin:w.assignedAdmin??"system",color:"#a78bfa",icon:Users,     done:!!w.assignedAdmin},
    {label:"Approved",            time:w.processedAt??new Date(b+7200000),     admin:w.assignedAdmin??"—", color:"#34d399",icon:CheckCircle,   done:w.status==="APPROVED"||w.status==="RELEASED"||w.status==="COMPLETED"},
    {label:"Released to Network", time:new Date((w.processedAt?.getTime()??b+7200000)+3600000),admin:"system",color:"#34d399",icon:TrendingUp,done:w.status==="RELEASED"||w.status==="COMPLETED"},
    {label:"Completed",           time:new Date((w.processedAt?.getTime()??b+7200000)+14400000),admin:"system",color:GOLD,    icon:CheckCircle,done:false},
  ];
  if (w.status==="REJECTED") {
    events.splice(3,3,{label:"Rejected",time:w.processedAt??new Date(b+7200000),admin:w.assignedAdmin??"admin",color:"#f87171",icon:ShieldX,done:true});
  }
  return events;
}

function TimelineTab({w}:{w:DrawerWithdrawal}) {
  const events = useMemo(()=>buildTimeline(w),[w]);
  return (
    <div>
      <SecTitle title="WITHDRAWAL TIMELINE"/>
      <div style={{position:"relative"}}>
        <div style={{position:"absolute",left:15,top:0,bottom:0,width:1,background:BORDER}}/>
        {events.map((e,i)=>(
          <div key={i} style={{display:"flex",gap:12,marginBottom:16,position:"relative"}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:e.done?`${e.color}15`:"rgba(255,255,255,0.04)",border:`1.5px solid ${e.done?e.color:BORDER}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,zIndex:1}}>
              <e.icon size={13} style={{color:e.done?e.color:MUTED}}/>
            </div>
            <div style={{paddingTop:4}}>
              <div style={{fontSize:12,fontWeight:600,color:e.done?"rgba(255,255,255,0.82)":MUTED}}>{e.label}</div>
              <div style={{fontSize:10,color:MUTED,marginTop:2}}>{e.done?dtt(e.time):"Pending"}</div>
              {e.done&&<div style={{fontSize:10,color:"#60a5fa",marginTop:1}}>by {e.admin}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Notes
// ─────────────────────────────────────────────────────────────────────────────
interface Note{id:number;text:string;date:Date;admin:string;pinned:boolean}
function NotesTab({w, onSaveNote}: {w:DrawerWithdrawal; onSaveNote?: (text: string) => Promise<void>}) {
  const initialNote: Note[] = w.memberStatus
    ? (w as DrawerWithdrawal & { _adminNotes?: string })._adminNotes
      ? [{ id: 1, text: (w as DrawerWithdrawal & { _adminNotes?: string })._adminNotes!, date: new Date(w.requestedAt.getTime() + 1000), admin: "admin", pinned: false }]
      : []
    : [];
  const [notes,setNotes] = useState<Note[]>(initialNote);
  const [draft,setDraft] = useState("");
  const [saving,setSaving] = useState(false);
  const add = useCallback(async ()=>{
    if(!draft.trim())return;
    const text = draft.trim();
    setSaving(true);
    try {
      if (onSaveNote) await onSaveNote(text);
      setNotes(p=>[{id:Date.now(),text,date:new Date(),admin:"admin@primewave.io",pinned:false},...p]);
      setDraft("");
    } finally { setSaving(false); }
  },[draft, onSaveNote]);
  const togglePin = useCallback((id:number)=>setNotes(p=>p.map(n=>n.id===id?{...n,pinned:!n.pinned}:n)),[]);
  const sorted = [...notes].sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||b.date.getTime()-a.date.getTime());
  return (
    <div>
      <Card>
        <textarea value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Add admin note…" style={{width:"100%",minHeight:64,background:"rgba(255,255,255,0.03)",border:`1px solid ${BORDER}`,borderRadius:7,padding:"8px 10px",fontSize:12,color:"rgba(255,255,255,0.78)",outline:"none",resize:"vertical",boxSizing:"border-box",marginBottom:8}}/>
        <button onClick={add} disabled={!draft.trim()||saving} style={{padding:"6px 14px",background:draft.trim()&&!saving?"rgba(212,175,55,0.12)":"rgba(255,255,255,0.04)",border:`1px solid ${draft.trim()&&!saving?"rgba(212,175,55,0.3)":BORDER}`,borderRadius:6,cursor:draft.trim()&&!saving?"pointer":"not-allowed",fontSize:12,fontWeight:600,color:draft.trim()&&!saving?GOLD_L:MUTED}}>{saving?"Saving…":"Add Note"}</button>
      </Card>
      {sorted.length === 0 && <div style={{fontSize:12,color:MUTED,textAlign:"center",padding:"24px 0"}}>No notes yet.</div>}
      {sorted.map(n=>(
        <div key={n.id} style={{background:n.pinned?"rgba(212,175,55,0.04)":"rgba(255,255,255,0.02)",border:`1px solid ${n.pinned?"rgba(212,175,55,0.15)":BORDER}`,borderRadius:9,padding:"11px 13px",marginBottom:9}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:7}}>
            <div style={{width:20,height:20,borderRadius:"50%",background:"rgba(212,175,55,0.12)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:GOLD}}>A</div>
            <span style={{fontSize:11,color:"#60a5fa"}}>{n.admin}</span>
            {n.pinned&&<Pin size={9} style={{color:GOLD}}/>}
            <span style={{fontSize:10,color:MUTED,marginLeft:"auto"}}>{dtt(n.date)}</span>
            <button onClick={()=>togglePin(n.id)} style={{background:"none",border:"none",cursor:"pointer",color:n.pinned?GOLD:MUTED,padding:2}}><Pin size={10}/></button>
          </div>
          <p style={{fontSize:12,color:"rgba(255,255,255,0.7)",lineHeight:1.55,margin:0}}>{n.text}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: Audit
// ─────────────────────────────────────────────────────────────────────────────
function AuditTab({w, adminLogs}: {w:DrawerWithdrawal; adminLogs?: DrawerAuditLog[]}) {
  const [q,setQ] = useState("");

  const backendEntries = useMemo(() => {
    if (!adminLogs || adminLogs.length === 0) return null;
    return adminLogs
      .filter(l => !q || l.action.toLowerCase().includes(q.toLowerCase()) || l.admin.email.toLowerCase().includes(q.toLowerCase()))
      .map(l => {
        const color =
          l.action.includes("REJECTED") ? "#f87171" :
          l.action.includes("COMPLETED") ? "#34d399" :
          l.action.includes("APPROVED") ? "#34d399" :
          l.action.includes("HOLD") ? "#fbbf24" : "#60a5fa";
        const status =
          l.action.includes("REJECTED") ? "WARN" :
          l.action.includes("HOLD") ? "WARN" : "SUCCESS";
        const label = l.action.replace(/_/g, " ").replace(/WITHDRAWAL /i, "");
        return { action: label, admin: l.admin.email, date: new Date(l.createdAt), color, status };
      }).reverse();
  }, [adminLogs, q]);

  const fallbackEntries = useMemo(()=>[
    {action:"Withdrawal Requested",admin:w.username,          ip:"—",date:w.requestedAt,                              color:"#60a5fa",status:"SUCCESS"},
    {action:"Auto-queued",          admin:"system",            ip:"—",date:new Date(w.requestedAt.getTime()+300000),   color:"#fbbf24",status:"INFO"},
    {action:"Compliance Check",     admin:"system",            ip:"—",date:new Date(w.requestedAt.getTime()+900000),   color:"#a78bfa",status:"INFO"},
    {action:"Assigned to Review",   admin:w.assignedAdmin??"system",ip:"—",date:new Date(w.requestedAt.getTime()+1800000),  color:"#a78bfa",status:"INFO"},
    ...(w.processedAt?[{action:w.status==="REJECTED"?"Rejected":"Approved",admin:w.assignedAdmin??"admin",ip:"—",date:w.processedAt,color:w.status==="REJECTED"?"#f87171":"#34d399",status:w.status==="REJECTED"?"WARN":"SUCCESS"}]:[]),
  ].filter(e=>!q||e.action.toLowerCase().includes(q.toLowerCase())||e.admin.toLowerCase().includes(q.toLowerCase())).reverse(),[w,q]);

  const entries = backendEntries ?? fallbackEntries;
  const SC:{[k:string]:string}={SUCCESS:"#34d399",INFO:"#60a5fa",WARN:"#fbbf24"};
  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:7,flex:1,background:"rgba(255,255,255,0.04)",border:`1px solid ${BORDER}`,borderRadius:7,padding:"6px 10px"}}>
          <Search size={12} style={{color:MUTED}}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…" style={{background:"none",border:"none",outline:"none",fontSize:11,color:"rgba(255,255,255,0.75)",width:"100%"}}/>
        </div>
        <button style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,0.04)",border:`1px solid ${BORDER}`,borderRadius:7,padding:"6px 10px",cursor:"pointer",fontSize:11,color:MUTED}}><Download size={11}/>Export</button>
      </div>
      {entries.length === 0 && <div style={{fontSize:12,color:MUTED,textAlign:"center",padding:"24px 0"}}>No audit records found.</div>}
      {entries.map((e,i)=>(
        <div key={i} style={{display:"flex",alignItems:"flex-start",gap:9,padding:"9px 0",borderBottom:`1px solid rgba(255,255,255,0.04)`}}>
          <div style={{width:24,height:24,borderRadius:6,background:`${e.color}12`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
            <CheckCircle size={11} style={{color:e.color}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
              <span style={{fontSize:12,color:"rgba(255,255,255,0.8)",fontWeight:500}}>{e.action}</span>
              <span style={{fontSize:9,fontWeight:700,color:SC[e.status]??"#60a5fa",background:`${SC[e.status]??"#60a5fa"}15`,padding:"1px 6px",borderRadius:3}}>{e.status}</span>
            </div>
            <div style={{fontSize:10,color:"#60a5fa",marginTop:2}}>{e.admin}</div>
          </div>
          <div style={{fontSize:9,color:MUTED,whiteSpace:"nowrap",marginTop:2}}>{dtt(e.date)}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WithdrawalDrawer
// ─────────────────────────────────────────────────────────────────────────────
export default function WithdrawalDrawer({
  withdrawal, onClose, onApprove, onReject, onHold, adminLogs, onSaveNote,
}: {
  withdrawal:  DrawerWithdrawal | null;
  onClose:     () => void;
  onApprove:   (w: DrawerWithdrawal) => void;
  onReject:    (w: DrawerWithdrawal) => void;
  onHold:      (w: DrawerWithdrawal) => void;
  adminLogs?:  DrawerAuditLog[];
  onSaveNote?: (text: string) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("Summary");
  const visible = !!withdrawal;
  const prevId = useRef<string|null>(null);
  if (withdrawal && withdrawal.id !== prevId.current) {
    prevId.current = withdrawal.id;
    if (activeTab !== "Summary") setActiveTab("Summary");
  }
  const sc = withdrawal ? STATUS_CFG[withdrawal.status] ?? STATUS_CFG.PENDING : STATUS_CFG.PENDING;
  const pc = withdrawal ? PRI_CFG[withdrawal.priority]  ?? PRI_CFG.NORMAL     : PRI_CFG.NORMAL;

  return (
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.45)",opacity:visible?1:0,pointerEvents:visible?"auto":"none",transition:"opacity 0.2s ease"}}/>
      <div style={{position:"fixed",top:0,right:0,bottom:0,zIndex:201,width:500,maxWidth:"100vw",background:"hsl(222 62% 7%)",borderLeft:`1px solid ${BORDER}`,boxShadow:"-20px 0 60px rgba(0,0,0,0.55)",transform:visible?"translateX(0)":"translateX(100%)",transition:"transform 0.24s cubic-bezier(0.32,0.72,0,1)",display:"flex",flexDirection:"column"}}>
        {withdrawal && (
          <>
            {/* Header */}
            <div style={{padding:"16px 18px",borderBottom:`1px solid ${BORDER}`,flexShrink:0,background:"linear-gradient(180deg,rgba(212,175,55,0.03) 0%,transparent 100%)"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
                <div>
                  <div style={{fontSize:15,fontWeight:800,color:"rgba(255,255,255,0.92)",marginBottom:3,fontFamily:"monospace"}}>{withdrawal.id}</div>
                  <div style={{fontSize:12,color:MUTED}}>@{withdrawal.username} · {withdrawal.country}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  {withdrawal.status==="PENDING"&&(
                    <>
                      <button onClick={()=>onApprove(withdrawal)} style={{padding:"5px 12px",background:"rgba(52,211,153,0.1)",border:"1px solid rgba(52,211,153,0.3)",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,color:"#34d399"}}>Approve</button>
                      <button onClick={()=>onReject(withdrawal)}  style={{padding:"5px 12px",background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,color:"#f87171"}}>Reject</button>
                    </>
                  )}
                  <button onClick={onClose} style={{background:"rgba(255,255,255,0.05)",border:`1px solid ${BORDER}`,borderRadius:7,cursor:"pointer",color:MUTED,padding:"5px 8px",display:"flex"}}><X size={14}/></button>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",gap:5}}>
                  <Pill label={withdrawal.status}   color={sc.color} bg={sc.bg}/>
                  <Pill label={withdrawal.priority} color={pc.color} bg={pc.bg}/>
                  <Pill label={withdrawal.network}  color="#60a5fa" bg="rgba(96,165,250,0.08)"/>
                </div>
                <span style={{fontSize:16,fontWeight:800,color:GOLD_L,fontFamily:"monospace"}}>${withdrawal.amount.toLocaleString()}</span>
              </div>
            </div>

            {/* Tabs */}
            <div style={{display:"flex",borderBottom:`1px solid ${BORDER}`,flexShrink:0,overflowX:"auto"}}>
              {TABS.map(tab=>{
                const Icon = TAB_ICONS[tab];
                const active = tab===activeTab;
                return(
                  <button key={tab} onClick={()=>setActiveTab(tab)} style={{display:"flex",alignItems:"center",gap:4,padding:"9px 11px",background:"none",border:"none",borderBottom:`2px solid ${active?"#D4AF37":"transparent"}`,cursor:"pointer",color:active?"#F3D37A":MUTED,fontSize:10,fontWeight:active?700:400,whiteSpace:"nowrap",flexShrink:0}}>
                    <Icon size={10}/>{tab}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div style={{flex:1,overflowY:"auto",padding:"16px 18px 24px"}}>
              {activeTab==="Summary"  && <SummaryTab  w={withdrawal}/>}
              {activeTab==="Member"   && <MemberTab   w={withdrawal}/>}
              {activeTab==="Wallet"   && <WalletTab   w={withdrawal}/>}
              {activeTab==="Payment"  && <PaymentTab  w={withdrawal}/>}
              {activeTab==="Timeline" && <TimelineTab w={withdrawal}/>}
              {activeTab==="Notes"    && <NotesTab    w={withdrawal} onSaveNote={onSaveNote}/>}
              {activeTab==="Audit"    && <AuditTab    w={withdrawal} adminLogs={adminLogs}/>}
            </div>
          </>
        )}
      </div>
    </>
  );
}
