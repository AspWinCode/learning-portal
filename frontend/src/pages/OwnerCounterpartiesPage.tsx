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
  RestoreFromTrash as RestoreIcon,
  UploadFile as UploadFileIcon,
} from '@mui/icons-material';

import Layout from '../components/Layout';
import { ConfirmDialog, DataTable, EmptyState } from '../components/ui';
import { ownerWorkspaceApi } from '../services/api';
import type {
  OwnerWorkspaceCounterparty,
  OwnerWorkspaceCounterpartyCustomField,
  OwnerWorkspaceProject,
} from '../types';
import { extractApiError } from '../utils/extractApiError';

const DOCUMENT_CATEGORIES = [
  'contract',
  'act',
  'invoice',
  'template',
  'financial_model',
  'tz',
  'business_plan',
] as const;

type DocumentCategory = typeof DOCUMENT_CATEGORIES[number];

const DOCUMENT_LABELS: Record<DocumentCategory, string> = {
  contract: 'Договор',
  act: 'Акт',
  invoice: 'Счет',
  template: 'Шаблон',
  financial_model: 'Финансовая модель',
  tz: 'ТЗ',
  business_plan: 'Бизнес-план',
};

type CounterpartyFormState = {
  type: 'company' | 'ip' | 'individual';
  full_name: string;
  phone: string;
  email: string;
  company: string;
  position: string;
  tags: string;
  comment: string;
  source: string;
  project_ids: number[];
  custom_fields: OwnerWorkspaceCounterpartyCustomField[];
};

const emptyForm = (): CounterpartyFormState => ({
  type: 'company',
  full_name: '',
  phone: '',
  email: '',
  company: '',
  position: '',
  tags: '',
  comment: '',
  source: '',
  project_ids: [],
  custom_fields: [],
});

const OwnerCounterpartiesPage: React.FC = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<OwnerWorkspaceCounterparty[]>([]);
  const [projects, setProjects] = useState<OwnerWorkspaceProject[]>([]);
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
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [counterparties, projectsData] = await Promise.all([
        ownerWorkspaceApi.listCounterparties({
          search: search.trim() || undefined,
          archived: showArchived,
        }),
        ownerWorkspaceApi.listProjects({}),
      ]);
      setRows(counterparties);
      setProjects(projectsData);
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

  const projectNameMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects]
  );

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
        company: fresh.company || '',
        position: fresh.position || '',
        tags: (fresh.tags || []).join(', '),
        comment: fresh.comment || '',
        source: fresh.source || '',
        project_ids: fresh.linked_project_ids || [],
        custom_fields: Array.isArray(fresh.custom_fields) ? fresh.custom_fields : [],
      });
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
        company: form.company.trim() || null,
        position: form.position.trim() || null,
        tags: form.tags
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        comment: form.comment.trim() || null,
        source: form.source.trim() || null,
        project_ids: form.project_ids,
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

  const refreshSelectedCounterparty = async (contactId: number) => {
    const fresh = await ownerWorkspaceApi.getCounterparty(contactId);
    setSelected(fresh);
    setRows((prev) => prev.map((row) => (row.id === fresh.id ? fresh : row)));
  };

  const handleUploadDocument = async (category: DocumentCategory, file: File | null) => {
    if (!selected || !file) return;
    try {
      setUploadingCategory(category);
      await ownerWorkspaceApi.uploadCounterpartyDocument(selected.id, category, file);
      await refreshSelectedCounterparty(selected.id);
      setSuccess(`Документ "${DOCUMENT_LABELS[category]}" загружен.`);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить документ.'));
    } finally {
      setUploadingCategory(null);
    }
  };

  const pickDocument = (category: DocumentCategory) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.doc,.docx,.pdf,.xls,.xlsx';
    input.onchange = () => {
      const file = input.files?.[0] || null;
      void handleUploadDocument(category, file);
    };
    input.click();
  };

  const handleDownloadDocument = async (category: DocumentCategory) => {
    if (!selected) return;
    try {
      const { blob, filename } = await ownerWorkspaceApi.downloadCounterpartyDocument(selected.id, category);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename || `${category}`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось скачать документ.'));
    }
  };

  const handleDeleteDocument = async (category: DocumentCategory) => {
    if (!selected) return;
    try {
      await ownerWorkspaceApi.deleteCounterpartyDocument(selected.id, category);
      await refreshSelectedCounterparty(selected.id);
      setSuccess(`Документ "${DOCUMENT_LABELS[category]}" удалён.`);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось удалить документ.'));
    }
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
                label="Компания"
                value={form.company}
                onChange={(e) => setForm((prev) => ({ ...prev, company: e.target.value }))}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Должность"
                value={form.position}
                onChange={(e) => setForm((prev) => ({ ...prev, position: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Источник"
                value={form.source}
                onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value }))}
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

            <FormControl fullWidth>
              <InputLabel>Проекты</InputLabel>
              <Select
                multiple
                label="Проекты"
                value={form.project_ids}
                onChange={(e) => setForm((prev) => ({ ...prev, project_ids: e.target.value as number[] }))}
                renderValue={(selectedIds) =>
                  (selectedIds as number[]).map((id) => projectNameMap.get(id) || `#${id}`).join(', ')
                }
              >
                {projects.map((project) => (
                  <MenuItem key={project.id} value={project.id}>
                    {project.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

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
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                <Button variant="outlined" onClick={() => navigate(`/owner-workspace/contacts/${selected.id}`)}>
                  Открыть в задачнике
                </Button>
                <Button variant="outlined" onClick={() => navigate(`/owner-workspace/tasks?contact_id=${selected.id}`)}>
                  Связанные задачи
                </Button>
              </Stack>
            ) : null}

            {selected ? (
              <Box>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Документы
                </Typography>
                <Stack spacing={1.25}>
                  {DOCUMENT_CATEGORIES.map((category) => {
                    const documentRow = selected.documents.find((item) => item.category === category);
                    return (
                      <Stack
                        key={category}
                        direction={{ xs: 'column', md: 'row' }}
                        spacing={1.5}
                        alignItems={{ xs: 'flex-start', md: 'center' }}
                        justifyContent="space-between"
                        sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
                      >
                        <Box>
                          <Typography fontWeight={600}>{DOCUMENT_LABELS[category]}</Typography>
                          <Chip
                            size="small"
                            color={documentRow?.uploaded ? 'success' : 'default'}
                            label={documentRow?.uploaded ? 'Загружено' : 'Не загружено'}
                            sx={{ mt: 0.5 }}
                          />
                          {documentRow?.filename ? (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                              {documentRow.filename}
                            </Typography>
                          ) : null}
                        </Box>
                        <Stack direction="row" spacing={1}>
                          <Button
                            variant="outlined"
                            startIcon={<UploadFileIcon />}
                            disabled={uploadingCategory === category}
                            onClick={() => pickDocument(category)}
                          >
                            {documentRow?.uploaded ? 'Заменить' : 'Загрузить'}
                          </Button>
                          {documentRow?.uploaded ? (
                            <>
                              <Button startIcon={<DownloadIcon />} onClick={() => void handleDownloadDocument(category)}>
                                Скачать
                              </Button>
                              <Button color="error" onClick={() => void handleDeleteDocument(category)}>
                                Удалить
                              </Button>
                            </>
                          ) : null}
                        </Stack>
                      </Stack>
                    );
                  })}
                </Stack>
              </Box>
            ) : (
              <Alert severity="info">
                Документы можно прикреплять сразу после создания контрагента.
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
