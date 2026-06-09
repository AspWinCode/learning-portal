import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  ArrowBack,
  Assignment,
  FolderOpen,
  Refresh,
} from '@mui/icons-material';
import { ownerWorkspaceApi } from '../services/api';
import type { OwnerWorkspaceProject, OwnerWorkspaceTask, OwnerWorkspaceTaskListPage } from '../types';

const TASK_PAGE_SIZE = 50;

const priorityColor = (p: string): 'default' | 'warning' | 'error' | 'info' =>
  p === 'critical' ? 'error' : p === 'high' ? 'warning' : p === 'medium' ? 'info' : 'default';

const priorityLabel: Record<string, string> = {
  low: 'Низкий', medium: 'Средний', high: 'Высокий', critical: 'Критический',
};
const taskStatusLabel: Record<string, string> = {
  new: 'Новая', in_progress: 'В работе', waiting: 'Ожидание', completed: 'Завершена', cancelled: 'Отменена',
};

const PROJECT_STATUS_TABS = [
  { value: '', label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'completed', label: 'Завершённые' },
  { value: 'archived', label: 'Архив' },
];
const TASK_STATUS_TABS = [
  { value: '', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'completed', label: 'Завершённые' },
];

const MobileOwnerWorkspacePage: React.FC = () => {
  const navigate = useNavigate();
  const [mainTab, setMainTab] = useState(0);
  const [projectStatus, setProjectStatus] = useState('');
  const [taskStatus, setTaskStatus] = useState('');
  const [taskOffset, setTaskOffset] = useState(0);
  const [allTasks, setAllTasks] = useState<OwnerWorkspaceTask[]>([]);

  const projectsQuery = useQuery({
    queryKey: ['mobile-ow-projects', projectStatus],
    queryFn: () =>
      ownerWorkspaceApi.listProjects(projectStatus ? { status_filter: projectStatus } : {}),
  });

  const tasksQuery = useQuery({
    queryKey: ['mobile-ow-tasks', taskStatus, taskOffset],
    queryFn: async () => {
      const params: Record<string, unknown> = {
        limit: TASK_PAGE_SIZE,
        offset: taskOffset,
        sort_by: 'deadline_at',
        sort_dir: 'asc',
      };
      if (taskStatus) params.status_filter = taskStatus;
      const page = await ownerWorkspaceApi.listTasks(params as Parameters<typeof ownerWorkspaceApi.listTasks>[0]) as OwnerWorkspaceTaskListPage;
      if (taskOffset === 0) {
        setAllTasks(page.items);
      } else {
        setAllTasks((prev) => [...prev, ...page.items]);
      }
      return page;
    },
  });

  const taskTotal = (tasksQuery.data as OwnerWorkspaceTaskListPage | undefined)?.total ?? 0;
  const projects = (projectsQuery.data ?? []) as OwnerWorkspaceProject[];

  const handleProjectStatusChange = (_: React.SyntheticEvent, v: string) => {
    setProjectStatus(v);
  };

  const handleTaskStatusChange = (_: React.SyntheticEvent, v: string) => {
    setTaskStatus(v);
    setTaskOffset(0);
    setAllTasks([]);
  };

  const loadMoreTasks = () => {
    setTaskOffset((prev) => prev + TASK_PAGE_SIZE);
  };

  const refetchAll = () => {
    setTaskOffset(0);
    setAllTasks([]);
    void projectsQuery.refetch();
    void tasksQuery.refetch();
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f6f8fb', pb: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => navigate('/mobile')} aria-label="Назад">
            <ArrowBack />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0, ml: 1 }}>
            <Typography variant="subtitle1" fontWeight={900} noWrap>Таск трекер</Typography>
          </Box>
          <IconButton onClick={refetchAll} aria-label="Обновить"><Refresh /></IconButton>
        </Toolbar>
        <Tabs
          value={mainTab}
          onChange={(_, v) => setMainTab(v)}
          variant="fullWidth"
          sx={{ borderTop: '1px solid rgba(15,23,42,0.06)', minHeight: 40 }}
        >
          <Tab label={`Проекты${projects.length ? ` (${projects.length})` : ''}`} sx={{ minHeight: 40, fontSize: '0.8rem' }} />
          <Tab label={`Задачи${taskTotal ? ` (${taskTotal})` : ''}`} sx={{ minHeight: 40, fontSize: '0.8rem' }} />
        </Tabs>
      </AppBar>

      <Container maxWidth="sm" sx={{ pt: 1.5, px: { xs: 1.5, sm: 3 } }}>
        {mainTab === 0 ? (
          <>
            <Tabs
              value={projectStatus}
              onChange={handleProjectStatusChange}
              variant="scrollable"
              scrollButtons={false}
              sx={{ mb: 1.5, minHeight: 36, '& .MuiTab-root': { minHeight: 36, fontSize: '0.75rem', minWidth: 64 } }}
            >
              {PROJECT_STATUS_TABS.map((t) => (
                <Tab key={t.value} label={t.label} value={t.value} />
              ))}
            </Tabs>

            {projectsQuery.isLoading ? (
              <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
            ) : projectsQuery.isError ? (
              <Alert severity="error">Не удалось загрузить проекты</Alert>
            ) : projects.length === 0 ? (
              <Alert severity="info">Нет проектов</Alert>
            ) : (
              <Stack spacing={1}>
                {projects.map((p) => (
                  <Paper key={p.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                      <Box sx={{
                        width: 38, height: 38, borderRadius: 1.5, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: 'primary.50', color: 'primary.main',
                      }}>
                        <FolderOpen fontSize="small" />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                          <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }} noWrap>
                            {p.name}
                          </Typography>
                          <Chip size="small" label={p.status} variant="outlined" sx={{ flexShrink: 0, fontSize: '0.68rem' }} />
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} useFlexGap flexWrap="wrap">
                          <Typography variant="caption" color="text.secondary">
                            Активных задач: {p.active_tasks_count}
                          </Typography>
                          {(p.overdue_tasks_count ?? 0) > 0 && (
                            <Typography variant="caption" color="error.main">
                              Просрочено: {p.overdue_tasks_count}
                            </Typography>
                          )}
                          {p.owner_name && (
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {p.owner_name}
                            </Typography>
                          )}
                        </Stack>
                        {p.deadline_at && (
                          <Typography variant="caption" color="text.secondary">
                            Дедлайн: {new Date(p.deadline_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </>
        ) : (
          <>
            <Tabs
              value={taskStatus}
              onChange={handleTaskStatusChange}
              variant="scrollable"
              scrollButtons={false}
              sx={{ mb: 1.5, minHeight: 36, '& .MuiTab-root': { minHeight: 36, fontSize: '0.75rem', minWidth: 64 } }}
            >
              {TASK_STATUS_TABS.map((t) => (
                <Tab key={t.value} label={t.label} value={t.value} />
              ))}
            </Tabs>

            {tasksQuery.isLoading && taskOffset === 0 ? (
              <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
            ) : tasksQuery.isError && allTasks.length === 0 ? (
              <Alert severity="error">Не удалось загрузить задачи</Alert>
            ) : allTasks.length === 0 ? (
              <Alert severity="info">Нет задач</Alert>
            ) : (
              <Stack spacing={1}>
                {allTasks.map((t) => {
                  const isOverdue = t.deadline_at && new Date(t.deadline_at) < new Date() && t.status !== 'completed' && t.status !== 'cancelled';
                  return (
                    <Paper key={t.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                      <Stack direction="row" spacing={1.5} alignItems="flex-start">
                        <Box sx={{
                          width: 38, height: 38, borderRadius: 1.5, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          bgcolor: isOverdue ? 'error.50' : 'grey.100',
                          color: isOverdue ? 'error.main' : 'text.secondary',
                        }}>
                          <Assignment fontSize="small" />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={700} noWrap>{t.title}</Typography>
                          <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }} useFlexGap flexWrap="wrap">
                            <Chip
                              size="small"
                              label={taskStatusLabel[t.status] ?? t.status}
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.68rem' }}
                            />
                            <Chip
                              size="small"
                              label={priorityLabel[t.priority] ?? t.priority}
                              color={priorityColor(t.priority)}
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.68rem' }}
                            />
                          </Stack>
                          {t.deadline_at && (
                            <Typography
                              variant="caption"
                              color={isOverdue ? 'error.main' : 'text.secondary'}
                              sx={{ display: 'block', mt: 0.25 }}
                            >
                              {isOverdue ? 'Просрочено: ' : 'Дедлайн: '}
                              {new Date(t.deadline_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </Typography>
                          )}
                        </Box>
                      </Stack>
                    </Paper>
                  );
                })}

                {allTasks.length < taskTotal && (
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={loadMoreTasks}
                    disabled={tasksQuery.isLoading}
                    sx={{ mt: 0.5 }}
                  >
                    {tasksQuery.isLoading ? <CircularProgress size={20} /> : `Загрузить ещё (${taskTotal - allTasks.length})`}
                  </Button>
                )}

                <Typography variant="caption" color="text.secondary" textAlign="center">
                  Показано {allTasks.length} из {taskTotal}
                </Typography>
              </Stack>
            )}
          </>
        )}
      </Container>
    </Box>
  );
};

export default MobileOwnerWorkspacePage;
