import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  AppBar,
  Box,
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
  Warning,
} from '@mui/icons-material';
import { ownerWorkspaceApi } from '../services/api';
import type { OwnerWorkspaceProject, OwnerWorkspaceTask } from '../types';

const priorityColor = (p: string): 'default' | 'warning' | 'error' | 'info' =>
  p === 'critical' ? 'error' : p === 'high' ? 'warning' : p === 'medium' ? 'info' : 'default';

const priorityLabel: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
};

const statusLabel: Record<string, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  waiting: 'Ожидание',
  completed: 'Завершена',
  cancelled: 'Отменена',
};

const projectStatusColor = (s: string): 'default' | 'success' | 'warning' =>
  s === 'active' ? 'success' : s === 'completed' ? 'default' : 'warning';

const MobileOwnerWorkspacePage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);

  const projectsQuery = useQuery({
    queryKey: ['mobile-ow-projects'],
    queryFn: () => ownerWorkspaceApi.listProjects({ status_filter: 'active' }),
  });

  const tasksQuery = useQuery({
    queryKey: ['mobile-ow-tasks'],
    queryFn: () => ownerWorkspaceApi.listTasks({ active_only: true, limit: 50, sort_by: 'deadline_at', sort_dir: 'asc' }),
  });

  const overdueQuery = useQuery({
    queryKey: ['mobile-ow-tasks-overdue'],
    queryFn: () => ownerWorkspaceApi.listTasks({ overdue_only: true, limit: 20 }),
  });

  const projects = (projectsQuery.data ?? []) as OwnerWorkspaceProject[];
  const tasks = ((tasksQuery.data as any)?.items ?? []) as OwnerWorkspaceTask[];
  const overdueTasks = ((overdueQuery.data as any)?.items ?? []) as OwnerWorkspaceTask[];

  const refetchAll = () => {
    void projectsQuery.refetch();
    void tasksQuery.refetch();
    void overdueQuery.refetch();
  };

  const isLoading = projectsQuery.isLoading || tasksQuery.isLoading;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f6f8fb', pb: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => navigate('/mobile')} aria-label="Назад">
            <ArrowBack />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0, ml: 1 }}>
            <Typography variant="subtitle1" fontWeight={900} noWrap>Таск трекер</Typography>
            {overdueTasks.length > 0 && (
              <Typography variant="caption" color="error.main">
                {overdueTasks.length} просроченных
              </Typography>
            )}
          </Box>
          <IconButton onClick={refetchAll} aria-label="Обновить"><Refresh /></IconButton>
        </Toolbar>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="fullWidth"
          sx={{ borderTop: '1px solid rgba(15,23,42,0.06)', minHeight: 40 }}
        >
          <Tab label="Проекты" sx={{ minHeight: 40, fontSize: '0.8rem' }} />
          <Tab
            label={
              <Stack direction="row" spacing={0.5} alignItems="center">
                <span>Задачи</span>
                {overdueTasks.length > 0 && (
                  <Warning color="error" sx={{ fontSize: 14 }} />
                )}
              </Stack>
            }
            sx={{ minHeight: 40, fontSize: '0.8rem' }}
          />
        </Tabs>
      </AppBar>

      <Container maxWidth="sm" sx={{ pt: 2, px: { xs: 1.5, sm: 3 } }}>
        {isLoading ? (
          <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
        ) : tab === 0 ? (
          <Stack spacing={1}>
            {projects.length === 0 ? (
              <Alert severity="info">Нет активных проектов</Alert>
            ) : projects.map((p) => (
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
                      <Typography variant="body2" fontWeight={700} sx={{ flex: 1, minWidth: 0 }} noWrap>
                        {p.name}
                      </Typography>
                      <Chip
                        size="small"
                        label={p.status === 'active' ? 'Активный' : p.status}
                        color={projectStatusColor(p.status)}
                        variant="outlined"
                        sx={{ flexShrink: 0 }}
                      />
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} useFlexGap flexWrap="wrap">
                      <Typography variant="caption" color="text.secondary">
                        Задач: {p.active_tasks_count}
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
        ) : (
          <Stack spacing={1}>
            {overdueTasks.length > 0 && (
              <Alert severity="error" icon={<Warning />} sx={{ borderRadius: 2 }}>
                {overdueTasks.length} задач просрочено
              </Alert>
            )}
            {tasks.length === 0 ? (
              <Alert severity="info">Нет активных задач</Alert>
            ) : tasks.map((t) => (
              <Paper key={t.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <Box sx={{
                    width: 38, height: 38, borderRadius: 1.5, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: t.deadline_at && new Date(t.deadline_at) < new Date() ? 'error.50' : 'grey.100',
                    color: t.deadline_at && new Date(t.deadline_at) < new Date() ? 'error.main' : 'text.secondary',
                  }}>
                    <Assignment fontSize="small" />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} noWrap>{t.title}</Typography>
                    <Stack direction="row" spacing={0.75} sx={{ mt: 0.5 }} useFlexGap flexWrap="wrap">
                      <Chip
                        size="small"
                        label={statusLabel[t.status] ?? t.status}
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                      <Chip
                        size="small"
                        label={priorityLabel[t.priority] ?? t.priority}
                        color={priorityColor(t.priority)}
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.25 }} useFlexGap flexWrap="wrap">
                      {t.deadline_at && (
                        <Typography
                          variant="caption"
                          color={new Date(t.deadline_at) < new Date() ? 'error.main' : 'text.secondary'}
                        >
                          {new Date(t.deadline_at) < new Date() ? 'Просрочено: ' : 'Дедлайн: '}
                          {new Date(t.deadline_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Container>
    </Box>
  );
};

export default MobileOwnerWorkspacePage;
