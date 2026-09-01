import { User } from '../types';

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['*'],
  owner: ['*'],
  sales: ['sales.access', 'finance.access', 'tasks.access', 'projects.access', 'owner_workspace.access', 'students.access', 'students.manage', 'lessons.access', 'lessons.manage', 'lessons.schedule_manage', 'student_accounts.access', 'student_accounts.manage', 'student_accounts.payment', 'persons.access', 'persons.manage'],
  trainer: ['tasks.access', 'projects.access', 'owner_workspace.access', 'groups.access', 'programs.access', 'students.access', 'grades.access', 'grades.manage', 'characteristics.access', 'characteristics.manage', 'lessons.access', 'lessons.manage', 'telegram.link', 'trainer_cockpit.access', 'technolab.access'],
  parent: ['programs.access', 'groups.access', 'grades.access', 'characteristics.access', 'student_accounts.access', 'student_accounts.payment', 'telegram.link', 'parent_dashboard.access'],
  guest: ['programs.access'],
  seo_manager: ['seo.access', 'seo.manage'],
  methodist: ['kodex.access', 'kodex.manage', 'technolab.access', 'technolab.manage'],
  developer: ['agile.access', 'agile.manage', 'tasks.access', 'projects.access', 'owner_workspace.access'],
  manager: ['students.access', 'student_portal.manage'],
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

  // Extra base roles
  const extraPerms: string[] = (user.extra_roles || []).flatMap(
    (r) => DEFAULT_ROLE_PERMISSIONS[r] || []
  );

  if (user.custom_role_id) {
    const base = explicitPermissions.length ? explicitPermissions : defaults;
    return Array.from(new Set([...base, ...extraPerms]));
  }

  return Array.from(new Set([...defaults, ...explicitPermissions, ...extraPerms]));
};

export const hasPermission = (user: User | null | undefined, permission: string): boolean => {
  const normalizedPermission = permission.trim();
  if (!normalizedPermission) return false;

  const permissions = getUserPermissions(user);
  if (permissions.includes('*') || permissions.includes(normalizedPermission)) {
    return true;
  }

  if (normalizedPermission.endsWith('.access')) {
    const managePermission = `${normalizedPermission.slice(0, -'.access'.length)}.manage`;
    if (permissions.includes(managePermission)) {
      return true;
    }
  } else if (!normalizedPermission.endsWith('.manage')) {
    // Мелкое право "<module>.<action>" включено в широкое "<module>.manage" —
    // разбивка module.manage на отдельные действия не отбирает доступ у ролей
    // с уже настроенным .manage.
    const module = normalizedPermission.split('.', 1)[0];
    if (permissions.includes(`${module}.manage`)) {
      return true;
    }
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
