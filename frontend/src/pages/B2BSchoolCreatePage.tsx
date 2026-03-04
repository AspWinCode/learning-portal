import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Checkbox,
  FormControl,
  FormControlLabel,
  IconButton,
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
  Tooltip,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Person from '@mui/icons-material/Person';
import OpenInNew from '@mui/icons-material/OpenInNew';
import Layout from '../components/Layout';
import { b2bApi, settingsApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { applyPhoneMask, isValidPhone, phoneFromApi, phoneToApiValue } from '../utils/phoneMask';
import { format, parseISO, addDays } from 'date-fns';
import type { B2BSchool, B2BSchoolContact, B2BSchoolPipelineStage } from '../types';
import { ALL_FUNNEL_STAGES, hasNoNextAction } from '../constants/b2bFunnel';

const PIPELINE_STAGES = ALL_FUNNEL_STAGES;

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
  district: '',
  phone_school: '',
  student_count: '' as number | '',
  friendship_degree: '',
  pipeline_stage: 'new' as B2BSchoolPipelineStage,
  next_step: '',
  next_step_date: '',
  manager_id: '' as number | '',
  meeting_scheduled_at: '',
  meeting_outcomes: '',
  walkthrough_scheduled_at: '',
};

export const B2BSchoolCreateContent: React.FC = () => {
  const [form, setForm] = useState({
    name: '',
    director: '',
    city: '',
    address: '',
    district: '',
    phone_school: '',
    student_count: '' as number | '',
    friendship_degree: '',
    pipeline_stage: 'new' as B2BSchoolPipelineStage,
    source: '',
    priority: '',
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
  const [contactForm, setContactForm] = useState({ full_name: '', position: '', phone: '', phone_extra: '' });
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<B2BSchoolContact | null>(null);
  const [launchingId, setLaunchingId] = useState<number | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importCity, setImportCity] = useState('');
  const [importLaunch, setImportLaunch] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const navigate = useNavigate();
  const [districtOptions, setDistrictOptions] = useState<string[]>([]);

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

  useEffect(() => {
    settingsApi
      .getB2BDistricts()
      .then((res) => setDistrictOptions(res.items || []))
      .catch(() => {});
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
        district: full.district ?? '',
        phone_school: full.phone_school ?? '',
        student_count: full.student_count ?? '',
        friendship_degree: full.friendship_degree ?? '',
        pipeline_stage: (full.pipeline_stage as B2BSchoolPipelineStage) ?? 'new',
        next_step: full.next_step ?? '',
        next_step_date: nextDate,
        manager_id: full.manager_id ?? '',
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

  const refreshEditingSchool = useCallback(async () => {
    if (!editingSchool) return;
    try {
      const updated = await b2bApi.getSchool(editingSchool.id);
      setEditingSchool(updated);
    } catch (_) {}
  }, [editingSchool?.id]);

  const openAddContact = () => {
    setEditingContact(null);
    setContactForm({ full_name: '', position: '', phone: '', phone_extra: '' });
    setContactDialogOpen(true);
  };

  const openEditContact = (c: B2BSchoolContact) => {
    setEditingContact(c);
    setContactForm({
      full_name: c.full_name,
      position: c.position ?? '',
      phone: phoneFromApi(c.phone),
      phone_extra: phoneFromApi(c.phone_extra),
    });
    setContactDialogOpen(true);
  };

  const handleSaveContact = async () => {
    if (!editingSchool || !contactForm.full_name.trim()) return;
    const phoneDigits = phoneToApiValue(contactForm.phone);
    if (!isValidPhone(contactForm.phone)) {
      setError('Введите корректный номер телефона: 10 цифр в формате +7(XXX) XXX-XX-XX');
      return;
    }
    setError(null);
    try {
      const payload = {
        full_name: contactForm.full_name.trim(),
        position: contactForm.position.trim() || undefined,
        phone: phoneDigits,
        phone_extra: contactForm.phone_extra.trim() && isValidPhone(contactForm.phone_extra)
          ? phoneToApiValue(contactForm.phone_extra)
          : undefined,
      };
      if (editingContact) {
        await b2bApi.updateContact(editingSchool.id, editingContact.id, payload);
      } else {
        await b2bApi.createContact(editingSchool.id, {
          ...payload,
          phone_extra: payload.phone_extra ?? undefined,
        });
      }
      setContactDialogOpen(false);
      await refreshEditingSchool();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить контакт'));
    }
  };

  const handleDeleteContact = async (c: B2BSchoolContact) => {
    if (!editingSchool || !window.confirm(`Удалить контакт ${c.full_name}?`)) return;
    try {
      await b2bApi.deleteContact(editingSchool.id, c.id);
      await refreshEditingSchool();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось удалить контакт'));
    }
  };

  const handleSaveEdit = async () => {
    if (!editingSchool) return;
    setError(null);
    setSavingEdit(true);
    try {
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
        district: editForm.district.trim() || undefined,
        phone_school: editForm.phone_school.trim() || null,
        student_count: editForm.student_count === '' ? undefined : Number(editForm.student_count),
        friendship_degree: editForm.friendship_degree || undefined,
        pipeline_stage: editForm.pipeline_stage,
        next_step: editForm.next_step.trim() || null,
        next_step_date: editForm.next_step_date.trim() ? editForm.next_step_date : null,
        manager_id: editForm.manager_id === '' ? null : Number(editForm.manager_id),
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
    let list = schools;
    if (filterCity) list = list.filter((s) => s.city === filterCity);
    return list;
  }, [schools, filterCity]);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    if (!form.name.trim()) {
      setError('Укажите название школы');
      return;
    }
    if (form.phone_school.trim()) {
      const digits = form.phone_school.replace(/\D/g, '');
      if (digits.length < 5) {
        setError('Введите городской телефон школы (минимум 5 цифр)');
        return;
      }
    }
    setSaving(true);
    try {
      await b2bApi.createSchool({
        name: form.name.trim(),
        director: form.director.trim() || undefined,
        city: form.city.trim() || undefined,
        address: form.address.trim() || undefined,
        district: form.district.trim() || undefined,
        student_count: form.student_count === '' ? undefined : Number(form.student_count),
        friendship_degree: form.friendship_degree || undefined,
        pipeline_stage: form.pipeline_stage,
        phone_school: form.phone_school.trim() || undefined,
        source: form.source.trim() || undefined,
        priority: form.priority.trim() || undefined,
      });
      setSuccess('Школа успешно создана');
      setForm({
        name: '',
        director: '',
        city: '',
        address: '',
        district: '',
        phone_school: '',
        student_count: '',
        friendship_degree: '',
        pipeline_stage: 'new',
        source: '',
        priority: '',
      });
      await loadSchools();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить школу'));
    } finally {
      setSaving(false);
    }
  };

  const NEXT_STEP_LAUNCH = 'Найти контакты (директор/завуч/информатика)';

  const handleSaveAndLaunch = async () => {
    setError(null);
    setSuccess(null);
    if (!form.name.trim()) {
      setError('Укажите название школы');
      return;
    }
    setSaving(true);
    try {
      const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
      await b2bApi.createSchool({
        name: form.name.trim(),
        director: form.director.trim() || undefined,
        city: form.city.trim() || undefined,
        address: form.address.trim() || undefined,
        district: form.district.trim() || undefined,
        student_count: form.student_count === '' ? undefined : Number(form.student_count),
        friendship_degree: form.friendship_degree || undefined,
        pipeline_stage: 'find_contacts',
        next_step: NEXT_STEP_LAUNCH,
        next_step_date: tomorrow,
        phone_school: form.phone_school.trim() || undefined,
        source: form.source.trim() || undefined,
        priority: form.priority.trim() || undefined,
      });
      setSuccess('Школа создана и запущена в работу');
      setForm({
        name: '',
        director: '',
        city: '',
        address: '',
        district: '',
        phone_school: '',
        student_count: '',
        friendship_degree: '',
        pipeline_stage: 'new',
        source: '',
        priority: '',
      });
      await loadSchools();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось создать школу'));
    } finally {
      setSaving(false);
    }
  };

  const handleLaunch = async (e: React.MouseEvent, school: B2BSchool) => {
    e.stopPropagation();
    setLaunchingId(school.id);
    setError(null);
    try {
      const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
      await b2bApi.updateSchool(school.id, {
        pipeline_stage: 'find_contacts',
        next_step: NEXT_STEP_LAUNCH,
        next_step_date: tomorrow,
      });
      setSuccess(`Школа «${school.name}» запущена в работу`);
      await loadSchools();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось запустить в работу'));
    } finally {
      setLaunchingId(null);
    }
  };

  const handleOpenCard = (e: React.MouseEvent, school: B2BSchool) => {
    e.stopPropagation();
    navigate(`/b2b-schools?open=${school.id}`);
  };

  const handleDelete = async (e: React.MouseEvent, school: B2BSchool) => {
    e.stopPropagation();
    if (!window.confirm(`Удалить школу «${school.name}»?`)) return;
    setError(null);
    try {
      await b2bApi.deleteSchool(school.id);
      setSuccess('Школа удалена');
      await loadSchools();
      if (editingSchool?.id === school.id) {
        setCardDialogOpen(false);
        setEditingSchool(null);
      }
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось удалить школу'));
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      setError('Выберите файл для импорта');
      return;
    }
    setError(null);
    setImportResult(null);
    setImporting(true);
    try {
      const res = await b2bApi.importSchools({
        file: importFile,
        city: importCity.trim() || undefined,
        launch_in_work: importLaunch,
      });
      setImportResult(res);
      if (res.created > 0) {
        setSuccess(`Импорт: создано ${res.created}, пропущено ${res.skipped}`);
        await loadSchools();
      }
      setImportFile(null);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось импортировать файл'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">Новая B2B школа</Typography>
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
            <FormControl fullWidth>
              <InputLabel>Район</InputLabel>
              <Select
                value={form.district}
                label="Район"
                onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
              >
                <MenuItem value="">
                  <em>Не указан</em>
                </MenuItem>
                {districtOptions.map((d) => (
                  <MenuItem key={d} value={d}>
                    {d}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Телефон школы (городской)"
              value={form.phone_school}
              onChange={(e) => setForm((f) => ({ ...f, phone_school: e.target.value }))}
              fullWidth
              placeholder="Например: (3952) 12-34-56"
            />
            {/* Поле \"Источник\" скрыто по ТЗ, но значение можно заполнить позже из карточки школы */}
            <FormControl fullWidth>
              <InputLabel>Приоритет</InputLabel>
              <Select
                value={form.priority}
                label="Приоритет"
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              >
                <MenuItem value="">
                  <em>Не задан</em>
                </MenuItem>
                <MenuItem value="high">Высокий</MenuItem>
                <MenuItem value="medium">Средний</MenuItem>
                <MenuItem value="low">Низкий</MenuItem>
              </Select>
            </FormControl>
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

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => void handleSave()}
                disabled={saving}
              >
                Создать школу
              </Button>
              <Button
                variant="contained"
                color="primary"
                startIcon={<PlayArrow />}
                onClick={() => void handleSaveAndLaunch()}
                disabled={saving}
              >
                Создать и запустить в работу
              </Button>
            </Box>
          </Stack>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Импорт из файла</Typography>
          <Stack direction="row" alignItems="center" flexWrap="wrap" spacing={2} sx={{ mb: 1 }}>
            <Button variant="outlined" component="label">
              Выбрать Excel/CSV
              <input
                type="file"
                hidden
                accept=".xlsx,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setImportFile(f || null);
                  setImportResult(null);
                }}
              />
            </Button>
            {importFile && (
              <Typography variant="body2" color="text.secondary">
                {importFile.name}
              </Typography>
            )}
            <TextField
              size="small"
              label="Город (по умолчанию)"
              value={importCity}
              onChange={(e) => setImportCity(e.target.value)}
              sx={{ minWidth: 180 }}
              placeholder="для всех строк"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={importLaunch}
                  onChange={(e) => setImportLaunch(e.target.checked)}
                />
              }
              label="Запустить в работу"
            />
            <Button
              variant="contained"
              onClick={() => void handleImport()}
              disabled={importing || !importFile}
            >
              {importing ? 'Загрузка…' : 'Загрузить'}
            </Button>
          </Stack>
          <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
            Формат: .xlsx или .csv. Первая строка — заголовки. Колонки: название (обязательно), директор, город, адрес, учеников.
          </Typography>
          {importResult && (
            <Alert severity={importResult.errors.length > 0 ? 'warning' : 'success'} sx={{ mt: 1 }}>
              Создано: {importResult.created}, пропущено: {importResult.skipped}
              {importResult.errors.length > 0 && (
                <Box component="ul" sx={{ m: 0, pl: 2, mt: 0.5 }}>
                  {importResult.errors.map((msg, idx) => (
                    <li key={idx}>{msg}</li>
                  ))}
                </Box>
              )}
            </Alert>
          )}
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
                    <TableCell align="center">Контакты</TableCell>
                    <TableCell>Ответственный</TableCell>
                    <TableCell>След. действие</TableCell>
                    <TableCell>Стадия</TableCell>
                    <TableCell align="center" width={140}>Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSchools.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} align="center" sx={{ py: 3 }} color="text.secondary">
                        {schools.length === 0 ? 'Нет ни одной школы.' : 'Нет школ в выбранном городе.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSchools.map((school) => (
                      <TableRow
                        key={school.id}
                        hover
                        sx={{ cursor: 'pointer', ...(hasNoNextAction(school) ? { bgcolor: 'grey.100' } : {}) }}
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
                        <TableCell align="center">{school.contacts?.length ?? 0}</TableCell>
                        <TableCell>{school.manager_full_name || '—'}</TableCell>
                        <TableCell sx={{ maxWidth: 180 }}>
                          {hasNoNextAction(school) ? (
                            <Typography variant="body2" color="warning.main">
                              Не задано
                            </Typography>
                          ) : (
                            <Typography variant="body2">
                              {school.next_step}
                              {school.next_step_date ? ` (${format(parseISO(school.next_step_date), 'dd.MM.yyyy')})` : ''}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {PIPELINE_STAGES.find((s) => s.value === school.pipeline_stage)?.label ?? school.pipeline_stage}
                        </TableCell>
                        <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                          <Stack direction="row" spacing={0.5} justifyContent="center" flexWrap="wrap">
                            <Tooltip title="Запустить в работу">
                              <IconButton
                                size="small"
                                color="primary"
                                disabled={launchingId === school.id}
                                onClick={(e) => void handleLaunch(e, school)}
                              >
                                <PlayArrow fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Назначить ответственного">
                              <IconButton size="small" onClick={(e) => { e.stopPropagation(); openEdit(school); }}>
                                <Person fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Открыть карточку">
                              <IconButton size="small" onClick={(e) => handleOpenCard(e, school)}>
                                <OpenInNew fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Удалить">
                              <IconButton size="small" color="error" onClick={(e) => void handleDelete(e, school)}>
                                <Delete fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
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

                {editingSchool && (
                  <Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                      <Typography variant="subtitle2">Контакты</Typography>
                      <Button size="small" startIcon={<Add />} onClick={openAddContact}>
                        Добавить контакт
                      </Button>
                    </Stack>
                    <Stack spacing={1}>
                      {(editingSchool.contacts ?? []).map((c) => (
                        <Card key={c.id} variant="outlined" sx={{ p: 1.5 }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                            <Box>
                              <Typography variant="body2" fontWeight="medium">{c.full_name}</Typography>
                              <Typography variant="caption" color="text.secondary">{c.position || '—'}</Typography>
                              <Typography variant="caption" display="block">{c.phone}</Typography>
                              {c.phone_extra && (
                                <Typography variant="caption" display="block" color="text.secondary">Доп. тел.: {c.phone_extra}</Typography>
                              )}
                            </Box>
                            <Stack direction="row" spacing={0.25}>
                              <IconButton size="small" onClick={(e) => { e.stopPropagation(); openEditContact(c); }} aria-label="Редактировать контакт">
                                <Edit fontSize="small" />
                              </IconButton>
                              <IconButton size="small" onClick={(e) => { e.stopPropagation(); void handleDeleteContact(c); }} aria-label="Удалить контакт" color="error">
                                <Delete fontSize="small" />
                              </IconButton>
                            </Stack>
                          </Stack>
                        </Card>
                      ))}
                      {(!editingSchool.contacts || editingSchool.contacts.length === 0) && (
                        <Typography variant="caption" color="text.secondary">Нет контактов</Typography>
                      )}
                    </Stack>
                  </Box>
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

        <Dialog open={contactDialogOpen} onClose={() => setContactDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>{editingContact ? 'Редактировать контакт' : 'Добавить контакт'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="ФИО"
                value={contactForm.full_name}
                onChange={(e) => setContactForm((f) => ({ ...f, full_name: e.target.value }))}
                fullWidth
                required
              />
              <TextField
                label="Должность"
                value={contactForm.position}
                onChange={(e) => setContactForm((f) => ({ ...f, position: e.target.value }))}
                fullWidth
              />
              <TextField
                label="Контакт"
                value={contactForm.phone}
                onChange={(e) => setContactForm((f) => ({ ...f, phone: applyPhoneMask(e.target.value) }))}
                fullWidth
                required
                placeholder="+7(999) 123-45-67"
                error={contactForm.phone.length > 0 && !isValidPhone(contactForm.phone)}
                helperText={contactForm.phone.length > 0 && !isValidPhone(contactForm.phone) ? 'Введите 10 цифр номера' : ''}
              />
              <TextField
                label="Дополнительный контакт"
                value={contactForm.phone_extra}
                onChange={(e) => setContactForm((f) => ({ ...f, phone_extra: applyPhoneMask(e.target.value) }))}
                fullWidth
                placeholder="+7(999) 123-45-67"
                error={contactForm.phone_extra.length > 0 && !isValidPhone(contactForm.phone_extra)}
                helperText={contactForm.phone_extra.length > 0 && !isValidPhone(contactForm.phone_extra) ? 'Введите 10 цифр или оставьте пустым' : ''}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setContactDialogOpen(false)}>Отмена</Button>
            <Button
              variant="contained"
              onClick={() => void handleSaveContact()}
              disabled={!contactForm.full_name.trim() || !isValidPhone(contactForm.phone)}
            >
              Сохранить
            </Button>
          </DialogActions>
        </Dialog>
    </Box>
  );
};

const B2BSchoolCreatePage: React.FC = () => (
  <Layout>
    <B2BSchoolCreateContent />
  </Layout>
);

export default B2BSchoolCreatePage;

