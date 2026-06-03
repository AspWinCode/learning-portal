import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Archive as ArchiveIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  ExpandLess,
  ExpandMore,
  RestoreFromTrash as RestoreIcon,
  UploadFile as UploadFileIcon,
} from '@mui/icons-material';
import { Collapse } from '@mui/material';

import Layout from '../components/Layout';
import { ConfirmDialog, DataTable, EmptyState } from '../components/ui';
import { ownerWorkspaceApi, searchApi } from '../services/api';
import type {
  LinkedPersonItem,
  OwnerWorkspaceCounterparty,
  OwnerWorkspaceCounterpartyCustomField,
  OwnerWorkspaceProject,
  OwnerWorkspaceProjectDocument,
} from '../types';
import { extractApiError } from '../utils/extractApiError';


type CounterpartyFormState = {
  type: 'company' | 'ip' | 'individual';
  full_name: string;
  phone: string;
  email: string;
  tags: string;
  comment: string;
  custom_fields: OwnerWorkspaceCounterpartyCustomField[];
  linked_persons: LinkedPersonItem[];
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  new: 'Новый',
  in_progress: 'В работе',
  on_review: 'На проверке',
  completed: 'Завершён',
  archived: 'Архив',
  active: 'Активный',
};

const emptyForm = (): CounterpartyFormState => ({
  type: 'company',
  full_name: '',
  phone: '',
  email: '',
  tags: '',
  comment: '',
  custom_fields: [],
  linked_persons: [],
});

