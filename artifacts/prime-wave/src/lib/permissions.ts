export const PERMISSIONS = {
  VIEW_DASHBOARD:       "view_dashboard",
  VIEW_MEMBERS:         "view_members",
  EDIT_MEMBERS:         "edit_members",
  APPROVE_WITHDRAWALS:  "approve_withdrawals",
  APPROVE_INVESTMENTS:  "approve_investments",
  MANAGE_WALLETS:       "manage_wallets",
  MANAGE_CONFIGURATION: "manage_configuration",
  VIEW_REPORTS:         "view_reports",
  MANAGE_ROLES:         "manage_roles",
  MANAGE_PLANS:         "manage_plans",
  VIEW_BINARY:          "view_binary",
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
    PERMISSIONS.VIEW_REPORTS,
  ],
  SUPPORT_ADMIN: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_MEMBERS,
    PERMISSIONS.EDIT_MEMBERS,
    PERMISSIONS.VIEW_REPORTS,
  ],
  REWARD_MANAGER: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_MEMBERS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.MANAGE_PLANS,
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
