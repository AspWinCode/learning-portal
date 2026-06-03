import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  Archive as ArchiveIcon,
  Edit as EditIcon,
  NavigateNext as NavigateNextIcon,
  Add as AddIcon,
} from '@mui/icons-material';

import Layout from '../components/Layout';
import { ConfirmDialog, DataTable, EmptyState } from '../components/ui';
import { ownerWorkspaceApi } from '../services/api';
import type {
  OwnerWorkspaceAuditLog,
  OwnerWorkspaceCounterparty,
  OwnerWorkspaceProject,
  OwnerWorkspaceProjectStatus,
  OwnerWorkspaceTask,
} from '../types';
import { extractApiError } from '../utils/extractApiError';

// ─── Project status helpers ────────────────────────────────────────────────

const PROJECT_STATUS_LABELS: Record<string, string> = {
  new: 'Новый',
  in_progress: 'В работе',
  on_review: 'На согласовании',
  completed: 'Завершён',
  archived: 'Архив',
  active: 'Активный',
};

type ChipColor = 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';

const PROJECT_STATUS_COLORS: Record<string, ChipColor> = {
  new: 'default',
  in_progress: 'primary',
  on_review: 'warning',
  completed: 'success',
  archived: 'default',
  active: 'info',
};

const CONTACT_TYPE_LABELS: Record<string, string> = {
  company: 'Компания',
  ip: 'ИП',
  individual: 'Физлицо',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Create-project form ────────────────────────────────────────────────────

type ProjectFormState = {
  name: string;
  status: OwnerWorkspaceProjectStatus;
  owner_id: string;
  deadline_at: string;
  description: string;
};

const emptyProjectForm = (): ProjectFormState => ({
  name: '',
  status: 'new',
  owner_id: '',
  deadline_at: '',
  description: '',
});

// ─── Edit-counterparty form ─────────────────────────────────────────────────

type CounterpartyFormState = {
  full_name: string;
  phone: string;
  email: string;
  company: string;
  position: string;
  comment: string;
  type: string;
};

// ─── Tab panel helper ────────────────────────────────────────────────────────

interface TabPanelProps {
  children?: React.ReactNode;
  value: number;
  index: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <Box role="tabpanel" hidden={value !== index} sx={{ pt: 2 }}>
    {value === index ? children : null}
  </Box>
);

// ─── Component ───────────────────────────────────────────────────────────────

const CounterpartyDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const counterpartyId = Number(id);

  const [counterparty, setCounterparty] = useState<OwnerWorkspaceCounterparty | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tab, setTab] = useState(0);

  // Projects tab
  const [projects, setProjects] = useState<OwnerWorkspaceProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  // History tab
  const [history, setHistory] = useState<OwnerWorkspaceAuditLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Tasks tab
  const [tasks, setTasks] = useState<OwnerWorkspaceTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [savingTask, setSavingTask] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<CounterpartyFormState>({
    full_name: '',
    phone: '',
    email: '',
    company: '',
    position: '',
    comment: '',
    type: 'individual',
  });
  const [saving, setSaving] = useState(false);

  // Archive confirm
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Create project dialog
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(emptyProjectForm());
  const [projectSaving, setProjectSaving] = useState(false);

  // ─── Load counterparty ────────────────────────────────────────────────────

  const loadCounterparty = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await ownerWorkspaceApi.getCounterparty(counterpartyId);
      setCounterparty(data);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить контрагента.'));
    } finally {
      setLoading(false);
    }
  }, [counterpartyId]);

  useEffect(() => {
    void loadCounterparty();
  }, [loadCounterparty]);

  // ─── Load projects ────────────────────────────────────────────────────────

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const data = await ownerWorkspaceApi.listProjects({ counterparty_id: counterpartyId });
      setProjects(data);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить проекты.'));
    } finally {
      setProjectsLoading(false);
    }
  }, [counterpartyId]);

  // ─── Load history ─────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await ownerWorkspaceApi.listHistory({
        entity_type: 'contact',
        entity_id: counterpartyId,
        sort_order: 'desc',
      });
      setHistory(data);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить историю.'));
    } finally {
      setHistoryLoading(false);
    }
  }, [counterpartyId]);

  // ─── Load tasks ───────────────────────────────────────────────────────────

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const res = await ownerWorkspaceApi.listTasks({ contact_id: counterpartyId, limit: 200 });
      setTasks(res.items);
    } catch {
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [counterpartyId]);

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim()) return;
    setSavingTask(true);
    try {
      await ownerWorkspaceApi.createTask({
        title: newTaskTitle.trim(),
        priority: newTaskPriority,
        deadline_at: newTaskDeadline || null,
        contact_id: counterpartyId,
        status: 'new',
      });
      setNewTaskTitle('');
      setNewTaskDeadline('');
      setNewTaskPriority('medium');
      setTaskFormOpen(false);
      await loadTasks();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось создать задачу.'));
    } finally {
      setSavingTask(false);
    }
  };

  // Load tab data lazily
  useEffect(() => {
    if (tab === 1) void loadProjects();
    if (tab === 2) void loadTasks();
    if (tab === 3) void loadHistory();
  }, [tab, loadProjects, loadTasks, loadHistory]);

  // ─── Edit handlers ────────────────────────────────────────────────────────

  const openEditDialog = () => {
    if (!counterparty) return;
    setEditForm({
      full_name: counterparty.full_name || '',
      phone: counterparty.phone || '',
      email: counterparty.email || '',
      company: counterparty.company || '',
      position: counterparty.position || '',
      comment: counterparty.comment || '',
      type: counterparty.type || 'individual',
    });
    setError('');
    setSuccess('');
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm.full_name.trim()) {
      setError('Укажите название контрагента.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await ownerWorkspaceApi.updateCounterparty(counterpartyId, {
        full_name: editForm.full_name.trim(),
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        company: editForm.company.trim() || null,
        position: editForm.position.trim() || null,
        comment: editForm.comment.trim() || null,
      });
      setSuccess('Контрагент обновлён.');
      setEditOpen(false);
      await loadCounterparty();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось сохранить.'));
    } finally {
      setSaving(false);
    }
  };

  // ─── Archive handlers ─────────────────────────────────────────────────────

  const handleArchive = async () => {
    setError('');
    try {
      if (counterparty?.is_archived) {
        await ownerWorkspaceApi.unarchiveCounterparty(counterpartyId);
        setSuccess('Контрагент разархивирован.');
      } else {
        await ownerWorkspaceApi.archiveCounterparty(counterpartyId);
        setSuccess('Контрагент архивирован.');
      }
      setArchiveOpen(false);
      await loadCounterparty();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось изменить статус контрагента.'));
    }
  };

  // ─── Create project handlers ──────────────────────────────────────────────

  const openProjectDialog = () => {
    setProjectForm(emptyProjectForm());
    setError('');
    setProjectDialogOpen(true);
  };

  const handleCreateProject = async () => {
    if (!projectForm.name.trim()) {
      setError('Укажите название проекта.');
      return;
    }
    setProjectSaving(true);
    setError('');
    try {
      await ownerWorkspaceApi.createProject({
        name: projectForm.name.trim(),
        status: projectForm.status as string,
        deadline_at: projectForm.deadline_at || null,
        description: projectForm.description.trim() || null,
        counterparty_id: counterpartyId,
        owner_id: projectForm.owner_id ? Number(projectForm.owner_id) : null,
      });
      setSuccess('Проект создан.');
      setProjectDialogOpen(false);
      await loadProjects();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось создать проект.'));
    } finally {
      setProjectSaving(false);
    }
  };

  // ─── Derived values ───────────────────────────────────────────────────────

  const typeLabel = useMemo(
    () => CONTACT_TYPE_LABELS[counterparty?.type ?? ''] ?? counterparty?.type ?? '',
    [counterparty]
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Layout>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
          <CircularProgress />
        </Box>
      </Layout>
    );
  }

  if (!counterparty) {
    return (
      <Layout>
        <Box sx={{ p: 3 }}>
          <Alert severity="error">{error || 'Контрагент не найден.'}</Alert>
        </Box>
      </Layout>
    );
  }

  return (
    <Layout>
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Breadcrumbs */}
        <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
          <Link
            component="button"
            underline="hover"
            color="inherit"
            onClick={() => navigate('/owner-workspace/counterparties')}
          >
            Контрагенты
          </Link>
          <Typography color="text.primary">{counterparty.full_name}</Typography>
        </Breadcrumbs>

        {error ? <Alert severity="error">{error}</Alert> : null}
        {success ? <Alert severity="success">{success}</Alert> : null}

        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h4">{counterparty.full_name}</Typography>
              <Chip size="small" label={typeLabel} variant="outlined" />
              {counterparty.is_archived ? <Chip size="small" label="Архив" color="default" /> : null}
            </Stack>
            {counterparty.company ? (
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                {counterparty.company}
              </Typography>
            ) : null}
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<EditIcon />} onClick={openEditDialog}>
              Редактировать
            </Button>
            <Button
              variant="outlined"
              color={counterparty.is_archived ? 'success' : 'warning'}
              startIcon={<ArchiveIcon />}
              onClick={() => setArchiveOpen(true)}
            >
              {counterparty.is_archived ? 'Разархивировать' : 'Архивировать'}
            </Button>
          </Stack>
        </Box>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tab} onChange={(_, v: number) => setTab(v)}>
            <Tab label="Основное" />
            <Tab label="Проекты" />
            <Tab label="Задачи" />
            <Tab label="История" />
          </Tabs>
        </Box>

        {/* Tab: Основное */}
        <TabPanel value={tab} index={0}>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Stack spacing={2} divider={<Divider />}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Typography fontWeight={600} sx={{ minWidth: 180 }}>Тип</Typography>
                <Typography>{typeLabel || '—'}</Typography>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Typography fontWeight={600} sx={{ minWidth: 180 }}>ФИО / Название</Typography>
                <Typography>{counterparty.full_name || '—'}</Typography>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Typography fontWeight={600} sx={{ minWidth: 180 }}>Телефон</Typography>
                <Typography>{counterparty.phone || '—'}</Typography>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Typography fontWeight={600} sx={{ minWidth: 180 }}>Email</Typography>
                <Typography>{counterparty.email || '—'}</Typography>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Typography fontWeight={600} sx={{ minWidth: 180 }}>Компания</Typography>
                <Typography>{counterparty.company || '—'}</Typography>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Typography fontWeight={600} sx={{ minWidth: 180 }}>Должность</Typography>
                <Typography>{counterparty.position || '—'}</Typography>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Typography fontWeight={600} sx={{ minWidth: 180 }}>Комментарий</Typography>
                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{counterparty.comment || '—'}</Typography>
              </Stack>
            </Stack>
          </Paper>
        </TabPanel>

        {/* Tab: Проекты */}
        <TabPanel value={tab} index={1}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openProjectDialog}>
              Создать проект
            </Button>
          </Box>
          <DataTable
            columns={[
              {
                key: 'name',
                header: 'Название',
                render: (row) => (
                  <Link
                    component="button"
                    underline="hover"
                    onClick={() => navigate(`/owner-workspace/projects/${row.id}`)}
                    sx={{ fontWeight: 600, textAlign: 'left' }}
                  >
                    {row.name}
                  </Link>
                ),
              },
              {
                key: 'status',
                header: 'Статус',
                render: (row) => (
                  <Chip
                    size="small"
                    label={PROJECT_STATUS_LABELS[row.status] ?? row.status}
                    color={PROJECT_STATUS_COLORS[row.status] ?? 'default'}
                  />
                ),
              },
              {
                key: 'owner',
                header: 'Ответственный',
                render: (row) => <Typography variant="body2">{row.owner_name || '—'}</Typography>,
              },
              {
                key: 'deadline',
                header: 'Дедлайн',
                render: (row) => <Typography variant="body2">{formatDate(row.deadline_at)}</Typography>,
              },
              {
                key: 'tasks',
                header: 'Задачи',
                align: 'center',
                render: (row) => (
                  <Typography variant="body2">
                    {row.active_tasks_count}/{row.total_tasks_count ?? '?'}
                  </Typography>
                ),
              },
              {
                key: 'docs',
                header: 'Документы',
                align: 'center',
                render: (row) => (
                  <Typography variant="body2">{row.documents_count ?? 0}</Typography>
                ),
              },
            ]}
            rows={projects}
            getRowKey={(row) => row.id}
            loading={projectsLoading}
            emptyState={
              <EmptyState
                title="Нет проектов"
                description="Создайте первый проект для этого контрагента."
              />
            }
          />
        </TabPanel>

        {/* Tab: Задачи */}
        <TabPanel value={tab} index={2}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => { setTaskFormOpen(true); setNewTaskTitle(''); setNewTaskDeadline(''); setNewTaskPriority('medium'); }}
            >
              Создать задачу
            </Button>
          </Box>

          {taskFormOpen && (
            <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
              <Stack spacing={2}>
                <TextField
                  label="Название задачи"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  fullWidth
                  autoFocus
                  size="small"
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <FormControl size="small" sx={{ minWidth: 160 }}>
                    <InputLabel>Приоритет</InputLabel>
                    <Select
                      label="Приоритет"
                      value={newTaskPriority}
                      onChange={(e) => setNewTaskPriority(e.target.value as typeof newTaskPriority)}
                    >
                      <MenuItem value="low">Низкий</MenuItem>
                      <MenuItem value="medium">Средний</MenuItem>
                      <MenuItem value="high">Высокий</MenuItem>
                      <MenuItem value="critical">Критический</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    size="small"
                    label="Срок"
                    type="date"
                    value={newTaskDeadline}
                    onChange={(e) => setNewTaskDeadline(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    disabled={!newTaskTitle.trim() || savingTask}
                    onClick={() => void handleCreateTask()}
                  >
                    {savingTask ? 'Создаём...' : 'Создать'}
                  </Button>
                  <Button onClick={() => setTaskFormOpen(false)}>Отмена</Button>
                </Stack>
              </Stack>
            </Paper>
          )}

          {tasksLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : tasks.length === 0 ? (
            <EmptyState title="Нет задач" description="Создайте первую задачу для этого контакта." />
          ) : (
            <Stack spacing={1}>
              {tasks.map((t) => {
                const priorityColors: Record<string, string> = { low: 'default', medium: 'primary', high: 'warning', critical: 'error' };
                const statusLabel: Record<string, string> = { new: 'Новая', in_progress: 'В работе', waiting: 'Ожидание', completed: 'Выполнена', cancelled: 'Отменена' };
                return (
                  <Paper key={t.id} variant="outlined" sx={{ p: 2, opacity: ['completed', 'cancelled'].includes(t.status) ? 0.6 : 1 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between">
                      <Box>
                        <Typography
                          fontWeight={500}
                          sx={{ textDecoration: ['completed', 'cancelled'].includes(t.status) ? 'line-through' : 'none' }}
                        >
                          {t.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {statusLabel[t.status] || t.status}
                          {t.deadline_at ? ` · до ${new Date(t.deadline_at).toLocaleDateString('ru-RU')}` : ''}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        label={{ low: 'Низкий', medium: 'Средний', high: 'Высокий', critical: 'Критический' }[t.priority] || t.priority}
                        color={(priorityColors[t.priority] || 'default') as any}
                      />
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </TabPanel>

        {/* Tab: История */}
        <TabPanel value={tab} index={3}>
          {historyLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : history.length === 0 ? (
            <EmptyState title="История пуста" description="События ещё не зафиксированы." />
          ) : (
            <Stack spacing={1}>
              {history.map((entry) => (
                <Paper key={entry.id} variant="outlined" sx={{ p: 2 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between">
                    <Stack spacing={0.5}>
                      <Typography fontWeight={600}>{entry.action_type}</Typography>
                      {entry.author_id ? (
                        <Typography variant="body2" color="text.secondary">
                          Пользователь #{entry.author_id}
                        </Typography>
                      ) : null}
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                      {formatDate(entry.created_at)}
                    </Typography>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </TabPanel>
      </Box>

      {/* Edit dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Редактировать контрагента</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="ФИО / Название"
              value={editForm.full_name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, full_name: e.target.value }))}
              fullWidth
              required
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Телефон"
                value={editForm.phone}
                onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Email"
                value={editForm.email}
                onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Компания"
                value={editForm.company}
                onChange={(e) => setEditForm((prev) => ({ ...prev, company: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Должность"
                value={editForm.position}
                onChange={(e) => setEditForm((prev) => ({ ...prev, position: e.target.value }))}
                fullWidth
              />
            </Stack>
            <TextField
              label="Комментарий"
              value={editForm.comment}
              onChange={(e) => setEditForm((prev) => ({ ...prev, comment: e.target.value }))}
              fullWidth
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleSaveEdit()} disabled={saving}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      {/* Archive confirm */}
      <ConfirmDialog
        open={archiveOpen}
        title={counterparty.is_archived ? 'Разархивировать контрагента?' : 'Архивировать контрагента?'}
        description={
          counterparty.is_archived
            ? 'Контрагент снова появится в активном списке.'
            : 'Контрагент будет скрыт из активного списка, но его карточка и задачи сохранятся.'
        }
        confirmLabel={counterparty.is_archived ? 'Разархивировать' : 'Архивировать'}
        onClose={() => setArchiveOpen(false)}
        onConfirm={handleArchive}
      />

      {/* Create project dialog */}
      <Dialog open={projectDialogOpen} onClose={() => setProjectDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Создать проект</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Название"
              value={projectForm.name}
              onChange={(e) => setProjectForm((prev) => ({ ...prev, name: e.target.value }))}
              fullWidth
              required
            />
            <FormControl fullWidth>
              <InputLabel>Статус</InputLabel>
              <Select
                label="Статус"
                value={projectForm.status}
                onChange={(e) =>
                  setProjectForm((prev) => ({
                    ...prev,
                    status: e.target.value as OwnerWorkspaceProjectStatus,
                  }))
                }
              >
                {Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => (
                  <MenuItem key={key} value={key}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Ответственный (ID)"
              value={projectForm.owner_id}
              onChange={(e) => setProjectForm((prev) => ({ ...prev, owner_id: e.target.value }))}
              fullWidth
              type="number"
            />
            <TextField
              label="Дедлайн"
              value={projectForm.deadline_at}
              onChange={(e) => setProjectForm((prev) => ({ ...prev, deadline_at: e.target.value }))}
              fullWidth
              type="date"
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Описание"
              value={projectForm.description}
              onChange={(e) => setProjectForm((prev) => ({ ...prev, description: e.target.value }))}
              fullWidth
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProjectDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleCreateProject()} disabled={projectSaving}>
            Создать
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default CounterpartyDetailPage;
