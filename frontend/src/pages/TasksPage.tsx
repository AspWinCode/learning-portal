import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  RadioGroup,
  Radio,
  Switch,
} from '@mui/material';
import {
  Add as AddIcon,
  Archive as ArchiveIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExpandLess,
  ExpandMore,
  ArrowUpward,
  ArrowDownward,
} from '@mui/icons-material';
import Layout from '../components/Layout';
import { tasksApi, studentsApi, salesApi } from '../services/api';
import type { LessonTaskItem, LessonTaskStudent } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { extractApiError } from '../utils/extractApiError';
import { getEffectiveRole, hasPermission } from '../utils/permissions';
import type {
  TaskTemplateResponse,
  TaskResponse,
  TaskSubtaskResponse,
  RepeatFrequency,
  RepeatEndType,
  TaskCategory,
  AbsenceFollowUp,
} from '../types';
import type { Student } from '../types';
import OpenInNew from '@mui/icons-material/OpenInNew';
import Refresh from '@mui/icons-material/Refresh';
import Phone from '@mui/icons-material/Phone';
import { Link, useSearchParams } from 'react-router-dom';

const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const SHOW_TODAY_PLAN_KEY = 'tasks_showTodayPlan';

const ABSENCE_REASON_LABELS: Record<string, string> = {
  was: 'Был',
  not_was: 'Не был',
  sick: 'Болел',
  olympiad: 'Олимпиада',
  event: 'Мероприятие',
  other: 'Другое',
};

const formatShortDate = (d: string | null | undefined): string => {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  const [year, month, day] = parts;
  return `${day.padStart(2, '0')}.${month.padStart(2, '0')}`;
};

const normalizeTaskCategory = (value: TaskResponse['category'] | undefined, fallback: TaskCategory): TaskCategory => {
  return value === 'schools' || value === 'parents' || value === 'leads' ? value : fallback;
};

const TasksPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const effectiveRole = getEffectiveRole(user);
  const isAdminOrOwner = effectiveRole === 'admin' || effectiveRole === 'owner';
  const isSales = effectiveRole === 'sales';
  const isTrainer = effectiveRole === 'trainer';
  const canManageTasks = hasPermission(user, 'tasks.manage');
  const canSeeLessonTasks = isAdminOrOwner || isSales;

  const [templates, setTemplates] = useState<TaskTemplateResponse[]>([]);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [lessonTasks, setLessonTasks] = useState<LessonTaskItem[]>([]);
  const [lessonTasksTomorrow, setLessonTasksTomorrow] = useState<LessonTaskItem[]>([]);
  const [lessonTasksWeek, setLessonTasksWeek] = useState<LessonTaskItem[]>([]);
  const [lessonTasksLoading, setLessonTasksLoading] = useState(false);
  const [lessonTasksTomorrowLoading, setLessonTasksTomorrowLoading] = useState(false);
  const [lessonTasksWeekLoading, setLessonTasksWeekLoading] = useState(false);
  const [lessonTaskDetail, setLessonTaskDetail] = useState<LessonTaskItem | null>(null);
  const [lessonDetailRefreshing, setLessonDetailRefreshing] = useState(false);
  const [callResultSaving, setCallResultSaving] = useState<number | null>(null);
  const callRoundBlockRef = useRef<HTMLDivElement>(null);
  const [lessonPeriodTab, setLessonPeriodTab] = useState(0); // 0 сегодня, 1 завтра, 2 неделя
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory>('schools');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | ''>('active');
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

  const [showTodayPlan, setShowTodayPlan] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SHOW_TODAY_PLAN_KEY) === '1';
  });
  const [todayPlanTab, setTodayPlanTab] = useState<'today' | 'overdue' | 'active'>('today');
  const [todayTasks, setTodayTasks] = useState<TaskResponse[]>([]);
  const [todayTasksLoading, setTodayTasksLoading] = useState(false);
  const [dayStats, setDayStats] = useState<{ completed_count: number } | null>(null);
  const [overdueCount, setOverdueCount] = useState<number | null>(null);
  const lessonBlockRef = useRef<HTMLDivElement>(null);

  const [dayDeskLoading, setDayDeskLoading] = useState(false);
  const [dayDesk, setDayDesk] = useState<{
    stats: { overdue: number; today: number; completed_today: number; overload: number };
    urgent: TaskResponse[];
    parents: TaskResponse[];
    makeups: TaskResponse[];
    payments: TaskResponse[];
    operations: TaskResponse[];
    leads: TaskResponse[];
  } | null>(null);
  const [hideCompletedInDesk, setHideCompletedInDesk] = useState(true);
  const urgentBlockRef = useRef<HTMLDivElement | null>(null);
  const [absenceMakeupsTodo, setAbsenceMakeupsTodo] = useState<AbsenceFollowUp[]>([]);
  // UX: таб «В работе сегодня», лимиты карточек, свёрнутость блоков (для sales)
  const [workTodayTab, setWorkTodayTab] = useState<'parents' | 'makeups' | 'payments'>('parents');
  const [urgentExpanded, setUrgentExpanded] = useState(false);
  const [parentsInWorkExpanded, setParentsInWorkExpanded] = useState(false);
  const [makeupsAssignedExpanded, setMakeupsAssignedExpanded] = useState(false);
  const [paymentsInWorkExpanded, setPaymentsInWorkExpanded] = useState(false);
  const [operationsExpanded, setOperationsExpanded] = useState(false);
  const [leadsExpanded, setLeadsExpanded] = useState(false);
  const [lessonsExpanded, setLessonsExpanded] = useState(false);
  const [allTasksExpandedState, setAllTasksExpandedState] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateEditId, setTemplateEditId] = useState<number | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateSubtasks, setTemplateSubtasks] = useState<{ text: string; order: number }[]>([]);
  const [templateStudentIds, setTemplateStudentIds] = useState<number[]>([]);
  const [templateSelectedStudents, setTemplateSelectedStudents] = useState<Student[]>([]);
  const [templateStudentOptions, setTemplateStudentOptions] = useState<Student[]>([]);
  const [templateStudentSearchLoading, setTemplateStudentSearchLoading] = useState(false);
  const templateStudentSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [templateRepeatEnabled, setTemplateRepeatEnabled] = useState(false);
  const [templateRepeatFrequency, setTemplateRepeatFrequency] = useState<RepeatFrequency | ''>('');
  const [templateRepeatDays, setTemplateRepeatDays] = useState<number[]>([]);
  const [templateRepeatEndType, setTemplateRepeatEndType] = useState<RepeatEndType>('never');
  const [templateRepeatEndAfterCount, setTemplateRepeatEndAfterCount] = useState<number>(1);
  const [templateRepeatEndUntil, setTemplateRepeatEndUntil] = useState<string>('');
  const [templateSaving, setTemplateSaving] = useState(false);

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskEditId, setTaskEditId] = useState<number | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskCategory, setTaskCategory] = useState<TaskCategory>('schools');
  const [taskTemplateId, setTaskTemplateId] = useState<number | ''>('');
  const [taskSubtasks, setTaskSubtasks] = useState<{ text: string; order: number }[]>([]);
  const [taskStudentIds, setTaskStudentIds] = useState<number[]>([]);
  const [taskSelectedStudents, setTaskSelectedStudents] = useState<Student[]>([]);
  const [taskStudentOptions, setTaskStudentOptions] = useState<Student[]>([]);
  const [taskStudentSearchLoading, setTaskStudentSearchLoading] = useState(false);
  const taskStudentSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [taskRepeatEnabled, setTaskRepeatEnabled] = useState(false);
  const [taskRepeatFrequency, setTaskRepeatFrequency] = useState<RepeatFrequency | ''>('');
  const [taskRepeatDays, setTaskRepeatDays] = useState<number[]>([]);
  const [taskRepeatEndType, setTaskRepeatEndType] = useState<RepeatEndType>('never');
  const [taskRepeatEndAfterCount, setTaskRepeatEndAfterCount] = useState<number>(1);
  const [taskRepeatEndUntil, setTaskRepeatEndUntil] = useState<string>('');
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskIsParentResponses, setTaskIsParentResponses] = useState(false);
  const [followUpSourceTask, setFollowUpSourceTask] = useState<TaskResponse | null>(null);

  const [bulkTaskId, setBulkTaskId] = useState<number | null>(null);
  const [bulkText, setBulkText] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    if (!canManageTasks) return;
    try {
      const data = await tasksApi.listTemplates();
      setTemplates(data);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось загрузить шаблоны'));
    }
  }, [canManageTasks]);

  const loadTasks = useCallback(async () => {
    try {
      const data = await tasksApi.listTasks(statusFilter || undefined, categoryFilter);
      setTasks(data);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось загрузить задачи'));
    }
  }, [statusFilter, categoryFilter]);

  const loadStudents = useCallback(async () => {
    if (!canManageTasks) return;
    try {
      const data = await studentsApi.getAll();
      setStudents(Array.isArray(data) ? data : []);
    } catch {
      setStudents([]);
    }
  }, [canManageTasks]);

  const loadLessonTasks = useCallback(async () => {
    if (!canSeeLessonTasks) return;
    setLessonTasksLoading(true);
    try {
      const res = await salesApi.listLessonTasksToday();
      setLessonTasks(res.items || []);
    } catch {
      setLessonTasks([]);
    } finally {
      setLessonTasksLoading(false);
    }
  }, [canSeeLessonTasks]);

  const loadLessonTasksTomorrow = useCallback(async () => {
    if (!canSeeLessonTasks) return;
    setLessonTasksTomorrowLoading(true);
    try {
      const res = await salesApi.listLessonTasksTomorrow();
      setLessonTasksTomorrow(res.items || []);
    } catch {
      setLessonTasksTomorrow([]);
    } finally {
      setLessonTasksTomorrowLoading(false);
    }
  }, [canSeeLessonTasks]);

  const loadLessonTasksWeek = useCallback(async () => {
    if (!canSeeLessonTasks) return;
    setLessonTasksWeekLoading(true);
    try {
      const res = await salesApi.listLessonTasksWeek();
      setLessonTasksWeek(res.items || []);
    } catch {
      setLessonTasksWeek([]);
    } finally {
      setLessonTasksWeekLoading(false);
    }
  }, [canSeeLessonTasks]);

  const loadTodayTasks = useCallback(async () => {
    setTodayTasksLoading(true);
    try {
      const data = await tasksApi.listTodayTasks(todayPlanTab, categoryFilter);
      setTodayTasks(Array.isArray(data) ? data : []);
    } catch {
      setTodayTasks([]);
    } finally {
      setTodayTasksLoading(false);
    }
  }, [todayPlanTab, categoryFilter]);

  const loadDayStats = useCallback(async () => {
    try {
      const res = await tasksApi.getDayStats();
      setDayStats({ completed_count: res.completed_count });
    } catch {
      setDayStats(null);
    }
  }, []);

  const loadOverdueCount = useCallback(async () => {
    try {
      const data = await tasksApi.listTodayTasks('overdue', categoryFilter);
      setOverdueCount(Array.isArray(data) ? data.length : 0);
    } catch {
      setOverdueCount(null);
    }
  }, [categoryFilter]);

  const loadDayDesk = useCallback(async () => {
    if (!isSales) return;
    setDayDeskLoading(true);
    try {
      const data = await tasksApi.getDayDesk();
      setDayDesk(data);
    } catch (e: unknown) {
      setDayDesk(null);
      setError(extractApiError(e, 'Не удалось загрузить рабочий стол дня'));
    } finally {
      setDayDeskLoading(false);
    }
  }, [isSales]);

  const loadAbsenceMakeupsForDesk = useCallback(async () => {
    if (!isSales) return;
    try {
      const items = await salesApi.getAbsences({ stage: 'missed' });
      const sorted = [...items].sort((a, b) => (a.lesson_date || '').localeCompare(b.lesson_date || ''));
      setAbsenceMakeupsTodo(sorted.slice(0, 10));
    } catch {
      setAbsenceMakeupsTodo([]);
    }
  }, [isSales]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      await Promise.all([
        loadTasks(),
        loadTemplates(),
        loadStudents(),
        loadLessonTasks(),
        loadLessonTasksTomorrow(),
        loadLessonTasksWeek(),
      ]);
      setLoading(false);
    };
    run();
  }, [loadTasks, loadTemplates, loadStudents, loadLessonTasks, loadLessonTasksTomorrow, loadLessonTasksWeek]);

  useEffect(() => {
    if (isSales) {
      setShowTodayPlan(true);
      setAllTasksExpandedState(false);
    }
  }, [isSales]);

  useEffect(() => {
    if (isSales && tab === 0) {
      void (async () => {
        await Promise.all([loadDayDesk(), loadAbsenceMakeupsForDesk()]);
      })();
    }
  }, [isSales, tab, loadDayDesk, loadAbsenceMakeupsForDesk]);

  const workTodayTabInitialized = useRef(false);
  // По умолчанию открывать таб «В работе сегодня» с наибольшим числом задач (только при первой загрузке)
  useEffect(() => {
    if (!dayDesk || !isSales || workTodayTabInitialized.current) return;
    workTodayTabInitialized.current = true;
    const filter = (t: TaskResponse) => !hideCompletedInDesk || t.progress < 100;
    const p = dayDesk.parents.filter(filter).length;
    const m = dayDesk.makeups.filter(filter).length;
    const pay = dayDesk.payments.filter(filter).length;
    const max = Math.max(p, m, pay);
    if (max === 0) return;
    if (pay === max) setWorkTodayTab('payments');
    else if (m === max) setWorkTodayTab('makeups');
    else setWorkTodayTab('parents');
  }, [dayDesk, hideCompletedInDesk, isSales]);

  useEffect(() => {
    if (tab === 0 && (showTodayPlan || isSales)) {
      loadTodayTasks();
      loadDayStats();
      loadOverdueCount();
    }
  }, [tab, showTodayPlan, isSales, loadTodayTasks, loadDayStats, loadOverdueCount]);

  const handleBulkCreate = async (taskId: number) => {
    const titles = bulkText.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!titles.length) return;
    setBulkLoading(true);
    setBulkError(null);
    try {
      await tasksApi.bulkCreateSubtasks(taskId, titles);
      setBulkText('');
      setBulkTaskId(null);
      await loadTasks();
    } catch (e: unknown) {
      setBulkError(extractApiError(e, 'Не удалось создать подзадачи'));
    } finally {
      setBulkLoading(false);
    }
  };

  const handleSubtaskToggle = async (task: TaskResponse, subtask: TaskSubtaskResponse) => {
    try {
      await tasksApi.updateSubtask(task.id, subtask.id, { completed: !subtask.completed });
      await loadTasks();
      const promises: Promise<unknown>[] = [];
      if (showTodayPlan || isSales) {
        promises.push(loadTodayTasks(), loadDayStats(), loadOverdueCount());
      }
      if (isSales) {
        promises.push(loadDayDesk());
      }
      if (promises.length > 0) {
        await Promise.all(promises);
      }
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось обновить подзадачу'));
    }
  };

  const openTemplateDialog = (t?: TaskTemplateResponse) => {
    setTemplateEditId(t?.id ?? null);
    setTemplateName(t?.name ?? '');
    setTemplateSubtasks(t?.subtasks?.map((s) => ({ text: s.text, order: s.order })) ?? [{ text: '', order: 0 }]);
    setTemplateStudentIds(t?.student_ids ?? []);
    setTemplateRepeatEnabled(t?.repeat_enabled ?? false);
    setTemplateRepeatFrequency((t?.repeat_frequency as RepeatFrequency) ?? '');
    setTemplateRepeatDays(t?.repeat_days ?? []);
    setTemplateRepeatEndType((t?.repeat_end_type as RepeatEndType) ?? 'never');
    setTemplateRepeatEndAfterCount(t?.repeat_end_after_count ?? 1);
    setTemplateRepeatEndUntil(t?.repeat_end_until ? t.repeat_end_until.slice(0, 10) : '');
    setTemplateDialogOpen(true);
  };

  const saveTemplate = async () => {
    setTemplateSaving(true);
    setError(null);
    try {
      const subtasks = templateSubtasks.filter((s) => s.text.trim());
      const repeatPayload = {
        repeat_enabled: templateRepeatEnabled,
        repeat_frequency: templateRepeatEnabled && templateRepeatFrequency ? templateRepeatFrequency : undefined,
        repeat_days: templateRepeatEnabled && templateRepeatDays.length > 0 ? templateRepeatDays : undefined,
        repeat_end_type: templateRepeatEnabled ? templateRepeatEndType : undefined,
        repeat_end_after_count: templateRepeatEnabled && templateRepeatEndType === 'after_count' ? templateRepeatEndAfterCount : undefined,
        repeat_end_until: templateRepeatEnabled && templateRepeatEndType === 'until_date' && templateRepeatEndUntil ? templateRepeatEndUntil : undefined,
      };
      const studentIds = templateSelectedStudents.map((s) => s.id);
      if (templateEditId) {
        await tasksApi.updateTemplate(templateEditId, {
          name: templateName.trim(),
          subtasks: subtasks.map((s, i) => ({ text: s.text.trim(), order: i })),
          student_ids: studentIds,
          ...repeatPayload,
        });
      } else {
        await tasksApi.createTemplate({
          name: templateName.trim(),
          subtasks: subtasks.map((s, i) => ({ text: s.text.trim(), order: i })),
          student_ids: studentIds,
          ...repeatPayload,
        });
      }
      setTemplateDialogOpen(false);
      loadTemplates();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить шаблон'));
    } finally {
      setTemplateSaving(false);
    }
  };

  const deleteTemplate = async (id: number) => {
    if (!window.confirm('Удалить шаблон?')) return;
    try {
      await tasksApi.deleteTemplate(id);
      loadTemplates();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось удалить шаблон'));
    }
  };

  const openTaskDialog = (task?: TaskResponse, templateId?: number, cloneAsNew = false) => {
    setTaskEditId(cloneAsNew ? null : task?.id ?? null);
    setTaskTitle(task?.title ?? '');
    setTaskDescription(task?.description ?? '');
    setTaskCategory(normalizeTaskCategory(task?.category, categoryFilter));
    setTaskTemplateId(cloneAsNew ? '' : task?.template_id ?? templateId ?? '');
    setTaskSubtasks(task?.subtasks?.map((s) => ({ text: s.text, order: s.order })) ?? []);
    setTaskStudentIds(task?.student_ids ?? []);
    setTaskRepeatEnabled(task?.repeat_enabled ?? false);
    setTaskRepeatFrequency((task?.repeat_frequency as RepeatFrequency) ?? '');
    setTaskRepeatDays(task?.repeat_days ?? []);
    setTaskRepeatEndType((task?.repeat_end_type as RepeatEndType) ?? 'never');
    setTaskRepeatEndAfterCount(task?.repeat_end_after_count ?? 1);
    setTaskRepeatEndUntil(task?.repeat_end_until ? task.repeat_end_until.slice(0, 10) : '');
    setTaskIsParentResponses(task?.tags?.includes('parent_responses') ?? false);
    setTaskDialogOpen(true);
  };

  const openedFromUrlRef = useRef(false);
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || openedFromUrlRef.current) return;
    const taskId = Number(openId);
    if (Number.isNaN(taskId)) return;
    openedFromUrlRef.current = true;
    setSearchParams((prev) => { prev.delete('open'); return prev; }, { replace: true });
    tasksApi.getTask(taskId).then((found) => {
      openTaskDialog(found);
    }).catch(() => { /* task not found or no access — ignore */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const refreshAfterTaskChange = () => {
    loadTasks();
    loadDayDesk();
    if (showTodayPlan || isSales) {
      loadTodayTasks();
      loadDayStats();
      loadOverdueCount();
    }
  };

  const completeTaskAndOfferFollowUp = async (task: TaskResponse) => {
    setError(null);
    try {
      await tasksApi.completeTask(task.id);
      refreshAfterTaskChange();
      setFollowUpSourceTask(task);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось завершить задачу'));
    }
  };

  const saveTask = async () => {
    setTaskSaving(true);
    setError(null);
    try {
      const subtasks = taskSubtasks.filter((s) => s.text.trim());
      const taskRepeatPayload = {
        repeat_enabled: taskRepeatEnabled,
        repeat_frequency: taskRepeatEnabled && taskRepeatFrequency ? taskRepeatFrequency : undefined,
        repeat_days: taskRepeatEnabled && taskRepeatDays.length > 0 ? taskRepeatDays : undefined,
        repeat_end_type: taskRepeatEnabled ? taskRepeatEndType : undefined,
        repeat_end_after_count: taskRepeatEnabled && taskRepeatEndType === 'after_count' ? taskRepeatEndAfterCount : undefined,
        repeat_end_until: taskRepeatEnabled && taskRepeatEndType === 'until_date' && taskRepeatEndUntil ? taskRepeatEndUntil : undefined,
      };
      const studentIds = taskSelectedStudents.map((s) => s.id);
      const tags = taskIsParentResponses ? ['parent_responses'] : undefined;
      if (taskEditId) {
        await tasksApi.updateTask(taskEditId, {
          title: taskTitle.trim(),
          description: taskDescription.trim() || undefined,
          student_ids: studentIds,
          tags,
          ...taskRepeatPayload,
        });
      } else {
        await tasksApi.createTask({
          title: taskTitle.trim() || undefined,
          description: taskDescription.trim() || undefined,
          template_id: taskTemplateId || undefined,
          category: taskIsParentResponses ? 'parents' : taskCategory,
          subtasks: taskTemplateId ? undefined : (subtasks.length ? subtasks.map((s, i) => ({ text: s.text.trim(), order: i })) : undefined),
          student_ids: studentIds,
          tags,
          ...taskRepeatPayload,
        });
      }
      setTaskDialogOpen(false);
      refreshAfterTaskChange();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось сохранить задачу'));
    } finally {
      setTaskSaving(false);
    }
  };

  const archiveTask = async (id: number) => {
    try {
      await tasksApi.updateTask(id, { status: 'archived' });
      loadTasks();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось архивировать'));
    }
  };

  const deleteTask = async (id: number) => {
    if (!window.confirm('Удалить задачу?')) return;
    try {
      await tasksApi.deleteTask(id);
      loadTasks();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось удалить задачу'));
    }
  };

  const addTemplateSubtask = () => setTemplateSubtasks((prev) => [...prev, { text: '', order: prev.length }]);
  const moveTemplateSubtask = (index: number, delta: number) => {
    setTemplateSubtasks((prev) => {
      const newIndex = index + delta;
      if (newIndex < 0 || newIndex >= prev.length) return prev;
      const arr = [...prev];
      const [item] = arr.splice(index, 1);
      arr.splice(newIndex, 0, item);
      return arr.map((s, i) => ({ ...s, order: i }));
    });
  };
  const addTaskSubtask = () => setTaskSubtasks((prev) => [...prev, { text: '', order: prev.length }]);

  useEffect(() => {
    if (!taskDialogOpen || !taskTemplateId || taskEditId) return;
    const t = templates.find((x) => x.id === taskTemplateId);
    if (t) {
      setTaskTitle(t.name);
      setTaskStudentIds(t.student_ids ?? []);
      setTaskSubtasks(t.subtasks?.map((s) => ({ text: s.text, order: s.order })) ?? []);
      setTaskRepeatEnabled(t.repeat_enabled ?? false);
      setTaskRepeatFrequency((t.repeat_frequency as RepeatFrequency) ?? '');
      setTaskRepeatDays(t.repeat_days ?? []);
      setTaskRepeatEndType((t.repeat_end_type as RepeatEndType) ?? 'never');
      setTaskRepeatEndAfterCount(t.repeat_end_after_count ?? 1);
      setTaskRepeatEndUntil(t.repeat_end_until ? t.repeat_end_until.slice(0, 10) : '');
    }
  }, [taskTemplateId, taskDialogOpen, taskEditId, templates]);

  // Загрузить выбранных учеников для шаблона при открытии диалога
  useEffect(() => {
    if (!templateDialogOpen || !canManageTasks) return;
    if (templateStudentIds.length === 0) {
      setTemplateSelectedStudents([]);
      return;
    }
    studentsApi.getAll({ ids: templateStudentIds.join(',') }).then(setTemplateSelectedStudents).catch(() => setTemplateSelectedStudents([]));
  }, [templateDialogOpen, templateStudentIds.join(',')]);

  // Загрузить выбранных учеников для задачи при открытии диалога
  useEffect(() => {
    if (!taskDialogOpen) return;
    if (taskStudentIds.length === 0) {
      setTaskSelectedStudents([]);
      return;
    }
    studentsApi.getAll({ ids: taskStudentIds.join(',') }).then(setTaskSelectedStudents).catch(() => setTaskSelectedStudents([]));
  }, [taskDialogOpen, taskStudentIds.join(',')]);

  return (
    <Layout>
      <Stack spacing={2}>
        {/* Компактный хедер */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Typography variant="h4">Задачи</Typography>
          <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1} sx={{ flex: 1, minWidth: 200, justifyContent: 'flex-end' }}>
            <TextField
              size="small"
              placeholder="Поиск задач..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ maxWidth: 260 }}
            />
            {canManageTasks && (
              <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 40, '& .MuiTab-root': { minHeight: 40 } }}>
                <Tab label="Задачи" />
                <Tab label="Шаблоны задач" />
              </Tabs>
            )}
            {(canManageTasks || isTrainer) && (
              <FormControlLabel
                control={
                  <Switch
                    checked={showTodayPlan}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setShowTodayPlan(v);
                      try {
                        window.localStorage.setItem(SHOW_TODAY_PLAN_KEY, v ? '1' : '0');
                      } catch {}
                    }}
                    color="primary"
                  />
                }
                label="План на сегодня"
              />
            )}
          </Stack>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        {isSales && tab === 0 && (
          <Stack spacing={2}>
            {/* План на сегодня — KPI-карточки */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>План на сегодня</Typography>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', bgcolor: 'background.default' }}>
                    <Typography variant="h4" color={dayDesk && dayDesk.stats.overdue > 0 ? 'error.main' : 'text.primary'}>
                      {dayDesk ? dayDesk.stats.overdue : '—'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">Просрочено</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', bgcolor: 'background.default' }}>
                    <Typography variant="h4">{dayDesk ? dayDesk.stats.today : '—'}</Typography>
                    <Typography variant="body2" color="text.secondary">На сегодня</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', bgcolor: 'background.default' }}>
                    <Typography variant="h4" color="success.main">{dayDesk ? dayDesk.stats.completed_today : '—'}</Typography>
                    <Typography variant="body2" color="text.secondary">Выполнено сегодня</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', bgcolor: dayDesk && dayDesk.stats.overload > 0 ? 'error.light' : 'background.default' }}>
                    <Typography variant="h4" color={dayDesk && dayDesk.stats.overload > 0 ? 'error.dark' : 'text.primary'}>
                      {dayDesk && dayDesk.stats.overload > 0 ? `+${dayDesk.stats.overload}` : '0'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">Перегруз</Typography>
                  </Paper>
                </Grid>
              </Grid>
              <Stack direction="row" flexWrap="wrap" alignItems="center" gap={1}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={hideCompletedInDesk}
                      onChange={(e) => setHideCompletedInDesk(e.target.checked)}
                    />
                  }
                  label="Скрыть выполненные"
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => urgentBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  Начать работу
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    setTodayPlanTab('today');
                    setShowTodayPlan(true);
                    document.getElementById('root')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  Показать всё на сегодня
                </Button>
              </Stack>
            </Paper>

            {dayDeskLoading && <Typography color="text.secondary">Загрузка рабочего стола...</Typography>}

            {dayDesk && (
              <Stack spacing={3}>
                {/* Срочно — во всю ширину, макс. 3 на первом экране */}
                {dayDesk.urgent.length > 0 && (
                  <Box ref={urgentBlockRef}>
                    <Typography variant="h6" gutterBottom>🔥 Срочно</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Жёсткий дедлайн сегодня</Typography>
                    <Stack spacing={1}>
                      {dayDesk.urgent
                        .filter((t) => !hideCompletedInDesk || t.progress < 100)
                        .slice(0, urgentExpanded ? undefined : 3)
                        .map((task) => {
                          const dueLabel = task.due_at
                            ? (() => {
                                try {
                                  const d = new Date(task.due_at);
                                  return `до ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes()
                                    .toString()
                                    .padStart(2, '0')}`;
                                } catch {
                                  return null;
                                }
                              })()
                            : task.scheduled_for
                            ? 'Срок: сегодня'
                            : null;
                          const categoryLabel =
                            task.category === 'parents' ? 'Родители' : task.category === 'leads' ? 'Лиды' : 'Школы';
                          const firstSubtasks = (task.subtasks || []).slice(0, 5);
                          return (
                            <Card key={task.id} variant="outlined" sx={{ py: 0 }}>
                              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                <Stack
                                  direction="column"
                                  alignItems="flex-start"
                                  spacing={1}
                                >
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle2">{task.title}</Typography>
                                    <Stack
                                      direction="row"
                                      alignItems="center"
                                      spacing={0.5}
                                      sx={{ mt: 0.5 }}
                                      flexWrap="wrap"
                                    >
                                      <Chip size="small" label={categoryLabel} variant="outlined" sx={{ height: 20 }} />
                                      {dueLabel && (
                                        <Chip size="small" label={dueLabel} color="warning" sx={{ height: 20 }} />
                                      )}
                                      {task.priority === 'high' && (
                                        <Chip size="small" label="Важная" color="error" sx={{ height: 20 }} />
                                      )}
                                      {task.tags?.map((tag) => (
                                        <Chip
                                          key={tag}
                                          size="small"
                                          label={tag}
                                          variant="outlined"
                                          sx={{ height: 20 }}
                                        />
                                      ))}
                                    </Stack>
                                    <LinearProgress
                                      variant="determinate"
                                      value={task.progress}
                                      sx={{ width: '100%', maxWidth: 200, height: 6, borderRadius: 1, mt: 0.5 }}
                                    />
                                    {firstSubtasks.length > 0 && (
                                      <Stack
                                        direction="row"
                                        flexWrap="wrap"
                                        alignItems="center"
                                        sx={{ mt: 0.5 }}
                                        gap={0.5}
                                      >
                                        {firstSubtasks.map((st) => (
                                          <FormControlLabel
                                            key={st.id}
                                            control={
                                              <Checkbox
                                                size="small"
                                                checked={st.completed}
                                                onChange={() => handleSubtaskToggle(task, st)}
                                              />
                                            }
                                            label={
                                              <Typography
                                                variant="caption"
                                                sx={{ textDecoration: st.completed ? 'line-through' : 'none' }}
                                              >
                                                {st.text.length > 30 ? st.text.slice(0, 30) + '…' : st.text}
                                              </Typography>
                                            }
                                            sx={{ m: 0 }}
                                          />
                                        ))}
                                      </Stack>
                                    )}
                                  </Box>
                                  <Stack
                                    direction="row"
                                    spacing={0.5}
                                    alignItems="center"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="primary"
                                      onClick={() => openTaskDialog(task)}
                                    >
                                      Открыть
                                    </Button>
                                    {task.status === 'active' && (
                                      <>
                                        <Button
                                          size="small"
                                          variant="contained"
                                          color="success"
                                          onClick={() => void completeTaskAndOfferFollowUp(task)}
                                        >
                                          Завершить
                                        </Button>
                                        <Button
                                          size="small"
                                          variant="outlined"
                                          onClick={() =>
                                            tasksApi
                                              .postponeTask(task.id)
                                              .then(() => {
                                                loadTasks();
                                                loadDayDesk();
                                                if (showTodayPlan || isSales) {
                                                  loadTodayTasks();
                                                  loadDayStats();
                                                  loadOverdueCount();
                                                }
                                              })
                                              .catch((e) =>
                                                setError(extractApiError(e, 'Не удалось отложить задачу')),
                                              )
                                          }
                                        >
                                          Отложить
                                        </Button>
                                        {!isTrainer && (
                                          <Button
                                            size="small"
                                            variant={task.pinned_today ? 'contained' : 'outlined'}
                                            color="secondary"
                                            onClick={() =>
                                              tasksApi
                                                .pinTaskToday(task.id, !task.pinned_today)
                                                .then(() => {
                                                  loadTasks();
                                                  loadDayDesk();
                                                  if (showTodayPlan || isSales) {
                                                    loadTodayTasks();
                                                    loadDayStats();
                                                    loadOverdueCount();
                                                  }
                                                })
                                                .catch((e) =>
                                                  setError(
                                                    extractApiError(e, 'Не удалось изменить статус в плане'),
                                                  ),
                                                )
                                            }
                                          >
                                            {task.pinned_today ? 'В плане' : 'В план'}
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </Stack>
                                </Stack>
                              </CardContent>
                            </Card>
                                        );
                        })}
                    </Stack>
                    {dayDesk.urgent.filter((t) => !hideCompletedInDesk || t.progress < 100).length > 3 && !urgentExpanded && (
                      <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={() => setUrgentExpanded(true)}>
                        Показать все срочные
                      </Button>
                    )}
                  </Box>
                )}

                {/* В работе сегодня — один блок с табами */}
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>В работе сегодня</Typography>
                  <Tabs value={workTodayTab} onChange={(_, v: 'parents' | 'makeups' | 'payments') => setWorkTodayTab(v)} sx={{ mb: 2, minHeight: 40, '& .MuiTab-root': { minHeight: 40 } }}>
                    <Tab label="Родители" value="parents" />
                    <Tab label="Отработки" value="makeups" />
                    <Tab label="Оплаты" value="payments" />
                  </Tabs>

                  {workTodayTab === 'parents' && (
                    <Box>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }} flexWrap="wrap">
                        <Typography variant="subtitle1">Родители</Typography>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => {
                        setCategoryFilter('parents');
                        setTaskIsParentResponses(false);
                        openTaskDialog(undefined);
                      }}
                    >
                      Задача от родителя
                    </Button>
                  </Stack>
                  {dayDesk.parents.length === 0 ? (
                    <Typography color="text.secondary">Нет задач.</Typography>
                  ) : (
                    <Stack spacing={1}>
                      {(() => {
                        const list = dayDesk.parents.filter((t) => !hideCompletedInDesk || t.progress < 100);
                        const show = parentsInWorkExpanded ? list : list.slice(0, 5);
                        return (
                          <React.Fragment>
                            {show.map((task) => {
                          const dueLabel = task.due_at
                            ? (() => {
                                try {
                                  const d = new Date(task.due_at);
                                  return `до ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes()
                                    .toString()
                                    .padStart(2, '0')}`;
                                } catch {
                                  return null;
                                }
                              })()
                            : task.scheduled_for
                            ? 'Срок: сегодня'
                            : null;
                          const categoryLabel =
                            task.category === 'parents' ? 'Родители' : task.category === 'leads' ? 'Лиды' : 'Школы';
                          const firstSubtasks = (task.subtasks || []).slice(0, 5);
                          return (
                            <Card key={task.id} variant="outlined" sx={{ py: 0 }}>
                              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                <Stack spacing={1}>
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle2">{task.title}</Typography>
                                    {task.tags?.includes('parent_responses') && (
                                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                        Ответов сегодня: {task.counters?.parent_replies ?? 0}{' '}
                                        · Передано тренеру: {task.counters?.parent_escalations ?? 0}{' '}
                                        · Передано руководству: {task.counters?.parent_to_management ?? 0}
                                      </Typography>
                                    )}
                                    <Stack
                                      direction="row"
                                      alignItems="center"
                                      spacing={0.5}
                                      sx={{ mt: 0.5 }}
                                      flexWrap="wrap"
                                    >
                                      <Chip size="small" label={categoryLabel} variant="outlined" sx={{ height: 20 }} />
                                      {dueLabel && (
                                        <Chip size="small" label={dueLabel} color="warning" sx={{ height: 20 }} />
                                      )}
                                      {task.priority === 'high' && (
                                        <Chip size="small" label="Важная" color="error" sx={{ height: 20 }} />
                                      )}
                                      {task.tags?.map((tag) => (
                                        <Chip
                                          key={tag}
                                          size="small"
                                          label={tag}
                                          variant="outlined"
                                          sx={{ height: 20 }}
                                        />
                                      ))}
                                    </Stack>
                                    <LinearProgress
                                      variant="determinate"
                                      value={task.progress}
                                      sx={{ width: '100%', maxWidth: 200, height: 6, borderRadius: 1, mt: 0.5 }}
                                    />
                                    {firstSubtasks.length > 0 && (
                                      <Stack
                                        direction="row"
                                        flexWrap="wrap"
                                        alignItems="center"
                                        sx={{ mt: 0.5 }}
                                        gap={0.5}
                                      >
                                        {firstSubtasks.map((st) => (
                                          <FormControlLabel
                                            key={st.id}
                                            control={
                                              <Checkbox
                                                size="small"
                                                checked={st.completed}
                                                onChange={() => handleSubtaskToggle(task, st)}
                                              />
                                            }
                                            label={
                                              <Typography
                                                variant="caption"
                                                sx={{ textDecoration: st.completed ? 'line-through' : 'none' }}
                                              >
                                                {st.text.length > 30 ? st.text.slice(0, 30) + '…' : st.text}
                                              </Typography>
                                            }
                                            sx={{ m: 0 }}
                                          />
                                        ))}
                                      </Stack>
                                    )}
                                  </Box>
                                  <Stack
                                    direction="row"
                                    spacing={0.5}
                                    alignItems="center"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {task.tags?.includes('parent_responses') && (
                                      <>
                                        <Button
                                          size="small"
                                          variant="contained"
                                          onClick={() =>
                                            tasksApi
                                              .incrementTaskCounter(task.id, 'parent_replies', 1)
                                              .then(() => {
                                                loadTasks();
                                                loadDayDesk();
                                              })
                                              .catch((e) =>
                                                setError(extractApiError(e, 'Не удалось увеличить счётчик')),
                                              )
                                          }
                                          sx={{ mr: 1 }}
                                        >
                                          + Ответил родителю
                                        </Button>
                                        <Button
                                          size="small"
                                          variant="outlined"
                                          onClick={() =>
                                            tasksApi
                                              .incrementTaskCounter(task.id, 'parent_escalations', 1)
                                              .then(() => {
                                                loadTasks();
                                                loadDayDesk();
                                              })
                                              .catch((e) =>
                                                setError(extractApiError(e, 'Не удалось увеличить счётчик')),
                                              )
                                          }
                                          sx={{ mr: 1 }}
                                        >
                                          + Передал вопрос тренеру
                                        </Button>
                                        <Button
                                          size="small"
                                          variant="outlined"
                                          onClick={() =>
                                            tasksApi
                                              .incrementTaskCounter(task.id, 'parent_to_management', 1)
                                              .then(() => {
                                                loadTasks();
                                                loadDayDesk();
                                              })
                                              .catch((e) =>
                                                setError(extractApiError(e, 'Не удалось увеличить счётчик')),
                                              )
                                          }
                                          sx={{ mr: 1 }}
                                        >
                                          + Передал вопрос руководству
                                        </Button>
                                      </>
                                    )}
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="primary"
                                      onClick={() => openTaskDialog(task)}
                                    >
                                      Открыть
                                    </Button>
                                    {task.status === 'active' && (
                                      <>
                                        <Button
                                          size="small"
                                          variant="contained"
                                          color="success"
                                          onClick={() => void completeTaskAndOfferFollowUp(task)}
                                        >
                                          Завершить
                                        </Button>
                                        <Button
                                          size="small"
                                          variant="outlined"
                                          onClick={() =>
                                            tasksApi
                                              .postponeTask(task.id)
                                              .then(() => {
                                                loadTasks();
                                                loadDayDesk();
                                                if (showTodayPlan || isSales) {
                                                  loadTodayTasks();
                                                  loadDayStats();
                                                  loadOverdueCount();
                                                }
                                              })
                                              .catch((e) =>
                                                setError(extractApiError(e, 'Не удалось отложить задачу')),
                                              )
                                          }
                                        >
                                          Отложить
                                        </Button>
                                        {!isTrainer && (
                                          <Button
                                            size="small"
                                            variant={task.pinned_today ? 'contained' : 'outlined'}
                                            color="secondary"
                                            onClick={() =>
                                              tasksApi
                                                .pinTaskToday(task.id, !task.pinned_today)
                                                .then(() => {
                                                  loadTasks();
                                                  loadDayDesk();
                                                  if (showTodayPlan || isSales) {
                                                    loadTodayTasks();
                                                    loadDayStats();
                                                    loadOverdueCount();
                                                  }
                                                })
                                                .catch((e) =>
                                                  setError(
                                                    extractApiError(e, 'Не удалось изменить статус в плане'),
                                                  ),
                                                )
                                            }
                                          >
                                            {task.pinned_today ? 'В плане' : 'В план'}
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </Stack>
                                </Stack>
                              </CardContent>
                            </Card>
                          );
                            })}
                            {list.length > 5 && !parentsInWorkExpanded && (
                              <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={() => setParentsInWorkExpanded(true)}>Показать все</Button>
                            )}
                          </React.Fragment>
                        );
                      })()}
                    </Stack>
                  )}
                    </Box>
                  )}

                  {workTodayTab === 'makeups' && (
                <Box>
                {(absenceMakeupsTodo.length > 0 || dayDesk.makeups.length > 0) ? (
                  <React.Fragment>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" sx={{ mb: 1 }}>
                      <Typography variant="subtitle1">Отработки</Typography>
                      <Button size="small" variant="outlined" component={Link} to="/operations/absences">Открыть список пропусков</Button>
                    </Stack>
                    <Stack
                      direction={{ xs: 'column', md: 'row' }}
                      spacing={2}
                      alignItems="flex-start"
                      sx={{ mt: 1 }}
                    >
                      {absenceMakeupsTodo.length > 0 && (
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                            Нужна отработка ({absenceMakeupsTodo.length > 10 ? '10+' : absenceMakeupsTodo.length})
                          </Typography>
                          <Stack spacing={1}>
                            {absenceMakeupsTodo.map((a) => (
                              <Card key={a.id} variant="outlined" sx={{ py: 0 }}>
                                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                  <Typography variant="subtitle2">
                                    {a.student_name || `Ученик #${a.student_id}`}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {a.group_name || `Группа #${a.group_id}`} · {formatShortDate(a.lesson_date)}
                                    {a.program_name && ` · ${a.program_name}`}
                                  </Typography>
                                  {a.absence_reason && (
                                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                      Причина:{' '}
                                      {ABSENCE_REASON_LABELS[a.absence_reason] || a.absence_reason}
                                      {a.absence_comment && ` — ${a.absence_comment}`}
                                    </Typography>
                                  )}
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    sx={{ mt: 1 }}
                                    component={Link}
                                    to="/operations/absences"
                                  >
                                    Открыть список пропусков
                                  </Button>
                                </CardContent>
                              </Card>
                            ))}
                          </Stack>
                        </Box>
                      )}
                      {dayDesk.makeups.length > 0 && (
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                            Отработка назначена
                          </Typography>
                          <Stack spacing={1}>
                            {(() => {
                              const list = dayDesk.makeups.filter((t) => !hideCompletedInDesk || t.progress < 100);
                              const show = makeupsAssignedExpanded ? list : list.slice(0, 5);
                              return (
                                <React.Fragment>
                                  {show.map((task) => {
                                const dueLabel = task.due_at
                                  ? (() => {
                                      try {
                                        const d = new Date(task.due_at);
                                        return `до ${d.getHours().toString().padStart(2, '0')}:${d
                                          .getMinutes()
                                          .toString()
                                          .padStart(2, '0')}`;
                                      } catch {
                                        return null;
                                      }
                                    })()
                                  : task.scheduled_for
                                  ? 'Срок: сегодня'
                                  : null;
                                const categoryLabel =
                                  task.category === 'parents'
                                    ? 'Родители'
                                    : task.category === 'leads'
                                    ? 'Лиды'
                                    : 'Школы';
                                const firstSubtasks = (task.subtasks || []).slice(0, 5);
                                return (
                                  <Card key={task.id} variant="outlined" sx={{ py: 0 }}>
                                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                      <Stack
                                        direction="row"
                                        alignItems="flex-start"
                                        justifyContent="space-between"
                                        spacing={1}
                                        flexWrap="wrap"
                                      >
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                          <Typography variant="subtitle2">{task.title}</Typography>
                                          <Stack
                                            direction="row"
                                            alignItems="center"
                                            spacing={0.5}
                                            sx={{ mt: 0.5 }}
                                            flexWrap="wrap"
                                          >
                                            <Chip
                                              size="small"
                                              label={categoryLabel}
                                              variant="outlined"
                                              sx={{ height: 20 }}
                                            />
                                            {dueLabel && (
                                              <Chip
                                                size="small"
                                                label={dueLabel}
                                                color="warning"
                                                sx={{ height: 20 }}
                                              />
                                            )}
                                            {task.priority === 'high' && (
                                              <Chip
                                                size="small"
                                                label="Важная"
                                                color="error"
                                                sx={{ height: 20 }}
                                              />
                                            )}
                                            {task.tags?.map((tag) => (
                                              <Chip
                                                key={tag}
                                                size="small"
                                                label={tag}
                                                variant="outlined"
                                                sx={{ height: 20 }}
                                              />
                                            ))}
                                          </Stack>
                                          <LinearProgress
                                            variant="determinate"
                                            value={task.progress}
                                            sx={{ width: '100%', maxWidth: 200, height: 6, borderRadius: 1, mt: 0.5 }}
                                          />
                                          {firstSubtasks.length > 0 && (
                                            <Stack
                                              direction="row"
                                              flexWrap="wrap"
                                              alignItems="center"
                                              sx={{ mt: 0.5 }}
                                              gap={0.5}
                                            >
                                              {firstSubtasks.map((st) => (
                                                <FormControlLabel
                                                  key={st.id}
                                                  control={
                                                    <Checkbox
                                                      size="small"
                                                      checked={st.completed}
                                                      onChange={() => handleSubtaskToggle(task, st)}
                                                    />
                                                  }
                                                  label={
                                                    <Typography
                                                      variant="caption"
                                                      sx={{
                                                        textDecoration: st.completed ? 'line-through' : 'none',
                                                      }}
                                                    >
                                                      {st.text.length > 30 ? st.text.slice(0, 30) + '…' : st.text}
                                                    </Typography>
                                                  }
                                                  sx={{ m: 0 }}
                                                />
                                              ))}
                                            </Stack>
                                          )}
                                        </Box>
                                        <Stack
                                          direction="row"
                                          spacing={0.5}
                                          alignItems="center"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <Button
                                            size="small"
                                            variant="outlined"
                                            color="primary"
                                            onClick={() => openTaskDialog(task)}
                                          >
                                            Открыть
                                          </Button>
                                          {task.status === 'active' && (
                                            <>
                                              <Button
                                                size="small"
                                                variant="contained"
                                                color="success"
                                                onClick={() => void completeTaskAndOfferFollowUp(task)}
                                              >
                                                Завершить
                                              </Button>
                                              <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={() =>
                                                  tasksApi
                                                    .postponeTask(task.id)
                                                    .then(() => {
                                                      loadTasks();
                                                      loadDayDesk();
                                                      if (showTodayPlan || isSales) {
                                                        loadTodayTasks();
                                                        loadDayStats();
                                                        loadOverdueCount();
                                                      }
                                                    })
                                                    .catch((e) =>
                                                      setError(
                                                        extractApiError(e, 'Не удалось отложить задачу'),
                                                      ),
                                                    )
                                                }
                                              >
                                                Отложить
                                              </Button>
                                              {!isTrainer && (
                                                <Button
                                                  size="small"
                                                  variant={task.pinned_today ? 'contained' : 'outlined'}
                                                  color="secondary"
                                                  onClick={() =>
                                                    tasksApi
                                                      .pinTaskToday(task.id, !task.pinned_today)
                                                      .then(() => {
                                                        loadTasks();
                                                        loadDayDesk();
                                                        if (showTodayPlan || isSales) {
                                                          loadTodayTasks();
                                                          loadDayStats();
                                                          loadOverdueCount();
                                                        }
                                                      })
                                                      .catch((e) =>
                                                        setError(
                                                          extractApiError(
                                                            e,
                                                            'Не удалось изменить статус в плане',
                                                          ),
                                                        ),
                                                      )
                                                  }
                                                >
                                                  {task.pinned_today ? 'В плане' : 'В план'}
                                                </Button>
                                              )}
                                            </>
                                          )}
                                        </Stack>
                                      </Stack>
                                    </CardContent>
                                  </Card>
                                );
                                  })}
                                  {list.length > 5 && !makeupsAssignedExpanded && (
                                    <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={() => setMakeupsAssignedExpanded(true)}>Показать все</Button>
                                  )}
                                </React.Fragment>
                              );
                            })()}
                          </Stack>
                        </Box>
                      )}
                    </Stack>
                  </React.Fragment>
                ) : (
                  <Typography color="text.secondary">Нет отработок.</Typography>
                )}
                </Box>
                  )}

                  {workTodayTab === 'payments' && (
                <Box>
                  <Typography variant="subtitle1" gutterBottom>Оплаты и продления</Typography>
                  <Stack spacing={1}>
                    {dayDesk.payments.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">Нет задач.</Typography>
                    ) : (
                      (() => {
                        const payList = [...dayDesk.payments]
                          .filter((t) => !hideCompletedInDesk || t.progress < 100)
                          .sort((a, b) => (a.task_kind === 'payment_overdue' && b.task_kind !== 'payment_overdue' ? -1 : b.task_kind === 'payment_overdue' && a.task_kind !== 'payment_overdue' ? 1 : 0));
                        const showPay = paymentsInWorkExpanded ? payList : payList.slice(0, 5);
                        return (
                          <React.Fragment>
                            {showPay.map((task) => {
                          const isPaymentOverdue = task.task_kind === 'payment_overdue';
                          const studentName = task.student_ids?.length
                            ? (students.find((s) => s.id === task.student_ids[0])?.full_name ?? `Ученик #${task.student_ids[0]}`)
                            : null;
                          const dueLabel = task.due_at
                            ? (() => {
                                try {
                                  const d = new Date(task.due_at);
                                  return `до ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes()
                                    .toString()
                                    .padStart(2, '0')}`;
                                } catch {
                                  return null;
                                }
                              })()
                            : task.scheduled_for
                            ? 'Срок: сегодня'
                            : null;
                          const categoryLabel =
                            task.category === 'parents' ? 'Родители' : task.category === 'leads' ? 'Лиды' : 'Школы';
                          const firstSubtasks = (task.subtasks || []).slice(0, 5);
                          const paymentPaid = task.payment_state === 'paid';
                          return (
                            <Card
                              key={task.id}
                              variant="outlined"
                              sx={{
                                py: 0,
                                ...(paymentPaid && { bgcolor: 'success.50', borderColor: 'success.light' }),
                                ...(isPaymentOverdue && !paymentPaid && { borderColor: 'error.main', borderWidth: 2, bgcolor: 'error.light' }),
                              }}
                            >
                              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                {isPaymentOverdue && !paymentPaid && (
                                  <Chip size="small" label="Просрочено" color="error" sx={{ mb: 1 }} />
                                )}
                                <Stack
                                  direction="row"
                                  alignItems="flex-start"
                                  justifyContent="space-between"
                                  spacing={1}
                                  flexWrap="wrap"
                                >
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle2">{task.title}</Typography>
                                    {isPaymentOverdue && (
                                      <Typography variant="body2" color="text.secondary">
                                        {studentName && `Ученик: ${studentName}`}
                                        {task.payment_parent_name && ` · Родитель: ${task.payment_parent_name}`}
                                        {task.payment_next_date != null && ` · Дата оплаты: ${task.payment_next_date}`}
                                        {task.payment_days_overdue != null && task.payment_days_overdue > 0 && ` · Просрочка: ${task.payment_days_overdue} дн.`}
                                        {task.payment_balance != null && ` · Баланс: ${Number(task.payment_balance).toLocaleString('ru-RU')} ₽`}
                                        {task.reminder_stage != null && ` · ${task.reminder_stage === 1 ? '1-е напоминание' : 'Повтор'}`}
                                      </Typography>
                                    )}
                                    <Stack
                                      direction="row"
                                      alignItems="center"
                                      spacing={0.5}
                                      sx={{ mt: 0.5 }}
                                      flexWrap="wrap"
                                    >
                                      <Chip size="small" label={categoryLabel} variant="outlined" sx={{ height: 20 }} />
                                      {isPaymentOverdue && task.reminder_stage === 1 && (
                                        <Chip size="small" label="Просрочка 3 дня" color="warning" sx={{ height: 20 }} />
                                      )}
                                      {isPaymentOverdue && task.reminder_stage === 2 && (
                                        <Chip size="small" label="Просрочка 10 дней" color="error" sx={{ height: 20 }} />
                                      )}
                                      {isPaymentOverdue && paymentPaid && (
                                        <Chip size="small" label="Оплачено" color="success" sx={{ height: 20 }} />
                                      )}
                                      {!isPaymentOverdue && task.payment_state === 'unpaid' && (
                                        <Chip size="small" label="Не оплачено" color="warning" sx={{ height: 20 }} />
                                      )}
                                      {dueLabel && (
                                        <Chip size="small" label={dueLabel} color="warning" sx={{ height: 20 }} />
                                      )}
                                      {task.priority === 'high' && (
                                        <Chip size="small" label="Важная" color="error" sx={{ height: 20 }} />
                                      )}
                                      {task.tags?.map((tag) => (
                                        <Chip
                                          key={tag}
                                          size="small"
                                          label={tag}
                                          variant="outlined"
                                          sx={{ height: 20 }}
                                        />
                                      ))}
                                    </Stack>
                                    <LinearProgress
                                      variant="determinate"
                                      value={task.progress}
                                      sx={{ width: '100%', maxWidth: 200, height: 6, borderRadius: 1, mt: 0.5 }}
                                    />
                                    {firstSubtasks.length > 0 && (
                                      <Stack
                                        direction="row"
                                        flexWrap="wrap"
                                        alignItems="center"
                                        sx={{ mt: 0.5 }}
                                        gap={0.5}
                                      >
                                        {firstSubtasks.map((st) => (
                                          <FormControlLabel
                                            key={st.id}
                                            control={
                                              <Checkbox
                                                size="small"
                                                checked={st.completed}
                                                onChange={() => handleSubtaskToggle(task, st)}
                                              />
                                            }
                                            label={
                                              <Typography
                                                variant="caption"
                                                sx={{ textDecoration: st.completed ? 'line-through' : 'none' }}
                                              >
                                                {st.text.length > 30 ? st.text.slice(0, 30) + '…' : st.text}
                                              </Typography>
                                            }
                                            sx={{ m: 0 }}
                                          />
                                        ))}
                                      </Stack>
                                    )}
                                  </Box>
                                  <Stack
                                    direction="row"
                                    spacing={0.5}
                                    alignItems="center"
                                    flexWrap="wrap"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {task.student_ids?.[0] != null && (
                                      <Button
                                        size="small"
                                        variant="outlined"
                                        component={Link}
                                        to={`/students?studentId=${task.student_ids[0]}`}
                                      >
                                        Открыть ученика
                                      </Button>
                                    )}
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      component={Link}
                                      to="/finance/payments"
                                    >
                                      Долги и оплаты
                                    </Button>
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="primary"
                                      onClick={() => openTaskDialog(task)}
                                    >
                                      Открыть
                                    </Button>
                                    {task.status === 'active' && (
                                      <>
                                        <Button
                                          size="small"
                                          variant="contained"
                                          color={paymentPaid ? 'success' : 'primary'}
                                          {...(paymentPaid && { sx: { fontWeight: 600 } })}
                                          onClick={() => void completeTaskAndOfferFollowUp(task)}
                                        >
                                          Завершить
                                        </Button>
                                        <Button
                                          size="small"
                                          variant="outlined"
                                          onClick={() =>
                                            tasksApi
                                              .postponeTask(task.id)
                                              .then(() => {
                                                loadTasks();
                                                loadDayDesk();
                                                if (showTodayPlan || isSales) {
                                                  loadTodayTasks();
                                                  loadDayStats();
                                                  loadOverdueCount();
                                                }
                                              })
                                              .catch((e) =>
                                                setError(extractApiError(e, 'Не удалось отложить задачу')),
                                              )
                                          }
                                        >
                                          Отложить
                                        </Button>
                                        {!isTrainer && (
                                          <Button
                                            size="small"
                                            variant={task.pinned_today ? 'contained' : 'outlined'}
                                            color="secondary"
                                            onClick={() =>
                                              tasksApi
                                                .pinTaskToday(task.id, !task.pinned_today)
                                                .then(() => {
                                                  loadTasks();
                                                  loadDayDesk();
                                                  if (showTodayPlan || isSales) {
                                                    loadTodayTasks();
                                                    loadDayStats();
                                                    loadOverdueCount();
                                                  }
                                                })
                                                .catch((e) =>
                                                  setError(
                                                    extractApiError(e, 'Не удалось изменить статус в плане'),
                                                  ),
                                                )
                                            }
                                          >
                                            {task.pinned_today ? 'В плане' : 'В план'}
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </Stack>
                                </Stack>
                              </CardContent>
                            </Card>
                          );
                          })}
                              {payList.length > 5 && !paymentsInWorkExpanded && (
                                <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={() => setPaymentsInWorkExpanded(true)}>Показать все</Button>
                              )}
                            </React.Fragment>
                          );
                        })() )}
                  </Stack>
                </Box>
                  )}

                </Paper>

                {/* Уроки для sales — сразу после «В работе сегодня» */}
                {isSales && canSeeLessonTasks && (
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ mb: 1 }}>
                      <Typography variant="h6">📅 Уроки</Typography>
                      {lessonsExpanded && (
                        <Button size="small" variant="outlined" onClick={() => setLessonsExpanded(false)}>Свернуть</Button>
                      )}
                    </Stack>
                    <Tabs value={lessonPeriodTab} onChange={(_, v) => setLessonPeriodTab(v)} sx={{ mb: 2, minHeight: 40, '& .MuiTab-root': { minHeight: 40 } }}>
                      <Tab label="Сегодня" />
                      <Tab label="Завтра" />
                      <Tab label="Неделя" />
                    </Tabs>
                    {!lessonsExpanded && (
                      <>
                        <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mb: 1 }}>
                          <Typography variant="body2" color="text.secondary">Уроков сегодня: {lessonTasks.length}</Typography>
                          {lessonTasks.some((t) => t.status === 'call_round') && (
                            <Typography variant="body2" color="error.main">Активный дозвон</Typography>
                          )}
                          {lessonTasks.some((t) => (t.unknown_count ?? 0) > 0) && (
                            <Typography variant="body2" color="text.secondary">Не отмечено: {lessonTasks.reduce((s, t) => s + (t.unknown_count ?? 0), 0)}</Typography>
                          )}
                        </Stack>
                        {lessonPeriodTab === 0 && !lessonTasksLoading && lessonTasks.length > 0 && (
                          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1 }}>
                            {lessonTasks.slice(0, 3).map((item) => (
                              <Card key={`s-${item.group_id}-${item.schedule_id}`} variant="outlined" sx={{ minWidth: 220, maxWidth: 300 }}>
                                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                  <Typography variant="subtitle2">{item.group_name}</Typography>
                                  <Typography variant="caption" color="text.secondary">{item.trainer_name} — {item.start_time}</Typography>
                                  <Button size="small" startIcon={<OpenInNew />} sx={{ mt: 0.5 }} onClick={() => setLessonTaskDetail(item)}>Открыть</Button>
                                </CardContent>
                              </Card>
                            ))}
                          </Stack>
                        )}
                        {lessonPeriodTab === 1 && !lessonTasksTomorrowLoading && lessonTasksTomorrow.length > 0 && (
                          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1 }}>
                            {lessonTasksTomorrow.slice(0, 3).map((item) => (
                              <Card key={`stm-${item.group_id}-${item.schedule_id}`} variant="outlined" sx={{ minWidth: 220, maxWidth: 300 }}>
                                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                  <Typography variant="subtitle2">{item.group_name}</Typography>
                                  <Typography variant="caption" color="text.secondary">{item.trainer_name} — {item.start_time}</Typography>
                                  <Button size="small" startIcon={<OpenInNew />} sx={{ mt: 0.5 }} onClick={() => setLessonTaskDetail(item)}>Открыть</Button>
                                </CardContent>
                              </Card>
                            ))}
                          </Stack>
                        )}
                        {lessonPeriodTab === 2 && lessonTasksWeek.length > 0 && (
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Уроков на неделю: {lessonTasksWeek.length}</Typography>
                        )}
                        <Button size="small" variant="outlined" onClick={() => setLessonsExpanded(true)}>Показать все уроки</Button>
                      </>
                    )}
                    {lessonsExpanded && (
                      <Box>
                        {lessonPeriodTab === 0 && (
                          <>
                            {lessonTasksLoading ? (
                              <Typography color="text.secondary">Загрузка уроков...</Typography>
                            ) : lessonTasks.length === 0 ? (
                              <Typography color="text.secondary">На сегодня уроков по расписанию нет.</Typography>
                            ) : (
                              <Stack direction="row" flexWrap="wrap" gap={1}>
                                {lessonTasks.map((item) => {
                                  const statusLabels: Record<string, string> = {
                                    waiting: 'Ожидает урока',
                                    soon: 'Скоро урок',
                                    in_progress: 'Идёт урок',
                                    call_round: 'Дозвон',
                                    completed: 'Завершено',
                                  };
                                  const statusColor: Record<string, 'default' | 'primary' | 'warning' | 'success' | 'error'> = {
                                    waiting: 'default',
                                    soon: 'warning',
                                    in_progress: 'primary',
                                    call_round: 'error',
                                    completed: 'success',
                                  };
                                  return (
                                    <Card key={`s-full-${item.group_id}-${item.schedule_id}`} variant="outlined" sx={{ minWidth: 280, maxWidth: 360 }}>
                                      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                        <Typography variant="subtitle2">Группа: {item.group_name}</Typography>
                                        <Typography variant="body2" color="text.secondary">{item.trainer_name} — {item.start_time}</Typography>
                                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                                          <Chip size="small" label={statusLabels[item.status] || item.status} color={statusColor[item.status] || 'default'} />
                                          <Typography variant="caption" color="text.secondary">
                                            Всего: {item.total} / На месте: {item.present_count} / Нет: {item.absent_count}
                                            {(item.call_contacted_count ?? 0) > 0 && ` / Дозвонено: ${item.call_contacted_count}`}
                                          </Typography>
                                        </Stack>
                                        <Button size="small" startIcon={<OpenInNew />} sx={{ mt: 1 }} onClick={() => setLessonTaskDetail(item)}>Открыть карточку</Button>
                                      </CardContent>
                                    </Card>
                                  );
                                })}
                              </Stack>
                            )}
                          </>
                        )}
                        {lessonPeriodTab === 1 && (
                          <>
                            {lessonTasksTomorrowLoading ? (
                              <Typography color="text.secondary">Загрузка...</Typography>
                            ) : lessonTasksTomorrow.length === 0 ? (
                              <Typography color="text.secondary">На завтра уроков по расписанию нет.</Typography>
                            ) : (
                              <Stack direction="row" flexWrap="wrap" gap={1}>
                                {lessonTasksTomorrow.map((item) => (
                                  <Card key={`stm-full-${item.group_id}-${item.schedule_id}`} variant="outlined" sx={{ minWidth: 280, maxWidth: 360 }}>
                                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                      <Typography variant="subtitle2">Группа: {item.group_name}</Typography>
                                      <Typography variant="body2" color="text.secondary">{item.trainer_name} — {item.start_time}</Typography>
                                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Всего: {item.total} учеников</Typography>
                                      <Button size="small" startIcon={<OpenInNew />} sx={{ mt: 1 }} onClick={() => setLessonTaskDetail(item)}>Открыть карточку</Button>
                                    </CardContent>
                                  </Card>
                                ))}
                              </Stack>
                            )}
                          </>
                        )}
                        {lessonPeriodTab === 2 && (
                          <>
                            {lessonTasksWeekLoading ? (
                              <Typography color="text.secondary">Загрузка...</Typography>
                            ) : lessonTasksWeek.length === 0 ? (
                              <Typography color="text.secondary">На неделю уроков по расписанию нет.</Typography>
                            ) : (
                              <Stack spacing={2}>
                                {Object.entries(
                                  lessonTasksWeek.reduce<Record<string, LessonTaskItem[]>>((acc, item) => {
                                    const d = item.lesson_date;
                                    if (!acc[d]) acc[d] = [];
                                    acc[d].push(item);
                                    return acc;
                                  }, {})
                                )
                                  .sort(([a], [b]) => a.localeCompare(b))
                                  .map(([dayDate, items]) => {
                                    const d = new Date(dayDate + 'T12:00:00');
                                    const dayLabel = d.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' });
                                    return (
                                      <Box key={dayDate}>
                                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>{dayLabel}</Typography>
                                        <Stack direction="row" flexWrap="wrap" gap={1}>
                                          {items.map((item) => (
                                            <Card key={`sw-${item.lesson_date}-${item.group_id}-${item.schedule_id}`} variant="outlined" sx={{ minWidth: 260, maxWidth: 340 }}>
                                              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                                <Typography variant="subtitle2">Группа: {item.group_name}</Typography>
                                                <Typography variant="body2" color="text.secondary">{item.trainer_name} — {item.start_time}</Typography>
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Всего: {item.total} учеников</Typography>
                                                <Button size="small" startIcon={<OpenInNew />} sx={{ mt: 1 }} onClick={() => setLessonTaskDetail(item)}>Открыть карточку</Button>
                                              </CardContent>
                                            </Card>
                                          ))}
                                        </Stack>
                                      </Box>
                                    );
                                  })}
                              </Stack>
                            )}
                          </>
                        )}
                      </Box>
                    )}
                  </Paper>
                )}

                {/* Операционка — во всю ширину, макс. 3 карточек */}
                <Box>
                  <Typography variant="h6" gutterBottom>⚙ Операционка</Typography>
                  {dayDesk.operations.length === 0 ? (
                    <Typography color="text.secondary">Нет задач.</Typography>
                  ) : (
                    <Stack spacing={1}>
                      {dayDesk.operations
                        .filter((t) => !hideCompletedInDesk || t.progress < 100)
                        .slice(0, operationsExpanded ? undefined : 3)
                        .map((task) => {
                          const dueLabel = task.due_at
                            ? (() => {
                                try {
                                  const d = new Date(task.due_at);
                                  return `до ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes()
                                    .toString()
                                    .padStart(2, '0')}`;
                                } catch {
                                  return null;
                                }
                              })()
                            : task.scheduled_for
                            ? 'Срок: сегодня'
                            : null;
                          const categoryLabel =
                            task.category === 'parents' ? 'Родители' : task.category === 'leads' ? 'Лиды' : 'Школы';
                          const firstSubtasks = (task.subtasks || []).slice(0, 5);
                          return (
                            <Card key={task.id} variant="outlined" sx={{ py: 0 }}>
                              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                <Stack
                                  direction="row"
                                  alignItems="flex-start"
                                  justifyContent="space-between"
                                  spacing={1}
                                  flexWrap="wrap"
                                >
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle2">{task.title}</Typography>
                                    <Stack
                                      direction="row"
                                      alignItems="center"
                                      spacing={0.5}
                                      sx={{ mt: 0.5 }}
                                      flexWrap="wrap"
                                    >
                                      <Chip size="small" label={categoryLabel} variant="outlined" sx={{ height: 20 }} />
                                      {dueLabel && (
                                        <Chip size="small" label={dueLabel} color="warning" sx={{ height: 20 }} />
                                      )}
                                      {task.priority === 'high' && (
                                        <Chip size="small" label="Важная" color="error" sx={{ height: 20 }} />
                                      )}
                                      {task.tags?.map((tag) => (
                                        <Chip
                                          key={tag}
                                          size="small"
                                          label={tag}
                                          variant="outlined"
                                          sx={{ height: 20 }}
                                        />
                                      ))}
                                    </Stack>
                                    <LinearProgress
                                      variant="determinate"
                                      value={task.progress}
                                      sx={{ width: '100%', maxWidth: 200, height: 6, borderRadius: 1, mt: 0.5 }}
                                    />
                                    {firstSubtasks.length > 0 && (
                                      <Stack
                                        direction="row"
                                        flexWrap="wrap"
                                        alignItems="center"
                                        sx={{ mt: 0.5 }}
                                        gap={0.5}
                                      >
                                        {firstSubtasks.map((st) => (
                                          <FormControlLabel
                                            key={st.id}
                                            control={
                                              <Checkbox
                                                size="small"
                                                checked={st.completed}
                                                onChange={() => handleSubtaskToggle(task, st)}
                                              />
                                            }
                                            label={
                                              <Typography
                                                variant="caption"
                                                sx={{ textDecoration: st.completed ? 'line-through' : 'none' }}
                                              >
                                                {st.text.length > 30 ? st.text.slice(0, 30) + '…' : st.text}
                                              </Typography>
                                            }
                                            sx={{ m: 0 }}
                                          />
                                        ))}
                                      </Stack>
                                    )}
                                  </Box>
                                  <Stack
                                    direction="row"
                                    spacing={0.5}
                                    alignItems="center"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="primary"
                                      onClick={() => openTaskDialog(task)}
                                    >
                                      Открыть
                                    </Button>
                                    {task.status === 'active' && (
                                      <>
                                        <Button
                                          size="small"
                                          variant="contained"
                                          color="success"
                                          onClick={() => void completeTaskAndOfferFollowUp(task)}
                                        >
                                          Завершить
                                        </Button>
                                        <Button
                                          size="small"
                                          variant="outlined"
                                          onClick={() =>
                                            tasksApi
                                              .postponeTask(task.id)
                                              .then(() => {
                                                loadTasks();
                                                loadDayDesk();
                                                if (showTodayPlan || isSales) {
                                                  loadTodayTasks();
                                                  loadDayStats();
                                                  loadOverdueCount();
                                                }
                                              })
                                              .catch((e) =>
                                                setError(extractApiError(e, 'Не удалось отложить задачу')),
                                              )
                                          }
                                        >
                                          Отложить
                                        </Button>
                                        {!isTrainer && (
                                          <Button
                                            size="small"
                                            variant={task.pinned_today ? 'contained' : 'outlined'}
                                            color="secondary"
                                            onClick={() =>
                                              tasksApi
                                                .pinTaskToday(task.id, !task.pinned_today)
                                                .then(() => {
                                                  loadTasks();
                                                  loadDayDesk();
                                                  if (showTodayPlan || isSales) {
                                                    loadTodayTasks();
                                                    loadDayStats();
                                                    loadOverdueCount();
                                                  }
                                                })
                                                .catch((e) =>
                                                  setError(
                                                    extractApiError(e, 'Не удалось изменить статус в плане'),
                                                  ),
                                                )
                                            }
                                          >
                                            {task.pinned_today ? 'В плане' : 'В план'}
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </Stack>
                                </Stack>
                              </CardContent>
                            </Card>
                          );
                        })}
                    </Stack>
                  )}
                  {dayDesk.operations.filter((t) => !hideCompletedInDesk || t.progress < 100).length > 3 && !operationsExpanded && (
                    <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={() => setOperationsExpanded(true)}>Показать все</Button>
                  )}
                </Box>

                {/* Лиды на мероприятия — макс. 3 карточки */}
                {dayDesk.leads.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="h6" gutterBottom>🎯 Лиды на мероприятия</Typography>
                    <Stack spacing={1}>
                      {dayDesk.leads
                        .filter((t) => !hideCompletedInDesk || t.progress < 100)
                        .slice(0, leadsExpanded ? undefined : 3)
                        .map((task) => {
                          const dueLabel = task.due_at
                            ? (() => {
                                try {
                                  const d = new Date(task.due_at);
                                  return `до ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes()
                                    .toString()
                                    .padStart(2, '0')}`;
                                } catch {
                                  return null;
                                }
                              })()
                            : task.scheduled_for
                            ? 'Срок: сегодня'
                            : null;
                          const categoryLabel = 'Лиды';
                          const firstSubtasks = (task.subtasks || []).slice(0, 5);
                          return (
                            <Card key={task.id} variant="outlined" sx={{ py: 0 }}>
                              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                <Stack
                                  direction="row"
                                  alignItems="flex-start"
                                  justifyContent="space-between"
                                  spacing={1}
                                  flexWrap="wrap"
                                >
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="subtitle2">{task.title}</Typography>
                                    <Stack
                                      direction="row"
                                      alignItems="center"
                                      spacing={0.5}
                                      sx={{ mt: 0.5 }}
                                      flexWrap="wrap"
                                    >
                                      <Chip size="small" label={categoryLabel} variant="outlined" sx={{ height: 20 }} />
                                      {dueLabel && (
                                        <Chip size="small" label={dueLabel} color="warning" sx={{ height: 20 }} />
                                      )}
                                      {task.priority === 'high' && (
                                        <Chip size="small" label="Важная" color="error" sx={{ height: 20 }} />
                                      )}
                                      {task.tags?.map((tag) => (
                                        <Chip
                                          key={tag}
                                          size="small"
                                          label={tag}
                                          variant="outlined"
                                          sx={{ height: 20 }}
                                        />
                                      ))}
                                    </Stack>
                                    <LinearProgress
                                      variant="determinate"
                                      value={task.progress}
                                      sx={{ width: '100%', maxWidth: 200, height: 6, borderRadius: 1, mt: 0.5 }}
                                    />
                                    {firstSubtasks.length > 0 && (
                                      <Stack
                                        direction="row"
                                        flexWrap="wrap"
                                        alignItems="center"
                                        sx={{ mt: 0.5 }}
                                        gap={0.5}
                                      >
                                        {firstSubtasks.map((st) => (
                                          <FormControlLabel
                                            key={st.id}
                                            control={
                                              <Checkbox
                                                size="small"
                                                checked={st.completed}
                                                onChange={() => handleSubtaskToggle(task, st)}
                                              />
                                            }
                                            label={
                                              <Typography
                                                variant="caption"
                                                sx={{ textDecoration: st.completed ? 'line-through' : 'none' }}
                                              >
                                                {st.text.length > 30 ? st.text.slice(0, 30) + '…' : st.text}
                                              </Typography>
                                            }
                                            sx={{ m: 0 }}
                                          />
                                        ))}
                                      </Stack>
                                    )}
                                  </Box>
                                  <Stack
                                    direction="row"
                                    spacing={0.5}
                                    alignItems="center"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="primary"
                                      onClick={() => openTaskDialog(task)}
                                    >
                                      Открыть
                                    </Button>
                                    {task.status === 'active' && (
                                      <>
                                        <Button
                                          size="small"
                                          variant="contained"
                                          color="success"
                                          onClick={() => void completeTaskAndOfferFollowUp(task)}
                                        >
                                          Завершить
                                        </Button>
                                        <Button
                                          size="small"
                                          variant="outlined"
                                          onClick={() =>
                                            tasksApi
                                              .postponeTask(task.id)
                                              .then(() => {
                                                loadTasks();
                                                loadDayDesk();
                                                if (showTodayPlan || isSales) {
                                                  loadTodayTasks();
                                                  loadDayStats();
                                                  loadOverdueCount();
                                                }
                                              })
                                              .catch((e) =>
                                                setError(extractApiError(e, 'Не удалось отложить задачу')),
                                              )
                                          }
                                        >
                                          Отложить
                                        </Button>
                                        {!isTrainer && (
                                          <Button
                                            size="small"
                                            variant={task.pinned_today ? 'contained' : 'outlined'}
                                            color="secondary"
                                            onClick={() =>
                                              tasksApi
                                                .pinTaskToday(task.id, !task.pinned_today)
                                                .then(() => {
                                                  loadTasks();
                                                  loadDayDesk();
                                                  if (showTodayPlan || isSales) {
                                                    loadTodayTasks();
                                                    loadDayStats();
                                                    loadOverdueCount();
                                                  }
                                                })
                                                .catch((e) =>
                                                  setError(
                                                    extractApiError(e, 'Не удалось изменить статус в плане'),
                                                  ),
                                                )
                                            }
                                          >
                                            {task.pinned_today ? 'В плане' : 'В план'}
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </Stack>
                                </Stack>
                              </CardContent>
                            </Card>
                          );
                        })}
                    </Stack>
                    {dayDesk.leads.filter((t) => !hideCompletedInDesk || t.progress < 100).length > 3 && !leadsExpanded && (
                      <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={() => setLeadsExpanded(true)}>Показать все</Button>
                    )}
                  </Box>
                )}

              </Stack>
            )}
          </Stack>
        )}

        {loading ? (
          <Typography color="text.secondary">Загрузка...</Typography>
        ) : tab === 0 ? (
          <Stack spacing={3}>
            {(showTodayPlan && !isSales) && (
            <Box>
              <Typography variant="h6" gutterBottom sx={{ mb: 1 }}>План на сегодня</Typography>
              <Tabs value={todayPlanTab} onChange={(_, v: 'today' | 'overdue' | 'active') => setTodayPlanTab(v)} sx={{ mb: 2, minHeight: 40, '& .MuiTab-root': { minHeight: 40 } }}>
                <Tab value="today" label="Сегодня" />
                <Tab
                  value="overdue"
                  label={
                    overdueCount != null && overdueCount > 0 ? (
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <span>Просрочено</span>
                        <Chip label={overdueCount} size="small" color="error" sx={{ height: 20, '& .MuiChip-label': { px: 0.75 } }} />
                      </Stack>
                    ) : (
                      'Просрочено'
                    )
                  }
                />
                <Tab value="active" label="Все активные" />
              </Tabs>

              {todayPlanTab === 'today' && canSeeLessonTasks && (
                <>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Уроки сегодня</Typography>
                  {lessonTasksLoading ? (
                    <Typography variant="body2" color="text.secondary">Загрузка уроков...</Typography>
                  ) : lessonTasks.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">На сегодня уроков нет.</Typography>
                  ) : (
                    <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
                      {[...lessonTasks]
                        .sort((a, b) => {
                          if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
                          if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
                          return (a.start_time || '').localeCompare(b.start_time || '');
                        })
                        .slice(0, 3)
                        .map((item) => (
                        <Card key={`plan-${item.group_id}-${item.schedule_id}`} variant="outlined" sx={{ minWidth: 260, maxWidth: 340 }}>
                          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="subtitle2">Группа: {item.group_name}</Typography>
                            <Typography variant="body2" color="text.secondary">{item.trainer_name} — {item.start_time}</Typography>
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                              <Chip size="small" label={item.status === 'in_progress' ? 'Идёт урок' : item.status === 'call_round' ? 'Дозвон' : item.status === 'soon' ? 'Скоро' : 'Ожидает'} color={item.status === 'in_progress' ? 'primary' : item.status === 'soon' ? 'warning' : 'default'} />
                            </Stack>
                            <Button size="small" startIcon={<OpenInNew />} sx={{ mt: 1 }} onClick={() => setLessonTaskDetail(item)}>Открыть</Button>
                          </CardContent>
                        </Card>
                      ))}
                      {lessonTasks.length > 3 && (
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => lessonBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                          sx={{ alignSelf: 'flex-start', mt: 1 }}
                        >
                          Показать все ({lessonTasks.length})
                        </Button>
                      )}
                    </Stack>
                  )}
                </>
              )}

              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                {todayPlanTab === 'today' && `Сегодня: ${todayTasks.length} задач, выполнено ${dayStats?.completed_count ?? 0}`}
                {todayPlanTab === 'overdue' && `Просрочено: ${todayTasks.length}`}
                {todayPlanTab === 'active' && `Активных: ${todayTasks.length}`}
              </Typography>
              {todayTasksLoading ? (
                <Typography variant="body2" color="text.secondary">Загрузка...</Typography>
              ) : todayTasks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">Нет задач.</Typography>
              ) : (
                <Stack spacing={1}>
                  {todayTasks.map((task) => {
                    const dueLabel = task.due_at ? (() => {
                      try {
                        const d = new Date(task.due_at);
                        return `до ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                      } catch {
                        return null;
                      }
                    })() : (task.scheduled_for ? 'Срок: сегодня' : null);
                    const categoryLabel = task.category === 'parents' ? 'Родители' : task.category === 'leads' ? 'Лиды' : 'Школы';
                    const firstSubtasks = (task.subtasks || []).slice(0, 5);
                    return (
                      <Card key={task.id} variant="outlined" sx={{ py: 0 }}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1} flexWrap="wrap">
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="subtitle2">{task.title}</Typography>
                              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap">
                                <Chip size="small" label={categoryLabel} variant="outlined" sx={{ height: 20 }} />
                                {dueLabel && <Chip size="small" label={dueLabel} color="warning" sx={{ height: 20 }} />}
                                {task.priority === 'high' && <Chip size="small" label="Важная" color="error" sx={{ height: 20 }} />}
                              </Stack>
                              <LinearProgress variant="determinate" value={task.progress} sx={{ width: '100%', maxWidth: 200, height: 6, borderRadius: 1, mt: 0.5 }} />
                              {firstSubtasks.length > 0 && (
                                <Stack direction="row" flexWrap="wrap" alignItems="center" sx={{ mt: 0.5 }} gap={0.5}>
                                  {firstSubtasks.map((st) => (
                                    <FormControlLabel
                                      key={st.id}
                                      control={
                                        <Checkbox
                                          size="small"
                                          checked={st.completed}
                                          onChange={() => handleSubtaskToggle(task, st)}
                                          disabled={!canManageTasks && !isSales}
                                        />
                                      }
                                      label={<Typography variant="caption" sx={{ textDecoration: st.completed ? 'line-through' : 'none' }}>{st.text.length > 30 ? st.text.slice(0, 30) + '…' : st.text}</Typography>}
                                      sx={{ m: 0 }}
                                    />
                                  ))}
                                </Stack>
                              )}
                            </Box>
                            <Stack direction="row" spacing={0.5} alignItems="center" onClick={(e) => e.stopPropagation()}>
                              <Button size="small" variant="outlined" onClick={() => openTaskDialog(task)}>Открыть</Button>
                              {task.status === 'active' && (
                                <>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    onClick={() => void completeTaskAndOfferFollowUp(task)}
                                  >
                                    Завершить
                                  </Button>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() =>
                                      tasksApi
                                        .postponeTask(task.id)
                                        .then(() => {
                                          loadTasks();
                                          if (showTodayPlan || isSales) {
                                            loadTodayTasks();
                                            loadDayStats();
                                            loadOverdueCount();
                                          }
                                        })
                                        .catch((e) => setError(extractApiError(e, 'Не удалось отложить')))
                                    }
                                  >
                                    Отложить
                                  </Button>
                                  {!isTrainer && (
                                    <Button
                                      size="small"
                                      variant={task.pinned_today ? 'contained' : 'outlined'}
                                      onClick={() =>
                                        tasksApi
                                          .pinTaskToday(task.id, !task.pinned_today)
                                          .then(() => {
                                            loadTasks();
                                            if (showTodayPlan || isSales) {
                                              loadTodayTasks();
                                              loadDayStats();
                                              loadOverdueCount();
                                            }
                                          })
                                          .catch((e) => setError(extractApiError(e, 'Не удалось добавить в план')))
                                      }
                                    >
                                      {task.pinned_today ? 'В плане' : 'В план'}
                                    </Button>
                                  )}
                                </>
                              )}
                            </Stack>
                          </Stack>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Stack>
              )}
            </Box>
            )}

            {canSeeLessonTasks && !isSales && (
            <Paper variant="outlined" sx={{ p: 2 }} ref={lessonBlockRef}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ mb: 1 }}>
                <Typography variant="h6">📅 Уроки</Typography>
                {lessonsExpanded && (
                  <Button size="small" variant="outlined" onClick={() => setLessonsExpanded(false)}>Свернуть</Button>
                )}
              </Stack>
              <Tabs value={lessonPeriodTab} onChange={(_, v) => setLessonPeriodTab(v)} sx={{ mb: 2, minHeight: 40, '& .MuiTab-root': { minHeight: 40 } }}>
                <Tab label="Сегодня" />
                <Tab label="Завтра" />
                <Tab label="Неделя" />
              </Tabs>

              {!lessonsExpanded && (
                <>
                  <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">Уроков сегодня: {lessonTasks.length}</Typography>
                    {lessonTasks.some((t) => t.status === 'call_round') && (
                      <Typography variant="body2" color="error.main">Активный дозвон</Typography>
                    )}
                    {lessonTasks.some((t) => (t.unknown_count ?? 0) > 0) && (
                      <Typography variant="body2" color="text.secondary">Не отмечено: {lessonTasks.reduce((s, t) => s + (t.unknown_count ?? 0), 0)}</Typography>
                    )}
                  </Stack>
                  {lessonPeriodTab === 0 && !lessonTasksLoading && lessonTasks.length > 0 && (
                    <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1 }}>
                      {lessonTasks.slice(0, 3).map((item) => (
                        <Card key={`prev-${item.group_id}-${item.schedule_id}`} variant="outlined" sx={{ minWidth: 220, maxWidth: 300 }}>
                          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="subtitle2">{item.group_name}</Typography>
                            <Typography variant="caption" color="text.secondary">{item.trainer_name} — {item.start_time}</Typography>
                            <Button size="small" startIcon={<OpenInNew />} sx={{ mt: 0.5 }} onClick={() => setLessonTaskDetail(item)}>Открыть</Button>
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  )}
                  {lessonPeriodTab === 1 && !lessonTasksTomorrowLoading && lessonTasksTomorrow.length > 0 && (
                    <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1 }}>
                      {lessonTasksTomorrow.slice(0, 3).map((item) => (
                        <Card key={`tm-prev-${item.group_id}-${item.schedule_id}`} variant="outlined" sx={{ minWidth: 220, maxWidth: 300 }}>
                          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="subtitle2">{item.group_name}</Typography>
                            <Typography variant="caption" color="text.secondary">{item.trainer_name} — {item.start_time}</Typography>
                            <Button size="small" startIcon={<OpenInNew />} sx={{ mt: 0.5 }} onClick={() => setLessonTaskDetail(item)}>Открыть</Button>
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  )}
                  {lessonPeriodTab === 2 && !lessonTasksWeekLoading && lessonTasksWeek.length > 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Уроков на неделю: {lessonTasksWeek.length}</Typography>
                  )}
                  <Button size="small" variant="outlined" onClick={() => setLessonsExpanded(true)}>Показать все уроки</Button>
                </>
              )}

              {lessonsExpanded && lessonPeriodTab === 0 && (
                <>
                  {lessonTasks.some((t) => t.status === 'soon') && (
                    <Alert severity="info" sx={{ mb: 1 }}>
                      Через 15 минут урок у {lessonTasks.filter((t) => t.status === 'soon').length} групп(ы)
                    </Alert>
                  )}
                  {lessonTasksLoading ? (
                    <Typography color="text.secondary">Загрузка уроков...</Typography>
                  ) : lessonTasks.length === 0 ? (
                    <Typography color="text.secondary">На сегодня уроков по расписанию нет.</Typography>
                  ) : (
                    <Stack direction="row" flexWrap="wrap" gap={1}>
                      {lessonTasks.map((item) => {
                        const statusLabels: Record<string, string> = {
                          waiting: 'Ожидает урока',
                          soon: 'Скоро урок',
                          in_progress: 'Идёт урок',
                          call_round: 'Дозвон',
                          completed: 'Завершено',
                        };
                        const statusColor: Record<string, 'default' | 'primary' | 'warning' | 'success' | 'error'> = {
                          waiting: 'default',
                          soon: 'warning',
                          in_progress: 'primary',
                          call_round: 'error',
                          completed: 'success',
                        };
                        return (
                          <Card key={`${item.group_id}-${item.schedule_id}`} variant="outlined" sx={{ minWidth: 280, maxWidth: 360 }}>
                            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                              <Typography variant="subtitle2">Группа: {item.group_name}</Typography>
                              <Typography variant="body2" color="text.secondary">
                                {item.trainer_name} — {item.start_time}
                              </Typography>
                              <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                                <Chip size="small" label={statusLabels[item.status] || item.status} color={statusColor[item.status] || 'default'} />
                                <Typography variant="caption" color="text.secondary">
                                  Всего: {item.total} / На месте: {item.present_count} / Нет: {item.absent_count}
                                  {(item.call_contacted_count ?? 0) > 0 && ` / Дозвонено: ${item.call_contacted_count}`}
                                </Typography>
                              </Stack>
                              <Button
                                size="small"
                                startIcon={<OpenInNew />}
                                sx={{ mt: 1 }}
                                onClick={() => setLessonTaskDetail(item)}
                              >
                                Открыть карточку
                              </Button>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </Stack>
                  )}
                </>
              )}

              {lessonsExpanded && lessonPeriodTab === 1 && (
                <>
                  {lessonTasksTomorrowLoading ? (
                    <Typography color="text.secondary">Загрузка...</Typography>
                  ) : lessonTasksTomorrow.length === 0 ? (
                    <Typography color="text.secondary">На завтра уроков по расписанию нет.</Typography>
                  ) : (
                    <Stack direction="row" flexWrap="wrap" gap={1}>
                      {lessonTasksTomorrow.map((item) => (
                        <Card key={`tm-${item.group_id}-${item.schedule_id}-${item.lesson_date}`} variant="outlined" sx={{ minWidth: 280, maxWidth: 360 }}>
                          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="subtitle2">Группа: {item.group_name}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {item.trainer_name} — {item.start_time}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                              Всего: {item.total} учеников
                            </Typography>
                            <Button
                              size="small"
                              startIcon={<OpenInNew />}
                              sx={{ mt: 1 }}
                              onClick={() => setLessonTaskDetail(item)}
                            >
                              Открыть карточку
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  )}
                </>
              )}

              {lessonsExpanded && lessonPeriodTab === 2 && (
                <>
                  {lessonTasksWeekLoading ? (
                    <Typography color="text.secondary">Загрузка...</Typography>
                  ) : lessonTasksWeek.length === 0 ? (
                    <Typography color="text.secondary">На неделю уроков по расписанию нет.</Typography>
                  ) : (
                    <Stack spacing={2}>
                      {Object.entries(
                        lessonTasksWeek.reduce<Record<string, LessonTaskItem[]>>((acc, item) => {
                          const d = item.lesson_date;
                          if (!acc[d]) acc[d] = [];
                          acc[d].push(item);
                          return acc;
                        }, {})
                      )
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([dayDate, items]) => {
                          const d = new Date(dayDate + 'T12:00:00');
                          const dayLabel = d.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' });
                          return (
                            <Box key={dayDate}>
                              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                                {dayLabel}
                              </Typography>
                              <Stack direction="row" flexWrap="wrap" gap={1}>
                                {items.map((item) => (
                                  <Card key={`w-${item.lesson_date}-${item.group_id}-${item.schedule_id}`} variant="outlined" sx={{ minWidth: 260, maxWidth: 340 }}>
                                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                                      <Typography variant="subtitle2">Группа: {item.group_name}</Typography>
                                      <Typography variant="body2" color="text.secondary">
                                        {item.trainer_name} — {item.start_time}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                        Всего: {item.total} учеников
                                      </Typography>
                                      <Button
                                        size="small"
                                        startIcon={<OpenInNew />}
                                        sx={{ mt: 1 }}
                                        onClick={() => setLessonTaskDetail(item)}
                                      >
                                        Открыть карточку
                                      </Button>
                                    </CardContent>
                                  </Card>
                                ))}
                              </Stack>
                            </Box>
                          );
                        })}
                    </Stack>
                  )}
                </>
              )}
            </Paper>
            )}

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ mb: allTasksExpandedState ? 1 : 0 }}>
                <Typography variant="h6">Все задачи</Typography>
                {isSales && (
                  <Button size="small" variant="outlined" onClick={() => setAllTasksExpandedState(!allTasksExpandedState)}>
                    {allTasksExpandedState ? 'Свернуть' : 'Развернуть'}
                  </Button>
                )}
              </Stack>
              {allTasksExpandedState && (
              <>
              <Stack direction="row" flexWrap="wrap" alignItems="center" gap={2} sx={{ mb: 1 }}>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>Категория:</Typography>
                  <Button size="small" variant={categoryFilter === 'schools' ? 'contained' : 'outlined'} onClick={() => setCategoryFilter('schools')}>
                    Школы
                  </Button>
                  <Button size="small" variant={categoryFilter === 'parents' ? 'contained' : 'outlined'} onClick={() => setCategoryFilter('parents')}>
                    Родители
                  </Button>
                  <Button size="small" variant={categoryFilter === 'leads' ? 'contained' : 'outlined'} onClick={() => setCategoryFilter('leads')}>
                    Лиды
                  </Button>
                </Stack>
                {canManageTasks && (
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>Статус:</Typography>
                    <Button size="small" variant={statusFilter === 'active' ? 'contained' : 'outlined'} onClick={() => setStatusFilter('active')}>
                      Активные
                    </Button>
                    <Button size="small" variant={statusFilter === 'archived' ? 'contained' : 'outlined'} onClick={() => setStatusFilter('archived')}>
                      Архив
                    </Button>
                  </Stack>
                )}
                {canManageTasks && (
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Button startIcon={<AddIcon />} variant="contained" size="medium" onClick={() => openTaskDialog(undefined)}>
                      Создать задачу
                    </Button>
                    <Button size="small" variant="outlined" onClick={() => openTaskDialog(undefined, templates[0]?.id)}>
                      Из шаблона
                    </Button>
                  </Stack>
                )}
              </Stack>
              {tasks.length === 0 ? (
                <Typography color="text.secondary">Нет задач.</Typography>
              ) : (
                <Stack spacing={1}>
                  {tasks.map((task) => (
                    <Card key={task.id} variant="outlined">
                      <ListItemButton
                        onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                        sx={{ py: 1 }}
                      >
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%' }}>
                          {expandedTaskId === task.id ? <ExpandLess /> : <ExpandMore />}
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle1">{task.title}</Typography>
                            {task.description && (
                              <Typography variant="body2" color="text.secondary" noWrap>
                                {task.description}
                              </Typography>
                            )}
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                              <Chip size="small" label={task.status === 'active' ? 'Активна' : 'Архив'} color={task.status === 'active' ? 'primary' : 'default'} />
                              <Typography variant="caption" color="text.secondary">
                                Прогресс: {task.progress}%
                              </Typography>
                              <LinearProgress variant="determinate" value={task.progress} sx={{ width: 80, height: 6, borderRadius: 1 }} />
                            </Stack>
                          </Box>
                          {(canManageTasks || isSales) && (
                            <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                              {canManageTasks && (
                                <IconButton size="small" onClick={() => openTaskDialog(task)} title="Редактировать">
                                  <EditIcon />
                                </IconButton>
                              )}
                              {task.status === 'active' && (
                                <>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => void completeTaskAndOfferFollowUp(task)}
                                  >
                                    Завершить
                                  </Button>
                                  {!isTrainer && (
                                    <Button
                                      size="small"
                                      variant={task.pinned_today ? 'contained' : 'outlined'}
                                      onClick={() =>
                                        tasksApi
                                          .pinTaskToday(task.id, !task.pinned_today)
                                          .then(() => {
                                            loadTasks();
                                            if (showTodayPlan || isSales) {
                                              loadTodayTasks();
                                              loadDayStats();
                                              loadOverdueCount();
                                            }
                                          })
                                          .catch((e) => setError(extractApiError(e, 'Не удалось добавить в план')))
                                      }
                                    >
                                      {task.pinned_today ? 'В плане' : 'В план на сегодня'}
                                    </Button>
                                  )}
                                </>
                              )}
                              {canManageTasks && (
                                <IconButton size="small" onClick={() => deleteTask(task.id)} color="error" title="Удалить">
                                  <DeleteIcon />
                                </IconButton>
                              )}
                            </Stack>
                          )}
                        </Stack>
                      </ListItemButton>
                      {expandedTaskId === task.id && (
                        <CardContent sx={{ pt: 0, borderTop: '1px solid', borderColor: 'divider' }}>
                          {task.description && (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                              {task.description}
                            </Typography>
                          )}
                          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                            <Typography variant="subtitle2" color="text.secondary">
                              Подзадачи
                            </Typography>
                            {canManageTasks && (
                              <Button
                                size="small"
                                variant={bulkTaskId === task.id ? 'contained' : 'outlined'}
                                onClick={() => {
                                  if (bulkTaskId === task.id) {
                                    setBulkTaskId(null);
                                    setBulkText('');
                                    setBulkError(null);
                                  } else {
                                    setBulkTaskId(task.id);
                                    setBulkText('');
                                    setBulkError(null);
                                  }
                                }}
                              >
                                {bulkTaskId === task.id ? 'Отмена' : '+ Добавить пачкой'}
                              </Button>
                            )}
                          </Stack>
                          <List dense>
                            {task.subtasks.map((st) => (
                              <ListItem key={st.id} disablePadding>
                                <FormControlLabel
                                  control={
                                    <Checkbox
                                      checked={st.completed}
                                      onChange={() => handleSubtaskToggle(task, st)}
                                      disabled={!canManageTasks && !isSales}
                                    />
                                  }
                                  label={<ListItemText primary={st.text} sx={{ textDecoration: st.completed ? 'line-through' : 'none' }} />}
                                />
                              </ListItem>
                            ))}
                          </List>
                          {bulkTaskId === task.id && canManageTasks && (() => {
                            const lines = bulkText.split('\n').map((s) => s.trim()).filter(Boolean);
                            const preview = lines.slice(0, 3);
                            const rest = lines.length - preview.length;
                            return (
                              <Box sx={{ mt: 1.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                <TextField
                                  fullWidth
                                  multiline
                                  minRows={4}
                                  size="small"
                                  placeholder={'Каждая строка — отдельная подзадача'}
                                  value={bulkText}
                                  onChange={(e) => { setBulkText(e.target.value); setBulkError(null); }}
                                  autoFocus
                                />
                                {lines.length > 0 && (
                                  <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 1 }}>
                                    {preview.map((t, i) => (
                                      <Chip key={i} label={t.length > 40 ? t.slice(0, 40) + '…' : t} size="small" />
                                    ))}
                                    {rest > 0 && <Chip label={`+ ещё ${rest}`} size="small" variant="outlined" />}
                                  </Stack>
                                )}
                                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
                                  <Typography variant="caption" color="text.secondary">
                                    {lines.length > 0 ? `Распознано: ${lines.length} подзадач${lines.length >= 50 ? ' — это много, точно всё сразу?' : ''}` : 'Введите подзадачи, каждая с новой строки'}
                                  </Typography>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    disabled={lines.length === 0 || bulkLoading}
                                    onClick={() => handleBulkCreate(task.id)}
                                  >
                                    {bulkLoading ? 'Создание…' : `Создать ${lines.length > 0 ? lines.length : ''} подзадач`}
                                  </Button>
                                </Stack>
                                {bulkError && <Alert severity="error" sx={{ mt: 1 }}>{bulkError}</Alert>}
                              </Box>
                            );
                          })()}
                          {task.student_ids?.length > 0 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                              Ученики:{' '}
                              {task.student_ids
                                .map((id) => students.find((s) => s.id === id)?.full_name || `#${id}`)
                                .join(', ')}
                            </Typography>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </Stack>
              )}
              </>
              )}
            </Paper>
          </Stack>
        ) : tab === 1 && canManageTasks ? (
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6">Шаблоны</Typography>
              <Button startIcon={<AddIcon />} variant="contained" onClick={() => openTemplateDialog()}>
                Создать шаблон
              </Button>
            </Stack>
            {templates.length === 0 ? (
              <Typography color="text.secondary">Нет шаблонов. Создайте шаблон с названием, подзадачами и учениками.</Typography>
            ) : (
              <Stack spacing={1}>
                {templates.map((t) => (
                  <Card key={t.id} variant="outlined">
                    <CardContent>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                        <Typography variant="subtitle1">{t.name}</Typography>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton size="small" onClick={() => openTemplateDialog(t)} title="Редактировать">
                            <EditIcon />
                          </IconButton>
                          <IconButton size="small" onClick={() => deleteTemplate(t.id)} color="error" title="Удалить">
                            <DeleteIcon />
                          </IconButton>
                        </Stack>
                      </Stack>
                      {t.subtasks?.length > 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          Подзадачи: {t.subtasks.map((s) => s.text).join(', ')}
                        </Typography>
                      )}
                      {t.student_ids?.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Ученики: {t.student_ids.length}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </Box>
        ) : (
          <Box>
            {canManageTasks && (
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <Button size="small" variant={statusFilter === 'active' ? 'contained' : 'outlined'} onClick={() => setStatusFilter('active')}>
                  Активные
                </Button>
                <Button size="small" variant={statusFilter === 'archived' ? 'contained' : 'outlined'} onClick={() => setStatusFilter('archived')}>
                  Архив
                </Button>
                <Button startIcon={<AddIcon />} variant="contained" onClick={() => openTaskDialog(undefined)} sx={{ ml: 2 }}>
                  Создать задачу
                </Button>
                <Button size="small" variant="outlined" onClick={() => openTaskDialog(undefined, templates[0]?.id)}>
                  Из шаблона
                </Button>
              </Stack>
            )}

            {tasks.length === 0 ? (
              <Typography color="text.secondary">Нет задач.</Typography>
            ) : (
              <Stack spacing={1}>
                {tasks.map((task) => (
                  <Card key={task.id} variant="outlined">
                    <ListItemButton
                      onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                      sx={{ py: 1 }}
                    >
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%' }}>
                        {expandedTaskId === task.id ? <ExpandLess /> : <ExpandMore />}
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle1">{task.title}</Typography>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                            <Chip size="small" label={task.status === 'active' ? 'Активна' : 'Архив'} color={task.status === 'active' ? 'primary' : 'default'} />
                            <Typography variant="caption" color="text.secondary">
                              Прогресс: {task.progress}%
                            </Typography>
                            <LinearProgress variant="determinate" value={task.progress} sx={{ width: 80, height: 6, borderRadius: 1 }} />
                          </Stack>
                        </Box>
                        {canManageTasks && (
                          <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                            <IconButton size="small" onClick={() => openTaskDialog(task)} title="Редактировать">
                              <EditIcon />
                            </IconButton>
                            {task.status === 'active' && (
                              <IconButton size="small" onClick={() => archiveTask(task.id)} title="В архив">
                                <ArchiveIcon />
                              </IconButton>
                            )}
                            <IconButton size="small" onClick={() => deleteTask(task.id)} color="error" title="Удалить">
                              <DeleteIcon />
                            </IconButton>
                          </Stack>
                        )}
                      </Stack>
                    </ListItemButton>
                    {expandedTaskId === task.id && (
                      <CardContent sx={{ pt: 0, borderTop: '1px solid', borderColor: 'divider' }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                          <Typography variant="subtitle2" color="text.secondary">
                            Подзадачи
                          </Typography>
                          {canManageTasks && (
                            <Button
                              size="small"
                              variant={bulkTaskId === task.id ? 'contained' : 'outlined'}
                              onClick={() => {
                                if (bulkTaskId === task.id) {
                                  setBulkTaskId(null);
                                  setBulkText('');
                                  setBulkError(null);
                                } else {
                                  setBulkTaskId(task.id);
                                  setBulkText('');
                                  setBulkError(null);
                                }
                              }}
                            >
                              {bulkTaskId === task.id ? 'Отмена' : '+ Добавить пачкой'}
                            </Button>
                          )}
                        </Stack>
                        <List dense>
                          {task.subtasks.map((st) => (
                            <ListItem key={st.id} disablePadding>
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={st.completed}
                                    onChange={() => handleSubtaskToggle(task, st)}
                                    disabled={!canManageTasks && !isSales}
                                  />
                                }
                                label={<ListItemText primary={st.text} sx={{ textDecoration: st.completed ? 'line-through' : 'none' }} />}
                              />
                            </ListItem>
                          ))}
                        </List>
                        {bulkTaskId === task.id && canManageTasks && (() => {
                          const lines = bulkText.split('\n').map((s) => s.trim()).filter(Boolean);
                          const preview = lines.slice(0, 3);
                          const rest = lines.length - preview.length;
                          return (
                            <Box sx={{ mt: 1.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                              <TextField
                                fullWidth
                                multiline
                                minRows={4}
                                size="small"
                                placeholder={'Каждая строка — отдельная подзадача'}
                                value={bulkText}
                                onChange={(e) => { setBulkText(e.target.value); setBulkError(null); }}
                                autoFocus
                              />
                              {lines.length > 0 && (
                                <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 1 }}>
                                  {preview.map((t, i) => (
                                    <Chip key={i} label={t.length > 40 ? t.slice(0, 40) + '…' : t} size="small" />
                                  ))}
                                  {rest > 0 && <Chip label={`+ ещё ${rest}`} size="small" variant="outlined" />}
                                </Stack>
                              )}
                              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                  {lines.length > 0 ? `Распознано: ${lines.length} подзадач${lines.length >= 50 ? ' — это много, точно всё сразу?' : ''}` : 'Введите подзадачи, каждая с новой строки'}
                                </Typography>
                                <Button
                                  size="small"
                                  variant="contained"
                                  disabled={lines.length === 0 || bulkLoading}
                                  onClick={() => handleBulkCreate(task.id)}
                                >
                                  {bulkLoading ? 'Создание…' : `Создать ${lines.length > 0 ? lines.length : ''} подзадач`}
                                </Button>
                              </Stack>
                              {bulkError && <Alert severity="error" sx={{ mt: 1 }}>{bulkError}</Alert>}
                            </Box>
                          );
                        })()}
                        {task.student_ids?.length > 0 && (
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Ученики: {task.student_ids.length}
                          </Typography>
                        )}
                      </CardContent>
                    )}
                  </Card>
                ))}
              </Stack>
            )}
          </Box>
        )}
      </Stack>

      <Dialog open={!!lessonTaskDetail} onClose={() => setLessonTaskDetail(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Урок: {lessonTaskDetail?.group_name}</DialogTitle>
        <DialogContent>
          {lessonTaskDetail && (() => {
            const d = lessonTaskDetail;
            const toCall: LessonTaskStudent[] = d.students.filter((s) => s.attended !== true && !s.late);
            const callContacted = d.call_contacted_count ?? 0;
            const lessonStart = new Date(`${d.lesson_date}T${d.start_time}`);
            const lessonEnd = new Date(`${d.lesson_date}T${d.end_time}`);
            const callEnd = new Date(lessonStart.getTime() + 25 * 60 * 1000);
            const markWindowEnd = new Date(lessonStart.getTime() + 10 * 60 * 1000);
            const now = new Date();
            let timerText = '';
            if (d.status === 'in_progress' && now < markWindowEnd) {
              const min = Math.max(0, Math.ceil((markWindowEnd.getTime() - now.getTime()) / 60000));
              timerText = `До конца окна отметки: ${min} мин`;
            } else if ((d.status === 'in_progress' || d.status === 'call_round') && now < callEnd) {
              const min = Math.max(0, Math.ceil((callEnd.getTime() - now.getTime()) / 60000));
              timerText = `Дозвон до ${callEnd.getHours().toString().padStart(2, '0')}:${callEnd.getMinutes().toString().padStart(2, '0')} (${min} мин)`;
            }
            const handleSetCallResult = async (studentId: number, call_result: string) => {
              setCallResultSaving(studentId);
              try {
                await salesApi.setLessonCallResult({
                  group_id: d.group_id,
                  lesson_date: d.lesson_date,
                  student_id: studentId,
                  call_result,
                });
                const res = await salesApi.listLessonTasksToday();
                const updated = res.items?.find((i) => i.group_id === d.group_id && i.schedule_id === d.schedule_id);
                if (updated) setLessonTaskDetail(updated);
              } finally {
                setCallResultSaving(null);
              }
            };
            const openCallList = () => {
              const phones = toCall
                .map((s) => s.parent_phone || s.parent_phone_2)
                .filter(Boolean) as string[];
              const normalized = phones.map((p) => (p.replace(/\D/g, '').startsWith('7') ? `+${p.replace(/\D/g, '')}` : `+7${p.replace(/\D/g, '').slice(-10)}`));
              if (normalized.length) window.open(`tel:${normalized[0]}`, '_self');
            };
            return (
              <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  Время: {d.start_time}–{d.end_time} · Тренер: {d.trainer_name}
                </Typography>
                {timerText && (
                  <Typography variant="body2" color="primary" fontWeight="medium">
                    {timerText}
                  </Typography>
                )}
                {d.status === 'in_progress' && (
                  <Typography variant="body2" color="text.secondary">
                    Окно отметки тренера: 10 минут
                  </Typography>
                )}
                <Typography variant="body2">
                  Всего: {d.total} / На месте: {d.present_count} / Нет: {d.absent_count} / Не отмечено: {d.unknown_count}
                  {callContacted > 0 && ` / Дозвонено: ${callContacted}`}
                </Typography>
                <Box sx={{ py: 1, px: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Посещаемость отмечает тренер в разделе Уроки.
                  </Typography>
                  <Button
                    component={Link}
                    to={`/lessons?date=${d.lesson_date}`}
                    size="small"
                    variant="outlined"
                    startIcon={<OpenInNew />}
                  >
                    Открыть Уроки на эту дату
                  </Button>
                </Box>
                {(d.status === 'call_round' || d.status === 'in_progress') && toCall.length > 0 && (
                  <Box ref={callRoundBlockRef}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>К обзвону: {toCall.length}</Typography>
                    {d.status === 'call_round' && (
                      <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        startIcon={<Phone />}
                        onClick={() => callRoundBlockRef.current?.scrollIntoView({ behavior: 'smooth' })}
                        sx={{ mb: 1, mr: 1 }}
                      >
                        Начать обзвон отсутствующих
                      </Button>
                    )}
                    {toCall.length > 0 && (
                      <Button size="small" variant="outlined" startIcon={<Phone />} onClick={openCallList}>
                        Обзвонить по очереди
                      </Button>
                    )}
                  </Box>
                )}
                <Typography variant="subtitle2" sx={{ pt: 0.5 }}>Посещаемость</Typography>
                <Stack spacing={0.5}>
                  {d.students.map((s) => {
                    const statusIcon =
                      s.attended === true ? '✅' :
                      s.late ? '⏳' :
                      s.call_result === 'contacted' ? '📞' :
                      s.call_result === 'no_answer' ? '🚫' :
                      s.call_result ? '☎️' :
                      s.attended === false ? '❌' : '⏳';
                    const needCall = s.attended !== true && !s.late;
                    return (
                      <Card key={s.student_id} variant="outlined" sx={{ p: 1 }}>
                        <Stack spacing={0.5}>
                          <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={0.5}>
                            <Typography variant="body2">
                              {statusIcon} {s.full_name}
                            </Typography>
                            {(s.parent_phone || s.parent_phone_2) && (
                              <Typography variant="caption" color="text.secondary">
                                {s.parent_full_name || 'Родитель'} · {s.parent_phone || s.parent_phone_2}
                              </Typography>
                            )}
                          </Stack>
                          {needCall && (d.status === 'call_round' || d.status === 'in_progress') && (
                            <Stack direction="row" flexWrap="wrap" gap={0.5} useFlexGap>
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={callResultSaving === s.student_id}
                                onClick={() => handleSetCallResult(s.student_id, 'messenger')}
                              >
                                Написал в мессенджер
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={callResultSaving === s.student_id}
                                onClick={() => handleSetCallResult(s.student_id, 'contacted')}
                              >
                                Дозвонился
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={callResultSaving === s.student_id}
                                onClick={() => handleSetCallResult(s.student_id, 'no_answer')}
                              >
                                Не дозвонился
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={callResultSaving === s.student_id}
                                onClick={() => handleSetCallResult(s.student_id, 'cancelled')}
                              >
                                Отменил сегодня
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={callResultSaving === s.student_id}
                                onClick={() => handleSetCallResult(s.student_id, 'technical')}
                              >
                                Техн. проблема
                              </Button>
                            </Stack>
                          )}
                        </Stack>
                      </Card>
                    );
                  })}
                </Stack>
              </Stack>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button
            startIcon={<Refresh />}
            onClick={async () => {
              if (!lessonTaskDetail) return;
              setLessonDetailRefreshing(true);
              try {
                const [todayRes, tomorrowRes, weekRes] = await Promise.all([
                  salesApi.listLessonTasksToday(),
                  salesApi.listLessonTasksTomorrow(),
                  salesApi.listLessonTasksWeek(),
                ]);
                const today = todayRes.items || [];
                const tomorrow = tomorrowRes.items || [];
                const week = weekRes.items || [];
                setLessonTasks(today);
                setLessonTasksTomorrow(tomorrow);
                setLessonTasksWeek(week);
                const match = (i: LessonTaskItem) =>
                  i.group_id === lessonTaskDetail.group_id &&
                  i.schedule_id === lessonTaskDetail.schedule_id &&
                  i.lesson_date === lessonTaskDetail.lesson_date;
                const updated = today.find(match) ?? tomorrow.find(match) ?? week.find(match);
                if (updated) setLessonTaskDetail(updated);
              } finally {
                setLessonDetailRefreshing(false);
              }
            }}
            disabled={lessonDetailRefreshing}
          >
            {lessonDetailRefreshing ? 'Обновление…' : 'Обновить'}
          </Button>
          <Button onClick={() => setLessonTaskDetail(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={templateDialogOpen} onClose={() => setTemplateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{templateEditId ? 'Редактировать шаблон' : 'Новый шаблон'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Название шаблона"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            margin="normal"
          />
          <Typography variant="subtitle2" sx={{ mt: 2 }}>Подзадачи</Typography>
          {templateSubtasks.map((s, i) => (
            <Stack key={i} direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
              <TextField
                fullWidth
                size="small"
                value={s.text}
                onChange={(e) => setTemplateSubtasks((prev) => prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                placeholder={`Подзадача ${i + 1}`}
                margin="dense"
              />
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <IconButton
                  size="small"
                  onClick={() => moveTemplateSubtask(i, -1)}
                  disabled={i === 0}
                >
                  <ArrowUpward fontSize="inherit" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => moveTemplateSubtask(i, 1)}
                  disabled={i === templateSubtasks.length - 1}
                >
                  <ArrowDownward fontSize="inherit" />
                </IconButton>
              </Box>
            </Stack>
          ))}
          <Button size="small" onClick={addTemplateSubtask} sx={{ mt: 0.5 }}>+ Подзадача</Button>

          <FormControlLabel
            control={<Checkbox checked={templateRepeatEnabled} onChange={(e) => setTemplateRepeatEnabled(e.target.checked)} />}
            label="Повторять"
            sx={{ mt: 2, display: 'block' }}
          />
          {templateRepeatEnabled && (
            <Stack spacing={1.5} sx={{ mt: 1, pl: 2, borderLeft: '2px solid', borderColor: 'divider' }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Период</InputLabel>
                <Select
                  value={templateRepeatFrequency}
                  label="Период"
                  onChange={(e) => setTemplateRepeatFrequency(e.target.value as RepeatFrequency | '')}
                >
                  <MenuItem value="daily">Ежедневно</MenuItem>
                  <MenuItem value="weekly">Еженедельно</MenuItem>
                  <MenuItem value="monthly">Раз в месяц</MenuItem>
                </Select>
              </FormControl>
              {templateRepeatFrequency === 'weekly' && (
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">Дни недели</Typography>
                  <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
                    {WEEKDAY_LABELS.map((label, i) => (
                      <FormControlLabel
                        key={i}
                        control={<Checkbox size="small" checked={templateRepeatDays.includes(i)} onChange={(e) => setTemplateRepeatDays(e.target.checked ? [...templateRepeatDays, i].sort((a, b) => a - b) : templateRepeatDays.filter((d) => d !== i))} />}
                        label={label}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
              {templateRepeatFrequency === 'monthly' && (
                <TextField
                  size="small"
                  fullWidth
                  label="Дни месяца (через запятую, 1–31)"
                  placeholder="1, 15, 30"
                  value={templateRepeatDays.join(', ')}
                  onChange={(e) => setTemplateRepeatDays(e.target.value.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n) && n >= 1 && n <= 31))}
                />
              )}
              <Typography variant="caption" color="text.secondary">Завершить повторение</Typography>
              <RadioGroup row value={templateRepeatEndType} onChange={(e) => setTemplateRepeatEndType(e.target.value as RepeatEndType)}>
                <FormControlLabel value="never" control={<Radio size="small" />} label="Бессрочно" />
                <FormControlLabel value="after_count" control={<Radio size="small" />} label="После" />
                {templateRepeatEndType === 'after_count' && (
                  <TextField type="number" size="small" sx={{ width: 64 }} value={templateRepeatEndAfterCount} onChange={(e) => setTemplateRepeatEndAfterCount(parseInt(e.target.value, 10) || 1)} inputProps={{ min: 1 }} />
                )}
                <FormControlLabel value="until_date" control={<Radio size="small" />} label="До даты" />
                {templateRepeatEndType === 'until_date' && (
                  <TextField type="date" size="small" sx={{ width: 160 }} value={templateRepeatEndUntil} onChange={(e) => setTemplateRepeatEndUntil(e.target.value)} InputLabelProps={{ shrink: true }} />
                )}
              </RadioGroup>
            </Stack>
          )}

          <Typography variant="subtitle2" sx={{ mt: 2 }}>Ученики</Typography>
          <Autocomplete
            multiple
            value={templateSelectedStudents}
            onChange={(_, newValue) => setTemplateSelectedStudents(newValue)}
            options={templateStudentOptions}
            getOptionLabel={(s) => s.full_name || ''}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            loading={templateStudentSearchLoading}
            onInputChange={(_, value) => {
              if (templateStudentSearchRef.current) clearTimeout(templateStudentSearchRef.current);
              if (!value.trim()) {
                setTemplateStudentOptions([]);
                return;
              }
              templateStudentSearchRef.current = setTimeout(() => {
                setTemplateStudentSearchLoading(true);
                studentsApi.getAll({ q: value.trim(), limit: 20 }).then((data) => {
                  setTemplateStudentOptions(Array.isArray(data) ? data : []);
                }).catch(() => setTemplateStudentOptions([])).finally(() => setTemplateStudentSearchLoading(false));
              }, 300);
            }}
            onKeyDown={(e) => {
              if (e.key === ' ' && templateStudentOptions.length > 0) {
                const first = templateStudentOptions.find((o) => !templateSelectedStudents.some((s) => s.id === o.id));
                if (first) {
                  e.preventDefault();
                  setTemplateSelectedStudents((prev) => [...prev, first]);
                  setTemplateStudentOptions([]);
                }
              }
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                placeholder="Введите фамилию или имя ученика, пробел — выбрать первого из списка"
                margin="dense"
              />
            )}
            renderTags={(value, getTagProps) =>
              value.map((s, i) => {
                const { key, ...chipProps } = getTagProps({ index: i });
                return <Chip key={key} label={s.full_name} {...chipProps} size="small" />;
              })
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveTemplate} disabled={templateSaving || !templateName.trim()}>
            {templateSaving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!followUpSourceTask} onClose={() => setFollowUpSourceTask(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Задача завершена</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Создать новую задачу на основе закрытой?
          </Typography>
          {followUpSourceTask && (
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
              <Typography variant="subtitle2">{followUpSourceTask.title}</Typography>
              {followUpSourceTask.description && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  {followUpSourceTask.description}
                </Typography>
              )}
            </Paper>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFollowUpSourceTask(null)}>Не создавать</Button>
          <Button
            variant="contained"
            onClick={() => {
              const source = followUpSourceTask;
              setFollowUpSourceTask(null);
              if (source) openTaskDialog(source, undefined, true);
            }}
          >
            Создать задачу
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={taskDialogOpen} onClose={() => setTaskDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{taskEditId ? 'Редактировать задачу' : 'Новая задача'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Название задачи"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Описание задачи"
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            margin="normal"
            multiline
            minRows={2}
          />
          {!taskEditId && (
            <>
              <TextField
                select
                fullWidth
                label="Шаблон (опционально)"
                value={taskTemplateId}
                onChange={(e) => setTaskTemplateId(e.target.value === '' ? '' : Number(e.target.value))}
                margin="normal"
                SelectProps={{ native: true }}
              >
                <option value="">— Без шаблона —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </TextField>
              <Typography variant="subtitle2" sx={{ mt: 2 }}>Подзадачи (если без шаблона)</Typography>
              {taskSubtasks.map((s, i) => (
                <TextField
                  key={i}
                  fullWidth
                  size="small"
                  value={s.text}
                  onChange={(e) => setTaskSubtasks((prev) => prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  placeholder={`Подзадача ${i + 1}`}
                  margin="dense"
                />
              ))}
              <Button size="small" onClick={addTaskSubtask} sx={{ mt: 0.5 }}>+ Подзадача</Button>
            </>
          )}

          <FormControlLabel
            control={<Checkbox checked={taskRepeatEnabled} onChange={(e) => setTaskRepeatEnabled(e.target.checked)} />}
            label="Повторять"
            sx={{ mt: 2, display: 'block' }}
          />
          {canManageTasks && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={taskIsParentResponses}
                  onChange={(e) => setTaskIsParentResponses(e.target.checked)}
                />
              }
              label="Ежедневный процесс: ответы на сообщения родителей"
              sx={{ mt: 1, display: 'block' }}
            />
          )}
          {taskRepeatEnabled && (
            <Stack spacing={1.5} sx={{ mt: 1, pl: 2, borderLeft: '2px solid', borderColor: 'divider' }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Период</InputLabel>
                <Select
                  value={taskRepeatFrequency}
                  label="Период"
                  onChange={(e) => setTaskRepeatFrequency(e.target.value as RepeatFrequency | '')}
                >
                  <MenuItem value="daily">Ежедневно</MenuItem>
                  <MenuItem value="weekly">Еженедельно</MenuItem>
                  <MenuItem value="monthly">Раз в месяц</MenuItem>
                </Select>
              </FormControl>
              {taskRepeatFrequency === 'weekly' && (
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">Дни недели</Typography>
                  <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
                    {WEEKDAY_LABELS.map((label, i) => (
                      <FormControlLabel
                        key={i}
                        control={<Checkbox size="small" checked={taskRepeatDays.includes(i)} onChange={(e) => setTaskRepeatDays(e.target.checked ? [...taskRepeatDays, i].sort((a, b) => a - b) : taskRepeatDays.filter((d) => d !== i))} />}
                        label={label}
                      />
                    ))}
                  </Stack>
                </Box>
              )}
              {taskRepeatFrequency === 'monthly' && (
                <TextField
                  size="small"
                  fullWidth
                  label="Дни месяца (через запятую, 1–31)"
                  placeholder="1, 15, 30"
                  value={taskRepeatDays.join(', ')}
                  onChange={(e) => setTaskRepeatDays(e.target.value.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n) && n >= 1 && n <= 31))}
                />
              )}
              <Typography variant="caption" color="text.secondary">Завершить повторение</Typography>
              <RadioGroup row value={taskRepeatEndType} onChange={(e) => setTaskRepeatEndType(e.target.value as RepeatEndType)}>
                <FormControlLabel value="never" control={<Radio size="small" />} label="Бессрочно" />
                <FormControlLabel value="after_count" control={<Radio size="small" />} label="После" />
                {taskRepeatEndType === 'after_count' && (
                  <TextField type="number" size="small" sx={{ width: 64 }} value={taskRepeatEndAfterCount} onChange={(e) => setTaskRepeatEndAfterCount(parseInt(e.target.value, 10) || 1)} inputProps={{ min: 1 }} />
                )}
                <FormControlLabel value="until_date" control={<Radio size="small" />} label="До даты" />
                {taskRepeatEndType === 'until_date' && (
                  <TextField type="date" size="small" sx={{ width: 160 }} value={taskRepeatEndUntil} onChange={(e) => setTaskRepeatEndUntil(e.target.value)} InputLabelProps={{ shrink: true }} />
                )}
              </RadioGroup>
            </Stack>
          )}

          <Typography variant="subtitle2" sx={{ mt: 2 }}>Ученики</Typography>
          <Autocomplete
            multiple
            value={taskSelectedStudents}
            onChange={(_, newValue) => setTaskSelectedStudents(newValue)}
            options={taskStudentOptions}
            getOptionLabel={(s) => s.full_name || ''}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            loading={taskStudentSearchLoading}
            onInputChange={(_, value) => {
              if (taskStudentSearchRef.current) clearTimeout(taskStudentSearchRef.current);
              if (!value.trim()) {
                setTaskStudentOptions([]);
                return;
              }
              taskStudentSearchRef.current = setTimeout(() => {
                setTaskStudentSearchLoading(true);
                studentsApi.getAll({ q: value.trim(), limit: 20 }).then((data) => {
                  setTaskStudentOptions(Array.isArray(data) ? data : []);
                }).catch(() => setTaskStudentOptions([])).finally(() => setTaskStudentSearchLoading(false));
              }, 300);
            }}
            onKeyDown={(e) => {
              if (e.key === ' ' && taskStudentOptions.length > 0) {
                const first = taskStudentOptions.find((o) => !taskSelectedStudents.some((s) => s.id === o.id));
                if (first) {
                  e.preventDefault();
                  setTaskSelectedStudents((prev) => [...prev, first]);
                  setTaskStudentOptions([]);
                }
              }
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                placeholder="Введите фамилию или имя ученика, пробел — выбрать первого из списка"
                margin="dense"
              />
            )}
            renderTags={(value, getTagProps) =>
              value.map((s, i) => {
                const { key, ...chipProps } = getTagProps({ index: i });
                return <Chip key={key} label={s.full_name} {...chipProps} size="small" />;
              })
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTaskDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveTask} disabled={taskSaving}>
            {taskSaving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default TasksPage;
