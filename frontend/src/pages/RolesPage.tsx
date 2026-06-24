import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { rolesApi, usersApi } from '../services/api';
import type { PermissionCatalogItem, Role, User } from '../types';
import { extractApiError } from '../utils/extractApiError';
import { getEffectiveRole, hasPermission } from '../utils/permissions';

const BASE_ROLE_OPTIONS: Array<Role['base_role']> = ['owner', 'admin', 'sales', 'trainer', 'parent', 'guest'];

const BASE_ROLE_LABELS: Record<Role['base_role'], string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  sales: 'Продажи',
  trainer: 'Преподаватель',
  parent: 'Родитель',
  guest: 'Гость',
};

const PERMISSION_MODULE_LABELS: Record<string, string> = {
  abonements: 'Абонементы',
  admin_tools: 'Административные инструменты',
  b2b: 'B2B',
  campaigns: 'Кампании',
  characteristics: 'Характеристики',
  communications: 'Коммуникации',
  finance: 'Финансы',
  grades: 'Оценки',
  groups: 'Группы',
  lessons: 'Уроки',
  owner_calculations: 'Расчеты владельца',
  owner_dashboard: 'Дашборд владельца',
  owner_funnels: 'Воронки владельца',
  owner_workspace: 'Рабочее пространство владельца',
  parent_dashboard: 'Кабинет родителя',
  passwords: 'Пароли',
  persons: 'Реестр персон',
  programs: 'Программы',
  projects: 'Проекты',
  reports: 'Отчеты',
  roles: 'Роли',
  sales: 'Продажи',
  settings: 'Настройки',
  student_accounts: 'Счета учеников',
  students: 'Ученики',
  tasks: 'Задачи',
  telegram: 'Telegram',
  trainer_cockpit: 'Кабинет преподавателя',
  users: 'Пользователи',
};

type RoleFormState = {
  key: string;
  name: string;
  description: string;
  base_role: Role['base_role'];
  permissions: string[];
};

type UserCreateFormState = {
  full_name: string;
  email: string;
  password: string;
  role: Role['base_role'];
  custom_role_id: string;
};

const EMPTY_ROLE_FORM: RoleFormState = {
  key: '',
  name: '',
  description: '',
  base_role: 'sales',
  permissions: [],
};

const EMPTY_USER_FORM: UserCreateFormState = {
  full_name: '',
  email: '',
  password: '',
  role: 'sales',
  custom_role_id: '',
};

const RolesPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const effectiveRole = getEffectiveRole(user);
  const isOwner = effectiveRole === 'owner';
  const canViewRoles = hasPermission(user, 'roles.access') || hasPermission(user, 'roles.manage');
  const canManageRoles = hasPermission(user, 'roles.manage');
  const canViewUsers = hasPermission(user, 'users.access') || hasPermission(user, 'users.manage');
  const canManageUsers = hasPermission(user, 'users.manage');

  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [permissionsCatalog, setPermissionsCatalog] = useState<PermissionCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [roleSaving, setRoleSaving] = useState(false);
  const [userSaving, setUserSaving] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState<RoleFormState>(EMPTY_ROLE_FORM);
  const [userForm, setUserForm] = useState<UserCreateFormState>(EMPTY_USER_FORM);
  const userRowRefs = useRef<Record<number, HTMLTableRowElement | null>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const requests: [
        Promise<Role[]>,
        Promise<User[]>,
        Promise<PermissionCatalogItem[]>
      ] = [
        rolesApi.getAll(),
        canViewUsers ? usersApi.getAll() : Promise.resolve([]),
        rolesApi.getPermissionsCatalog(),
      ];
      const [roleData, userData, permissionsData] = await Promise.all(requests);
      setRoles(roleData);
      setUsers(userData);
      setPermissionsCatalog(permissionsData);
      setError('');
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить роли, пользователей и каталог разрешений.'));
    } finally {
      setLoading(false);
    }
  }, [canViewUsers]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const permissionsCatalogByModule = useMemo(() => {
    const grouped = new Map<string, PermissionCatalogItem[]>();
    permissionsCatalog.forEach((item) => {
      grouped.set(item.module, [...(grouped.get(item.module) || []), item]);
    });
    return [...grouped.entries()].sort(([left], [right]) =>
      (PERMISSION_MODULE_LABELS[left] || left).localeCompare(PERMISSION_MODULE_LABELS[right] || right)
    );
  }, [permissionsCatalog]);

  const activeCustomRoles = useMemo(
    () => roles.filter((item) => item.is_active && !item.is_system).sort((left, right) => left.name.localeCompare(right.name)),
    [roles]
  );

  const customRoleOptionsByBase = useMemo(() => {
    const grouped = new Map<Role['base_role'], Role[]>();
    BASE_ROLE_OPTIONS.forEach((baseRole) => grouped.set(baseRole, []));
    activeCustomRoles.forEach((item) => {
      grouped.set(item.base_role, [...(grouped.get(item.base_role) || []), item]);
    });
    return grouped;
  }, [activeCustomRoles]);

  const sortedUsers = useMemo(
    () => [...users].sort((left, right) => left.full_name.localeCompare(right.full_name)),
    [users]
  );
  const focusedUserId = useMemo(() => {
    const raw = searchParams.get('userId');
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }, [searchParams]);

  useEffect(() => {
    if (!focusedUserId) return;
    const row = userRowRefs.current[focusedUserId];
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusedUserId, sortedUsers]);

  const createUserRoleOptions = customRoleOptionsByBase.get(userForm.role) || [];
  const manageableBaseRoleOptions = useMemo(
    () => BASE_ROLE_OPTIONS.filter((option) => isOwner || (option !== 'owner' && option !== 'admin')),
    [isOwner]
  );
  const roleFormBaseRoleOptions = manageableBaseRoleOptions.includes(roleForm.base_role)
    ? manageableBaseRoleOptions
    : [roleForm.base_role, ...manageableBaseRoleOptions];

  const openCreateRoleDialog = () => {
    setEditingRole(null);
    setRoleForm(EMPTY_ROLE_FORM);
    setRoleDialogOpen(true);
  };

  const openEditRoleDialog = (role: Role) => {
    setEditingRole(role);
    setRoleForm({
      key: role.key,
      name: role.name,
      description: role.description || '',
      base_role: role.base_role,
      permissions: role.permissions,
    });
    setRoleDialogOpen(true);
  };

  const closeRoleDialog = () => {
    if (!roleSaving) {
      setRoleDialogOpen(false);
    }
  };

  const closeUserDialog = () => {
    if (!userSaving) {
      setUserDialogOpen(false);
    }
  };

  const togglePermission = (permissionKey: string) => {
    setRoleForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permissionKey)
        ? prev.permissions.filter((item) => item !== permissionKey)
        : [...prev.permissions, permissionKey],
    }));
  };

  const handleSaveRole = async () => {
    setRoleSaving(true);
    try {
      if (editingRole) {
        await rolesApi.update(editingRole.id, {
          name: roleForm.name.trim(),
          description: roleForm.description.trim() || null,
          base_role: roleForm.base_role,
          permissions: roleForm.permissions,
        });
        setSuccess('Роль обновлена.');
      } else {
        await rolesApi.create({
          key: roleForm.key.trim(),
          name: roleForm.name.trim(),
          description: roleForm.description.trim() || null,
          base_role: roleForm.base_role,
          permissions: roleForm.permissions,
        });
        setSuccess('Роль создана.');
      }
      setRoleDialogOpen(false);
      await loadData();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось сохранить роль.'));
    } finally {
      setRoleSaving(false);
    }
  };

  const handleArchiveRole = async (role: Role) => {
    try {
      await rolesApi.archive(role.id);
      setSuccess(`Роль "${role.name}" архивирована.`);
      await loadData();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось архивировать роль.'));
    }
  };

  const updateUserRoleAssignment = async (
    targetUser: User,
    nextBaseRole: Role['base_role'],
    nextCustomRoleIdRaw: string
  ) => {
    setUpdatingUserId(targetUser.id);
    try {
      const nextCustomRoleId = nextCustomRoleIdRaw ? Number(nextCustomRoleIdRaw) : null;
      await usersApi.update(targetUser.id, {
        role: nextBaseRole,
        custom_role_id: nextCustomRoleId,
      });
      setSuccess(`Роль пользователя ${targetUser.full_name} обновлена.`);
      await loadData();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось обновить роль пользователя.'));
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleUserBaseRoleChange = async (targetUser: User, nextBaseRole: Role['base_role']) => {
    await updateUserRoleAssignment(targetUser, nextBaseRole, '');
  };

  const handleUserCustomRoleChange = async (targetUser: User, nextCustomRoleIdRaw: string) => {
    const nextBaseRole =
      nextCustomRoleIdRaw
        ? roles.find((item) => item.id === Number(nextCustomRoleIdRaw))?.base_role || targetUser.role
        : targetUser.role;
    await updateUserRoleAssignment(targetUser, nextBaseRole as Role['base_role'], nextCustomRoleIdRaw);
  };

  const handleToggleUserActive = async (targetUser: User) => {
    setUpdatingUserId(targetUser.id);
    try {
      await usersApi.update(targetUser.id, { is_active: !targetUser.is_active });
      setSuccess(
        targetUser.is_active
          ? `Пользователь ${targetUser.full_name} архивирован.`
          : `Пользователь ${targetUser.full_name} разархивирован.`
      );
      await loadData();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось обновить статус пользователя.'));
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleCreateUser = async () => {
    setUserSaving(true);
    try {
      await usersApi.create({
        full_name: userForm.full_name.trim(),
        email: userForm.email.trim(),
        password: userForm.password,
        role: userForm.role,
        custom_role_id: userForm.custom_role_id ? Number(userForm.custom_role_id) : undefined,
      });
      setSuccess(`Пользователь ${userForm.full_name.trim()} создан.`);
      setUserDialogOpen(false);
      setUserForm(EMPTY_USER_FORM);
      await loadData();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось создать пользователя.'));
    } finally {
      setUserSaving(false);
    }
  };

  return (
    <Layout>
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Box>
            <Typography variant="h4">Роли и доступы</Typography>
            <Typography variant="body2" color="text.secondary">
              Владелец управляет каталогом ролей, выбирает разрешения из фиксированного списка и создает пользователей
              под любую базовую роль.
            </Typography>
          </Box>
          {canManageRoles && (
            <Stack direction="row" spacing={1}>
              {canManageUsers && (
                <Button variant="outlined" onClick={() => setUserDialogOpen(true)}>
                  Создать пользователя
                </Button>
              )}
              <Button variant="contained" onClick={openCreateRoleDialog}>
                Создать роль
              </Button>
            </Stack>
          )}
        </Stack>

        {!canViewRoles && (
          <Alert severity="warning">
            Недостаточно прав для просмотра каталога ролей.
          </Alert>
        )}
        {canViewRoles && (
          <>
        {error && (
          <Alert severity="error" onClose={() => setError('')}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" onClose={() => setSuccess('')}>
            {success}
          </Alert>
        )}

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" mb={1}>
            Каталог ролей
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Код</TableCell>
                <TableCell>Базовая роль</TableCell>
                <TableCell>Разрешения</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {roles.map((roleItem) => (
                <TableRow key={roleItem.id}>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2">{roleItem.name}</Typography>
                      {roleItem.is_system && <Chip size="small" label="системная" />}
                    </Stack>
                    {roleItem.description && (
                      <Typography variant="caption" color="text.secondary">
                        {roleItem.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{roleItem.key}</TableCell>
                  <TableCell>{BASE_ROLE_LABELS[roleItem.base_role]}</TableCell>
                  <TableCell>
                    {roleItem.permissions.length ? (
                      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                        {roleItem.permissions.map((permission) => (
                          <Chip key={permission} size="small" variant="outlined" label={permission} />
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Нет явных разрешений
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{roleItem.is_active ? 'Активна' : 'Архив'}</TableCell>
                  <TableCell align="right">
                    {!roleItem.is_system && canManageRoles ? (
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button size="small" onClick={() => openEditRoleDialog(roleItem)}>
                          Изменить
                        </Button>
                        {roleItem.is_active && (
                          <Button size="small" color="error" onClick={() => void handleArchiveRole(roleItem)}>
                            Архивировать
                          </Button>
                        )}
                      </Stack>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        {roleItem.is_system ? 'Системная роль' : 'Только просмотр'}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!roles.length && !loading && (
                <TableRow>
                  <TableCell colSpan={6}>Роли не найдены.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>

        {canViewUsers && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" mb={1}>
              Пользователи и роли
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Здесь владелец задает базовую роль пользователя, назначает подходящую кастомную роль и управляет архивом.
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Пользователь</TableCell>
                  <TableCell>Базовая роль</TableCell>
                  <TableCell>Кастомная роль</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell align="right">Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedUsers.map((targetUser) => {
                  const currentBaseRole = targetUser.role as Role['base_role'];
                  const roleOptions = customRoleOptionsByBase.get(currentBaseRole) || [];
                  const baseRoleOptionsForUser = manageableBaseRoleOptions.includes(currentBaseRole)
                    ? manageableBaseRoleOptions
                    : [currentBaseRole, ...manageableBaseRoleOptions];
                  const isBusy = updatingUserId === targetUser.id;
                  return (
                    <TableRow
                      key={targetUser.id}
                      ref={(node) => {
                        userRowRefs.current[targetUser.id] = node;
                      }}
                      sx={
                        focusedUserId === targetUser.id
                          ? {
                              backgroundColor: 'rgba(25, 118, 210, 0.08)',
                              '& td': { borderColor: 'rgba(25, 118, 210, 0.22)' },
                            }
                          : undefined
                      }
                    >
                      <TableCell>
                        <Typography variant="body2">{targetUser.full_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {targetUser.email}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ minWidth: 180 }}>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          value={currentBaseRole}
                          disabled={!canManageUsers || isBusy}
                          onChange={(event) =>
                            void handleUserBaseRoleChange(targetUser, event.target.value as Role['base_role'])
                          }
                        >
                          {baseRoleOptionsForUser.map((option) => (
                            <MenuItem key={option} value={option}>
                              {BASE_ROLE_LABELS[option]}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell sx={{ minWidth: 280 }}>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          value={targetUser.custom_role_id ? String(targetUser.custom_role_id) : ''}
                          disabled={!canManageUsers || isBusy}
                          onChange={(event) => void handleUserCustomRoleChange(targetUser, event.target.value)}
                          helperText={
                            targetUser.custom_role_name
                              ? `Текущая роль: ${targetUser.custom_role_name}`
                              : 'Без кастомной роли'
                          }
                        >
                          <MenuItem value="">Без кастомной роли</MenuItem>
                          {roleOptions.map((roleOption) => (
                            <MenuItem key={roleOption.id} value={String(roleOption.id)}>
                              {roleOption.name}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip
                            size="small"
                            color={targetUser.is_active ? 'success' : 'default'}
                            label={targetUser.is_active ? 'Активен' : 'Архив'}
                          />
                          {targetUser.effective_role && (
                            <Typography variant="caption" color="text.secondary">
                              Итоговая роль: {BASE_ROLE_LABELS[targetUser.effective_role as Role['base_role']]}
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button size="small" onClick={() => navigate(`/users/${targetUser.id}`)}>
                            Открыть
                          </Button>
                        <Button
                          size="small"
                          color={targetUser.is_active ? 'warning' : 'success'}
                          disabled={!canManageUsers || isBusy || targetUser.id === user?.id}
                          onClick={() => void handleToggleUserActive(targetUser)}
                        >
                          {targetUser.is_active ? 'Архивировать' : 'Разархивировать'}
                        </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!sortedUsers.length && !loading && (
                  <TableRow>
                    <TableCell colSpan={5}>Пользователи не найдены.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Paper>
        )}
          </>
        )}
      </Stack>

      <Dialog open={roleDialogOpen} onClose={closeRoleDialog} maxWidth="md" fullWidth>
        <DialogTitle>{editingRole ? 'Изменить роль' : 'Создать роль'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Код роли"
              value={roleForm.key}
              onChange={(event) => setRoleForm((prev) => ({ ...prev, key: event.target.value }))}
              disabled={!!editingRole}
              helperText="Например: menedzher_prodazh"
              fullWidth
            />
            <TextField
              label="Название"
              value={roleForm.name}
              onChange={(event) => setRoleForm((prev) => ({ ...prev, name: event.target.value }))}
              fullWidth
            />
            <TextField
              select
              label="Базовая роль"
              value={roleForm.base_role}
              onChange={(event) =>
                setRoleForm((prev) => ({
                  ...prev,
                  base_role: event.target.value as Role['base_role'],
                }))
              }
              fullWidth
            >
              {roleFormBaseRoleOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {BASE_ROLE_LABELS[option]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Описание"
              value={roleForm.description}
              onChange={(event) => setRoleForm((prev) => ({ ...prev, description: event.target.value }))}
              multiline
              minRows={2}
              fullWidth
            />

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Разрешения из каталога
              </Typography>
              <Stack spacing={2} divider={<Divider flexItem />}>
                {permissionsCatalogByModule.map(([moduleName, items]) => (
                  <Box key={moduleName}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 1, textTransform: 'capitalize' }}>
                      {PERMISSION_MODULE_LABELS[moduleName] || moduleName}
                    </Typography>
                    <Stack spacing={0.5}>
                      {items.map((permission) => (
                        <FormControlLabel
                          key={permission.key}
                          control={
                            <Checkbox
                              checked={roleForm.permissions.includes(permission.key)}
                              onChange={() => togglePermission(permission.key)}
                            />
                          }
                          label={
                            <Box>
                              <Typography variant="body2">{permission.label}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {permission.description}
                              </Typography>
                            </Box>
                          }
                        />
                      ))}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRoleDialog} disabled={roleSaving}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleSaveRole()}
            disabled={roleSaving || !roleForm.name.trim() || !roleForm.key.trim()}
          >
            {roleSaving ? 'Сохранение...' : editingRole ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={userDialogOpen} onClose={closeUserDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Создать пользователя</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="ФИО"
              value={userForm.full_name}
              onChange={(event) => setUserForm((prev) => ({ ...prev, full_name: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Эл. почта"
              type="email"
              value={userForm.email}
              onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
              fullWidth
            />
            <TextField
              label="Пароль"
              type="password"
              value={userForm.password}
              onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))}
              helperText="Минимум 6 символов"
              fullWidth
            />
            <TextField
              select
              label="Базовая роль"
              value={userForm.role}
              onChange={(event) =>
                setUserForm((prev) => ({
                  ...prev,
                  role: event.target.value as Role['base_role'],
                  custom_role_id: '',
                }))
              }
              fullWidth
            >
              {manageableBaseRoleOptions.map((option) => (
                <MenuItem key={option} value={option}>
                  {BASE_ROLE_LABELS[option]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Кастомная роль"
              value={userForm.custom_role_id}
              onChange={(event) => setUserForm((prev) => ({ ...prev, custom_role_id: String(event.target.value) }))}
              helperText={
                createUserRoleOptions.length
                  ? 'Можно оставить пустым, если нужна только базовая роль.'
                  : 'Для выбранной базовой роли пока нет активных кастомных ролей.'
              }
              fullWidth
            >
              <MenuItem value="">Без кастомной роли</MenuItem>
              {createUserRoleOptions.map((roleOption) => (
                <MenuItem key={roleOption.id} value={String(roleOption.id)}>
                  {roleOption.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeUserDialog} disabled={userSaving}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleCreateUser()}
            disabled={userSaving || !userForm.full_name.trim() || !userForm.email.trim() || userForm.password.length < 6}
          >
            {userSaving ? 'Создание...' : 'Создать'}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default RolesPage;
