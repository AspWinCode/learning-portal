import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Avatar,
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
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Archive as ArchiveIcon,
  Edit as EditIcon,
  NavigateNext as NavigateNextIcon,
  Add as AddIcon,
  LinkOff as LinkOffIcon,
  PersonAdd as PersonAddIcon,
} from '@mui/icons-material';

import Layout from '../components/Layout';
import { ConfirmDialog, DataTable, EmptyState } from '../components/ui';
import { OwnerWorkspaceTaskCreateDialog, type TaskCreatePayload } from '../components/ownerWorkspace/OwnerWorkspaceTaskCreateDialog';
import { ownerWorkspaceApi, settingsApi, usersApi } from '../services/api';
import type {
  OwnerWorkspaceAuditLog,
  OwnerWorkspaceContact,
  OwnerWorkspaceCounterparty,
  OwnerWorkspaceProject,
  OwnerWorkspaceProjectStatus,
  OwnerWorkspaceTask,
  User,
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

function dateInputToDateTime(value: string): string | null {
  return value ? `${value}T00:00:00` : null;
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

const COUNTERPARTY_ROLE_OPTIONS = [
  { value: 'client',   label: 'Клиент' },
  { value: 'lead',     label: 'Лид' },
  { value: 'partner',  label: 'Партнёр' },
  { value: 'supplier', label: 'Поставщик' },
];
const COUNTERPARTY_ROLE_LABELS: Record<string, string> = Object.fromEntries(
  COUNTERPARTY_ROLE_OPTIONS.map((o) => [o.value, o.label])
);

type CounterpartyFormState = {
  full_name: string;
  phone: string;
  email: string;
  company: string;
  position: string;
  comment: string;
  type: string;
  counterparty_role: string;
  inn: string;
  kpp: string;
  ogrn: string;
  legal_address: string;
  actual_address: string;
  website: string;
  industry: string;
  bank_account: string;
  bank_corr_account: string;
  bank_bik: string;
  bank_name: string;
  bank_currency: string;
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
  const [roleOptions, setRoleOptions] = useState<string[]>([]);
  const [industryOptions, setIndustryOptions] = useState<string[]>([]);

  useEffect(() => {
    void settingsApi.getOwnerWorkspaceCounterpartyRoles().then((d) => setRoleOptions(d.items)).catch(() => {});
    void settingsApi.getOwnerWorkspaceCounterpartyIndustries().then((d) => setIndustryOptions(d.items)).catch(() => {});
  }, []);

  const [success, setSuccess] = useState('');

  const [tab, setTab] = useState(0);

  // Projects tab
  const [projects, setProjects] = useState<OwnerWorkspaceProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  // History tab
  const [history, setHistory] = useState<OwnerWorkspaceAuditLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Contacts tab
  const [contacts, setContacts] = useState<OwnerWorkspaceContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [allContacts, setAllContacts] = useState<OwnerWorkspaceContact[]>([]);
  const [contactToLink, setContactToLink] = useState<OwnerWorkspaceContact | null>(null);
  const [linkingContact, setLinkingContact] = useState(false);

  // Tasks tab
  const [tasks, setTasks] = useState<OwnerWorkspaceTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskCreateDialogOpen, setTaskCreateDialogOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<CounterpartyFormState>({
    full_name: '',
    phone: '',
    email: '',
    company: '',
    position: '',
    comment: '',
    type: 'company',
    counterparty_role: '',
    inn: '',
    kpp: '',
    ogrn: '',
    legal_address: '',
    actual_address: '',
    website: '',
    industry: '',
    bank_account: '',
    bank_corr_account: '',
    bank_bik: '',
    bank_name: '',
    bank_currency: '',
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
    usersApi.getAll().then(setUsers).catch(() => {});
  }, [loadCounterparty]);

  // ─── Load contacts ────────────────────────────────────────────────────────

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const data = await ownerWorkspaceApi.listCounterpartyContacts(counterpartyId);
      setContacts(data);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить контакты.'));
    } finally {
      setContactsLoading(false);
    }
  }, [counterpartyId]);

  const loadAllContacts = useCallback(async () => {
    try {
      const data = await ownerWorkspaceApi.listContacts({});
      setAllContacts(data);
    } catch {
      setAllContacts([]);
    }
  }, []);

  const handleLinkContact = async () => {
    if (!contactToLink) return;
    setLinkingContact(true);
    try {
      await ownerWorkspaceApi.linkContactToCounterparty(counterpartyId, contactToLink.id);
      setContactToLink(null);
      await loadContacts();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось привязать контакт.'));
    } finally {
      setLinkingContact(false);
    }
  };

  const handleUnlinkContact = async (contactId: number) => {
    try {
      await ownerWorkspaceApi.unlinkContactFromCounterparty(counterpartyId, contactId);
      await loadContacts();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось отвязать контакт.'));
    }
  };

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

  const handleCreateTask = async (payload: TaskCreatePayload) => {
    await ownerWorkspaceApi.createTask({
      title: payload.title,
      description: payload.description || null,
      status: payload.status as 'new' | 'in_progress' | 'waiting' | 'completed' | 'cancelled',
      priority: payload.priority as 'low' | 'medium' | 'high' | 'critical',
      start_at: payload.start_at ?? null,
      deadline_at: payload.deadline_at ?? null,
      assignee_id: payload.assignee_id ?? null,
      watcher_ids: payload.watcher_ids,
      tags: payload.tags,
      checklist: payload.checklist,
      effort_hours: payload.effort_hours ?? null,
      effort_minutes: payload.effort_minutes ?? null,
      reminder_at: payload.reminder_at ?? null,
      repeat: payload.repeat ?? null,
      contact_id: counterpartyId,
    });
    await loadTasks();
  };

  // Load tab data lazily
  useEffect(() => {
    if (tab === 1) void loadProjects();
    if (tab === 2) void loadTasks();
    if (tab === 3) { void loadContacts(); void loadAllContacts(); }
    if (tab === 4) void loadHistory();
  }, [tab, loadProjects, loadTasks, loadContacts, loadAllContacts, loadHistory]);

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
      type: counterparty.type || 'company',
      counterparty_role: counterparty.counterparty_role || '',
      inn: counterparty.inn || '',
      kpp: counterparty.kpp || '',
      ogrn: counterparty.ogrn || '',
      legal_address: counterparty.legal_address || '',
      actual_address: counterparty.actual_address || '',
      website: counterparty.website || '',
      industry: counterparty.industry || '',
      bank_account: counterparty.bank_account || '',
      bank_corr_account: counterparty.bank_corr_account || '',
      bank_bik: counterparty.bank_bik || '',
      bank_name: counterparty.bank_name || '',
      bank_currency: counterparty.bank_currency || '',
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
        counterparty_role: editForm.counterparty_role.trim() || null,
        inn: editForm.inn.trim() || null,
        kpp: editForm.kpp.trim() || null,
        ogrn: editForm.ogrn.trim() || null,
        legal_address: editForm.legal_address.trim() || null,
        actual_address: editForm.actual_address.trim() || null,
        website: editForm.website.trim() || null,
        industry: editForm.industry.trim() || null,
        bank_account: editForm.bank_account.trim() || null,
        bank_corr_account: editForm.bank_corr_account.trim() || null,
        bank_bik: editForm.bank_bik.trim() || null,
        bank_name: editForm.bank_name.trim() || null,
        bank_currency: editForm.bank_currency.trim() || null,
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
        deadline_at: dateInputToDateTime(projectForm.deadline_at),
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
            <Tab label="Контакты" />
            <Tab label="История" />
          </Tabs>
        </Box>

        {/* Tab: Основное */}
        <TabPanel value={tab} index={0}>
          <Stack spacing={2}>
            {/* Базовые данные */}
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 2, color: 'text.secondary', textTransform: 'uppercase', fontSize: 11, letterSpacing: 1 }}>
                Общие сведения
              </Typography>
              <Stack spacing={2} divider={<Divider />}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Typography fontWeight={600} sx={{ minWidth: 200 }}>Тип</Typography>
                  <Typography>{typeLabel || '—'}</Typography>
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Typography fontWeight={600} sx={{ minWidth: 200 }}>Роль контрагента</Typography>
                  <Typography>{counterparty.counterparty_role ? (COUNTERPARTY_ROLE_LABELS[counterparty.counterparty_role] ?? counterparty.counterparty_role) : '—'}</Typography>
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Typography fontWeight={600} sx={{ minWidth: 200 }}>ФИО / Название</Typography>
                  <Typography>{counterparty.full_name || '—'}</Typography>
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Typography fontWeight={600} sx={{ minWidth: 200 }}>Телефон</Typography>
                  <Typography>{counterparty.phone || '—'}</Typography>
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Typography fontWeight={600} sx={{ minWidth: 200 }}>Email</Typography>
                  <Typography>{counterparty.email || '—'}</Typography>
                </Stack>
                {counterparty.type !== 'individual' && (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Typography fontWeight={600} sx={{ minWidth: 200 }}>Компания</Typography>
                    <Typography>{counterparty.company || '—'}</Typography>
                  </Stack>
                )}
                {counterparty.type === 'individual' && (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Typography fontWeight={600} sx={{ minWidth: 200 }}>Должность</Typography>
                    <Typography>{counterparty.position || '—'}</Typography>
                  </Stack>
                )}
                {counterparty.type !== 'individual' && counterparty.website && (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Typography fontWeight={600} sx={{ minWidth: 200 }}>Сайт</Typography>
                    <Link href={counterparty.website.startsWith('http') ? counterparty.website : `https://${counterparty.website}`} target="_blank" rel="noopener">
                      {counterparty.website}
                    </Link>
                  </Stack>
                )}
                {counterparty.type !== 'individual' && counterparty.industry && (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Typography fontWeight={600} sx={{ minWidth: 200 }}>Отрасль</Typography>
                    <Typography>{counterparty.industry}</Typography>
                  </Stack>
                )}
                {counterparty.comment && (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Typography fontWeight={600} sx={{ minWidth: 200 }}>Комментарий</Typography>
                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>{counterparty.comment}</Typography>
                  </Stack>
                )}
              </Stack>
            </Paper>

            {/* Реквизиты — только для company и ip */}
            {counterparty.type !== 'individual' && (
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 2, color: 'text.secondary', textTransform: 'uppercase', fontSize: 11, letterSpacing: 1 }}>
                  Реквизиты
                </Typography>
                <Stack spacing={2} divider={<Divider />}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Typography fontWeight={600} sx={{ minWidth: 200 }}>ИНН</Typography>
                    <Typography>{counterparty.inn || '—'}</Typography>
                  </Stack>
                  {counterparty.type === 'company' && (
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      <Typography fontWeight={600} sx={{ minWidth: 200 }}>КПП</Typography>
                      <Typography>{counterparty.kpp || '—'}</Typography>
                    </Stack>
                  )}
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Typography fontWeight={600} sx={{ minWidth: 200 }}>
                      {counterparty.type === 'ip' ? 'ОГРНИП' : 'ОГРН'}
                    </Typography>
                    <Typography>{counterparty.ogrn || '—'}</Typography>
                  </Stack>
                  {counterparty.type === 'company' && (
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      <Typography fontWeight={600} sx={{ minWidth: 200 }}>Юридический адрес</Typography>
                      <Typography sx={{ whiteSpace: 'pre-wrap' }}>{counterparty.legal_address || '—'}</Typography>
                    </Stack>
                  )}
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Typography fontWeight={600} sx={{ minWidth: 200 }}>
                      {counterparty.type === 'ip' ? 'Адрес регистрации' : 'Фактический адрес'}
                    </Typography>
                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>{counterparty.actual_address || '—'}</Typography>
                  </Stack>
                </Stack>
              </Paper>
            )}

            {/* Банковские реквизиты — только для company и ip */}
            {counterparty.type !== 'individual' && (
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 2, color: 'text.secondary', textTransform: 'uppercase', fontSize: 11, letterSpacing: 1 }}>
                  Банковские реквизиты
                </Typography>
                <Stack spacing={2} divider={<Divider />}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Typography fontWeight={600} sx={{ minWidth: 200 }}>Расчётный счёт</Typography>
                    <Typography>{counterparty.bank_account || '—'}</Typography>
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Typography fontWeight={600} sx={{ minWidth: 200 }}>Корр. счёт</Typography>
                    <Typography>{counterparty.bank_corr_account || '—'}</Typography>
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Typography fontWeight={600} sx={{ minWidth: 200 }}>БИК банка</Typography>
                    <Typography>{counterparty.bank_bik || '—'}</Typography>
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Typography fontWeight={600} sx={{ minWidth: 200 }}>Наименование банка</Typography>
                    <Typography>{counterparty.bank_name || '—'}</Typography>
                  </Stack>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <Typography fontWeight={600} sx={{ minWidth: 200 }}>Валюта счёта</Typography>
                    <Typography>{counterparty.bank_currency || '—'}</Typography>
                  </Stack>
                </Stack>
              </Paper>
            )}
          </Stack>
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

        {/* Tab: Контакты */}
        <TabPanel value={tab} index={3}>
          <Stack spacing={2}>
            {/* Привязать контакт */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Привязать существующий контакт</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="flex-start">
                <Autocomplete
                  sx={{ flex: 1 }}
                  options={allContacts.filter((c) => !contacts.some((lc) => lc.id === c.id))}
                  getOptionLabel={(o) => `${o.full_name}${o.phone ? ` · ${o.phone}` : ''}`}
                  value={contactToLink}
                  onChange={(_, v) => setContactToLink(v)}
                  renderInput={(params) => <TextField {...params} label="Контакт" size="small" placeholder="Имя или телефон..." />}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  noOptionsText="Контакты не найдены"
                />
                <Button
                  variant="contained"
                  startIcon={<PersonAddIcon />}
                  disabled={!contactToLink || linkingContact}
                  onClick={() => void handleLinkContact()}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  Привязать
                </Button>
              </Stack>
            </Paper>

            {/* Список привязанных контактов */}
            {contactsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={28} />
              </Box>
            ) : contacts.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
                <Typography color="text.secondary">Контакты не привязаны. Найдите контакт выше и нажмите «Привязать».</Typography>
              </Paper>
            ) : (
              <Paper variant="outlined">
                <List disablePadding>
                  {contacts.map((c, idx) => (
                    <React.Fragment key={c.id}>
                      {idx > 0 && <Divider />}
                      <ListItem
                        secondaryAction={
                          <Tooltip title="Отвязать от контрагента">
                            <IconButton size="small" color="error" onClick={() => void handleUnlinkContact(c.id)}>
                              <LinkOffIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        }
                      >
                        <ListItemAvatar>
                          <Avatar sx={{ width: 36, height: 36, fontSize: 14 }}>
                            {c.full_name.charAt(0).toUpperCase()}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={c.full_name}
                          secondary={[c.position, c.phone, c.email].filter(Boolean).join(' · ') || undefined}
                        />
                      </ListItem>
                    </React.Fragment>
                  ))}
                </List>
              </Paper>
            )}
          </Stack>
        </TabPanel>

        {/* Tab: Задачи */}
        <TabPanel value={tab} index={2}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setTaskCreateDialogOpen(true)}
            >
              Создать задачу
            </Button>
          </Box>

          <OwnerWorkspaceTaskCreateDialog
            open={taskCreateDialogOpen}
            onClose={() => setTaskCreateDialogOpen(false)}
            onSubmit={handleCreateTask}
            users={users}
          />

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
        <TabPanel value={tab} index={4}>
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
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Редактировать контрагента</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} sx={{ mt: 1 }}>
            {/* Общие */}
            <Typography variant="subtitle2" color="text.secondary">Общие сведения</Typography>
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
            {editForm.type !== 'individual' && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Компания"
                  value={editForm.company}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, company: e.target.value }))}
                  fullWidth
                />
                <FormControl fullWidth>
                  <InputLabel>Роль контрагента</InputLabel>
                  <Select
                    label="Роль контрагента"
                    value={editForm.counterparty_role}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, counterparty_role: e.target.value }))}
                  >
                    <MenuItem value=""><em>Не указана</em></MenuItem>
                    {roleOptions.map((r) => (
                      <MenuItem key={r} value={r}>{r}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            )}
            {editForm.type !== 'individual' && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Сайт"
                  value={editForm.website}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, website: e.target.value }))}
                  fullWidth
                  placeholder="https://example.com"
                />
                <FormControl fullWidth>
                  <InputLabel>Отрасль</InputLabel>
                  <Select
                    label="Отрасль"
                    value={editForm.industry}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, industry: e.target.value }))}
                  >
                    <MenuItem value=""><em>Не указана</em></MenuItem>
                    {industryOptions.map((i) => (
                      <MenuItem key={i} value={i}>{i}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            )}
            <TextField
              label="Комментарий"
              value={editForm.comment}
              onChange={(e) => setEditForm((prev) => ({ ...prev, comment: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
            />

            {/* Реквизиты */}
            {editForm.type !== 'individual' && (
              <>
                <Divider />
                <Typography variant="subtitle2" color="text.secondary">Реквизиты</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    label="ИНН"
                    value={editForm.inn}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, inn: e.target.value }))}
                    fullWidth
                  />
                  {editForm.type === 'company' && (
                    <TextField
                      label="КПП"
                      value={editForm.kpp}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, kpp: e.target.value }))}
                      fullWidth
                    />
                  )}
                  <TextField
                    label={editForm.type === 'ip' ? 'ОГРНИП' : 'ОГРН'}
                    value={editForm.ogrn}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, ogrn: e.target.value }))}
                    fullWidth
                  />
                </Stack>
                {editForm.type === 'company' && (
                  <TextField
                    label="Юридический адрес"
                    value={editForm.legal_address}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, legal_address: e.target.value }))}
                    fullWidth
                    multiline
                    minRows={2}
                  />
                )}
                <TextField
                  label={editForm.type === 'ip' ? 'Адрес регистрации' : 'Фактический адрес'}
                  value={editForm.actual_address}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, actual_address: e.target.value }))}
                  fullWidth
                  multiline
                  minRows={2}
                />
              </>
            )}

            {/* Банковские реквизиты */}
            {editForm.type !== 'individual' && (
              <>
                <Divider />
                <Typography variant="subtitle2" color="text.secondary">Банковские реквизиты</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    label="Расчётный счёт"
                    value={editForm.bank_account}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, bank_account: e.target.value }))}
                    fullWidth
                  />
                  <TextField
                    label="Корр. счёт"
                    value={editForm.bank_corr_account}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, bank_corr_account: e.target.value }))}
                    fullWidth
                  />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    label="БИК банка"
                    value={editForm.bank_bik}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, bank_bik: e.target.value }))}
                    fullWidth
                  />
                  <TextField
                    label="Наименование банка"
                    value={editForm.bank_name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, bank_name: e.target.value }))}
                    fullWidth
                  />
                  <TextField
                    label="Валюта счёта"
                    value={editForm.bank_currency}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, bank_currency: e.target.value }))}
                    fullWidth
                    placeholder="RUB"
                    sx={{ maxWidth: 120 }}
                  />
                </Stack>
              </>
            )}
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
