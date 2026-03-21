import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  Badge,
  ListItemText,
  Menu,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  Checkbox,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  TablePagination,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsIcon from '@mui/icons-material/Notifications';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { ownerWorkspaceApi, usersApi } from '../services/api';
import type {
  OwnerWorkspaceAuditLog,
  OwnerWorkspaceContact,
  OwnerWorkspaceConversation,
  OwnerWorkspaceDigest,
  OwnerWorkspaceNotificationsEnvelope,
  OwnerWorkspaceMessage,
  OwnerWorkspaceProject,
  OwnerWorkspaceSearchResult,
  OwnerWorkspaceTask,
  OwnerWorkspaceTaskComment,
  User,
} from '../types';
import { extractApiError } from '../utils/extractApiError';

/** Макс. задач за один запрос для канбана/календаря и вспомогательных списков (лимит API). */
const OWNER_WS_TASKS_FETCH_CAP = 500;

function isTaskOverdue(t: OwnerWorkspaceTask): boolean {
  if (!t.deadline_at || t.status === 'completed' || t.status === 'cancelled') return false;
  return new Date(t.deadline_at).getTime() < Date.now();
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

const STATUS_LABELS: Record<string, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  waiting: 'Ожидание',
  completed: 'Завершена',
  cancelled: 'Отменена',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
};

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
        <Typography variant="body2" sx={{ minWidth: 0, flex: '1 1 140px' }}>
          {p.name}
        </Typography>
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

const OWNER_WS_STATUSES: OwnerWorkspaceTaskStatus[] = ['new', 'in_progress', 'waiting', 'completed', 'cancelled'];
const OWNER_WS_PRIORITIES: OwnerWorkspaceTaskPriority[] = ['low', 'medium', 'high', 'critical'];

const OW_TAB_PROJECTS = 0;
const OW_TAB_CONTACTS = 1;
const OW_TAB_TASKS = 2;
const OW_TAB_COMMS = 3;
const OW_TAB_NOTIFICATIONS = 4;
const OW_TAB_SETTINGS = 5;
const OW_TAB_HISTORY = 6;

/** Слаги для deep-link: `/owner-workspace?tab=<slug>&task=<id>` */
const OW_TAB_SLUGS = ['projects', 'contacts', 'tasks', 'comms', 'notifications', 'settings', 'history'] as const;

function tabSlugFromIndex(index: number): string {
  return OW_TAB_SLUGS[index] ?? 'projects';
}

function tabIndexFromSlug(slug: string | null): number | null {
  if (!slug) return null;
  const i = OW_TAB_SLUGS.indexOf(slug as (typeof OW_TAB_SLUGS)[number]);
  return i >= 0 ? i : null;
}

/** Вкладка из URL: путь `/owner-workspace/notifications` или query `tab`, либо только `task` → вкладка «Задачи». */
function resolveOwnerWorkspaceTab(pathname: string, search: URLSearchParams): number | null {
  if (pathname.endsWith('/owner-workspace/notifications')) {
    return OW_TAB_NOTIFICATIONS;
  }
  if (pathname.endsWith('/owner-workspace/settings')) {
    return OW_TAB_SETTINGS;
  }
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
};

function coerceTaskStatus(v: string): OwnerWorkspaceTaskStatus {
  return OWNER_WS_STATUSES.includes(v as OwnerWorkspaceTaskStatus) ? (v as OwnerWorkspaceTaskStatus) : 'new';
}

