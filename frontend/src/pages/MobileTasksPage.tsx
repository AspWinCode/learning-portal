import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { Add, CheckCircle, Refresh } from '@mui/icons-material';
import { tasksApi } from '../services/api';
import type { TaskResponse } from '../types';
import { extractApiError } from '../utils/extractApiError';
import { MobileShell, mobileCardSx } from '../components/mobile/MobileShell';

const priorityColor = (p?: string) =>
  p === 'high' ? 'error' : p === 'low' ? 'default' : 'warning';

const priorityLabel = (p?: string) =>
  p === 'high' ? 'Высокий' : p === 'low' ? 'Низкий' : 'Средний';

const MobileTasksPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'today' | 'active'>('today');
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [error, setError] = useState('');

  const tasksQuery = useQuery({
    queryKey: ['mobile-tasks', tab],
    queryFn: () => tasksApi.listTodayTasks(tab),
  });

  const completeMutation = useMutation({
    mutationFn: (id: number) => tasksApi.completeTask(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-tasks'] }),
    onError: (err: unknown) => setError(extractApiError(err, 'Не удалось завершить')),
  });

  const createMutation = useMutation({
    mutationFn: () => tasksApi.createTask({ title: newTitle.trim() }),
    onSuccess: () => {
      setCreateOpen(false);
      setNewTitle('');
      queryClient.invalidateQueries({ queryKey: ['mobile-tasks'] });
    },
    onError: (err: unknown) => setError(extractApiError(err, 'Не удалось создать задачу')),
  });

  const tasks = tasksQuery.data ?? [];

  return (
    <MobileShell
      title="Задачи"
      subtitle={`${tasks.length} задач`}
      actions={(
        <>
          <IconButton onClick={() => setCreateOpen(true)} aria-label="Новая задача"><Add /></IconButton>
          <IconButton onClick={() => queryClient.invalidateQueries({ queryKey: ['mobile-tasks'] })} aria-label="Обновить">
            <Refresh />
          </IconButton>
        </>
      )}
    >
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="fullWidth"
          sx={{
            mb: 1.5,
            minHeight: 42,
            bgcolor: '#fff',
            borderRadius: 2,
            border: '1px solid rgba(15, 23, 42, 0.08)',
            '& .MuiTabs-indicator': { height: 3, borderRadius: 999 },
          }}
        >
          <Tab label="На сегодня" value="today" sx={{ minHeight: 40, fontSize: '0.8rem' }} />
          <Tab label="Все активные" value="active" sx={{ minHeight: 40, fontSize: '0.8rem' }} />
        </Tabs>
        <Stack spacing={1.25}>
          {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

          {tasksQuery.isLoading ? (
            <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
          ) : tasks.length === 0 ? (
            <Paper variant="outlined" sx={{ ...mobileCardSx, p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">
                {tab === 'today' ? 'На сегодня задач нет' : 'Нет активных задач'}
              </Typography>
              <Button startIcon={<Add />} onClick={() => setCreateOpen(true)} sx={{ mt: 1.5 }}>
                Создать задачу
              </Button>
            </Paper>
          ) : (
            tasks.map((task: TaskResponse) => (
              <Paper key={task.id} variant="outlined" sx={{ ...mobileCardSx, p: 1.5 }}>
                <Stack direction="row" spacing={1.25} alignItems="flex-start">
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
                      {task.title}
                    </Typography>
                    {task.description && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }} noWrap>
                        {task.description}
                      </Typography>
                    )}
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                      {task.priority && task.priority !== 'normal' && (
                        <Chip
                          size="small"
                          label={priorityLabel(task.priority)}
                          color={priorityColor(task.priority) as any}
                          variant="outlined"
                        />
                      )}
                      {task.due_at && (
                        <Chip
                          size="small"
                          label={`До ${new Date(task.due_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`}
                          variant="outlined"
                        />
                      )}
                      {(task.subtasks?.length ?? 0) > 0 && (
                        <Chip
                          size="small"
                          label={`${task.subtasks.filter((s) => s.completed).length}/${task.subtasks.length}`}
                          variant="outlined"
                        />
                      )}
                    </Stack>
                  </Box>
                  <IconButton
                    size="small"
                    color="success"
                    onClick={() => completeMutation.mutate(task.id)}
                    disabled={completeMutation.isPending}
                    aria-label="Завершить"
                    sx={{ flexShrink: 0, mt: -0.5 }}
                  >
                    <CheckCircle />
                  </IconButton>
                </Stack>
              </Paper>
            ))
          )}
        </Stack>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Новая задача</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Название задачи"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newTitle.trim()) createMutation.mutate(); }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={() => createMutation.mutate()}
            disabled={!newTitle.trim() || createMutation.isPending}
          >
            Создать
          </Button>
        </DialogActions>
      </Dialog>
    </MobileShell>
  );
};

export default MobileTasksPage;
