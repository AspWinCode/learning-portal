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

type OwnerWorkspaceTaskStatus = 'new' | 'in_progress' | 'waiting' | 'completed' | 'cancelled';
type OwnerWorkspaceTaskPriority = 'low' | 'medium' | 'high' | 'critical';

const OWNER_WS_STATUSES: OwnerWorkspaceTaskStatus[] = ['new', 'in_progress', 'waiting', 'completed', 'cancelled'];
const OWNER_WS_PRIORITIES: OwnerWorkspaceTaskPriority[] = ['low', 'medium', 'high', 'critical'];

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
  const [notifAnchor, setNotifAnchor] = useState<null | HTMLElement>(null);
  const [notifEnvelope, setNotifEnvelope] = useState<OwnerWorkspaceNotificationsEnvelope | null>(null);
  const [maxSyncResult, setMaxSyncResult] = useState<string | null>(null);
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
      const t = await ownerWorkspaceApi.listTasks({
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
      });
      setTasks(t);
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
  ]);

  const loadNotifications = useCallback(async () => {
    try {
      const env = await ownerWorkspaceApi.listNotifications({ limit: 80 });
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

  useEffect(() => {
    skipProjectsContactsFilterReload.current = true;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- первичная загрузка страницы
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
    void loadNotifications();
  }, [loadNotifications]);

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
    if (tab === 2) {
      loadTasksFiltered();
    }
  }, [tab, loadTasksFiltered]);

  useEffect(() => {
    if (taskViewMode !== 'list') {
      setSelectedTaskIds([]);
    }
  }, [taskViewMode]);

  useEffect(() => {
    if (tab !== 4) return undefined;
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

  const openTaskDialog = async (t: OwnerWorkspaceTask) => {
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

  const saveTaskDialog = async () => {
    if (!taskDialog) return;
    try {
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
      setTaskDialog(null);
      await loadTasksFiltered();
      void loadDigest();
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
      void loadNotifications();
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
        const rows = await ownerWorkspaceApi.listTasks({ project_id: p.id });
        setProjectDialogTasks(rows);
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
      const t = await ownerWorkspaceApi.listTasks({ active_only: true });
      setLinkTaskOptions(t);
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

  const linkContactToProject = async () => {
    if (!projectDialog || !linkContactId) return;
    try {
      await ownerWorkspaceApi.addProjectContact(projectDialog.id, linkContactId.id);
      setLinkContactId(null);
      await loadProjectsAndContacts();
      const updated = await ownerWorkspaceApi.getProject(projectDialog.id);
      setProjectDialog(updated);
      try {
        const rows = await ownerWorkspaceApi.listTasks({ project_id: projectDialog.id });
        setProjectDialogTasks(rows);
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
    try {
      const msgs = await ownerWorkspaceApi.getContactMessages(contactId);
      setCommsMessages(msgs.slice().reverse());
    } catch {
      setCommsMessages([]);
    }
  };

  const submitMessageTask = async () => {
    if (!messageTaskDialog || !messageTaskTitle.trim()) return;
    try {
      await ownerWorkspaceApi.createTaskFromMessage(messageTaskDialog.message.id, {
        title: messageTaskTitle.trim(),
        description: messageTaskDialog.message.text,
      });
      setMessageTaskDialog(null);
      setMessageTaskTitle('');
      await loadTasksFiltered();
      void loadDigest();
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

  const openSearchHitProject = async (id: number) => {
    setSearchOpen(false);
    setSearchQuery('');
    setTab(0);
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
    setTab(1);
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
    setTab(2);
    await loadTasksFiltered();
    try {
      const full = await ownerWorkspaceApi.getTask(id);
      await openTaskDialog(full);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Задача не найдена'));
    }
  };

  const openSearchHitMessage = async (contactId: number) => {
    setSearchOpen(false);
    setSearchQuery('');
    setTab(3);
    await selectCommsContact(contactId);
  };

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
            void loadNotifications();
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
          <MenuItem disabled>Нет уведомлений (для вас как исполнителя)</MenuItem>
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
                    void loadNotifications();
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
                primary={n.title}
                secondary={
                  <>
                    {n.body}
                    {n.read_at ? '' : ' · непрочитано'}
                  </>
                }
                primaryTypographyProps={{ variant: 'body2', fontWeight: n.read_at ? 400 : 600 }}
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

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Проекты (${projects.length})`} />
        <Tab label={`Контакты (${contacts.length})`} />
        <Tab label={`Задачи (${tasks.length})`} />
        <Tab label="Коммуникации" />
        <Tab label="История" />
      </Tabs>

      {tab === 0 && (
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
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Typography variant="h6">{p.name}</Typography>
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

      {tab === 1 && (
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

      {tab === 2 && (
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

      {tab === 3 && (
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
          <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Диалоги
                </Typography>
                <Stack spacing={1}>
                  {conversations.map((c) => (
                    <Box
                      key={c.contact_id}
                      onClick={() => selectCommsContact(c.contact_id)}
                      sx={{
                        p: 1,
                        border: '1px solid',
                        borderColor: commsContactId === c.contact_id ? 'primary.main' : 'divider',
                        borderRadius: 1,
                        cursor: 'pointer',
                      }}
                    >
                      <Typography variant="subtitle2">{c.contact_name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap display="block">
                        {c.last_message_text || '—'}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {commsContactId ? `Переписка · контакт #${commsContactId}` : 'Выберите диалог слева'}
                </Typography>
                <Stack spacing={1} sx={{ maxHeight: 420, overflow: 'auto' }}>
                  {commsMessages.map((m) => (
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
        </Grid>
        </Stack>
      )}

      {tab === 4 && (
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

      <Dialog open={Boolean(projectDialog)} onClose={() => setProjectDialog(null)} maxWidth="sm" fullWidth>
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
                setTab(2);
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

      <Dialog open={Boolean(contactDialog)} onClose={() => setContactDialog(null)} maxWidth="sm" fullWidth>
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
                setTab(2);
                setContactDialog(null);
              }}
            >
              Создать задачу по этому контакту
            </Button>
            <Stack spacing={0.5} sx={{ maxHeight: 200, overflow: 'auto' }}>
              {contactDialogTasks.length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  Нет задач с привязкой к контакту.
                </Typography>
              ) : (
                contactDialogTasks.slice(0, 40).map((t) => (
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
            <Stack spacing={1} sx={{ maxHeight: 240, overflow: 'auto' }}>
              {contactMessages.map((m) => (
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

      <Dialog open={Boolean(taskDialog)} onClose={() => setTaskDialog(null)} maxWidth="md" fullWidth>
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
            <TextField label="Название" fullWidth value={taskEditTitle} onChange={(e) => setTaskEditTitle(e.target.value)} />
            <TextField
              label="Описание"
              fullWidth
              multiline
              minRows={3}
              value={taskEditDescription}
              onChange={(e) => setTaskEditDescription(e.target.value)}
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
            />
            <TextField
              label="Начало (start_at)"
              type="datetime-local"
              value={taskEditStartAt}
              onChange={(e) => setTaskEditStartAt(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <Autocomplete
              options={projectsCatalogSorted}
              getOptionLabel={(o) => o.name}
              value={projectsCatalogSorted.find((p) => p.id === taskEditProjectId) || null}
              onChange={(_, v) => setTaskEditProjectId(v ? v.id : '')}
              renderInput={(params) => <TextField {...params} label="Проект" />}
            />
            <Autocomplete
              options={contactsCatalogSorted}
              getOptionLabel={(o) => o.full_name}
              value={contactsCatalogSorted.find((c) => c.id === taskEditContactId) || null}
              onChange={(_, v) => setTaskEditContactId(v ? v.id : '')}
              renderInput={(params) => <TextField {...params} label="Контакт" />}
            />
            <Autocomplete
              options={userOptions}
              getOptionLabel={(o) => o.full_name}
              value={userOptions.find((u) => u.id === taskEditAssigneeId) || null}
              onChange={(_, v) => setTaskEditAssigneeId(v ? v.id : '')}
              renderInput={(params) => <TextField {...params} label="Исполнитель" />}
            />
            <Autocomplete
              multiple
              freeSolo
              options={[] as string[]}
              value={taskEditTags}
              onChange={(_, v) => setTaskEditTags(v.map(String))}
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
                  onChange={(e) => {
                    const next = [...taskEditChecklist];
                    next[idx] = { ...item, text: e.target.value };
                    setTaskEditChecklist(next);
                  }}
                />
                <IconButton
                  size="small"
                  aria-label="Удалить пункт"
                  onClick={() => setTaskEditChecklist(taskEditChecklist.filter((_, i) => i !== idx))}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
            <Button
              size="small"
              variant="text"
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
        <DialogActions>
          <Button onClick={() => setTaskDialog(null)}>Отмена</Button>
          <Button variant="contained" onClick={saveTaskDialog}>
            Сохранить
          </Button>
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
