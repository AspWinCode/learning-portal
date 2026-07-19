import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  LinearProgress,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import OpenInNew from '@mui/icons-material/OpenInNew';
import Refresh from '@mui/icons-material/Refresh';
import Done from '@mui/icons-material/Done';
import PushPin from '@mui/icons-material/PushPin';
import WarningAmber from '@mui/icons-material/WarningAmber';
import { Link as RouterLink } from 'react-router-dom';
import Layout from '../components/Layout';
import { ownerWorkspaceApi } from '../services/api/ownerWorkspace';
import { extractApiError } from '../utils/extractApiError';
import type { OwnerWorkspaceTask } from '../types';

type PlanBucket = 'must' | 'should' | 'can_move';

type PlannerTask = {
  id: string;
  source: 'task_tracker';
  entityId: string;
  title: string;
  description?: string | null;
  status: string;
  priority: 'low' | 'normal' | 'medium' | 'high' | 'critical';
  deadline?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  estimatedDuration: number;
  assignee?: string | number | null;
  score: number;
  urgencyScore: number;
  riskScore: number;
  importanceScore: number;
  ageScore: number;
  bucket: PlanBucket;
  overdue: boolean;
  dueToday: boolean;
  dueTomorrow: boolean;
  dueThisWeek: boolean;
  reason: string;
  openUrl: string;
  raw?: OwnerWorkspaceTask;
};

const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value?: string | null) => {
  const parsed = parseDate(value);
  if (!parsed) return 'Без срока';
  return parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const daysBetween = (from: Date, to: Date) => {
  const start = new Date(from);
  const end = new Date(to);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / 86400000);
};

const priorityWeight = (priority: PlannerTask['priority']) => {
  if (priority === 'critical') return 100;
  if (priority === 'high') return 85;
  if (priority === 'medium' || priority === 'normal') return 55;
  return 30;
};

const normalizePriority = (value?: string | null): PlannerTask['priority'] => {
  if (value === 'critical' || value === 'high' || value === 'medium' || value === 'normal' || value === 'low') {
    return value;
  }
  return 'normal';
};

const urgencyByDeadline = (deadline?: string | null) => {
  const due = parseDate(deadline);
  if (!due) return 20;
  const diff = daysBetween(todayStart(), due);
  if (diff < 0) return 100;
  if (diff === 0) return 90;
  if (diff === 1) return 80;
  if (diff <= 3) return 60;
  if (diff <= 7) return 40;
  return 20;
};

const riskByDeadline = (deadline?: string | null, estimatedDuration = 60) => {
  const due = parseDate(deadline);
  if (!due) return estimatedDuration >= 180 ? 45 : 20;
  const diff = daysBetween(todayStart(), due);
  if (diff < 0) return 100;
  if (diff === 0) return estimatedDuration >= 180 ? 95 : 85;
  if (diff === 1) return estimatedDuration >= 180 ? 80 : 65;
  if (diff <= 3) return 55;
  if (diff <= 7) return 35;
  return 15;
};

const ageScore = (createdAt?: string | null) => {
  const created = parseDate(createdAt);
  if (!created) return 10;
  const age = Math.max(0, daysBetween(created, todayStart()));
  if (age >= 30) return 100;
  if (age >= 14) return 70;
  if (age >= 7) return 50;
  if (age >= 3) return 30;
  return 10;
};

const buildScore = (task: Omit<PlannerTask, 'score' | 'urgencyScore' | 'riskScore' | 'importanceScore' | 'ageScore' | 'bucket' | 'overdue' | 'dueToday' | 'dueTomorrow' | 'dueThisWeek'>) => {
  const due = parseDate(task.deadline);
  const diff = due ? daysBetween(todayStart(), due) : null;
  const urgencyScore = urgencyByDeadline(task.deadline);
  const riskScore = riskByDeadline(task.deadline, task.estimatedDuration);
  const importanceScore = priorityWeight(task.priority);
  const taskAgeScore = ageScore(task.createdAt);
  const score = Math.min(
    100,
    Math.round(urgencyScore * 0.4 + riskScore * 0.3 + importanceScore * 0.2 + taskAgeScore * 0.1)
  );
  const overdue = diff != null && diff < 0;
  const dueToday = diff === 0;
  const dueTomorrow = diff === 1;
  const dueThisWeek = diff != null && diff >= 0 && diff <= 7;
  const bucket: PlanBucket =
    overdue || dueToday || task.priority === 'critical' || score >= 75
      ? 'must'
      : score >= 50 || dueTomorrow || task.priority === 'high'
        ? 'should'
        : 'can_move';
  return { score, urgencyScore, riskScore, importanceScore, ageScore: taskAgeScore, bucket, overdue, dueToday, dueTomorrow, dueThisWeek };
};

