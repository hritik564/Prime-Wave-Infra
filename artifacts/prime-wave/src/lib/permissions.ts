export const PERMISSIONS = {
  VIEW_DASHBOARD:       "view_dashboard",
  VIEW_MEMBERS:         "view_members",
  EDIT_MEMBERS:         "edit_members",
  MANAGE_MEMBER_STATUS: "manage_member_status",
  APPROVE_WITHDRAWALS:  "approve_withdrawals",
  APPROVE_INVESTMENTS:  "approve_investments",
  MANAGE_WALLETS:       "manage_wallets",
  /** Temporary access for the existing manual-deposit workflow only. */
  MANAGE_MANUAL_DEPOSIT:"manage_manual_deposit",
  VIEW_WALLETS:         "view_wallets",
  VIEW_INVESTMENTS:     "view_investments",
  VIEW_DEPOSITS:        "view_deposits",
  VIEW_AUTO_DEPOSITS:   "view_auto_deposits",
  VIEW_WITHDRAWALS:     "view_withdrawals",
  VIEW_WITHDRAWAL_QUEUE:"view_withdrawal_queue",
  VIEW_WITHDRAWAL_OPS:  "view_withdrawal_ops",
  MANAGE_CONFIGURATION: "manage_configuration",
  VIEW_REPORTS:         "view_reports",
  MANAGE_ROLES:         "manage_roles",
  MANAGE_PLANS:         "manage_plans",
  VIEW_BINARY:          "view_binary",
  VIEW_POWER_BUSINESS:  "view_power_business",
  MANAGE_INCOME_ENGINE: "manage_income_engine",
  VIEW_COMPANY_WALLETS: "view_company_wallets",
  VIEW_SALARY:          "view_salary",
  VIEW_TREASURY:        "view_treasury",
  VIEW_BLOCKCHAIN:      "view_blockchain",
  MANAGE_DEV_TOOLS:     "manage_dev_tools",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL = Object.values(PERMISSIONS) as Permission[];

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SUPER_ADMIN: ALL,
  FINANCE_ADMIN: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_MEMBERS,
    PERMISSIONS.APPROVE_WITHDRAWALS,
    PERMISSIONS.APPROVE_INVESTMENTS,
    PERMISSIONS.MANAGE_WALLETS,
    PERMISSIONS.MANAGE_MANUAL_DEPOSIT,
    PERMISSIONS.VIEW_REPORTS,
  ],
  SUPPORT_ADMIN: [
    PERMISSIONS.VIEW_MEMBERS,
    PERMISSIONS.EDIT_MEMBERS,
    PERMISSIONS.MANAGE_MEMBER_STATUS,
  ],
  REWARD_MANAGER: [
    PERMISSIONS.MANAGE_PLANS,
  ],
  STAFF_OPERATIONS: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_MEMBERS,
    PERMISSIONS.MANAGE_MEMBER_STATUS,
    PERMISSIONS.VIEW_INVESTMENTS,
    PERMISSIONS.VIEW_DEPOSITS,
    PERMISSIONS.VIEW_AUTO_DEPOSITS,
    PERMISSIONS.VIEW_WITHDRAWALS,
    PERMISSIONS.VIEW_WITHDRAWAL_QUEUE,
    PERMISSIONS.VIEW_WITHDRAWAL_OPS,
    PERMISSIONS.VIEW_WALLETS,
    PERMISSIONS.MANAGE_MANUAL_DEPOSIT,
    PERMISSIONS.VIEW_POWER_BUSINESS,
  ],
  member: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_BINARY,
  ],
};

export function getPermissionsForRole(role: string): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function hasPermission(permissions: Permission[], perm: Permission): boolean {
  return permissions.includes(perm);
}
