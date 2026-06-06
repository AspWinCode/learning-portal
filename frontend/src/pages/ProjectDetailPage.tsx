import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  IconButton,
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
  Add as AddIcon,
  Archive as ArchiveIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  InsertDriveFile as FileIcon,
  NavigateNext as NavigateNextIcon,
  UploadFile as UploadFileIcon,
} from '@mui/icons-material';

import Layout from '../components/Layout';
import { ConfirmDialog, DataTable, EmptyState } from '../components/ui';
import { OwnerWorkspaceTaskCreateDialog, type TaskCreatePayload } from '../components/ownerWorkspace/OwnerWorkspaceTaskCreateDialog';
import { ownerWorkspaceApi, usersApi } from '../services/api';
import type {
  OwnerWorkspaceAuditLog,
  OwnerWorkspaceContact,
  OwnerWorkspaceProject,
  OwnerWorkspaceProjectDocument,
  OwnerWorkspaceProjectStatus,
  OwnerWorkspaceTask,
  User,
} from '../types';
import { extractApiError } from '../utils/extractApiError';

// ─── Status / priority configs ───────────────────────────────────────────────

type ChipColor = 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';

const PROJECT_STATUS_LABELS: Record<string, string> = {
  new: 'Новый',
  in_progress: 'В работе',
  on_review: 'На согласовании',
  completed: 'Завершён',
  archived: 'Архив',
  active: 'Активный',
};

const PROJECT_STATUS_COLORS: Record<string, ChipColor> = {
  new: 'default',
  in_progress: 'primary',
  on_review: 'warning',
  completed: 'success',
  archived: 'default',
  active: 'info',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  waiting: 'Ожидание',
  on_review: 'На проверке',
  completed: 'Завершена',
  cancelled: 'Отменена',
};

const TASK_STATUS_COLORS: Record<string, ChipColor> = {
  new: 'default',
  in_progress: 'primary',
  waiting: 'warning',
  on_review: 'info',
  completed: 'success',
  cancelled: 'error',
};

const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критический',
};