const withScore = (task: Omit<PlannerTask, 'score' | 'urgencyScore' | 'riskScore' | 'importanceScore' | 'ageScore' | 'bucket' | 'overdue' | 'dueToday' | 'dueTomorrow' | 'dueThisWeek'>): PlannerTask => ({
  ...task,
  ...buildScore(task),
});

const estimateTaskDuration = (task: OwnerWorkspaceTask) => {
  if (task.effort_hours != null || task.effort_minutes != null) {
    return ((task.effort_hours ?? 0) * 60) + (task.effort_minutes ?? 0);
  }
  const checklistMinutes = (Array.isArray(task.checklist) ? task.checklist.length : 1) * 25;
  if (task.priority === 'high' || task.priority === 'critical') return Math.max(45, checklistMinutes);
  return Math.max(30, checklistMinutes);
};

const mergeByBestScore = (tasks: PlannerTask[]) => {
  const map = new Map<string, PlannerTask>();
  tasks.forEach((task) => {
    const existing = map.get(task.id);
    if (!existing || task.score > existing.score) {
      map.set(task.id, task);
    } else if (existing.reason && task.reason && !existing.reason.includes(task.reason)) {
      existing.reason = `${existing.reason}; ${task.reason}`;
    }
  });
  return Array.from(map.values()).sort((a, b) => b.score - a.score || Number(a.deadline == null) - Number(b.deadline == null));
};

const TaskCard: React.FC<{
  task: PlannerTask;
  onComplete: (task: PlannerTask) => void;
  onPinToday: (task: PlannerTask) => void;
  actionLoadingId: string | null;
}> = ({ task, onComplete, onPinToday, actionLoadingId }) => {
  const loading = actionLoadingId === task.id;
  return (
    <Card variant="outlined" sx={{ borderColor: task.overdue ? 'error.light' : task.score >= 75 ? 'warning.light' : 'divider' }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack spacing={1}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1}>
            <Box>
              <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" color="primary" label="Таск-трекер" />
                <Chip size="small" variant="outlined" label={`Score ${task.score}`} />
                <Chip
                  size="small"
                  color={task.priority === 'critical' ? 'error' : task.priority === 'high' ? 'warning' : 'default'}
                  label={task.priority}
                />
                {task.overdue && <Chip size="small" color="error" label="Просрочено" />}
                {task.dueToday && <Chip size="small" color="primary" label="Сегодня" />}
              </Stack>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 1 }}>
                {task.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {task.reason} · срок: {formatDate(task.deadline)} · оценка: {Math.round(task.estimatedDuration / 30) / 2} ч
              </Typography>
              {task.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {task.description}
                </Typography>
              )}
            </Box>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ minWidth: { md: 260 }, justifyContent: { md: 'flex-end' } }}>
              <Button size="small" variant="outlined" startIcon={<PushPin />} disabled={loading} onClick={() => onPinToday(task)}>
                В план
              </Button>
              <Button size="small" variant="contained" startIcon={<Done />} disabled={loading} onClick={() => onComplete(task)}>
                Готово
              </Button>
              <Button size="small" startIcon={<OpenInNew />} component={RouterLink} to={task.openUrl}>
                Открыть
              </Button>
            </Stack>
          </Stack>
          <Tooltip title={`Срочность ${task.urgencyScore}, риск ${task.riskScore}, важность ${task.importanceScore}, возраст ${task.ageScore}`}>
            <LinearProgress
              variant="determinate"
              value={task.score}
              color={task.score >= 75 ? 'warning' : task.score >= 50 ? 'primary' : 'success'}
              sx={{ height: 6, borderRadius: 999 }}
            />
          </Tooltip>
        </Stack>
      </CardContent>
    </Card>
  );
};