const OwnerCounterpartiesPage: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<OwnerWorkspaceCounterparty[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<OwnerWorkspaceCounterparty | null>(null);
  const [form, setForm] = useState<CounterpartyFormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<OwnerWorkspaceCounterparty | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<OwnerWorkspaceCounterparty | null>(null);

  const [counterpartyProjects, setCounterpartyProjects] = useState<OwnerWorkspaceProject[]>([]);
  const [projectDocuments, setProjectDocuments] = useState<Record<number, OwnerWorkspaceProjectDocument[]>>({});
  const [expandedProjectId, setExpandedProjectId] = useState<number | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [savingProject, setSavingProject] = useState(false);
  const [uploadingProjectDocId, setUploadingProjectDocId] = useState<number | null>(null);
  const [personSearch, setPersonSearch] = useState('');
  const [personResults, setPersonResults] = useState<LinkedPersonItem[]>([]);
  const [personSearching, setPersonSearching] = useState(false);
  const [contactTasks, setContactTasks] = useState<Array<{ id: number; title: string; status: string; priority: string; deadline_at?: string | null }>>([]);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [savingTask, setSavingTask] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const counterparties = await ownerWorkspaceApi.listCounterparties({
        search: search.trim() || undefined,
        archived: showArchived,
      });
      setRows(counterparties);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить контрагентов.'));
    } finally {
      setLoading(false);
    }
  }, [search, showArchived]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((row) =>
          [row.full_name, row.company || '', row.email || '', row.phone || '']
            .join(' ')
            .toLowerCase()
            .includes(q)
        )
      : rows;
    return filtered;
  }, [rows, search]);

  const pagedRows = useMemo(() => {
    const start = page * rowsPerPage;
    return visibleRows.slice(start, start + rowsPerPage);
  }, [page, rowsPerPage, visibleRows]);

  const loadCounterpartyProjects = async (counterpartyId: number) => {
    const projs = await ownerWorkspaceApi.listProjects({ counterparty_id: counterpartyId });
    setCounterpartyProjects(projs);
  };

  const loadProjectDocs = async (projectId: number) => {
    const docs = await ownerWorkspaceApi.listProjectDocuments(projectId);
    setProjectDocuments((prev) => ({ ...prev, [projectId]: docs }));
  };

  const toggleProjectExpand = async (projectId: number) => {
    if (expandedProjectId === projectId) {
      setExpandedProjectId(null);
    } else {
      setExpandedProjectId(projectId);
      if (!projectDocuments[projectId]) {
        await loadProjectDocs(projectId);
      }
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !selected) return;
    setSavingProject(true);
    try {
      await ownerWorkspaceApi.createProject({
        name: newProjectName.trim(),
        counterparty_id: selected.id,
      });
      setNewProjectName('');
      setCreateProjectOpen(false);
      await loadCounterpartyProjects(selected.id);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось создать проект.'));
    } finally {
      setSavingProject(false);
    }
  };

  const handleUploadProjectDoc = async (projectId: number, file: File) => {
    setUploadingProjectDocId(projectId);
    try {
      await ownerWorkspaceApi.uploadProjectDocument(projectId, file);
      await loadProjectDocs(projectId);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить документ.'));
    } finally {
      setUploadingProjectDocId(null);
    }
  };

  const handleDeleteProjectDoc = async (projectId: number, docId: number) => {
    try {
      await ownerWorkspaceApi.deleteProjectDocument(projectId, docId);
      await loadProjectDocs(projectId);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось удалить документ.'));
    }
  };

  const loadContactTasks = async (contactId: number) => {
    try {
      const res = await ownerWorkspaceApi.listTasks({ contact_id: contactId, limit: 50 });
      setContactTasks(res.items.map((t) => ({
        id: t.id, title: t.title, status: t.status, priority: t.priority, deadline_at: t.deadline_at,
      })));
    } catch {
      setContactTasks([]);
    }
  };

  const handleCreateTask = async () => {
    if (!newTaskTitle.trim() || !selected) return;
    setSavingTask(true);
    try {
      await ownerWorkspaceApi.createTask({
        title: newTaskTitle.trim(),
        priority: newTaskPriority,
        deadline_at: newTaskDeadline || null,
        contact_id: selected.id,
        status: 'new',
      });
      setNewTaskTitle('');
      setNewTaskDeadline('');
      setNewTaskPriority('medium');
      setTaskFormOpen(false);
      await loadContactTasks(selected.id);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось создать задачу.'));
    } finally {
      setSavingTask(false);
    }
  };

  const openCreateDialog = () => {
    setSelected(null);
    setForm(emptyForm());
    setDialogOpen(true);
    setError('');
    setSuccess('');
  };

  const openEditDialog = async (row: OwnerWorkspaceCounterparty) => {
    setError('');
    setSuccess('');
    try {
      const fresh = await ownerWorkspaceApi.getCounterparty(row.id);
      setSelected(fresh);
      setForm({
        type: ((fresh as any).type as CounterpartyFormState['type']) || 'company',
        full_name: fresh.full_name || '',
        phone: fresh.phone || '',
        email: fresh.email || '',
        tags: (fresh.tags || []).join(', '),
        comment: fresh.comment || '',
        custom_fields: Array.isArray(fresh.custom_fields) ? fresh.custom_fields : [],
        linked_persons: Array.isArray(fresh.linked_persons) ? fresh.linked_persons : [],
      });
      setPersonSearch('');
      setPersonResults([]);
      setCounterpartyProjects([]);
      setProjectDocuments({});
      setExpandedProjectId(null);
      setCreateProjectOpen(false);
      setNewProjectName('');
      void loadCounterpartyProjects(fresh.id);
      void loadContactTasks(fresh.id);
      setTaskFormOpen(false);
      setNewTaskTitle('');
      setNewTaskDeadline('');
      setNewTaskPriority('medium');
      setDialogOpen(true);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось открыть карточку контрагента.'));
    }
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      setError('Укажите название контрагента.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        type: form.type,
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        tags: form.tags
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        comment: form.comment.trim() || null,
        custom_fields: form.custom_fields.map((field) => ({
          ...field,
          label: field.label.trim(),
        })),
        linked_persons: form.linked_persons,
      };

      if (selected) {
        await ownerWorkspaceApi.updateCounterparty(selected.id, payload);
        setSuccess('Контрагент обновлён.');
      } else {
        await ownerWorkspaceApi.createCounterparty(payload);
        setSuccess('Контрагент создан. Задачи по договору, актам и счетам добавлены автоматически.');
      }
      setDialogOpen(false);
      setSelected(null);
      setForm(emptyForm());
      await loadData();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось сохранить контрагента.'));
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveToggle = async (row: OwnerWorkspaceCounterparty) => {
    try {
      if (row.is_archived) {
        await ownerWorkspaceApi.unarchiveCounterparty(row.id);
        setSuccess('Контрагент разархивирован.');
      } else {
        await ownerWorkspaceApi.archiveCounterparty(row.id);
        setSuccess('Контрагент архивирован.');
      }
      setArchiveTarget(null);
      if (selected?.id === row.id) {
        setDialogOpen(false);
        setSelected(null);
      }
      await loadData();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось изменить статус контрагента.'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await ownerWorkspaceApi.deleteCounterparty(deleteTarget.id);
      setSuccess('Контрагент удалён.');
      setDeleteTarget(null);
      if (selected?.id === deleteTarget.id) {
        setDialogOpen(false);
        setSelected(null);
      }
      await loadData();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось удалить контрагента.'));
    }
  };

  const addCustomField = () => {
    setForm((prev) => ({
      ...prev,
      custom_fields: [
        ...prev.custom_fields,
        {
          id: `field-${Date.now()}-${prev.custom_fields.length}`,
          label: '',
          field_type: 'text',
          value: '',
        },
      ],
    }));
  };

  const updateCustomField = (
    index: number,
    patch: Partial<OwnerWorkspaceCounterpartyCustomField>
  ) => {
    setForm((prev) => ({
      ...prev,
      custom_fields: prev.custom_fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field
      ),
    }));
  };

  const removeCustomField = (index: number) => {
    setForm((prev) => ({
      ...prev,
      custom_fields: prev.custom_fields.filter((_, fieldIndex) => fieldIndex !== index),
    }));
  };


  return (
    <Layout>
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h4">Контрагенты</Typography>
            <Typography color="text.secondary">
              Карточки контрагентов с привязкой к проектам, документами и автозадачами.
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
            Новый контрагент
          </Button>
        </Box>

        {error ? <Alert severity="error">{error}</Alert> : null}
        {success ? <Alert severity="success">{success}</Alert> : null}

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            label="Поиск"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            fullWidth
          />
          <FormControl sx={{ minWidth: 220 }}>
            <InputLabel>Состояние</InputLabel>
            <Select
              label="Состояние"
              value={showArchived ? 'archived' : 'active'}
              onChange={(e) => setShowArchived(e.target.value === 'archived')}
            >
              <MenuItem value="active">Активные</MenuItem>
              <MenuItem value="archived">Архив</MenuItem>
            </Select>
          </FormControl>
          <Button variant="outlined" onClick={() => void loadData()}>
            Обновить
          </Button>
        </Stack>

        <DataTable
          onRowClick={(row) => navigate(`/owner-workspace/counterparties/${row.id}`)}
          columns={[
            {
              key: 'name',
              header: 'Контрагент',
              render: (row) => (
                <Box>
                  <Typography fontWeight={600}>{row.full_name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {row.company || row.email || row.phone || '—'}
                  </Typography>
                </Box>
              ),
            },
            {
              key: 'type',
              header: 'Тип',
              render: (row) => {
                const labels: Record<string, string> = { company: 'Компания', ip: 'ИП', individual: 'Физлицо' };
                return <Chip size="small" variant="outlined" label={labels[(row as any).type] || 'Компания'} />;
              },
            },
            {
              key: 'projects',
              header: 'Проектов',
              align: 'center',
              render: (row) => (
                <Chip
                  size="small"
                  color={(row as any).projects_count > 0 ? 'primary' : 'default'}
                  variant={(row as any).projects_count > 0 ? 'filled' : 'outlined'}
                  label={(row as any).projects_count ?? (row.linked_project_ids || []).length}
                />
              ),
            },
            {
              key: 'tasks',
              header: 'Задач',
              align: 'center',
              render: (row) => (
                <Chip size="small" variant="outlined" label={row.active_tasks_count || 0} />
              ),
            },
            {
              key: 'status',
              header: 'Статус',
              align: 'center',
              render: (row) => (
                <Chip
                  size="small"
                  color={row.is_archived ? 'default' : 'success'}
                  label={row.is_archived ? 'Архив' : 'Активен'}
                />
              ),
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (row) => (
                <Stack direction="row" spacing={0.5} justifyContent="flex-end" onClick={(e) => e.stopPropagation()}>
                  <IconButton size="small" onClick={() => void openEditDialog(row)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => setArchiveTarget(row)}>
                    {row.is_archived ? <RestoreIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => setDeleteTarget(row)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ),
            },
          ]}
          rows={pagedRows}
          getRowKey={(row) => row.id}
          loading={loading}
          emptyState={<EmptyState title="Нет контрагентов" description="Создайте первую карточку контрагента." />}
          pagination={{
            page,
            rowsPerPage,
            total: visibleRows.length,
            onPageChange: setPage,
            onRowsPerPageChange: (value) => {
              setRowsPerPage(value);
              setPage(0);
            },
          }}
        />
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth scroll="paper">
        <DialogTitle>{selected ? 'Карточка контрагента' : 'Новый контрагент'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Тип контрагента</InputLabel>
                <Select
                  value={form.type}
                  label="Тип контрагента"
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as CounterpartyFormState['type'] }))}
                >
                  <MenuItem value="company">Компания</MenuItem>
                  <MenuItem value="ip">ИП</MenuItem>
                  <MenuItem value="individual">Физическое лицо</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Наименование / ФИО"
                value={form.full_name}
                onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
                fullWidth
                required
              />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Телефон"
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                fullWidth
              />
            </Stack>
            <TextField
              label="Теги"
              value={form.tags}
              onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
              helperText="Через запятую"
              fullWidth
            />
            <TextField
              label="Комментарий"
              value={form.comment}
              onChange={(e) => setForm((prev) => ({ ...prev, comment: e.target.value }))}
              fullWidth
              multiline
              minRows={3}
            />

            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Гибкие поля</Typography>
                <Button onClick={addCustomField}>Добавить поле</Button>
              </Stack>
              <Stack spacing={1.5}>
                {form.custom_fields.map((field, index) => (
                  <Stack key={field.id || index} direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                    <TextField
                      label="Название поля"
                      value={field.label}
                      onChange={(e) => updateCustomField(index, { label: e.target.value })}
                      fullWidth
                    />
                    <FormControl sx={{ minWidth: 180 }}>
                      <InputLabel>Тип</InputLabel>
                      <Select
                        label="Тип"
                        value={field.field_type}
                        onChange={(e) =>
                          updateCustomField(index, {
                            field_type: e.target.value as OwnerWorkspaceCounterpartyCustomField['field_type'],
                          })
                        }
                      >
                        <MenuItem value="text">Текст</MenuItem>
                        <MenuItem value="number">Число</MenuItem>
                        <MenuItem value="date">Дата</MenuItem>
                        <MenuItem value="link">Ссылка</MenuItem>
                        <MenuItem value="file">Файл / ссылка</MenuItem>
                        <MenuItem value="comment">Комментарий</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      label="Значение"
                      value={String(field.value ?? '')}
                      onChange={(e) => updateCustomField(index, { value: e.target.value })}
                      fullWidth
                      multiline={field.field_type === 'comment'}
                      minRows={field.field_type === 'comment' ? 2 : 1}
                    />
                    <Button color="error" onClick={() => removeCustomField(index)}>
                      Удалить
                    </Button>
                  </Stack>
                ))}
                {form.custom_fields.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Дополнительные поля пока не добавлены.
                  </Typography>
                ) : null}
              </Stack>
            </Box>

            <Box>
              <Typography variant="h6" sx={{ mb: 1 }}>Контакты</Typography>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <TextField
                  size="small"
                  label="Поиск по имени / телефону"
                  value={personSearch}
                  onChange={(e) => setPersonSearch(e.target.value)}
                  fullWidth
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && personSearch.trim().length >= 2) {
                      setPersonSearching(true);
                      try {
                        const res = await searchApi.searchPersons(personSearch.trim());
                        setPersonResults(
                          res.items.map((p) => ({
                            id: p.id,
                            full_name: p.full_name,
                            phone: p.phone_normalized ?? null,
                            email: p.email ?? null,
                          }))
                        );
                      } finally {
                        setPersonSearching(false);
                      }
                    }
                  }}
                  helperText="Нажмите Enter для поиска"
                  InputProps={{ endAdornment: personSearching ? <Typography variant="caption">...</Typography> : null }}
                />
              </Stack>
              {personResults.length > 0 && (
                <Stack spacing={0.5} sx={{ mb: 1, maxHeight: 160, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
                  {personResults.map((p) => (
                    <Stack key={p.id} direction="row" alignItems="center" justifyContent="space-between">
                      <Box>
                        <Typography variant="body2" fontWeight={500}>{p.full_name}</Typography>
                        <Typography variant="caption" color="text.secondary">{[p.phone, p.email].filter(Boolean).join(' · ')}</Typography>
                      </Box>
                      <Button
                        size="small"
                        disabled={form.linked_persons.some((lp) => lp.id === p.id)}
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            linked_persons: prev.linked_persons.some((lp) => lp.id === p.id)
                              ? prev.linked_persons
                              : [...prev.linked_persons, p],
                          }));
                          setPersonResults([]);
                          setPersonSearch('');
                        }}
                      >
                        {form.linked_persons.some((lp) => lp.id === p.id) ? 'Добавлен' : 'Добавить'}
                      </Button>
                    </Stack>
                  ))}
                </Stack>
              )}
              {form.linked_persons.length > 0 && (
                <Stack spacing={0.5}>
                  {form.linked_persons.map((p) => (
                    <Stack key={p.id} direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1, py: 0.5, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Box>
                        <Typography variant="body2" fontWeight={500}>{p.full_name}</Typography>
                        <Typography variant="caption" color="text.secondary">{[p.phone, p.email].filter(Boolean).join(' · ')}</Typography>
                      </Box>
                      <Button
                        size="small"
                        color="error"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            linked_persons: prev.linked_persons.filter((lp) => lp.id !== p.id),
                          }))
                        }
                      >
                        Удалить
                      </Button>
                    </Stack>
                  ))}
                </Stack>
              )}
              {form.linked_persons.length === 0 && personResults.length === 0 && (
                <Typography variant="body2" color="text.secondary">Нет привязанных контактов.</Typography>
              )}
            </Box>

            {selected ? (
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                  <Typography variant="h6">Задачи</Typography>
                  <Button size="small" startIcon={<AddIcon />} onClick={() => { setTaskFormOpen(true); setNewTaskTitle(''); setNewTaskDeadline(''); setNewTaskPriority('medium'); }}>
                    Создать задачу
                  </Button>
                </Stack>

                <Collapse in={taskFormOpen}>
                  <Stack spacing={1.5} sx={{ mb: 2, p: 1.5, border: '1px solid', borderColor: 'primary.light', borderRadius: 1 }}>
                    <TextField
                      size="small"
                      label="Название задачи"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      fullWidth
                      autoFocus
                    />
                    <Stack direction="row" spacing={1}>
                      <FormControl size="small" sx={{ minWidth: 140 }}>
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
                      <Button variant="contained" size="small" disabled={!newTaskTitle.trim() || savingTask} onClick={() => void handleCreateTask()}>
                        {savingTask ? 'Создаём...' : 'Создать'}
                      </Button>
                      <Button size="small" onClick={() => setTaskFormOpen(false)}>Отмена</Button>
                    </Stack>
                  </Stack>
                </Collapse>

                {contactTasks.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Задач нет.</Typography>
                ) : (
                  <Stack spacing={0.5} sx={{ mb: 2 }}>
                    {contactTasks.map((t) => {
                      const priorityColor: Record<string, string> = { low: '#9e9e9e', medium: '#1976d2', high: '#ed6c02', critical: '#d32f2f' };
                      const statusLabel: Record<string, string> = { new: 'Новая', in_progress: 'В работе', waiting: 'Ожидание', completed: 'Выполнена', cancelled: 'Отменена' };
                      return (
                        <Stack key={t.id} direction="row" alignItems="center" justifyContent="space-between"
                          sx={{ px: 1.5, py: 1, bgcolor: t.status === 'completed' ? 'grey.50' : 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                          <Box>
                            <Typography variant="body2" sx={{ textDecoration: t.status === 'completed' ? 'line-through' : 'none', color: t.status === 'completed' ? 'text.disabled' : 'text.primary' }}>
                              {t.title}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {statusLabel[t.status] || t.status}
                              {t.deadline_at ? ` · до ${new Date(t.deadline_at).toLocaleDateString('ru-RU')}` : ''}
                            </Typography>
                          </Box>
                          <Chip size="small" label={t.priority} sx={{ bgcolor: priorityColor[t.priority] || '#9e9e9e', color: '#fff', fontSize: 11 }} />
                        </Stack>
                      );
                    })}
                  </Stack>
                )}
              </Box>
            ) : null}

            {selected ? (
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                  <Typography variant="h6">Проекты</Typography>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => { setCreateProjectOpen(true); setNewProjectName(''); }}
                  >
                    Создать проект
                  </Button>
                </Stack>

                <Collapse in={createProjectOpen}>
                  <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                    <TextField
                      size="small"
                      label="Название проекта"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      fullWidth
                      autoFocus
                    />
                    <Button
                      variant="contained"
                      size="small"
                      disabled={!newProjectName.trim() || savingProject}
                      onClick={() => void handleCreateProject()}
                    >
                      {savingProject ? 'Создаём...' : 'Создать'}
                    </Button>
                    <Button
                      size="small"
                      onClick={() => { setCreateProjectOpen(false); setNewProjectName(''); }}
                    >
                      Отмена
                    </Button>
                  </Stack>
                </Collapse>

                {counterpartyProjects.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">Проектов нет. Нажмите «Создать проект».</Typography>
                ) : (
                  <Stack spacing={1}>
                    {counterpartyProjects.map((project) => (
                      <Box key={project.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                        <Stack
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          sx={{ p: 1.5, cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => void toggleProjectExpand(project.id)}
                        >
                          <Box>
                            <Typography fontWeight={600}>{project.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {PROJECT_STATUS_LABELS[project.status] || project.status}
                              {project.deadline_at ? ` · до ${new Date(project.deadline_at).toLocaleDateString('ru-RU')}` : ''}
                              {` · документов: ${(projectDocuments[project.id] || []).length}`}
                            </Typography>
                          </Box>
                          {expandedProjectId === project.id ? <ExpandLess /> : <ExpandMore />}
                        </Stack>

                        <Collapse in={expandedProjectId === project.id}>
                          <Box sx={{ px: 2, pb: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                            <Typography variant="subtitle2" sx={{ mt: 1.5, mb: 1 }}>Документы проекта</Typography>
                            {(projectDocuments[project.id] || []).length === 0 ? (
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                Документов нет.
                              </Typography>
                            ) : (
                              <Stack spacing={0.5} sx={{ mb: 1 }}>
                                {(projectDocuments[project.id] || []).map((doc) => (
                                  <Stack
                                    key={doc.id}
                                    direction="row"
                                    alignItems="center"
                                    justifyContent="space-between"
                                    sx={{ py: 0.5, px: 1, bgcolor: 'grey.50', borderRadius: 1 }}
                                  >
                                    <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                                      {doc.filename}
                                    </Typography>
                                    <Stack direction="row" spacing={0.5} flexShrink={0}>
                                      <Button
                                        size="small"
                                        startIcon={<DownloadIcon />}
                                        onClick={() =>
                                          window.open(
                                            ownerWorkspaceApi.downloadProjectDocumentUrl(project.id, doc.id),
                                            '_blank'
                                          )
                                        }
                                      >
                                        Скачать
                                      </Button>
                                      <Button
                                        size="small"
                                        color="error"
                                        startIcon={<DeleteIcon />}
                                        onClick={() => void handleDeleteProjectDoc(project.id, doc.id)}
                                      >
                                        Удалить
                                      </Button>
                                    </Stack>
                                  </Stack>
                                ))}
                              </Stack>
                            )}
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<UploadFileIcon />}
                              component="label"
                              disabled={uploadingProjectDocId === project.id}
                            >
                              {uploadingProjectDocId === project.id ? 'Загрузка...' : 'Загрузить документ'}
                              <input
                                type="file"
                                hidden
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  if (!file) return;
                                  await handleUploadProjectDoc(project.id, file);
                                }}
                              />
                            </Button>
                          </Box>
                        </Collapse>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Box>
            ) : (
              <Alert severity="info">
                Проекты и документы можно добавить сразу после создания контрагента.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
            {selected ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title={archiveTarget?.is_archived ? 'Разархивировать контрагента?' : 'Архивировать контрагента?'}
        description={
          archiveTarget?.is_archived
            ? 'Контрагент снова появится в активном списке.'
            : 'Контрагент будет скрыт из активного списка, но его карточка и задачи сохранятся.'
        }
        confirmLabel={archiveTarget?.is_archived ? 'Разархивировать' : 'Архивировать'}
        onClose={() => setArchiveTarget(null)}
        onConfirm={async () => {
          if (archiveTarget) {
            await handleArchiveToggle(archiveTarget);
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Удалить контрагента?"
        description="Удаление необратимо. Карточка, документы и связанные привязки будут удалены."
        confirmLabel="Удалить"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </Layout>
  );
};

export default OwnerCounterpartiesPage;
