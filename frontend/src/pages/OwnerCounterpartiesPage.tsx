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
import { ownerWorkspaceApi } from '../services/api';
import type {
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
      });
      setCounterpartyProjects([]);
      setProjectDocuments({});
      setExpandedProjectId(null);
      setCreateProjectOpen(false);
      setNewProjectName('');
      void loadCounterpartyProjects(fresh.id);
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
