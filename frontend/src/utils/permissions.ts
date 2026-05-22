import { User } from '../types';

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['*'],
  owner: ['*'],
  sales: ['sales.access', 'finance.access', 'tasks.access', 'projects.access', 'owner_workspace.access', 'students.access', 'students.manage', 'lessons.access', 'lessons.manage', 'lessons.schedule_manage', 'student_accounts.access', 'student_accounts.manage', 'student_accounts.payment', 'persons.access', 'persons.manage'],
  trainer: ['tasks.access', 'projects.access', 'owner_workspace.access', 'groups.access', 'programs.access', 'students.access', 'grades.access', 'grades.manage', 'characteristics.access', 'characteristics.manage', 'lessons.access', 'lessons.manage', 'telegram.link', 'trainer_cockpit.access'],
  parent: ['programs.access', 'groups.access', 'grades.access', 'characteristics.access', 'student_accounts.access', 'student_accounts.payment', 'telegram.link', 'parent_dashboard.access'],
  guest: ['programs.access'],
};

export const getEffectiveRole = (user: User | null | undefined): string | null => {
  if (!user) return null;
  return user.effective_role || user.role || null;
};

export const getUserPermissions = (user: User | null | undefined): string[] => {
  if (!user) return [];

  const effectiveRole = getEffectiveRole(user);
  const defaults = effectiveRole ? DEFAULT_ROLE_PERMISSIONS[effectiveRole] || [] : [];
  const explicitPermissions = (user.role_permissions || []).map((permission) => permission.trim()).filter(Boolean);

  if (user.custom_role_id) {
    return explicitPermissions.length ? Array.from(new Set(explicitPermissions)) : Array.from(new Set(defaults));
  }

  return Array.from(new Set([...defaults, ...explicitPermissions]));
};

export const hasPermission = (user: User | null | undefined, permission: string): boolean => {
  const normalizedPermission = permission.trim();
  if (!normalizedPermission) return false;

  const permissions = getUserPermissions(user);
  if (permissions.includes('*') || permissions.includes(normalizedPermission)) {
    return true;
  }

  const parts = normalizedPermission.split('.');
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const wildcardPermission = `${parts.slice(0, index).join('.')}.*`;
    if (permissions.includes(wildcardPermission)) {
      return true;
    }
  }

  return false;
};
