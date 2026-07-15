import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  Select,
  IconButton,
  InputAdornment,
  Badge,
  ListItemText,
  Menu,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tab,
  Tabs,
  TextField,
  Typography,
  Checkbox,
  Collapse,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  LinearProgress,
  TablePagination,
  Tooltip,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsIcon from '@mui/icons-material/Notifications';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import FilterListIcon from '@mui/icons-material/FilterList';
import InsightsIcon from '@mui/icons-material/Insights';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CheckIcon from '@mui/icons-material/Check';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import {
  format,
  startOfMonth,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { OwnerWorkspaceTaskCreateDialog, type TaskCreatePayload } from '../components/ownerWorkspace/OwnerWorkspaceTaskCreateDialog';
import { ownerWorkspaceApi, settingsApi, tasksApi, usersApi } from '../services/api';
import type {
  OwnerWorkspaceAuditLog,
  OwnerWorkspaceContact,
  OwnerWorkspaceConversation,
  OwnerWorkspaceDigest,
  OwnerWorkspaceHistoryStats,
  OwnerWorkspaceNotificationsEnvelope,
  OwnerWorkspaceMessage,
  OwnerWorkspaceNotificationConfig,
  OwnerWorkspaceNotificationDeliveryStats,
  OwnerWorkspaceSettingsBundle,
  OwnerWorkspaceSettingsBundleEnvelope,
  OwnerWorkspaceSettingsSnapshot,
  OwnerWorkspaceSettingsBundleSummary,
  OwnerWorkspaceProjectConfig,
  OwnerWorkspaceProject,
  OwnerWorkspaceSearchResult,
  OwnerWorkspaceTask,
  OwnerWorkspaceTaskComment,
  OwnerWorkspaceTaskConfig,
  OwnerWorkspaceTagDictionary,
  OwnerWorkspacePermissionPolicy,
  OwnerWorkspaceTaskStatusCounts,
  OwnerWorkspaceTasksAnalyticsOverview,
  OwnerWorkspaceWebPushStatus,
  User,
} from '../types';
import { extractApiError } from '../utils/extractApiError';
import { getEffectiveRole } from '../utils/permissions';

const OwnerWorkspaceSettingsDialogs = React.lazy(
  () => import('../components/ownerWorkspace/OwnerWorkspaceSettingsDialogs').then((module) => ({ default: module.OwnerWorkspaceSettingsDialogs }))
);
const OwnerWorkspaceHistoryTab = React.lazy(
  () => import('../components/ownerWorkspace/OwnerWorkspaceHistoryTab').then((module) => ({ default: module.OwnerWorkspaceHistoryTab }))
);
const OwnerWorkspaceCommsTab = React.lazy(
  () => import('../components/ownerWorkspace/OwnerWorkspaceCommsTab').then((module) => ({ default: module.OwnerWorkspaceCommsTab }))
);
const OwnerWorkspaceProjectsTab = React.lazy(
  () =>
    import('../components/ownerWorkspace/OwnerWorkspaceProjectsTab').then((module) => ({
      default: module.OwnerWorkspaceProjectsTab,
    }))
);
const OwnerWorkspaceContactsTab = React.lazy(
  () =>
    import('../components/ownerWorkspace/OwnerWorkspaceContactsTab').then((module) => ({
      default: module.OwnerWorkspaceContactsTab,
    }))
);
const OwnerWorkspaceMeetingsTab = React.lazy(
  () =>
    import('../components/ownerWorkspace/OwnerWorkspaceMeetingsTab').then((module) => ({
      default: module.OwnerWorkspaceMeetingsTab,
    }))
);
const OwnerWorkspaceTaskInsightsSection = React.lazy(
  () =>
    import('../components/ownerWorkspace/OwnerWorkspaceTaskInsightsSection').then((module) => ({
      default: module.OwnerWorkspaceTaskInsightsSection,
    }))
);
const OwnerWorkspaceTaskBoardCalendarSection = React.lazy(
  () =>
    import('../components/ownerWorkspace/OwnerWorkspaceTaskBoardCalendarSection').then((module) => ({
      default: module.OwnerWorkspaceTaskBoardCalendarSection,
    }))
);
const OwnerWorkspaceGanttSection = React.lazy(
  () =>
    import('../components/ownerWorkspace/OwnerWorkspaceGanttSection').then((module) => ({
      default: module.OwnerWorkspaceGanttSection,
    }))
);
const OwnerWorkspaceNotificationsTab = React.lazy(
  () =>
    import('../components/ownerWorkspace/OwnerWorkspaceNotificationsTab').then((module) => ({
      default: module.OwnerWorkspaceNotificationsTab,
    }))
);
const OwnerWorkspaceSettingsSnapshotsSection = React.lazy(
  () =>
    import('../components/ownerWorkspace/OwnerWorkspaceSettingsSnapshotsSection').then((module) => ({
      default: module.OwnerWorkspaceSettingsSnapshotsSection,
    }))
);
const OwnerWorkspacePermissionPolicySection = React.lazy(
  () =>
    import('../components/ownerWorkspace/OwnerWorkspacePermissionPolicySection').then((module) => ({
      default: module.OwnerWorkspacePermissionPolicySection,
    }))
);
const OwnerWorkspaceSettingsConfigSection = React.lazy(
  () =>
    import('../components/ownerWorkspace/OwnerWorkspaceSettingsConfigSection').then((module) => ({
      default: module.OwnerWorkspaceSettingsConfigSection,
    }))
);
const OwnerWorkspaceSiteTab = React.lazy(
  () =>
    import('../components/ownerWorkspace/OwnerWorkspaceSiteTab').then((module) => ({
      default: module.OwnerWorkspaceSiteTab,
    }))
);

/** Макс. задач за один запрос для канбана/календаря и вспомогательных списков (лимит API). */
const OWNER_WS_TASKS_FETCH_CAP = 500;

const OwnerWorkspaceDialogsFallback: React.FC = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
    <CircularProgress size={28} />
  </Box>
);

function isTaskOverdue(t: OwnerWorkspaceTask): boolean {
  if (!t.deadline_at || t.status === 'completed' || t.status === 'cancelled') return false;
  return new Date(t.deadline_at).getTime() < Date.now();
}

function taskOverdueLabel(t: OwnerWorkspaceTask): string {
  if (!isTaskOverdue(t) || !t.deadline_at) return '';
  const diffMs = Date.now() - new Date(t.deadline_at).getTime();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (diffMs >= day) return `Просрочена на ${Math.floor(diffMs / day)} дн.`;
  if (diffMs >= hour) return `Просрочена на ${Math.floor(diffMs / hour)} ч.`;
  return 'Просрочена';
}

function formatTaskDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function taskStatusChipSx(status: string) {
  if (status === 'new') return { bgcolor: 'info.light', color: 'info.contrastText' };
  if (status === 'in_progress') return { bgcolor: 'success.light', color: 'success.contrastText' };
  if (status === 'waiting') return { bgcolor: 'warning.light', color: 'warning.contrastText' };
  if (status === 'completed') return { bgcolor: 'grey.300', color: 'text.primary' };
  if (status === 'cancelled') return { bgcolor: 'grey.100', color: 'text.secondary' };
  return undefined;
}

function deadlineToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string | null {
  if (!local.trim()) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function dateInputToDateTime(value: string): string | null {
  return value ? `${value}T00:00:00` : null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(normalized);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return window.btoa(binary);
}

function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

const DEFAULT_STATUS_LABELS: Record<string, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  waiting: 'Ожидание',
  completed: 'Завершена',
  cancelled: 'Отменена',
};

const DEFAULT_PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
};

const AI_TASK_CATEGORY_LABELS: Record<AiTaskBreakdownCategory, string> = {
  schools: 'Школы',
  parents: 'Родители',
  leads: 'Лиды',
};

const aiTaskPriorityToOwnerPriority = (priority: AiTaskBreakdownPriority): OwnerWorkspaceTaskPriority => {
  if (priority === 'high') return 'high';
  if (priority === 'low') return 'low';
  return 'medium';
};

const DEFAULT_PROJECT_STATUS_LABELS: Record<string, string> = {
  active: 'Активный',
  completed: 'Завершён',
  archived: 'Архив',
};

const OWNER_WS_HISTORY_ENTITY_LABELS: Record<string, string> = {
  project: 'Проект',
  contact: 'Контакт',
  task: 'Задача',
};

const OWNER_WS_HISTORY_ACTION_LABELS: Record<string, string> = {
  create: 'Создание',
  update: 'Изменение',
  archive: 'Архивация',
  delete: 'Удаление',
  bulk_update: 'Массовое изменение',
  complete: 'Завершение',
  create_from_previous: 'Из предыдущей задачи',
  create_from_message: 'Из сообщения',
};

function ownerWsHistoryChangedFields(entry: OwnerWorkspaceAuditLog): string[] {
  const keys = new Set<string>();
  if (entry.old_value && typeof entry.old_value === 'object') {
    Object.keys(entry.old_value).forEach((key) => keys.add(key));
  }
  if (entry.new_value && typeof entry.new_value === 'object') {
    Object.keys(entry.new_value).forEach((key) => keys.add(key));
  }
  return [...keys];
}

function ownerWsHistoryPrimaryLabel(entry: OwnerWorkspaceAuditLog): string {
  const entity = OWNER_WS_HISTORY_ENTITY_LABELS[entry.entity_type] || entry.entity_type;
  const action = OWNER_WS_HISTORY_ACTION_LABELS[entry.action_type] || entry.action_type;
  return `${entity} #${entry.entity_id} — ${action}`;
}

function ownerWsHistoryPayloadText(value: Record<string, unknown> | null | undefined): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function ownerWsCsvCell(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadTextFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function summarizeWorkspaceSettingsBundle(bundle: OwnerWorkspaceSettingsBundle): OwnerWorkspaceSettingsBundleSummary {
  return {
    task_statuses: bundle.task_config.statuses.length,
    task_priorities: bundle.task_config.priorities.length,
    project_statuses: bundle.project_config.statuses.length,
    notification_types: bundle.notification_config.items.length,
    task_tags: bundle.task_tags.items.length,
    contact_tags: bundle.contact_tags.items.length,
    contact_sources: bundle.contact_sources.items.length,
  };
}

function extractWorkspaceSettingsBundle(value: unknown): OwnerWorkspaceSettingsBundle | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const candidate = raw.data && typeof raw.data === 'object' ? raw.data : raw;
  if (
    candidate &&
    typeof candidate === 'object' &&
    'task_config' in candidate &&
    'project_config' in candidate &&
    'permission_policy' in candidate &&
    'notification_config' in candidate &&
    'task_tags' in candidate &&
    'contact_tags' in candidate &&
    'contact_sources' in candidate
  ) {
    return candidate as OwnerWorkspaceSettingsBundle;
  }
  return null;
}

function workspaceSettingsBundleSectionDiff(
  current: OwnerWorkspaceSettingsBundle | null,
  next: OwnerWorkspaceSettingsBundle
): Array<{ key: string; label: string; changed: boolean }> {
  const sections: Array<{ key: keyof OwnerWorkspaceSettingsBundle; label: string }> = [
    { key: 'task_config', label: 'Статусы и приоритеты задач' },
    { key: 'project_config', label: 'Статусы проектов' },
    { key: 'permission_policy', label: 'Policy ролей и прав' },
    { key: 'notification_config', label: 'Типы уведомлений' },
    { key: 'task_tags', label: 'Теги задач' },
    { key: 'contact_tags', label: 'Теги контактов' },
    { key: 'contact_sources', label: 'Источники контактов' },
  ];
  return sections.map((section) => ({
    key: section.key,
    label: section.label,
    changed: !current || JSON.stringify(current[section.key]) !== JSON.stringify(next[section.key]),
  }));
}

type OwnerWorkspaceSubprojectTreeNode = {
  project: OwnerWorkspaceProject;
  children: OwnerWorkspaceSubprojectTreeNode[];
};

function buildOwnerWsProjectChildrenByParent(catalog: OwnerWorkspaceProject[]) {
  const m = new Map<number | null, OwnerWorkspaceProject[]>();
  for (const p of catalog) {
    const k = p.parent_project_id ?? null;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(p);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }
  return m;
}

function buildOwnerWsSubprojectTreeAt(
  rootId: number,
  m: Map<number | null, OwnerWorkspaceProject[]>
): OwnerWorkspaceSubprojectTreeNode[] {
  const direct = m.get(rootId) || [];
  return direct.map((project) => ({
    project,
    children: buildOwnerWsSubprojectTreeAt(project.id, m),
  }));
}

/** Все id строго ниже rootId (без самого rootId). */
function collectOwnerWsDescendantProjectIds(catalog: OwnerWorkspaceProject[], rootId: number): Set<number> {
  const byParent = new Map<number, number[]>();
  for (const p of catalog) {
    if (p.parent_project_id == null) continue;
    if (!byParent.has(p.parent_project_id)) byParent.set(p.parent_project_id, []);
    byParent.get(p.parent_project_id)!.push(p.id);
  }
  const out = new Set<number>();
  const stack = [...(byParent.get(rootId) || [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const c of byParent.get(id) || []) stack.push(c);
  }
  return out;
}

/** Допустимые родители при переносе movingId (без циклов). contextRootId — открытый в диалоге проект (подпись в списке). */
function ownerWsValidParentProjectOptions(
  catalog: OwnerWorkspaceProject[],
  movingId: number,
  contextRootId: number
): { id: number | null; label: string }[] {
  const banned = collectOwnerWsDescendantProjectIds(catalog, movingId);
  banned.add(movingId);
  const opts: { id: number | null; label: string }[] = [{ id: null, label: '(корень)' }];
  for (const p of catalog) {
    if (banned.has(p.id)) continue;
    const tag = p.id === contextRootId ? ' (текущий проект)' : '';
    opts.push({ id: p.id, label: `${p.name}${tag}` });
  }
  opts.sort((a, b) => {
    if (a.id === null) return -1;
    if (b.id === null) return 1;
    return a.label.localeCompare(b.label, 'ru');
  });
  return opts;
}

const OwnerWorkspaceSubprojectTreeRow: React.FC<{
  node: OwnerWorkspaceSubprojectTreeNode;
  depth: number;
  catalog: OwnerWorkspaceProject[];
  contextRootId: number;
  isWorkspaceFullAccess: boolean;
  currentUserId: number | undefined;
  onApplied: () => Promise<void>;
  setError: (msg: string | null) => void;
}> = ({
  node,
  depth,
  catalog,
  contextRootId,
  isWorkspaceFullAccess,
  currentUserId,
  onApplied,
  setError,
}) => {
  const navigate = useNavigate();
  const p = node.project;
  const canReparent = isWorkspaceFullAccess || (currentUserId != null && p.owner_id === currentUserId);
  const parentOptions = useMemo(
    () => ownerWsValidParentProjectOptions(catalog, p.id, contextRootId),
    [catalog, p.id, contextRootId]
  );
  const currentParent = p.parent_project_id ?? null;
  const [draftParent, setDraftParent] = useState<number | null>(currentParent);
  useEffect(() => {
    setDraftParent(currentParent);
  }, [p.id, currentParent]);

  const applyMove = async () => {
    if (draftParent === currentParent) return;
    try {
      await ownerWorkspaceApi.updateProject(p.id, { parent_project_id: draftParent });
      setError(null);
      await onApplied();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось перенести подпроект'));
    }
  };

  return (
    <Box sx={{ pl: depth * 2 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems={{ sm: 'center' }}
        sx={{ py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0, flex: '1 1 140px' }}>
          <Typography variant="body2" sx={{ minWidth: 0 }}>
            {p.name}
          </Typography>
          <IconButton size="small" onClick={() => navigate(`/owner-workspace/projects/${p.id}`)} aria-label="Открыть подпроект">
            <OpenInNewIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Chip size="small" label={p.status} sx={{ alignSelf: 'flex-start' }} />
        {canReparent ? (
          <>
            <TextField
              select
              size="small"
              label="Родитель"
              sx={{ minWidth: 200, flex: '2 1 200px' }}
              value={draftParent === null ? '' : String(draftParent)}
              onChange={(e) => {
                const v = e.target.value;
                setDraftParent(v === '' ? null : Number(v));
              }}
              SelectProps={{
                MenuProps: { PaperProps: { sx: { maxHeight: 320 } } },
              }}
            >
              {parentOptions.map((o) => (
                <MenuItem key={o.id === null ? 'root' : String(o.id)} value={o.id === null ? '' : String(o.id)}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <Button
              size="small"
              variant="outlined"
              disabled={draftParent === currentParent}
              onClick={() => void applyMove()}
              sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}
            >
              Перенести
            </Button>
          </>
        ) : (
          <Typography variant="caption" color="text.secondary">
            Перенос: только владелец подпроекта или полный доступ
          </Typography>
        )}
      </Stack>
      {node.children.map((ch) => (
        <OwnerWorkspaceSubprojectTreeRow
          key={ch.project.id}
          node={ch}
          depth={depth + 1}
          catalog={catalog}
          contextRootId={contextRootId}
          isWorkspaceFullAccess={isWorkspaceFullAccess}
          currentUserId={currentUserId}
          onApplied={onApplied}
          setError={setError}
        />
      ))}
    </Box>
  );
};

type OwnerWorkspaceTaskStatus = 'new' | 'in_progress' | 'waiting' | 'completed' | 'cancelled';
type OwnerWorkspaceTaskPriority = 'low' | 'medium' | 'high' | 'critical';
type AiTaskBreakdownCategory = 'schools' | 'parents' | 'leads';
type AiTaskBreakdownPriority = 'low' | 'normal' | 'high';
type AiTaskBreakdownDraft = {
  title: string;
  description?: string | null;
  category: AiTaskBreakdownCategory;
  priority: AiTaskBreakdownPriority;
  provider?: 'ranvik' | 'claude' | 'rules';
  subtasks: { text: string; order?: number }[];
};
type OwnerWorkspaceProjectStatus = 'active' | 'completed' | 'archived';
type OwnerWorkspaceProjectParticipantRole = 'member' | 'manager' | 'observer';

const OWNER_WS_STATUSES: OwnerWorkspaceTaskStatus[] = ['new', 'in_progress', 'waiting', 'completed', 'cancelled'];
const OWNER_WS_PRIORITIES: OwnerWorkspaceTaskPriority[] = ['low', 'medium', 'high', 'critical'];
const OWNER_WS_PROJECT_STATUSES: OwnerWorkspaceProjectStatus[] = ['active', 'completed', 'archived'];
const OWNER_WS_PROJECT_PARTICIPANT_ROLE_LABELS: Record<OwnerWorkspaceProjectParticipantRole, string> = {
  member: 'участник',
  manager: 'менеджер',
  observer: 'наблюдатель',
};

const OWNER_WS_ACCESS_MATRIX: Array<{
  role: string;
  scope: string;
  capabilities: string[];
}> = [
  {
    role: 'admin / owner',
    scope: 'Весь модуль owner workspace',
    capabilities: [
      'Полный доступ ко всем проектам, контактам, задачам и сообщениям',
      'Смена владельца проекта и архивирование',
      'Назначение manager и observer',
      'Системные настройки статусов и приоритетов',
    ],
  },
  {
    role: 'project owner',
    scope: 'Свой проект и связанные сущности',
    capabilities: [
      'Редактирование проекта, задач, контактов и сообщений в проекте',
      'Управление составом проекта',
      'Назначение manager и observer внутри проекта',
      'Архивирование своего проекта',
    ],
  },
  {
    role: 'manager',
    scope: 'Проект, где назначен manager',
    capabilities: [
      'Редактирование задач, контактов и сообщений проекта',
      'Добавление и удаление участников проекта',
      'Не может назначать других manager или observer',
      'Не меняет владельца и не архивирует проект',
    ],
  },
  {
    role: 'member',
    scope: 'Проект, где добавлен участником',
    capabilities: [
      'Редактирование задач, контактов и сообщений проекта',
      'Нет управления составом проекта',
      'Нет смены владельца и архивирования',
    ],
  },
  {
    role: 'observer',
    scope: 'Проект, где добавлен наблюдателем',
    capabilities: [
      'Только просмотр проекта, задач, контактов и сообщений',
      'Не редактирует карточки, комментарии, сообщения и привязки',
      'Не завершает задачи и не управляет составом проекта',
    ],
  },
  {
    role: 'sales / trainer',
    scope: 'Только своя зона видимости',
    capabilities: [
      'Видит свои проекты, связанные контакты и свои задачи',
      'Может работать только внутри доступной зоны',
      'Права дополнительно ограничиваются ролью в проекте',
    ],
  },
];

const OWNER_WS_GLOBAL_ROLE_LABELS: Record<string, string> = {
  admin: 'admin',
  owner: 'owner',
  sales: 'sales',
  trainer: 'trainer',
};

const DEFAULT_OWNER_WS_PERMISSION_POLICY: OwnerWorkspacePermissionPolicy = {
  manager_can_manage_team: true,
  manager_can_change_roles: false,
  manager_can_assign_manager: false,
  manager_can_assign_observer: false,
  manager_can_remove_manager: false,
  manager_can_edit_project_meta: false,
  manager_can_archive_project: false,
  limited_can_create_projects: false,
  limited_can_create_contacts: false,
  limited_can_create_tasks: false,
  limited_can_edit_contacts: false,
  limited_can_edit_tasks: false,
  limited_can_manage_project_contacts: false,
  limited_can_complete_tasks: false,
  limited_can_bulk_update_tasks: false,
  limited_can_link_messages: false,
  limited_can_send_messages: false,
  limited_can_comment_tasks: false,
};

type OwnerWorkspaceAssigneeAnalyticsRow = {
  assigneeId: number | null;
  assigneeName: string;
  activeCount: number;
  overdueCount: number;
  completedCount: number;
  avgDaysToComplete: number | null;
};

const OW_TAB_PROJECTS = 0;
const OW_TAB_CONTACTS = 1;
const OW_TAB_TASKS = 2;
const OW_TAB_MEETINGS = 3;
const OW_TAB_REPORTS = 4;
const OW_TAB_COMMS = 5;
const OW_TAB_NOTIFICATIONS = 6;
const OW_TAB_SETTINGS = 7;
const OW_TAB_HISTORY = 8;
const OW_TAB_SITE = 9;
const OWNER_WS_HISTORY_LIMIT_OPTIONS = [100, 200, 300, 500, 1000] as const;
const OWNER_WS_HISTORY_QUERY_KEYS = ['h_entity', 'h_entity_id', 'h_action', 'h_author', 'h_from', 'h_to', 'h_limit', 'h_sort'] as const;

/** Слаги для deep-link: `/owner-workspace?tab=<slug>&task=<id>` (совместимость) и пути `/owner-workspace/<slug>`. */
const OW_TAB_SLUGS = ['projects', 'contacts', 'tasks', 'meetings', 'reports', 'comms', 'notifications', 'settings', 'history', 'site'] as const;

/** Путь вкладки (§16): отдельные URL как у `/notifications` и `/settings`. */
function ownerWorkspaceTabPathname(tabIndex: number): string {
  switch (tabIndex) {
    case OW_TAB_NOTIFICATIONS:
      return '/owner-workspace/projects';
    case OW_TAB_SETTINGS:
      return '/owner-workspace/settings';
    case OW_TAB_PROJECTS:
      return '/owner-workspace/projects';
    case OW_TAB_CONTACTS:
      return '/owner-workspace/contacts';
    case OW_TAB_TASKS:
      return '/owner-workspace/tasks';
    case OW_TAB_MEETINGS:
      return '/owner-workspace/meetings';
    case OW_TAB_REPORTS:
      return '/owner-workspace/reports';
    case OW_TAB_COMMS:
      return '/owner-workspace/comms';
    case OW_TAB_HISTORY:
      return '/owner-workspace/history';
    case OW_TAB_SITE:
      return '/owner-workspace/site';
    default:
      return '/owner-workspace/projects';
  }
}

function ownerWorkspacePathToTab(pathname: string): number | null {
  const p = pathname.replace(/\/$/, '') || pathname;
  if (p === '/owner-workspace/notifications') return OW_TAB_PROJECTS;
  if (p === '/owner-workspace/settings') return OW_TAB_SETTINGS;
  if (p.startsWith('/owner-workspace/projects')) return OW_TAB_PROJECTS;
  if (p.startsWith('/owner-workspace/contacts')) return OW_TAB_CONTACTS;
  if (p.startsWith('/owner-workspace/tasks')) return OW_TAB_TASKS;
  if (p === '/owner-workspace/meetings') return OW_TAB_MEETINGS;
  if (p === '/owner-workspace/reports') return OW_TAB_REPORTS;
  if (p === '/owner-workspace/comms') return OW_TAB_COMMS;
  if (p === '/owner-workspace/history') return OW_TAB_HISTORY;
  if (p === '/owner-workspace/site') return OW_TAB_SITE;
  return null;
}

function ownerWorkspaceEntityFromPath(
  pathname: string
): { kind: 'project' | 'contact' | 'task' | null; id: number | null } {
  const p = pathname.replace(/\/$/, '') || pathname;
  const projectMatch = p.match(/^\/owner-workspace\/projects\/(\d+)$/);
  if (projectMatch) return { kind: 'project', id: parseInt(projectMatch[1], 10) };
  const contactMatch = p.match(/^\/owner-workspace\/contacts\/(\d+)$/);
  if (contactMatch) return { kind: 'contact', id: parseInt(contactMatch[1], 10) };
  const taskMatch = p.match(/^\/owner-workspace\/tasks\/(\d+)$/);
  if (taskMatch) return { kind: 'task', id: parseInt(taskMatch[1], 10) };
  return { kind: null, id: null };
}

function tabIndexFromSlug(slug: string | null): number | null {
  if (!slug) return null;
  if (slug === 'notifications') return null;
  const i = OW_TAB_SLUGS.indexOf(slug as (typeof OW_TAB_SLUGS)[number]);
  return i >= 0 ? i : null;
}

/** Вкладка из URL: путь `/owner-workspace/<раздел>`, либо `/owner-workspace?tab=…`, либо только `task` → «Задачи». */
function resolveOwnerWorkspaceTab(pathname: string, search: URLSearchParams): number | null {
  const fromPath = ownerWorkspacePathToTab(pathname);
  if (fromPath !== null) return fromPath;
  const idx = tabIndexFromSlug(search.get('tab'));
  if (idx !== null) return idx;
  const tr = search.get('task');
  const tid = tr ? parseInt(tr, 10) : NaN;
  if (Number.isFinite(tid) && tid >= 1) return OW_TAB_TASKS;
  return null;
}

const OWNER_WS_NOTIF_KIND_LABELS: Record<string, string> = {
  task_overdue: 'Просрочка',
  task_due_soon: 'Скоро дедлайн',
  task_assigned: 'Назначение',
  task_comment: 'Комментарий',
  task_updated: 'Обновление задачи',
  contact_incoming_message: 'Сообщение',
  task_mention: 'Упоминание',
};

function coerceTaskStatus(v: string): OwnerWorkspaceTaskStatus {
  return OWNER_WS_STATUSES.includes(v as OwnerWorkspaceTaskStatus) ? (v as OwnerWorkspaceTaskStatus) : 'new';
}

function coerceTaskPriority(v: string): OwnerWorkspaceTaskPriority {
  return OWNER_WS_PRIORITIES.includes(v as OwnerWorkspaceTaskPriority) ? (v as OwnerWorkspaceTaskPriority) : 'medium';
}

function coerceProjectStatus(v: string): OwnerWorkspaceProjectStatus {
  return OWNER_WS_PROJECT_STATUSES.includes(v as OwnerWorkspaceProjectStatus) ? (v as OwnerWorkspaceProjectStatus) : 'active';
}

function ensureTaskOption<T extends string>(options: T[], current: T): T[] {
  return options.includes(current) ? options : [...options, current];
}

type ChecklistRow = { id: string; text: string; done: boolean };

function parseChecklistFromTask(raw: OwnerWorkspaceTask['checklist']): ChecklistRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => {
    if (typeof item === 'object' && item !== null) {
      const o = item as Record<string, unknown>;
      const text = String(o.text ?? o.title ?? o.label ?? `Шаг ${i + 1}`);
      const done = Boolean(o.done ?? o.completed ?? o.checked);
      return { id: `chk-${i}-${text.slice(0, 12)}`, text, done };
    }
    return { id: `chk-${i}`, text: String(item), done: false };
  });
}

const KANBAN_COLUMNS: {
  label: string;
  statuses: OwnerWorkspaceTaskStatus[];
  dropStatus: OwnerWorkspaceTaskStatus;
}[] = [
  { label: 'Новые', statuses: ['new'], dropStatus: 'new' },
  { label: 'В работе', statuses: ['in_progress'], dropStatus: 'in_progress' },
  { label: 'Ожидание', statuses: ['waiting'], dropStatus: 'waiting' },
  { label: 'Выполнено', statuses: ['completed'], dropStatus: 'completed' },
  { label: 'Отменено', statuses: ['cancelled'], dropStatus: 'cancelled' },
];

const OwnerWorkspacePage: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const entityRoute = useMemo(() => ownerWorkspaceEntityFromPath(location.pathname), [location.pathname]);
  const skipNextProjectFromUrlEffectRef = useRef(false);
  const skipNextContactFromUrlEffectRef = useRef(false);
  const skipNextTaskFromUrlEffectRef = useRef(false);
  const openProjectDialogRef = useRef<
    (project: OwnerWorkspaceProject, options?: { syncUrl?: boolean }) => Promise<void>
  >(async () => {});
  const openContactDialogRef = useRef<
    (contact: OwnerWorkspaceContact, options?: { syncUrl?: boolean }) => Promise<void>
  >(async () => {});
  const openTaskDialogRef = useRef<
    (task: OwnerWorkspaceTask, options?: { syncUrl?: boolean }) => Promise<void>
  >(async () => {});
  const loadTasksFilteredRef = useRef<() => Promise<void>>(async () => {});
  const effectiveRole = getEffectiveRole(user);
  const isWorkspaceFullAccess = effectiveRole === 'admin' || effectiveRole === 'owner';
  const isLimitedWorkspaceUser = effectiveRole === 'sales' || effectiveRole === 'trainer';
  const currentWorkspaceRoleLabel =
    OWNER_WS_GLOBAL_ROLE_LABELS[effectiveRole || ''] || (effectiveRole ?? 'unknown');
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<OwnerWorkspaceProject[]>([]);
  const [projectsCatalog, setProjectsCatalog] = useState<OwnerWorkspaceProject[]>([]);
  const [contacts, setContacts] = useState<OwnerWorkspaceContact[]>([]);
  const [contactsCatalog, setContactsCatalog] = useState<OwnerWorkspaceContact[]>([]);
  const [tasks, setTasks] = useState<OwnerWorkspaceTask[]>([]);
  const [meetingsCount, setMeetingsCount] = useState(0);
  const [conversations, setConversations] = useState<OwnerWorkspaceConversation[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [historyLogs, setHistoryLogs] = useState<OwnerWorkspaceAuditLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStats, setHistoryStats] = useState<OwnerWorkspaceHistoryStats | null>(null);
  const [historyStatsLoading, setHistoryStatsLoading] = useState(false);
  const [historyStatsLoadedAt, setHistoryStatsLoadedAt] = useState<string | null>(null);
  const [historyReloadTick, setHistoryReloadTick] = useState(0);
  const [historyEntityFilter, setHistoryEntityFilter] = useState<string>('');
  const [historyEntityIdFilter, setHistoryEntityIdFilter] = useState<number | ''>('');
  const [historyActionFilter, setHistoryActionFilter] = useState<string>('');
  const [historyAuthorFilter, setHistoryAuthorFilter] = useState<number | ''>('');
  const [historyCreatedFrom, setHistoryCreatedFrom] = useState('');
  const [historyCreatedTo, setHistoryCreatedTo] = useState('');
  const [historyLimit, setHistoryLimit] = useState<number>(300);
  const [historySortOrder, setHistorySortOrder] = useState<'asc' | 'desc'>('desc');
  const [historyExpandedIds, setHistoryExpandedIds] = useState<number[]>([]);
  const [taskHistoryExpandedIds, setTaskHistoryExpandedIds] = useState<number[]>([]);

  const [projectName, setProjectName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [newContactProjectId, setNewContactProjectId] = useState<number | ''>('');

  const [projectListSearchInput, setProjectListSearchInput] = useState('');
  const [projectListSearch, setProjectListSearch] = useState('');
  const [projectListStatus, setProjectListStatus] = useState('');
  const [projectListOwnerId, setProjectListOwnerId] = useState<number | ''>('');
  const [projectListOverdueOnly, setProjectListOverdueOnly] = useState(false);

  const [contactListSearchInput, setContactListSearchInput] = useState('');
  const [contactListSearch, setContactListSearch] = useState('');
  const [contactListProjectId, setContactListProjectId] = useState<number | ''>('');
  const [contactListActiveTasksOnly, setContactListActiveTasksOnly] = useState(false);
  const [contactListTag, setContactListTag] = useState<string>('');

  const [archiveProjectConfirm, setArchiveProjectConfirm] = useState<OwnerWorkspaceProject | null>(null);
  const [unlinkContactConfirm, setUnlinkContactConfirm] = useState<{
    projectId: number;
    projectName: string;
    contactId: number;
    contactName: string;
    activeTaskCount: number;
  } | null>(null);
  const [removeParticipantConfirm, setRemoveParticipantConfirm] = useState<{
    projectId: number;
    projectName: string;
    userId: number;
    userName: string;
    role: OwnerWorkspaceProjectParticipantRole;
  } | null>(null);

  const [createTaskDialogOpen, setCreateTaskDialogOpen] = useState(false);
  const [createTaskDialogProjectId, setCreateTaskDialogProjectId] = useState<number | null>(null);
  const [createTaskDialogContactId, setCreateTaskDialogContactId] = useState<number | null>(null);
  const [aiTaskText, setAiTaskText] = useState('');
  const [aiTaskCategory, setAiTaskCategory] = useState<AiTaskBreakdownCategory>('schools');
  const [aiTaskLoading, setAiTaskLoading] = useState(false);
  const [aiTaskCreating, setAiTaskCreating] = useState(false);
  const [aiTaskDraft, setAiTaskDraft] = useState<AiTaskBreakdownDraft | null>(null);

  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>('');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<string>('');
  const [taskProjectFilter, setTaskProjectFilter] = useState<number | ''>('');
  const [taskContactFilter, setTaskContactFilter] = useState<number | ''>('');
  const [taskDeadlineFrom, setTaskDeadlineFrom] = useState('');
  const [taskDeadlineTo, setTaskDeadlineTo] = useState('');
  const [taskOverdueOnly, setTaskOverdueOnly] = useState(false);
  const [taskActiveOnly, setTaskActiveOnly] = useState(true);
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState<number | ''>('');
  const [repeatTaskNotice, setRepeatTaskNotice] = useState<OwnerWorkspaceTask | null>(null);
  const [taskViewMode, setTaskViewMode] = useState<'list' | 'kanban' | 'calendar' | 'gantt'>('list');
  // Сворачиваемые панели вкладки «Задачи» (уменьшают визуальный перегруз)
  const [showFiltersPanel, setShowFiltersPanel] = useState(
    () => localStorage.getItem('ow_tasks_panel_filters') === '1'
  );
  const [showAnalyticsPanel, setShowAnalyticsPanel] = useState(
    () => localStorage.getItem('ow_tasks_panel_analytics') === '1'
  );
  const activeTaskFilterCount = useMemo(
    () =>
      [
        taskSearch.trim() !== '',
        taskPriorityFilter !== '',
        taskProjectFilter !== '',
        taskContactFilter !== '',
        taskDeadlineFrom !== '',
        taskDeadlineTo !== '',
        taskAssigneeFilter !== '',
        taskOverdueOnly,
        taskActiveOnly,
      ].filter(Boolean).length,
    [
      taskSearch,
      taskPriorityFilter,
      taskProjectFilter,
      taskContactFilter,
      taskDeadlineFrom,
      taskDeadlineTo,
      taskAssigneeFilter,
      taskOverdueOnly,
      taskActiveOnly,
    ]
  );
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [bulkAssigneeMode, setBulkAssigneeMode] = useState<'skip' | 'set' | 'clear'>('skip');
  const [bulkAssigneeUserId, setBulkAssigneeUserId] = useState<number | ''>('');
  const [bulkPriority, setBulkPriority] = useState<string>('');
  const [bulkDeadline, setBulkDeadline] = useState('');
  const [bulkDeleteTaskConfirmOpen, setBulkDeleteTaskConfirmOpen] = useState(false);
  const [taskActionAnchorEl, setTaskActionAnchorEl] = useState<HTMLElement | null>(null);
  const [taskActionTarget, setTaskActionTarget] = useState<OwnerWorkspaceTask | null>(null);
  const [taskSortBy, setTaskSortBy] = useState<
    'created_at' | 'updated_at' | 'deadline_at' | 'title' | 'priority' | 'status' | 'assignee' | 'project' | 'contact'
  >(
    'deadline_at'
  );
  const [taskSortDir, setTaskSortDir] = useState<'asc' | 'desc'>('asc');
  const [taskListTotal, setTaskListTotal] = useState(0);
  const [taskListPage, setTaskListPage] = useState(0);
  const [taskListRowsPerPage, setTaskListRowsPerPage] = useState(25);
  const [taskStatusCounts, setTaskStatusCounts] = useState<OwnerWorkspaceTaskStatusCounts | null>(null);
  const [tasksAnalytics, setTasksAnalytics] = useState<OwnerWorkspaceTasksAnalyticsOverview | null>(null);
  const [notifAnchor, setNotifAnchor] = useState<null | HTMLElement>(null);
  const [notifEnvelope, setNotifEnvelope] = useState<OwnerWorkspaceNotificationsEnvelope | null>(null);
  const [maxSyncResult, setMaxSyncResult] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [taskConfig, setTaskConfig] = useState<OwnerWorkspaceTaskConfig | null>(null);
  const [taskConfigDraft, setTaskConfigDraft] = useState<OwnerWorkspaceTaskConfig | null>(null);
  const [taskConfigSaving, setTaskConfigSaving] = useState(false);
  const [projectConfig, setProjectConfig] = useState<OwnerWorkspaceProjectConfig | null>(null);
  const [projectConfigDraft, setProjectConfigDraft] = useState<OwnerWorkspaceProjectConfig | null>(null);
  const [projectConfigSaving, setProjectConfigSaving] = useState(false);
  const [notificationConfig, setNotificationConfig] = useState<OwnerWorkspaceNotificationConfig | null>(null);
  const [notificationConfigDraft, setNotificationConfigDraft] = useState<OwnerWorkspaceNotificationConfig | null>(null);
  const [notificationConfigSaving, setNotificationConfigSaving] = useState(false);
  const [notificationDeliveryStats, setNotificationDeliveryStats] = useState<OwnerWorkspaceNotificationDeliveryStats | null>(null);
  const [notificationDeliveryStatsLoading, setNotificationDeliveryStatsLoading] = useState(false);
  const [notificationDeliveryRetrying, setNotificationDeliveryRetrying] = useState<number | 'all' | null>(null);
  const [taskTagDictionary, setTaskTagDictionary] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [taskTagDictionaryDraft, setTaskTagDictionaryDraft] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [taskTagDictionarySaving, setTaskTagDictionarySaving] = useState(false);
  const [contactTagDictionary, setContactTagDictionary] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [contactTagDictionaryDraft, setContactTagDictionaryDraft] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [contactTagDictionarySaving, setContactTagDictionarySaving] = useState(false);
  const [contactSourceDictionary, setContactSourceDictionary] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [contactSourceDictionaryDraft, setContactSourceDictionaryDraft] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [contactSourceDictionarySaving, setContactSourceDictionarySaving] = useState(false);
  const [counterpartyRoleDictionary, setCounterpartyRoleDictionary] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [counterpartyRoleDictionaryDraft, setCounterpartyRoleDictionaryDraft] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [counterpartyRoleDictionarySaving, setCounterpartyRoleDictionarySaving] = useState(false);
  const [counterpartyIndustryDictionary, setCounterpartyIndustryDictionary] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [counterpartyIndustryDictionaryDraft, setCounterpartyIndustryDictionaryDraft] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [counterpartyIndustryDictionarySaving, setCounterpartyIndustryDictionarySaving] = useState(false);
  const [permissionPolicy, setPermissionPolicy] = useState<OwnerWorkspacePermissionPolicy>(DEFAULT_OWNER_WS_PERMISSION_POLICY);
  const [permissionPolicyDraft, setPermissionPolicyDraft] = useState<OwnerWorkspacePermissionPolicy>(DEFAULT_OWNER_WS_PERMISSION_POLICY);
  const [permissionPolicySaving, setPermissionPolicySaving] = useState(false);
  const [settingsBundleDialogOpen, setSettingsBundleDialogOpen] = useState(false);
  const [settingsBundleImportText, setSettingsBundleImportText] = useState('');
  const [settingsBundleImporting, setSettingsBundleImporting] = useState(false);
  const [settingsBundleLastExportMeta, setSettingsBundleLastExportMeta] = useState<OwnerWorkspaceSettingsBundleEnvelope['meta'] | null>(null);
  const [settingsSnapshots, setSettingsSnapshots] = useState<OwnerWorkspaceSettingsSnapshot[]>([]);
  const [settingsSnapshotsLoading, setSettingsSnapshotsLoading] = useState(false);
  const [settingsSnapshotCreateOpen, setSettingsSnapshotCreateOpen] = useState(false);
  const [settingsSnapshotName, setSettingsSnapshotName] = useState('');
  const [settingsSnapshotNote, setSettingsSnapshotNote] = useState('');
  const [settingsSnapshotCreating, setSettingsSnapshotCreating] = useState(false);
  const [settingsSnapshotSearch, setSettingsSnapshotSearch] = useState('');
  const [settingsSnapshotOnlyChanged, setSettingsSnapshotOnlyChanged] = useState(false);
  const [settingsSnapshotSort, setSettingsSnapshotSort] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [settingsSnapshotReview, setSettingsSnapshotReview] = useState<OwnerWorkspaceSettingsSnapshot | null>(null);
  const [settingsSnapshotCompareBaseId, setSettingsSnapshotCompareBaseId] = useState('__current__');
  const [settingsSnapshotCreateSafetyBeforeApply, setSettingsSnapshotCreateSafetyBeforeApply] = useState(true);
  const [settingsSnapshotEditOpen, setSettingsSnapshotEditOpen] = useState(false);
  const [settingsSnapshotPreview, setSettingsSnapshotPreview] = useState<OwnerWorkspaceSettingsSnapshot | null>(null);
  const [settingsSnapshotDeleteConfirm, setSettingsSnapshotDeleteConfirm] = useState<OwnerWorkspaceSettingsSnapshot | null>(null);
  const [settingsSnapshotEditingId, setSettingsSnapshotEditingId] = useState<string | null>(null);
  const [settingsSnapshotDuplicatingId, setSettingsSnapshotDuplicatingId] = useState<string | null>(null);
  const [settingsSnapshotApplyingId, setSettingsSnapshotApplyingId] = useState<string | null>(null);
  const [settingsSnapshotDeletingId, setSettingsSnapshotDeletingId] = useState<string | null>(null);
  const currentWorkspaceAccessSummary = useMemo(() => {
    if (isWorkspaceFullAccess) {
      return [
        'Полный доступ ко всем проектам, контактам, задачам и сообщениям.',
        'Управление владельцем проекта, архивом и системными настройками.',
        'Назначение project manager и observer внутри проектов.',
      ];
    }
    const limitedSummary = [
      'Доступ только к собственной зоне видимости: свои проекты, связанные контакты и свои задачи.',
      'Фактический уровень редактирования внутри проекта дополнительно зависит от роли member / manager / observer.',
    ];
    if (permissionPolicy.limited_can_create_projects) {
      limitedSummary.splice(1, 0, 'Создание новых проектов разрешено системной policy-моделью.');
    }
    if (permissionPolicy.limited_can_create_contacts) {
      limitedSummary.splice(
        permissionPolicy.limited_can_create_projects ? 2 : 1,
        0,
        'Создание новых контактов разрешено системной policy-моделью, но требует привязки к доступному проекту.'
      );
    } else {
      limitedSummary.splice(
        permissionPolicy.limited_can_create_projects ? 2 : 1,
        0,
        'Создание контактов для ограниченных ролей может быть отключено policy-моделью.'
      );
    }
    limitedSummary.push(
      permissionPolicy.limited_can_create_tasks
        ? 'Создание новых задач разрешено системной policy-моделью.'
        : 'Создание новых задач для ограниченных ролей может быть отключено policy-моделью.'
    );
    limitedSummary.push(
      permissionPolicy.limited_can_edit_contacts
        ? 'Редактирование карточек контактов разрешено системной policy-моделью.'
        : 'Редактирование карточек контактов для ограниченных ролей может быть отключено policy-моделью.'
    );
    limitedSummary.push(
      permissionPolicy.limited_can_edit_tasks
        ? 'Редактирование полей задач разрешено системной policy-моделью.'
        : 'Редактирование полей задач для ограниченных ролей может быть отключено policy-моделью.'
    );
    limitedSummary.push(
      permissionPolicy.limited_can_manage_project_contacts
        ? 'Привязка и отвязка контактов в проектах разрешены системной policy-моделью.'
        : 'Привязка и отвязка контактов в проектах для ограниченных ролей могут быть отключены policy-моделью.'
    );
    limitedSummary.push(
      permissionPolicy.limited_can_complete_tasks
        ? 'Завершение задач разрешено системной policy-моделью.'
        : 'Завершение задач для ограниченных ролей может быть отключено policy-моделью.'
    );
    limitedSummary.push(
      permissionPolicy.limited_can_bulk_update_tasks
        ? 'Массовое обновление задач разрешено системной policy-моделью.'
        : 'Массовое обновление задач для ограниченных ролей может быть отключено policy-моделью.'
    );
    limitedSummary.push(
      permissionPolicy.limited_can_link_messages
        ? 'Привязка сообщений к задачам разрешена системной policy-моделью.'
        : 'Привязка сообщений к задачам для ограниченных ролей может быть отключена policy-моделью.'
    );
    limitedSummary.push(
      permissionPolicy.limited_can_send_messages
        ? 'Отправка исходящих сообщений разрешена системной policy-моделью.'
        : 'Отправка исходящих сообщений для ограниченных ролей может быть отключена policy-моделью.'
    );
    limitedSummary.push(
      permissionPolicy.limited_can_comment_tasks
        ? 'Комментарии к задачам разрешены системной policy-моделью.'
        : 'Комментарии к задачам для ограниченных ролей могут быть отключены policy-моделью.'
    );
    return limitedSummary;
  }, [
    isWorkspaceFullAccess,
    permissionPolicy.limited_can_create_contacts,
    permissionPolicy.limited_can_create_projects,
    permissionPolicy.limited_can_create_tasks,
    permissionPolicy.limited_can_edit_contacts,
    permissionPolicy.limited_can_edit_tasks,
    permissionPolicy.limited_can_manage_project_contacts,
    permissionPolicy.limited_can_complete_tasks,
    permissionPolicy.limited_can_bulk_update_tasks,
    permissionPolicy.limited_can_link_messages,
    permissionPolicy.limited_can_send_messages,
    permissionPolicy.limited_can_comment_tasks,
  ]);

  const workspaceSettingsBundle = useMemo<OwnerWorkspaceSettingsBundle | null>(() => {
    if (!taskConfig || !projectConfig || !notificationConfig) return null;
    return {
      task_config: taskConfig,
      project_config: projectConfig,
      permission_policy: permissionPolicy,
      notification_config: notificationConfig,
      task_tags: taskTagDictionary,
      contact_tags: contactTagDictionary,
      contact_sources: contactSourceDictionary,
    };
  }, [
    contactSourceDictionary,
    contactTagDictionary,
    notificationConfig,
    permissionPolicy,
    projectConfig,
    taskConfig,
    taskTagDictionary,
  ]);

  const workspaceSettingsBundleSummary = useMemo<OwnerWorkspaceSettingsBundleSummary | null>(
    () => (workspaceSettingsBundle ? summarizeWorkspaceSettingsBundle(workspaceSettingsBundle) : null),
    [workspaceSettingsBundle]
  );
  const settingsSnapshotDiffMap = useMemo(() => {
    const entries = settingsSnapshots.map((snapshot) => {
      const diff = workspaceSettingsBundleSectionDiff(workspaceSettingsBundle, snapshot.bundle.data);
      return [snapshot.id, diff] as const;
    });
    return new Map(entries);
  }, [settingsSnapshots, workspaceSettingsBundle]);
  const filteredSettingsSnapshots = useMemo(() => {
    const query = settingsSnapshotSearch.trim().toLowerCase();
    const base = settingsSnapshots.filter((snapshot) => {
      const haystack = [snapshot.name, snapshot.note || '', snapshot.created_by_name || ''].join(' ').toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      const changedCount = (settingsSnapshotDiffMap.get(snapshot.id) || []).filter((item) => item.changed).length;
      const matchesChanged = !settingsSnapshotOnlyChanged || changedCount > 0;
      return matchesQuery && matchesChanged;
    });
    return [...base].sort((a, b) => {
      if (settingsSnapshotSort === 'name') return a.name.localeCompare(b.name, 'ru');
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return settingsSnapshotSort === 'oldest' ? diff : -diff;
    });
  }, [settingsSnapshotDiffMap, settingsSnapshotOnlyChanged, settingsSnapshotSearch, settingsSnapshotSort, settingsSnapshots]);
  const settingsSnapshotsChangedCount = useMemo(
    () => settingsSnapshots.filter((snapshot) => (settingsSnapshotDiffMap.get(snapshot.id) || []).some((item) => item.changed)).length,
    [settingsSnapshotDiffMap, settingsSnapshots]
  );
  const settingsSnapshotCompareBaseSnapshot = useMemo(
    () =>
      settingsSnapshotCompareBaseId === '__current__'
        ? null
        : settingsSnapshots.find((snapshot) => snapshot.id === settingsSnapshotCompareBaseId) || null,
    [settingsSnapshotCompareBaseId, settingsSnapshots]
  );
  const settingsSnapshotCompareBaseBundle = settingsSnapshotCompareBaseSnapshot?.bundle.data || workspaceSettingsBundle;
  const settingsSnapshotCompareBaseSummary = useMemo<OwnerWorkspaceSettingsBundleSummary | null>(
    () => (settingsSnapshotCompareBaseBundle ? summarizeWorkspaceSettingsBundle(settingsSnapshotCompareBaseBundle) : null),
    [settingsSnapshotCompareBaseBundle]
  );
  const reviewedSnapshotDiff = useMemo(
    () => (settingsSnapshotReview ? workspaceSettingsBundleSectionDiff(settingsSnapshotCompareBaseBundle, settingsSnapshotReview.bundle.data) : []),
    [settingsSnapshotCompareBaseBundle, settingsSnapshotReview]
  );

  const parsedSettingsBundleInput = useMemo(() => {
    if (!settingsBundleImportText.trim()) {
      return { raw: null as unknown, bundle: null as OwnerWorkspaceSettingsBundle | null, error: '' };
    }
    try {
      const raw = JSON.parse(settingsBundleImportText);
      const bundle = extractWorkspaceSettingsBundle(raw);
      if (!bundle) {
        return {
          raw,
          bundle: null,
          error: 'JSON не похож на owner-workspace settings bundle.',
        };
      }
      return { raw, bundle, error: '' };
    } catch {
      return { raw: null as unknown, bundle: null as OwnerWorkspaceSettingsBundle | null, error: 'Некорректный JSON.' };
    }
  }, [settingsBundleImportText]);

  const permissionMatrixRows = useMemo(
    () => [
      {
        action: 'Просмотр проектов, контактов и задач',
        adminOwner: 'Да',
        limited: 'Своя зона',
        projectOwner: 'Да',
        manager: 'Да',
        member: 'Да',
        observer: 'Да',
      },
      {
        action: 'Создание проектов',
        adminOwner: 'Да',
        limited: permissionPolicy.limited_can_create_projects ? 'По policy' : 'Нет',
        projectOwner: '—',
        manager: '—',
        member: '—',
        observer: '—',
      },
      {
        action: 'Создание контактов',
        adminOwner: 'Да',
        limited: permissionPolicy.limited_can_create_contacts ? 'По policy' : 'Нет',
        projectOwner: 'Да',
        manager: permissionPolicy.limited_can_create_contacts ? 'По policy' : 'Нет',
        member: permissionPolicy.limited_can_create_contacts ? 'По policy' : 'Нет',
        observer: 'Нет',
      },
      {
        action: 'Редактирование карточки контакта',
        adminOwner: 'Да',
        limited: permissionPolicy.limited_can_edit_contacts ? 'По policy' : 'Нет',
        projectOwner: 'Да',
        manager: permissionPolicy.limited_can_edit_contacts ? 'По policy' : 'Нет',
        member: permissionPolicy.limited_can_edit_contacts ? 'По policy' : 'Нет',
        observer: 'Нет',
      },
      {
        action: 'Создание задач',
        adminOwner: 'Да',
        limited: permissionPolicy.limited_can_create_tasks ? 'По policy' : 'Нет',
        projectOwner: 'Да',
        manager: permissionPolicy.limited_can_create_tasks ? 'По policy' : 'Нет',
        member: permissionPolicy.limited_can_create_tasks ? 'По policy' : 'Нет',
        observer: 'Нет',
      },
      {
        action: 'Редактирование полей задач',
        adminOwner: 'Да',
        limited: permissionPolicy.limited_can_edit_tasks ? 'По policy' : 'Нет',
        projectOwner: 'Да',
        manager: permissionPolicy.limited_can_edit_tasks ? 'По policy' : 'Нет',
        member: permissionPolicy.limited_can_edit_tasks ? 'По policy' : 'Нет',
        observer: 'Нет',
      },
      {
        action: 'Завершение задач',
        adminOwner: 'Да',
        limited: permissionPolicy.limited_can_complete_tasks ? 'По policy' : 'Нет',
        projectOwner: 'Да',
        manager: permissionPolicy.limited_can_complete_tasks ? 'По policy' : 'Нет',
        member: permissionPolicy.limited_can_complete_tasks ? 'По policy' : 'Нет',
        observer: 'Нет',
      },
      {
        action: 'Массовое обновление задач',
        adminOwner: 'Да',
        limited: permissionPolicy.limited_can_bulk_update_tasks ? 'По policy' : 'Нет',
        projectOwner: permissionPolicy.limited_can_bulk_update_tasks ? 'По policy' : 'Нет',
        manager: permissionPolicy.limited_can_bulk_update_tasks ? 'По policy' : 'Нет',
        member: permissionPolicy.limited_can_bulk_update_tasks ? 'По policy' : 'Нет',
        observer: 'Нет',
      },
      {
        action: 'Комментарии к задачам',
        adminOwner: 'Да',
        limited: permissionPolicy.limited_can_comment_tasks ? 'По policy' : 'Нет',
        projectOwner: 'Да',
        manager: permissionPolicy.limited_can_comment_tasks ? 'По policy' : 'Нет',
        member: permissionPolicy.limited_can_comment_tasks ? 'По policy' : 'Нет',
        observer: 'Нет',
      },
      {
        action: 'Привязка сообщений к задачам',
        adminOwner: 'Да',
        limited: permissionPolicy.limited_can_link_messages ? 'По policy' : 'Нет',
        projectOwner: 'Да',
        manager: permissionPolicy.limited_can_link_messages ? 'По policy' : 'Нет',
        member: permissionPolicy.limited_can_link_messages ? 'По policy' : 'Нет',
        observer: 'Нет',
      },
      {
        action: 'Исходящие сообщения',
        adminOwner: 'Да',
        limited: permissionPolicy.limited_can_send_messages ? 'По policy' : 'Нет',
        projectOwner: 'Да',
        manager: permissionPolicy.limited_can_send_messages ? 'По policy' : 'Нет',
        member: permissionPolicy.limited_can_send_messages ? 'По policy' : 'Нет',
        observer: 'Нет',
      },
      {
        action: 'Привязка контактов к проекту',
        adminOwner: 'Да',
        limited: permissionPolicy.limited_can_manage_project_contacts ? 'По policy' : 'Нет',
        projectOwner: 'Да',
        manager: permissionPolicy.limited_can_manage_project_contacts ? 'По policy' : 'Нет',
        member: permissionPolicy.limited_can_manage_project_contacts ? 'По policy' : 'Нет',
        observer: 'Нет',
      },
      {
        action: 'Управление участниками проекта',
        adminOwner: 'Да',
        limited: 'По роли в проекте',
        projectOwner: 'Да',
        manager: permissionPolicy.manager_can_manage_team ? 'По manager policy' : 'Нет',
        member: 'Нет',
        observer: 'Нет',
      },
      {
        action: 'Смена ролей участников',
        adminOwner: 'Да',
        limited: 'По роли в проекте',
        projectOwner: 'Да',
        manager: permissionPolicy.manager_can_change_roles ? 'По manager policy' : 'Нет',
        member: 'Нет',
        observer: 'Нет',
      },
      {
        action: 'Назначение менеджеров',
        adminOwner: 'Да',
        limited: 'По роли в проекте',
        projectOwner: 'Да',
        manager: permissionPolicy.manager_can_assign_manager ? 'По manager policy' : 'Нет',
        member: 'Нет',
        observer: 'Нет',
      },
      {
        action: 'Назначение наблюдателей',
        adminOwner: 'Да',
        limited: 'По роли в проекте',
        projectOwner: 'Да',
        manager: permissionPolicy.manager_can_assign_observer ? 'По manager policy' : 'Нет',
        member: 'Нет',
        observer: 'Нет',
      },
      {
        action: 'Удаление менеджеров из проекта',
        adminOwner: 'Да',
        limited: 'По роли в проекте',
        projectOwner: 'Да',
        manager: permissionPolicy.manager_can_remove_manager ? 'По manager policy' : 'Нет',
        member: 'Нет',
        observer: 'Нет',
      },
      {
        action: 'Редактирование метаданных проекта',
        adminOwner: 'Да',
        limited: 'По роли в проекте',
        projectOwner: 'Да',
        manager: permissionPolicy.manager_can_edit_project_meta ? 'По manager policy' : 'Нет',
        member: 'Нет',
        observer: 'Нет',
      },
      {
        action: 'Архивирование проекта',
        adminOwner: 'Да',
        limited: 'По роли в проекте',
        projectOwner: 'Да',
        manager: permissionPolicy.manager_can_archive_project ? 'По manager policy' : 'Нет',
        member: 'Нет',
        observer: 'Нет',
      },
    ],
    [permissionPolicy]
  );
  const [digest, setDigest] = useState<OwnerWorkspaceDigest | null>(null);
  const [digestScope, setDigestScope] = useState<'all' | 'mine'>('all');
  const [digestProjectFilter, setDigestProjectFilter] = useState<number | ''>('');
  const [digestDueHours, setDigestDueHours] = useState(48);
  const [notifyEmailEnabled, setNotifyEmailEnabled] = useState(false);
  const [notifyWebPushEnabled, setNotifyWebPushEnabled] = useState(false);
  const [notifyTaskOverdue, setNotifyTaskOverdue] = useState(true);
  const [notifyTaskDueSoon, setNotifyTaskDueSoon] = useState(true);
  const [notifyTaskAssigned, setNotifyTaskAssigned] = useState(true);
  const [notifyTaskComment, setNotifyTaskComment] = useState(true);
  const [notifyTaskUpdated, setNotifyTaskUpdated] = useState(true);
  const [notifyContactIncomingMessage, setNotifyContactIncomingMessage] = useState(true);
  const [notifyTaskMention, setNotifyTaskMention] = useState(true);
  const [webPushStatus, setWebPushStatus] = useState<OwnerWorkspaceWebPushStatus | null>(null);
  const [webPushBrowserSupported, setWebPushBrowserSupported] = useState(false);
  const [webPushPermission, setWebPushPermission] = useState<string>('default');
  const [webPushConnected, setWebPushConnected] = useState(false);
  const [webPushBusy, setWebPushBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OwnerWorkspaceSearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const [projectDialog, setProjectDialog] = useState<OwnerWorkspaceProject | null>(null);
  const [projectEditName, setProjectEditName] = useState('');
  const [projectEditDescription, setProjectEditDescription] = useState('');
  const [projectEditStatus, setProjectEditStatus] = useState<OwnerWorkspaceProjectStatus>('active');
  const [projectEditStartAt, setProjectEditStartAt] = useState('');
  const [projectEditDeadlineAt, setProjectEditDeadlineAt] = useState('');
  const [subprojectName, setSubprojectName] = useState('');
  const [linkContactId, setLinkContactId] = useState<OwnerWorkspaceContact | null>(null);

  const [contactDialog, setContactDialog] = useState<OwnerWorkspaceContact | null>(null);
  const [contactEditFullName, setContactEditFullName] = useState('');
  const [contactEditPhone, setContactEditPhone] = useState('');
  const [contactEditEmail, setContactEditEmail] = useState('');
  const [contactEditCompany, setContactEditCompany] = useState('');
  const [contactEditPosition, setContactEditPosition] = useState('');
  const [contactEditTags, setContactEditTags] = useState<string[]>([]);
  const [contactEditComment, setContactEditComment] = useState('');
  const [contactEditSource, setContactEditSource] = useState('');
  const [contactLinkProjectId, setContactLinkProjectId] = useState<OwnerWorkspaceProject | null>(null);
  const [contactMessages, setContactMessages] = useState<OwnerWorkspaceMessage[]>([]);
  const [newContactMessage, setNewContactMessage] = useState('');

  const [taskDialog, setTaskDialog] = useState<OwnerWorkspaceTask | null>(null);
  const [deleteTaskConfirm, setDeleteTaskConfirm] = useState<OwnerWorkspaceTask | null>(null);

  const closeProjectDialog = useCallback(() => {
    setProjectDialog(null);
    if (entityRoute.kind === 'project') {
      navigate('/owner-workspace/projects', { replace: true });
    }
  }, [entityRoute.kind, navigate]);

  const closeContactDialog = useCallback(() => {
    setContactDialog(null);
    if (entityRoute.kind === 'contact') {
      navigate('/owner-workspace/contacts', { replace: true });
    }
  }, [entityRoute.kind, navigate]);

  const closeTaskDialog = useCallback(() => {
    setTaskDialog(null);
    if (entityRoute.kind === 'task') {
      navigate('/owner-workspace/tasks', { replace: true });
      return;
    }
    setSearchParams((prev) => {
      if (!prev.get('task')) return prev;
      const next = new URLSearchParams(prev);
      next.delete('task');
      return next;
    }, { replace: true });
  }, [entityRoute.kind, navigate, setSearchParams]);

  const [taskEditTitle, setTaskEditTitle] = useState('');
  const [taskEditDescription, setTaskEditDescription] = useState('');
  const [taskEditStatus, setTaskEditStatus] = useState<OwnerWorkspaceTaskStatus>('new');
  const [taskEditPriority, setTaskEditPriority] = useState<OwnerWorkspaceTaskPriority>('medium');
  const [taskEditDeadline, setTaskEditDeadline] = useState('');
  const [taskEditStartAt, setTaskEditStartAt] = useState('');
  const [taskEditAttachmentsText, setTaskEditAttachmentsText] = useState('[]');
  const [taskDialogHistory, setTaskDialogHistory] = useState<OwnerWorkspaceAuditLog[]>([]);
  const [taskEditProjectId, setTaskEditProjectId] = useState<number | ''>('');
  const [taskEditContactId, setTaskEditContactId] = useState<number | ''>('');
  const [taskEditAssigneeId, setTaskEditAssigneeId] = useState<number | ''>('');
  const [taskEditTags, setTaskEditTags] = useState<string[]>([]);
  const [taskEditChecklist, setTaskEditChecklist] = useState<ChecklistRow[]>([]);
  const [taskEditBulkOpen, setTaskEditBulkOpen] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<number>>(new Set());
  const [taskEditBulkText, setTaskEditBulkText] = useState('');
  const [taskComments, setTaskComments] = useState<OwnerWorkspaceTaskComment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');

  const [completeDialogTask, setCompleteDialogTask] = useState<OwnerWorkspaceTask | null>(null);
  const [completeMode, setCompleteMode] = useState<'close' | 'close_and_create_next'>('close');
  const [nextTaskTitle, setNextTaskTitle] = useState('');

  const [commsContactId, setCommsContactId] = useState<number | null>(null);
  const [commsMessages, setCommsMessages] = useState<OwnerWorkspaceMessage[]>([]);
  /** Поиск по списку диалогов (имя / последнее сообщение) */
  const [commsDialogSearch, setCommsDialogSearch] = useState('');
  /** Поиск по тексту в открытой переписке */
  const [commsThreadSearch, setCommsThreadSearch] = useState('');
  /** Поиск по сообщениям в карточке контакта */
  const [contactMessageSearch, setContactMessageSearch] = useState('');
  const [messageTaskDialog, setMessageTaskDialog] = useState<{ message: OwnerWorkspaceMessage } | null>(null);
  const [messageTaskTitle, setMessageTaskTitle] = useState('');
  const [linkTaskDialog, setLinkTaskDialog] = useState<{ message: OwnerWorkspaceMessage } | null>(null);
  const [linkTaskOptions, setLinkTaskOptions] = useState<OwnerWorkspaceTask[]>([]);
  const [linkTaskSelected, setLinkTaskSelected] = useState<OwnerWorkspaceTask | null>(null);
  const [participantToAdd, setParticipantToAdd] = useState<User | null>(null);
  const [newParticipantRole, setNewParticipantRole] = useState<OwnerWorkspaceProjectParticipantRole>('member');
  const [contactDialogTasks, setContactDialogTasks] = useState<OwnerWorkspaceTask[]>([]);
  const [projectDialogTasks, setProjectDialogTasks] = useState<OwnerWorkspaceTask[]>([]);
  const [projectDialogTaskStatus, setProjectDialogTaskStatus] = useState<string>('');
  const [projectDialogTaskSearch, setProjectDialogTaskSearch] = useState('');

  const statusLabels = useMemo(() => {
    const merged: Record<string, string> = { ...DEFAULT_STATUS_LABELS };
    for (const item of taskConfig?.statuses ?? []) {
      merged[item.key] = item.label;
    }
    return merged;
  }, [taskConfig]);

  const priorityLabels = useMemo(() => {
    const merged: Record<string, string> = { ...DEFAULT_PRIORITY_LABELS };
    for (const item of taskConfig?.priorities ?? []) {
      merged[item.key] = item.label;
    }
    return merged;
  }, [taskConfig]);
  const projectStatusLabels = useMemo(() => {
    const merged: Record<string, string> = { ...DEFAULT_PROJECT_STATUS_LABELS };
    for (const item of projectConfig?.statuses ?? []) {
      merged[item.key] = item.label;
    }
    return merged;
  }, [projectConfig]);
  const notificationLabels = useMemo(() => {
    const map: Record<string, string> = { ...OWNER_WS_NOTIF_KIND_LABELS };
    for (const item of notificationConfig?.items ?? []) {
      if (item.key) map[item.key] = item.label || item.key;
    }
    return map;
  }, [notificationConfig]);
  const notificationConfigMap = useMemo(() => {
    const map: Record<string, { label: string; enabled: boolean }> = {};
    for (const item of notificationConfig?.items ?? []) {
      map[item.key] = { label: item.label || item.key, enabled: item.enabled !== false };
    }
    return map;
  }, [notificationConfig]);

  const enabledStatuses = useMemo(() => {
    const configured = (taskConfig?.statuses ?? [])
      .filter((item) => item.enabled !== false)
      .map((item) => coerceTaskStatus(item.key));
    return configured.length > 0 ? Array.from(new Set(configured)) : OWNER_WS_STATUSES;
  }, [taskConfig]);

  const enabledPriorities = useMemo(() => {
    const configured = (taskConfig?.priorities ?? [])
      .filter((item) => item.enabled !== false)
      .map((item) => coerceTaskPriority(item.key));
    return configured.length > 0 ? Array.from(new Set(configured)) : OWNER_WS_PRIORITIES;
  }, [taskConfig]);
  const enabledProjectStatuses = useMemo(() => {
    const configured = (projectConfig?.statuses ?? [])
      .filter((item) => item.enabled !== false)
      .map((item) => coerceProjectStatus(item.key));
    return configured.length > 0 ? Array.from(new Set(configured)) : OWNER_WS_PROJECT_STATUSES;
  }, [projectConfig]);

  const editStatusOptions = useMemo(
    () => ensureTaskOption(enabledStatuses, taskEditStatus),
    [enabledStatuses, taskEditStatus]
  );

  const editPriorityOptions = useMemo(
    () => ensureTaskOption(enabledPriorities, taskEditPriority),
    [enabledPriorities, taskEditPriority]
  );

  const editProjectStatusOptions = useMemo(
    () => ensureTaskOption(enabledProjectStatuses, coerceProjectStatus(projectEditStatus)),
    [enabledProjectStatuses, projectEditStatus]
  );

  useEffect(() => {
    const id = window.setTimeout(() => setProjectListSearch(projectListSearchInput), 400);
    return () => clearTimeout(id);
  }, [projectListSearchInput]);

  useEffect(() => {
    const id = window.setTimeout(() => setContactListSearch(contactListSearchInput), 400);
    return () => clearTimeout(id);
  }, [contactListSearchInput]);

  const loadProjectsAndContacts = useCallback(async () => {
    try {
      const projectParams = {
        status_filter: projectListStatus || undefined,
        search: projectListSearch.trim() || undefined,
        owner_id: projectListOwnerId === '' ? undefined : projectListOwnerId,
        has_overdue_tasks: projectListOverdueOnly || undefined,
      };
      const contactParams = {
        search: contactListSearch.trim() || undefined,
        project_id: contactListProjectId === '' ? undefined : contactListProjectId,
        active_tasks_only: contactListActiveTasksOnly || undefined,
        tag: contactListTag.trim() || undefined,
      };
      const hasProjectFilters = Boolean(
        projectListStatus ||
          projectListSearch.trim() ||
          projectListOwnerId !== '' ||
          projectListOverdueOnly
      );
      const hasContactFilters = Boolean(
        contactListSearch.trim() ||
          contactListProjectId !== '' ||
          contactListActiveTasksOnly ||
          contactListTag.trim()
      );

      const tasks: Promise<unknown>[] = [];
      if (hasProjectFilters) {
        tasks.push(ownerWorkspaceApi.listProjects(projectParams));
        tasks.push(ownerWorkspaceApi.listProjects({}));
      } else {
        tasks.push(ownerWorkspaceApi.listProjects({}));
      }
      if (hasContactFilters) {
        tasks.push(ownerWorkspaceApi.listContacts(contactParams));
        tasks.push(ownerWorkspaceApi.listContacts({}));
      } else {
        tasks.push(ownerWorkspaceApi.listContacts({}));
      }

      const results = await Promise.all(tasks);
      let idx = 0;
      let pFiltered: OwnerWorkspaceProject[];
      let pAll: OwnerWorkspaceProject[];
      if (hasProjectFilters) {
        pFiltered = results[idx++] as OwnerWorkspaceProject[];
        pAll = results[idx++] as OwnerWorkspaceProject[];
      } else {
        pAll = results[idx++] as OwnerWorkspaceProject[];
        pFiltered = pAll;
      }
      let cFiltered: OwnerWorkspaceContact[];
      let cAll: OwnerWorkspaceContact[];
      if (hasContactFilters) {
        cFiltered = results[idx++] as OwnerWorkspaceContact[];
        cAll = results[idx++] as OwnerWorkspaceContact[];
      } else {
        cAll = results[idx++] as OwnerWorkspaceContact[];
        cFiltered = cAll;
      }

      setProjects(pFiltered.filter((project) => project.parent_project_id == null));
      setProjectsCatalog(pAll);
      setContacts(cFiltered);
      setContactsCatalog(cAll);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось загрузить проекты/контакты'));
    }
  }, [
    projectListStatus,
    projectListSearch,
    projectListOwnerId,
    projectListOverdueOnly,
    contactListSearch,
    contactListProjectId,
    contactListActiveTasksOnly,
    contactListTag,
  ]);

  const loadMeetingsCount = useCallback(async () => {
    try {
      const rows = await ownerWorkspaceApi.listMeetings({ limit: 500 });
      setMeetingsCount(rows.length);
    } catch {
      setMeetingsCount(0);
    }
  }, []);

  const loadTasksFiltered = useCallback(async (opts?: { statusFilter?: string }) => {
    try {
      const usePaging = taskViewMode === 'list';
      const effStatus = opts?.statusFilter !== undefined ? opts.statusFilter : taskStatusFilter;
      const filterKey = JSON.stringify({
        taskSearch,
        taskStatusFilter: effStatus,
        taskPriorityFilter,
        taskProjectFilter,
        taskContactFilter,
        taskDeadlineFrom,
        taskDeadlineTo,
        taskOverdueOnly,
        taskActiveOnly,
        taskAssigneeFilter,
        taskSortBy,
        taskSortDir,
        taskViewMode,
        taskListRowsPerPage,
      });
      let effectivePage = taskListPage;
      if (taskFilterKeyRef.current !== filterKey) {
        taskFilterKeyRef.current = filterKey;
        effectivePage = 0;
        if (taskListPage !== 0) {
          setTaskListPage(0);
        }
      }
      const limit = usePaging ? taskListRowsPerPage : OWNER_WS_TASKS_FETCH_CAP;
      const offset = usePaging ? effectivePage * taskListRowsPerPage : 0;
      const countParams = {
        search: taskSearch.trim() || undefined,
        priority: taskPriorityFilter || undefined,
        project_id: taskProjectFilter === '' ? undefined : taskProjectFilter,
        contact_id: taskContactFilter === '' ? undefined : taskContactFilter,
        assignee_id: taskAssigneeFilter === '' ? undefined : taskAssigneeFilter,
        deadline_from: localInputToIso(taskDeadlineFrom) || undefined,
        deadline_to: localInputToIso(taskDeadlineTo) || undefined,
        overdue_only: taskOverdueOnly || undefined,
        active_only: taskActiveOnly || undefined,
      };
      const [taskPage, counts] = await Promise.all([
        ownerWorkspaceApi.listTasks({
          ...countParams,
          status_filter: effStatus || undefined,
          sort_by: taskSortBy,
          sort_dir: taskSortDir,
          limit,
          offset,
        }),
        ownerWorkspaceApi.getTaskStatusCounts(countParams),
      ]);
      setTasks(taskPage.items);
      setTaskListTotal(taskPage.total);
      setTaskStatusCounts(counts);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось загрузить задачи'));
    }
  }, [
    taskSearch,
    taskStatusFilter,
    taskPriorityFilter,
    taskProjectFilter,
    taskContactFilter,
    taskDeadlineFrom,
    taskDeadlineTo,
    taskOverdueOnly,
    taskActiveOnly,
    taskAssigneeFilter,
    taskSortBy,
    taskSortDir,
    taskViewMode,
    taskListPage,
    taskListRowsPerPage,
  ]);

  const loadNotifications = useCallback(async (limit = 80) => {
    try {
      const env = await ownerWorkspaceApi.listNotifications({ limit });
      setNotifEnvelope(env);
    } catch {
      setNotifEnvelope(null);
    }
  }, []);

  const applyWorkspaceSettingsBundle = useCallback((bundle: OwnerWorkspaceSettingsBundle) => {
    setTaskConfig(bundle.task_config);
    setTaskConfigDraft(bundle.task_config);
    setProjectConfig(bundle.project_config);
    setProjectConfigDraft(bundle.project_config);
    setNotificationConfig(bundle.notification_config);
    setNotificationConfigDraft(bundle.notification_config);
    setTaskTagDictionary(bundle.task_tags);
    setTaskTagDictionaryDraft(bundle.task_tags);
    setContactTagDictionary(bundle.contact_tags);
    setContactTagDictionaryDraft(bundle.contact_tags);
    setContactSourceDictionary(bundle.contact_sources);
    setContactSourceDictionaryDraft(bundle.contact_sources);
    if (bundle.counterparty_roles) {
      setCounterpartyRoleDictionary(bundle.counterparty_roles);
      setCounterpartyRoleDictionaryDraft(bundle.counterparty_roles);
    }
    if (bundle.counterparty_industries) {
      setCounterpartyIndustryDictionary(bundle.counterparty_industries);
      setCounterpartyIndustryDictionaryDraft(bundle.counterparty_industries);
    }
    setPermissionPolicy(bundle.permission_policy);
    setPermissionPolicyDraft(bundle.permission_policy);
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const [conv, u, cfg, projectCfg, permissionCfg, notificationCfg, taskTagsCfg, contactTagsCfg, contactSourcesCfg, cpRolesCfg, cpIndustriesCfg] = await Promise.all([
        ownerWorkspaceApi.listConversations(),
        usersApi.getAll(),
        settingsApi.getOwnerWorkspaceTaskConfig(),
        settingsApi.getOwnerWorkspaceProjectConfig(),
        settingsApi.getOwnerWorkspacePermissionPolicy(),
        settingsApi.getOwnerWorkspaceNotificationConfig(),
        settingsApi.getOwnerWorkspaceTaskTags(),
        settingsApi.getOwnerWorkspaceContactTags(),
        settingsApi.getOwnerWorkspaceContactSources(),
        settingsApi.getOwnerWorkspaceCounterpartyRoles(),
        settingsApi.getOwnerWorkspaceCounterpartyIndustries(),
      ]);
      setConversations(conv);
      setUsers(Array.isArray(u) ? u : []);
      applyWorkspaceSettingsBundle({
        task_config: cfg,
        project_config: projectCfg,
        permission_policy: permissionCfg,
        notification_config: notificationCfg,
        task_tags: taskTagsCfg,
        contact_tags: contactTagsCfg,
        contact_sources: contactSourcesCfg,
        counterparty_roles: cpRolesCfg,
        counterparty_industries: cpIndustriesCfg,
      });
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось загрузить вспомогательные данные'));
    }
  }, []);

  const loadNotificationDeliveryStats = useCallback(async () => {
    if (!isWorkspaceFullAccess) {
      setNotificationDeliveryStats(null);
      return;
    }
    setNotificationDeliveryStatsLoading(true);
    try {
      const stats = await settingsApi.getOwnerWorkspaceNotificationDeliveryStats();
      setNotificationDeliveryStats(stats);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось загрузить диагностику доставки уведомлений'));
    } finally {
      setNotificationDeliveryStatsLoading(false);
    }
  }, [isWorkspaceFullAccess]);

  const loadSettingsSnapshots = useCallback(async () => {
    if (!isWorkspaceFullAccess) {
      setSettingsSnapshots([]);
      return;
    }
    setSettingsSnapshotsLoading(true);
    try {
      const items = await settingsApi.getOwnerWorkspaceSettingsSnapshots();
      setSettingsSnapshots(items);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось загрузить snapshots системных настроек owner workspace'));
    } finally {
      setSettingsSnapshotsLoading(false);
    }
  }, [isWorkspaceFullAccess]);

  const retryNotificationDelivery = useCallback(
    async (notificationIds: number[]) => {
      if (!notificationIds.length) return;
      const marker = notificationIds.length === 1 ? notificationIds[0] : 'all';
      setNotificationDeliveryRetrying(marker);
      try {
        const result = await settingsApi.retryOwnerWorkspaceNotificationDelivery({
          notification_ids: notificationIds,
          include_email: true,
          include_web_push: true,
        });
        setMaxSyncResult(
          `Повторная доставка поставлена в очередь: email ${result.retried_email}, web push ${result.retried_web_push}.`
        );
        await loadNotificationDeliveryStats();
      } catch (e: unknown) {
        setError(extractApiError(e, 'Не удалось повторно поставить доставку уведомлений в очередь'));
      } finally {
        setNotificationDeliveryRetrying(null);
      }
    },
    [loadNotificationDeliveryStats]
  );

  const loadDigest = useCallback(async () => {
    try {
      const params: {
        due_within_hours: number;
        assignee_id?: number;
        project_id?: number;
      } = { due_within_hours: digestDueHours };
      if (digestScope === 'mine' && user?.id != null) {
        params.assignee_id = user.id;
      }
      if (digestProjectFilter !== '') {
        params.project_id = digestProjectFilter;
      }
      const d = await ownerWorkspaceApi.getDigest(params);
      setDigest(d);
    } catch {
      setDigest(null);
    }
  }, [digestDueHours, digestScope, digestProjectFilter, user?.id]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadProjectsAndContacts(), loadTasksFiltered(), loadMeta(), loadMeetingsCount()]);
    } finally {
      setLoading(false);
    }
  }, [loadProjectsAndContacts, loadTasksFiltered, loadMeta, loadMeetingsCount]);

  useEffect(() => {
    if (tab === OW_TAB_SETTINGS && isWorkspaceFullAccess) {
      void loadNotificationDeliveryStats();
      void loadSettingsSnapshots();
    }
  }, [isWorkspaceFullAccess, loadNotificationDeliveryStats, loadSettingsSnapshots, tab]);

  const refreshWebPushState = useCallback(async () => {
    const supported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      typeof Notification !== 'undefined';
    setWebPushBrowserSupported(supported);
    setWebPushPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default');
    try {
      const status = await ownerWorkspaceApi.getMyWebPushStatus();
      setWebPushStatus(status);
    } catch {
      setWebPushStatus(null);
    }
    if (!supported) {
      setWebPushConnected(false);
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.getSubscription();
      setWebPushConnected(Boolean(subscription));
    } catch {
      setWebPushConnected(false);
    }
  }, []);

  const connectWebPush = useCallback(async () => {
    if (webPushBusy) return;
    if (!webPushStatus?.configured || !webPushStatus.public_key) {
      setError('Web push не настроен на сервере: отсутствует публичный VAPID ключ.');
      return;
    }
    if (!webPushBrowserSupported || typeof Notification === 'undefined') {
      setError('Этот браузер не поддерживает web push.');
      return;
    }
    setWebPushBusy(true);
    try {
      let permission = Notification.permission;
      if (permission !== 'granted') {
        permission = await Notification.requestPermission();
      }
      setWebPushPermission(permission);
      if (permission !== 'granted') {
        setError('Браузер не выдал разрешение на push-уведомления.');
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(webPushStatus.public_key),
        });
      }
      await ownerWorkspaceApi.upsertMyWebPushSubscription({
        endpoint: subscription.endpoint,
        p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
        auth: arrayBufferToBase64(subscription.getKey('auth')),
        user_agent: navigator.userAgent,
      });
      setError(null);
      await refreshWebPushState();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось подключить web push.'));
    } finally {
      setWebPushBusy(false);
    }
  }, [refreshWebPushState, webPushBrowserSupported, webPushBusy, webPushStatus]);

  /** Одна кнопка «Включить уведомления»: подключает браузер/PWA и сразу сохраняет тумблер web push, без похода в настройки. */
  const enablePushOneTap = useCallback(async () => {
    await connectWebPush();
    setNotifyWebPushEnabled(true);
    setSettingsSaving(true);
    try {
      await ownerWorkspaceApi.patchMyPreferences({
        default_task_view: taskViewMode,
        task_list_rows_per_page: taskListRowsPerPage,
        digest_due_within_hours: digestDueHours,
        digest_scope: digestScope,
        notify_email_enabled: notifyEmailEnabled,
        notify_web_push_enabled: true,
        notify_task_overdue: notifyTaskOverdue,
        notify_task_due_soon: notifyTaskDueSoon,
        notify_task_assigned: notifyTaskAssigned,
        notify_task_comment: notifyTaskComment,
        notify_task_updated: notifyTaskUpdated,
        notify_contact_incoming_message: notifyContactIncomingMessage,
        notify_task_mention: notifyTaskMention,
      });
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить настройку web push'));
    } finally {
      setSettingsSaving(false);
    }
  }, [
    connectWebPush, taskViewMode, taskListRowsPerPage, digestDueHours, digestScope,
    notifyEmailEnabled, notifyTaskOverdue, notifyTaskDueSoon, notifyTaskAssigned,
    notifyTaskComment, notifyTaskUpdated, notifyContactIncomingMessage, notifyTaskMention,
  ]);

  const disconnectWebPush = useCallback(async () => {
    if (webPushBusy || !webPushBrowserSupported) return;
    setWebPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint || '';
      if (subscription) {
        await subscription.unsubscribe();
      }
      if (endpoint) {
        await ownerWorkspaceApi.removeMyWebPushSubscription(endpoint);
      }
      setError(null);
      await refreshWebPushState();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось отключить web push.'));
    } finally {
      setWebPushBusy(false);
    }
  }, [refreshWebPushState, webPushBrowserSupported, webPushBusy]);

  const skipProjectsContactsFilterReload = useRef(false);
  const taskFilterKeyRef = useRef<string | null>(null);

  useEffect(() => {
    skipProjectsContactsFilterReload.current = true;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- первичная загрузка страницы
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const p = await ownerWorkspaceApi.getMyPreferences();
        if (cancelled) return;
        setTaskViewMode(p.default_task_view);
        setTaskListRowsPerPage(p.task_list_rows_per_page);
        setDigestDueHours(p.digest_due_within_hours);
        setDigestScope(p.digest_scope);
        setNotifyEmailEnabled(p.notify_email_enabled);
        setNotifyWebPushEnabled(p.notify_web_push_enabled);
        setNotifyTaskOverdue(p.notify_task_overdue);
        setNotifyTaskDueSoon(p.notify_task_due_soon);
        setNotifyTaskAssigned(p.notify_task_assigned);
        setNotifyTaskComment(p.notify_task_comment);
        setNotifyTaskUpdated(p.notify_task_updated);
        setNotifyContactIncomingMessage(p.notify_contact_incoming_message);
        setNotifyTaskMention(p.notify_task_mention);
      } catch {
        /* остаются дефолты в state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshWebPushState();
  }, [refreshWebPushState]);

  useEffect(() => {
    if (skipProjectsContactsFilterReload.current) {
      skipProjectsContactsFilterReload.current = false;
      return;
    }
    void loadProjectsAndContacts();
  }, [loadProjectsAndContacts]);

  useEffect(() => {
    if (!projectDialog) return;
    setProjectEditName(projectDialog.name);
    setProjectEditDescription(projectDialog.description ?? '');
    setProjectEditStatus(coerceProjectStatus(String(projectDialog.status || 'active')));
    setProjectEditStartAt(projectDialog.start_at ? projectDialog.start_at.slice(0, 10) : '');
    setProjectEditDeadlineAt(projectDialog.deadline_at ? projectDialog.deadline_at.slice(0, 10) : '');
  }, [projectDialog]);

  useEffect(() => {
    if (!contactDialog) return;
    setContactEditFullName(contactDialog.full_name);
    setContactEditPhone(contactDialog.phone ?? '');
    setContactEditEmail(contactDialog.email ?? '');
    setContactEditCompany(contactDialog.company ?? '');
    setContactEditPosition(contactDialog.position ?? '');
    setContactEditComment(contactDialog.comment ?? '');
    setContactEditSource(contactDialog.source ?? '');
    setContactEditTags(Array.isArray(contactDialog.tags) ? [...contactDialog.tags] : []);
  }, [contactDialog]);

  useEffect(() => {
    void loadDigest();
  }, [loadDigest]);

  useEffect(() => {
    void loadNotifications(80);
  }, [loadNotifications]);

  /** Канонический вход: `/owner-workspace` без query → `/owner-workspace/projects` (совместимость: `?tab=` / `?task=` остаются). */
  useEffect(() => {
    const p = location.pathname.replace(/\/$/, '') || location.pathname;
    if (p !== '/owner-workspace') return;
    if (searchParams.get('tab') || searchParams.get('task')) return;
    navigate('/owner-workspace/projects', { replace: true });
  }, [location.pathname, searchParams, navigate]);

  useEffect(() => {
    const next = resolveOwnerWorkspaceTab(location.pathname, searchParams);
    if (next !== null) setTab(next);
  }, [location.pathname, searchParams]);

  useEffect(() => {
    if (tab === OW_TAB_NOTIFICATIONS) {
      void loadNotifications(200);
    }
  }, [tab, loadNotifications]);

  const buildHistorySearchParams = useCallback(
    (base?: URLSearchParams) => {
      const next = new URLSearchParams(base ? base.toString() : '');
      OWNER_WS_HISTORY_QUERY_KEYS.forEach((key) => next.delete(key));
      if (historyEntityFilter) next.set('h_entity', historyEntityFilter);
      if (historyEntityIdFilter !== '') next.set('h_entity_id', String(historyEntityIdFilter));
      if (historyActionFilter) next.set('h_action', historyActionFilter);
      if (historyAuthorFilter !== '') next.set('h_author', String(historyAuthorFilter));
      if (historyCreatedFrom) next.set('h_from', historyCreatedFrom);
      if (historyCreatedTo) next.set('h_to', historyCreatedTo);
      if (historyLimit !== 300) next.set('h_limit', String(historyLimit));
      if (historySortOrder !== 'desc') next.set('h_sort', historySortOrder);
      return next;
    },
    [
      historyActionFilter,
      historyAuthorFilter,
      historyCreatedFrom,
      historyCreatedTo,
      historyEntityFilter,
      historyEntityIdFilter,
      historyLimit,
      historySortOrder,
    ]
  );

  useEffect(() => {
    if (tab !== OW_TAB_TASKS) return;
    let cancelled = false;
    void (async () => {
      try {
        const a = await ownerWorkspaceApi.getTasksAnalyticsOverview();
        if (!cancelled) setTasksAnalytics(a);
      } catch {
        if (!cancelled) setTasksAnalytics(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    const t = searchQuery.trim();
    if (t.length < 2) {
      setSearchResults(null);
      setSearchLoading(false);
      return undefined;
    }
    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const r = await ownerWorkspaceApi.unifiedSearch(t, 20);
          setSearchResults({ ...r, messages: r.messages ?? [] });
        } catch {
          setSearchResults({ projects: [], contacts: [], tasks: [], messages: [] });
        } finally {
          setSearchLoading(false);
        }
      })();
    }, 320);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen]);

  useEffect(() => {
    if (tab === OW_TAB_TASKS) {
      loadTasksFiltered();
    }
  }, [tab, loadTasksFiltered]);

  useEffect(() => {
    if (tab !== OW_TAB_HISTORY) return;
    const nextEntity = searchParams.get('h_entity') || '';
    const nextEntityIdRaw = searchParams.get('h_entity_id');
    const nextEntityIdParsed = nextEntityIdRaw ? Number(nextEntityIdRaw) : '';
    const nextEntityId =
      typeof nextEntityIdParsed === 'number' && Number.isFinite(nextEntityIdParsed) && nextEntityIdParsed > 0 ? nextEntityIdParsed : '';
    const nextAction = searchParams.get('h_action') || '';
    const nextAuthorRaw = searchParams.get('h_author');
    const nextAuthorParsed = nextAuthorRaw ? Number(nextAuthorRaw) : '';
    const nextAuthor = typeof nextAuthorParsed === 'number' && Number.isFinite(nextAuthorParsed) && nextAuthorParsed > 0 ? nextAuthorParsed : '';
    const nextCreatedFrom = searchParams.get('h_from') || '';
    const nextCreatedTo = searchParams.get('h_to') || '';
    const nextLimitRaw = Number(searchParams.get('h_limit') || 300);
    const nextLimit = OWNER_WS_HISTORY_LIMIT_OPTIONS.includes(nextLimitRaw as (typeof OWNER_WS_HISTORY_LIMIT_OPTIONS)[number])
      ? nextLimitRaw
      : 300;
    const nextSort = searchParams.get('h_sort') === 'asc' ? 'asc' : 'desc';
    if (nextEntity !== historyEntityFilter) setHistoryEntityFilter(nextEntity);
    if (nextEntityId !== historyEntityIdFilter) setHistoryEntityIdFilter(nextEntityId);
    if (nextAction !== historyActionFilter) setHistoryActionFilter(nextAction);
    if (nextAuthor !== historyAuthorFilter) setHistoryAuthorFilter(nextAuthor);
    if (nextCreatedFrom !== historyCreatedFrom) setHistoryCreatedFrom(nextCreatedFrom);
    if (nextCreatedTo !== historyCreatedTo) setHistoryCreatedTo(nextCreatedTo);
    if (nextLimit !== historyLimit) setHistoryLimit(nextLimit);
    if (nextSort !== historySortOrder) setHistorySortOrder(nextSort);
  }, [
    historyActionFilter,
    historyAuthorFilter,
    historyCreatedFrom,
    historyCreatedTo,
    historyEntityFilter,
    historyEntityIdFilter,
    historyLimit,
    historySortOrder,
    searchParams,
    tab,
  ]);

  useEffect(() => {
    if (tab !== OW_TAB_HISTORY) return;
    const next = buildHistorySearchParams(searchParams);
    if (next.toString() === searchParams.toString()) return;
    setSearchParams(next, { replace: true });
  }, [buildHistorySearchParams, searchParams, setSearchParams, tab]);

  useEffect(() => {
    if (taskViewMode !== 'list') {
      setSelectedTaskIds([]);
    }
  }, [taskViewMode]);

  useEffect(() => {
    if (tab !== OW_TAB_HISTORY) return undefined;
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) setHistoryLoading(true);
        const rows = await ownerWorkspaceApi.listHistory({
          entity_type: historyEntityFilter || undefined,
          entity_id: historyEntityIdFilter === '' ? undefined : historyEntityIdFilter,
          action_type: historyActionFilter || undefined,
          author_id: historyAuthorFilter === '' ? undefined : historyAuthorFilter,
          created_from: localInputToIso(historyCreatedFrom) || undefined,
          created_to: localInputToIso(historyCreatedTo) || undefined,
          limit: historyLimit,
          sort_order: historySortOrder,
        });
        if (!cancelled) {
          setHistoryLogs(rows);
          setHistoryLoading(false);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(extractApiError(e, 'Не удалось загрузить историю'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    tab,
    historyActionFilter,
    historyAuthorFilter,
    historyCreatedFrom,
    historyCreatedTo,
    historyEntityFilter,
    historyEntityIdFilter,
    historyLimit,
    historyReloadTick,
    historySortOrder,
  ]);

  useEffect(() => {
    if (tab !== OW_TAB_HISTORY) return undefined;
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) setHistoryStatsLoading(true);
        const stats = await ownerWorkspaceApi.getHistoryStats({
          entity_type: historyEntityFilter || undefined,
          entity_id: historyEntityIdFilter === '' ? undefined : historyEntityIdFilter,
          action_type: historyActionFilter || undefined,
          author_id: historyAuthorFilter === '' ? undefined : historyAuthorFilter,
          created_from: localInputToIso(historyCreatedFrom) || undefined,
          created_to: localInputToIso(historyCreatedTo) || undefined,
        });
        if (!cancelled) {
          setHistoryStats(stats);
          setHistoryStatsLoadedAt(new Date().toISOString());
          setHistoryStatsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setHistoryStats(null);
          setHistoryStatsLoadedAt(null);
          setHistoryStatsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, historyActionFilter, historyAuthorFilter, historyCreatedFrom, historyCreatedTo, historyEntityFilter, historyEntityIdFilter, historyReloadTick]);

  useEffect(() => {
    if (tab === OW_TAB_HISTORY && error) {
      setHistoryLoading(false);
      setHistoryStatsLoading(false);
    }
  }, [error, tab]);

  const createProject = async () => {
    if (!canCreateProjectUi) {
      setError('Создание проекта запрещено текущей policy-моделью.');
      return;
    }
    if (!projectName.trim()) return;
    try {
      await ownerWorkspaceApi.createProject({ name: projectName.trim() });
      setProjectName('');
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось создать проект'));
    }
  };

  const createContact = async () => {
    if (!canCreateContactUi) {
      setError('Создание контакта запрещено текущей policy-моделью.');
      return;
    }
    if (!isWorkspaceFullAccess && newContactProjectId === '') {
      setError('Для создания контакта выберите проект, к которому он будет привязан.');
      return;
    }
    if (!contactName.trim() || !contactPhone.trim()) return;
    try {
      await ownerWorkspaceApi.createContact({
        full_name: contactName.trim(),
        phone: contactPhone.trim(),
        project_ids: newContactProjectId === '' ? undefined : [newContactProjectId],
      });
      setContactName('');
      setContactPhone('');
      setNewContactProjectId('');
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось создать контакт'));
    }
  };

  const createContactDraft = async (payload: {
    full_name: string;
    phone: string;
    email?: string | null;
    company?: string | null;
    tags?: string[];
    comment?: string | null;
    project_ids?: number[];
  }) => {
    if (!canCreateContactUi) {
      setError('Создание контакта запрещено текущей policy-моделью.');
      return;
    }
    if (!isWorkspaceFullAccess && !(payload.project_ids || []).length) {
      setError('Для создания контакта выберите проект, к которому он будет привязан.');
      return;
    }
    try {
      await ownerWorkspaceApi.createContact(payload);
      setContactName('');
      setContactPhone('');
      setNewContactProjectId('');
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось создать контакт'));
    }
  };

  const deleteContact = async (contact: OwnerWorkspaceContact) => {
    try {
      await ownerWorkspaceApi.deleteContact(contact.id);
      if (contactDialog?.id === contact.id) closeContactDialog();
      await loadProjectsAndContacts();
      await loadTasksFiltered();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось удалить контакт'));
    }
  };

  const bulkAddContactTag = async (rows: OwnerWorkspaceContact[], tag: string) => {
    const normalized = tag.trim();
    if (!normalized) return;
    try {
      await Promise.all(rows.map((contact) => {
        const tags = Array.from(new Set([...(contact.tags ?? []), normalized]));
        return ownerWorkspaceApi.updateContact(contact.id, { tags });
      }));
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось добавить тег'));
    }
  };

  const bulkDeleteContacts = async (rows: OwnerWorkspaceContact[]) => {
    try {
      await Promise.all(rows.map((contact) => ownerWorkspaceApi.deleteContact(contact.id)));
      await loadProjectsAndContacts();
      await loadTasksFiltered();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось удалить выбранные контакты'));
    }
  };

  const handleCreateTaskDialog = async (payload: TaskCreatePayload) => {
    await ownerWorkspaceApi.createTask({
      title: payload.title,
      description: payload.description || null,
      status: payload.status as 'new' | 'in_progress' | 'waiting' | 'completed' | 'cancelled',
      priority: payload.priority as 'low' | 'medium' | 'high' | 'critical',
      start_at: payload.start_at ?? null,
      deadline_at: payload.deadline_at ?? null,
      assignee_id: payload.assignee_id ?? null,
      project_id: createTaskDialogProjectId,
      contact_id: createTaskDialogContactId,
      watcher_ids: payload.watcher_ids,
      tags: payload.tags,
      checklist: payload.checklist,
      effort_hours: payload.effort_hours ?? null,
      effort_minutes: payload.effort_minutes ?? null,
      reminder_at: payload.reminder_at ?? null,
      repeat: payload.repeat ?? null,
    });
    if (createTaskDialogContactId) {
      try {
        const trows = await ownerWorkspaceApi.getContactTasks(createTaskDialogContactId);
        setContactDialogTasks(trows);
      } catch { /* ignore */ }
    }
    setCreateTaskDialogProjectId(null);
    setCreateTaskDialogContactId(null);
    await loadTasksFiltered();
    void loadDigest();
  };

  const buildAiTaskDraft = async () => {
    const text = aiTaskText.trim();
    if (!text) return;
    setAiTaskLoading(true);
    setError(null);
    try {
      const draft = await tasksApi.createAiBreakdown({ text, category: aiTaskCategory });
      setAiTaskDraft({
        title: draft.title,
        description: draft.description || text,
        category: draft.category,
        priority: draft.priority,
        provider: draft.provider,
        subtasks: draft.subtasks || [],
      });
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось разложить задачу'));
    } finally {
      setAiTaskLoading(false);
    }
  };

  const createOwnerWorkspaceTaskFromAiDraft = async () => {
    if (!aiTaskDraft) return;
    const checklist = aiTaskDraft.subtasks
      .map((subtask) => subtask.text.trim())
      .filter(Boolean)
      .map((text) => ({ text, done: false }));
    if (checklist.length === 0) return;

    setAiTaskCreating(true);
    setError(null);
    try {
      await ownerWorkspaceApi.createTask({
        title: aiTaskDraft.title.trim(),
        description: aiTaskDraft.description || aiTaskText.trim() || null,
        status: 'new',
        priority: aiTaskPriorityToOwnerPriority(aiTaskDraft.priority),
        tags: ['ai_tracker', `ai_category:${aiTaskDraft.category}`],
        checklist,
      });
      setAiTaskText('');
      setAiTaskDraft(null);
      setMaxSyncResult('AI трекер создал задачу в таск трекере.');
      await loadTasksFiltered();
      void loadDigest();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось создать задачу'));
    } finally {
      setAiTaskCreating(false);
    }
  };

  const openTaskDialog = async (t: OwnerWorkspaceTask, options?: { syncUrl?: boolean }) => {
    const syncUrl = options?.syncUrl !== false;
    if (syncUrl) {
      skipNextTaskFromUrlEffectRef.current = true;
      const params = new URLSearchParams(searchParams);
      params.delete('tab');
      params.delete('task');
      navigate(
        {
          pathname: `/owner-workspace/tasks/${t.id}`,
          search: params.toString() ? `?${params.toString()}` : '',
        },
        { replace: true }
      );
    }
    setTaskDialog(t);
    setTaskEditTitle(t.title);
    setTaskEditDescription(t.description || '');
    setTaskEditStatus(coerceTaskStatus(String(t.status)));
    setTaskEditPriority(coerceTaskPriority(String(t.priority)));
    setTaskEditDeadline(deadlineToLocalInput(t.deadline_at));
    setTaskEditStartAt(deadlineToLocalInput(t.start_at));
    setTaskEditAttachmentsText(
      Array.isArray(t.attachments) && t.attachments.length > 0 ? JSON.stringify(t.attachments, null, 2) : '[]'
    );
    setTaskEditProjectId(t.project_id ?? '');
    setTaskEditContactId(t.contact_id ?? '');
    setTaskEditAssigneeId(t.assignee_id ?? '');
    setTaskEditTags(Array.isArray(t.tags) ? [...t.tags] : []);
    setTaskEditChecklist(parseChecklistFromTask(t.checklist));
    setNewCommentText('');
    try {
      const cm = await ownerWorkspaceApi.getTaskComments(t.id);
      setTaskComments(cm);
    } catch {
      setTaskComments([]);
    }
    try {
      const h = await ownerWorkspaceApi.listHistory({ entity_type: 'task', entity_id: t.id });
      setTaskDialogHistory(h);
    } catch {
      setTaskDialogHistory([]);
    }
  };

  const openPreviousWorkspaceTask = async () => {
    if (!taskDialog?.previous_task_id) return;
    try {
      const full = await ownerWorkspaceApi.getTask(taskDialog.previous_task_id);
      await openTaskDialog(full);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось открыть предыдущую задачу'));
    }
  };

  const taskFormLocked = useMemo(() => {
    if (!taskDialog) return false;
    const terminal = ['completed', 'cancelled'].includes(String(taskDialog.status));
    const reopening = terminal && !['completed', 'cancelled'].includes(taskEditStatus);
    return terminal && !reopening;
  }, [taskDialog, taskEditStatus]);

  const deleteTaskSummary = useMemo(() => {
    if (!deleteTaskConfirm) return [];
    const summary: string[] = [];
    if (deleteTaskConfirm.project_id != null) summary.push('Задача отвязана от проекта только через полное удаление записи.');
    if (deleteTaskConfirm.contact_id != null) summary.push('Связь с контактом исчезнет вместе с задачей.');
    if ((deleteTaskConfirm.linked_message_ids?.length ?? 0) > 0) {
      summary.push(`Будут удалены связи с сообщениями: ${deleteTaskConfirm.linked_message_ids!.length}.`);
    }
    if (deleteTaskConfirm.previous_task_id != null) {
      summary.push('Цепочка повторных/следующих задач потеряет ссылку на предыдущую задачу.');
    }
    if (taskDialog?.id === deleteTaskConfirm.id && taskComments.length > 0) {
      summary.push(`Будут удалены комментарии к задаче: ${taskComments.length}.`);
    }
    if (summary.length === 0) {
      summary.push('Запись будет удалена без возможности восстановления из интерфейса.');
    }
    return summary;
  }, [deleteTaskConfirm, taskComments, taskDialog?.id]);
  const deleteTaskProject = useMemo(
    () =>
      deleteTaskConfirm?.project_id != null ? projects.find((project) => project.id === deleteTaskConfirm.project_id) ?? null : null,
    [deleteTaskConfirm?.project_id, projects]
  );
  const deleteTaskContact = useMemo(
    () =>
      deleteTaskConfirm?.contact_id != null ? contacts.find((contact) => contact.id === deleteTaskConfirm.contact_id) ?? null : null,
    [contacts, deleteTaskConfirm?.contact_id]
  );

  const reviewDeleteTaskProject = () => {
    if (!deleteTaskProject) return;
    setDeleteTaskConfirm(null);
    closeTaskDialog();
    void openProjectDialog(deleteTaskProject);
  };

  const reviewDeleteTaskProjectTasks = () => {
    if (!deleteTaskProject) return;
    setDeleteTaskConfirm(null);
    closeTaskDialog();
    drillDownToProjectTasks(deleteTaskProject.id);
  };

  const reviewDeleteTaskContact = () => {
    if (!deleteTaskContact) return;
    setDeleteTaskConfirm(null);
    closeTaskDialog();
    void openContactDialog(deleteTaskContact);
  };

  const reviewDeleteTaskContactTasks = () => {
    if (!deleteTaskContact) return;
    setDeleteTaskConfirm(null);
    closeTaskDialog();
    openContactQuickTasks(deleteTaskContact.id);
  };

  const reviewDeleteTaskContactComms = async () => {
    if (!deleteTaskContact) return;
    setDeleteTaskConfirm(null);
    closeTaskDialog();
    await openContactQuickComms(deleteTaskContact.id);
  };

  const reviewDeleteTaskPrevious = async () => {
    if (!deleteTaskConfirm?.previous_task_id) return;
    try {
      const full = await ownerWorkspaceApi.getTask(deleteTaskConfirm.previous_task_id);
      setDeleteTaskConfirm(null);
      closeTaskDialog();
      await openTaskDialog(full);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось открыть предыдущую задачу'));
    }
  };

  const submitDeleteTask = async () => {
    if (!deleteTaskConfirm || !isWorkspaceFullAccess) return;
    try {
      await ownerWorkspaceApi.deleteTask(deleteTaskConfirm.id);
      setDeleteTaskConfirm(null);
      closeTaskDialog();
      await loadTasksFiltered();
      void loadDigest();
      void loadNotifications(80);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось удалить задачу'));
    }
  };

  const saveTaskDialog = async () => {
    if (!taskDialog) return;
    try {
      if (taskFormLocked) {
        const updated = await ownerWorkspaceApi.updateTask(taskDialog.id, { status: taskEditStatus });
        await loadTasksFiltered();
        void loadDigest();
        void loadNotifications(80);
        await openTaskDialog(updated);
        return;
      }
      let attachmentsPayload: Array<Record<string, unknown>>;
      try {
        const raw = JSON.parse(taskEditAttachmentsText.trim() || '[]');
        attachmentsPayload = Array.isArray(raw) ? raw : [];
      } catch {
        setError('Вложения: укажите корректный JSON-массив, например [{"url":"https://…","name":"Файл"}]');
        return;
      }
      const checklistPayload = taskEditChecklist
        .map((row) => ({ text: row.text.trim(), done: row.done }))
        .filter((row) => row.text.length > 0);
      await ownerWorkspaceApi.updateTask(taskDialog.id, {
        title: taskEditTitle.trim(),
        description: taskEditDescription.trim() || null,
        status: taskEditStatus,
        priority: taskEditPriority,
        deadline_at: localInputToIso(taskEditDeadline),
        start_at: localInputToIso(taskEditStartAt),
        project_id: taskEditProjectId === '' ? null : taskEditProjectId,
        contact_id: taskEditContactId === '' ? null : taskEditContactId,
        assignee_id: taskEditAssigneeId === '' ? null : taskEditAssigneeId,
        tags: taskEditTags.map((x) => x.trim()).filter(Boolean),
        checklist: checklistPayload,
        attachments: attachmentsPayload,
      });
      closeTaskDialog();
      await loadTasksFiltered();
      void loadDigest();
      void loadNotifications(80);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить задачу'));
    }
  };

  const addComment = async () => {
    if (!taskDialog || !newCommentText.trim()) return;
    try {
      await ownerWorkspaceApi.addTaskComment(taskDialog.id, newCommentText.trim());
      setNewCommentText('');
      const cm = await ownerWorkspaceApi.getTaskComments(taskDialog.id);
      setTaskComments(cm);
      void loadNotifications(80);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось добавить комментарий'));
    }
  };

  const submitComplete = async () => {
    if (!completeDialogTask) return;
    if (completeMode === 'close_and_create_next' && !canCreateTaskUi) {
      setError('Создание следующей задачи запрещено текущей policy-моделью.');
      return;
    }
    try {
      if (completeMode === 'close') {
        const res = await ownerWorkspaceApi.completeTask(completeDialogTask.id, { action: 'close' });
        if (res.next_task) {
          setRepeatTaskNotice(res.next_task);
        }
      } else {
        const res = await ownerWorkspaceApi.completeTask(completeDialogTask.id, {
          action: 'close_and_create_next',
          next_task: {
            title: nextTaskTitle.trim() || `Следующий шаг: ${completeDialogTask.title}`,
            description: null,
            project_id: completeDialogTask.project_id,
            contact_id: completeDialogTask.contact_id,
            assignee_id: completeDialogTask.assignee_id,
            priority: completeDialogTask.priority as 'low' | 'medium' | 'high' | 'critical',
          },
        });
        if (res.next_task) {
          await openTaskDialog(res.next_task);
        }
      }
      setCompleteDialogTask(null);
      setNextTaskTitle('');
      await loadTasksFiltered();
      void loadDigest();
      void loadNotifications(80);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось завершить задачу'));
    }
  };

  const openProjectDialog = async (p: OwnerWorkspaceProject, options?: { syncUrl?: boolean }) => {
    const syncUrl = options?.syncUrl !== false;
    if (syncUrl) {
      skipNextProjectFromUrlEffectRef.current = true;
      navigate(`/owner-workspace/projects/${p.id}`, { replace: true });
    }
    setProjectDialog(p);
    setSubprojectName('');
    setLinkContactId(null);
    setParticipantToAdd(null);
    setProjectDialogTaskStatus('');
    setProjectDialogTaskSearch('');
    try {
      const taskPage = await ownerWorkspaceApi.listTasks({
        project_id: p.id,
        limit: OWNER_WS_TASKS_FETCH_CAP,
      });
      setProjectDialogTasks(taskPage.items);
    } catch {
      setProjectDialogTasks([]);
    }
  };

  const saveProjectOwner = async (u: User | null) => {
    if (!projectDialog) return;
    try {
      const updated = await ownerWorkspaceApi.updateProject(projectDialog.id, {
        owner_id: u ? u.id : null,
      });
      setProjectDialog(updated);
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сменить ответственного'));
    }
  };

  const saveProjectDetails = async () => {
    if (!projectDialog) return;
    const name = projectEditName.trim();
    if (!name) {
      setError('Укажите название проекта');
      return;
    }
    if (projectEditStatus === 'archived' && projectDialog.status !== 'archived') {
      setArchiveProjectConfirm(projectDialog);
      return;
    }
    try {
      const updated = await ownerWorkspaceApi.updateProject(projectDialog.id, {
        name,
        description: projectEditDescription.trim() || null,
        status: projectEditStatus,
        start_at: dateInputToDateTime(projectEditStartAt),
        deadline_at: dateInputToDateTime(projectEditDeadlineAt),
      });
      setProjectDialog(updated);
      setError(null);
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить проект'));
    }
  };

  const submitUnlinkContactFromProject = async () => {
    if (!unlinkContactConfirm) return;
    try {
      await ownerWorkspaceApi.removeProjectContact(unlinkContactConfirm.projectId, unlinkContactConfirm.contactId);
      if (linkContactId?.id === unlinkContactConfirm.contactId) setLinkContactId(null);
      if (projectDialog?.id === unlinkContactConfirm.projectId) {
        const updated = await ownerWorkspaceApi.getProject(unlinkContactConfirm.projectId);
        setProjectDialog(updated);
      }
      if (contactDialog?.id === unlinkContactConfirm.contactId) {
        const updatedContact = await ownerWorkspaceApi.getContact(unlinkContactConfirm.contactId);
        setContactDialog(updatedContact);
      }
      setUnlinkContactConfirm(null);
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось убрать контакт из проекта'));
    }
  };

  const requestRemoveContactFromProject = (contactId: number) => {
    if (!projectDialog) return;
    const contact = contacts.find((row) => row.id === contactId);
    const activeTaskCount = projectDialogTasks.filter(
      (task) =>
        task.contact_id === contactId &&
        ['new', 'in_progress', 'waiting'].includes(String(task.status))
    ).length;
    setUnlinkContactConfirm({
      projectId: projectDialog.id,
      projectName: projectDialog.name,
      contactId,
      contactName: contact?.full_name || `#${contactId}`,
      activeTaskCount,
    });
  };

  const submitArchiveProject = async () => {
    if (!archiveProjectConfirm) return;
    try {
      await ownerWorkspaceApi.archiveProject(archiveProjectConfirm.id);
      setArchiveProjectConfirm(null);
      closeProjectDialog();
      await loadTasksFiltered();
      void loadDigest();
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось архивировать проект'));
    }
  };

  const addProjectParticipantUser = async () => {
    if (!projectDialog || !participantToAdd) return;
    const requestedRole = allowedParticipantRoleOptions.some((item) => item.value === newParticipantRole)
      ? newParticipantRole
      : 'member';
    try {
      await ownerWorkspaceApi.addProjectParticipant(
        projectDialog.id,
        participantToAdd.id,
        requestedRole
      );
      setParticipantToAdd(null);
      setNewParticipantRole('member');
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getProject(projectDialog.id);
      setProjectDialog(updated);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось добавить участника'));
    }
  };

  const patchProjectParticipantRole = async (userId: number, role: OwnerWorkspaceProjectParticipantRole) => {
    if (!projectDialog) return;
    try {
      await ownerWorkspaceApi.patchProjectParticipantRole(projectDialog.id, userId, role);
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getProject(projectDialog.id);
      setProjectDialog(updated);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось изменить роль участника'));
    }
  };

  const removeProjectParticipantUser = async (userId: number) => {
    if (!projectDialog) return;
    try {
      await ownerWorkspaceApi.removeProjectParticipant(projectDialog.id, userId);
      setRemoveParticipantConfirm(null);
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getProject(projectDialog.id);
      setProjectDialog(updated);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось удалить участника'));
    }
  };

  const requestRemoveProjectParticipantUser = (
    userId: number,
    role: OwnerWorkspaceProjectParticipantRole
  ) => {
    if (!projectDialog) return;
    setRemoveParticipantConfirm({
      projectId: projectDialog.id,
      projectName: projectDialog.name,
      userId,
      userName: userName(userId),
      role,
    });
  };

  const openLinkToTaskDialog = async (m: OwnerWorkspaceMessage) => {
    setLinkTaskDialog({ message: m });
    setLinkTaskSelected(null);
    try {
      const taskPage = await ownerWorkspaceApi.listTasks({
        active_only: true,
        limit: OWNER_WS_TASKS_FETCH_CAP,
        offset: 0,
      });
      setLinkTaskOptions(taskPage.items);
    } catch {
      setLinkTaskOptions([]);
    }
  };

  const submitLinkToTask = async () => {
    if (!linkTaskDialog || !linkTaskSelected) return;
    if (!canLinkMessagesUi) {
      setError('Привязка сообщений к задачам запрещена текущей policy-моделью.');
      return;
    }
    try {
      await ownerWorkspaceApi.linkMessageToTask(linkTaskDialog.message.id, linkTaskSelected.id);
      setLinkTaskDialog(null);
      setLinkTaskSelected(null);
      if (commsContactId) {
        const msgs = await ownerWorkspaceApi.getContactMessages(commsContactId);
        setCommsMessages(msgs.slice().reverse());
      }
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось привязать к задаче'));
    }
  };

  const createSubproject = async () => {
    if (!projectDialog || !subprojectName.trim()) return;
    if (!canCreateProjectUi) {
      setError('Создание подпроекта запрещено текущей policy-моделью.');
      return;
    }
    if (!isWorkspaceFullAccess && !canEditProjectContentUi(projectDialog.id)) {
      setError('Недостаточно прав для создания подпроекта в этом проекте.');
      return;
    }
    try {
      await ownerWorkspaceApi.createProject({
        name: subprojectName.trim(),
        parent_project_id: projectDialog.id,
      });
      setSubprojectName('');
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getProject(projectDialog.id);
      setProjectDialog(updated);
      try {
        const taskPage = await ownerWorkspaceApi.listTasks({
          project_id: projectDialog.id,
          limit: OWNER_WS_TASKS_FETCH_CAP,
        });
        setProjectDialogTasks(taskPage.items);
      } catch {
        setProjectDialogTasks([]);
      }
      await loadTasksFiltered();
      void loadDigest();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось создать подпроект'));
    }
  };

  const refreshProjectDialogAfterHierarchyChange = useCallback(async () => {
    await loadProjectsAndContacts();
    const id = projectDialog?.id;
    if (id == null) return;
    try {
      const updated = await ownerWorkspaceApi.getProject(id);
      setProjectDialog(updated);
    } catch {
      /* диалог мог быть закрыт */
    }
  }, [loadProjectsAndContacts, projectDialog?.id]);

  const linkContactToProject = async () => {
    if (!projectDialog || !linkContactId) return;
    if (!canManageProjectContactsDialog) {
      setError('Привязка контактов к проекту запрещена текущей policy-моделью.');
      return;
    }
    try {
      await ownerWorkspaceApi.addProjectContact(projectDialog.id, linkContactId.id);
      setLinkContactId(null);
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getProject(projectDialog.id);
      setProjectDialog(updated);
      try {
        const taskPage = await ownerWorkspaceApi.listTasks({
          project_id: projectDialog.id,
          limit: OWNER_WS_TASKS_FETCH_CAP,
          offset: 0,
        });
        setProjectDialogTasks(taskPage.items);
      } catch {
        setProjectDialogTasks([]);
      }
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось привязать контакт'));
    }
  };

  const openContactDialog = async (c: OwnerWorkspaceContact, options?: { syncUrl?: boolean }) => {
    const syncUrl = options?.syncUrl !== false;
    if (syncUrl) {
      skipNextContactFromUrlEffectRef.current = true;
      navigate(`/owner-workspace/contacts/${c.id}`, { replace: true });
    }
    setContactDialog(c);
    setContactLinkProjectId(null);
    setNewContactMessage('');
    setContactMessageSearch('');
    try {
      const msgs = await ownerWorkspaceApi.getContactMessages(c.id);
      setContactMessages(msgs.slice().reverse());
    } catch {
      setContactMessages([]);
    }
    try {
      const trows = await ownerWorkspaceApi.getContactTasks(c.id);
      setContactDialogTasks(trows);
    } catch {
      setContactDialogTasks([]);
    }
  };

  const linkContactToSelectedProject = async () => {
    if (!contactDialog || !contactLinkProjectId) return;
    if (!canManageProjectContactsUi) {
      setError('Привязка контактов к проекту запрещена текущей policy-моделью.');
      return;
    }
    try {
      await ownerWorkspaceApi.addProjectContact(contactLinkProjectId.id, contactDialog.id);
      setContactLinkProjectId(null);
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getContact(contactDialog.id);
      setContactDialog(updated);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось добавить в проект'));
    }
  };

  const requestRemoveContactFromLinkedProject = (projectId: number) => {
    if (!contactDialog) return;
    const project = projects.find((row) => row.id === projectId);
    const activeTaskCount = contactDialogTasks.filter(
      (task) =>
        task.project_id === projectId &&
        ['new', 'in_progress', 'waiting'].includes(String(task.status))
    ).length;
    setUnlinkContactConfirm({
      projectId,
      projectName: project?.name || `#${projectId}`,
      contactId: contactDialog.id,
      contactName: contactDialog.full_name,
      activeTaskCount,
    });
  };

  const sendContactMessage = async () => {
    if (!canSendMessageUi) {
      setError('Отправка исходящих сообщений запрещена текущей policy-моделью.');
      return;
    }
    if (!contactDialog || !newContactMessage.trim()) return;
    try {
      await ownerWorkspaceApi.createMessage({
        contact_id: contactDialog.id,
        text: newContactMessage.trim(),
        direction: 'outgoing',
      });
      setNewContactMessage('');
      const msgs = await ownerWorkspaceApi.getContactMessages(contactDialog.id);
      setContactMessages(msgs.slice().reverse());
      await loadMeta();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить сообщение'));
    }
  };

  const saveContactDetails = async () => {
    if (!contactDialog) return;
    const fn = contactEditFullName.trim();
    const ph = contactEditPhone.trim();
    if (!fn || !ph) {
      setError('Укажите ФИО и телефон');
      return;
    }
    try {
      const tagParts = contactEditTags.map((s) => s.trim()).filter(Boolean);
      const updated = await ownerWorkspaceApi.updateContact(contactDialog.id, {
        full_name: fn,
        phone: ph,
        email: contactEditEmail.trim() || null,
        company: contactEditCompany.trim() || null,
        position: contactEditPosition.trim() || null,
        comment: contactEditComment.trim() || null,
        source: contactEditSource.trim() || null,
        tags: tagParts,
      });
      setContactDialog(updated);
      setError(null);
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить контакт'));
    }
  };

  const selectCommsContact = async (contactId: number) => {
    setCommsContactId(contactId);
    setCommsThreadSearch('');
    try {
      const msgs = await ownerWorkspaceApi.getContactMessages(contactId);
      setCommsMessages(msgs.slice().reverse());
    } catch {
      setCommsMessages([]);
    }
    try {
      const conv = await ownerWorkspaceApi.listConversations();
      setConversations(conv);
    } catch {
      /* список диалогов — второстепенно */
    }
  };

  const openCommsContactCard = async () => {
    if (commsContactId == null) return;
    const fromCat =
      contactsCatalogSorted.find((c) => c.id === commsContactId) || contacts.find((c) => c.id === commsContactId);
    if (fromCat) {
      await openContactDialog(fromCat);
      return;
    }
    try {
      const c = await ownerWorkspaceApi.getContact(commsContactId);
      await openContactDialog(c);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось открыть карточку контакта'));
    }
  };

  const submitMessageTask = async () => {
    if (!messageTaskDialog || !messageTaskTitle.trim()) return;
    const msgContactId = messageTaskDialog.message.contact_id;
    try {
      await ownerWorkspaceApi.createTaskFromMessage(messageTaskDialog.message.id, {
        title: messageTaskTitle.trim(),
        description: messageTaskDialog.message.text,
      });
      setMessageTaskDialog(null);
      setMessageTaskTitle('');
      await loadTasksFiltered();
      void loadDigest();
      if (commsContactId != null && msgContactId === commsContactId) {
        try {
          const msgs = await ownerWorkspaceApi.getContactMessages(commsContactId);
          setCommsMessages(msgs.slice().reverse());
        } catch {
          /* ignore */
        }
      }
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось создать задачу из сообщения'));
    }
  };

  const handleKanbanDrop = async (taskId: number, newStatus: OwnerWorkspaceTaskStatus) => {
    try {
      await ownerWorkspaceApi.updateTask(taskId, { status: newStatus });
      await loadTasksFiltered();
      void loadDigest();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось изменить статус'));
    }
  };

  const applyBulkTaskUpdate = async () => {
    if (selectedTaskIds.length === 0) return;
    if (!canBulkUpdateTasksUi) {
      setError('Массовое обновление задач запрещено текущей policy-моделью.');
      return;
    }
    const hasStatus = Boolean(bulkStatus);
    const hasAssigneeClear = bulkAssigneeMode === 'clear';
    const hasAssigneeSet = bulkAssigneeMode === 'set' && bulkAssigneeUserId !== '';
    const hasPriority = Boolean(bulkPriority);
    const hasDeadline = Boolean(bulkDeadline);
    if (!hasStatus && !hasAssigneeClear && !hasAssigneeSet && !hasPriority && !hasDeadline) {
      setError('Выберите статус, исполнителя, приоритет и/или дедлайн');
      return;
    }
    const payload: {
      task_ids: number[];
      status?: OwnerWorkspaceTaskStatus;
      assignee_id?: number | null;
      priority?: OwnerWorkspaceTaskPriority;
      deadline_at?: string | null;
    } = { task_ids: selectedTaskIds };
    if (hasStatus) payload.status = bulkStatus as OwnerWorkspaceTaskStatus;
    if (hasAssigneeClear) payload.assignee_id = null;
    if (hasAssigneeSet) payload.assignee_id = bulkAssigneeUserId as number;
    if (hasPriority) payload.priority = bulkPriority as OwnerWorkspaceTaskPriority;
    if (hasDeadline) payload.deadline_at = localInputToIso(bulkDeadline);
    try {
      const res = await ownerWorkspaceApi.bulkUpdateTasks(payload);
      setSelectedTaskIds([]);
      setBulkStatus('');
      setBulkPriority('');
      setBulkAssigneeMode('skip');
      setBulkAssigneeUserId('');
      setBulkDeadline('');
      await loadTasksFiltered();
      void loadDigest();
      setError(null);
      setMaxSyncResult(`Массовое обновление: изменено задач — ${res.updated}.`);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Массовое обновление не удалось'));
    }
  };

  const bulkDeleteTasks = async () => {
    if (selectedTaskIds.length === 0) return;
    if (!isWorkspaceFullAccess) {
      setError('Удаление задач доступно только администратору/owner.');
      return;
    }
    try {
      await Promise.all(selectedTaskIds.map((taskId) => ownerWorkspaceApi.deleteTask(taskId)));
      setSelectedTaskIds([]);
      setBulkDeleteTaskConfirmOpen(false);
      await loadTasksFiltered();
      void loadDigest();
      setError(null);
      setMaxSyncResult('Выбранные задачи удалены.');
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось удалить выбранные задачи'));
    }
  };

  const syncMaxIntoWorkspace = async () => {
    try {
      const r = await ownerWorkspaceApi.syncMessagesFromMax(800);
      setMaxSyncResult(`Импорт MAX: добавлено ${r.imported}, пропущено ${r.skipped} (нет телефона / контакта / дубликат).`);
      await loadMeta();
      if (commsContactId) {
        const msgs = await ownerWorkspaceApi.getContactMessages(commsContactId);
        setCommsMessages(msgs.slice().reverse());
      }
    } catch (e: unknown) {
      setError(extractApiError(e, 'Импорт из MAX не удался'));
    }
  };

  const saveWorkspaceSettings = async () => {
    setSettingsSaving(true);
    try {
      await ownerWorkspaceApi.patchMyPreferences({
        default_task_view: taskViewMode,
        task_list_rows_per_page: taskListRowsPerPage,
        digest_due_within_hours: digestDueHours,
        digest_scope: digestScope,
        notify_email_enabled: notifyEmailEnabled,
        notify_web_push_enabled: notifyWebPushEnabled,
        notify_task_overdue: notifyTaskOverdue,
        notify_task_due_soon: notifyTaskDueSoon,
        notify_task_assigned: notifyTaskAssigned,
        notify_task_comment: notifyTaskComment,
        notify_task_updated: notifyTaskUpdated,
        notify_contact_incoming_message: notifyContactIncomingMessage,
        notify_task_mention: notifyTaskMention,
      });
      setError(null);
      setMaxSyncResult('Настройки таск трекера сохранены в вашем профиле.');
      void loadDigest();
      if (tab === OW_TAB_TASKS) void loadTasksFiltered();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить настройки'));
    } finally {
      setSettingsSaving(false);
    }
  };

  const saveWorkspaceTaskConfig = async () => {
    if (!taskConfigDraft) return;
    if (!taskConfigDraft.statuses.some((item) => item.enabled !== false)) {
      setError('Нужно оставить хотя бы один видимый статус задач.');
      return;
    }
    if (!taskConfigDraft.priorities.some((item) => item.enabled !== false)) {
      setError('Нужно оставить хотя бы один видимый приоритет задач.');
      return;
    }
    setTaskConfigSaving(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceTaskConfig(taskConfigDraft);
      setTaskConfig(saved);
      setTaskConfigDraft(saved);
      setError(null);
      setMaxSyncResult('Системные названия статусов и приоритетов сохранены.');
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить системные настройки задач'));
    } finally {
      setTaskConfigSaving(false);
    }
  };

  const saveWorkspacePermissionPolicy = async () => {
    setPermissionPolicySaving(true);
    try {
      const saved = await settingsApi.setOwnerWorkspacePermissionPolicy(permissionPolicyDraft);
      setPermissionPolicy(saved);
      setPermissionPolicyDraft(saved);
      setError(null);
      setMaxSyncResult('Системная policy-модель ролей owner workspace сохранена.');
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить policy-настройки ролей owner workspace'));
    } finally {
      setPermissionPolicySaving(false);
    }
  };

  const saveWorkspaceNotificationConfig = async () => {
    if (!notificationConfigDraft) return;
    if (!notificationConfigDraft.items.some((item) => item.enabled !== false)) {
      setError('Нужно оставить хотя бы один видимый тип уведомлений owner workspace.');
      return;
    }
    setNotificationConfigSaving(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceNotificationConfig(notificationConfigDraft);
      setNotificationConfig(saved);
      setNotificationConfigDraft(saved);
      setError(null);
      setMaxSyncResult('Системная конфигурация типов уведомлений owner workspace сохранена.');
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить системную конфигурацию уведомлений owner workspace'));
    } finally {
      setNotificationConfigSaving(false);
    }
  };

  const saveWorkspaceProjectConfig = async () => {
    if (!projectConfigDraft) return;
    if (!projectConfigDraft.statuses.some((item) => item.enabled !== false)) {
      setError('Нужно оставить хотя бы один видимый статус проектов.');
      return;
    }
    setProjectConfigSaving(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceProjectConfig(projectConfigDraft);
      setProjectConfig(saved);
      setProjectConfigDraft(saved);
      setError(null);
      setMaxSyncResult('Системные названия статусов проектов сохранены.');
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить системные настройки статусов проектов'));
    } finally {
      setProjectConfigSaving(false);
    }
  };

  const saveWorkspaceTaskTagDictionary = async () => {
    const normalized = Array.from(
      new Set(taskTagDictionaryDraft.items.map((item) => item.trim()).filter(Boolean).map((item) => item.slice(0, 64)))
    );
    setTaskTagDictionarySaving(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceTaskTags({ items: normalized });
      setTaskTagDictionary(saved);
      setTaskTagDictionaryDraft(saved);
      setError(null);
      setMaxSyncResult('Справочник тегов задач owner workspace сохранён.');
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить справочник тегов задач owner workspace'));
    } finally {
      setTaskTagDictionarySaving(false);
    }
  };

  const saveWorkspaceContactTagDictionary = async () => {
    const normalized = Array.from(
      new Set(contactTagDictionaryDraft.items.map((item) => item.trim()).filter(Boolean).map((item) => item.slice(0, 64)))
    );
    setContactTagDictionarySaving(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceContactTags({ items: normalized });
      setContactTagDictionary(saved);
      setContactTagDictionaryDraft(saved);
      setError(null);
      setMaxSyncResult('Справочник тегов контактов owner workspace сохранён.');
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить справочник тегов контактов owner workspace'));
    } finally {
      setContactTagDictionarySaving(false);
    }
  };

  const saveWorkspaceContactSourceDictionary = async () => {
    const normalized = Array.from(
      new Set(contactSourceDictionaryDraft.items.map((item) => item.trim()).filter(Boolean).map((item) => item.slice(0, 64)))
    );
    setContactSourceDictionarySaving(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceContactSources({ items: normalized });
      setContactSourceDictionary(saved);
      setContactSourceDictionaryDraft(saved);
      setError(null);
      setMaxSyncResult('Справочник источников контактов owner workspace сохранён.');
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить справочник источников контактов owner workspace'));
    } finally {
      setContactSourceDictionarySaving(false);
    }
  };

  const exportWorkspaceSettingsBundle = useCallback(() => {
    if (!workspaceSettingsBundle) {
      setError('Системный bundle owner workspace пока не загружен.');
      return;
    }
    void (async () => {
      try {
        const envelope = await settingsApi.getOwnerWorkspaceSettingsBundle();
        setSettingsBundleLastExportMeta(envelope.meta);
        const stamp = envelope.meta.exported_at.replace(/[:.]/g, '-');
        downloadTextFile(
          JSON.stringify(envelope, null, 2),
          `owner_workspace_settings_bundle_v${envelope.meta.version}_${stamp}.json`,
          'application/json;charset=utf-8'
        );
        setMaxSyncResult('Экспортирован versioned bundle системных настроек owner workspace.');
      } catch (e: unknown) {
        setError(extractApiError(e, 'Не удалось экспортировать bundle системных настроек owner workspace'));
      }
    })();
  }, [workspaceSettingsBundle]);

  const copyWorkspaceSettingsBundle = useCallback(async () => {
    if (!workspaceSettingsBundle) {
      setError('Системный bundle owner workspace пока не загружен.');
      return;
    }
    try {
      const envelope = await settingsApi.getOwnerWorkspaceSettingsBundle();
      setSettingsBundleLastExportMeta(envelope.meta);
      await navigator.clipboard.writeText(JSON.stringify(envelope, null, 2));
      setMaxSyncResult('Versioned JSON bundle системных настроек owner workspace скопирован.');
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось скопировать JSON bundle системных настроек owner workspace'));
    }
  }, [workspaceSettingsBundle]);

  const importWorkspaceSettingsBundle = useCallback(async () => {
    if (parsedSettingsBundleInput.error || !parsedSettingsBundleInput.raw) {
      setError(parsedSettingsBundleInput.error || 'Импорт bundle: укажите корректный JSON.');
      return;
    }
    setSettingsBundleImporting(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceSettingsBundle(
        parsedSettingsBundleInput.raw as OwnerWorkspaceSettingsBundle | OwnerWorkspaceSettingsBundleEnvelope
      );
      applyWorkspaceSettingsBundle(saved.data);
      setSettingsBundleLastExportMeta(saved.meta);
      setSettingsBundleDialogOpen(false);
      setSettingsBundleImportText('');
      setError(null);
      setMaxSyncResult(`Bundle системных настроек owner workspace импортирован (v${saved.meta.version}).`);
      await loadNotificationDeliveryStats();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось импортировать bundle системных настроек owner workspace'));
    } finally {
      setSettingsBundleImporting(false);
    }
  }, [applyWorkspaceSettingsBundle, loadNotificationDeliveryStats, parsedSettingsBundleInput]);

  const createSettingsSnapshot = useCallback(async () => {
    const name = settingsSnapshotName.trim();
    if (!name) {
      setError('Укажите название snapshot системных настроек.');
      return;
    }
    setSettingsSnapshotCreating(true);
    try {
      const snapshot = await settingsApi.createOwnerWorkspaceSettingsSnapshot({
        name,
        note: settingsSnapshotNote.trim() || null,
      });
      setSettingsSnapshots((prev) => [snapshot, ...prev.filter((item) => item.id !== snapshot.id)]);
      setSettingsSnapshotCreateOpen(false);
      setSettingsSnapshotName('');
      setSettingsSnapshotNote('');
      setError(null);
      setMaxSyncResult(`Создан snapshot системных настроек: ${snapshot.name}.`);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось создать snapshot системных настроек owner workspace'));
    } finally {
      setSettingsSnapshotCreating(false);
    }
  }, [settingsSnapshotName, settingsSnapshotNote]);

  const applySettingsSnapshot = useCallback(
    async (snapshot: OwnerWorkspaceSettingsSnapshot) => {
      setSettingsSnapshotApplyingId(snapshot.id);
      try {
        if (settingsSnapshotCreateSafetyBeforeApply && workspaceSettingsBundle) {
          await settingsApi.createOwnerWorkspaceSettingsSnapshot({
            name: `Safety before apply: ${snapshot.name}`.slice(0, 120),
            note: `Автоматический safety snapshot перед применением ${snapshot.name}`.slice(0, 500),
          });
        }
        const saved = await settingsApi.applyOwnerWorkspaceSettingsSnapshot(snapshot.id);
        applyWorkspaceSettingsBundle(saved.data);
        setSettingsBundleLastExportMeta(saved.meta);
        setSettingsSnapshotReview(null);
        setError(null);
        setMaxSyncResult(`Применён snapshot системных настроек: ${snapshot.name}.`);
        await Promise.all([loadNotificationDeliveryStats(), loadSettingsSnapshots()]);
      } catch (e: unknown) {
        setError(extractApiError(e, 'Не удалось применить snapshot системных настроек owner workspace'));
      } finally {
        setSettingsSnapshotApplyingId(null);
      }
    },
    [applyWorkspaceSettingsBundle, loadNotificationDeliveryStats, loadSettingsSnapshots, settingsSnapshotCreateSafetyBeforeApply, workspaceSettingsBundle]
  );

  const deleteSettingsSnapshot = useCallback(async (snapshot: OwnerWorkspaceSettingsSnapshot) => {
    setSettingsSnapshotDeletingId(snapshot.id);
    try {
      const items = await settingsApi.deleteOwnerWorkspaceSettingsSnapshot(snapshot.id);
      setSettingsSnapshots(items);
      setError(null);
      setMaxSyncResult(`Удалён snapshot системных настроек: ${snapshot.name}.`);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось удалить snapshot системных настроек owner workspace'));
    } finally {
      setSettingsSnapshotDeletingId(null);
    }
  }, [applyWorkspaceSettingsBundle]);

  const updateSettingsSnapshot = useCallback(async () => {
    const name = settingsSnapshotName.trim();
    if (!settingsSnapshotEditingId || !name) {
      setError('Укажите название snapshot системных настроек.');
      return;
    }
    setSettingsSnapshotCreating(true);
    try {
      const snapshot = await settingsApi.updateOwnerWorkspaceSettingsSnapshot(settingsSnapshotEditingId, {
        name,
        note: settingsSnapshotNote.trim() || null,
      });
      setSettingsSnapshots((prev) => prev.map((item) => (item.id === snapshot.id ? snapshot : item)));
      setSettingsSnapshotEditOpen(false);
      setSettingsSnapshotEditingId(null);
      setSettingsSnapshotName('');
      setSettingsSnapshotNote('');
      setError(null);
      setMaxSyncResult(`Обновлён snapshot системных настроек: ${snapshot.name}.`);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось обновить snapshot системных настроек owner workspace'));
    } finally {
      setSettingsSnapshotCreating(false);
    }
  }, [settingsSnapshotEditingId, settingsSnapshotName, settingsSnapshotNote]);

  const duplicateSettingsSnapshot = useCallback(async (snapshot: OwnerWorkspaceSettingsSnapshot) => {
    setSettingsSnapshotDuplicatingId(snapshot.id);
    try {
      const duplicated = await settingsApi.duplicateOwnerWorkspaceSettingsSnapshot(snapshot.id);
      setSettingsSnapshots((prev) => [duplicated, ...prev.filter((item) => item.id !== duplicated.id)]);
      setError(null);
      setMaxSyncResult(`Создан дубликат snapshot: ${duplicated.name}.`);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось создать дубликат snapshot системных настроек owner workspace'));
    } finally {
      setSettingsSnapshotDuplicatingId(null);
    }
  }, []);

  const exportSettingsSnapshot = useCallback((snapshot: OwnerWorkspaceSettingsSnapshot) => {
    const stamp = snapshot.created_at.replace(/[:.]/g, '-');
    downloadTextFile(
      JSON.stringify(snapshot.bundle, null, 2),
      `owner_workspace_settings_snapshot_${snapshot.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}_${stamp}.json`,
      'application/json;charset=utf-8'
    );
    setMaxSyncResult(`Экспортирован snapshot системных настроек: ${snapshot.name}.`);
  }, []);

  const copySettingsSnapshot = useCallback(async (snapshot: OwnerWorkspaceSettingsSnapshot) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot.bundle, null, 2));
      setMaxSyncResult(`JSON snapshot системных настроек скопирован: ${snapshot.name}.`);
    } catch {
      setError('Не удалось скопировать JSON snapshot системных настроек.');
    }
  }, []);

  const handleWorkspaceTabChange = (_: React.SyntheticEvent, v: number) => {
    if (v !== OW_TAB_TASKS) {
      setTaskDialog(null);
    }
    setTab(v);
    const params = new URLSearchParams(searchParams);
    params.delete('tab');
    if (v !== OW_TAB_TASKS) {
      params.delete('task');
    }
    const pathname = ownerWorkspaceTabPathname(v);
    navigate(
      { pathname, search: params.toString() ? `?${params.toString()}` : '' },
      { replace: true }
    );
  };

  const drillDownToAssigneeTasks = (
    assigneeId: number | null,
    opts?: { overdueOnly?: boolean; projectId?: number | null }
  ) => {
    setTaskAssigneeFilter(assigneeId == null ? '' : assigneeId);
    setTaskActiveOnly(true);
    setTaskOverdueOnly(Boolean(opts?.overdueOnly));
    setTaskProjectFilter(opts?.projectId == null ? '' : opts.projectId);
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_TASKS);
  };

  const drillDownToProjectTasks = (projectId: number, opts?: { overdueOnly?: boolean }) => {
    setTaskProjectFilter(projectId);
    setTaskAssigneeFilter('');
    setTaskActiveOnly(true);
    setTaskOverdueOnly(Boolean(opts?.overdueOnly));
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_TASKS);
  };

  const openContactQuickComms = async (contactId: number) => {
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_COMMS);
    await loadMeta();
    await selectCommsContact(contactId);
  };

  const reviewArchiveProjectTasks = (projectId: number, overdueOnly = false) => {
    setArchiveProjectConfirm(null);
    closeProjectDialog();
    drillDownToProjectTasks(projectId, { overdueOnly });
  };

  /** Переход на вкладку «Задачи» с фильтром по контакту (state + URL синхронизируются с табом). */
  const reviewArchiveSubproject = (project: OwnerWorkspaceProject) => {
    setArchiveProjectConfirm(null);
    void openProjectDialog(project);
  };

  const reviewArchiveTask = async (task: OwnerWorkspaceTask) => {
    setArchiveProjectConfirm(null);
    await openTaskDialog(task);
  };

  const reviewParticipantProjectTasks = (projectId: number, userId: number, overdueOnly = false) => {
    setRemoveParticipantConfirm(null);
    closeProjectDialog();
    drillDownToAssigneeTasks(userId, { projectId, overdueOnly });
  };

  const reviewRemoveParticipantProject = () => {
    if (!removeParticipantConfirm) return;
    const project = projects.find((row) => row.id === removeParticipantConfirm.projectId);
    if (!project) return;
    setRemoveParticipantConfirm(null);
    void openProjectDialog(project);
  };

  const reviewParticipantTask = async (task: OwnerWorkspaceTask) => {
    setRemoveParticipantConfirm(null);
    closeProjectDialog();
    await openTaskDialog(task);
  };

  const reviewUnlinkContactTasks = (projectId: number, contactId: number, overdueOnly = false) => {
    setUnlinkContactConfirm(null);
    closeProjectDialog();
    closeContactDialog();
    setTaskProjectFilter(projectId);
    setTaskContactFilter(contactId);
    setTaskAssigneeFilter('');
    setTaskActiveOnly(true);
    setTaskOverdueOnly(Boolean(overdueOnly));
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_TASKS);
  };

  const reviewUnlinkContactTask = async (task: OwnerWorkspaceTask) => {
    setUnlinkContactConfirm(null);
    closeProjectDialog();
    closeContactDialog();
    await openTaskDialog(task);
  };

  const reviewUnlinkContactProject = () => {
    if (!unlinkContactConfirm) return;
    const project = projects.find((row) => row.id === unlinkContactConfirm.projectId);
    if (!project) return;
    setUnlinkContactConfirm(null);
    closeContactDialog();
    void openProjectDialog(project);
  };

  const reviewUnlinkContactComms = async () => {
    if (!unlinkContactConfirm) return;
    setUnlinkContactConfirm(null);
    closeProjectDialog();
    closeContactDialog();
    await openContactQuickComms(unlinkContactConfirm.contactId);
  };

  const reviewUnlinkContactAllTasks = () => {
    if (!unlinkContactConfirm) return;
    setUnlinkContactConfirm(null);
    closeProjectDialog();
    closeContactDialog();
    openContactQuickTasks(unlinkContactConfirm.contactId);
  };

  const reviewUnlinkContactCard = () => {
    if (!unlinkContactConfirm) return;
    const contact = contacts.find((row) => row.id === unlinkContactConfirm.contactId);
    if (!contact) return;
    setUnlinkContactConfirm(null);
    closeProjectDialog();
    void openContactDialog(contact);
  };

  const openContactQuickTasks = (contactId: number) => {
    setTaskContactFilter(contactId);
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_TASKS);
  };

  const openSearchHitProject = async (id: number) => {
    setSearchOpen(false);
    setSearchQuery('');
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_PROJECTS);
    await loadProjectsAndContacts();
    try {
      const p = await ownerWorkspaceApi.getProject(id);
      openProjectDialog(p);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Проект не найден'));
    }
  };

  const openSearchHitContact = async (id: number) => {
    setSearchOpen(false);
    setSearchQuery('');
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_CONTACTS);
    await loadProjectsAndContacts();
    try {
      const c = await ownerWorkspaceApi.getContact(id);
      await openContactDialog(c);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Контакт не найден'));
    }
  };

  const openSearchHitTask = async (id: number) => {
    setSearchOpen(false);
    setSearchQuery('');
    skipNextTaskFromUrlEffectRef.current = true;
    const params = new URLSearchParams(searchParams);
    params.delete('tab');
    params.delete('task');
    navigate(
      { pathname: `/owner-workspace/tasks/${id}`, search: params.toString() ? `?${params.toString()}` : '' },
      { replace: true }
    );
    await loadTasksFiltered();
    try {
      const full = await ownerWorkspaceApi.getTask(id);
      await openTaskDialog(full, { syncUrl: false });
    } catch (e: unknown) {
      setError(extractApiError(e, 'Задача не найдена'));
    }
  };

  const openSearchHitMessage = async (contactId: number) => {
    setSearchOpen(false);
    setSearchQuery('');
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_COMMS);
    await selectCommsContact(contactId);
  };

  const openNotificationComms = async (contactId: number) => {
    setNotifAnchor(null);
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_COMMS);
    await loadMeta();
    await selectCommsContact(contactId);
  };

  const markNotificationReadAndRefresh = useCallback(
    async (notificationId: number) => {
      try {
        await ownerWorkspaceApi.markNotificationRead(notificationId);
        await loadNotifications(200);
      } catch (err: unknown) {
        setError(extractApiError(err, 'Не удалось отметить прочитанным'));
      }
    },
    [loadNotifications]
  );

  openProjectDialogRef.current = openProjectDialog;
  openContactDialogRef.current = openContactDialog;
  openTaskDialogRef.current = openTaskDialog;
  loadTasksFilteredRef.current = loadTasksFiltered;

  useEffect(() => {
    if (entityRoute.kind !== 'project' || !entityRoute.id) return undefined;
    if (skipNextProjectFromUrlEffectRef.current) {
      skipNextProjectFromUrlEffectRef.current = false;
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const full = await ownerWorkspaceApi.getProject(entityRoute.id!);
        if (cancelled) return;
        await openProjectDialogRef.current(full, { syncUrl: false });
      } catch (e: unknown) {
        if (!cancelled) setError(extractApiError(e, 'Проект не найден'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityRoute.kind, entityRoute.id]);

  useEffect(() => {
    if (entityRoute.kind !== 'contact' || !entityRoute.id) return undefined;
    if (skipNextContactFromUrlEffectRef.current) {
      skipNextContactFromUrlEffectRef.current = false;
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const full = await ownerWorkspaceApi.getContact(entityRoute.id!);
        if (cancelled) return;
        await openContactDialogRef.current(full, { syncUrl: false });
      } catch (e: unknown) {
        if (!cancelled) setError(extractApiError(e, 'Контакт не найден'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityRoute.kind, entityRoute.id]);

  useEffect(() => {
    const tidRaw = entityRoute.kind === 'task' && entityRoute.id ? String(entityRoute.id) : searchParams.get('task');
    const tid = tidRaw ? parseInt(tidRaw, 10) : NaN;
    if (!Number.isFinite(tid) || tid < 1) return undefined;
    if (skipNextTaskFromUrlEffectRef.current) {
      skipNextTaskFromUrlEffectRef.current = false;
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const nextTab = resolveOwnerWorkspaceTab(location.pathname, searchParams);
        if (nextTab === OW_TAB_TASKS) {
          await loadTasksFilteredRef.current();
        }
        const full = await ownerWorkspaceApi.getTask(tid);
        if (cancelled) return;
        await openTaskDialogRef.current(full, { syncUrl: false });
      } catch (e: unknown) {
        if (!cancelled) setError(extractApiError(e, 'Задача не найдена'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityRoute.id, entityRoute.kind, location.pathname, searchParams]);

  const userOptions = useMemo(
    () => users.filter((u) => ['admin', 'owner', 'sales', 'trainer'].includes(u.role)),
    [users]
  );
  const historyActionOptions = useMemo(() => {
    const seen = new Set<string>();
    const keys = [...Object.keys(OWNER_WS_HISTORY_ACTION_LABELS), ...historyLogs.map((item) => item.action_type)];
    return keys.filter((key) => {
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [historyLogs]);
  const applyHistoryPreset = useCallback((hours: number) => {
    const now = new Date();
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
    setHistoryCreatedFrom(deadlineToLocalInput(from.toISOString()));
    setHistoryCreatedTo(deadlineToLocalInput(now.toISOString()));
  }, []);
  const resetHistoryFilters = useCallback(() => {
    setHistoryEntityFilter('');
    setHistoryEntityIdFilter('');
    setHistoryActionFilter('');
    setHistoryAuthorFilter('');
    setHistoryCreatedFrom('');
    setHistoryCreatedTo('');
    setHistoryLimit(300);
    setHistorySortOrder('desc');
    setHistoryExpandedIds([]);
  }, []);
  const toggleExpandedHistoryEntry = useCallback((id: number) => {
    setHistoryExpandedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }, []);
  const toggleExpandedTaskHistoryEntry = useCallback((id: number) => {
    setTaskHistoryExpandedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }, []);
  const copyHistoryLink = useCallback(async () => {
    const params = buildHistorySearchParams();
    const url = `${window.location.origin}/owner-workspace/history${params.toString() ? `?${params.toString()}` : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      setMaxSyncResult('Ссылка на текущую историю скопирована.');
    } catch {
      setError('Не удалось скопировать ссылку на историю.');
    }
  }, [buildHistorySearchParams]);
  const openHistoryLinkInNewTab = useCallback(() => {
    const params = buildHistorySearchParams();
    const url = `${window.location.origin}/owner-workspace/history${params.toString() ? `?${params.toString()}` : ''}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [buildHistorySearchParams]);

  const userName = useCallback(
    (userId: number | null | undefined) => {
      if (userId == null) return '—';
      const u = users.find((x) => x.id === userId);
      return u?.full_name || `#${userId}`;
    },
    [users]
  );
  const historyExportStamp = useCallback(() => {
    const now = new Date();
    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  }, []);
  const historyExportContextSlug = useMemo(() => {
    const normalize = (value: string) =>
      value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const parts: string[] = [];
    if (historyEntityFilter) parts.push(`entity-${normalize(historyEntityFilter)}`);
    if (historyEntityIdFilter !== '') parts.push(`entityid-${historyEntityIdFilter}`);
    if (historyActionFilter) parts.push(`action-${normalize(historyActionFilter)}`);
    if (historyAuthorFilter !== '') parts.push(`author-${historyAuthorFilter}`);
    if (historyCreatedFrom) parts.push(`from-${normalize(historyCreatedFrom)}`);
    if (historyCreatedTo) parts.push(`to-${normalize(historyCreatedTo)}`);
    if (historyLimit !== 300) parts.push(`limit-${historyLimit}`);
    parts.push(`rows-${historyLogs.length}`);
    return parts.join('_') || 'all';
  }, [
    historyActionFilter,
    historyAuthorFilter,
    historyCreatedFrom,
    historyCreatedTo,
    historyEntityFilter,
    historyEntityIdFilter,
    historyLimit,
    historyLogs.length,
  ]);
  const historyVisibleSummary = useMemo(() => {
    const authors = new Set<number>();
    const actions = new Set<string>();
    historyLogs.forEach((entry) => {
      if (entry.author_id != null) authors.add(entry.author_id);
      if (entry.action_type) actions.add(entry.action_type);
    });
    return {
      rows: historyLogs.length,
      authors: authors.size,
      actions: actions.size,
    };
  }, [historyLogs]);
  const historyActiveFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string }> = [];
    if (historyEntityFilter) {
      chips.push({
        key: 'entity',
        label: `Сущность: ${OWNER_WS_HISTORY_ENTITY_LABELS[historyEntityFilter] || historyEntityFilter}`,
      });
    }
    if (historyEntityIdFilter !== '') {
      chips.push({
        key: 'entity_id',
        label: `ID: ${historyEntityIdFilter}`,
      });
    }
    if (historyActionFilter) {
      chips.push({
        key: 'action',
        label: `Действие: ${OWNER_WS_HISTORY_ACTION_LABELS[historyActionFilter] || historyActionFilter}`,
      });
    }
    if (historyAuthorFilter !== '') {
      chips.push({
        key: 'author',
        label: `Автор: ${userName(historyAuthorFilter)}`,
      });
    }
    if (historyCreatedFrom) chips.push({ key: 'from', label: `С: ${historyCreatedFrom.replace('T', ' ')}` });
    if (historyCreatedTo) chips.push({ key: 'to', label: `По: ${historyCreatedTo.replace('T', ' ')}` });
    if (historyLimit !== 300) chips.push({ key: 'limit', label: `Лимит: ${historyLimit}` });
    if (historySortOrder !== 'desc') chips.push({ key: 'sort', label: 'Порядок: сначала старые' });
    return chips;
  }, [
    historyActionFilter,
    historyAuthorFilter,
    historyCreatedFrom,
    historyCreatedTo,
    historyEntityFilter,
    historyEntityIdFilter,
    historyLimit,
    historySortOrder,
    userName,
  ]);
  const clearHistoryFilterChip = useCallback((key: string) => {
    switch (key) {
      case 'entity':
        setHistoryEntityFilter('');
        break;
      case 'entity_id':
        setHistoryEntityIdFilter('');
        break;
      case 'action':
        setHistoryActionFilter('');
        break;
      case 'author':
        setHistoryAuthorFilter('');
        break;
      case 'from':
        setHistoryCreatedFrom('');
        break;
      case 'to':
        setHistoryCreatedTo('');
        break;
      case 'limit':
        setHistoryLimit(300);
        break;
      case 'sort':
        setHistorySortOrder('desc');
        break;
      default:
        break;
    }
  }, []);
  const applyHistoryEntityQuickFilter = useCallback((entityType: string) => {
    setHistoryEntityFilter(entityType);
    setHistoryEntityIdFilter('');
  }, []);
  const applyHistoryExactEntityQuickFilter = useCallback((entityType: string, entityId: number) => {
    setHistoryEntityFilter(entityType);
    setHistoryEntityIdFilter(entityId);
  }, []);
  const applyHistoryActionQuickFilter = useCallback((actionType: string) => {
    setHistoryActionFilter(actionType);
  }, []);
  const applyHistoryAuthorQuickFilter = useCallback((authorId: number | null | undefined) => {
    if (authorId == null) return;
    setHistoryAuthorFilter(authorId);
  }, []);
  const refreshHistoryView = useCallback(() => {
    setHistoryReloadTick((prev) => prev + 1);
  }, []);
  const applyHistoryDayQuickFilter = useCallback((dayIso: string) => {
    const day = new Date(dayIso);
    if (Number.isNaN(day.getTime())) return;
    const from = new Date(day);
    from.setHours(0, 0, 0, 0);
    const to = new Date(day);
    to.setHours(23, 59, 59, 999);
    setHistoryCreatedFrom(deadlineToLocalInput(from.toISOString()));
    setHistoryCreatedTo(deadlineToLocalInput(to.toISOString()));
  }, []);
  const historyDayMax = useMemo(
    () => Math.max(...(historyStats?.day_counts.map((item) => item.count) || [0]), 1),
    [historyStats?.day_counts]
  );
  const historyTotalRows = historyStats?.total_rows ?? historyVisibleSummary.rows;
  const historyStatsPercentLabel = useCallback(
    (count: number) => `${count} (${historyTotalRows > 0 ? Math.round((count / historyTotalRows) * 100) : 0}%)`,
    [historyTotalRows]
  );
  const copyHistoryStatsSummary = useCallback(async () => {
    const summary = [
      `Записей в выборке: ${historyStats?.total_rows ?? historyVisibleSummary.rows}`,
      `Видимых строк: ${historyLogs.length}`,
      `Авторов: ${historyStats?.unique_authors ?? historyVisibleSummary.authors}`,
      `Действий: ${historyStats?.unique_actions ?? historyVisibleSummary.actions}`,
      historyStats?.first_created_at && historyStats?.last_created_at
        ? `Период: ${new Date(historyStats.first_created_at).toLocaleString('ru-RU')} — ${new Date(historyStats.last_created_at).toLocaleString('ru-RU')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(summary);
      setMaxSyncResult('Сводка истории скопирована.');
    } catch {
      setError('Не удалось скопировать сводку истории.');
    }
  }, [historyLogs.length, historyStats, historyVisibleSummary.actions, historyVisibleSummary.authors, historyVisibleSummary.rows]);
  const copyHistoryStatsJson = useCallback(async () => {
    if (!historyStats) return;
    const payload = {
      filters: {
        entity_type: historyEntityFilter || null,
        entity_id: historyEntityIdFilter === '' ? null : historyEntityIdFilter,
        action_type: historyActionFilter || null,
        author_id: historyAuthorFilter === '' ? null : historyAuthorFilter,
        created_from: localInputToIso(historyCreatedFrom),
        created_to: localInputToIso(historyCreatedTo),
        limit: historyLimit,
        sort_order: historySortOrder,
      },
      stats: historyStats,
      visible_rows: historyLogs.length,
      loaded_at: historyStatsLoadedAt,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setMaxSyncResult('JSON сводки истории скопирован.');
    } catch {
      setError('Не удалось скопировать JSON сводки истории.');
    }
  }, [
    historyActionFilter,
    historyAuthorFilter,
    historyCreatedFrom,
    historyCreatedTo,
    historyEntityFilter,
    historyEntityIdFilter,
    historyLimit,
    historyLogs.length,
    historySortOrder,
    historyStats,
    historyStatsLoadedAt,
  ]);
  const exportHistoryStatsJson = useCallback(() => {
    if (!historyStats) return;
    const payload = {
      filters: {
        entity_type: historyEntityFilter || null,
        entity_id: historyEntityIdFilter === '' ? null : historyEntityIdFilter,
        action_type: historyActionFilter || null,
        author_id: historyAuthorFilter === '' ? null : historyAuthorFilter,
        created_from: localInputToIso(historyCreatedFrom),
        created_to: localInputToIso(historyCreatedTo),
        limit: historyLimit,
        sort_order: historySortOrder,
      },
      stats: historyStats,
      visible_rows: historyLogs.length,
      loaded_at: historyStatsLoadedAt,
    };
    downloadTextFile(
      JSON.stringify(payload, null, 2),
      `owner_workspace_history_stats_${historyExportContextSlug}_${historyExportStamp()}.json`,
      'application/json;charset=utf-8'
    );
    setMaxSyncResult('Экспортирована сводка истории в JSON.');
  }, [
    historyActionFilter,
    historyAuthorFilter,
    historyCreatedFrom,
    historyCreatedTo,
    historyEntityFilter,
    historyEntityIdFilter,
    historyExportContextSlug,
    historyExportStamp,
    historyLimit,
    historyLogs.length,
    historySortOrder,
    historyStats,
    historyStatsLoadedAt,
  ]);
  const exportHistoryStatsCsv = useCallback(() => {
    if (!historyStats) return;
    const rows = [
      ['metric', 'key', 'count'],
      ['total_rows', '', String(historyStats.total_rows)],
      ['unique_authors', '', String(historyStats.unique_authors)],
      ['unique_actions', '', String(historyStats.unique_actions)],
      ...historyStats.entity_type_counts.map((item) => ['entity_type', item.key, String(item.count)]),
      ...historyStats.action_counts.map((item) => ['action_type', item.key, String(item.count)]),
      ...historyStats.author_counts.map((item) => ['author', String(item.author_id), String(item.count)]),
      ...historyStats.day_counts.map((item) => ['day', item.day, String(item.count)]),
    ];
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
    downloadTextFile(
      csv,
      `owner_workspace_history_stats_${historyExportContextSlug}_${historyExportStamp()}.csv`,
      'text/csv;charset=utf-8'
    );
    setMaxSyncResult('Экспортирована сводка истории в CSV.');
  }, [historyExportContextSlug, historyExportStamp, historyStats]);
  const expandAllVisibleHistoryEntries = useCallback(() => {
    setHistoryExpandedIds(historyLogs.filter((item) => item.old_value || item.new_value).map((item) => item.id));
  }, [historyLogs]);
  const collapseAllVisibleHistoryEntries = useCallback(() => {
    setHistoryExpandedIds([]);
  }, []);

  const exportHistoryJson = useCallback(() => {
    const payload = historyLogs.map((entry) => ({
      ...entry,
      author_name: userName(entry.author_id),
      label: ownerWsHistoryPrimaryLabel(entry),
      changed_fields: ownerWsHistoryChangedFields(entry),
    }));
    downloadTextFile(
      `${JSON.stringify(payload, null, 2)}\n`,
      `owner_workspace_history_${historyExportContextSlug}_${historyExportStamp()}.json`,
      'application/json;charset=utf-8'
    );
    setError(null);
    setMaxSyncResult(`Экспортировано ${historyLogs.length} записей истории в JSON.`);
  }, [historyExportContextSlug, historyExportStamp, historyLogs, userName]);
  const exportHistoryCsv = useCallback(() => {
    const header = [
      'created_at',
      'author_id',
      'author_name',
      'entity_type',
      'entity_id',
      'action_type',
      'label',
      'changed_fields',
      'old_value',
      'new_value',
    ];
    const rows = historyLogs.map((entry) =>
      [
        entry.created_at || '',
        entry.author_id ?? '',
        userName(entry.author_id),
        entry.entity_type,
        entry.entity_id,
        entry.action_type,
        ownerWsHistoryPrimaryLabel(entry),
        ownerWsHistoryChangedFields(entry).join(', '),
        ownerWsHistoryPayloadText(entry.old_value),
        ownerWsHistoryPayloadText(entry.new_value),
      ]
        .map(ownerWsCsvCell)
        .join(',')
    );
    const csv = `\uFEFF${header.map(ownerWsCsvCell).join(',')}\n${rows.join('\n')}\n`;
    downloadTextFile(csv, `owner_workspace_history_${historyExportContextSlug}_${historyExportStamp()}.csv`, 'text/csv;charset=utf-8');
    setError(null);
    setMaxSyncResult(`Экспортировано ${historyLogs.length} записей истории в CSV.`);
  }, [historyExportContextSlug, historyExportStamp, historyLogs, userName]);
  const copyWorkspaceEntityLink = useCallback(
    async (kind: 'project' | 'contact' | 'task', id: number) => {
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/owner-workspace/${kind}s/${id}`);
        setError(null);
        setMaxSyncResult('Ссылка скопирована.');
      } catch (e: unknown) {
        setError(extractApiError(e, 'Не удалось скопировать ссылку'));
      }
    },
    []
  );

  const openHistoryEntity = useCallback(
    async (entry: OwnerWorkspaceAuditLog) => {
      try {
        if (entry.entity_type === 'project') {
          const project = await ownerWorkspaceApi.getProject(entry.entity_id);
          setTab(OW_TAB_PROJECTS);
          await openProjectDialogRef.current(project, { syncUrl: true });
          return;
        }
        if (entry.entity_type === 'contact') {
          const contact = await ownerWorkspaceApi.getContact(entry.entity_id);
          setTab(OW_TAB_CONTACTS);
          await openContactDialogRef.current(contact, { syncUrl: true });
          return;
        }
        if (entry.entity_type === 'task') {
          const task = await ownerWorkspaceApi.getTask(entry.entity_id);
          setTab(OW_TAB_TASKS);
          await openTaskDialogRef.current(task, { syncUrl: true });
        }
      } catch (e: unknown) {
        setError(extractApiError(e, 'Не удалось открыть сущность из истории'));
      }
    },
    [setTab]
  );

  const canManageProjectTeam = useMemo(() => {
    if (!projectDialog || !user?.id) return false;
    if (isWorkspaceFullAccess) return true;
    if (projectDialog.owner_id === user.id) return true;
    return (
      projectDialog.participant_roles?.[String(user.id)] === 'manager' &&
      permissionPolicy.manager_can_manage_team
    );
  }, [projectDialog, user?.id, isWorkspaceFullAccess, permissionPolicy.manager_can_manage_team]);

  const canCreateProjectUi = useMemo(
    () => isWorkspaceFullAccess || permissionPolicy.limited_can_create_projects,
    [isWorkspaceFullAccess, permissionPolicy.limited_can_create_projects]
  );
  const canCreateContactUi = useMemo(
    () => isWorkspaceFullAccess || permissionPolicy.limited_can_create_contacts,
    [isWorkspaceFullAccess, permissionPolicy.limited_can_create_contacts]
  );
  const canCreateTaskUi = useMemo(
    () => isWorkspaceFullAccess || permissionPolicy.limited_can_create_tasks,
    [isWorkspaceFullAccess, permissionPolicy.limited_can_create_tasks]
  );
  const canEditContactCardUi = useMemo(
    () => isWorkspaceFullAccess || permissionPolicy.limited_can_edit_contacts,
    [isWorkspaceFullAccess, permissionPolicy.limited_can_edit_contacts]
  );
  const canEditTaskFieldsUi = useMemo(
    () => isWorkspaceFullAccess || permissionPolicy.limited_can_edit_tasks,
    [isWorkspaceFullAccess, permissionPolicy.limited_can_edit_tasks]
  );
  const canManageProjectContactsUi = useMemo(
    () => isWorkspaceFullAccess || permissionPolicy.limited_can_manage_project_contacts,
    [isWorkspaceFullAccess, permissionPolicy.limited_can_manage_project_contacts]
  );
  const canCompleteTaskUi = useMemo(
    () => isWorkspaceFullAccess || permissionPolicy.limited_can_complete_tasks,
    [isWorkspaceFullAccess, permissionPolicy.limited_can_complete_tasks]
  );
  const canBulkUpdateTasksUi = useMemo(
    () => isWorkspaceFullAccess || permissionPolicy.limited_can_bulk_update_tasks,
    [isWorkspaceFullAccess, permissionPolicy.limited_can_bulk_update_tasks]
  );
  const canLinkMessagesUi = useMemo(
    () => isWorkspaceFullAccess || permissionPolicy.limited_can_link_messages,
    [isWorkspaceFullAccess, permissionPolicy.limited_can_link_messages]
  );
  const canSendMessageUi = useMemo(
    () => isWorkspaceFullAccess || permissionPolicy.limited_can_send_messages,
    [isWorkspaceFullAccess, permissionPolicy.limited_can_send_messages]
  );
  const canCommentTaskUi = useMemo(
    () => isWorkspaceFullAccess || permissionPolicy.limited_can_comment_tasks,
    [isWorkspaceFullAccess, permissionPolicy.limited_can_comment_tasks]
  );

  const canChangeParticipantRoles = useMemo(() => {
    if (!projectDialog || !user?.id) return false;
    if (isWorkspaceFullAccess) return true;
    if (projectDialog.owner_id === user.id) return true;
    return (
      projectDialog.participant_roles?.[String(user.id)] === 'manager' &&
      permissionPolicy.manager_can_change_roles
    );
  }, [projectDialog, user?.id, isWorkspaceFullAccess, permissionPolicy.manager_can_change_roles]);

  const canCurrentActorAssignManager = useMemo(() => {
    if (!projectDialog || !user?.id) return false;
    if (isWorkspaceFullAccess || projectDialog.owner_id === user.id) return true;
    return (
      permissionPolicy.manager_can_manage_team &&
      projectDialog.participant_roles?.[String(user.id)] === 'manager' &&
      permissionPolicy.manager_can_assign_manager
    );
  }, [projectDialog, user?.id, isWorkspaceFullAccess, permissionPolicy.manager_can_manage_team, permissionPolicy.manager_can_assign_manager]);

  const canCurrentActorAssignObserver = useMemo(() => {
    if (!projectDialog || !user?.id) return false;
    if (isWorkspaceFullAccess || projectDialog.owner_id === user.id) return true;
    return (
      permissionPolicy.manager_can_manage_team &&
      projectDialog.participant_roles?.[String(user.id)] === 'manager' &&
      permissionPolicy.manager_can_assign_observer
    );
  }, [projectDialog, user?.id, isWorkspaceFullAccess, permissionPolicy.manager_can_manage_team, permissionPolicy.manager_can_assign_observer]);

  const allowedParticipantRoleOptions = useMemo(
    () =>
      ([
        { value: 'member', label: 'Участник', allowed: true },
        { value: 'manager', label: 'Менеджер', allowed: canCurrentActorAssignManager },
        { value: 'observer', label: 'Наблюдатель', allowed: canCurrentActorAssignObserver },
      ] as const).filter((item) => item.allowed),
    [canCurrentActorAssignManager, canCurrentActorAssignObserver]
  );

  useEffect(() => {
    if (!allowedParticipantRoleOptions.some((item) => item.value === newParticipantRole)) {
      setNewParticipantRole('member');
    }
  }, [allowedParticipantRoleOptions, newParticipantRole]);

  const canEditProjectContentUi = useCallback(
    (projectId: number | null | undefined) => {
      if (projectId == null || !user?.id) return false;
      if (isWorkspaceFullAccess) return true;
      const project =
        (projectDialog?.id === projectId ? projectDialog : null) ??
        projectsCatalog.find((item) => item.id === projectId) ??
        null;
      if (!project) return false;
      if (project.owner_id === user.id) return true;
      const rawRole = project.participant_roles?.[String(user.id)];
      return rawRole === 'member' || rawRole === 'manager';
    },
    [isWorkspaceFullAccess, projectDialog, projectsCatalog, user?.id]
  );

  const canEditProjectMetaUi = useCallback(
    (projectId: number | null | undefined) => {
      if (projectId == null || !user?.id) return false;
      if (isWorkspaceFullAccess) return true;
      const project =
        (projectDialog?.id === projectId ? projectDialog : null) ??
        projectsCatalog.find((item) => item.id === projectId) ??
        null;
      if (!project) return false;
      if (project.owner_id === user.id) return true;
      return (
        project.participant_roles?.[String(user.id)] === 'manager' &&
        permissionPolicy.manager_can_edit_project_meta
      );
    },
    [isWorkspaceFullAccess, permissionPolicy.manager_can_edit_project_meta, projectDialog, projectsCatalog, user?.id]
  );

  const canArchiveProjectUi = useCallback(
    (projectId: number | null | undefined) => {
      if (projectId == null || !user?.id) return false;
      if (isWorkspaceFullAccess) return true;
      const project =
        (projectDialog?.id === projectId ? projectDialog : null) ??
        projectsCatalog.find((item) => item.id === projectId) ??
        null;
      if (!project) return false;
      if (project.owner_id === user.id) return true;
      return (
        project.participant_roles?.[String(user.id)] === 'manager' &&
        permissionPolicy.manager_can_archive_project
      );
    },
    [isWorkspaceFullAccess, permissionPolicy.manager_can_archive_project, projectDialog, projectsCatalog, user?.id]
  );
  const archiveProjectSubprojectsPreview = useMemo(() => {
    if (!archiveProjectConfirm) return [] as OwnerWorkspaceProject[];
    return projectsCatalog
      .filter((project) => project.parent_project_id === archiveProjectConfirm.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .slice(0, 5);
  }, [archiveProjectConfirm, projectsCatalog]);
  const archiveProjectActiveTasksPreview = useMemo(() => {
    if (!archiveProjectConfirm) return [] as OwnerWorkspaceTask[];
    return projectDialogTasks
      .filter(
        (task) =>
          task.project_id === archiveProjectConfirm.id &&
          task.status !== 'completed' &&
          task.status !== 'cancelled'
      )
      .sort((a, b) => {
        const overdueDiff = Number(isTaskOverdue(b)) - Number(isTaskOverdue(a));
        if (overdueDiff !== 0) return overdueDiff;
        const aDeadline = a.deadline_at ? new Date(a.deadline_at).getTime() : Number.POSITIVE_INFINITY;
        const bDeadline = b.deadline_at ? new Date(b.deadline_at).getTime() : Number.POSITIVE_INFINITY;
        if (aDeadline !== bDeadline) return aDeadline - bDeadline;
        return a.title.localeCompare(b.title, 'ru');
      })
      .slice(0, 5);
  }, [archiveProjectConfirm, projectDialogTasks]);
  const removeParticipantTaskPreview = useMemo(() => {
    if (!removeParticipantConfirm) return [] as OwnerWorkspaceTask[];
    return projectDialogTasks
      .filter(
        (task) =>
          task.project_id === removeParticipantConfirm.projectId &&
          task.assignee_id === removeParticipantConfirm.userId &&
          task.status !== 'completed' &&
          task.status !== 'cancelled'
      )
      .sort((a, b) => {
        const overdueDiff = Number(isTaskOverdue(b)) - Number(isTaskOverdue(a));
        if (overdueDiff !== 0) return overdueDiff;
        const aDeadline = a.deadline_at ? new Date(a.deadline_at).getTime() : Number.POSITIVE_INFINITY;
        const bDeadline = b.deadline_at ? new Date(b.deadline_at).getTime() : Number.POSITIVE_INFINITY;
        if (aDeadline !== bDeadline) return aDeadline - bDeadline;
        return a.title.localeCompare(b.title, 'ru');
      })
      .slice(0, 5);
  }, [projectDialogTasks, removeParticipantConfirm]);
  const removeParticipantActiveTaskCount = useMemo(() => {
    if (!removeParticipantConfirm) return 0;
    return projectDialogTasks.filter(
      (task) =>
        task.project_id === removeParticipantConfirm.projectId &&
        task.assignee_id === removeParticipantConfirm.userId &&
        task.status !== 'completed' &&
        task.status !== 'cancelled'
    ).length;
  }, [projectDialogTasks, removeParticipantConfirm]);
  const unlinkContactTaskCandidates = useMemo(() => {
    if (!unlinkContactConfirm) return [] as OwnerWorkspaceTask[];
    const byId = new Map<number, OwnerWorkspaceTask>();
    [...projectDialogTasks, ...contactDialogTasks].forEach((task) => {
      if (
        task.project_id === unlinkContactConfirm.projectId &&
        task.contact_id === unlinkContactConfirm.contactId &&
        task.status !== 'completed' &&
        task.status !== 'cancelled'
      ) {
        byId.set(task.id, task);
      }
    });
    return Array.from(byId.values()).sort((a, b) => {
      const overdueDiff = Number(isTaskOverdue(b)) - Number(isTaskOverdue(a));
      if (overdueDiff !== 0) return overdueDiff;
      const aDeadline = a.deadline_at ? new Date(a.deadline_at).getTime() : Number.POSITIVE_INFINITY;
      const bDeadline = b.deadline_at ? new Date(b.deadline_at).getTime() : Number.POSITIVE_INFINITY;
      if (aDeadline !== bDeadline) return aDeadline - bDeadline;
      return a.title.localeCompare(b.title, 'ru');
    });
  }, [contactDialogTasks, projectDialogTasks, unlinkContactConfirm]);
  const unlinkContactTaskPreview = useMemo(() => unlinkContactTaskCandidates.slice(0, 5), [unlinkContactTaskCandidates]);
  const unlinkContactOverdueTaskCount = useMemo(
    () => unlinkContactTaskCandidates.filter((task) => isTaskOverdue(task)).length,
    [unlinkContactTaskCandidates]
  );
  const canCreateSubprojectUi = useMemo(() => {
    if (!projectDialog) return false;
    if (!canCreateProjectUi) return false;
    if (isWorkspaceFullAccess) return true;
    return canEditProjectContentUi(projectDialog.id);
  }, [canCreateProjectUi, canEditProjectContentUi, isWorkspaceFullAccess, projectDialog]);

  const canEditProjectDialogContent = useMemo(
    () => (projectDialog ? canEditProjectContentUi(projectDialog.id) : false),
    [canEditProjectContentUi, projectDialog]
  );
  const canEditProjectDialogMeta = useMemo(
    () => (projectDialog ? canEditProjectMetaUi(projectDialog.id) : false),
    [canEditProjectMetaUi, projectDialog]
  );
  const canArchiveProjectDialog = useMemo(
    () => (projectDialog ? canArchiveProjectUi(projectDialog.id) : false),
    [canArchiveProjectUi, projectDialog]
  );
  const canManageProjectContactsDialog = useMemo(
    () => canEditProjectDialogContent && canManageProjectContactsUi,
    [canEditProjectDialogContent, canManageProjectContactsUi]
  );

  const canEditContactContentUi = useCallback(
    (contactId: number | null | undefined) => {
      if (contactId == null || !user?.id) return false;
      if (isWorkspaceFullAccess) return true;
      const contact =
        (contactDialog?.id === contactId ? contactDialog : null) ??
        contactsCatalog.find((item) => item.id === contactId) ??
        contacts.find((item) => item.id === contactId) ??
        null;
      if (!contact) return true;
      const linkedProjectIds = Array.isArray(contact.linked_project_ids) ? contact.linked_project_ids : [];
      if (linkedProjectIds.length === 0) return true;
      if (linkedProjectIds.some((projectId) => canEditProjectContentUi(projectId))) {
        return true;
      }
      if (contactDialog?.id === contactId) {
        return contactDialogTasks.some((task) => task.creator_id === user.id || task.assignee_id === user.id);
      }
      return false;
    },
    [canEditProjectContentUi, contactDialog, contactDialogTasks, contacts, contactsCatalog, isWorkspaceFullAccess, user?.id]
  );

  const canEditContactDialogContent = useMemo(() => {
    if (!contactDialog || !user?.id) return false;
    if (isWorkspaceFullAccess) return true;
    return canEditContactContentUi(contactDialog.id);
  }, [canEditContactContentUi, contactDialog, isWorkspaceFullAccess, user?.id]);
  const canEditContactCardDialogContent = useMemo(
    () => canEditContactDialogContent && canEditContactCardUi,
    [canEditContactCardUi, canEditContactDialogContent]
  );

  const canEditTaskDialogContent = useMemo(() => {
    if (!taskDialog) return false;
    if (isWorkspaceFullAccess) return true;
    if (taskDialog.project_id != null) {
      return canEditProjectContentUi(taskDialog.project_id);
    }
    return true;
  }, [canEditProjectContentUi, isWorkspaceFullAccess, taskDialog]);
  const canEditTaskFieldsDialogContent = useMemo(
    () => canEditTaskDialogContent && canEditTaskFieldsUi,
    [canEditTaskDialogContent, canEditTaskFieldsUi]
  );


  const canCreateTaskFromMessageUi = useMemo(() => {
    if (!messageTaskDialog) return false;
    if (!canCreateTaskUi) return false;
    return canEditContactContentUi(messageTaskDialog.message.contact_id);
  }, [canCreateTaskUi, canEditContactContentUi, messageTaskDialog]);

  const canMutateTaskUi = useCallback(
    (task: OwnerWorkspaceTask | null | undefined) => {
      if (!task) return false;
      if (isWorkspaceFullAccess) return true;
      if (task.project_id != null) {
        return canEditProjectContentUi(task.project_id);
      }
      return true;
    },
    [canEditProjectContentUi, isWorkspaceFullAccess]
  );
  const canCompleteTaskActionUi = useCallback(
    (task: OwnerWorkspaceTask | null | undefined) => canMutateTaskUi(task) && canCompleteTaskUi,
    [canCompleteTaskUi, canMutateTaskUi]
  );

  const editableLinkTaskOptions = useMemo(
    () => (canLinkMessagesUi ? linkTaskOptions.filter((task) => canMutateTaskUi(task)) : []),
    [canLinkMessagesUi, canMutateTaskUi, linkTaskOptions]
  );

  const assigneeAnalyticsRows = useMemo<OwnerWorkspaceAssigneeAnalyticsRow[]>(() => {
    const now = Date.now();
    const buckets = new Map<
      string,
      {
        assigneeId: number | null;
        assigneeName: string;
        activeCount: number;
        overdueCount: number;
        completedCount: number;
        completionDays: number[];
      }
    >();

    for (const task of tasks) {
      const assigneeId = task.assignee_id ?? null;
      const key = assigneeId == null ? 'unassigned' : String(assigneeId);
      if (!buckets.has(key)) {
        buckets.set(key, {
          assigneeId,
          assigneeName: assigneeId == null ? 'Без исполнителя' : userName(assigneeId),
          activeCount: 0,
          overdueCount: 0,
          completedCount: 0,
          completionDays: [],
        });
      }
      const bucket = buckets.get(key)!;
      const status = String(task.status);
      const isDone = status === 'completed';
      const isCancelled = status === 'cancelled';
      if (!isDone && !isCancelled) {
        bucket.activeCount += 1;
        if (task.deadline_at && new Date(task.deadline_at).getTime() < now) {
          bucket.overdueCount += 1;
        }
      }
      if (isDone) {
        bucket.completedCount += 1;
        if (task.created_at && task.completed_at) {
          const ms = new Date(task.completed_at).getTime() - new Date(task.created_at).getTime();
          if (Number.isFinite(ms) && ms >= 0) {
            bucket.completionDays.push(ms / 86400000);
          }
        }
      }
    }

    return Array.from(buckets.values())
      .map((bucket) => ({
        assigneeId: bucket.assigneeId,
        assigneeName: bucket.assigneeName,
        activeCount: bucket.activeCount,
        overdueCount: bucket.overdueCount,
        completedCount: bucket.completedCount,
        avgDaysToComplete:
          bucket.completionDays.length > 0
            ? Math.round((bucket.completionDays.reduce((sum, value) => sum + value, 0) / bucket.completionDays.length) * 10) / 10
            : null,
      }))
      .filter((row) => row.activeCount > 0 || row.overdueCount > 0 || row.completedCount > 0)
      .sort((a, b) => {
        if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
        if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
        return a.assigneeName.localeCompare(b.assigneeName, 'ru');
      });
  }, [tasks, userName]);

  const assigneeAnalyticsSummary = useMemo(
    () => ({
      assigneesWithActiveTasks: assigneeAnalyticsRows.filter((row) => row.activeCount > 0).length,
      assigneesWithOverdueTasks: assigneeAnalyticsRows.filter((row) => row.overdueCount > 0).length,
      overloadedAssignees: assigneeAnalyticsRows.filter((row) => row.activeCount >= 5).length,
    }),
    [assigneeAnalyticsRows]
  );

  const assigneeAttentionRows = useMemo(
    () =>
      assigneeAnalyticsRows
        .filter((row) => row.overdueCount > 0 || row.activeCount >= 5)
        .sort((a, b) => {
          if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
          if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
          return a.assigneeName.localeCompare(b.assigneeName, 'ru');
        })
        .slice(0, 5),
    [assigneeAnalyticsRows]
  );

  const projectParticipantAnalyticsRows = useMemo<OwnerWorkspaceAssigneeAnalyticsRow[]>(() => {
    if (!projectDialog) return [];
    const now = Date.now();
    const relevantIds = new Set<number>();
    if (projectDialog.owner_id != null) relevantIds.add(projectDialog.owner_id);
    for (const pid of projectDialog.participants || []) relevantIds.add(pid);

    const buckets = new Map<
      string,
      {
        assigneeId: number | null;
        assigneeName: string;
        activeCount: number;
        overdueCount: number;
        completedCount: number;
        completionDays: number[];
      }
    >();

    const ensureBucket = (assigneeId: number | null) => {
      const key = assigneeId == null ? 'unassigned' : String(assigneeId);
      if (!buckets.has(key)) {
        buckets.set(key, {
          assigneeId,
          assigneeName: assigneeId == null ? 'Без исполнителя' : userName(assigneeId),
          activeCount: 0,
          overdueCount: 0,
          completedCount: 0,
          completionDays: [],
        });
      }
      return buckets.get(key)!;
    };

    for (const assigneeId of relevantIds) ensureBucket(assigneeId);

    for (const task of projectDialogTasks) {
      const assigneeId = task.assignee_id ?? null;
      const bucket = ensureBucket(assigneeId);
      const status = String(task.status);
      const isDone = status === 'completed';
      const isCancelled = status === 'cancelled';
      if (!isDone && !isCancelled) {
        bucket.activeCount += 1;
        if (task.deadline_at && new Date(task.deadline_at).getTime() < now) {
          bucket.overdueCount += 1;
        }
      }
      if (isDone) {
        bucket.completedCount += 1;
        if (task.created_at && task.completed_at) {
          const ms = new Date(task.completed_at).getTime() - new Date(task.created_at).getTime();
          if (Number.isFinite(ms) && ms >= 0) {
            bucket.completionDays.push(ms / 86400000);
          }
        }
      }
    }

    return Array.from(buckets.values())
      .map((bucket) => ({
        assigneeId: bucket.assigneeId,
        assigneeName: bucket.assigneeName,
        activeCount: bucket.activeCount,
        overdueCount: bucket.overdueCount,
        completedCount: bucket.completedCount,
        avgDaysToComplete:
          bucket.completionDays.length > 0
            ? Math.round((bucket.completionDays.reduce((sum, value) => sum + value, 0) / bucket.completionDays.length) * 10) / 10
            : null,
      }))
      .filter((row) => row.activeCount > 0 || row.overdueCount > 0 || row.completedCount > 0)
      .sort((a, b) => {
        if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
        if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
        return a.assigneeName.localeCompare(b.assigneeName, 'ru');
      });
  }, [projectDialog, projectDialogTasks, userName]);

  const topOverdueProjects = useMemo(
    () =>
      [...projects]
        .filter((project) => (project.overdue_tasks_count ?? 0) > 0)
        .sort((a, b) => {
          const overdueDiff = (b.overdue_tasks_count ?? 0) - (a.overdue_tasks_count ?? 0);
          if (overdueDiff !== 0) return overdueDiff;
          return (b.active_tasks_count ?? 0) - (a.active_tasks_count ?? 0);
        })
        .slice(0, 6),
    [projects]
  );

  const projectsCatalogSorted = useMemo(
    () => [...projectsCatalog].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [projectsCatalog]
  );

  const contactsCatalogSorted = useMemo(
    () => [...contactsCatalog].sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru')),
    [contactsCatalog]
  );

  const contactListTagOptions = useMemo(() => {
    const s = new Set<string>();
    for (const c of contactsCatalog) {
      for (const t of c.tags || []) {
        const x = String(t).trim();
        if (x) s.add(x);
      }
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [contactsCatalog]);

  const projectDialogLinkedContacts = useMemo(() => {
    if (!projectDialog) return [];
    return contactsCatalogSorted.filter((c) => c.linked_project_ids.includes(projectDialog.id));
  }, [contactsCatalogSorted, projectDialog]);

  const subprojectTreeRooted = useMemo(() => {
    if (!projectDialog) return [];
    const m = buildOwnerWsProjectChildrenByParent(projectsCatalog);
    return buildOwnerWsSubprojectTreeAt(projectDialog.id, m);
  }, [projectDialog, projectsCatalog]);

  const contactDialogLinkedProjects = useMemo(() => {
    if (!contactDialog?.linked_project_ids?.length) return [];
    const ids = new Set(contactDialog.linked_project_ids);
    return projectsCatalogSorted.filter((p) => ids.has(p.id));
  }, [contactDialog, projectsCatalogSorted]);

  const contactDialogTasksDone = useMemo(
    () => contactDialogTasks.filter((t) => ['completed', 'cancelled'].includes(String(t.status))),
    [contactDialogTasks]
  );
  const contactDialogTasksActive = useMemo(
    () => contactDialogTasks.filter((t) => !['completed', 'cancelled'].includes(String(t.status))),
    [contactDialogTasks]
  );

  const projectDialogTasksFiltered = useMemo(() => {
    let rows = projectDialogTasks;
    if (projectDialogTaskStatus) {
      rows = rows.filter((t) => String(t.status) === projectDialogTaskStatus);
    }
    const q = projectDialogTaskSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (t) => (t.title || '').toLowerCase().includes(q) || String(t.id).includes(q)
      );
    }
    return rows;
  }, [projectDialogTasks, projectDialogTaskStatus, projectDialogTaskSearch]);

  const contactMessagesFiltered = useMemo(() => {
    const q = contactMessageSearch.trim().toLowerCase();
    if (!q) return contactMessages;
    return contactMessages.filter((m) => (m.text || '').toLowerCase().includes(q));
  }, [contactMessages, contactMessageSearch]);

  const conversationsFiltered = useMemo(() => {
    const q = commsDialogSearch.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        (c.contact_name || '').toLowerCase().includes(q) ||
        (c.last_message_text || '').toLowerCase().includes(q)
    );
  }, [conversations, commsDialogSearch]);

  const commsUnreadTotal = useMemo(
    () => conversations.reduce((sum, c) => sum + Math.max(0, c.unread_count || 0), 0),
    [conversations]
  );

  const commsMessagesFiltered = useMemo(() => {
    const q = commsThreadSearch.trim().toLowerCase();
    if (!q) return commsMessages;
    return commsMessages.filter((m) => (m.text || '').toLowerCase().includes(q));
  }, [commsMessages, commsThreadSearch]);

  const commsSelectedContact = useMemo(() => {
    if (commsContactId == null) return null;
    return (
      contactsCatalogSorted.find((c) => c.id === commsContactId) || contacts.find((c) => c.id === commsContactId) || null
    );
  }, [commsContactId, contactsCatalogSorted, contacts]);

  const tasksByDeadlineDay = useMemo(() => {
    const map = new Map<string, OwnerWorkspaceTask[]>();
    for (const t of tasks) {
      if (!t.deadline_at) continue;
      const key = format(new Date(t.deadline_at), 'yyyy-MM-dd');
      const arr = map.get(key) || [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  const projectDisplayName = useCallback(
    (projectId: number | null | undefined) => {
      if (projectId == null) return '—';
      return projectsCatalogSorted.find((project) => project.id === projectId)?.name || `#${projectId}`;
    },
    [projectsCatalogSorted]
  );

  const contactNameById = useCallback(
    (contactId: number | null | undefined) => {
      if (contactId == null) return '—';
      return contactsCatalogSorted.find((contact) => contact.id === contactId)?.full_name || `#${contactId}`;
    },
    [contactsCatalogSorted]
  );

  const changeTaskSort = (
    column: 'created_at' | 'updated_at' | 'deadline_at' | 'title' | 'priority' | 'status' | 'assignee' | 'project' | 'contact'
  ) => {
    if (taskSortBy === column) {
      setTaskSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setTaskSortBy(column);
      setTaskSortDir('asc');
    }
  };

  const closeTaskActionMenu = () => {
    setTaskActionAnchorEl(null);
    setTaskActionTarget(null);
  };

  const openTaskActionMenu = (event: React.MouseEvent<HTMLElement>, task: OwnerWorkspaceTask) => {
    event.stopPropagation();
    setTaskActionAnchorEl(event.currentTarget);
    setTaskActionTarget(task);
  };

  const runTaskAction = (handler: (task: OwnerWorkspaceTask) => void | Promise<void>) => {
    if (!taskActionTarget) return;
    const task = taskActionTarget;
    closeTaskActionMenu();
    void handler(task);
  };

  const renderTaskActionButton = (task: OwnerWorkspaceTask) => (
    <IconButton size="small" aria-label="Действия задачи" onClick={(event) => openTaskActionMenu(event, task)}>
      <MoreVertIcon fontSize="small" />
    </IconButton>
  );

  type TaskCardOpts = {
    selectable?: boolean;
    selected?: boolean;
    onToggleSelect?: () => void;
    draggable?: boolean;
  };

  const renderTaskCard = (t: OwnerWorkspaceTask, opts?: TaskCardOpts) => {
    const compact = taskViewMode === 'kanban' || taskViewMode === 'calendar';
    return (
      <Card
        key={t.id}
        draggable={Boolean(opts?.draggable)}
        onDragStart={(e) => {
          if (!opts?.draggable) return;
          e.dataTransfer.setData('text/plain', String(t.id));
          e.dataTransfer.effectAllowed = 'move';
        }}
        sx={{
          borderLeft: isTaskOverdue(t) ? '4px solid' : undefined,
          borderColor: isTaskOverdue(t) ? 'error.main' : undefined,
          mb: taskViewMode === 'kanban' ? 1 : 0,
          cursor: opts?.draggable ? 'grab' : undefined,
        }}
      >
        <CardContent sx={{ py: compact ? 1.5 : 2, '&:last-child': { pb: compact ? 1.5 : 2 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', gap: 1, minWidth: 0, flex: 1 }}>
              {opts?.selectable && (
                <Checkbox
                  size="small"
                  checked={Boolean(opts.selected)}
                  onChange={() => opts.onToggleSelect?.()}
                  onClick={(e) => e.stopPropagation()}
                  sx={{ py: 0, alignSelf: 'flex-start' }}
                />
              )}
              <Box sx={{ cursor: 'pointer', minWidth: 0 }} onClick={() => openTaskDialog(t)}>
                <Typography variant={compact ? 'body2' : 'subtitle1'}>{t.title}</Typography>
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                  <Chip size="small" label={statusLabels[t.status] || t.status} sx={taskStatusChipSx(t.status)} />
                  <Chip
                    size="small"
                    label={priorityLabels[t.priority] || t.priority}
                    color={t.priority === 'critical' ? 'error' : t.priority === 'high' ? 'warning' : t.priority === 'medium' ? 'primary' : 'default'}
                    variant={t.priority === 'low' ? 'outlined' : 'filled'}
                  />
                  {t.assignee_id != null && (
                    <Chip size="small" variant="outlined" label={userName(t.assignee_id)} />
                  )}
                  {t.deadline_at && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={formatTaskDateTime(t.deadline_at)}
                      color={isTaskOverdue(t) ? 'error' : 'default'}
                    />
                  )}
                  {isTaskOverdue(t) && <Chip size="small" color="error" label={taskOverdueLabel(t)} />}
                  {t.project_id && <Chip size="small" label={`Проект: ${projectDisplayName(t.project_id)}`} variant="outlined" />}
                  {t.contact_id && <Chip size="small" label={`Контакт: ${contactNameById(t.contact_id)}`} variant="outlined" />}
                  {(t.tags || []).slice(0, 4).map((tag, ti) => (
                    <Chip key={`${t.id}-tag-${ti}`} size="small" variant="outlined" color="primary" label={tag} />
                  ))}
                  {!compact && t.updated_at && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`Обн. ${formatTaskDateTime(t.updated_at)}`}
                    />
                  )}
                </Stack>
              </Box>
            </Box>
            <Stack direction="row" spacing={0.5} alignItems="center">
              {t.status !== 'completed' && t.status !== 'cancelled' && (
                <Tooltip title="Завершить">
                  <span>
                    <IconButton
                      size="small"
                      color="success"
                      disabled={!canCompleteTaskActionUi(t)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => setCompleteDialogTask(t)}
                    >
                      <CheckIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
              {renderTaskActionButton(t)}
            </Stack>
          </Box>
        </CardContent>
      </Card>
    );
  };

  const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  return (
    <Layout>
      <Box
        sx={{
          '--task-ink': '#111827',
          '--task-graphite': '#475569',
          '--task-porcelain': '#F6F7F4',
          '--task-paper': '#FFFFFF',
          '--task-cobalt': '#4F46E5',
          '--task-moss': '#2F7D57',
          '--task-amber': '#C47A1B',
          '--task-rosewood': '#9F3A4A',
          '--task-line': '#E3E7DE',
          mb: { xs: 2, md: 3 },
          p: { xs: 2, sm: 2.5, md: 3 },
          border: '1px solid var(--task-line)',
          borderRadius: { xs: 3, md: 4 },
          color: 'var(--task-ink)',
          background:
            'linear-gradient(135deg, rgba(246,247,244,0.98) 0%, rgba(255,255,255,0.96) 48%, rgba(238,242,232,0.98) 100%)',
          boxShadow: '0 24px 70px rgba(17, 24, 39, 0.08)',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: '"Manrope", system-ui, sans-serif',
          animation: 'taskDockIn 420ms ease-out both',
          '@keyframes taskDockIn': {
            from: { opacity: 0, transform: 'translateY(10px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: '0 auto auto 0',
            width: '100%',
            height: 5,
            background:
              digest && digest.overdue_count > 0
                ? 'linear-gradient(90deg, var(--task-rosewood), var(--task-amber), var(--task-cobalt))'
                : 'linear-gradient(90deg, var(--task-moss), var(--task-cobalt))',
          },
        }}
      >
        <Stack spacing={{ xs: 2, md: 2.5 }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ lg: 'flex-start' }}>
            <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
              <Typography
                variant="overline"
                sx={{
                  color: 'var(--task-cobalt)',
                  fontWeight: 800,
                  letterSpacing: 0,
                  lineHeight: 1.2,
                }}
              >
                Операционный центр
              </Typography>
              <Typography
                component="h1"
                sx={{
                  mt: 0.5,
                  fontFamily: '"Fraunces", Georgia, serif',
                  fontSize: 'clamp(2.25rem, 7vw, 4.75rem)',
                  fontWeight: 760,
                  letterSpacing: 0,
                  lineHeight: 0.92,
                }}
              >
                Таск трекер
              </Typography>
              <Typography
                sx={{
                  mt: 1.25,
                  maxWidth: 780,
                  color: 'var(--task-graphite)',
                  fontSize: 'clamp(1rem, 2.4vw, 1.18rem)',
                  lineHeight: 1.45,
                }}
              >
                Сегодня: проекты, контакты, задачи, дедлайны и коммуникации.
              </Typography>
            </Box>
            <Stack
              direction={{ xs: 'row', sm: 'row' }}
              spacing={1}
              sx={{
                flex: { lg: '0 0 auto' },
                width: { xs: '100%', sm: 'auto' },
                justifyContent: { xs: 'stretch', sm: 'flex-start' },
              }}
            >
              <Button
                variant="contained"
                startIcon={<SearchIcon />}
                onClick={() => {
                  setSearchOpen(true);
                  setSearchQuery('');
                  setSearchResults(null);
                }}
                sx={{
                  minHeight: 44,
                  px: 2.25,
                  flex: { xs: 1, sm: '0 0 auto' },
                  borderRadius: 2,
                  bgcolor: 'var(--task-ink)',
                  color: 'var(--task-paper)',
                  fontWeight: 800,
                  boxShadow: '0 14px 30px rgba(17, 24, 39, 0.18)',
                  '&:hover': { bgcolor: '#020617', transform: 'translateY(-1px)' },
                  transition: 'transform 160ms ease, background-color 160ms ease',
                }}
              >
                Поиск
              </Button>
              <IconButton
                aria-label="Уведомления по дедлайнам"
                onClick={(e) => {
                  setNotifAnchor(e.currentTarget);
                  void loadNotifications(80);
                }}
                sx={{
                  minWidth: 44,
                  minHeight: 44,
                  border: '1px solid var(--task-line)',
                  borderRadius: 2,
                  bgcolor: 'var(--task-paper)',
                  color: 'var(--task-ink)',
                  boxShadow: '0 10px 24px rgba(17, 24, 39, 0.08)',
                  '&:hover': { bgcolor: '#F9FAF7', transform: 'translateY(-1px)' },
                  transition: 'transform 160ms ease, background-color 160ms ease',
                }}
              >
                <Badge
                  color="error"
                  badgeContent={notifEnvelope?.unread_count || 0}
                  max={99}
                  invisible={!notifEnvelope || notifEnvelope.unread_count < 1}
                >
                  <NotificationsIcon />
                </Badge>
              </IconButton>
            </Stack>
          </Stack>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(5, minmax(0, 1fr))',
              },
              gap: 1,
            }}
          >
            {[
              { label: 'Доступ', value: isWorkspaceFullAccess ? 'Полный' : 'Ограниченный', tone: isWorkspaceFullAccess ? 'var(--task-moss)' : 'var(--task-amber)' },
              { label: 'Роль', value: currentWorkspaceRoleLabel, tone: 'var(--task-cobalt)' },
              { label: 'Проекты', value: projects.length, tone: 'var(--task-ink)' },
              { label: 'Контакты', value: contacts.length, tone: 'var(--task-ink)' },
              { label: 'Задачи', value: taskListTotal, tone: 'var(--task-ink)' },
            ].map((item) => (
              <Box
                key={item.label}
                sx={{
                  minHeight: 82,
                  p: 1.5,
                  borderRadius: 2,
                  border: '1px solid rgba(227, 231, 222, 0.9)',
                  bgcolor: 'rgba(255,255,255,0.76)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <Typography sx={{ color: 'var(--task-graphite)', fontSize: 12, fontWeight: 800 }}>
                  {item.label}
                </Typography>
                <Typography sx={{ color: item.tone, fontSize: 'clamp(1.08rem, 2.6vw, 1.5rem)', fontWeight: 800, lineHeight: 1.05 }}>
                  {item.value}
                </Typography>
              </Box>
            ))}
          </Box>

          <Stack direction={{ xs: 'column', xl: 'row' }} spacing={1.25} alignItems={{ xl: 'center' }}>
            <ToggleButtonGroup
              size="small"
              value={digestScope}
              exclusive
              onChange={(_, v) => {
                if (v != null) setDigestScope(v);
              }}
              sx={{
                bgcolor: 'rgba(255,255,255,0.78)',
                border: '1px solid var(--task-line)',
                borderRadius: 2,
                p: 0.35,
                alignSelf: { xs: 'stretch', sm: 'flex-start' },
                '& .MuiToggleButton-root': {
                  minHeight: 44,
                  px: 2,
                  border: 0,
                  borderRadius: 1.5,
                  color: 'var(--task-graphite)',
                  fontWeight: 800,
                  flex: { xs: 1, sm: '0 0 auto' },
                },
                '& .Mui-selected': {
                  bgcolor: 'var(--task-cobalt) !important',
                  color: 'var(--task-paper) !important',
                  boxShadow: '0 8px 18px rgba(79, 70, 229, 0.22)',
                },
              }}
            >
              <ToggleButton value="all">Все</ToggleButton>
              <ToggleButton value="mine">Мои</ToggleButton>
            </ToggleButtonGroup>
            <TextField
              select
              size="small"
              label="Проект"
              sx={{
                minWidth: { xs: '100%', md: 260 },
                '& .MuiOutlinedInput-root': { minHeight: 44, bgcolor: 'rgba(255,255,255,0.78)', borderRadius: 2 },
              }}
              value={digestProjectFilter === '' ? '' : String(digestProjectFilter)}
              onChange={(e) => {
                const v = e.target.value;
                setDigestProjectFilter(v === '' ? '' : Number(v));
              }}
            >
              <MenuItem value="">Все проекты</MenuItem>
              {projectsCatalogSorted.map((p) => (
                <MenuItem key={p.id} value={String(p.id)}>
                  {p.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Горизонт"
              sx={{
                minWidth: { xs: '100%', sm: 150 },
                '& .MuiOutlinedInput-root': { minHeight: 44, bgcolor: 'rgba(255,255,255,0.78)', borderRadius: 2 },
              }}
              value={String(digestDueHours)}
              onChange={(e) => setDigestDueHours(Number(e.target.value))}
            >
              <MenuItem value="24">24 ч</MenuItem>
              <MenuItem value="48">48 ч</MenuItem>
              <MenuItem value="72">72 ч</MenuItem>
              <MenuItem value="168">7 дней</MenuItem>
            </TextField>
            {digest && digest.overdue_count > 0 && (
              <Button
                variant="outlined"
                onClick={() => {
                  handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_TASKS);
                  setTaskOverdueOnly(true);
                  setTaskActiveOnly(true);
                }}
                sx={{
                  minHeight: 44,
                  borderRadius: 2,
                  borderColor: 'rgba(159,58,74,0.5)',
                  color: 'var(--task-rosewood)',
                  fontWeight: 800,
                  bgcolor: 'rgba(159,58,74,0.06)',
                }}
              >
                Просрочено: {digest.overdue_count}
              </Button>
            )}
          </Stack>

          {(isLimitedWorkspaceUser || (digest && (digest.overdue_tasks.length > 0 || digest.due_soon_tasks.length > 0))) && (
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              {isLimitedWorkspaceUser && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={currentWorkspaceAccessSummary[0] || 'Ограниченный доступ по проектам'}
                  sx={{ bgcolor: 'rgba(255,255,255,0.68)' }}
                />
              )}
              {digest?.overdue_tasks.slice(0, 4).map((t) => (
                <Chip
                  key={`overdue-${t.id}`}
                  size="small"
                  variant="outlined"
                  label={`#${t.id} ${t.title.slice(0, 26)}${t.title.length > 26 ? '…' : ''}`}
                  onClick={() => void openSearchHitTask(t.id)}
                  sx={{
                    cursor: 'pointer',
                    minHeight: 32,
                    borderColor: 'rgba(159,58,74,0.36)',
                    color: 'var(--task-rosewood)',
                    bgcolor: 'rgba(255,255,255,0.74)',
                    fontWeight: 700,
                  }}
                />
              ))}
              {digest?.due_soon_tasks.slice(0, 4).map((t) => (
                <Chip
                  key={`soon-${t.id}`}
                  size="small"
                  variant="outlined"
                  label={`Скоро: #${t.id} ${t.title.slice(0, 24)}${t.title.length > 24 ? '…' : ''}`}
                  onClick={() => void openSearchHitTask(t.id)}
                  sx={{
                    cursor: 'pointer',
                    minHeight: 32,
                    borderColor: 'rgba(196,122,27,0.36)',
                    color: 'var(--task-amber)',
                    bgcolor: 'rgba(255,255,255,0.74)',
                    fontWeight: 700,
                  }}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </Box>
      {webPushBrowserSupported && webPushStatus?.configured && !webPushConnected && webPushPermission !== 'denied' && (
        <Box
          sx={{
            border: '1px solid rgba(79,70,229,0.3)',
            mb: { xs: 2, md: 3 },
            p: 2,
            borderRadius: 3,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1.5,
            justifyContent: 'space-between',
            bgcolor: 'rgba(79,70,229,0.06)',
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
            <NotificationsIcon color="primary" />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Включить push-уведомления на этом устройстве
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Напоминания о задачах и дедлайнах будут приходить сюда, даже если это приложение свёрнуто.
              </Typography>
            </Box>
          </Stack>
          <Button
            variant="contained"
            disabled={webPushBusy || settingsSaving}
            onClick={() => void enablePushOneTap()}
            sx={{ flexShrink: 0 }}
          >
            {webPushBusy || settingsSaving ? 'Подключаем…' : 'Включить уведомления'}
          </Button>
        </Box>
      )}
      <Menu
        anchorEl={notifAnchor}
        open={Boolean(notifAnchor)}
        onClose={() => setNotifAnchor(null)}
        PaperProps={{ sx: { maxWidth: 420, maxHeight: 480 } }}
      >
        {(notifEnvelope?.items || []).length === 0 ? (
          <MenuItem disabled>Нет уведомлений</MenuItem>
        ) : (
          (notifEnvelope?.items || []).map((n) => (
            <MenuItem
              key={n.id}
              dense
              onClick={() => {
                void (async () => {
                  try {
                    if (!n.read_at) {
                      await ownerWorkspaceApi.markNotificationRead(n.id);
                    }
                    setNotifAnchor(null);
                    void loadNotifications(80);
                    if (n.task_id != null) {
                      await openSearchHitTask(n.task_id);
                    } else if (n.contact_id != null) {
                      await openNotificationComms(n.contact_id);
                    }
                  } catch (err: unknown) {
                    setError(extractApiError(err, 'Не удалось обработать уведомление'));
                  }
                })();
              }}
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Chip
                      size="small"
                      label={notificationLabels[n.kind] || n.kind}
                      sx={{ height: 22, '& .MuiChip-label': { px: 0.75, fontSize: 11 } }}
                    />
                    <Typography component="span" variant="body2" fontWeight={n.read_at ? 400 : 600}>
                      {n.title}
                    </Typography>
                  </Stack>
                }
                secondary={
                  <>
                    {n.body}
                    {n.read_at ? '' : ' · непрочитано'}
                  </>
                }
                secondaryTypographyProps={{ variant: 'caption' }}
              />
            </MenuItem>
          ))
        )}
      </Menu>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {maxSyncResult && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMaxSyncResult(null)}>
          {maxSyncResult}
        </Alert>
      )}
      {repeatTaskNotice && (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          onClose={() => setRepeatTaskNotice(null)}
          action={
            <Button
              size="small"
              color="inherit"
              onClick={() => { void openTaskDialog(repeatTaskNotice); setRepeatTaskNotice(null); }}
            >
              Открыть
            </Button>
          }
        >
          Создана повторная задача: <strong>{repeatTaskNotice.title}</strong>
        </Alert>
      )}
      <Box
        sx={{
          mb: 2.5,
          overflowX: 'auto',
          pb: 0.5,
          '&::-webkit-scrollbar': { height: 6 },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(71,85,105,0.28)', borderRadius: 999 },
        }}
      >
        <Tabs
          value={tab}
          onChange={handleWorkspaceTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 52,
            px: 0.5,
            border: '1px solid #E3E7DE',
            borderRadius: 3,
            bgcolor: 'rgba(255,255,255,0.82)',
            boxShadow: '0 12px 30px rgba(17,24,39,0.05)',
            '& .MuiTabs-indicator': {
              height: 4,
              borderRadius: 999,
              bgcolor: '#4F46E5',
            },
            '& .MuiTab-root': {
              minHeight: 52,
              minWidth: { xs: 132, sm: 148 },
              px: 1.75,
              color: '#64748B',
              fontFamily: '"Manrope", system-ui, sans-serif',
              fontSize: '0.95rem',
              fontWeight: 800,
              letterSpacing: 0,
              textTransform: 'none',
            },
            '& .Mui-selected': {
              color: '#111827 !important',
            },
          }}
        >
          <Tab value={OW_TAB_PROJECTS} label={`Проекты (${projects.length})`} />
          <Tab value={OW_TAB_CONTACTS} label={`Контакты (${contacts.length})`} />
          <Tab value={OW_TAB_TASKS} label={`Задачи (${taskListTotal})`} />
          <Tab value={OW_TAB_MEETINGS} label={`Встречи (${meetingsCount})`} />
          <Tab value={OW_TAB_REPORTS} label="Отчёты" />
          <Tab value={OW_TAB_COMMS} label={commsUnreadTotal > 0 ? `Коммуникации (${commsUnreadTotal})` : 'Коммуникации'} />
          <Tab value={OW_TAB_HISTORY} label="История" />
          {(effectiveRole === 'seo_manager' || effectiveRole === 'owner' || effectiveRole === 'admin') && (
            <Tab value={OW_TAB_SITE} label="Сайт" />
          )}
        </Tabs>
      </Box>

      {tab === OW_TAB_PROJECTS && (
        <Suspense fallback={<OwnerWorkspaceDialogsFallback />}>
          <OwnerWorkspaceProjectsTab
            projects={projects}
            projectsCatalog={projectsCatalog}
            topOverdueProjects={topOverdueProjects}
            projectStatusLabels={projectStatusLabels}
            enabledProjectStatuses={enabledProjectStatuses}
            projectListStatus={projectListStatus}
            projectListSearchInput={projectListSearchInput}
            projectListOwnerId={projectListOwnerId}
            projectListOverdueOnly={projectListOverdueOnly}
            projectName={projectName}
            loading={loading}
            loadError={error}
            canCreateProjectUi={canCreateProjectUi}
            isWorkspaceFullAccess={isWorkspaceFullAccess}
            userOptions={userOptions}
            userName={userName}
            onProjectListStatusChange={setProjectListStatus}
            onProjectListSearchInputChange={setProjectListSearchInput}
            onProjectListOwnerIdChange={setProjectListOwnerId}
            onProjectListOverdueOnlyChange={setProjectListOverdueOnly}
            onProjectNameChange={setProjectName}
            onCreateProject={createProject}
            onOpenProject={(project) => navigate(`/owner-workspace/projects/${project.id}`)}
            onEditProject={(project) => void openProjectDialog(project, { syncUrl: false })}
            onCreateTaskForProject={(project) => {
              setCreateTaskDialogProjectId(project.id);
              setCreateTaskDialogContactId(null);
              setCreateTaskDialogOpen(true);
            }}
            onArchiveProject={(project) => setArchiveProjectConfirm(project)}
            onDeleteProject={(project) => setArchiveProjectConfirm(project)}
            onRetryLoad={loadProjectsAndContacts}
            onOpenProjectOverdueTasks={(projectId) => drillDownToProjectTasks(projectId, { overdueOnly: true })}
          />
        </Suspense>
      )}


      {tab === OW_TAB_CONTACTS && (
        <Suspense fallback={<OwnerWorkspaceDialogsFallback />}>
          <OwnerWorkspaceContactsTab
            contacts={contacts}
            contactsCatalog={contactsCatalog}
            projectsCatalogSorted={projectsCatalogSorted}
            contactListTagOptions={contactListTagOptions}
            contactListSearchInput={contactListSearchInput}
            contactListProjectId={contactListProjectId}
            contactListTag={contactListTag}
            contactListActiveTasksOnly={contactListActiveTasksOnly}
            contactName={contactName}
            contactPhone={contactPhone}
            newContactProjectId={newContactProjectId}
            loading={loading}
            loadError={error}
            canCreateContactUi={canCreateContactUi}
            isWorkspaceFullAccess={isWorkspaceFullAccess}
            userOptions={userOptions}
            userName={userName}
            onContactListSearchInputChange={setContactListSearchInput}
            onContactListProjectIdChange={setContactListProjectId}
            onContactListTagChange={setContactListTag}
            onContactListActiveTasksOnlyChange={setContactListActiveTasksOnly}
            onContactNameChange={setContactName}
            onContactPhoneChange={setContactPhone}
            onNewContactProjectIdChange={setNewContactProjectId}
            onCreateContact={createContact}
            onCreateContactDraft={createContactDraft}
            onOpenContact={(contact) => void openContactDialog(contact)}
            onEditContact={(contact) => void openContactDialog(contact, { syncUrl: false })}
            onCreateTaskForContact={(contact) => {
              setCreateTaskDialogProjectId(null);
              setCreateTaskDialogContactId(contact.id);
              setCreateTaskDialogOpen(true);
            }}
            onAddCommentToContact={(contact) => void openContactDialog(contact, { syncUrl: false })}
            onOpenContactComms={openContactQuickComms}
            onOpenContactTasks={openContactQuickTasks}
            onDeleteContact={deleteContact}
            onBulkAddTag={bulkAddContactTag}
            onBulkDelete={bulkDeleteContacts}
            onRetryLoad={loadProjectsAndContacts}
          />
        </Suspense>
      )}


      {tab === OW_TAB_TASKS && (
        <Stack spacing={2}>
          {canCreateTaskUi && (
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} justifyContent="space-between">
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <AutoAwesomeIcon color="primary" />
                      <Typography variant="h6">AI трекер</Typography>
                      {aiTaskDraft?.provider && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={aiTaskDraft.provider === 'ranvik' ? 'Ranvik' : aiTaskDraft.provider === 'claude' ? 'Claude' : 'Локальный режим'}
                        />
                      )}
                    </Stack>
                    <TextField
                      select
                      size="small"
                      label="Категория"
                      value={aiTaskCategory}
                      onChange={(event) => setAiTaskCategory(event.target.value as AiTaskBreakdownCategory)}
                      sx={{ minWidth: { xs: '100%', md: 180 } }}
                    >
                      <MenuItem value="schools">Школы</MenuItem>
                      <MenuItem value="parents">Родители</MenuItem>
                      <MenuItem value="leads">Лиды</MenuItem>
                    </TextField>
                  </Stack>
                  <TextField
                    multiline
                    minRows={3}
                    value={aiTaskText}
                    onChange={(event) => setAiTaskText(event.target.value)}
                    placeholder="Например: подготовить запуск летнего интенсива, собрать расписание, проверить группы, написать родителям и проконтролировать оплаты"
                    fullWidth
                  />
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button
                      variant="contained"
                      startIcon={<AutoAwesomeIcon />}
                      disabled={!aiTaskText.trim() || aiTaskLoading}
                      onClick={buildAiTaskDraft}
                    >
                      {aiTaskLoading ? 'Разбираю...' : 'Разложить'}
                    </Button>
                    {aiTaskDraft && (
                      <Button
                        variant="outlined"
                        disabled={aiTaskCreating || aiTaskDraft.subtasks.every((subtask) => !subtask.text.trim())}
                        onClick={createOwnerWorkspaceTaskFromAiDraft}
                      >
                        {aiTaskCreating ? 'Создаю...' : 'Создать задачу'}
                      </Button>
                    )}
                  </Stack>
                  {aiTaskDraft && (
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                        <Typography variant="subtitle1" fontWeight={700}>{aiTaskDraft.title}</Typography>
                        <Chip size="small" label={AI_TASK_CATEGORY_LABELS[aiTaskDraft.category]} />
                        <Chip
                          size="small"
                          color={aiTaskDraft.priority === 'high' ? 'warning' : aiTaskDraft.priority === 'low' ? 'default' : 'primary'}
                          label={DEFAULT_PRIORITY_LABELS[aiTaskPriorityToOwnerPriority(aiTaskDraft.priority)]}
                        />
                      </Stack>
                      <Stack spacing={1}>
                        {aiTaskDraft.subtasks.map((subtask, index) => (
                          <TextField
                            key={index}
                            size="small"
                            value={subtask.text}
                            onChange={(event) =>
                              setAiTaskDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      subtasks: prev.subtasks.map((item, itemIndex) =>
                                        itemIndex === index ? { ...item, text: event.target.value } : item,
                                      ),
                                    }
                                  : prev,
                              )
                            }
                            InputProps={{ startAdornment: <Typography color="text.secondary" sx={{ mr: 1 }}>{index + 1}.</Typography> }}
                            fullWidth
                          />
                        ))}
                      </Stack>
                    </Box>
                  )}
                </Stack>
              </CardContent>
            </Card>
          )}
          {/* Компактный тулбар: вид + быстрые фильтры + переключатели панелей */}
          <Card>
            <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
              <Stack spacing={1.25}>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={1}
                  justifyContent="space-between"
                  alignItems={{ xs: 'stretch', md: 'center' }}
                >
                  <ToggleButtonGroup
                    size="small"
                    value={taskViewMode}
                    exclusive
                    onChange={(_, value) => value && setTaskViewMode(value)}
                  >
                    <ToggleButton value="list">Таблица</ToggleButton>
                    <ToggleButton value="kanban">Канбан</ToggleButton>
                    <ToggleButton value="calendar">Календарь</ToggleButton>
                    <ToggleButton value="gantt">Гант</ToggleButton>
                  </ToggleButtonGroup>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {canCreateTaskUi && (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={() => setCreateTaskDialogOpen(true)}
                      >
                        Задача
                      </Button>
                    )}
                    <Button
                      size="small"
                      variant={showFiltersPanel ? 'contained' : 'outlined'}
                      startIcon={
                        <Badge color="primary" variant="dot" invisible={activeTaskFilterCount === 0}>
                          <FilterListIcon />
                        </Badge>
                      }
                      onClick={() => setShowFiltersPanel((v) => {
                        const next = !v;
                        localStorage.setItem('ow_tasks_panel_filters', next ? '1' : '0');
                        return next;
                      })}
                    >
                      Фильтры{activeTaskFilterCount > 0 ? ` · ${activeTaskFilterCount}` : ''}
                    </Button>
                    <Button
                      size="small"
                      variant={showAnalyticsPanel ? 'contained' : 'outlined'}
                      startIcon={<InsightsIcon />}
                      onClick={() => setShowAnalyticsPanel((v) => {
                        const next = !v;
                        localStorage.setItem('ow_tasks_panel_analytics', next ? '1' : '0');
                        return next;
                      })}
                    >
                      Аналитика
                    </Button>
                  </Stack>
                </Stack>
                {/* Быстрые фильтры по статусу + поиск — всегда видимы */}
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                  {taskStatusCounts != null && (
                    <Stack direction="row" flexWrap="wrap" spacing={0.75} useFlexGap sx={{ flex: 1 }}>
                      <Chip
                        size="small"
                        color={taskStatusFilter === '' ? 'primary' : 'default'}
                        variant={taskStatusFilter === '' ? 'filled' : 'outlined'}
                        label={`Все · ${taskStatusCounts.total}`}
                        onClick={() => {
                          setTaskStatusFilter('');
                          void loadTasksFiltered({ statusFilter: '' });
                        }}
                      />
                      {enabledStatuses.map((s) => {
                        const n = taskStatusCounts.by_status[s] ?? 0;
                        return (
                          <Chip
                            key={s}
                            size="small"
                            color={taskStatusFilter === s ? 'primary' : 'default'}
                            variant={taskStatusFilter === s ? 'filled' : 'outlined'}
                            label={`${statusLabels[s] ?? s} · ${n}`}
                            onClick={() => {
                              const next = taskStatusFilter === s ? '' : s;
                              setTaskStatusFilter(next);
                              void loadTasksFiltered({ statusFilter: next });
                            }}
                          />
                        );
                      })}
                    </Stack>
                  )}
                  <TextField
                    size="small"
                    placeholder="Поиск задачи…"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    onBlur={() => loadTasksFiltered()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void loadTasksFiltered();
                    }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" />
                        </InputAdornment>
                      ),
                    }}
                    sx={{ minWidth: { xs: '100%', md: 260 } }}
                  />
                </Stack>
                {taskViewMode !== 'list' && taskListTotal > OWNER_WS_TASKS_FETCH_CAP && (
                  <Alert severity="warning" sx={{ py: 0 }}>
                    Загружено не более {OWNER_WS_TASKS_FETCH_CAP} задач при текущих фильтрах (всего: {taskListTotal}).
                    Уточните фильтры или вернитесь в режим «Список».
                  </Alert>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Collapse in={showFiltersPanel} unmountOnExit>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                Фильтры
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Поиск"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    onBlur={() => loadTasksFiltered()}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Статус"
                    value={taskStatusFilter}
                    onChange={(e) => setTaskStatusFilter(e.target.value)}
                  >
                    <MenuItem value="">Все</MenuItem>
                    {enabledStatuses.map((k) => (
                      <MenuItem key={k} value={k}>
                        {statusLabels[k] ?? k}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Приоритет"
                    value={taskPriorityFilter}
                    onChange={(e) => setTaskPriorityFilter(e.target.value)}
                  >
                    <MenuItem value="">Все</MenuItem>
                    {enabledPriorities.map((k) => (
                      <MenuItem key={k} value={k}>
                        {priorityLabels[k] ?? k}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Autocomplete
                    size="small"
                    options={projectsCatalogSorted}
                    getOptionLabel={(o) => o.name}
                    value={projectsCatalogSorted.find((p) => p.id === taskProjectFilter) || null}
                    onChange={(_, v) => setTaskProjectFilter(v ? v.id : '')}
                    renderOption={(props, o) => (
                      <li {...props} key={o.id}>
                        <span style={{ flex: 1 }}>{o.name}</span>
                        <span style={{ fontSize: '0.7rem', color: o.parent_project_id ? '#9c27b0' : '#1976d2', background: o.parent_project_id ? '#f3e5f5' : '#e3f2fd', borderRadius: 4, padding: '1px 6px', marginLeft: 8, whiteSpace: 'nowrap' }}>
                          {o.parent_project_id ? 'Подпроект' : 'Проект'}
                        </span>
                      </li>
                    )}
                    renderInput={(params) => <TextField {...params} label="Проект" />}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <Autocomplete
                    size="small"
                    options={contactsCatalogSorted}
                    getOptionLabel={(o) => `${o.full_name}`}
                    value={contactsCatalogSorted.find((c) => c.id === taskContactFilter) || null}
                    onChange={(_, v) => setTaskContactFilter(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="Контакт" />}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <Autocomplete
                    size="small"
                    options={userOptions}
                    getOptionLabel={(o) => o.full_name}
                    value={userOptions.find((u) => u.id === taskAssigneeFilter) || null}
                    onChange={(_, v) => setTaskAssigneeFilter(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="Исполнитель" />}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    fullWidth
                    size="small"
                    type="datetime-local"
                    label="Дедлайн от"
                    value={taskDeadlineFrom}
                    onChange={(e) => setTaskDeadlineFrom(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    fullWidth
                    size="small"
                    type="datetime-local"
                    label="Дедлайн до"
                    value={taskDeadlineTo}
                    onChange={(e) => setTaskDeadlineTo(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Сортировка"
                    value={taskSortBy}
                    onChange={(e) =>
                      setTaskSortBy(e.target.value as 'created_at' | 'updated_at' | 'deadline_at' | 'title' | 'priority' | 'status' | 'assignee' | 'project' | 'contact')
                    }
                  >
                    <MenuItem value="created_at">По дате создания</MenuItem>
                    <MenuItem value="updated_at">По обновлению</MenuItem>
                    <MenuItem value="deadline_at">По дедлайну</MenuItem>
                    <MenuItem value="priority">По приоритету</MenuItem>
                    <MenuItem value="title">По названию</MenuItem>
                    <MenuItem value="status">По статусу</MenuItem>
                    <MenuItem value="assignee">По исполнителю</MenuItem>
                    <MenuItem value="project">По проекту</MenuItem>
                    <MenuItem value="contact">По контакту</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Порядок"
                    value={taskSortDir}
                    onChange={(e) => setTaskSortDir(e.target.value as 'asc' | 'desc')}
                  >
                    <MenuItem value="desc">По убыванию</MenuItem>
                    <MenuItem value="asc">По возрастанию</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <FormControlLabel
                      control={<Checkbox checked={taskOverdueOnly} onChange={(e) => setTaskOverdueOnly(e.target.checked)} />}
                      label="Только просроченные"
                    />
                    <FormControlLabel
                      control={<Checkbox checked={taskActiveOnly} onChange={(e) => setTaskActiveOnly(e.target.checked)} />}
                      label="Только активные"
                    />
                    <Button size="small" variant="outlined" onClick={() => loadTasksFiltered()}>
                      Применить
                    </Button>
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
          </Collapse>

          <Collapse in={showAnalyticsPanel} unmountOnExit>
            <Suspense fallback={<OwnerWorkspaceDialogsFallback />}>
              <Stack spacing={2}>
                <OwnerWorkspaceTaskInsightsSection
                  tasksAnalytics={tasksAnalytics}
                  taskStatusCounts={taskStatusCounts}
                  assigneeAnalyticsRows={assigneeAnalyticsRows}
                  assigneeAnalyticsSummary={assigneeAnalyticsSummary}
                  assigneeAttentionRows={assigneeAttentionRows}
                  taskViewMode={taskViewMode}
                  taskListTotal={taskListTotal}
                  taskFetchCap={OWNER_WS_TASKS_FETCH_CAP}
                  hideViewControls
                  onTaskViewModeChange={setTaskViewMode}
                  onDrillDownToAssigneeTasks={drillDownToAssigneeTasks}
                />
              </Stack>
            </Suspense>
          </Collapse>


          {taskViewMode === 'list' && (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} flexWrap="wrap">
              <FormControlLabel
                control={
                  <Checkbox
                    checked={tasks.length > 0 && selectedTaskIds.length === tasks.length}
                    indeterminate={selectedTaskIds.length > 0 && selectedTaskIds.length < tasks.length}
                    onChange={() => {
                      if (selectedTaskIds.length === tasks.length) setSelectedTaskIds([]);
                      else setSelectedTaskIds(tasks.map((x) => x.id));
                    }}
                  />
                }
                label="Все на странице"
              />
              <Typography variant="body2">{selectedTaskIds.length} выбрано</Typography>
              <TextField
                select
                size="small"
                label="Статус"
                sx={{ minWidth: 160 }}
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
              >
                <MenuItem value="">Не менять</MenuItem>
                {enabledStatuses.map((s) => (
                  <MenuItem key={s} value={s}>
                    {statusLabels[s]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="Исполнитель"
                sx={{ minWidth: 200 }}
                value={bulkAssigneeMode}
                onChange={(e) => setBulkAssigneeMode(e.target.value as 'skip' | 'set' | 'clear')}
              >
                <MenuItem value="skip">Не менять</MenuItem>
                <MenuItem value="set">Назначить…</MenuItem>
                <MenuItem value="clear">Снять исполнителя</MenuItem>
              </TextField>
              {bulkAssigneeMode === 'set' && (
                <Autocomplete
                  size="small"
                  sx={{ minWidth: 220 }}
                  options={userOptions}
                  getOptionLabel={(o) => o.full_name}
                  value={userOptions.find((u) => u.id === bulkAssigneeUserId) || null}
                  onChange={(_, v) => setBulkAssigneeUserId(v ? v.id : '')}
                  renderInput={(params) => <TextField {...params} label="Кому" />}
                />
              )}
              <TextField
                select
                size="small"
                label="Приоритет"
                sx={{ minWidth: 160 }}
                value={bulkPriority}
                onChange={(e) => setBulkPriority(e.target.value)}
              >
                <MenuItem value="">Не менять</MenuItem>
                {enabledPriorities.map((p) => (
                  <MenuItem key={p} value={p}>
                    {priorityLabels[p]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                type="datetime-local"
                label="Дедлайн"
                value={bulkDeadline}
                onChange={(e) => setBulkDeadline(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 190 }}
              />
              <Button variant="contained" disabled={selectedTaskIds.length === 0 || !canBulkUpdateTasksUi} onClick={applyBulkTaskUpdate}>
                Применить к выбранным
              </Button>
              <Button
                color="error"
                variant="outlined"
                disabled={selectedTaskIds.length === 0 || !isWorkspaceFullAccess}
                onClick={() => setBulkDeleteTaskConfirmOpen(true)}
              >
                Удалить
              </Button>
            </Stack>
          )}

          {taskViewMode === 'list' ? (
            <Stack spacing={1}>
              <TableContainer component={Card} variant="outlined" sx={{ display: { xs: 'none', sm: 'block' }, overflow: 'hidden' }}>
                <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
                  <colgroup>
                    <col style={{ width: 48 }} />
                    <col />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 95 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 76 }} />
                  </colgroup>
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={tasks.length > 0 && selectedTaskIds.length === tasks.length}
                          indeterminate={selectedTaskIds.length > 0 && selectedTaskIds.length < tasks.length}
                          onChange={() => {
                            if (selectedTaskIds.length === tasks.length) setSelectedTaskIds([]);
                            else setSelectedTaskIds(tasks.map((x) => x.id));
                          }}
                        />
                      </TableCell>
                      {[
                        ['title', 'Задача'],
                        ['status', 'Статус'],
                        ['priority', 'Приоритет'],
                        ['assignee', 'Исполнитель'],
                        ['project', 'Проект'],
                        ['contact', 'Контакт'],
                        ['deadline_at', 'Дедлайн'],
                        ['updated_at', 'Обновлено'],
                      ].map(([key, label]) => (
                        <TableCell key={key} sx={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          <TableSortLabel
                            active={taskSortBy === key}
                            direction={taskSortBy === key ? taskSortDir : 'asc'}
                            onClick={() =>
                              changeTaskSort(
                                key as 'created_at' | 'updated_at' | 'deadline_at' | 'title' | 'priority' | 'status' | 'assignee' | 'project' | 'contact'
                              )
                            }
                          >
                            {label}
                          </TableSortLabel>
                        </TableCell>
                      ))}
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>Действия</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tasks.map((t) => {
                      const overdue = isTaskOverdue(t);
                      const checklist = parseChecklistFromTask(t.checklist);
                      const hasChecklist = checklist.length > 0;
                      const isExpanded = expandedTaskIds.has(t.id);
                      const toggleExpand = () => setExpandedTaskIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
                        return next;
                      });
                      return (
                        <React.Fragment key={t.id}>
                          <TableRow
                            hover
                            selected={selectedTaskIds.includes(t.id)}
                            onDoubleClick={() => void openTaskDialog(t)}
                            sx={{ borderLeft: overdue ? '4px solid' : undefined, borderLeftColor: overdue ? 'error.main' : undefined }}
                          >
                            <TableCell padding="checkbox">
                              <Checkbox
                                checked={selectedTaskIds.includes(t.id)}
                                onChange={() => {
                                  setSelectedTaskIds((prev) =>
                                    prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                                  );
                                }}
                              />
                            </TableCell>
                            <TableCell sx={{ overflow: 'hidden' }}>
                              <Stack direction="row" alignItems="flex-start" spacing={0.5} sx={{ minWidth: 0 }}>
                                {hasChecklist && (
                                  <Tooltip title={isExpanded ? 'Скрыть подзадачи' : 'Показать подзадачи'}>
                                    <IconButton size="small" sx={{ flexShrink: 0, mt: '-2px' }} onClick={(e) => { e.stopPropagation(); toggleExpand(); }}>
                                      {isExpanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                                    </IconButton>
                                  </Tooltip>
                                )}
                                <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                                  <Typography variant="body2" fontWeight={700} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.title}>{t.title}</Typography>
                                  {hasChecklist && (
                                    <Typography variant="caption" color="text.secondary">
                                      {checklist.filter((c) => c.done).length}/{checklist.length} подзадач
                                    </Typography>
                                  )}
                                  {overdue && <Chip size="small" color="error" label={taskOverdueLabel(t)} sx={{ mt: 0.5 }} />}
                                </Box>
                              </Stack>
                            </TableCell>
                            <TableCell sx={{ overflow: 'hidden' }}><Chip size="small" label={statusLabels[t.status] || t.status} sx={taskStatusChipSx(t.status)} /></TableCell>
                            <TableCell sx={{ overflow: 'hidden' }}>
                              <Chip
                                size="small"
                                label={priorityLabels[t.priority] || t.priority}
                                color={t.priority === 'critical' ? 'error' : t.priority === 'high' ? 'warning' : t.priority === 'medium' ? 'primary' : 'default'}
                                variant={t.priority === 'low' ? 'outlined' : 'filled'}
                              />
                            </TableCell>
                            <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={userName(t.assignee_id) || undefined}>{userName(t.assignee_id)}</TableCell>
                            <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={projectDisplayName(t.project_id) || undefined}>{projectDisplayName(t.project_id)}</TableCell>
                            <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={contactNameById(t.contact_id) || undefined}>{contactNameById(t.contact_id)}</TableCell>
                            <TableCell sx={{ overflow: 'hidden', whiteSpace: 'nowrap', color: overdue ? 'error.main' : undefined, fontWeight: overdue ? 700 : undefined }}>
                              {formatTaskDateTime(t.deadline_at)}
                            </TableCell>
                            <TableCell sx={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>{formatTaskDateTime(t.updated_at)}</TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                {t.status !== 'completed' && t.status !== 'cancelled' && (
                                  <Tooltip title="Завершить">
                                    <span>
                                      <IconButton size="small" color="success" disabled={!canCompleteTaskActionUi(t)} onClick={() => setCompleteDialogTask(t)}>
                                        <CheckIcon fontSize="small" />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                )}
                                {renderTaskActionButton(t)}
                              </Stack>
                            </TableCell>
                          </TableRow>
                          {hasChecklist && isExpanded && checklist.map((item, idx) => (
                            <TableRow key={`${t.id}-chk-${idx}`} sx={{ bgcolor: 'action.hover' }}>
                              <TableCell padding="checkbox" />
                              <TableCell>
                                <Stack direction="row" alignItems="center" spacing={1} sx={{ pl: 4 }}>
                                  <Checkbox
                                    size="small"
                                    checked={item.done}
                                    sx={{ p: 0 }}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={() => {
                                      const updatedChecklist = checklist.map((c, i) =>
                                        i === idx ? { ...c, done: !c.done } : c
                                      );
                                      const payload = updatedChecklist.map(({ text, done }) => ({ text, done }));
                                      void ownerWorkspaceApi.updateTask(t.id, { checklist: payload }).then((updated) => {
                                        setTasks((prev) => prev.map((x) => x.id === updated.id ? updated : x));
                                      });
                                    }}
                                  />
                                  <Typography
                                    variant="body2"
                                    sx={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'text.disabled' : 'text.primary' }}
                                  >
                                    {item.text}
                                  </Typography>
                                </Stack>
                              </TableCell>
                              <TableCell colSpan={8} />
                            </TableRow>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <Stack spacing={1} sx={{ display: { xs: 'flex', sm: 'none' } }}>
                {tasks.map((t) =>
                  renderTaskCard(t, {
                    selectable: true,
                    selected: selectedTaskIds.includes(t.id),
                    onToggleSelect: () => {
                      setSelectedTaskIds((prev) =>
                        prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                      );
                    },
                  })
                )}
              </Stack>
              {tasks.length === 0 && !loading && (
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" gutterBottom>
                      {activeTaskFilterCount > 0 || taskStatusFilter ? 'Задачи не найдены' : 'Задач пока нет'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {activeTaskFilterCount > 0 || taskStatusFilter
                        ? 'Попробуйте изменить фильтры или поисковый запрос'
                        : 'Создайте первую задачу, чтобы начать работу'}
                    </Typography>
                    {canCreateTaskUi && !(activeTaskFilterCount > 0 || taskStatusFilter) && (
                      <Button sx={{ mt: 1 }} variant="contained" startIcon={<AddIcon />} onClick={() => setCreateTaskDialogOpen(true)}>
                        Создать задачу
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
              <TablePagination
                component="div"
                count={taskListTotal}
                page={taskListPage}
                onPageChange={(_, newPage) => setTaskListPage(newPage)}
                rowsPerPage={taskListRowsPerPage}
                onRowsPerPageChange={(e) => {
                  setTaskListRowsPerPage(parseInt(e.target.value, 10));
                  setTaskListPage(0);
                }}
                rowsPerPageOptions={[25, 50, 100]}
                labelRowsPerPage="На странице:"
                labelDisplayedRows={({ from, to, count }) => `${from}–${to} из ${count !== -1 ? count : `более ${to}`}`}
              />
            </Stack>
          ) : taskViewMode === 'gantt' ? (
            <Suspense fallback={<OwnerWorkspaceDialogsFallback />}>
              <OwnerWorkspaceGanttSection
                tasks={tasks}
                onOpenTask={openTaskDialog}
                userOptions={userOptions}
                projects={projectsCatalog}
              />
            </Suspense>
          ) : (
            <Suspense fallback={<OwnerWorkspaceDialogsFallback />}>
              <OwnerWorkspaceTaskBoardCalendarSection
                taskViewMode={taskViewMode as 'kanban' | 'calendar'}
                tasks={tasks}
                kanbanColumns={KANBAN_COLUMNS}
                coerceTaskStatus={coerceTaskStatus}
                renderTaskCard={renderTaskCard}
                onKanbanDrop={handleKanbanDrop}
                calendarMonth={calendarMonth}
                onCalendarMonthChange={setCalendarMonth}
                tasksByDeadlineDay={tasksByDeadlineDay}
                onOpenTask={openTaskDialog}
                weekdaysShort={WEEKDAYS_SHORT}
              />
            </Suspense>
          )}
        </Stack>
      )}

      <Menu anchorEl={taskActionAnchorEl} open={Boolean(taskActionAnchorEl)} onClose={closeTaskActionMenu}>
        <MenuItem onClick={() => runTaskAction(openTaskDialog)}>
          <OpenInNewIcon fontSize="small" sx={{ mr: 1 }} />Открыть задачу
        </MenuItem>
        <MenuItem onClick={() => runTaskAction(openTaskDialog)}>
          <AssignmentIcon fontSize="small" sx={{ mr: 1 }} />Редактировать
        </MenuItem>
        <MenuItem
          disabled={!taskActionTarget || taskActionTarget.status === 'completed' || taskActionTarget.status === 'cancelled' || !canCompleteTaskActionUi(taskActionTarget)}
          onClick={() => runTaskAction((task) => setCompleteDialogTask(task))}
        >
          <CheckIcon fontSize="small" sx={{ mr: 1 }} />Завершить
        </MenuItem>
        <MenuItem onClick={() => runTaskAction(openTaskDialog)}>Изменить статус</MenuItem>
        <MenuItem onClick={() => runTaskAction(openTaskDialog)}>Назначить исполнителя</MenuItem>
        <MenuItem onClick={() => runTaskAction(openTaskDialog)}>Изменить дедлайн</MenuItem>
        <Divider />
        <MenuItem
          sx={{ color: 'error.main' }}
          disabled={!isWorkspaceFullAccess}
          onClick={() => runTaskAction((task) => setDeleteTaskConfirm(task))}
        >
          <DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />Удалить
        </MenuItem>
      </Menu>

      <Dialog open={bulkDeleteTaskConfirmOpen} onClose={() => setBulkDeleteTaskConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить выбранные задачи?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Будет удалено задач: {selectedTaskIds.length}.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteTaskConfirmOpen(false)}>Отмена</Button>
          <Button color="error" variant="contained" disabled={!isWorkspaceFullAccess} onClick={() => void bulkDeleteTasks()}>
            Удалить
          </Button>
        </DialogActions>
      </Dialog>

      {tab === OW_TAB_MEETINGS && (
        <Suspense fallback={<OwnerWorkspaceDialogsFallback />}>
          <OwnerWorkspaceMeetingsTab
            projects={projectsCatalog}
            contacts={contactsCatalog}
            users={userOptions}
            canCreate={isWorkspaceFullAccess}
            onCountChange={setMeetingsCount}
          />
        </Suspense>
      )}

      {tab === OW_TAB_REPORTS && (
        <Stack spacing={2}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Stack spacing={1}>
                <Typography variant="h6">Отчёты owner-workspace</Typography>
                <Typography variant="body2" color="text.secondary">
                  Выделенный reporting surface над текущей зоной видимости пользователя. Данные здесь не заменяют рабочие вкладки,
                  а собирают основные аналитические срезы в одном месте.
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          {(tasksAnalytics != null || taskStatusCounts != null) && (
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2">Сводка по задачам</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {taskStatusCounts != null && (
                      <>
                        <Chip size="small" label={`Новые: ${taskStatusCounts.by_status.new ?? 0}`} />
                        <Chip size="small" label={`В работе: ${taskStatusCounts.by_status.in_progress ?? 0}`} />
                        <Chip size="small" label={`Ожидание: ${taskStatusCounts.by_status.waiting ?? 0}`} />
                        <Chip size="small" color="success" label={`Завершено: ${taskStatusCounts.by_status.completed ?? 0}`} />
                        <Chip size="small" variant="outlined" label={`Отменено: ${taskStatusCounts.by_status.cancelled ?? 0}`} />
                      </>
                    )}
                  </Stack>
                  {tasksAnalytics != null && (
                    <Grid container spacing={1.5}>
                      <Grid item xs={12} md={4}>
                        <Card variant="outlined">
                          <CardContent>
                            <Typography variant="body2" color="text.secondary">
                              Завершено за 7 дней
                            </Typography>
                            <Typography variant="h5">{tasksAnalytics.completed_last_7_days}</Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <Card variant="outlined">
                          <CardContent>
                            <Typography variant="body2" color="text.secondary">
                              Завершено за 30 дней
                            </Typography>
                            <Typography variant="h5">{tasksAnalytics.completed_last_30_days}</Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <Card variant="outlined">
                          <CardContent>
                            <Typography variant="body2" color="text.secondary">
                              Среднее время закрытия
                            </Typography>
                            <Typography variant="h5">
                              {tasksAnalytics.avg_days_to_complete_last_30 != null &&
                              tasksAnalytics.avg_days_to_complete_last_30 !== undefined
                                ? `${tasksAnalytics.avg_days_to_complete_last_30} дн.`
                                : '—'}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    </Grid>
                  )}
                </Stack>
              </CardContent>
            </Card>
          )}

          {assigneeAnalyticsRows.length > 0 && (
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack spacing={1.5}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                    <Typography variant="subtitle2">Нагрузка по сотрудникам</Typography>
                    <Chip size="small" label={`С активными задачами: ${assigneeAnalyticsSummary.assigneesWithActiveTasks}`} />
                    <Chip
                      size="small"
                      color={assigneeAnalyticsSummary.assigneesWithOverdueTasks > 0 ? 'warning' : 'default'}
                      label={`С просрочкой: ${assigneeAnalyticsSummary.assigneesWithOverdueTasks}`}
                    />
                    <Chip
                      size="small"
                      color={assigneeAnalyticsSummary.overloadedAssignees > 0 ? 'error' : 'default'}
                      variant={assigneeAnalyticsSummary.overloadedAssignees > 0 ? 'filled' : 'outlined'}
                      label={`Перегружены (5+ активных): ${assigneeAnalyticsSummary.overloadedAssignees}`}
                    />
                  </Stack>
                  {assigneeAttentionRows.length > 0 && (
                    <Alert severity="warning">
                      <Typography variant="subtitle2" gutterBottom>
                        Зона внимания
                      </Typography>
                      <Stack spacing={1}>
                        {assigneeAttentionRows.map((row) => (
                          <Stack
                            key={`report-attention-${row.assigneeId == null ? 'unassigned' : row.assigneeId}`}
                            direction={{ xs: 'column', sm: 'row' }}
                            spacing={1}
                            justifyContent="space-between"
                            alignItems={{ sm: 'center' }}
                          >
                            <Typography variant="body2">
                              <strong>{row.assigneeName}</strong>: активных {row.activeCount}, просроченных {row.overdueCount}
                            </Typography>
                            <Stack direction="row" spacing={1}>
                              <Button size="small" variant="outlined" onClick={() => drillDownToAssigneeTasks(row.assigneeId)}>
                                Все активные
                              </Button>
                              <Button
                                size="small"
                                variant="contained"
                                color="warning"
                                onClick={() => drillDownToAssigneeTasks(row.assigneeId, { overdueOnly: true })}
                              >
                                Только просрочка
                              </Button>
                            </Stack>
                          </Stack>
                        ))}
                      </Stack>
                    </Alert>
                  )}
                  <Grid container spacing={1.5}>
                    {assigneeAnalyticsRows.map((row) => (
                      <Grid key={`report-assignee-${row.assigneeId == null ? 'unassigned' : row.assigneeId}`} item xs={12} md={6} xl={4}>
                        <Card variant="outlined" sx={{ height: '100%' }}>
                          <CardContent>
                            <Stack spacing={1}>
                              <Typography variant="subtitle2">{row.assigneeName}</Typography>
                              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                <Chip size="small" label={`Активные: ${row.activeCount}`} />
                                <Chip size="small" color={row.overdueCount > 0 ? 'warning' : 'default'} label={`Просрочено: ${row.overdueCount}`} />
                                <Chip size="small" variant="outlined" label={`Завершено: ${row.completedCount}`} />
                              </Stack>
                              <Typography variant="body2" color="text.secondary">
                                Среднее время закрытия:{' '}
                                <strong>{row.avgDaysToComplete != null ? `${row.avgDaysToComplete} дн.` : '—'}</strong>
                              </Typography>
                              <Button size="small" variant="outlined" onClick={() => drillDownToAssigneeTasks(row.assigneeId)}>
                                Открыть задачи
                              </Button>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </Stack>
              </CardContent>
            </Card>
          )}

          {topOverdueProjects.length > 0 && (
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle2">Проекты с самой большой просрочкой</Typography>
                  <Grid container spacing={1.5}>
                    {topOverdueProjects.map((project) => (
                      <Grid key={`report-project-${project.id}`} item xs={12} md={6} xl={4}>
                        <Card variant="outlined" sx={{ height: '100%' }}>
                          <CardContent>
                            <Stack spacing={1}>
                              <Typography variant="subtitle2">{project.name}</Typography>
                              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                <Chip size="small" color="warning" label={`Просрочено: ${project.overdue_tasks_count ?? 0}`} />
                                <Chip size="small" label={`Активных: ${project.active_tasks_count ?? 0}`} />
                                <Chip size="small" variant="outlined" label={`Всего: ${project.total_tasks_count ?? 0}`} />
                              </Stack>
                              <Typography variant="body2" color="text.secondary">
                                Ответственный: <strong>{userName(project.owner_id)}</strong>
                              </Typography>
                              <Stack direction="row" spacing={1} flexWrap="wrap">
                                <Button size="small" variant="outlined" onClick={() => navigate(`/owner-workspace/projects/${project.id}`)}>
                                  Открыть проект
                                </Button>
                                <Button
                                  size="small"
                                  variant="contained"
                                  color="warning"
                                  onClick={() => drillDownToProjectTasks(project.id, { overdueOnly: true })}
                                >
                                  Просроченные задачи
                                </Button>
                              </Stack>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </Stack>
              </CardContent>
            </Card>
          )}
        </Stack>
      )}
      {tab === OW_TAB_COMMS && (
        <Suspense fallback={<OwnerWorkspaceDialogsFallback />}>
          <OwnerWorkspaceCommsTab
            conversations={conversations}
            conversationsFiltered={conversationsFiltered}
            commsDialogSearch={commsDialogSearch}
            commsThreadSearch={commsThreadSearch}
            commsContactId={commsContactId}
            commsMessages={commsMessages}
            commsMessagesFiltered={commsMessagesFiltered}
            commsSelectedContact={commsSelectedContact ?? undefined}
            canCreateTaskUi={canCreateTaskUi}
            canEditContactContentUi={canEditContactContentUi}
            onSyncMaxIntoWorkspace={syncMaxIntoWorkspace}
            onCommsDialogSearchChange={setCommsDialogSearch}
            onCommsThreadSearchChange={setCommsThreadSearch}
            onSelectCommsContact={selectCommsContact}
            onCreateTaskFromMessage={(message) => {
              setMessageTaskTitle(message.text.slice(0, 80) + (message.text.length > 80 ? '…' : ''));
              setMessageTaskDialog({ message });
            }}
            onLinkMessageToTask={openLinkToTaskDialog}
            onOpenCommsContactCard={openCommsContactCard}
          />
        </Suspense>
      )}

      {tab === OW_TAB_NOTIFICATIONS && (
        <Suspense fallback={<OwnerWorkspaceDialogsFallback />}>
          <OwnerWorkspaceNotificationsTab
            notifEnvelope={notifEnvelope}
            notificationLabels={notificationLabels}
            onRefresh={loadNotifications}
            onOpenTask={openSearchHitTask}
            onOpenComms={openNotificationComms}
            onMarkRead={markNotificationReadAndRefresh}
          />
        </Suspense>
      )}


      {tab === OW_TAB_SETTINGS && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Настройки таск трекера
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Параметры ниже сохраняются в вашем профиле и подставляются при следующем открытии Owner workspace. Изменения
              на других вкладках (вид задач, сводка) сразу видны в интерфейсе; нажмите «Сохранить», чтобы зафиксировать их
              как умолчания.
            </Typography>
            <Card variant="outlined" sx={{ mb: 3 }}>
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography variant="subtitle1">Матрица ролей и прав</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Ниже зафиксированы текущие роли owner workspace и их ожидаемый уровень доступа. Это опорная схема для продукта и
                    для дальнейшей доработки permission matrix.
                  </Typography>
                  <Grid container spacing={2}>
                    {OWNER_WS_ACCESS_MATRIX.map((item) => (
                      <Grid key={item.role} item xs={12} md={6}>
                        <Card variant="outlined" sx={{ height: '100%' }}>
                          <CardContent>
                            <Stack spacing={1}>
                              <Typography variant="subtitle2">{item.role}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {item.scope}
                              </Typography>
                              <Stack spacing={0.5}>
                                {item.capabilities.map((capability) => (
                                  <Typography key={capability} variant="body2" color="text.secondary">
                                    • {capability}
                                  </Typography>
                                ))}
                              </Stack>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </Stack>
              </CardContent>
            </Card>
            <Suspense fallback={<OwnerWorkspaceDialogsFallback />}>
              <OwnerWorkspaceSettingsConfigSection
                taskViewMode={taskViewMode}
                taskListRowsPerPage={taskListRowsPerPage}
                digestDueHours={digestDueHours}
                digestScope={digestScope}
                notifyEmailEnabled={notifyEmailEnabled}
                notifyWebPushEnabled={notifyWebPushEnabled}
                notifyTaskOverdue={notifyTaskOverdue}
                notifyTaskDueSoon={notifyTaskDueSoon}
                notifyTaskAssigned={notifyTaskAssigned}
                notifyTaskComment={notifyTaskComment}
                notifyTaskUpdated={notifyTaskUpdated}
                notifyContactIncomingMessage={notifyContactIncomingMessage}
                notifyTaskMention={notifyTaskMention}
                webPushStatus={webPushStatus}
                webPushBrowserSupported={webPushBrowserSupported}
                webPushPermission={webPushPermission}
                webPushConnected={webPushConnected}
                webPushBusy={webPushBusy}
                notificationLabels={notificationLabels}
                notificationConfigMap={notificationConfigMap}
                settingsSaving={settingsSaving}
                taskConfigDraft={isWorkspaceFullAccess ? taskConfigDraft : null}
                taskConfigSaving={taskConfigSaving}
                projectConfigDraft={isWorkspaceFullAccess ? projectConfigDraft : null}
                projectConfigSaving={projectConfigSaving}
                permissionMatrixRows={permissionMatrixRows}
                notificationConfigDraft={isWorkspaceFullAccess ? notificationConfigDraft : null}
                notificationConfigSaving={notificationConfigSaving}
                notificationDeliveryStats={notificationDeliveryStats}
                notificationDeliveryStatsLoading={notificationDeliveryStatsLoading}
                notificationDeliveryRetrying={notificationDeliveryRetrying}
                taskTagDictionaryDraft={taskTagDictionaryDraft}
                taskTagDictionarySaving={taskTagDictionarySaving}
                contactTagDictionaryDraft={contactTagDictionaryDraft}
                contactTagDictionarySaving={contactTagDictionarySaving}
                contactSourceDictionaryDraft={contactSourceDictionaryDraft}
                contactSourceDictionarySaving={contactSourceDictionarySaving}
                counterpartyRoleDictionaryDraft={counterpartyRoleDictionaryDraft}
                counterpartyRoleDictionarySaving={counterpartyRoleDictionarySaving}
                counterpartyIndustryDictionaryDraft={counterpartyIndustryDictionaryDraft}
                counterpartyIndustryDictionarySaving={counterpartyIndustryDictionarySaving}
                onTaskViewModeChange={setTaskViewMode}
                onTaskListRowsPerPageChange={setTaskListRowsPerPage}
                onDigestDueHoursChange={setDigestDueHours}
                onDigestScopeChange={setDigestScope}
                onNotifyEmailEnabledChange={setNotifyEmailEnabled}
                onNotifyWebPushEnabledChange={setNotifyWebPushEnabled}
                onNotifyTaskOverdueChange={setNotifyTaskOverdue}
                onNotifyTaskDueSoonChange={setNotifyTaskDueSoon}
                onNotifyTaskAssignedChange={setNotifyTaskAssigned}
                onNotifyTaskCommentChange={setNotifyTaskComment}
                onNotifyTaskUpdatedChange={setNotifyTaskUpdated}
                onNotifyContactIncomingMessageChange={setNotifyContactIncomingMessage}
                onNotifyTaskMentionChange={setNotifyTaskMention}
                onConnectWebPush={connectWebPush}
                onDisconnectWebPush={disconnectWebPush}
                onSaveWorkspaceSettings={saveWorkspaceSettings}
                onTaskStatusLabelChange={(index, value) =>
                  setTaskConfigDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          statuses: prev.statuses.map((current, currentIndex) =>
                            currentIndex === index ? { ...current, label: value } : current
                          ),
                        }
                      : prev
                  )
                }
                onTaskStatusEnabledChange={(index, value) =>
                  setTaskConfigDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          statuses: prev.statuses.map((current, currentIndex) =>
                            currentIndex === index ? { ...current, enabled: value } : current
                          ),
                        }
                      : prev
                  )
                }
                onTaskPriorityLabelChange={(index, value) =>
                  setTaskConfigDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          priorities: prev.priorities.map((current, currentIndex) =>
                            currentIndex === index ? { ...current, label: value } : current
                          ),
                        }
                      : prev
                  )
                }
                onTaskPriorityEnabledChange={(index, value) =>
                  setTaskConfigDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          priorities: prev.priorities.map((current, currentIndex) =>
                            currentIndex === index ? { ...current, enabled: value } : current
                          ),
                        }
                      : prev
                  )
                }
                onSaveWorkspaceTaskConfig={saveWorkspaceTaskConfig}
                onResetTaskConfig={() => taskConfig && setTaskConfigDraft(taskConfig)}
                onProjectStatusLabelChange={(index, value) =>
                  setProjectConfigDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          statuses: prev.statuses.map((current, currentIndex) =>
                            currentIndex === index ? { ...current, label: value } : current
                          ),
                        }
                      : prev
                  )
                }
                onProjectStatusEnabledChange={(index, value) =>
                  setProjectConfigDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          statuses: prev.statuses.map((current, currentIndex) =>
                            currentIndex === index ? { ...current, enabled: value } : current
                          ),
                        }
                      : prev
                  )
                }
                onSaveWorkspaceProjectConfig={saveWorkspaceProjectConfig}
                onResetProjectConfig={() => projectConfig && setProjectConfigDraft(projectConfig)}
                onNotificationConfigLabelChange={(index, value) =>
                  setNotificationConfigDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          items: prev.items.map((current, currentIndex) =>
                            currentIndex === index ? { ...current, label: value } : current
                          ),
                        }
                      : prev
                  )
                }
                onNotificationConfigEnabledChange={(index, value) =>
                  setNotificationConfigDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          items: prev.items.map((current, currentIndex) =>
                            currentIndex === index ? { ...current, enabled: value } : current
                          ),
                        }
                      : prev
                  )
                }
                onSaveWorkspaceNotificationConfig={saveWorkspaceNotificationConfig}
                onResetNotificationConfig={() => notificationConfig && setNotificationConfigDraft(notificationConfig)}
                onLoadNotificationDeliveryStats={loadNotificationDeliveryStats}
                onRetryNotificationDelivery={retryNotificationDelivery}
                onTaskTagDictionaryDraftChange={(items) => setTaskTagDictionaryDraft({ items })}
                onSaveWorkspaceTaskTagDictionary={saveWorkspaceTaskTagDictionary}
                onResetTaskTagDictionary={() => setTaskTagDictionaryDraft(taskTagDictionary)}
                onContactTagDictionaryDraftChange={(items) => setContactTagDictionaryDraft({ items })}
                onSaveWorkspaceContactTagDictionary={saveWorkspaceContactTagDictionary}
                onResetContactTagDictionary={() => setContactTagDictionaryDraft(contactTagDictionary)}
                onContactSourceDictionaryDraftChange={(items) => setContactSourceDictionaryDraft({ items })}
                onSaveWorkspaceContactSourceDictionary={saveWorkspaceContactSourceDictionary}
                onResetContactSourceDictionary={() => setContactSourceDictionaryDraft(contactSourceDictionary)}
                onCounterpartyRoleDictionaryDraftChange={(items) => setCounterpartyRoleDictionaryDraft({ items })}
                onSaveCounterpartyRoleDictionary={async () => {
                  setCounterpartyRoleDictionarySaving(true);
                  try {
                    const saved = await settingsApi.setOwnerWorkspaceCounterpartyRoles(counterpartyRoleDictionaryDraft);
                    setCounterpartyRoleDictionary(saved);
                    setCounterpartyRoleDictionaryDraft(saved);
                  } catch (e: unknown) { setError(extractApiError(e, 'Не удалось сохранить роли контрагентов')); }
                  finally { setCounterpartyRoleDictionarySaving(false); }
                }}
                onResetCounterpartyRoleDictionary={() => setCounterpartyRoleDictionaryDraft(counterpartyRoleDictionary)}
                onCounterpartyIndustryDictionaryDraftChange={(items) => setCounterpartyIndustryDictionaryDraft({ items })}
                onSaveCounterpartyIndustryDictionary={async () => {
                  setCounterpartyIndustryDictionarySaving(true);
                  try {
                    const saved = await settingsApi.setOwnerWorkspaceCounterpartyIndustries(counterpartyIndustryDictionaryDraft);
                    setCounterpartyIndustryDictionary(saved);
                    setCounterpartyIndustryDictionaryDraft(saved);
                  } catch (e: unknown) { setError(extractApiError(e, 'Не удалось сохранить отрасли')); }
                  finally { setCounterpartyIndustryDictionarySaving(false); }
                }}
                onResetCounterpartyIndustryDictionary={() => setCounterpartyIndustryDictionaryDraft(counterpartyIndustryDictionary)}
              />
            </Suspense>
            {isWorkspaceFullAccess && workspaceSettingsBundle && (
              <>
                <Divider sx={{ my: 3 }} />
                <Suspense fallback={<OwnerWorkspaceDialogsFallback />}>
                  <OwnerWorkspaceSettingsSnapshotsSection
                    workspaceSettingsBundle={workspaceSettingsBundle}
                    workspaceSettingsBundleSummary={workspaceSettingsBundleSummary}
                    settingsBundleLastExportMeta={settingsBundleLastExportMeta}
                    settingsSnapshots={settingsSnapshots}
                    filteredSettingsSnapshots={filteredSettingsSnapshots}
                    settingsSnapshotsChangedCount={settingsSnapshotsChangedCount}
                    settingsSnapshotSearch={settingsSnapshotSearch}
                    settingsSnapshotSort={settingsSnapshotSort}
                    settingsSnapshotOnlyChanged={settingsSnapshotOnlyChanged}
                    settingsSnapshotsLoading={settingsSnapshotsLoading}
                    settingsSnapshotDiffMap={settingsSnapshotDiffMap}
                    settingsSnapshotDuplicatingId={settingsSnapshotDuplicatingId}
                    settingsSnapshotApplyingId={settingsSnapshotApplyingId}
                    settingsSnapshotDeletingId={settingsSnapshotDeletingId}
                    onExportWorkspaceSettingsBundle={exportWorkspaceSettingsBundle}
                    onCopyWorkspaceSettingsBundle={copyWorkspaceSettingsBundle}
                    onOpenImportDialog={() => {
                      setSettingsBundleImportText('');
                      setSettingsBundleDialogOpen(true);
                    }}
                    onSettingsSnapshotSearchChange={setSettingsSnapshotSearch}
                    onSettingsSnapshotSortChange={setSettingsSnapshotSort}
                    onSettingsSnapshotOnlyChangedChange={setSettingsSnapshotOnlyChanged}
                    onLoadSettingsSnapshots={loadSettingsSnapshots}
                    onOpenCreateSnapshot={() => {
                      setSettingsSnapshotName('');
                      setSettingsSnapshotNote('');
                      setSettingsSnapshotCreateOpen(true);
                    }}
                    onOpenEditSnapshot={(snapshot) => {
                      setSettingsSnapshotEditingId(snapshot.id);
                      setSettingsSnapshotName(snapshot.name);
                      setSettingsSnapshotNote(snapshot.note || '');
                      setSettingsSnapshotEditOpen(true);
                    }}
                    onDuplicateSettingsSnapshot={duplicateSettingsSnapshot}
                    onPreviewSettingsSnapshot={setSettingsSnapshotPreview}
                    onCopySettingsSnapshot={copySettingsSnapshot}
                    onExportSettingsSnapshot={exportSettingsSnapshot}
                    onReviewAndApplySnapshot={(snapshot) => {
                      setSettingsSnapshotCreateSafetyBeforeApply(true);
                      setSettingsSnapshotCompareBaseId('__current__');
                      setSettingsSnapshotReview(snapshot);
                    }}
                    onConfirmDeleteSnapshot={setSettingsSnapshotDeleteConfirm}
                  />
                </Suspense>
              </>
            )}
            {isWorkspaceFullAccess && permissionPolicyDraft && (
              <Suspense fallback={<OwnerWorkspaceDialogsFallback />}>
                <OwnerWorkspacePermissionPolicySection
                  permissionPolicyDraft={permissionPolicyDraft}
                  permissionPolicy={permissionPolicy}
                  permissionPolicySaving={permissionPolicySaving}
                  onPermissionPolicyChange={(key, value) =>
                    setPermissionPolicyDraft((prev) => ({ ...prev, [key]: value }))
                  }
                  onSaveWorkspacePermissionPolicy={saveWorkspacePermissionPolicy}
                  onResetPermissionPolicy={() => setPermissionPolicyDraft(permissionPolicy)}
                />
              </Suspense>
            )}
          </CardContent>
        </Card>
      )}

      {tab === OW_TAB_HISTORY && (
        <Suspense fallback={<OwnerWorkspaceDialogsFallback />}>
          <OwnerWorkspaceHistoryTab
            historyEntityFilter={historyEntityFilter}
            historyActionFilter={historyActionFilter}
            historyEntityIdFilter={historyEntityIdFilter}
            historyAuthorFilter={historyAuthorFilter}
            historyCreatedFrom={historyCreatedFrom}
            historyCreatedTo={historyCreatedTo}
            historyLimit={historyLimit}
            historySortOrder={historySortOrder}
            historyActionOptions={historyActionOptions}
            userOptions={userOptions}
            historyLogs={historyLogs}
            historyStats={historyStats}
            historyStatsLoading={historyStatsLoading}
            historyStatsLoadedAt={historyStatsLoadedAt ?? ''}
            historyVisibleSummary={historyVisibleSummary}
            historyExpandedIds={historyExpandedIds}
            historyDayMax={historyDayMax}
            historyActiveFilterChips={historyActiveFilterChips}
            onHistoryEntityFilterChange={setHistoryEntityFilter}
            onHistoryActionFilterChange={setHistoryActionFilter}
            onHistoryEntityIdFilterChange={setHistoryEntityIdFilter}
            onHistoryAuthorFilterChange={setHistoryAuthorFilter}
            onHistoryCreatedFromChange={setHistoryCreatedFrom}
            onHistoryCreatedToChange={setHistoryCreatedTo}
            onHistoryLimitChange={setHistoryLimit}
            onHistorySortOrderChange={setHistorySortOrder}
            onApplyHistoryPreset={applyHistoryPreset}
            onResetHistoryFilters={resetHistoryFilters}
            onRefreshHistoryView={refreshHistoryView}
            onExpandAllVisibleHistoryEntries={expandAllVisibleHistoryEntries}
            onCollapseAllVisibleHistoryEntries={collapseAllVisibleHistoryEntries}
            onCopyHistoryLink={copyHistoryLink}
            onOpenHistoryLinkInNewTab={openHistoryLinkInNewTab}
            onCopyHistoryStatsSummary={copyHistoryStatsSummary}
            onCopyHistoryStatsJson={copyHistoryStatsJson}
            onExportHistoryCsv={exportHistoryCsv}
            onExportHistoryJson={exportHistoryJson}
            onExportHistoryStatsJson={exportHistoryStatsJson}
            onExportHistoryStatsCsv={exportHistoryStatsCsv}
            onApplyHistoryEntityQuickFilter={applyHistoryEntityQuickFilter}
            onApplyHistoryActionQuickFilter={applyHistoryActionQuickFilter}
            onApplyHistoryAuthorQuickFilter={applyHistoryAuthorQuickFilter}
            onApplyHistoryDayQuickFilter={applyHistoryDayQuickFilter}
            onClearHistoryFilterChip={clearHistoryFilterChip}
            onOpenHistoryEntity={openHistoryEntity}
            onApplyHistoryExactEntityQuickFilter={applyHistoryExactEntityQuickFilter}
            onToggleExpandedHistoryEntry={toggleExpandedHistoryEntry}
            ownerWsHistoryPrimaryLabel={ownerWsHistoryPrimaryLabel}
            ownerWsHistoryChangedFields={ownerWsHistoryChangedFields}
            ownerWsHistoryPayloadText={ownerWsHistoryPayloadText}
            userName={userName}
            historyStatsPercentLabel={historyStatsPercentLabel}
            historyEntityLabels={OWNER_WS_HISTORY_ENTITY_LABELS}
            historyActionLabels={OWNER_WS_HISTORY_ACTION_LABELS}
            historyLoading={historyLoading}
          />
        </Suspense>
      )}

      {tab === OW_TAB_SITE && (effectiveRole === 'seo_manager' || effectiveRole === 'owner' || effectiveRole === 'admin') && (
        <Suspense fallback={<OwnerWorkspaceDialogsFallback />}>
          <OwnerWorkspaceSiteTab />
        </Suspense>
      )}

      {loading && <Typography sx={{ mt: 2 }}>Загрузка…</Typography>}

      <Dialog open={Boolean(projectDialog)} onClose={closeProjectDialog} maxWidth="md" fullWidth disableEnforceFocus={createTaskDialogOpen}>
        <DialogTitle>Проект: {projectDialog?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Всего задач: {projectDialog?.total_tasks_count ?? 0} · Активных: {projectDialog?.active_tasks_count ?? 0} ·
              Завершённых: {projectDialog?.completed_tasks_count ?? 0} · Просрочено (активн.):{' '}
              {projectDialog?.overdue_tasks_count ?? 0}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Контакты: {projectDialog?.contacts_count ?? 0} · Подпроекты: {projectDialog?.subprojects_count ?? 0}
              {projectDialog?.start_at
                ? ` · Начало: ${new Date(projectDialog.start_at).toLocaleDateString('ru-RU')}`
                : ''}
              {projectDialog?.deadline_at
                ? ` · Дедлайн: ${new Date(projectDialog.deadline_at).toLocaleDateString('ru-RU')}`
                : ''}
              {projectDialog?.updated_at
                ? ` · Обновлён: ${new Date(projectDialog.updated_at).toLocaleString('ru-RU')}`
                : ''}
            </Typography>
            {projectDialog && (
              <Button
                size="small"
                variant="outlined"
                sx={{ alignSelf: 'flex-start' }}
                onClick={() => void copyWorkspaceEntityLink('project', projectDialog.id)}
              >
                Копировать ссылку
              </Button>
            )}
            {!canEditProjectDialogContent && !canEditProjectDialogMeta && (
              <Alert severity="info">
                Для вашей роли проект доступен только для просмотра. Изменение задач и привязок контактов отключено.
              </Alert>
            )}
            <Divider />
            <Typography variant="subtitle2">Карточка проекта</Typography>
            <TextField
                fullWidth
                label="Название"
                value={projectEditName}
                onChange={(e) => setProjectEditName(e.target.value)}
                disabled={!canEditProjectDialogMeta}
              />
            <TextField
              fullWidth
              label="Описание"
              multiline
                minRows={2}
                value={projectEditDescription}
                onChange={(e) => setProjectEditDescription(e.target.value)}
                disabled={!canEditProjectDialogMeta}
              />
              <TextField
                select
                fullWidth
                label="Статус"
                value={projectEditStatus}
                onChange={(e) => setProjectEditStatus(coerceProjectStatus(e.target.value))}
                disabled={!canArchiveProjectDialog && !isWorkspaceFullAccess && projectDialog?.owner_id !== user?.id}
              >
                {editProjectStatusOptions.map((status) => (
                  <MenuItem key={status} value={status}>
                    {projectStatusLabels[status] ?? status}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  fullWidth
                  label="Начало проекта"
                  type="date"
                  value={projectEditStartAt}
                  onChange={(e) => setProjectEditStartAt(e.target.value)}
                  disabled={!canEditProjectDialogMeta}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  fullWidth
                  label="Дедлайн"
                  type="date"
                  value={projectEditDeadlineAt}
                  onChange={(e) => setProjectEditDeadlineAt(e.target.value)}
                  disabled={!canEditProjectDialogMeta}
                  InputLabelProps={{ shrink: true }}
                />
              </Stack>
            {projectEditStatus === 'archived' && projectDialog?.status !== 'archived' && (
              <Alert severity="info">
                При сохранении откроется отдельное подтверждение архива с проверкой активных и просроченных задач.
              </Alert>
            )}
              <Button
                variant="contained"
                size="small"
                sx={{ alignSelf: 'flex-start' }}
                onClick={() => void saveProjectDetails()}
                disabled={!canEditProjectDialogMeta}
              >
                Сохранить карточку
              </Button>
            <Divider />
            <Typography variant="subtitle2">Ответственный (владелец проекта)</Typography>
            <Autocomplete
                options={userOptions}
                getOptionLabel={(o) => o.full_name}
                value={userOptions.find((u) => u.id === projectDialog?.owner_id) || null}
                disabled={!isWorkspaceFullAccess && projectDialog?.owner_id !== user?.id}
                onChange={(_, v) => void saveProjectOwner(v)}
                renderInput={(params) => <TextField {...params} label="Пользователь" size="small" />}
              />
            {projectParticipantAnalyticsRows.length > 0 && (
              <>
                <Typography variant="subtitle2">Нагрузка участников проекта</Typography>
                <Grid container spacing={1.5}>
                  {projectParticipantAnalyticsRows.map((row) => (
                    <Grid key={`project-analytics-${row.assigneeId == null ? 'unassigned' : row.assigneeId}`} item xs={12} md={6}>
                      <Card variant="outlined">
                        <CardContent>
                          <Stack spacing={1}>
                            <Typography variant="subtitle2">{row.assigneeName}</Typography>
                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                              <Chip size="small" label={`Активных: ${row.activeCount}`} />
                              <Chip size="small" color={row.overdueCount > 0 ? 'warning' : 'default'} label={`Просрочено: ${row.overdueCount}`} />
                              <Chip size="small" color="success" variant="outlined" label={`Завершено: ${row.completedCount}`} />
                            </Stack>
                            <Typography variant="body2" color="text.secondary">
                              Среднее время закрытия:{' '}
                              <strong>{row.avgDaysToComplete != null ? `${row.avgDaysToComplete} дн.` : '—'}</strong>
                            </Typography>
                            <Button
                              size="small"
                              variant="text"
                              sx={{ alignSelf: 'flex-start' }}
                              onClick={() => {
                                if (!projectDialog) return;
                                closeProjectDialog();
                                drillDownToAssigneeTasks(row.assigneeId, { projectId: projectDialog.id });
                              }}
                            >
                              Открыть задачи участника
                            </Button>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
                <Divider />
              </>
            )}
            <Typography variant="subtitle2">Задачи проекта</Typography>
            <Button
              variant="contained"
              size="small"
              sx={{ alignSelf: 'flex-start' }}
              disabled={!canCreateTaskUi || !canEditProjectDialogContent}
              onClick={() => {
                if (!projectDialog) return;
                setCreateTaskDialogProjectId(projectDialog.id);
                setCreateTaskDialogOpen(true);
              }}
            >
              Создать задачу в этом проекте
            </Button>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" alignItems={{ sm: 'center' }}>
              <TextField
                select
                label="Статус"
                size="small"
                sx={{ minWidth: 160 }}
                value={projectDialogTaskStatus}
                onChange={(e) => setProjectDialogTaskStatus(e.target.value)}
              >
                <MenuItem value="">Все</MenuItem>
                {enabledStatuses.map((st) => (
                  <MenuItem key={st} value={st}>
                    {statusLabels[st] || st}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Поиск по названию или №"
                size="small"
                sx={{ minWidth: 200, flex: 1 }}
                value={projectDialogTaskSearch}
                onChange={(e) => setProjectDialogTaskSearch(e.target.value)}
              />
            </Stack>
            <Stack spacing={0.5} sx={{ maxHeight: 260, overflow: 'auto' }}>
              {projectDialogTasks.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  Нет задач с привязкой к этому проекту.
                </Typography>
              ) : projectDialogTasksFiltered.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  Нет задач по текущим фильтрам (всего загружено: {projectDialogTasks.length}).
                </Typography>
              ) : (
                projectDialogTasksFiltered.slice(0, 80).map((t) => (
                  <Button
                    key={t.id}
                    size="small"
                    variant="text"
                    sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                    onClick={() => {
                      void openTaskDialog(t);
                      closeProjectDialog();
                    }}
                  >
                    #{t.id} · {t.title.length > 48 ? `${t.title.slice(0, 48)}…` : t.title} ({statusLabels[t.status] || t.status})
                  </Button>
                ))
              )}
            </Stack>
            <Divider />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  fullWidth
                    label="Название подпроекта"
                    value={subprojectName}
                    onChange={(e) => setSubprojectName(e.target.value)}
                    disabled={!canCreateSubprojectUi}
                  />
                 <Button variant="contained" onClick={createSubproject} disabled={!canCreateSubprojectUi}>
                    Создать подпроект
                  </Button>
              </Stack>
              {!canCreateSubprojectUi && (
                <Alert severity="info">
                  Создание подпроекта доступно владельцу workspace или роли с правом записи в этот проект, если это разрешено policy-моделью.
                </Alert>
              )}
              <Divider />
            <Typography variant="subtitle2">Дерево подпроектов</Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Перенос: владелец подпроекта или роль с полным доступом к модулю. Родитель можно выбрать среди видимых
              проектов; циклы блокируются на сервере.
            </Typography>
            {subprojectTreeRooted.length === 0 ? (
              <Typography variant="caption" color="text.secondary">
                Нет вложенных подпроектов. Создайте выше или перенесите сюда подпроект из другого проекта (сменив
                родителя на «{projectDialog?.name} (текущий проект)»).
              </Typography>
            ) : (
              <Stack
                spacing={0}
                sx={{
                  maxHeight: 320,
                  overflow: 'auto',
                  border: 1,
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 1,
                }}
              >
                {subprojectTreeRooted.map((node) => (
                  <OwnerWorkspaceSubprojectTreeRow
                    key={node.project.id}
                    node={node}
                    depth={0}
                    catalog={projectsCatalog}
                    contextRootId={projectDialog!.id}
                    isWorkspaceFullAccess={isWorkspaceFullAccess}
                    currentUserId={user?.id}
                    onApplied={refreshProjectDialogAfterHierarchyChange}
                    setError={setError}
                  />
                ))}
              </Stack>
            )}
            <Divider />
            <Autocomplete
              options={contactsCatalogSorted}
              getOptionLabel={(o) => `${o.full_name} · ${o.phone}`}
              value={linkContactId}
              onChange={(_, v) => setLinkContactId(v)}
              disabled={!canManageProjectContactsDialog}
              renderInput={(params) => <TextField {...params} label="Добавить контакт в проект" />}
            />
            <Button variant="outlined" onClick={linkContactToProject} disabled={!linkContactId || !canManageProjectContactsDialog}>
              Привязать контакт
            </Button>
            {projectDialogLinkedContacts.length > 0 && (
              <>
                <Typography variant="subtitle2">Контакты в проекте</Typography>
                <Stack spacing={0.5} sx={{ maxHeight: 200, overflow: 'auto' }}>
                  {projectDialogLinkedContacts.map((c) => (
                    <Box
                      key={c.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                        py: 0.5,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                      }}
                    >
                      <Typography variant="body2" sx={{ minWidth: 0 }}>
                        {c.full_name} · {c.phone}
                      </Typography>
                      <IconButton
                        size="small"
                        aria-label="Убрать контакт из проекта"
                        disabled={!canManageProjectContactsDialog}
                        onClick={() => requestRemoveContactFromProject(c.id)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>
              </>
            )}
            <Typography variant="subtitle2">Участники проекта</Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              <strong>Менеджер</strong> ведёт состав (добавляет/исключает участников, но не других менеджеров).
              Назначать менеджеров может <strong>владелец проекта</strong> или admin/owner портала.
            </Typography>
            <Stack spacing={0.75}>
              {(projectDialog?.participants || []).map((pid) => {
                const rawRole = projectDialog?.participant_roles?.[String(pid)];
                const role: OwnerWorkspaceProjectParticipantRole =
                  rawRole === 'manager' || rawRole === 'observer' ? rawRole : 'member';
                const canDel =
                  canManageProjectTeam &&
                  (isWorkspaceFullAccess ||
                    projectDialog?.owner_id === user?.id ||
                    role !== 'manager' ||
                    permissionPolicy.manager_can_remove_manager);
                const participantRoleOptions = allowedParticipantRoleOptions.some((item) => item.value === role)
                  ? allowedParticipantRoleOptions
                  : [...allowedParticipantRoleOptions, { value: role, label: OWNER_WS_PROJECT_PARTICIPANT_ROLE_LABELS[role] }];
                return (
                  <Stack key={pid} direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    <Chip
                      size="small"
                      label={`${userName(pid)} · ${OWNER_WS_PROJECT_PARTICIPANT_ROLE_LABELS[role]}`}
                      onDelete={canDel ? () => requestRemoveProjectParticipantUser(pid, role) : undefined}
                    />
                    {canChangeParticipantRoles ? (
                      <TextField
                        select
                        size="small"
                        label="Роль"
                        sx={{ minWidth: 170 }}
                        value={role}
                        onChange={(e) =>
                          void patchProjectParticipantRole(pid, e.target.value as OwnerWorkspaceProjectParticipantRole)
                        }
                      >
                        {participantRoleOptions.map((item) => (
                          <MenuItem key={item.value} value={item.value}>
                            {item.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    ) : null}
                  </Stack>
                );
              })}
            </Stack>
            {canManageProjectTeam && !canChangeParticipantRoles ? (
              <Alert severity="info">
                Права project manager на состав команды сейчас ограничены системной policy-моделью owner workspace.
              </Alert>
            ) : null}
            {canManageProjectTeam ? (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                <Autocomplete
                  sx={{ flex: 1 }}
                  options={userOptions.filter((u) => !(projectDialog?.participants || []).includes(u.id))}
                  getOptionLabel={(o) => o.full_name}
                  value={participantToAdd}
                  onChange={(_, v) => setParticipantToAdd(v)}
                  renderInput={(params) => <TextField {...params} label="Добавить участника" />}
                />
                {allowedParticipantRoleOptions.length > 1 ? (
                  <TextField
                    select
                    size="small"
                    label="Роль"
                    sx={{ minWidth: 160 }}
                    value={newParticipantRole}
                    onChange={(e) => setNewParticipantRole(e.target.value as OwnerWorkspaceProjectParticipantRole)}
                  >
                    {allowedParticipantRoleOptions.map((item) => (
                      <MenuItem key={item.value} value={item.value}>
                        {item.label}
                      </MenuItem>
                    ))}
                  </TextField>
                ) : null}
                <Button variant="outlined" onClick={addProjectParticipantUser} disabled={!participantToAdd}>
                  Добавить
                </Button>
              </Stack>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            {projectDialog?.status !== 'archived' && (
             <Button color="error" onClick={() => setArchiveProjectConfirm(projectDialog)} disabled={!canArchiveProjectDialog}>
                В архив
              </Button>
            )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={closeProjectDialog}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(archiveProjectConfirm)} onClose={() => setArchiveProjectConfirm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Архивировать проект?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            {(archiveProjectConfirm?.subprojects_count ?? 0) > 0 && (
              <Alert severity="warning">
                У проекта есть подпроекты ({archiveProjectConfirm!.subprojects_count}). Они останутся с привязкой к этому
                проекту как к родителю.
              </Alert>
            )}
            {(archiveProjectConfirm?.active_tasks_count ?? 0) > 0 && (
              <Alert severity="warning">
                Есть активные задачи: {archiveProjectConfirm!.active_tasks_count}. Статусы задач автоматически не
                меняются — проверьте вручную при необходимости.
              </Alert>
            )}
            {(archiveProjectConfirm?.overdue_tasks_count ?? 0) > 0 && (
              <Alert severity="warning">
                Среди активных задач есть просроченные: {archiveProjectConfirm!.overdue_tasks_count}.
              </Alert>
            )}
            <Typography variant="body2">
              Проект «{archiveProjectConfirm?.name}» будет переведён в статус «archived». Продолжить?
            </Typography>
            {archiveProjectSubprojectsPreview.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Подпроекты, которые останутся привязанными
                </Typography>
                <Stack spacing={0.75}>
                  {archiveProjectSubprojectsPreview.map((project) => (
                    <Stack
                      key={project.id}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                    >
                      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                        {'•'} {project.name}
                      </Typography>
                      <Button size="small" variant="outlined" onClick={() => reviewArchiveSubproject(project)}>
                        {'Открыть'}
                      </Button>
                    </Stack>
                  ))}
                  {(archiveProjectConfirm?.subprojects_count ?? 0) > archiveProjectSubprojectsPreview.length && (
                    <Typography variant="caption" color="text.secondary">
                      И ещё {archiveProjectConfirm!.subprojects_count - archiveProjectSubprojectsPreview.length}
                    </Typography>
                  )}
                </Stack>
              </Box>
            )}
            {archiveProjectActiveTasksPreview.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Примеры активных задач перед архивированием
                </Typography>
                <Stack spacing={0.75}>
                  {archiveProjectActiveTasksPreview.map((task) => (
                    <Stack
                      key={task.id}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                    >
                      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                        {'•'} #{task.id} {task.title}
                        {isTaskOverdue(task) ? ' · просрочена' : ''}
                      </Typography>
                      <Button size="small" variant="outlined" onClick={() => void reviewArchiveTask(task)}>
                        {'Открыть'}
                      </Button>
                    </Stack>
                  ))}
                  {(archiveProjectConfirm?.active_tasks_count ?? 0) > archiveProjectActiveTasksPreview.length && (
                    <Typography variant="caption" color="text.secondary">
                      И ещё {archiveProjectConfirm!.active_tasks_count - archiveProjectActiveTasksPreview.length}
                    </Typography>
                  )}
                </Stack>
              </Box>
            )}
            {(archiveProjectConfirm?.active_tasks_count ?? 0) > 0 && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="outlined" onClick={() => reviewArchiveProjectTasks(archiveProjectConfirm!.id)}>
                  Открыть активные задачи
                </Button>
                {(archiveProjectConfirm?.overdue_tasks_count ?? 0) > 0 && (
                  <Button
                    variant="outlined"
                    color="warning"
                    onClick={() => reviewArchiveProjectTasks(archiveProjectConfirm!.id, true)}
                  >
                    Открыть только просрочку
                  </Button>
                )}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveProjectConfirm(null)}>Отмена</Button>
           <Button color="error" variant="contained" onClick={() => void submitArchiveProject()} disabled={!canArchiveProjectDialog}>
              В архив
            </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteTaskConfirm)} onClose={() => setDeleteTaskConfirm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{'Удалить задачу?'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Alert severity="error">
              {'Задача будет удалена без восстановления из интерфейса.'}
            </Alert>
            <Typography variant="body2">
              {'Задача: '}
              <strong>{deleteTaskConfirm?.title || '—'}</strong>
            </Typography>
            <Stack spacing={0.75}>
              {deleteTaskSummary.map((item) => (
                <Typography key={item} variant="body2" color="text.secondary">
                  {'•'} {item}
                </Typography>
              ))}
            </Stack>
            {(deleteTaskProject || deleteTaskContact || deleteTaskConfirm?.previous_task_id) && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                {deleteTaskProject && (
                  <Button variant="outlined" onClick={reviewDeleteTaskProject}>
                    {'Открыть проект'}
                  </Button>
                )}
                {deleteTaskProject && (
                  <Button variant="outlined" onClick={reviewDeleteTaskProjectTasks}>
                    {'Открыть задачи проекта'}
                  </Button>
                )}
                {deleteTaskContact && (
                  <Button variant="outlined" onClick={reviewDeleteTaskContact}>
                    {'Открыть контакт'}
                  </Button>
                )}
                {deleteTaskContact && (
                  <Button variant="outlined" onClick={reviewDeleteTaskContactTasks}>
                    {'Открыть задачи контакта'}
                  </Button>
                )}
                {deleteTaskContact && (
                  <Button variant="outlined" onClick={() => void reviewDeleteTaskContactComms()}>
                    {'Открыть переписку'}
                  </Button>
                )}
                {deleteTaskConfirm?.previous_task_id != null && (
                  <Button variant="outlined" onClick={() => void reviewDeleteTaskPrevious()}>
                    {'Открыть предыдущую задачу'}
                  </Button>
                )}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTaskConfirm(null)}>{'Отмена'}</Button>
          <Button color="error" variant="contained" onClick={() => void submitDeleteTask()} disabled={!isWorkspaceFullAccess}>
            {'Удалить навсегда'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(unlinkContactConfirm)} onClose={() => setUnlinkContactConfirm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{'Убрать контакт из проекта?'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Typography variant="body2">
              {'Контакт '}
              <strong>{unlinkContactConfirm?.contactName || '—'}</strong>
              {' будет отвязан от проекта '}
              <strong>{unlinkContactConfirm?.projectName || '—'}</strong>
              {'.'}
            </Typography>
            <Alert severity="info">
              {'Карточка контакта в системе сохранится. Уберётся только привязка к этому проекту.'}
            </Alert>
            {(unlinkContactConfirm?.activeTaskCount ?? 0) > 0 && (
              <Alert severity="warning">
                {'У этой связки есть активные задачи: '}
                {unlinkContactConfirm!.activeTaskCount}
                {'. '}
                {'Проверьте, нужно ли сначала перенести их в другой проект.'}
              </Alert>
            )}
            {unlinkContactTaskPreview.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  {'Примеры активных задач по этой связке'}
                </Typography>
                <Stack spacing={0.75}>
                  {unlinkContactTaskPreview.map((task) => (
                    <Stack
                      key={task.id}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                    >
                      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                        {'•'} #{task.id} {task.title}
                        {isTaskOverdue(task) ? ' · просрочена' : ''}
                      </Typography>
                      <Button size="small" variant="outlined" onClick={() => void reviewUnlinkContactTask(task)}>
                        {'Открыть'}
                      </Button>
                    </Stack>
                  ))}
                  {(unlinkContactConfirm?.activeTaskCount ?? 0) > unlinkContactTaskPreview.length && (
                    <Typography variant="caption" color="text.secondary">
                      {'И ещё '} {(unlinkContactConfirm?.activeTaskCount ?? 0) - unlinkContactTaskPreview.length}
                    </Typography>
                  )}
                </Stack>
              </Box>
            )}
            {unlinkContactConfirm && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="outlined" onClick={reviewUnlinkContactProject}>
                  {'Открыть проект'}
                </Button>
                <Button variant="outlined" onClick={reviewUnlinkContactCard}>
                  {'Открыть контакт'}
                </Button>
                <Button variant="outlined" onClick={() => void reviewUnlinkContactComms()}>
                  {'Открыть переписку'}
                </Button>
                <Button variant="outlined" onClick={reviewUnlinkContactAllTasks}>
                  {'Открыть задачи контакта'}
                </Button>
                {(unlinkContactConfirm.activeTaskCount ?? 0) > 0 && (
                  <Button
                    variant="outlined"
                    onClick={() => reviewUnlinkContactTasks(unlinkContactConfirm.projectId, unlinkContactConfirm.contactId)}
                  >
                    {'Открыть активные задачи'}
                  </Button>
                )}
                {unlinkContactOverdueTaskCount > 0 && (
                  <Button
                    variant="outlined"
                    color="warning"
                    onClick={() => reviewUnlinkContactTasks(unlinkContactConfirm.projectId, unlinkContactConfirm.contactId, true)}
                  >
                    {'Открыть только просрочку'}
                  </Button>
                )}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnlinkContactConfirm(null)}>{'Отмена'}</Button>
          <Button color="warning" variant="contained" onClick={() => void submitUnlinkContactFromProject()}>
            {'Убрать из проекта'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(removeParticipantConfirm)} onClose={() => setRemoveParticipantConfirm(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{'Удалить участника из проекта?'}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Typography variant="body2">
              {'Участник '}
              <strong>{removeParticipantConfirm?.userName || '—'}</strong>
              {' будет убран из проекта '}
              <strong>{removeParticipantConfirm?.projectName || '—'}</strong>
              {'.'}
            </Typography>
            <Alert severity="info">
              {'Участник потеряет доступ к проекту и его контенту через owner-workspace.'}
            </Alert>
            {removeParticipantConfirm?.role === 'manager' && (
              <Alert severity="warning">
                {'Удаляется менеджер проекта. После этого он больше не сможет управлять составом команды.'}
              </Alert>
            )}
            {removeParticipantActiveTaskCount > 0 && (
              <Alert severity="warning">
                {'На участнике остаются активные задачи в этом проекте: '}
                {removeParticipantActiveTaskCount}
                {'. '}
                {'Проверьте, нужно ли сначала переназначить их.'}
              </Alert>
            )}
            {removeParticipantTaskPreview.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  {'Примеры активных задач участника'}
                </Typography>
                <Stack spacing={0.75}>
                  {removeParticipantTaskPreview.map((task) => (
                    <Stack
                      key={task.id}
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1}
                      alignItems={{ xs: 'flex-start', sm: 'center' }}
                    >
                      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                        {'•'} #{task.id} {task.title}
                        {isTaskOverdue(task) ? ' · просрочена' : ''}
                      </Typography>
                      <Button size="small" variant="outlined" onClick={() => void reviewParticipantTask(task)}>
                        {'Открыть'}
                      </Button>
                    </Stack>
                  ))}
                  {removeParticipantActiveTaskCount > removeParticipantTaskPreview.length && (
                    <Typography variant="caption" color="text.secondary">
                      {'И ещё '} {removeParticipantActiveTaskCount - removeParticipantTaskPreview.length}
                    </Typography>
                  )}
                </Stack>
              </Box>
            )}
            {removeParticipantConfirm && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="outlined" onClick={reviewRemoveParticipantProject}>
                  {'Открыть проект'}
                </Button>
                {removeParticipantActiveTaskCount > 0 && (
                <Button
                  variant="outlined"
                  onClick={() =>
                    reviewParticipantProjectTasks(removeParticipantConfirm.projectId, removeParticipantConfirm.userId)
                  }
                >
                  {'Открыть активные задачи'}
                </Button>
                )}
                {removeParticipantTaskPreview.some((task) => isTaskOverdue(task)) && (
                  <Button
                    variant="outlined"
                    color="warning"
                    onClick={() =>
                      reviewParticipantProjectTasks(removeParticipantConfirm.projectId, removeParticipantConfirm.userId, true)
                    }
                  >
                    {'Открыть только просрочку'}
                  </Button>
                )}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveParticipantConfirm(null)}>{'Отмена'}</Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => removeParticipantConfirm && void removeProjectParticipantUser(removeParticipantConfirm.userId)}
          >
            {'Удалить участника'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(contactDialog)} onClose={closeContactDialog} maxWidth="md" fullWidth disableEnforceFocus={createTaskDialogOpen}>
        <DialogTitle>{contactDialog?.full_name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {contactDialog && (
              <Button
                size="small"
                variant="outlined"
                sx={{ alignSelf: 'flex-start' }}
                onClick={() => void copyWorkspaceEntityLink('contact', contactDialog.id)}
              >
                Копировать ссылку
              </Button>
            )}
            {!canEditContactDialogContent && (
              <Alert severity="info">
                Этот контакт доступен только для просмотра. Изменение карточки, привязок, задач и сообщений отключено.
              </Alert>
            )}
            {canEditContactDialogContent && !canEditContactCardDialogContent && (
              <Alert severity="info">
                Для ограниченных ролей редактирование карточки контакта сейчас отключено policy-моделью.
              </Alert>
            )}
            <Typography variant="subtitle2">Карточка контакта</Typography>
            <TextField
              fullWidth
              label="ФИО"
              value={contactEditFullName}
              onChange={(e) => setContactEditFullName(e.target.value)}
              disabled={!canEditContactCardDialogContent}
            />
            <TextField
              fullWidth
              label="Телефон"
              value={contactEditPhone}
              onChange={(e) => setContactEditPhone(e.target.value)}
              disabled={!canEditContactCardDialogContent}
            />
            <TextField
              fullWidth
              label="Email"
              value={contactEditEmail}
              onChange={(e) => setContactEditEmail(e.target.value)}
              disabled={!canEditContactCardDialogContent}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                fullWidth
                label="Компания"
                value={contactEditCompany}
                onChange={(e) => setContactEditCompany(e.target.value)}
                disabled={!canEditContactCardDialogContent}
              />
              <TextField
                fullWidth
                label="Должность"
                value={contactEditPosition}
                onChange={(e) => setContactEditPosition(e.target.value)}
                disabled={!canEditContactCardDialogContent}
              />
            </Stack>
            <Autocomplete
              multiple
              freeSolo
              options={contactTagDictionary.items}
              value={contactEditTags}
              onChange={(_, v) => setContactEditTags(v.map(String))}
              disabled={!canEditContactCardDialogContent}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip variant="outlined" label={option} {...getTagProps({ index })} key={`${option}-${index}`} />
                ))
              }
              renderInput={(params) => (
                <TextField {...params} fullWidth label="Теги контакта" placeholder="Ввод и Enter" />
              )}
            />
            <TextField
              fullWidth
              label="Комментарий"
              multiline
              minRows={2}
              value={contactEditComment}
              onChange={(e) => setContactEditComment(e.target.value)}
              disabled={!canEditContactCardDialogContent}
            />
            <Autocomplete
              freeSolo
              options={contactSourceDictionary.items}
              value={contactEditSource}
              onChange={(_, value) => setContactEditSource(String(value || ''))}
              onInputChange={(_, value) => setContactEditSource(value)}
              disabled={!canEditContactCardDialogContent}
              renderInput={(params) => <TextField {...params} fullWidth label="Источник" />}
            />
            <Button
              variant="contained"
              onClick={() => void saveContactDetails()}
              sx={{ alignSelf: 'flex-start' }}
              disabled={!canEditContactCardDialogContent}
            >
              Сохранить карточку
            </Button>
            <Divider />
            <Typography variant="subtitle2">Проекты</Typography>
            {contactDialogLinkedProjects.length === 0 ? (
              <Typography variant="caption" color="text.secondary">
                Не привязан ни к одному проекту. Ниже можно добавить.
              </Typography>
            ) : (
              <Stack spacing={0.5} sx={{ maxHeight: 180, overflow: 'auto' }}>
                {contactDialogLinkedProjects.map((p) => (
                  <Box
                    key={p.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      py: 0.5,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2" sx={{ minWidth: 0 }}>
                      {p.name}
                    </Typography>
                    <IconButton
                      size="small"
                      aria-label="Убрать из проекта"
                      disabled={!canManageProjectContactsUi}
                      onClick={() => requestRemoveContactFromLinkedProject(p.id)}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Stack>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Autocomplete
                sx={{ flex: 1 }}
                options={projectsCatalogSorted}
                getOptionLabel={(o) => o.name}
                value={contactLinkProjectId}
                onChange={(_, v) => setContactLinkProjectId(v)}
                disabled={!canManageProjectContactsUi}
                renderInput={(params) => <TextField {...params} label="Добавить в проект" />}
              />
              <Button
                variant="contained"
                onClick={linkContactToSelectedProject}
                disabled={!contactLinkProjectId || !canManageProjectContactsUi}
              >
                Добавить
              </Button>
            </Stack>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2">Задачи по контакту</Typography>
              {canCreateTaskUi && canEditContactDialogContent && (
                <Button
                  size="small"
                  onClick={() => {
                    if (!contactDialog) return;
                    setCreateTaskDialogContactId(contactDialog.id);
                    setCreateTaskDialogOpen(true);
                  }}
                >
                  + Создать задачу
                </Button>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Активные: {contactDialogTasksActive.length} · завершённые / отменённые: {contactDialogTasksDone.length}
            </Typography>
            <Typography variant="caption" fontWeight={600}>
              Активные
            </Typography>
            <Stack spacing={0.5} sx={{ maxHeight: 180, overflow: 'auto' }}>
              {contactDialogTasksActive.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  Нет активных задач.
                </Typography>
              ) : (
                contactDialogTasksActive.slice(0, 50).map((t) => (
                  <Button
                    key={t.id}
                    size="small"
                    variant="text"
                    sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                    onClick={() => {
                      void openTaskDialog(t);
                      closeContactDialog();
                    }}
                  >
                    #{t.id} · {t.title.length > 48 ? `${t.title.slice(0, 48)}…` : t.title} ({statusLabels[t.status] || t.status})
                  </Button>
                ))
              )}
            </Stack>
            <Typography variant="caption" fontWeight={600}>
              Завершённые и отменённые
            </Typography>
            <Stack spacing={0.5} sx={{ maxHeight: 180, overflow: 'auto' }}>
              {contactDialogTasksDone.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  Нет завершённых или отменённых.
                </Typography>
              ) : (
                contactDialogTasksDone.slice(0, 50).map((t) => (
                  <Button
                    key={t.id}
                    size="small"
                    variant="text"
                    sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                    onClick={() => {
                      void openTaskDialog(t);
                      closeContactDialog();
                    }}
                  >
                    #{t.id} · {t.title.length > 48 ? `${t.title.slice(0, 48)}…` : t.title} ({statusLabels[t.status] || t.status})
                  </Button>
                ))
              )}
            </Stack>
            <Divider />
            <Typography variant="subtitle2">Переписка (ручной ввод для MVP)</Typography>
              <TextField
                fullWidth
                multiline
                minRows={2}
                label="Сообщение"
                value={newContactMessage}
                onChange={(e) => setNewContactMessage(e.target.value)}
                disabled={!canEditContactDialogContent || !canSendMessageUi}
              />
              {!canSendMessageUi && (
                <Alert severity="info">
                  Отправка исходящих сообщений для ограниченных ролей сейчас отключена policy-моделью.
                </Alert>
              )}
              <Button variant="outlined" onClick={sendContactMessage} disabled={!canEditContactDialogContent || !canSendMessageUi}>
                Сохранить как исходящее
              </Button>
            <TextField
              size="small"
              fullWidth
              placeholder="Поиск по тексту сообщений…"
              value={contactMessageSearch}
              onChange={(e) => setContactMessageSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
            />
            {contactMessageSearch.trim() && (
              <Typography variant="caption" color="text.secondary">
                Показано {contactMessagesFiltered.length} из {contactMessages.length}
              </Typography>
            )}
            <Stack spacing={1} sx={{ maxHeight: 240, overflow: 'auto' }}>
              {contactMessagesFiltered.map((m) => (
                <Box key={m.id} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Typography variant="caption">{m.direction}</Typography>
                  <Typography variant="body2">{m.text}</Typography>
                </Box>
              ))}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeContactDialog}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(taskDialog)} onClose={closeTaskDialog} maxWidth="md" fullWidth>
        <DialogTitle>Задача #{taskDialog?.id}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Автор: {userName(taskDialog?.creator_id)} · Создана:{' '}
              {taskDialog?.created_at
                ? new Date(taskDialog.created_at).toLocaleString('ru-RU')
                : '—'}
              {taskDialog?.updated_at
                ? ` · Обновлена: ${new Date(taskDialog.updated_at).toLocaleString('ru-RU')}`
                : ''}
            </Typography>
            {taskDialog && (
              <Button
                size="small"
                variant="outlined"
                sx={{ alignSelf: 'flex-start' }}
                onClick={() => void copyWorkspaceEntityLink('task', taskDialog.id)}
              >
                Копировать ссылку
              </Button>
            )}
            {taskDialog?.previous_task_id != null && (
              <Button size="small" variant="outlined" sx={{ alignSelf: 'flex-start' }} onClick={() => void openPreviousWorkspaceTask()}>
                Открыть предыдущую задачу #{taskDialog.previous_task_id}
              </Button>
            )}
            {taskFormLocked && (
              <Alert severity="info">
                Задача завершена или отменена: меняйте только <strong>статус</strong>, чтобы вернуть в работу. После сохранения с активным статусом остальные поля снова станут доступны.
              </Alert>
            )}
            {!canEditTaskDialogContent && (
              <Alert severity="info">
                Для вашей роли эта задача доступна только для просмотра. Редактирование и комментарии отключены.
              </Alert>
            )}
            {canEditTaskDialogContent && !canEditTaskFieldsDialogContent && (
              <Alert severity="info">
                Для ограниченных ролей редактирование полей задачи сейчас отключено policy-моделью.
              </Alert>
            )}
            {canEditTaskDialogContent && !canCommentTaskUi && (
              <Alert severity="info">
                Комментарии к задачам для ограниченных ролей сейчас отключены policy-моделью.
              </Alert>
            )}
            <TextField
              label="Название"
              fullWidth
              value={taskEditTitle}
              onChange={(e) => setTaskEditTitle(e.target.value)}
              disabled={taskFormLocked || !canEditTaskFieldsDialogContent}
            />
            <TextField
              label="Описание"
              fullWidth
              multiline
              minRows={3}
              value={taskEditDescription}
              onChange={(e) => setTaskEditDescription(e.target.value)}
              disabled={taskFormLocked || !canEditTaskFieldsDialogContent}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                select
                label="Статус"
                fullWidth
                value={taskEditStatus}
                onChange={(e) => setTaskEditStatus(coerceTaskStatus(e.target.value))}
                disabled={!canEditTaskFieldsDialogContent}
              >
                {editStatusOptions.map((k) => (
                  <MenuItem key={k} value={k}>
                    {statusLabels[k] ?? k}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Приоритет"
                fullWidth
                value={taskEditPriority}
                onChange={(e) => setTaskEditPriority(coerceTaskPriority(e.target.value))}
                disabled={taskFormLocked || !canEditTaskFieldsDialogContent}
              >
                {editPriorityOptions.map((k) => (
                  <MenuItem key={k} value={k}>
                    {priorityLabels[k] ?? k}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <TextField
              label="Дедлайн"
              type="datetime-local"
              value={taskEditDeadline}
              onChange={(e) => setTaskEditDeadline(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              disabled={taskFormLocked || !canEditTaskFieldsDialogContent}
            />
            <TextField
              label="Начало (start_at)"
              type="datetime-local"
              value={taskEditStartAt}
              onChange={(e) => setTaskEditStartAt(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              disabled={taskFormLocked || !canEditTaskFieldsDialogContent}
            />
            <Autocomplete
              options={projectsCatalogSorted}
              getOptionLabel={(o) => o.name}
              value={projectsCatalogSorted.find((p) => p.id === taskEditProjectId) || null}
              onChange={(_, v) => setTaskEditProjectId(v ? v.id : '')}
              disabled={taskFormLocked || !canEditTaskFieldsDialogContent}
              renderOption={(props, o) => (
                <li {...props} key={o.id}>
                  <span style={{ flex: 1 }}>{o.name}</span>
                  <span style={{ fontSize: '0.7rem', color: o.parent_project_id ? '#9c27b0' : '#1976d2', background: o.parent_project_id ? '#f3e5f5' : '#e3f2fd', borderRadius: 4, padding: '1px 6px', marginLeft: 8, whiteSpace: 'nowrap' }}>
                    {o.parent_project_id ? 'Подпроект' : 'Проект'}
                  </span>
                </li>
              )}
              renderInput={(params) => <TextField {...params} label="Проект" />}
            />
            <Autocomplete
              options={contactsCatalogSorted}
              getOptionLabel={(o) => o.full_name}
              value={contactsCatalogSorted.find((c) => c.id === taskEditContactId) || null}
              onChange={(_, v) => setTaskEditContactId(v ? v.id : '')}
              disabled={taskFormLocked || !canEditTaskFieldsDialogContent}
              renderInput={(params) => <TextField {...params} label="Контакт" />}
            />
            <Autocomplete
              options={userOptions}
              getOptionLabel={(o) => o.full_name}
              value={userOptions.find((u) => u.id === taskEditAssigneeId) || null}
              onChange={(_, v) => setTaskEditAssigneeId(v ? v.id : '')}
              disabled={taskFormLocked || !canEditTaskFieldsDialogContent}
              renderInput={(params) => <TextField {...params} label="Исполнитель" />}
            />
            <Autocomplete
              multiple
              freeSolo
              options={taskTagDictionary.items}
              value={taskEditTags}
              onChange={(_, v) => setTaskEditTags(v.map(String))}
              disabled={taskFormLocked || !canEditTaskFieldsDialogContent}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip variant="outlined" label={option} {...getTagProps({ index })} key={`${option}-${index}`} />
                ))
              }
              renderInput={(params) => <TextField {...params} label="Теги" placeholder="Ввод и Enter" />}
            />
            <Typography variant="subtitle2">Чеклист</Typography>
            {taskEditChecklist.map((item, idx) => (
              <Stack key={item.id} direction="row" spacing={1} alignItems="center">
                <Checkbox
                  checked={item.done}
                  disabled={taskFormLocked || !canEditTaskFieldsDialogContent}
                  onChange={() => {
                    const next = [...taskEditChecklist];
                    next[idx] = { ...item, done: !item.done };
                    setTaskEditChecklist(next);
                  }}
                />
                <TextField
                  size="small"
                  fullWidth
                  value={item.text}
                  disabled={taskFormLocked || !canEditTaskFieldsDialogContent}
                  onChange={(e) => {
                    const next = [...taskEditChecklist];
                    next[idx] = { ...item, text: e.target.value };
                    setTaskEditChecklist(next);
                  }}
                />
                <IconButton
                  size="small"
                  aria-label="Удалить пункт"
                  disabled={taskFormLocked || !canEditTaskFieldsDialogContent}
                  onClick={() => setTaskEditChecklist(taskEditChecklist.filter((_, i) => i !== idx))}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
            <Button
              size="small"
              variant="text"
              disabled={taskFormLocked || !canEditTaskFieldsDialogContent}
              onClick={() =>
                setTaskEditChecklist((prev) => [...prev, { id: `n-${Date.now()}`, text: '', done: false }])
              }
            >
              + Пункт чеклиста
            </Button>
            <Button
              size="small"
              variant="text"
              disabled={taskFormLocked || !canEditTaskFieldsDialogContent}
              onClick={() => { setTaskEditBulkOpen((v) => !v); setTaskEditBulkText(''); }}
            >
              {taskEditBulkOpen ? 'Отмена' : '+ Добавить пачкой'}
            </Button>
            {taskEditBulkOpen && (() => {
              const lines = taskEditBulkText.split('\n').map((s) => s.trim()).filter(Boolean);
              return (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <TextField
                    multiline
                    minRows={3}
                    maxRows={10}
                    size="small"
                    placeholder={"Каждая строка — отдельный пункт\nПункт 1\nПункт 2\nПункт 3"}
                    value={taskEditBulkText}
                    onChange={(e) => setTaskEditBulkText(e.target.value)}
                    autoFocus
                  />
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    {lines.slice(0, 3).map((l, i) => (
                      <Chip key={i} label={l.length > 30 ? l.slice(0, 30) + '…' : l} size="small" />
                    ))}
                    {lines.length > 3 && <Chip label={`ещё ${lines.length - 3}`} size="small" variant="outlined" />}
                  </Box>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={lines.length === 0}
                    onClick={() => {
                      setTaskEditChecklist((prev) => [
                        ...prev,
                        ...lines.map((text) => ({ id: `n-${Date.now()}-${Math.random()}`, text, done: false })),
                      ]);
                      setTaskEditBulkOpen(false);
                      setTaskEditBulkText('');
                    }}
                  >
                    Добавить {lines.length > 0 ? `${lines.length} пункт${lines.length === 1 ? '' : lines.length < 5 ? 'а' : 'ов'}` : ''}
                  </Button>
                </Box>
              );
            })()}
            <Divider />
            <Typography variant="subtitle2">Вложения</Typography>
            {(() => {
              let atts: Array<{ url?: string; name?: string }> = [];
              try { atts = JSON.parse(taskEditAttachmentsText || '[]'); } catch {}
              const canEdit = !taskFormLocked && canEditTaskFieldsDialogContent;
              const update = (next: typeof atts) => setTaskEditAttachmentsText(JSON.stringify(next));
              return (
                <Stack spacing={1}>
                  {atts.map((att, idx) => (
                    <Box key={idx} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <TextField
                        size="small"
                        label="Название"
                        value={att.name || ''}
                        onChange={(e) => { const n = [...atts]; n[idx] = { ...n[idx], name: e.target.value }; update(n); }}
                        sx={{ flex: 1 }}
                        disabled={!canEdit}
                      />
                      <TextField
                        size="small"
                        label="URL"
                        value={att.url || ''}
                        onChange={(e) => { const n = [...atts]; n[idx] = { ...n[idx], url: e.target.value }; update(n); }}
                        sx={{ flex: 2 }}
                        disabled={!canEdit}
                      />
                      {att.url && (
                        <IconButton size="small" component="a" href={att.url} target="_blank" rel="noopener noreferrer">
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      )}
                      {canEdit && (
                        <IconButton size="small" onClick={() => update(atts.filter((_, i) => i !== idx))}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Box>
                  ))}
                  {canEdit && (
                    <Button size="small" startIcon={<AddIcon />} onClick={() => update([...atts, { url: '', name: '' }])} sx={{ alignSelf: 'flex-start' }}>
                      Добавить вложение
                    </Button>
                  )}
                  {atts.length === 0 && !canEdit && (
                    <Typography variant="caption" color="text.secondary">Нет вложений</Typography>
                  )}
                </Stack>
              );
            })()}
            {(taskDialog?.linked_message_ids?.length ?? 0) > 0 && (
              <Typography variant="caption" color="text.secondary">
                Связанные сообщения (id): {taskDialog!.linked_message_ids!.join(', ')}
              </Typography>
            )}
            <Divider />
            <Typography variant="subtitle2">История изменений (эта задача)</Typography>
            <Stack spacing={1} sx={{ maxHeight: 200, overflow: 'auto' }}>
              {taskDialogHistory.length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  Записей аудита по этой задаче пока нет.
                </Typography>
              )}
              {taskDialogHistory.map((h) => (
                <Box key={h.id} sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {h.created_at ? new Date(h.created_at).toLocaleString('ru-RU') : ''} · {userName(h.author_id)}
                  </Typography>
                  <Typography variant="body2">{ownerWsHistoryPrimaryLabel(h)}</Typography>
                  {ownerWsHistoryChangedFields(h).length > 0 && (
                    <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
                      {ownerWsHistoryChangedFields(h)
                        .slice(0, 4)
                        .map((key) => (
                          <Chip key={key} size="small" variant="outlined" label={key} />
                        ))}
                      {ownerWsHistoryChangedFields(h).length > 4 && (
                        <Chip size="small" variant="outlined" label={`+${ownerWsHistoryChangedFields(h).length - 4}`} />
                      )}
                    </Stack>
                  )}
                  {(h.old_value || h.new_value) && (
                    <Button
                      size="small"
                      variant="text"
                      sx={{ mt: 0.75, alignSelf: 'flex-start' }}
                      onClick={() => toggleExpandedTaskHistoryEntry(h.id)}
                    >
                      {taskHistoryExpandedIds.includes(h.id) ? 'Скрыть детали' : 'Показать детали'}
                    </Button>
                  )}
                  {taskHistoryExpandedIds.includes(h.id) && (
                    <Stack spacing={1} sx={{ mt: 1 }}>
                      {h.old_value && (
                        <Box sx={{ p: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            До
                          </Typography>
                          <Box
                            component="pre"
                            sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, fontFamily: 'monospace' }}
                          >
                            {ownerWsHistoryPayloadText(h.old_value)}
                          </Box>
                        </Box>
                      )}
                      {h.new_value && (
                        <Box sx={{ p: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            После
                          </Typography>
                          <Box
                            component="pre"
                            sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, fontFamily: 'monospace' }}
                          >
                            {ownerWsHistoryPayloadText(h.new_value)}
                          </Box>
                        </Box>
                      )}
                    </Stack>
                  )}
                </Box>
              ))}
            </Stack>
            <Typography variant="subtitle2">Комментарии</Typography>
            <Stack spacing={1} sx={{ maxHeight: 200, overflow: 'auto' }}>
              {taskComments.map((c) => (
                <Box key={c.id} sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {c.created_at ? new Date(c.created_at).toLocaleString('ru-RU') : ''}
                  </Typography>
                  <Typography variant="body2">{c.text}</Typography>
                </Box>
              ))}
            </Stack>
            <TextField
              fullWidth
              label="Новый комментарий"
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              disabled={!canEditTaskDialogContent || !canCommentTaskUi}
              helperText="Упоминание: @ID пользователя или @email@домен — отдельное уведомление тем, кому уже видна задача (исполнитель и автор получают обычный «Комментарий»)."
            />
            <Button variant="outlined" onClick={addComment} disabled={!canEditTaskDialogContent || !canCommentTaskUi}>
              Добавить комментарий
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box>
            {isWorkspaceFullAccess && (
              <Button color="error" variant="outlined" onClick={() => setDeleteTaskConfirm(taskDialog)}>
                Удалить задачу
              </Button>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={closeTaskDialog}>Отмена</Button>
            <Button variant="contained" onClick={saveTaskDialog} disabled={!canEditTaskFieldsDialogContent}>
              Сохранить
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(completeDialogTask)} onClose={() => setCompleteDialogTask(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Завершить задачу</DialogTitle>
        <DialogContent>
          {completeDialogTask && !canCompleteTaskActionUi(completeDialogTask) && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Для вашей роли эта задача доступна только для просмотра. Завершение отключено.
            </Alert>
          )}
          <RadioGroup value={completeMode} onChange={(e) => setCompleteMode(e.target.value as typeof completeMode)}>
              <FormControlLabel value="close" control={<Radio />} label="Просто закрыть" />
              <FormControlLabel
                value="close_and_create_next"
                control={<Radio disabled={!canCreateTaskUi} />}
                label="Закрыть и создать следующую"
              />
            </RadioGroup>
            {!canCreateTaskUi && (
              <Alert severity="info" sx={{ mt: 1.5 }}>
                Создание следующей задачи после завершения сейчас отключено policy-моделью.
              </Alert>
            )}
            {completeMode === 'close_and_create_next' && canCompleteTaskActionUi(completeDialogTask) && !canCreateTaskUi && (
              <Alert severity="info" sx={{ mt: 1.5 }}>
                Завершение доступно, но создание следующей задачи отключено policy-моделью.
              </Alert>
            )}
            {completeMode === 'close_and_create_next' && (
              <TextField
                fullWidth
                sx={{ mt: 2 }}
                label="Название следующей задачи"
                value={nextTaskTitle}
                onChange={(e) => setNextTaskTitle(e.target.value)}
                disabled={completeDialogTask ? !canCompleteTaskActionUi(completeDialogTask) || !canCreateTaskUi : false}
                placeholder="Оставьте пустым — подставится автоматически"
              />
            )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompleteDialogTask(null)}>Отмена</Button>
          <Button variant="contained" onClick={submitComplete} disabled={completeDialogTask ? !canCompleteTaskActionUi(completeDialogTask) : true}>
            Подтвердить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(messageTaskDialog)} onClose={() => setMessageTaskDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Задача из сообщения</DialogTitle>
        <DialogContent>
          {messageTaskDialog && !canCreateTaskFromMessageUi && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Контакт из этого сообщения доступен только для просмотра. Создание задачи отключено.
            </Alert>
          )}
          <TextField
            fullWidth
            sx={{ mt: 1 }}
            label="Название задачи"
            value={messageTaskTitle}
            onChange={(e) => setMessageTaskTitle(e.target.value)}
            disabled={!canCreateTaskFromMessageUi}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMessageTaskDialog(null)}>Отмена</Button>
          <Button variant="contained" onClick={submitMessageTask} disabled={!canCreateTaskFromMessageUi}>
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(linkTaskDialog)} onClose={() => setLinkTaskDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Привязать сообщение к задаче</DialogTitle>
        <DialogContent>
          {linkTaskDialog && !canLinkMessagesUi && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Привязка сообщений к задачам для ограниченных ролей сейчас отключена policy-моделью.
            </Alert>
          )}
          {linkTaskDialog && canLinkMessagesUi && editableLinkTaskOptions.length === 0 && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Нет доступных задач с правом редактирования для привязки этого сообщения.
            </Alert>
          )}
          <Autocomplete
            sx={{ mt: 1 }}
            options={editableLinkTaskOptions}
            getOptionLabel={(o) => `#${o.id} · ${o.title}`}
            value={linkTaskSelected}
            onChange={(_, v) => setLinkTaskSelected(v)}
            renderInput={(params) => <TextField {...params} label="Активная задача" />}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkTaskDialog(null)}>Отмена</Button>
          <Button
            variant="contained"
            disabled={!linkTaskSelected || !canMutateTaskUi(linkTaskSelected) || !canLinkMessagesUi}
            onClick={submitLinkToTask}
          >
            Привязать
          </Button>
        </DialogActions>
      </Dialog>

      <Suspense fallback={<OwnerWorkspaceDialogsFallback />}>
        <OwnerWorkspaceSettingsDialogs
          settingsBundleDialogOpen={settingsBundleDialogOpen}
          settingsBundleImporting={settingsBundleImporting}
          settingsBundleImportText={settingsBundleImportText}
          parsedSettingsBundleInput={parsedSettingsBundleInput}
          settingsSnapshotCreateOpen={settingsSnapshotCreateOpen}
          settingsSnapshotEditOpen={settingsSnapshotEditOpen}
          settingsSnapshotCreating={settingsSnapshotCreating}
          settingsSnapshotName={settingsSnapshotName}
          settingsSnapshotNote={settingsSnapshotNote}
          settingsSnapshotPreview={settingsSnapshotPreview}
          settingsSnapshotDeleteConfirm={settingsSnapshotDeleteConfirm}
          settingsSnapshotDeletingId={settingsSnapshotDeletingId}
          settingsSnapshotReview={settingsSnapshotReview}
          settingsSnapshotApplyingId={settingsSnapshotApplyingId}
          settingsSnapshotCompareBaseId={settingsSnapshotCompareBaseId}
          settingsSnapshots={settingsSnapshots}
          settingsSnapshotCompareBaseSnapshot={settingsSnapshotCompareBaseSnapshot}
          settingsSnapshotCompareBaseSummary={settingsSnapshotCompareBaseSummary}
          reviewedSnapshotDiff={reviewedSnapshotDiff}
          settingsSnapshotCreateSafetyBeforeApply={settingsSnapshotCreateSafetyBeforeApply}
          onSettingsBundleDialogClose={() => setSettingsBundleDialogOpen(false)}
          onSettingsBundleImportTextChange={setSettingsBundleImportText}
          onImportWorkspaceSettingsBundle={() => void importWorkspaceSettingsBundle()}
          onSettingsSnapshotCreateClose={() => setSettingsSnapshotCreateOpen(false)}
          onSettingsSnapshotNameChange={setSettingsSnapshotName}
          onSettingsSnapshotNoteChange={setSettingsSnapshotNote}
          onCreateSettingsSnapshot={() => void createSettingsSnapshot()}
          onSettingsSnapshotEditClose={() => {
            setSettingsSnapshotEditOpen(false);
            setSettingsSnapshotEditingId(null);
          }}
          onUpdateSettingsSnapshot={() => void updateSettingsSnapshot()}
          onSettingsSnapshotPreviewClose={() => setSettingsSnapshotPreview(null)}
          onCopySettingsSnapshot={(snapshot) => void copySettingsSnapshot(snapshot)}
          onExportSettingsSnapshot={exportSettingsSnapshot}
          onSettingsSnapshotDeleteConfirmClose={() => setSettingsSnapshotDeleteConfirm(null)}
          onDeleteSettingsSnapshot={(snapshot) => {
            void deleteSettingsSnapshot(snapshot);
            setSettingsSnapshotDeleteConfirm(null);
          }}
          onSettingsSnapshotReviewClose={() => setSettingsSnapshotReview(null)}
          onSettingsSnapshotCompareBaseIdChange={setSettingsSnapshotCompareBaseId}
          onSettingsSnapshotCreateSafetyBeforeApplyChange={setSettingsSnapshotCreateSafetyBeforeApply}
          onApplySettingsSnapshot={(snapshot) => void applySettingsSnapshot(snapshot)}
          summarizeWorkspaceSettingsBundle={summarizeWorkspaceSettingsBundle}
        />
      </Suspense>

      <OwnerWorkspaceTaskCreateDialog
        open={createTaskDialogOpen}
        onClose={() => { setCreateTaskDialogOpen(false); setCreateTaskDialogProjectId(null); setCreateTaskDialogContactId(null); }}
        onSubmit={handleCreateTaskDialog}
        users={userOptions}
        projectName={
          createTaskDialogProjectId
            ? projects.find((p) => p.id === createTaskDialogProjectId)?.name
            : createTaskDialogContactId
            ? contacts.find((c) => c.id === createTaskDialogContactId)?.full_name
            : undefined
        }
      />
    </Layout>
  );
};

export default OwnerWorkspacePage;


