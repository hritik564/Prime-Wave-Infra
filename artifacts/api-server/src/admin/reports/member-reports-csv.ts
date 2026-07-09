import type { mapMemberRow } from "./member-reports.service";

type MemberRow = ReturnType<typeof mapMemberRow>;

const COLUMNS: { key: keyof MemberRow; label: string }[] = [
  { key: "name",              label: "Name"               },
  { key: "username",          label: "Username"           },
  { key: "email",             label: "Email"              },
  { key: "phone",             label: "Phone"              },
  { key: "joinedAt",          label: "Joined Date"        },
  { key: "accountType",       label: "Account Type"       },
  { key: "sponsor",           label: "Sponsor"            },
  { key: "binaryParent",      label: "Binary Parent"      },
  { key: "placement",         label: "Placement (L/R)"   },
  { key: "accountStatus",     label: "Account Status"     },
  { key: "operationalStatus", label: "Operational Status" },
  { key: "investmentPlan",    label: "Investment Plan"    },
  { key: "investmentAmount",  label: "Investment Amount"  },
  { key: "depositWallet",     label: "Deposit Wallet"     },
  { key: "incomeWallet",      label: "Income Wallet"      },
  { key: "withdrawalWallet",  label: "Withdrawal Wallet"  },
  { key: "directReferrals",   label: "Direct Referrals"   },
  { key: "leftBV",            label: "Left BV"            },
  { key: "rightBV",           label: "Right BV"           },
];

function escape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildMemberCsv(rows: MemberRow[]): string {
  const header = COLUMNS.map(c => c.label).join(",");
  const body   = rows.map(r =>
    COLUMNS.map(c => escape(r[c.key])).join(","),
  ).join("\n");
  return `${header}\n${body}`;
}
