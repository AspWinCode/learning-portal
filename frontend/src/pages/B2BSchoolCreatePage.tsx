import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Edit from '@mui/icons-material/Edit';
import Layout from '../components/Layout';
import { b2bApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { format, parseISO } from 'date-fns';
import type { B2BSchool, B2BSchoolPipelineStage } from '../types';

const PIPELINE_STAGES: { value: B2BSchoolPipelineStage; label: string }[] = [
  { value: 'new', label: 'Новая' },
  { value: 'find_contacts', label: 'Найти контакты' },
  { value: 'first_contact', label: 'Первичный контакт' },
  { value: 'contact_found', label: 'Контакт найден' },
  { value: 'letter_sent', label: 'Письмо отправлено' },
  { value: 'meeting_scheduled', label: 'Назначена встреча' },
  { value: 'agreement', label: 'Согласование' },
  { value: 'meeting_held', label: 'Встреча проведена' },
  { value: 'permission_received', label: 'Разрешение получено' },
  { value: 'event_scheduled', label: 'Запланировано мероприятие' },
  { value: 'walkthrough_scheduled', label: 'Назначена дата обхода' },
  { value: 'event_done', label: 'Проведено' },
  { value: 'walkthrough_done', label: 'Обход проведён' },
  { value: 'leads_received', label: 'Лиды получены' },
  { value: 'thank_you', label: 'Благодарности' },
  { value: 'support_letter_requested', label: 'Письмо поддержки запрошено' },
  { value: 'support_letter_received', label: 'Письмо поддержки получено' },
  { value: 'partners', label: 'Партнёры' },
  { value: 'rejected', label: 'Отказ/Заморозка' },
];

const FRIENDSHIP_DEGREES: { value: string; label: string }[] = [
  { value: 'unknown', label: 'Не знаем друг друга' },
  { value: 'indirect', label: 'Знаем косвенно' },
  { value: 'friends', label: 'Друзья' },
  { value: 'enemies', label: 'Враги' },
];

const initialEditForm = {
  name: '',
  director: '',
  city: '',
  address: '',
  student_count: '' as number | '',
  friendship_degree: '',
  pipeline_stage: 'new' as B2BSchoolPipelineStage,
  next_step: '',
  next_step_date: '',
  manager_id: '' as number | '',
  event_dates: '',
  meeting_scheduled_at: '',
  meeting_outcomes: '',
  walkthrough_scheduled_at: '',
};

const B2BSchoolCreatePage: React.FC = () => {
  const [form, setForm] = useState({
    name: '',
    director: '',
    city: '',
    address: '',
    student_count: '' as number | '',
    friendship_degree: '',
    pipeline_stage: 'new' as B2BSchoolPipelineStage,
    event_dates: '',
  });
  const [schools, setSchools] = useState<B2BSchool[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterCity, setFilterCity] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<B2BSchool | null>(null);
  const [editForm, setEditForm] = useState(initialEditForm);
  const [managers, setManagers] = useState<{ id: number; full_name: string }[]>([]);
  const [loadingSchool, setLoadingSchool] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const loadSchools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await b2bApi.listSchools();
      setSchools(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить список школ'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  useEffect(() => {
    b2bApi.listManagers().then(setManagers).catch(() => {});
  }, []);

  const openEdit = useCallback(async (school: B2BSchool) => {
    setEditingSchool(school);
    setCardDialogOpen(true);
    setLoadingSchool(true);
    try {
      const full = await b2bApi.getSchool(school.id);
      setEditingSchool(full);
      const meetingAt = full.meeting_scheduled_at
        ? format(parseISO(full.meeting_scheduled_at), "yyyy-MM-dd'T'HH:mm")
        : '';
      const walkAt = full.walkthrough_scheduled_at
        ? format(parseISO(full.walkthrough_scheduled_at), 'yyyy-MM-dd')
        : '';
      const nextDate = full.next_step_date ? format(parseISO(full.next_step_date), 'yyyy-MM-dd') : '';
      setEditForm({
        name: full.name,
        director: full.director ?? '',
        city: full.city ?? '',
        address: full.address ?? '',
        student_count: full.student_count ?? '',
        friendship_degree: full.friendship_degree ?? '',
        pipeline_stage: (full.pipeline_stage as B2BSchoolPipelineStage) ?? 'new',
        next_step: full.next_step ?? '',
        next_step_date: nextDate,
        manager_id: full.manager_id ?? '',
        event_dates: Array.isArray(full.event_dates) ? full.event_dates.join(', ') : '',
        meeting_scheduled_at: meetingAt,
        meeting_outcomes: full.meeting_outcomes ?? '',
        walkthrough_scheduled_at: walkAt,
      });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить школу'));
    } finally {
      setLoadingSchool(false);
    }
  }, []);

  const handleSaveEdit = async () => {
    if (!editingSchool) return;
    setError(null);
    setSavingEdit(true);
    try {
      const eventDates = editForm.event_dates
        ? editForm.event_dates.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
        : undefined;
      const meetingAt =
        editForm.meeting_scheduled_at && editForm.pipeline_stage === 'meeting_scheduled'
          ? new Date(editForm.meeting_scheduled_at).toISOString()
          : null;
      const walkAt =
        editForm.walkthrough_scheduled_at && editForm.pipeline_stage === 'walkthrough_scheduled'
          ? new Date(editForm.walkthrough_scheduled_at + 'T12:00:00').toISOString()
          : null;
      const payload = {
        name: editForm.name.trim(),
        director: editForm.director.trim() || undefined,
        city: editForm.city.trim() || undefined,
        address: editForm.address.trim() || undefined,
        student_count: editForm.student_count === '' ? undefined : Number(editForm.student_count),
        friendship_degree: editForm.friendship_degree || undefined,
        pipeline_stage: editForm.pipeline_stage,
        next_step: editForm.next_step.trim() || null,
        next_step_date: editForm.next_step_date.trim() ? editForm.next_step_date : null,
        manager_id: editForm.manager_id === '' ? null : Number(editForm.manager_id),
        event_dates: eventDates,
        meeting_scheduled_at: meetingAt,
        meeting_outcomes: editForm.pipeline_stage === 'meeting_held' ? (editForm.meeting_outcomes.trim() || null) : undefined,
        walkthrough_scheduled_at: walkAt,
      };
      await b2bApi.updateSchool(editingSchool.id, payload);
      setCardDialogOpen(false);
      setEditingSchool(null);
      await loadSchools();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить школу'));
    } finally {
      setSavingEdit(false);
    }
  };

  const uniqueCities = useMemo(() => {
    const cities = Array.from(new Set(schools.map((s) => s.city).filter((c): c is string => !!c)));
    return cities.sort((a, b) => a.localeCompare(b));
  }, [schools]);

  const filteredSchools = useMemo(() => {
    if (!filterCity) return schools;
    return schools.filter((s) => s.city === filterCity);
  }, [schools, filterCity]);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    if (!form.name.trim()) {
      setError('Укажите название школы');
      return;
    }
    setSaving(true);
    try {
      const eventDates = form.event_dates
        ? form.event_dates.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
        : undefined;
      await b2bApi.createSchool({
        name: form.name.trim(),
        director: form.director.trim() || undefined,
        city: form.city.trim() || undefined,
        address: form.address.trim() || undefined,
        student_count: form.student_count === '' ? undefined : Number(form.student_count),
        friendship_degree: form.friendship_degree || undefined,
        pipeline_stage: form.pipeline_stage,
        event_dates: eventDates,
      });
      setSuccess('Школа успешно создана');
      setForm({
        name: '',
        director: '',
        city: '',
        address: '',
        student_count: '',
        friendship_degree: '',
        pipeline_stage: 'new',
        event_dates: '',
      });
      await loadSchools();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить школу'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h4">Создать школу (B2B)</Typography>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <Box maxWidth={520}>
          <Stack spacing={2}>
            <TextField
              label="Название школы"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Директор школы"
              value={form.director}
              onChange={(e) => setForm((f) => ({ ...f, director: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Город"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Адрес"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Количество детей в школе"
              type="number"
              value={form.student_count}
              onChange={(e) =>
                setForm((f) => ({ ...f, student_count: e.target.value === '' ? '' : Number(e.target.value) }))
              }
              fullWidth
              InputProps={{ inputProps: { min: 0 } }}
            />
            <FormControl fullWidth>
              <InputLabel>Степень дружбы</InputLabel>
              <Select
                value={form.friendship_degree}
                label="Степень дружбы"
                onChange={(e) => setForm((f) => ({ ...f, friendship_degree: e.target.value }))}
              >
                <MenuItem value="">
                  <em>Не выбрано</em>
                </MenuItem>
                <MenuItem value="unknown">Не знаем друг друга</MenuItem>
                <MenuItem value="indirect">Знаем косвенно</MenuItem>
                <MenuItem value="friends">Друзья</MenuItem>
                <MenuItem value="enemies">Враги</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Даты мероприятий (через запятую)"
              value={form.event_dates}
              onChange={(e) => setForm((f) => ({ ...f, event_dates: e.target.value }))}
              fullWidth
              placeholder="2025-03-01, 2025-03-15"
            />
            <FormControl fullWidth>
              <InputLabel>Стадия воронки</InputLabel>
              <Select
                value={form.pipeline_stage}
                label="Стадия воронки"
                onChange={(e) =>
                  setForm((f) => ({ ...f, pipeline_stage: e.target.value as B2BSchoolPipelineStage }))
                }
              >
                {PIPELINE_STAGES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>
                    {s.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => void handleSave()}
                disabled={saving}
              >
                Создать школу
              </Button>
            </Box>
          </Stack>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <Typography variant="h6">Созданные школы</Typography>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Фильтр по городу  </InputLabel>
              <Select
                label="Фильтр по городу  "
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
              >
                <MenuItem value="">
                  <em>Все города </em>
                </MenuItem>
                {uniqueCities.map((city) => (
                  <MenuItem key={city} value={city}>
                    {city}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {loading ? (
            <Typography color="text.secondary">Загрузка…</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Название</TableCell>
                    <TableCell>Директор</TableCell>
                    <TableCell>Город</TableCell>
                    <TableCell>Адрес</TableCell>
                    <TableCell align="right">Учеников</TableCell>
                    <TableCell>Стадия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSchools.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 3 }} color="text.secondary">
                        {schools.length === 0 ? 'Нет созданных школ' : 'Нет школ в выбранном городе'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSchools.map((school) => (
                      <TableRow
                        key={school.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => openEdit(school)}
                      >
                        <TableCell>{school.name}</TableCell>
                        <TableCell>{school.director || '—'}</TableCell>
                        <TableCell>{school.city || '—'}</TableCell>
                        <TableCell sx={{ maxWidth: 200 }} title={school.address || ''}>
                          <Typography variant="body2" noWrap>
                            {school.address || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{school.student_count ?? '—'}</TableCell>
                        <TableCell>
                          {PIPELINE_STAGES.find((s) => s.value === school.pipeline_stage)?.label ?? school.pipeline_stage}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>

        <Dialog open={cardDialogOpen} onClose={() => setCardDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Карточка школы</DialogTitle>
          <DialogContent>
            {loadingSchool ? (
              <Typography color="text.secondary" sx={{ py: 2 }}>Загрузка…</Typography>
            ) : (
              <Stack spacing={2} sx={{ mt: 1 }}>
                <TextField
                  label="Название школы"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  fullWidth
                  required
                />
                <TextField
                  label="Директор школы"
                  value={editForm.director}
                  onChange={(e) => setEditForm((f) => ({ ...f, director: e.target.value }))}
                  fullWidth
                />
                <TextField
                  label="Город"
                  value={editForm.city}
                  onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                  fullWidth
                />
                <TextField
                  label="Адрес"
                  value={editForm.address}
                  onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                  fullWidth
                />
                <TextField
                  label="Количество детей в школе"
                  type="number"
                  value={editForm.student_count}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, student_count: e.target.value === '' ? '' : Number(e.target.value) }))
                  }
                  fullWidth
                  InputProps={{ inputProps: { min: 0 } }}
                />
                <FormControl fullWidth>
                  <InputLabel>Степень дружбы</InputLabel>
                  <Select
                    value={editForm.friendship_degree}
                    label="Степень дружбы"
                    onChange={(e) => setEditForm((f) => ({ ...f, friendship_degree: e.target.value }))}
                  >
                    <MenuItem value=""><em>Не выбрано</em></MenuItem>
                    {FRIENDSHIP_DEGREES.map((d) => (
                      <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="Даты мероприятий (через запятую)"
                  value={editForm.event_dates}
                  onChange={(e) => setEditForm((f) => ({ ...f, event_dates: e.target.value }))}
                  fullWidth
                  placeholder="2025-03-01, 2025-03-15"
                />
                <FormControl fullWidth>
                  <InputLabel>Стадия воронки</InputLabel>
                  <Select
                    value={editForm.pipeline_stage}
                    label="Стадия воронки"
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, pipeline_stage: e.target.value as B2BSchoolPipelineStage }))
                    }
                  >
                    {PIPELINE_STAGES.map((s) => (
                      <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="Следующий шаг"
                  value={editForm.next_step}
                  onChange={(e) => setEditForm((f) => ({ ...f, next_step: e.target.value }))}
                  fullWidth
                  placeholder="Что сделать дальше"
                />
                <TextField
                  label="Дата следующего шага"
                  type="date"
                  value={editForm.next_step_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, next_step_date: e.target.value }))}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
                <FormControl fullWidth>
                  <InputLabel>Ответственный (менеджер)</InputLabel>
                  <Select
                    value={editForm.manager_id === '' ? '' : editForm.manager_id}
                    label="Ответственный (менеджер)"
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, manager_id: e.target.value === '' ? '' : Number(e.target.value) }))
                    }
                  >
                    <MenuItem value=""><em>Не назначен</em></MenuItem>
                    {managers.map((m) => (
                      <MenuItem key={m.id} value={m.id}>{m.full_name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {editForm.pipeline_stage === 'meeting_scheduled' && (
                  <TextField
                    label="Когда назначена встреча"
                    type="datetime-local"
                    value={editForm.meeting_scheduled_at}
                    onChange={(e) => setEditForm((f) => ({ ...f, meeting_scheduled_at: e.target.value }))}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                )}
                {editForm.pipeline_stage === 'meeting_held' && (
                  <TextField
                    label="Основные итоги встречи"
                    value={editForm.meeting_outcomes}
                    onChange={(e) => setEditForm((f) => ({ ...f, meeting_outcomes: e.target.value }))}
                    fullWidth
                    multiline
                    rows={3}
                  />
                )}
                {editForm.pipeline_stage === 'walkthrough_scheduled' && (
                  <TextField
                    label="Дата обхода"
                    type="date"
                    value={editForm.walkthrough_scheduled_at}
                    onChange={(e) => setEditForm((f) => ({ ...f, walkthrough_scheduled_at: e.target.value }))}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                )}
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCardDialogOpen(false)}>Закрыть</Button>
            <Button
              variant="contained"
              onClick={() => void handleSaveEdit()}
              disabled={loadingSchool || savingEdit}
              startIcon={<Edit />}
            >
              {savingEdit ? 'Сохранение…' : 'Сохранить'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  );
};

export default B2BSchoolCreatePage;