const TaskSection: React.FC<{
  title: string;
  caption: string;
  tasks: PlannerTask[];
  onComplete: (task: PlannerTask) => void;
  onPinToday: (task: PlannerTask) => void;
  actionLoadingId: string | null;
}> = ({ title, caption, tasks, onComplete, onPinToday, actionLoadingId }) => (
  <Card variant="outlined">
    <CardContent>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6">{title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {caption}
          </Typography>
        </Box>
        <Chip label={tasks.length} />
      </Stack>
      {tasks.length === 0 ? (
        <Typography color="text.secondary">Нет задач</Typography>
      ) : (
        <Stack spacing={1.25}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={onComplete}
              onPinToday={onPinToday}
              actionLoadingId={actionLoadingId}
            />
          ))}
        </Stack>
      )}
    </CardContent>
  </Card>
);

const B2BPlanForTodayPage: React.FC = () => {
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [tab, setTab] = useState<'focus' | 'day' | 'week' | 'risks' | 'all'>('focus');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const loadPlanner = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const page = await ownerWorkspaceApi.listTasks({ active_only: true, limit: 500 });
      const nextTasks: PlannerTask[] = page.items.map((task) =>
        withScore({
          id: `task_tracker:${task.id}`,
          source: 'task_tracker',
          entityId: String(task.id),
          title: task.title || `Задача #${task.id}`,
          description: task.description,
          status: task.status,
          priority: normalizePriority(task.priority),
          deadline: task.deadline_at,
          createdAt: task.created_at,
          updatedAt: task.updated_at,
          estimatedDuration: estimateTaskDuration(task),
          assignee: task.assignee_id,
          reason: 'Открытая задача',
          openUrl: `/owner-workspace?task=${task.id}`,
          raw: task,
        })
      );
      setTasks(mergeByBestScore(nextTasks));
    } catch (err: any) {
      setLoadError(extractApiError(err, 'Не удалось загрузить задачи'));
    } finally {
      setLastUpdatedAt(new Date());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlanner();
    const timer = window.setInterval(() => {
      void loadPlanner();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [loadPlanner]);

  const stats = useMemo(() => {
    const active = tasks.filter((task) => task.status !== 'completed' && task.status !== 'archived' && task.status !== 'cancelled');
    const must = active.filter((task) => task.bucket === 'must');
    const week = active.filter((task) => task.dueThisWeek);
    const totalMinutesToday = must.reduce((sum, task) => sum + task.estimatedDuration, 0);
    const totalMinutesWeek = week.reduce((sum, task) => sum + task.estimatedDuration, 0);
    return {
      total: active.length,
      active: active.length,
      overdue: active.filter((task) => task.overdue).length,
      critical: active.filter((task) => task.priority === 'critical' || task.score >= 85).length,
      recommendedToday: must.length,
      movable: active.filter((task) => task.bucket === 'can_move').length,
      dayHours: Math.round((totalMinutesToday / 60) * 10) / 10,
      weekHours: Math.round((totalMinutesWeek / 60) * 10) / 10,
      dayOverload: Math.max(0, Math.round(((totalMinutesToday - 8 * 60) / 60) * 10) / 10),
    };
  }, [tasks]);

  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status !== 'completed' && t.status !== 'archived' && t.status !== 'cancelled' && t.status !== 'done'),
    [tasks],
  );
  const mustToday = useMemo(() => activeTasks.filter((task) => task.bucket === 'must').slice(0, 25), [activeTasks]);
  const shouldToday = useMemo(() => activeTasks.filter((task) => task.bucket === 'should').slice(0, 25), [activeTasks]);
  const canMove = useMemo(() => activeTasks.filter((task) => task.bucket === 'can_move').slice(0, 25), [activeTasks]);
  const weekPlan = useMemo(() => activeTasks.filter((task) => task.dueThisWeek && !task.overdue).slice(0, 50), [activeTasks]);
  const risks = useMemo(() => activeTasks.filter((task) => task.overdue || task.score >= 75 || task.riskScore >= 70).slice(0, 50), [activeTasks]);

  const handleComplete = async (task: PlannerTask) => {
    setActionLoadingId(task.id);
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    try {
      await ownerWorkspaceApi.completeTask(Number(task.entityId), { action: 'close' });
      await loadPlanner();
    } catch {
      await loadPlanner();
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePinToday = async (task: PlannerTask) => {
    // Owner workspace tasks don't have pin — open the task instead
    window.location.href = task.openUrl;
  };

  return (
    <Layout>
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
          <Box>
            <Typography variant="h4" fontWeight={800}>
              Мой фокус
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Задачи из таск-трекера. Рекомендации пересчитываются каждые 5 минут.
            </Typography>
          </Box>
          <Button variant="outlined" startIcon={<Refresh />} disabled={loading} onClick={() => void loadPlanner()}>
            Обновить
          </Button>
        </Stack>

        {loadError && <Alert severity="error">{loadError}</Alert>}

        {stats.dayOverload > 0 && (
          <Alert severity="warning" icon={<WarningAmber />}>
            Перегрузка на сегодня: {stats.dayHours} ч задач при доступных 8 ч. Рекомендуется перенести {stats.dayOverload} ч из блока «Можно перенести».
          </Alert>
        )}

        <Grid container spacing={2}>
          {[
            ['Всего задач', stats.total],
            ['Активных задач', stats.active],
            ['Просрочено', stats.overdue],
            ['Критических', stats.critical],
            ['Рекомендуется сегодня', stats.recommendedToday],
            ['Можно перенести', stats.movable],
          ].map(([label, value]) => (
            <Grid item xs={12} sm={6} md={2} key={label}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography variant="h4" fontWeight={800}>
                    {value}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Card variant="outlined">
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} alignItems="center">
              <Box>
                <Typography variant="h6">Прогноз нагрузки</Typography>
                <Typography variant="body2" color="text.secondary">
                  Сегодня: {stats.dayHours} ч из 8 ч · Неделя: {stats.weekHours} ч из 40 ч
                </Typography>
              </Box>
              <Chip color="primary" label={`Таск-трекер: ${stats.total}`} />
            </Stack>
          </CardContent>
        </Card>

        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto">
          <Tab value="focus" label="Фокус" />
          <Tab value="day" label="План на день" />
          <Tab value="week" label="План на неделю" />
          <Tab value="risks" label="Риски" />
          <Tab value="all" label="Все задачи" />
        </Tabs>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {tab === 'focus' && (
              <Stack spacing={2}>
                <TaskSection
                  title="Обязательно выполнить сегодня"
                  caption="Критические и просроченные задачи, а также задачи с высоким рейтингом риска."
                  tasks={mustToday}
                  onComplete={handleComplete}
                  onPinToday={handlePinToday}
                  actionLoadingId={actionLoadingId}
                />
                <TaskSection
                  title="Желательно выполнить"
                  caption="Средний приоритет: выполнить после критичных задач, если хватает времени."
                  tasks={shouldToday}
                  onComplete={handleComplete}
                  onPinToday={handlePinToday}
                  actionLoadingId={actionLoadingId}
                />
                <TaskSection
                  title="Можно перенести"
                  caption="Задачи без явного риска просрочки. Используйте этот блок при перегрузке дня."
                  tasks={canMove}
                  onComplete={handleComplete}
                  onPinToday={handlePinToday}
                  actionLoadingId={actionLoadingId}
                />
              </Stack>
            )}

            {tab === 'day' && (
              <TaskSection
                title="План на день"
                caption="Задачи, которые система рекомендует держать в сегодняшнем фокусе."
                tasks={[...mustToday, ...shouldToday].slice(0, 50)}
                onComplete={handleComplete}
                onPinToday={handlePinToday}
                actionLoadingId={actionLoadingId}
              />
            )}

            {tab === 'week' && (
              <TaskSection
                title="План на неделю"
                caption="Задачи со сроком в ближайшие 7 дней, отсортированы по рейтингу."
                tasks={weekPlan}
                onComplete={handleComplete}
                onPinToday={handlePinToday}
                actionLoadingId={actionLoadingId}
              />
            )}

            {tab === 'risks' && (
              <TaskSection
                title="Риски"
                caption="Скоро просрочатся, уже просрочены, либо имеют высокий риск по score."
                tasks={risks}
                onComplete={handleComplete}
                onPinToday={handlePinToday}
                actionLoadingId={actionLoadingId}
              />
            )}

            {tab === 'all' && (
              <TaskSection
                title="Единый реестр задач"
                caption="Дедуплицированный список задач из всех доступных источников."
                tasks={tasks}
                onComplete={handleComplete}
                onPinToday={handlePinToday}
                actionLoadingId={actionLoadingId}
              />
            )}
          </>
        )}

        <Typography variant="caption" color="text.secondary">
          {lastUpdatedAt ? `Последнее обновление: ${lastUpdatedAt.toLocaleTimeString('ru-RU')}` : 'Данные ещё не загружены'}
        </Typography>
      </Stack>
    </Layout>
  );
};

export default B2BPlanForTodayPage;