const TASK_PRIORITY_COLORS: Record<string, ChipColor> = {
  low: 'default',
  medium: 'info',
  high: 'warning',
  critical: 'error',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function dateInputToDateTime(value: string): string | null {
  return value ? `${value}T00:00:00` : null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1048576).toFixed(1)} МБ`;
}

// ─── Tab panel ────────────────────────────────────────────────────────────────

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

// ─── Form types ───────────────────────────────────────────────────────────────

type ProjectEditForm = {
  name: string;
  status: OwnerWorkspaceProjectStatus;
  description: string;
  owner_id: string;
  start_at: string;
  deadline_at: string;
};

type TaskForm = {
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee_id: string;
  deadline_at: string;
};

const emptyTaskForm = (): TaskForm => ({
  title: '',
  description: '',
  status: 'new',
  priority: 'medium',
  assignee_id: '',
  deadline_at: '',
});

type SubprojectForm = {
  name: string;
  status: OwnerWorkspaceProjectStatus;
  owner_id: string;
  start_at: string;
  deadline_at: string;
  description: string;
};

const emptySubprojectForm = (): SubprojectForm => ({
  name: '',
  status: 'new',
  owner_id: '',
  start_at: '',
  deadline_at: '',
  description: '',
});

// ─── Component ────────────────────────────────────────────────────────────────

const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = Number(id);

  // Main data
  const [project, setProject] = useState<OwnerWorkspaceProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [tab, setTab] = useState(0);

  // Tasks
  const [tasks, setTasks] = useState<OwnerWorkspaceTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksTotal, setTasksTotal] = useState(0);

  // Documents
  const [documents, setDocuments] = useState<OwnerWorkspaceProjectDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteDocTarget, setDeleteDocTarget] = useState<OwnerWorkspaceProjectDocument | null>(null);

  // Contacts
  const [contacts, setContacts] = useState<OwnerWorkspaceContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [addContactDialogOpen, setAddContactDialogOpen] = useState(false);
  const [allContacts, setAllContacts] = useState<OwnerWorkspaceContact[]>([]);
  const [contactSearch, setContactSearch] = useState('');

  // Subprojects
  const [subprojects, setSubprojects] = useState<OwnerWorkspaceProject[]>([]);
  const [subprojectsLoading, setSubprojectsLoading] = useState(false);

  // History
  const [history, setHistory] = useState<OwnerWorkspaceAuditLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Edit project dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<ProjectEditForm>({
    name: '',
    status: 'new',
    description: '',
    owner_id: '',
    start_at: '',
    deadline_at: '',
  });
  const [saving, setSaving] = useState(false);

  // Archive confirm
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Task dialog (new)
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTaskForm());
  const [taskSaving, setTaskSaving] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  // Subproject dialog
  const [subprojectDialogOpen, setSubprojectDialogOpen] = useState(false);
  const [subprojectForm, setSubprojectForm] = useState<SubprojectForm>(emptySubprojectForm());
  const [subprojectSaving, setSubprojectSaving] = useState(false);

  // ─── Load project ─────────────────────────────────────────────────────────

  const loadProject = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await ownerWorkspaceApi.getProject(projectId);
      setProject(data);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить проект.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadProject();
    // Load users for assignee picker
    usersApi.getAll().then(setUsers).catch(() => {});
  }, [loadProject]);

  // ─── Load tasks ───────────────────────────────────────────────────────────

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const page = await ownerWorkspaceApi.listTasks({ project_id: projectId, limit: 100 });
      setTasks(page.items);
      setTasksTotal(page.total);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить задачи.'));
    } finally {
      setTasksLoading(false);
    }
  }, [projectId]);

  // ─── Load documents ───────────────────────────────────────────────────────

  const loadDocuments = useCallback(async () => {
    setDocsLoading(true);
    try {
      const data = await ownerWorkspaceApi.listProjectDocuments(projectId);
      setDocuments(data);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить документы.'));
    } finally {
      setDocsLoading(false);
    }
  }, [projectId]);

  // ─── Load contacts ────────────────────────────────────────────────────────

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const data = await ownerWorkspaceApi.listContacts({ project_id: projectId });
      setContacts(data);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить контакты.'));
    } finally {
      setContactsLoading(false);
    }
  }, [projectId]);

  // ─── Load subprojects ─────────────────────────────────────────────────────

  const loadSubprojects = useCallback(async () => {
    setSubprojectsLoading(true);
    try {
      const data = await ownerWorkspaceApi.listProjects({ parent_project_id: projectId });
      setSubprojects(data);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить подпроекты.'));
    } finally {
      setSubprojectsLoading(false);
    }
  }, [projectId]);

  // ─── Load history ─────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await ownerWorkspaceApi.listHistory({
        entity_type: 'project',
        entity_id: projectId,
        sort_order: 'desc',
      });
      setHistory(data);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить историю.'));
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId]);

  // Lazy tab loading
  useEffect(() => {
    if (tab === 1) void loadTasks();
    if (tab === 2) void loadDocuments();
    if (tab === 3) void loadContacts();
    if (tab === 4) void loadSubprojects();
    if (tab === 5) void loadHistory();
  }, [tab, loadTasks, loadDocuments, loadContacts, loadSubprojects, loadHistory]);

  // ─── Edit project ─────────────────────────────────────────────────────────

  const openEditDialog = () => {
    if (!project) return;
    setEditForm({
      name: project.name || '',
      status: project.status,
      description: project.description || '',
      owner_id: project.owner_id != null ? String(project.owner_id) : '',
      start_at: project.start_at ? project.start_at.slice(0, 10) : '',
      deadline_at: project.deadline_at ? project.deadline_at.slice(0, 10) : '',
    });
    setError('');
    setSuccess('');
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm.name.trim()) {
      setError('Укажите название проекта.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await ownerWorkspaceApi.updateProject(projectId, {
        name: editForm.name.trim(),
        status: editForm.status,
        description: editForm.description.trim() || null,
        owner_id: editForm.owner_id ? Number(editForm.owner_id) : null,
        start_at: dateInputToDateTime(editForm.start_at),
        deadline_at: dateInputToDateTime(editForm.deadline_at),
      });
      setSuccess('Проект обновлён.');
      setEditOpen(false);
      await loadProject();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось сохранить проект.'));
    } finally {
      setSaving(false);
    }
  };

  // ─── Archive ──────────────────────────────────────────────────────────────

  const handleArchive = async () => {
    try {
      await ownerWorkspaceApi.archiveProject(projectId);
      setSuccess('Проект архивирован.');
      setArchiveOpen(false);
      await loadProject();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось архивировать проект.'));
    }
  };

  // ─── Create task ──────────────────────────────────────────────────────────

  const handleCreateTask = async (payload: TaskCreatePayload) => {
    await ownerWorkspaceApi.createTask({
      title: payload.title,
      description: payload.description || null,
      status: payload.status as 'new' | 'in_progress' | 'waiting' | 'completed' | 'cancelled',
      priority: payload.priority as 'low' | 'medium' | 'high' | 'critical',
      start_at: payload.start_at ?? null,
      assignee_id: payload.assignee_id ?? null,
      deadline_at: payload.deadline_at ?? null,
      tags: payload.tags,
      checklist: payload.checklist,
      project_id: projectId,
      watcher_ids: payload.watcher_ids,
      reminder_at: payload.reminder_at ?? null,
      ...(payload.repeat ? { repeat: payload.repeat } : {}),
    });
    setSuccess('Задача создана.');
    await loadTasks();
  };

  // ─── Documents ────────────────────────────────────────────────────────────

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      await ownerWorkspaceApi.uploadProjectDocument(projectId, file);
      setSuccess('Документ загружен.');
      await loadDocuments();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить документ.'));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!deleteDocTarget) return;
    try {
      await ownerWorkspaceApi.deleteProjectDocument(projectId, deleteDocTarget.id);
      setSuccess('Документ удалён.');
      setDeleteDocTarget(null);
      await loadDocuments();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось удалить документ.'));
    }
  };

  // ─── Contacts ─────────────────────────────────────────────────────────────

  const openAddContactDialog = async () => {
    setContactSearch('');
    try {
      const data = await ownerWorkspaceApi.listContacts({});
      setAllContacts(data);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить контакты.'));
    }
    setAddContactDialogOpen(true);
  };

  const handleAddContact = async (contact: OwnerWorkspaceContact) => {
    try {
      await ownerWorkspaceApi.addProjectContact(projectId, contact.id);
      setSuccess(`Контакт «${contact.full_name}» добавлен.`);
      setAddContactDialogOpen(false);
      await loadContacts();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось добавить контакт.'));
    }
  };

  // ─── Subprojects ──────────────────────────────────────────────────────────

  const handleCreateSubproject = async () => {
    if (!subprojectForm.name.trim()) {
      setError('Укажите название подпроекта.');
      return;
    }
    setSubprojectSaving(true);
    setError('');
    try {
      const created = await ownerWorkspaceApi.createProject({
        name: subprojectForm.name.trim(),
        status: subprojectForm.status as string,
        owner_id: subprojectForm.owner_id ? Number(subprojectForm.owner_id) : null,
        start_at: dateInputToDateTime(subprojectForm.start_at),
        deadline_at: dateInputToDateTime(subprojectForm.deadline_at),
        description: subprojectForm.description.trim() || null,
        parent_project_id: projectId,
        counterparty_id: project?.counterparty_id ?? null,
      });
      setSubprojectDialogOpen(false);
      await loadSubprojects();
      setSuccess('Подпроект создан.');
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось создать подпроект.'));
    } finally {
      setSubprojectSaving(false);
    }
  };

  // ─── Filtered contacts for search ─────────────────────────────────────────

  const filteredAllContacts = allContacts.filter((c) => {
    const q = contactSearch.toLowerCase();
    return (
      !q ||
      c.full_name.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q)
    );
  });

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

  if (!project) {
    return (
      <Layout>
        <Box sx={{ p: 3 }}>
          <Alert severity="error">{error || 'Проект не найден.'}</Alert>
        </Box>
      </Layout>
    );
  }

  const isArchived = project.status === 'archived';

  return (
    <Layout>
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Breadcrumbs */}
        <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
          <Link
            component="button"
            underline="hover"
            color="inherit"
            onClick={() => navigate('/owner-workspace/projects')}
          >
            Проекты
          </Link>
          {project.counterparty_id ? (
            <Link
              component="button"
              underline="hover"
              color="inherit"
              onClick={() =>
                navigate(`/owner-workspace/counterparties/${project.counterparty_id}`)
              }
            >
              {project.counterparty_name ?? `Контрагент #${project.counterparty_id}`}
            </Link>
          ) : null}
          {project.parent_project_id ? (
            <Link
              component="button"
              underline="hover"
              color="inherit"
              onClick={() =>
                navigate(`/owner-workspace/projects/${project.parent_project_id}`)
              }
            >
              {project.parent_project_name ?? `Проект #${project.parent_project_id}`}
            </Link>
          ) : null}
          <Typography color="text.primary">{project.name}</Typography>
        </Breadcrumbs>

        {error ? <Alert severity="error">{error}</Alert> : null}
        {success ? <Alert severity="success">{success}</Alert> : null}

        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="h4">{project.name}</Typography>
              <Chip
                size="small"
                label={PROJECT_STATUS_LABELS[project.status] ?? project.status}
                color={PROJECT_STATUS_COLORS[project.status] ?? 'default'}
              />
              {project.parent_project_id ? (
                <Chip size="small" label="Подпроект" variant="outlined" />
              ) : null}
            </Stack>
            {project.owner_name ? (
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                Ответственный: {project.owner_name}
              </Typography>
            ) : null}
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<EditIcon />} onClick={openEditDialog}>
              Редактировать
            </Button>
            {!isArchived ? (
              <Button
                variant="outlined"
                color="warning"
                startIcon={<ArchiveIcon />}
                onClick={() => setArchiveOpen(true)}
              >
                Архивировать
              </Button>
            ) : null}
          </Stack>
        </Box>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tab} onChange={(_, v: number) => setTab(v)} variant="scrollable" scrollButtons="auto">
            <Tab label="Основное" />
            <Tab label="Задачи" />
            <Tab label="Документы" />
            <Tab label="Контакты" />
            <Tab label="Подпроекты" />
            <Tab label="История" />
          </Tabs>
        </Box>

        {/* Tab: Основное */}
        <TabPanel value={tab} index={0}>
          <Paper variant="outlined" sx={{ p: 3 }}>
            <Stack spacing={2} divider={<Divider />}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Typography fontWeight={600} sx={{ minWidth: 200 }}>
                  Название
                </Typography>
                <Typography>{project.name}</Typography>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Typography fontWeight={600} sx={{ minWidth: 200 }}>
                  Статус
                </Typography>
                <Chip
                  size="small"
                  label={PROJECT_STATUS_LABELS[project.status] ?? project.status}
                  color={PROJECT_STATUS_COLORS[project.status] ?? 'default'}
                />
              </Stack>
              {project.description ? (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Typography fontWeight={600} sx={{ minWidth: 200 }}>
                    Описание
                  </Typography>
                  <Typography sx={{ whiteSpace: 'pre-wrap' }}>{project.description}</Typography>
                </Stack>
              ) : null}
              {project.counterparty_id ? (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Typography fontWeight={600} sx={{ minWidth: 200 }}>
                    Контрагент
                  </Typography>
                  <Link
                    component="button"
                    underline="hover"
                    onClick={() =>
                      navigate(`/owner-workspace/counterparties/${project.counterparty_id}`)
                    }
                  >
                    {project.counterparty_name ?? `#${project.counterparty_id}`}
                  </Link>
                </Stack>
              ) : null}
              {project.parent_project_id ? (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Typography fontWeight={600} sx={{ minWidth: 200 }}>
                    Родительский проект
                  </Typography>
                  <Link
                    component="button"
                    underline="hover"
                    onClick={() =>
                      navigate(`/owner-workspace/projects/${project.parent_project_id}`)
                    }
                  >
                    {project.parent_project_name ?? `#${project.parent_project_id}`}
                  </Link>
                </Stack>
              ) : null}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Typography fontWeight={600} sx={{ minWidth: 200 }}>
                  Ответственный
                </Typography>
                <Typography>{project.owner_name || '—'}</Typography>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Typography fontWeight={600} sx={{ minWidth: 200 }}>
                  Начало проекта
                </Typography>
                <Typography>{formatDate(project.start_at)}</Typography>
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Typography fontWeight={600} sx={{ minWidth: 200 }}>
                  Дедлайн
                </Typography>
                <Typography>{formatDate(project.deadline_at)}</Typography>
              </Stack>
            </Stack>
          </Paper>
        </TabPanel>

        {/* Tab: Задачи */}
        <TabPanel value={tab} index={1}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Всего: {tasksTotal}
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setTaskForm(emptyTaskForm());
                setTaskDialogOpen(true);
              }}
            >
              Создать задачу
            </Button>
          </Box>
          <DataTable
            columns={[
              {
                key: 'title',
                header: 'Название',
                render: (row) => <Typography fontWeight={500}>{row.title}</Typography>,
              },
              {
                key: 'status',
                header: 'Статус',
                render: (row) => (
                  <Chip
                    size="small"
                    label={TASK_STATUS_LABELS[row.status] ?? row.status}
                    color={TASK_STATUS_COLORS[row.status] ?? 'default'}
                  />
                ),
              },
              {
                key: 'priority',
                header: 'Приоритет',
                render: (row) => (
                  <Chip
                    size="small"
                    label={TASK_PRIORITY_LABELS[row.priority] ?? row.priority}
                    color={TASK_PRIORITY_COLORS[row.priority] ?? 'default'}
                    variant="outlined"
                  />
                ),
              },
              {
                key: 'assignee',
                header: 'Исполнитель',
                render: (row) => (
                  <Typography variant="body2">
                    {row.assignee_id ? `#${row.assignee_id}` : '—'}
                  </Typography>
                ),
              },
              {
                key: 'deadline',
                header: 'Дедлайн',
                render: (row) => (
                  <Typography variant="body2">{formatDate(row.deadline_at)}</Typography>
                ),
              },
            ]}
            rows={tasks}
            getRowKey={(row) => row.id}
            onRowClick={(row) => navigate(`/owner-workspace/tasks/${row.id}`)}
            loading={tasksLoading}
            emptyState={
              <EmptyState title="Нет задач" description="Создайте первую задачу для проекта." />
            }
          />
        </TabPanel>

        {/* Tab: Документы */}
        <TabPanel value={tab} index={2}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<UploadFileIcon />}
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? 'Загрузка...' : 'Загрузить файл'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileUpload(file);
                e.target.value = '';
              }}
            />
          </Box>
          {docsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : documents.length === 0 ? (
            <EmptyState title="Нет документов" description="Загрузите первый документ." />
          ) : (
            <Stack spacing={1}>
              {documents.map((doc) => (
                <Paper key={doc.id} variant="outlined" sx={{ p: 2 }}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={2}
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    justifyContent="space-between"
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <FileIcon color="action" />
                      <Box>
                        <Typography fontWeight={500}>{doc.filename}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatFileSize(doc.size_bytes)} · {formatDate(doc.created_at)}
                          {doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}` : ''}
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <IconButton
                        size="small"
                        onClick={() =>
                          window.open(
                            ownerWorkspaceApi.downloadProjectDocumentUrl(projectId, doc.id),
                            '_blank'
                          )
                        }
                      >
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setDeleteDocTarget(doc)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </TabPanel>

        {/* Tab: Контакты */}
        <TabPanel value={tab} index={3}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => void openAddContactDialog()}
            >
              Добавить контакт
            </Button>
          </Box>
          <DataTable
            columns={[
              {
                key: 'name',
                header: 'ФИО',
                render: (row) => <Typography fontWeight={500}>{row.full_name}</Typography>,
              },
              {
                key: 'company',
                header: 'Компания',
                render: (row) => (
                  <Typography variant="body2">{row.company || '—'}</Typography>
                ),
              },
              {
                key: 'position',
                header: 'Должность',
                render: (row) => (
                  <Typography variant="body2">{row.position || '—'}</Typography>
                ),
              },
              {
                key: 'phone',
                header: 'Телефон',
                render: (row) => (
                  <Typography variant="body2">{row.phone || '—'}</Typography>
                ),
              },
              {
                key: 'email',
                header: 'Email',
                render: (row) => (
                  <Typography variant="body2">{row.email || '—'}</Typography>
                ),
              },
            ]}
            rows={contacts}
            getRowKey={(row) => row.id}
            loading={contactsLoading}
            emptyState={
              <EmptyState
                title="Нет контактов"
                description="Добавьте контакты к проекту."
              />
            }
          />
        </TabPanel>

        {/* Tab: Подпроекты */}
        <TabPanel value={tab} index={4}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setSubprojectForm(emptySubprojectForm());
                setSubprojectDialogOpen(true);
              }}
            >
              Создать подпроект
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
                key: 'owner',
                header: 'Ответственный',
                render: (row) => (
                  <Typography variant="body2">{row.owner_name || '—'}</Typography>
                ),
              },
              {
                key: 'start',
                header: 'Начало',
                render: (row) => (
                  <Typography variant="body2">{formatDate(row.start_at)}</Typography>
                ),
              },
              {
                key: 'deadline',
                header: 'Дедлайн',
                render: (row) => (
                  <Typography variant="body2">{formatDate(row.deadline_at)}</Typography>
                ),
              },
            ]}
            rows={subprojects}
            getRowKey={(row) => row.id}
            loading={subprojectsLoading}
            emptyState={
              <EmptyState title="Нет подпроектов" description="Создайте первый подпроект." />
            }
          />
        </TabPanel>

        {/* Tab: История */}
        <TabPanel value={tab} index={5}>
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
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={2}
                    justifyContent="space-between"
                  >
                    <Stack spacing={0.5}>
                      <Typography fontWeight={600}>{entry.action_type}</Typography>
                      {entry.author_id ? (
                        <Typography variant="body2" color="text.secondary">
                          Пользователь #{entry.author_id}
                        </Typography>
                      ) : null}
                    </Stack>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ whiteSpace: 'nowrap' }}
                    >
                      {formatDate(entry.created_at)}
                    </Typography>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </TabPanel>
      </Box>

      {/* Edit project dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Редактировать проект</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Название"
              value={editForm.name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
              fullWidth
              required
            />
            <FormControl fullWidth>
              <InputLabel>Статус</InputLabel>
              <Select
                label="Статус"
                value={editForm.status}
                onChange={(e) =>
                  setEditForm((prev) => ({
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
              value={editForm.owner_id}
              onChange={(e) => setEditForm((prev) => ({ ...prev, owner_id: e.target.value }))}
              fullWidth
              type="number"
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Начало проекта"
                value={editForm.start_at}
                onChange={(e) => setEditForm((prev) => ({ ...prev, start_at: e.target.value }))}
                fullWidth
                type="date"
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Дедлайн"
                value={editForm.deadline_at}
                onChange={(e) => setEditForm((prev) => ({ ...prev, deadline_at: e.target.value }))}
                fullWidth
                type="date"
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
            <TextField
              label="Описание"
              value={editForm.description}
              onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
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
        title="Архивировать проект?"
        description="Проект и его задачи будут скрыты из активного списка."
        confirmLabel="Архивировать"
        onClose={() => setArchiveOpen(false)}
        onConfirm={handleArchive}
      />

      {/* Create task dialog */}
      {/* New task creation dialog */}
      <OwnerWorkspaceTaskCreateDialog
        open={taskDialogOpen}
        onClose={() => setTaskDialogOpen(false)}
        onSubmit={handleCreateTask}
        projectName={project?.name}
        users={users}
      />

      {/* Delete document confirm */}
      <ConfirmDialog
        open={Boolean(deleteDocTarget)}
        title="Удалить документ?"
        description={`Файл «${deleteDocTarget?.filename ?? ''}» будет удалён безвозвратно.`}
        confirmLabel="Удалить"
        onClose={() => setDeleteDocTarget(null)}
        onConfirm={handleDeleteDocument}
      />

      {/* Add contact dialog */}
      <Dialog
        open={addContactDialogOpen}
        onClose={() => setAddContactDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Добавить контакт</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Поиск контакта"
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              fullWidth
              autoFocus
            />
            <Stack spacing={1} sx={{ maxHeight: 320, overflowY: 'auto' }}>
              {filteredAllContacts.length === 0 ? (
                <Typography color="text.secondary" variant="body2">
                  Контакты не найдены.
                </Typography>
              ) : (
                filteredAllContacts.map((contact) => (
                  <Paper
                    key={contact.id}
                    variant="outlined"
                    sx={{ p: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                    onClick={() => void handleAddContact(contact)}
                  >
                    <Typography fontWeight={500}>{contact.full_name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {[contact.company, contact.phone, contact.email].filter(Boolean).join(' · ')}
                    </Typography>
                  </Paper>
                ))
              )}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddContactDialogOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      {/* Create subproject dialog */}
      <Dialog
        open={subprojectDialogOpen}
        onClose={() => setSubprojectDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Создать подпроект</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Название"
              value={subprojectForm.name}
              onChange={(e) =>
                setSubprojectForm((prev) => ({ ...prev, name: e.target.value }))
              }
              fullWidth
              required
            />
            <FormControl fullWidth>
              <InputLabel>Статус</InputLabel>
              <Select
                label="Статус"
                value={subprojectForm.status}
                onChange={(e) =>
                  setSubprojectForm((prev) => ({
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
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Ответственный (ID)"
                value={subprojectForm.owner_id}
                onChange={(e) =>
                  setSubprojectForm((prev) => ({ ...prev, owner_id: e.target.value }))
                }
                fullWidth
                type="number"
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Начало проекта"
                value={subprojectForm.start_at}
                onChange={(e) =>
                  setSubprojectForm((prev) => ({ ...prev, start_at: e.target.value }))
                }
                fullWidth
                type="date"
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Дедлайн"
                value={subprojectForm.deadline_at}
                onChange={(e) =>
                  setSubprojectForm((prev) => ({ ...prev, deadline_at: e.target.value }))
                }
                fullWidth
                type="date"
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
            <TextField
              label="Описание"
              value={subprojectForm.description}
              onChange={(e) =>
                setSubprojectForm((prev) => ({ ...prev, description: e.target.value }))
              }
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubprojectDialogOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={() => void handleCreateSubproject()}
            disabled={subprojectSaving}
          >
            Создать
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default ProjectDetailPage;