function coerceTaskPriority(v: string): OwnerWorkspaceTaskPriority {
  return OWNER_WS_PRIORITIES.includes(v as OwnerWorkspaceTaskPriority) ? (v as OwnerWorkspaceTaskPriority) : 'medium';
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
  const skipNextTaskFromUrlEffectRef = useRef(false);
  const openTaskDialogRef = useRef<
    (task: OwnerWorkspaceTask, options?: { syncUrl?: boolean }) => Promise<void>
  >(async () => {});
  const loadTasksFilteredRef = useRef<() => Promise<void>>(async () => {});
  const isWorkspaceFullAccess = user?.role === 'admin' || user?.role === 'owner';
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<OwnerWorkspaceProject[]>([]);
  const [projectsCatalog, setProjectsCatalog] = useState<OwnerWorkspaceProject[]>([]);
  const [contacts, setContacts] = useState<OwnerWorkspaceContact[]>([]);
  const [contactsCatalog, setContactsCatalog] = useState<OwnerWorkspaceContact[]>([]);
  const [tasks, setTasks] = useState<OwnerWorkspaceTask[]>([]);
  const [conversations, setConversations] = useState<OwnerWorkspaceConversation[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [historyLogs, setHistoryLogs] = useState<OwnerWorkspaceAuditLog[]>([]);

  const [projectName, setProjectName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [projectListSearchInput, setProjectListSearchInput] = useState('');
  const [projectListSearch, setProjectListSearch] = useState('');
  const [projectListStatus, setProjectListStatus] = useState('');
  const [projectListOwnerId, setProjectListOwnerId] = useState<number | ''>('');
  const [projectListOverdueOnly, setProjectListOverdueOnly] = useState(false);

  const [contactListSearchInput, setContactListSearchInput] = useState('');
  const [contactListSearch, setContactListSearch] = useState('');
  const [contactListProjectId, setContactListProjectId] = useState<number | ''>('');
  const [contactListActiveTasksOnly, setContactListActiveTasksOnly] = useState(false);

  const [archiveProjectConfirm, setArchiveProjectConfirm] = useState<OwnerWorkspaceProject | null>(null);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [newTaskProjectId, setNewTaskProjectId] = useState<number | ''>('');
  const [newTaskContactId, setNewTaskContactId] = useState<number | ''>('');
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState<number | ''>('');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');

  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>('');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<string>('');
  const [taskProjectFilter, setTaskProjectFilter] = useState<number | ''>('');
  const [taskContactFilter, setTaskContactFilter] = useState<number | ''>('');
  const [taskOverdueOnly, setTaskOverdueOnly] = useState(false);
  const [taskActiveOnly, setTaskActiveOnly] = useState(false);
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState<number | ''>('');
  const [taskViewMode, setTaskViewMode] = useState<'list' | 'kanban' | 'calendar'>('list');
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [bulkAssigneeMode, setBulkAssigneeMode] = useState<'skip' | 'set' | 'clear'>('skip');
  const [bulkAssigneeUserId, setBulkAssigneeUserId] = useState<number | ''>('');
  const [bulkPriority, setBulkPriority] = useState<string>('');
  const [taskSortBy, setTaskSortBy] = useState<'created_at' | 'updated_at' | 'deadline_at' | 'title' | 'priority'>(
    'created_at'
  );
  const [taskSortDir, setTaskSortDir] = useState<'asc' | 'desc'>('desc');
  const [taskListTotal, setTaskListTotal] = useState(0);
  const [taskListPage, setTaskListPage] = useState(0);
  const [taskListRowsPerPage, setTaskListRowsPerPage] = useState(25);
  const [notifAnchor, setNotifAnchor] = useState<null | HTMLElement>(null);
  const [notifEnvelope, setNotifEnvelope] = useState<OwnerWorkspaceNotificationsEnvelope | null>(null);
  const [maxSyncResult, setMaxSyncResult] = useState<string | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [digest, setDigest] = useState<OwnerWorkspaceDigest | null>(null);
  const [digestScope, setDigestScope] = useState<'all' | 'mine'>('all');
  const [digestProjectFilter, setDigestProjectFilter] = useState<number | ''>('');
  const [digestDueHours, setDigestDueHours] = useState(48);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OwnerWorkspaceSearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const [projectDialog, setProjectDialog] = useState<OwnerWorkspaceProject | null>(null);
  const [projectEditName, setProjectEditName] = useState('');
  const [projectEditDescription, setProjectEditDescription] = useState('');
  const [projectEditStatus, setProjectEditStatus] = useState<string>('active');
  const [subprojectName, setSubprojectName] = useState('');
  const [linkContactId, setLinkContactId] = useState<OwnerWorkspaceContact | null>(null);

  const [contactDialog, setContactDialog] = useState<OwnerWorkspaceContact | null>(null);
  const [contactEditFullName, setContactEditFullName] = useState('');
  const [contactEditPhone, setContactEditPhone] = useState('');
  const [contactEditEmail, setContactEditEmail] = useState('');
  const [contactEditCompany, setContactEditCompany] = useState('');
  const [contactEditPosition, setContactEditPosition] = useState('');
  const [contactEditTags, setContactEditTags] = useState('');
  const [contactEditComment, setContactEditComment] = useState('');
  const [contactEditSource, setContactEditSource] = useState('');
  const [contactLinkProjectId, setContactLinkProjectId] = useState<OwnerWorkspaceProject | null>(null);
  const [contactMessages, setContactMessages] = useState<OwnerWorkspaceMessage[]>([]);
  const [newContactMessage, setNewContactMessage] = useState('');

  const [taskDialog, setTaskDialog] = useState<OwnerWorkspaceTask | null>(null);

  const closeTaskDialog = useCallback(() => {
    setTaskDialog(null);
    setSearchParams((prev) => {
      if (!prev.get('task')) return prev;
      const next = new URLSearchParams(prev);
      next.delete('task');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

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
  const [contactDialogTasks, setContactDialogTasks] = useState<OwnerWorkspaceTask[]>([]);
  const [projectDialogTasks, setProjectDialogTasks] = useState<OwnerWorkspaceTask[]>([]);

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
      };
      const hasProjectFilters = Boolean(
        projectListStatus ||
          projectListSearch.trim() ||
          projectListOwnerId !== '' ||
          projectListOverdueOnly
      );
      const hasContactFilters = Boolean(
        contactListSearch.trim() || contactListProjectId !== '' || contactListActiveTasksOnly
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

      setProjects(pFiltered);
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
  ]);

  const loadTasksFiltered = useCallback(async () => {
    try {
      const usePaging = taskViewMode === 'list';
      const filterKey = JSON.stringify({
        taskSearch,
        taskStatusFilter,
        taskPriorityFilter,
        taskProjectFilter,
        taskContactFilter,
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
      const taskPage = await ownerWorkspaceApi.listTasks({
        search: taskSearch.trim() || undefined,
        status_filter: taskStatusFilter || undefined,
        priority: taskPriorityFilter || undefined,
        project_id: taskProjectFilter === '' ? undefined : taskProjectFilter,
        contact_id: taskContactFilter === '' ? undefined : taskContactFilter,
        assignee_id: taskAssigneeFilter === '' ? undefined : taskAssigneeFilter,
        overdue_only: taskOverdueOnly || undefined,
        active_only: taskActiveOnly || undefined,
        sort_by: taskSortBy,
        sort_dir: taskSortDir,
        limit,
        offset,
      });
      setTasks(taskPage.items);
      setTaskListTotal(taskPage.total);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось загрузить задачи'));
    }
  }, [
    taskSearch,
    taskStatusFilter,
    taskPriorityFilter,
    taskProjectFilter,
    taskContactFilter,
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

  const loadMeta = useCallback(async () => {
    try {
      const [conv, u] = await Promise.all([ownerWorkspaceApi.listConversations(), usersApi.getAll()]);
      setConversations(conv);
      setUsers(Array.isArray(u) ? u : []);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось загрузить вспомогательные данные'));
    }
  }, []);

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
      await Promise.all([loadProjectsAndContacts(), loadTasksFiltered(), loadMeta()]);
    } finally {
      setLoading(false);
    }
  }, [loadProjectsAndContacts, loadTasksFiltered, loadMeta]);

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
      } catch {
        /* остаются дефолты в state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    setProjectEditStatus(projectDialog.status || 'active');
  }, [projectDialog]);

  useEffect(() => {
    if (!contactDialog) return;
    setContactEditFullName(contactDialog.full_name);
    setContactEditPhone(contactDialog.phone);
    setContactEditEmail(contactDialog.email ?? '');
    setContactEditCompany(contactDialog.company ?? '');
    setContactEditPosition(contactDialog.position ?? '');
    setContactEditComment(contactDialog.comment ?? '');
    setContactEditSource(contactDialog.source ?? '');
    setContactEditTags(Array.isArray(contactDialog.tags) ? contactDialog.tags.join(', ') : '');
  }, [contactDialog]);

  useEffect(() => {
    void loadDigest();
  }, [loadDigest]);

  useEffect(() => {
    void loadNotifications(80);
  }, [loadNotifications]);

  useEffect(() => {
    const next = resolveOwnerWorkspaceTab(location.pathname, searchParams);
    if (next !== null) setTab(next);
  }, [location.pathname, searchParams]);

  useEffect(() => {
    if (tab === OW_TAB_NOTIFICATIONS) {
      void loadNotifications(200);
    }
  }, [tab, loadNotifications]);

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
    if (taskViewMode !== 'list') {
      setSelectedTaskIds([]);
    }
  }, [taskViewMode]);

  useEffect(() => {
    if (tab !== OW_TAB_HISTORY) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const rows = await ownerWorkspaceApi.listHistory();
        if (!cancelled) setHistoryLogs(rows);
      } catch (e: unknown) {
        if (!cancelled) setError(extractApiError(e, 'Не удалось загрузить историю'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const createProject = async () => {
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
    if (!contactName.trim() || !contactPhone.trim()) return;
    try {
      await ownerWorkspaceApi.createContact({ full_name: contactName.trim(), phone: contactPhone.trim() });
      setContactName('');
      setContactPhone('');
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось создать контакт'));
    }
  };

  const createTask = async () => {
    if (!taskTitle.trim()) return;
    try {
      await ownerWorkspaceApi.createTask({
        title: taskTitle.trim(),
        priority: taskPriority,
        project_id: newTaskProjectId === '' ? null : newTaskProjectId,
        contact_id: newTaskContactId === '' ? null : newTaskContactId,
        assignee_id: newTaskAssigneeId === '' ? null : newTaskAssigneeId,
        deadline_at: localInputToIso(newTaskDeadline),
      });
      setTaskTitle('');
      setTaskPriority('medium');
      setNewTaskProjectId('');
      setNewTaskContactId('');
      setNewTaskAssigneeId('');
      setNewTaskDeadline('');
      await loadTasksFiltered();
      void loadDigest();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось создать задачу'));
    }
  };

  const openTaskDialog = async (t: OwnerWorkspaceTask, options?: { syncUrl?: boolean }) => {
    const syncUrl = options?.syncUrl !== false;
    if (syncUrl) {
      skipNextTaskFromUrlEffectRef.current = true;
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('task', String(t.id));
        return next;
      }, { replace: true });
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

  const deleteTaskDialog = async () => {
    if (!taskDialog || !isWorkspaceFullAccess) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm('Удалить задачу безвозвратно? Связи и комментарии будут удалены.')) return;
    try {
      await ownerWorkspaceApi.deleteTask(taskDialog.id);
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
    try {
      if (completeMode === 'close') {
        await ownerWorkspaceApi.completeTask(completeDialogTask.id, { action: 'close' });
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

  const openProjectDialog = (p: OwnerWorkspaceProject) => {
    setProjectDialog(p);
    setSubprojectName('');
    setLinkContactId(null);
    setParticipantToAdd(null);
    void (async () => {
      try {
        const taskPage = await ownerWorkspaceApi.listTasks({
          project_id: p.id,
          limit: OWNER_WS_TASKS_FETCH_CAP,
        });
        setProjectDialogTasks(taskPage.items);
      } catch {
        setProjectDialogTasks([]);
      }
    })();
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
    try {
      const updated = await ownerWorkspaceApi.updateProject(projectDialog.id, {
        name,
        description: projectEditDescription.trim() || null,
        status: projectEditStatus as 'active' | 'completed' | 'archived',
      });
      setProjectDialog(updated);
      setError(null);
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить проект'));
    }
  };

  const removeContactFromProject = async (contactId: number) => {
    if (!projectDialog) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm('Убрать контакт из этого проекта? Запись контакта в системе сохранится.')) return;
    try {
      await ownerWorkspaceApi.removeProjectContact(projectDialog.id, contactId);
      if (linkContactId?.id === contactId) setLinkContactId(null);
      const updated = await ownerWorkspaceApi.getProject(projectDialog.id);
      setProjectDialog(updated);
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось убрать контакт из проекта'));
    }
  };

  const submitArchiveProject = async () => {
    if (!archiveProjectConfirm) return;
    try {
      await ownerWorkspaceApi.archiveProject(archiveProjectConfirm.id);
      setArchiveProjectConfirm(null);
      setProjectDialog(null);
      await loadTasksFiltered();
      void loadDigest();
      await loadProjectsAndContacts();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось архивировать проект'));
    }
  };

  const addProjectParticipantUser = async () => {
    if (!projectDialog || !participantToAdd) return;
    try {
      await ownerWorkspaceApi.addProjectParticipant(projectDialog.id, participantToAdd.id);
      setParticipantToAdd(null);
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getProject(projectDialog.id);
      setProjectDialog(updated);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось добавить участника'));
    }
  };

  const removeProjectParticipantUser = async (userId: number) => {
    if (!projectDialog) return;
    try {
      await ownerWorkspaceApi.removeProjectParticipant(projectDialog.id, userId);
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getProject(projectDialog.id);
      setProjectDialog(updated);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось удалить участника'));
    }
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
    try {
      await ownerWorkspaceApi.createProject({
        name: subprojectName.trim(),
        parent_project_id: projectDialog.id,
      });
      setSubprojectName('');
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getProject(projectDialog.id);
      setProjectDialog(updated);
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

  const openContactDialog = async (c: OwnerWorkspaceContact) => {
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

  const removeContactFromLinkedProject = async (projectId: number) => {
    if (!contactDialog) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm('Убрать контакт из этого проекта? Запись контакта в системе сохранится.')) return;
    try {
      await ownerWorkspaceApi.removeProjectContact(projectId, contactDialog.id);
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getContact(contactDialog.id);
      setContactDialog(updated);
      if (projectDialog?.id === projectId) {
        const refreshedProject = await ownerWorkspaceApi.getProject(projectId);
        setProjectDialog(refreshedProject);
      }
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось убрать контакт из проекта'));
    }
  };

  const sendContactMessage = async () => {
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
      const tagParts = contactEditTags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
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
    const hasStatus = Boolean(bulkStatus);
    const hasAssigneeClear = bulkAssigneeMode === 'clear';
    const hasAssigneeSet = bulkAssigneeMode === 'set' && bulkAssigneeUserId !== '';
    const hasPriority = Boolean(bulkPriority);
    if (!hasStatus && !hasAssigneeClear && !hasAssigneeSet && !hasPriority) {
      setError('Выберите статус, исполнителя и/или приоритет');
      return;
    }
    const payload: {
      task_ids: number[];
      status?: OwnerWorkspaceTaskStatus;
      assignee_id?: number | null;
      priority?: OwnerWorkspaceTaskPriority;
    } = { task_ids: selectedTaskIds };
    if (hasStatus) payload.status = bulkStatus as OwnerWorkspaceTaskStatus;
    if (hasAssigneeClear) payload.assignee_id = null;
    if (hasAssigneeSet) payload.assignee_id = bulkAssigneeUserId as number;
    if (hasPriority) payload.priority = bulkPriority as OwnerWorkspaceTaskPriority;
    try {
      const res = await ownerWorkspaceApi.bulkUpdateTasks(payload);
      setSelectedTaskIds([]);
      setBulkStatus('');
      setBulkPriority('');
      setBulkAssigneeMode('skip');
      setBulkAssigneeUserId('');
      await loadTasksFiltered();
      void loadDigest();
      setError(null);
      setMaxSyncResult(`Массовое обновление: изменено задач — ${res.updated}.`);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Массовое обновление не удалось'));
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
      });
      setError(null);
      setMaxSyncResult('Настройки задачника сохранены в вашем профиле.');
      void loadDigest();
      if (tab === OW_TAB_TASKS) void loadTasksFiltered();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить настройки'));
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleWorkspaceTabChange = (_: React.SyntheticEvent, v: number) => {
    if (v !== OW_TAB_TASKS) {
      setTaskDialog(null);
    }
    setTab(v);
    const slug = tabSlugFromIndex(v);
    if (v === OW_TAB_NOTIFICATIONS) {
      const params = new URLSearchParams(searchParams);
      params.delete('tab');
      navigate(
        { pathname: '/owner-workspace/notifications', search: params.toString() ? `?${params.toString()}` : '' },
        { replace: true }
      );
      return;
    }
    if (v === OW_TAB_SETTINGS) {
      const params = new URLSearchParams(searchParams);
      params.delete('tab');
      params.delete('task');
      navigate(
        { pathname: '/owner-workspace/settings', search: params.toString() ? `?${params.toString()}` : '' },
        { replace: true }
      );
      return;
    }
    if (location.pathname.endsWith('/owner-workspace/notifications')) {
      const params = new URLSearchParams(searchParams);
      params.set('tab', slug);
      if (v !== OW_TAB_TASKS) params.delete('task');
      navigate(
        { pathname: '/owner-workspace', search: params.toString() ? `?${params.toString()}` : '' },
        { replace: true }
      );
      return;
    }
    if (location.pathname.endsWith('/owner-workspace/settings')) {
      const params = new URLSearchParams(searchParams);
      params.set('tab', slug);
      if (v !== OW_TAB_TASKS) params.delete('task');
      navigate(
        { pathname: '/owner-workspace', search: params.toString() ? `?${params.toString()}` : '' },
        { replace: true }
      );
      return;
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', slug);
      if (v !== OW_TAB_TASKS) next.delete('task');
      return next;
    }, { replace: true });
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
    handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_TASKS);
    skipNextTaskFromUrlEffectRef.current = true;
    if (
      location.pathname.endsWith('/owner-workspace/notifications') ||
      location.pathname.endsWith('/owner-workspace/settings')
    ) {
      navigate({ pathname: '/owner-workspace', search: `?tab=tasks&task=${id}` }, { replace: true });
    } else {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'tasks');
        next.set('task', String(id));
        return next;
      }, { replace: true });
    }
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

  openTaskDialogRef.current = openTaskDialog;
  loadTasksFilteredRef.current = loadTasksFiltered;

  useEffect(() => {
    const tidRaw = searchParams.get('task');
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
  }, [location.pathname, searchParams]);

  const userOptions = useMemo(
    () => users.filter((u) => ['admin', 'owner', 'sales', 'trainer'].includes(u.role)),
    [users]
  );

  const userName = useCallback(
    (userId: number | null | undefined) => {
      if (userId == null) return '—';
      const u = users.find((x) => x.id === userId);
      return u?.full_name || `#${userId}`;
    },
    [users]
  );

  const projectsCatalogSorted = useMemo(
    () => [...projectsCatalog].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [projectsCatalog]
  );

  const contactsCatalogSorted = useMemo(
    () => [...contactsCatalog].sort((a, b) => a.full_name.localeCompare(b.full_name, 'ru')),
    [contactsCatalog]
  );

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
                  <Chip size="small" label={STATUS_LABELS[t.status] || t.status} />
                  <Chip
                    size="small"
                    label={PRIORITY_LABELS[t.priority] || t.priority}
                    color={t.priority === 'critical' ? 'error' : t.priority === 'high' ? 'warning' : 'default'}
                  />
                  {t.assignee_id != null && (
                    <Chip size="small" variant="outlined" label={userName(t.assignee_id)} />
                  )}
                  {t.deadline_at && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={new Date(t.deadline_at).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      color={isTaskOverdue(t) ? 'error' : 'default'}
                    />
                  )}
                  {t.project_id && <Chip size="small" label={`Проект #${t.project_id}`} variant="outlined" />}
                  {t.contact_id && <Chip size="small" label={`Контакт #${t.contact_id}`} variant="outlined" />}
                  {(t.tags || []).slice(0, 4).map((tag, ti) => (
                    <Chip key={`${t.id}-tag-${ti}`} size="small" variant="outlined" color="primary" label={tag} />
                  ))}
                  {!compact && t.updated_at && (
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`Обн. ${new Date(t.updated_at).toLocaleString('ru-RU', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`}
                    />
                  )}
                </Stack>
              </Box>
            </Box>
            {t.status !== 'completed' && t.status !== 'cancelled' && (
              <Button
                size="small"
                variant="outlined"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setCompleteDialogTask(t)}
              >
                Завершить…
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>
    );
  };

  const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography variant="h4" sx={{ flex: '1 1 auto' }}>
          Owner: задачник
        </Typography>
        <IconButton
          color="default"
          aria-label="Уведомления по дедлайнам"
          onClick={(e) => {
            setNotifAnchor(e.currentTarget);
            void loadNotifications(80);
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
        <Button
          variant="outlined"
          startIcon={<SearchIcon />}
          onClick={() => {
            setSearchOpen(true);
            setSearchQuery('');
            setSearchResults(null);
          }}
        >
          Поиск
        </Button>
      </Box>
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
                      label={OWNER_WS_NOTIF_KIND_LABELS[n.kind] || n.kind}
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
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Проекты (участники), контакты, задачи — список, канбан (в т.ч. отдельно «Выполнено» / «Отменено»), календарь,
        массовые действия; единый поиск; сводка по дедлайнам; коммуникации и MAX (ручной импорт + опциональный
        автосинк на сервере: OWNER_WORKSPACE_AUTO_SYNC_MAX=1).
      </Typography>

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
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} flexWrap="wrap">
            <Typography variant="subtitle2">Сводка по дедлайнам</Typography>
            <ToggleButtonGroup
              size="small"
              value={digestScope}
              exclusive
              onChange={(_, v) => {
                if (v != null) setDigestScope(v);
              }}
            >
              <ToggleButton value="all">Все задачи</ToggleButton>
              <ToggleButton value="mine">Только мои</ToggleButton>
            </ToggleButtonGroup>
            <TextField
              select
              size="small"
              label="Проект"
              sx={{ minWidth: 200 }}
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
              sx={{ minWidth: 140 }}
              value={String(digestDueHours)}
              onChange={(e) => setDigestDueHours(Number(e.target.value))}
            >
              <MenuItem value="24">24 ч</MenuItem>
              <MenuItem value="48">48 ч</MenuItem>
              <MenuItem value="72">72 ч</MenuItem>
              <MenuItem value="168">7 дней</MenuItem>
            </TextField>
            {digestScope === 'mine' && user?.id == null && (
              <Typography variant="caption" color="text.secondary">
                Войдите, чтобы фильтр «Только мои» учитывал вашего пользователя.
              </Typography>
            )}
          </Stack>
        </CardContent>
      </Card>
      {digest && digest.overdue_count > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Просроченных активных задач: {digest.overdue_count}
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.5}>
            {digest.overdue_tasks.slice(0, 8).map((t) => (
              <Chip
                key={t.id}
                size="small"
                label={`#${t.id} ${t.title.slice(0, 28)}${t.title.length > 28 ? '…' : ''}`}
                onClick={() => void openSearchHitTask(t.id)}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Stack>
        </Alert>
      )}
      {digest && digest.due_soon_tasks.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Дедлайн в ближайшие {digestDueHours === 168 ? '7 дней' : `${digestDueHours} ч`}:{' '}
            {digest.due_soon_tasks.length}
            {digest.due_soon_tasks.length >= 25 ? '+' : ''}
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.5}>
            {digest.due_soon_tasks.slice(0, 8).map((t) => (
              <Chip
                key={t.id}
                size="small"
                label={`#${t.id} ${t.title.length > 24 ? `${t.title.slice(0, 24)}…` : t.title}`}
                onClick={() => void openSearchHitTask(t.id)}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Stack>
        </Alert>
      )}

      <Tabs value={tab} onChange={handleWorkspaceTabChange} sx={{ mb: 2 }}>
        <Tab label={`Проекты (${projects.length})`} />
        <Tab label={`Контакты (${contacts.length})`} />
        <Tab label={`Задачи (${taskListTotal})`} />
        <Tab label={commsUnreadTotal > 0 ? `Коммуникации (${commsUnreadTotal})` : 'Коммуникации'} />
        <Tab label={`Уведомления${notifEnvelope && notifEnvelope.unread_count > 0 ? ` (${notifEnvelope.unread_count})` : ''}`} />
        <Tab label="Настройки" />
        <Tab label="История" />
      </Tabs>

      {tab === OW_TAB_PROJECTS && (
        <Stack spacing={2}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="subtitle2" gutterBottom>
                Фильтры списка проектов
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} flexWrap="wrap" alignItems={{ md: 'center' }}>
                <TextField
                  select
                  label="Статус"
                  size="small"
                  sx={{ minWidth: 160 }}
                  value={projectListStatus}
                  onChange={(e) => setProjectListStatus(e.target.value)}
                >
                  <MenuItem value="">Все</MenuItem>
                  <MenuItem value="active">Активный</MenuItem>
                  <MenuItem value="completed">Завершён</MenuItem>
                  <MenuItem value="archived">Архив</MenuItem>
                </TextField>
                <TextField
                  label="Поиск по названию/описанию"
                  size="small"
                  sx={{ minWidth: 220, flex: 1 }}
                  value={projectListSearchInput}
                  onChange={(e) => setProjectListSearchInput(e.target.value)}
                />
                <TextField
                  select
                  label="Ответственный"
                  size="small"
                  sx={{ minWidth: 200 }}
                  value={projectListOwnerId === '' ? '' : String(projectListOwnerId)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setProjectListOwnerId(v === '' ? '' : Number(v));
                  }}
                >
                  <MenuItem value="">Все</MenuItem>
                  {userOptions.map((u) => (
                    <MenuItem key={u.id} value={String(u.id)}>
                      {u.full_name}
                    </MenuItem>
                  ))}
                </TextField>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={projectListOverdueOnly}
                      onChange={(_, c) => setProjectListOverdueOnly(c)}
                    />
                  }
                  label="Только с просроченными активными задачами"
                />
              </Stack>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  fullWidth
                  label="Название проекта"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
                <Button variant="contained" onClick={createProject}>
                  Создать
                </Button>
              </Stack>
            </CardContent>
          </Card>
          <Grid container spacing={2}>
            {projects.map((p) => (
              <Grid item xs={12} md={6} key={p.id}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="h6">{p.name}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                          Ответственный: {userName(p.owner_id)}
                        </Typography>
                      </Box>
                      <IconButton size="small" onClick={() => openProjectDialog(p)} aria-label="Открыть">
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                      <Chip size="small" label={p.status} />
                      <Chip size="small" label={`Задач всего: ${p.total_tasks_count ?? 0}`} />
                      <Chip size="small" label={`Активн.: ${p.active_tasks_count}`} />
                      {(p.overdue_tasks_count ?? 0) > 0 && (
                        <Chip size="small" color="warning" label={`Просроч.: ${p.overdue_tasks_count}`} />
                      )}
                      <Chip size="small" label={`Контактов: ${p.contacts_count}`} />
                      {p.subprojects_count > 0 && <Chip size="small" label={`Подпроектов: ${p.subprojects_count}`} />}
                    </Stack>
                    {p.updated_at ? (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                        Обновлён:{' '}
                        {new Date(p.updated_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                      </Typography>
                    ) : null}
                  </CardContent>
                </Card>
              </Grid>
            ))}
            {projects.length === 0 && (
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  Нет проектов по текущим фильтрам.
                </Typography>
              </Grid>
            )}
          </Grid>
        </Stack>
      )}

      {tab === OW_TAB_CONTACTS && (
        <Stack spacing={2}>
          <Card variant="outlined">
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="subtitle2" gutterBottom>
                Фильтры списка контактов
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} flexWrap="wrap" alignItems={{ md: 'center' }}>
                <TextField
                  label="Поиск (ФИО, телефон, компания)"
                  size="small"
                  sx={{ minWidth: 240, flex: 1 }}
                  value={contactListSearchInput}
                  onChange={(e) => setContactListSearchInput(e.target.value)}
                />
                <TextField
                  select
                  label="В проекте"
                  size="small"
                  sx={{ minWidth: 220 }}
                  value={contactListProjectId === '' ? '' : String(contactListProjectId)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setContactListProjectId(v === '' ? '' : Number(v));
                  }}
                >
                  <MenuItem value="">Любой</MenuItem>
                  {projectsCatalogSorted.map((p) => (
                    <MenuItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </MenuItem>
                  ))}
                </TextField>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={contactListActiveTasksOnly}
                      onChange={(_, c) => setContactListActiveTasksOnly(c)}
                    />
                  }
                  label="Только с активными задачами"
                />
              </Stack>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField fullWidth label="ФИО" value={contactName} onChange={(e) => setContactName(e.target.value)} />
                <TextField fullWidth label="Телефон" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                <Button variant="contained" onClick={createContact}>
                  Создать
                </Button>
              </Stack>
            </CardContent>
          </Card>
          <Grid container spacing={2}>
            {contacts.map((c) => (
              <Grid item xs={12} md={6} key={c.id}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="h6">{c.full_name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {c.phone}
                        </Typography>
                        {c.company?.trim() ? (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {c.company}
                          </Typography>
                        ) : null}
                        {(c.tags?.length ?? 0) > 0 ? (
                          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1, gap: 0.5 }}>
                            {(c.tags ?? []).slice(0, 5).map((t, i) => (
                              <Chip key={`${t}-${i}`} size="small" variant="outlined" label={t} />
                            ))}
                            {(c.tags ?? []).length > 5 ? (
                              <Chip size="small" variant="outlined" label={`+${(c.tags ?? []).length - 5}`} />
                            ) : null}
                          </Stack>
                        ) : null}
                        {c.last_interaction_at ? (
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
                            Последнее взаимодействие:{' '}
                            {new Date(c.last_interaction_at).toLocaleString('ru-RU', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </Typography>
                        ) : null}
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                          <Chip size="small" label={`Активн. задач: ${c.active_tasks_count}`} />
                          {c.linked_project_ids.length > 0 && (
                            <Chip size="small" label={`Проектов: ${c.linked_project_ids.length}`} />
                          )}
                        </Stack>
                      </Box>
                      <IconButton size="small" onClick={() => openContactDialog(c)}>
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
            {contacts.length === 0 && (
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  Нет контактов по текущим фильтрам.
                </Typography>
              </Grid>
            )}
          </Grid>
        </Stack>
      )}

      {tab === OW_TAB_TASKS && (
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                Новая задача
              </Typography>
              <Stack spacing={1}>
                <TextField fullWidth label="Название" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                  <TextField
                    select
                    label="Приоритет"
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as typeof taskPriority)}
                    sx={{ minWidth: 160 }}
                  >
                    <MenuItem value="low">Низкий</MenuItem>
                    <MenuItem value="medium">Средний</MenuItem>
                    <MenuItem value="high">Высокий</MenuItem>
                    <MenuItem value="critical">Критический</MenuItem>
                  </TextField>
                  <Autocomplete
                    options={projectsCatalogSorted}
                    getOptionLabel={(o) => o.name}
                    value={projectsCatalogSorted.find((p) => p.id === newTaskProjectId) || null}
                    onChange={(_, v) => setNewTaskProjectId(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="Проект (необяз.)" />}
                    sx={{ flex: 1 }}
                  />
                  <Autocomplete
                    options={contactsCatalogSorted}
                    getOptionLabel={(o) => `${o.full_name} · ${o.phone}`}
                    value={contactsCatalogSorted.find((c) => c.id === newTaskContactId) || null}
                    onChange={(_, v) => setNewTaskContactId(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="Контакт (необяз.)" />}
                    sx={{ flex: 1 }}
                  />
                  <Autocomplete
                    options={userOptions}
                    getOptionLabel={(o) => o.full_name}
                    value={userOptions.find((u) => u.id === newTaskAssigneeId) || null}
                    onChange={(_, v) => setNewTaskAssigneeId(v ? v.id : '')}
                    renderInput={(params) => <TextField {...params} label="Исполнитель" />}
                    sx={{ flex: 1 }}
                  />
                </Stack>
                <TextField
                  label="Дедлайн"
                  type="datetime-local"
                  value={newTaskDeadline}
                  onChange={(e) => setNewTaskDeadline(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ maxWidth: 280 }}
                />
                <Button variant="contained" onClick={createTask} sx={{ alignSelf: 'flex-start' }}>
                  Создать задачу
                </Button>
              </Stack>
            </CardContent>
          </Card>

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
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <MenuItem key={k} value={k}>
                        {v}
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
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                      <MenuItem key={k} value={k}>
                        {v}
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
                    select
                    fullWidth
                    size="small"
                    label="Сортировка"
                    value={taskSortBy}
                    onChange={(e) =>
                      setTaskSortBy(e.target.value as 'created_at' | 'updated_at' | 'deadline_at' | 'title' | 'priority')
                    }
                  >
                    <MenuItem value="created_at">По дате создания</MenuItem>
                    <MenuItem value="updated_at">По обновлению</MenuItem>
                    <MenuItem value="deadline_at">По дедлайну</MenuItem>
                    <MenuItem value="priority">По приоритету</MenuItem>
                    <MenuItem value="title">По названию</MenuItem>
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

          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
            <ToggleButtonGroup
              size="small"
              value={taskViewMode}
              exclusive
              onChange={(_, v) => v && setTaskViewMode(v)}
            >
              <ToggleButton value="list">Список</ToggleButton>
              <ToggleButton value="kanban">Канбан</ToggleButton>
              <ToggleButton value="calendar">Календарь</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary">
              В канбане перетащите карточку на другую колонку, чтобы сменить статус.
            </Typography>
          </Stack>

          {taskViewMode !== 'list' && taskListTotal > OWNER_WS_TASKS_FETCH_CAP && (
            <Alert severity="warning">
              Загружено не более {OWNER_WS_TASKS_FETCH_CAP} задач при текущих фильтрах (всего по фильтру: {taskListTotal}
              ). Уточните фильтры или переключитесь в режим «Список» с пагинацией.
            </Alert>
          )}

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
                {OWNER_WS_STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {STATUS_LABELS[s]}
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
                {OWNER_WS_PRIORITIES.map((p) => (
                  <MenuItem key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </MenuItem>
                ))}
              </TextField>
              <Button variant="contained" disabled={selectedTaskIds.length === 0} onClick={applyBulkTaskUpdate}>
                Применить к выбранным
              </Button>
            </Stack>
          )}

          {taskViewMode === 'list' ? (
            <Stack spacing={1}>
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
              {tasks.length === 0 && !loading && (
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2" gutterBottom>
                      Пока нет задач
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Создайте первую задачу формой выше или измените фильтры и нажмите «Применить».
                    </Typography>
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
                rowsPerPageOptions={[10, 25, 50, 100]}
                labelRowsPerPage="На странице:"
                labelDisplayedRows={({ from, to, count }) => `${from}–${to} из ${count !== -1 ? count : `более ${to}`}`}
              />
            </Stack>
          ) : taskViewMode === 'kanban' ? (
            <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1, alignItems: 'flex-start' }}>
              {KANBAN_COLUMNS.map((col) => {
                const colTasks = tasks.filter((t) =>
                  col.statuses.includes(coerceTaskStatus(String(t.status)))
                );
                return (
                  <Box
                    key={col.label}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const raw = e.dataTransfer.getData('text/plain');
                      const taskId = Number(raw);
                      if (!taskId) return;
                      void handleKanbanDrop(taskId, col.dropStatus);
                    }}
                    sx={{
                      minWidth: 200,
                      maxWidth: 280,
                      flex: '0 0 auto',
                      bgcolor: 'action.hover',
                      borderRadius: 1,
                      p: 1,
                      minHeight: 200,
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ mb: 1, px: 0.5 }}>
                      {col.label} ({colTasks.length})
                    </Typography>
                    <Stack spacing={0}>{colTasks.map((t) => renderTaskCard(t, { draggable: true }))}</Stack>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                  <IconButton aria-label="Предыдущий месяц" onClick={() => setCalendarMonth((d) => startOfMonth(new Date(d.getFullYear(), d.getMonth() - 1, 1)))}>
                    <ChevronLeftIcon />
                  </IconButton>
                  <Typography variant="h6">
                    {format(calendarMonth, 'LLLL yyyy', { locale: ru })}
                  </Typography>
                  <IconButton aria-label="Следующий месяц" onClick={() => setCalendarMonth((d) => startOfMonth(new Date(d.getFullYear(), d.getMonth() + 1, 1)))}>
                    <ChevronRightIcon />
                  </IconButton>
                </Stack>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, 1fr)',
                    gap: 0.5,
                  }}
                >
                  {WEEKDAYS_SHORT.map((wd) => (
                    <Typography key={wd} variant="caption" color="text.secondary" sx={{ textAlign: 'center', fontWeight: 600 }}>
                      {wd}
                    </Typography>
                  ))}
                  {eachDayOfInterval({
                    start: startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 }),
                    end: endOfWeek(endOfMonth(calendarMonth), { weekStartsOn: 1 }),
                  }).map((day) => {
                    const key = format(day, 'yyyy-MM-dd');
                    const dayTasks = tasksByDeadlineDay.get(key) || [];
                    const inMonth = isSameMonth(day, calendarMonth);
                    return (
                      <Box
                        key={key}
                        sx={{
                          minHeight: 100,
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1,
                          p: 0.5,
                          bgcolor: inMonth ? 'background.paper' : 'action.hover',
                          opacity: inMonth ? 1 : 0.65,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: isToday(day) ? 700 : 500, color: isToday(day) ? 'primary.main' : 'text.primary' }}
                        >
                          {format(day, 'd')}
                        </Typography>
                        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                          {dayTasks.slice(0, 4).map((t) => (
                            <Chip
                              key={t.id}
                              size="small"
                              label={t.title.length > 22 ? `${t.title.slice(0, 22)}…` : t.title}
                              onClick={() => openTaskDialog(t)}
                              sx={{ height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.25 } }}
                            />
                          ))}
                          {dayTasks.length > 4 && (
                            <Typography variant="caption" color="text.secondary">
                              +{dayTasks.length - 4}
                            </Typography>
                          )}
                        </Stack>
                      </Box>
                    );
                  })}
                </Box>
              </CardContent>
            </Card>
          )}
        </Stack>
      )}

      {tab === OW_TAB_COMMS && (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <Button variant="outlined" onClick={() => void syncMaxIntoWorkspace()}>
              Импорт MAX в переписки
            </Button>
            <Typography variant="caption" color="text.secondary">
              Исходящие из max_messages → сообщения контакта по совпадению нормализованного телефона (дубликаты по id
              пропускаются).
            </Typography>
          </Stack>
          <Grid container spacing={2} alignItems="stretch">
            <Grid item xs={12} md={3}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 360 }}>
                  <Typography variant="h6" gutterBottom>
                    Диалоги
                  </Typography>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Поиск по имени или тексту…"
                    value={commsDialogSearch}
                    onChange={(e) => setCommsDialogSearch(e.target.value)}
                    sx={{ mb: 1 }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" color="action" />
                        </InputAdornment>
                      ),
                    }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                    {conversationsFiltered.length === conversations.length
                      ? `${conversations.length} диалогов`
                      : `Найдено ${conversationsFiltered.length} из ${conversations.length}`}
                  </Typography>
                  <Stack spacing={1} sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                    {conversationsFiltered.length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        {conversations.length === 0 ? 'Нет переписок с сообщениями.' : 'Ничего не найдено.'}
                      </Typography>
                    )}
                    {conversationsFiltered.map((c) => (
                      <Box
                        key={c.contact_id}
                        onClick={() => void selectCommsContact(c.contact_id)}
                        sx={{
                          p: 1,
                          border: '1px solid',
                          borderColor: commsContactId === c.contact_id ? 'primary.main' : 'divider',
                          borderRadius: 1,
                          cursor: 'pointer',
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2">{c.contact_name}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap display="block">
                              {c.last_message_text || '—'}
                            </Typography>
                            {c.last_message_at ? (
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                                {new Date(c.last_message_at).toLocaleString('ru-RU', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}
                              </Typography>
                            ) : null}
                          </Box>
                          {c.unread_count > 0 ? (
                            <Chip
                              size="small"
                              color="error"
                              label={c.unread_count > 99 ? '99+' : c.unread_count}
                              sx={{ height: 22, flexShrink: 0 }}
                            />
                          ) : null}
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 360 }}>
                  <Typography variant="h6" gutterBottom>
                    {commsContactId
                      ? `Переписка · ${commsSelectedContact?.full_name ?? `контакт #${commsContactId}`}`
                      : 'Выберите диалог слева'}
                  </Typography>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Поиск по сообщениям…"
                    value={commsThreadSearch}
                    onChange={(e) => setCommsThreadSearch(e.target.value)}
                    disabled={!commsContactId}
                    sx={{ mb: 1 }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" color="action" />
                        </InputAdornment>
                      ),
                    }}
                  />
                  {commsContactId && commsThreadSearch.trim() && (
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                      Показано {commsMessagesFiltered.length} из {commsMessages.length}
                    </Typography>
                  )}
                  <Stack spacing={1} sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                    {!commsContactId && (
                      <Typography variant="body2" color="text.secondary">
                        Лента сообщений появится после выбора контакта.
                      </Typography>
                    )}
                    {commsContactId &&
                      commsMessagesFiltered.map((m) => (
                        <Box
                          key={m.id}
                          sx={{
                            p: 1,
                            borderRadius: 1,
                            bgcolor: m.direction === 'outgoing' ? 'action.hover' : 'background.paper',
                            border: '1px solid',
                            borderColor: 'divider',
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            {m.direction} · {m.created_at ? new Date(m.created_at).toLocaleString('ru-RU') : ''}
                          </Typography>
                          <Typography variant="body2">{m.text}</Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
                            <Button
                              size="small"
                              onClick={() => {
                                setMessageTaskTitle(m.text.slice(0, 80) + (m.text.length > 80 ? '…' : ''));
                                setMessageTaskDialog({ message: m });
                              }}
                            >
                              Задача из сообщения
                            </Button>
                            <Button size="small" color="secondary" onClick={() => openLinkToTaskDialog(m)}>
                              К существующей задаче
                            </Button>
                          </Stack>
                        </Box>
                      ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Контекст
                  </Typography>
                  {!commsContactId && (
                    <Typography variant="body2" color="text.secondary">
                      Выберите диалог, чтобы увидеть карточку контакта и быстрые действия.
                    </Typography>
                  )}
                  {commsContactId && (
                    <Stack spacing={1.5}>
                      <Typography variant="subtitle1">{commsSelectedContact?.full_name ?? `Контакт #${commsContactId}`}</Typography>
                      {commsSelectedContact?.phone && (
                        <Typography variant="body2" color="text.secondary">
                          {commsSelectedContact.phone}
                        </Typography>
                      )}
                      {commsSelectedContact?.company && (
                        <Typography variant="body2" color="text.secondary">
                          {commsSelectedContact.company}
                        </Typography>
                      )}
                      <Button variant="contained" size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => void openCommsContactCard()}>
                        Открыть карточку контакта
                      </Button>
                      <Divider />
                      <Typography variant="caption" color="text.secondary">
                        Непрочитанные в API пока не учитываются (поле зарезервировано под будущую синхронизацию).
                      </Typography>
                    </Stack>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Stack>
      )}

      {tab === OW_TAB_NOTIFICATIONS && (
        <Card variant="outlined">
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} sx={{ mb: 2 }}>
              <Typography variant="subtitle1">Все уведомления</Typography>
              <Button size="small" variant="outlined" onClick={() => void loadNotifications(200)}>
                Обновить
              </Button>
              <Typography variant="caption" color="text.secondary">
                Дедлайны подтягиваются при открытии списка; назначения и комментарии приходят сразу.
              </Typography>
            </Stack>
            <Stack spacing={1} sx={{ maxHeight: 640, overflow: 'auto' }}>
              {(notifEnvelope?.items || []).length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  Пока пусто. Здесь же появятся просрочки, напоминания о дедлайне, назначения и комментарии к вашим задачам.
                </Typography>
              )}
              {(notifEnvelope?.items || []).map((n) => (
                <Card key={n.id} variant="outlined" sx={{ bgcolor: n.read_at ? 'transparent' : 'action.hover' }}>
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                      <Chip size="small" label={OWNER_WS_NOTIF_KIND_LABELS[n.kind] || n.kind} />
                      {!n.read_at && <Chip size="small" color="warning" label="Новое" />}
                      <Typography variant="caption" color="text.secondary">
                        {n.created_at ? new Date(n.created_at).toLocaleString('ru-RU') : ''}
                      </Typography>
                    </Stack>
                    <Typography variant="subtitle2">{n.title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {n.body}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      {n.task_id != null && (
                        <Button size="small" variant="contained" onClick={() => void openSearchHitTask(n.task_id!)}>
                          Открыть задачу
                        </Button>
                      )}
                      {!n.read_at && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            void (async () => {
                              try {
                                await ownerWorkspaceApi.markNotificationRead(n.id);
                                await loadNotifications(200);
                              } catch (err: unknown) {
                                setError(extractApiError(err, 'Не удалось отметить прочитанным'));
                              }
                            })();
                          }}
                        >
                          Прочитано
                        </Button>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {tab === OW_TAB_SETTINGS && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Настройки задачника
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Параметры ниже сохраняются в вашем профиле и подставляются при следующем открытии Owner workspace. Изменения
              на других вкладках (вид задач, сводка) сразу видны в интерфейсе; нажмите «Сохранить», чтобы зафиксировать их
              как умолчания.
            </Typography>
            <Stack spacing={2} sx={{ maxWidth: 480 }}>
              <TextField
                select
                fullWidth
                label="Вид списка задач по умолчанию"
                value={taskViewMode}
                onChange={(e) => setTaskViewMode(e.target.value as 'list' | 'kanban' | 'calendar')}
              >
                <MenuItem value="list">Список</MenuItem>
                <MenuItem value="kanban">Канбан</MenuItem>
                <MenuItem value="calendar">Календарь</MenuItem>
              </TextField>
              <TextField
                fullWidth
                type="number"
                inputProps={{ min: 5, max: 100 }}
                label="Строк на странице (режим «Список», 5–100)"
                value={taskListRowsPerPage}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isFinite(n)) return;
                  setTaskListRowsPerPage(Math.min(100, Math.max(5, n)));
                }}
              />
              <TextField
                select
                fullWidth
                label="Сводка по дедлайнам: окно (часы)"
                value={String(digestDueHours)}
                onChange={(e) => setDigestDueHours(Number(e.target.value))}
              >
                {[8, 24, 48, 72, 168, 336].map((n) => (
                  <MenuItem key={n} value={String(n)}>
                    {n === 168 ? '7 дней (168 ч)' : `${n} ч`}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                fullWidth
                label="Сводка: область"
                value={digestScope}
                onChange={(e) => setDigestScope(e.target.value as 'all' | 'mine')}
              >
                <MenuItem value="all">Все доступные задачи</MenuItem>
                <MenuItem value="mine">Только мои (исполнитель — я)</MenuItem>
              </TextField>
              <Button variant="contained" disabled={settingsSaving} onClick={() => void saveWorkspaceSettings()}>
                {settingsSaving ? 'Сохранение…' : 'Сохранить настройки'}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {tab === OW_TAB_HISTORY && (
        <Card>
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>
              История действий (аудит)
            </Typography>
            <Stack spacing={1} sx={{ maxHeight: 560, overflow: 'auto' }}>
              {historyLogs.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  Нет записей или ещё не загружено.
                </Typography>
              )}
              {historyLogs.map((h) => (
                <Box key={h.id} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {h.created_at ? new Date(h.created_at).toLocaleString('ru-RU') : ''} · {userName(h.author_id)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>{h.entity_type}</strong> #{h.entity_id} — {h.action_type}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {loading && <Typography sx={{ mt: 2 }}>Загрузка…</Typography>}

      <Dialog open={Boolean(projectDialog)} onClose={() => setProjectDialog(null)} maxWidth="md" fullWidth>
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
              {projectDialog?.updated_at
                ? ` · Обновлён: ${new Date(projectDialog.updated_at).toLocaleString('ru-RU')}`
                : ''}
            </Typography>
            <Divider />
            <Typography variant="subtitle2">Карточка проекта</Typography>
            <TextField
              fullWidth
              label="Название"
              value={projectEditName}
              onChange={(e) => setProjectEditName(e.target.value)}
            />
            <TextField
              fullWidth
              label="Описание"
              multiline
              minRows={2}
              value={projectEditDescription}
              onChange={(e) => setProjectEditDescription(e.target.value)}
            />
            <TextField
              select
              fullWidth
              label="Статус"
              value={projectEditStatus}
              onChange={(e) => setProjectEditStatus(e.target.value)}
            >
              <MenuItem value="active">Активный</MenuItem>
              <MenuItem value="completed">Завершён</MenuItem>
              <MenuItem value="archived">Архив</MenuItem>
            </TextField>
            <Button variant="contained" size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => void saveProjectDetails()}>
              Сохранить карточку
            </Button>
            <Divider />
            <Typography variant="subtitle2">Ответственный (владелец проекта)</Typography>
            <Autocomplete
              options={userOptions}
              getOptionLabel={(o) => o.full_name}
              value={userOptions.find((u) => u.id === projectDialog?.owner_id) || null}
              onChange={(_, v) => void saveProjectOwner(v)}
              renderInput={(params) => <TextField {...params} label="Пользователь" size="small" />}
            />
            <Typography variant="subtitle2">Задачи проекта</Typography>
            <Button
              variant="contained"
              size="small"
              sx={{ alignSelf: 'flex-start' }}
              onClick={() => {
                if (!projectDialog) return;
                setNewTaskProjectId(projectDialog.id);
                handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_TASKS);
                setProjectDialog(null);
              }}
            >
              Создать задачу в этом проекте
            </Button>
            <Stack spacing={0.5} sx={{ maxHeight: 220, overflow: 'auto' }}>
              {projectDialogTasks.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  Нет задач с привязкой к этому проекту.
                </Typography>
              ) : (
                projectDialogTasks.slice(0, 40).map((t) => (
                  <Button
                    key={t.id}
                    size="small"
                    variant="text"
                    sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                    onClick={() => {
                      void openTaskDialog(t);
                      setProjectDialog(null);
                    }}
                  >
                    #{t.id} · {t.title.length > 48 ? `${t.title.slice(0, 48)}…` : t.title} ({STATUS_LABELS[t.status] || t.status})
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
              />
              <Button variant="contained" onClick={createSubproject}>
                Создать подпроект
              </Button>
            </Stack>
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
              renderInput={(params) => <TextField {...params} label="Добавить контакт в проект" />}
            />
            <Button variant="outlined" onClick={linkContactToProject} disabled={!linkContactId}>
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
                        onClick={() => void removeContactFromProject(c.id)}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>
              </>
            )}
            <Typography variant="subtitle2">Участники проекта</Typography>
            <Stack direction="row" flexWrap="wrap" gap={0.5}>
              {(projectDialog?.participants || []).map((pid) => (
                <Chip
                  key={pid}
                  size="small"
                  label={userName(pid)}
                  onDelete={() => removeProjectParticipantUser(pid)}
                />
              ))}
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <Autocomplete
                sx={{ flex: 1 }}
                options={userOptions.filter((u) => !(projectDialog?.participants || []).includes(u.id))}
                getOptionLabel={(o) => o.full_name}
                value={participantToAdd}
                onChange={(_, v) => setParticipantToAdd(v)}
                renderInput={(params) => <TextField {...params} label="Добавить участника" />}
              />
              <Button variant="outlined" onClick={addProjectParticipantUser} disabled={!participantToAdd}>
                Добавить
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          {projectDialog?.status !== 'archived' && (
            <Button color="error" onClick={() => setArchiveProjectConfirm(projectDialog)}>
              В архив
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setProjectDialog(null)}>Закрыть</Button>
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
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setArchiveProjectConfirm(null)}>Отмена</Button>
          <Button color="error" variant="contained" onClick={() => void submitArchiveProject()}>
            В архив
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(contactDialog)} onClose={() => setContactDialog(null)} maxWidth="md" fullWidth>
        <DialogTitle>{contactDialog?.full_name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="subtitle2">Карточка контакта</Typography>
            <TextField
              fullWidth
              label="ФИО"
              value={contactEditFullName}
              onChange={(e) => setContactEditFullName(e.target.value)}
            />
            <TextField
              fullWidth
              label="Телефон"
              value={contactEditPhone}
              onChange={(e) => setContactEditPhone(e.target.value)}
            />
            <TextField
              fullWidth
              label="Email"
              value={contactEditEmail}
              onChange={(e) => setContactEditEmail(e.target.value)}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                fullWidth
                label="Компания"
                value={contactEditCompany}
                onChange={(e) => setContactEditCompany(e.target.value)}
              />
              <TextField
                fullWidth
                label="Должность"
                value={contactEditPosition}
                onChange={(e) => setContactEditPosition(e.target.value)}
              />
            </Stack>
            <TextField
              fullWidth
              label="Теги (через запятую)"
              value={contactEditTags}
              onChange={(e) => setContactEditTags(e.target.value)}
            />
            <TextField
              fullWidth
              label="Комментарий"
              multiline
              minRows={2}
              value={contactEditComment}
              onChange={(e) => setContactEditComment(e.target.value)}
            />
            <TextField
              fullWidth
              label="Источник"
              value={contactEditSource}
              onChange={(e) => setContactEditSource(e.target.value)}
            />
            <Button variant="contained" onClick={() => void saveContactDetails()} sx={{ alignSelf: 'flex-start' }}>
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
                      onClick={() => void removeContactFromLinkedProject(p.id)}
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
                renderInput={(params) => <TextField {...params} label="Добавить в проект" />}
              />
              <Button variant="contained" onClick={linkContactToSelectedProject} disabled={!contactLinkProjectId}>
                Добавить
              </Button>
            </Stack>
            <Typography variant="subtitle2">Задачи по контакту</Typography>
            <Button
              variant="contained"
              size="small"
              sx={{ alignSelf: 'flex-start' }}
              onClick={() => {
                if (!contactDialog) return;
                setNewTaskContactId(contactDialog.id);
                handleWorkspaceTabChange({} as React.SyntheticEvent, OW_TAB_TASKS);
                setContactDialog(null);
              }}
            >
              Создать задачу по этому контакту
            </Button>
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
                      setContactDialog(null);
                    }}
                  >
                    #{t.id} · {t.title.length > 48 ? `${t.title.slice(0, 48)}…` : t.title} ({STATUS_LABELS[t.status] || t.status})
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
                      setContactDialog(null);
                    }}
                  >
                    #{t.id} · {t.title.length > 48 ? `${t.title.slice(0, 48)}…` : t.title} ({STATUS_LABELS[t.status] || t.status})
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
            />
            <Button variant="outlined" onClick={sendContactMessage}>
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
          <Button onClick={() => setContactDialog(null)}>Закрыть</Button>
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
            <TextField
              label="Название"
              fullWidth
              value={taskEditTitle}
              onChange={(e) => setTaskEditTitle(e.target.value)}
              disabled={taskFormLocked}
            />
            <TextField
              label="Описание"
              fullWidth
              multiline
              minRows={3}
              value={taskEditDescription}
              onChange={(e) => setTaskEditDescription(e.target.value)}
              disabled={taskFormLocked}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                select
                label="Статус"
                fullWidth
                value={taskEditStatus}
                onChange={(e) => setTaskEditStatus(coerceTaskStatus(e.target.value))}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Приоритет"
                fullWidth
                value={taskEditPriority}
                onChange={(e) => setTaskEditPriority(coerceTaskPriority(e.target.value))}
                disabled={taskFormLocked}
              >
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k}>
                    {v}
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
              disabled={taskFormLocked}
            />
            <TextField
              label="Начало (start_at)"
              type="datetime-local"
              value={taskEditStartAt}
              onChange={(e) => setTaskEditStartAt(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              disabled={taskFormLocked}
            />
            <Autocomplete
              options={projectsCatalogSorted}
              getOptionLabel={(o) => o.name}
              value={projectsCatalogSorted.find((p) => p.id === taskEditProjectId) || null}
              onChange={(_, v) => setTaskEditProjectId(v ? v.id : '')}
              disabled={taskFormLocked}
              renderInput={(params) => <TextField {...params} label="Проект" />}
            />
            <Autocomplete
              options={contactsCatalogSorted}
              getOptionLabel={(o) => o.full_name}
              value={contactsCatalogSorted.find((c) => c.id === taskEditContactId) || null}
              onChange={(_, v) => setTaskEditContactId(v ? v.id : '')}
              disabled={taskFormLocked}
              renderInput={(params) => <TextField {...params} label="Контакт" />}
            />
            <Autocomplete
              options={userOptions}
              getOptionLabel={(o) => o.full_name}
              value={userOptions.find((u) => u.id === taskEditAssigneeId) || null}
              onChange={(_, v) => setTaskEditAssigneeId(v ? v.id : '')}
              disabled={taskFormLocked}
              renderInput={(params) => <TextField {...params} label="Исполнитель" />}
            />
            <Autocomplete
              multiple
              freeSolo
              options={[] as string[]}
              value={taskEditTags}
              onChange={(_, v) => setTaskEditTags(v.map(String))}
              disabled={taskFormLocked}
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
                  disabled={taskFormLocked}
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
                  disabled={taskFormLocked}
                  onChange={(e) => {
                    const next = [...taskEditChecklist];
                    next[idx] = { ...item, text: e.target.value };
                    setTaskEditChecklist(next);
                  }}
                />
                <IconButton
                  size="small"
                  aria-label="Удалить пункт"
                  disabled={taskFormLocked}
                  onClick={() => setTaskEditChecklist(taskEditChecklist.filter((_, i) => i !== idx))}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
            <Button
              size="small"
              variant="text"
              disabled={taskFormLocked}
              onClick={() =>
                setTaskEditChecklist((prev) => [...prev, { id: `n-${Date.now()}`, text: '', done: false }])
              }
            >
              + Пункт чеклиста
            </Button>
            <Divider />
            <Typography variant="subtitle2">Вложения (JSON-массив)</Typography>
            <Typography variant="caption" color="text.secondary">
              Например: [&#123; &quot;url&quot;: &quot;https://…&quot;, &quot;name&quot;: &quot;Документ&quot; &#125;]
            </Typography>
            <TextField
              fullWidth
              multiline
              minRows={4}
              value={taskEditAttachmentsText}
              onChange={(e) => setTaskEditAttachmentsText(e.target.value)}
              disabled={taskFormLocked}
              InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }}
            />
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
                  <Typography variant="body2">{h.action_type}</Typography>
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
            />
            <Button variant="outlined" onClick={addComment}>
              Добавить комментарий
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box>
            {isWorkspaceFullAccess && (
              <Button color="error" variant="outlined" onClick={() => void deleteTaskDialog()}>
                Удалить задачу
              </Button>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={closeTaskDialog}>Отмена</Button>
            <Button variant="contained" onClick={saveTaskDialog}>
              Сохранить
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(completeDialogTask)} onClose={() => setCompleteDialogTask(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Завершить задачу</DialogTitle>
        <DialogContent>
          <RadioGroup value={completeMode} onChange={(e) => setCompleteMode(e.target.value as typeof completeMode)}>
            <FormControlLabel value="close" control={<Radio />} label="Просто закрыть" />
            <FormControlLabel
              value="close_and_create_next"
              control={<Radio />}
              label="Закрыть и создать следующую"
            />
          </RadioGroup>
          {completeMode === 'close_and_create_next' && (
            <TextField
              fullWidth
              sx={{ mt: 2 }}
              label="Название следующей задачи"
              value={nextTaskTitle}
              onChange={(e) => setNextTaskTitle(e.target.value)}
              placeholder="Оставьте пустым — подставится автоматически"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCompleteDialogTask(null)}>Отмена</Button>
          <Button variant="contained" onClick={submitComplete}>
            Подтвердить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(messageTaskDialog)} onClose={() => setMessageTaskDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Задача из сообщения</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            sx={{ mt: 1 }}
            label="Название задачи"
            value={messageTaskTitle}
            onChange={(e) => setMessageTaskTitle(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMessageTaskDialog(null)}>Отмена</Button>
          <Button variant="contained" onClick={submitMessageTask}>
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(linkTaskDialog)} onClose={() => setLinkTaskDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Привязать сообщение к задаче</DialogTitle>
        <DialogContent>
          <Autocomplete
            sx={{ mt: 1 }}
            options={linkTaskOptions}
            getOptionLabel={(o) => `#${o.id} · ${o.title}`}
            value={linkTaskSelected}
            onChange={(_, v) => setLinkTaskSelected(v)}
            renderInput={(params) => <TextField {...params} label="Активная задача" />}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkTaskDialog(null)}>Отмена</Button>
          <Button variant="contained" disabled={!linkTaskSelected} onClick={submitLinkToTask}>
            Привязать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Поиск по задачнику</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            autoFocus
            margin="dense"
            label="Запрос"
            placeholder="Минимум 2 символа — проекты, контакты, задачи, переписка"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Box sx={{ minHeight: 40, display: 'flex', alignItems: 'center', gap: 1, my: 1 }}>
            {searchLoading && <CircularProgress size={24} />}
            {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 && (
              <Typography variant="caption" color="text.secondary">
                Введите ещё символы
              </Typography>
            )}
          </Box>
          {searchResults && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Проекты ({searchResults.projects.length})
                </Typography>
                <Stack spacing={0.25}>
                  {searchResults.projects.map((p) => (
                    <Button
                      key={p.id}
                      size="small"
                      variant="text"
                      sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                      onClick={() => void openSearchHitProject(p.id)}
                    >
                      {p.name} · {p.status}
                    </Button>
                  ))}
                  {searchResults.projects.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      —
                    </Typography>
                  )}
                </Stack>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Контакты ({searchResults.contacts.length})
                </Typography>
                <Stack spacing={0.25}>
                  {searchResults.contacts.map((c) => (
                    <Button
                      key={c.id}
                      size="small"
                      variant="text"
                      sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                      onClick={() => void openSearchHitContact(c.id)}
                    >
                      {c.full_name} · {c.phone}
                    </Button>
                  ))}
                  {searchResults.contacts.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      —
                    </Typography>
                  )}
                </Stack>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Задачи ({searchResults.tasks.length})
                </Typography>
                <Stack spacing={0.25}>
                  {searchResults.tasks.map((t) => (
                    <Button
                      key={t.id}
                      size="small"
                      variant="text"
                      sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
                      onClick={() => void openSearchHitTask(t.id)}
                    >
                      #{t.id} · {t.title} ({STATUS_LABELS[t.status] || t.status})
                    </Button>
                  ))}
                  {searchResults.tasks.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      —
                    </Typography>
                  )}
                </Stack>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Сообщения ({(searchResults.messages ?? []).length})
                </Typography>
                <Stack spacing={0.25}>
                  {(searchResults.messages ?? []).map((m) => (
                    <Button
                      key={m.id}
                      size="small"
                      variant="text"
                      sx={{ justifyContent: 'flex-start', textTransform: 'none', alignItems: 'flex-start' }}
                      onClick={() => void openSearchHitMessage(m.contact_id)}
                    >
                      <Box sx={{ textAlign: 'left' }}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {m.contact_name || `Контакт #${m.contact_id}`} ·{' '}
                          {m.direction === 'incoming' ? 'входящее' : m.direction === 'outgoing' ? 'исходящее' : m.direction}
                          {m.created_at
                            ? ` · ${new Date(m.created_at).toLocaleString('ru-RU', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}`
                            : ''}
                        </Typography>
                        <Typography variant="body2">{m.text_preview}</Typography>
                      </Box>
                    </Button>
                  ))}
                  {(searchResults.messages ?? []).length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      —
                    </Typography>
                  )}
                </Stack>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSearchOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default OwnerWorkspacePage;
