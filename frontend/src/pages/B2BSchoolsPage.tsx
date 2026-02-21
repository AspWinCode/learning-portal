import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Edit from '@mui/icons-material/Edit';
import Delete from '@mui/icons-material/Delete';
import ViewModule from '@mui/icons-material/ViewModule';
import TableChart from '@mui/icons-material/TableChart';
import { format, isValid, parseISO } from 'date-fns';
import Layout from '../components/Layout';
import { b2bApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { B2BSchool, B2BSchoolPipelineStage, B2BSchoolContact, B2BProject } from '../types';
import { ALL_FUNNEL_STAGES, hasNoNextAction } from '../constants/b2bFunnel';

const PIPELINE_STAGES = ALL_FUNNEL_STAGES;

const FRIENDSHIP_DEGREES: { value: string; label: string }[] = [
  { value: 'unknown', label: 'Не знаем друг друга' },
  { value: 'indirect', label: 'Знаем косвенно' },
  { value: 'friends', label: 'Друзья' },
  { value: 'enemies', label: 'Враги' },
];

const B2BSchoolsPage: React.FC = () => {
  const [schools, setSchools] = useState<B2BSchool[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [projects, setProjects] = useState<B2BProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [managers, setManagers] = useState<{ id: number; full_name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<B2BSchool | null>(null);
  const [form, setForm] = useState({
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
  });
  const [contactForm, setContactForm] = useState({ full_name: '', position: '', phone: '', phone_extra: '' });
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<B2BSchoolContact | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({
    name: '',
    location: '',
    main_city: '',
    citiesText: '',
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const openIdHandled = useRef(false);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('kanban');
  const [draggingSchoolId, setDraggingSchoolId] = useState<number | null>(null);
  const [dropTargetStage, setDropTargetStage] = useState<string | null>(null);

  const loadSchools = useCallback(async (projectId?: number | null, city?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await b2bApi.listSchools({
        ...(projectId ? { project_id: projectId } : {}),
        ...(city ? { city } : {}),
      });
      setSchools(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить школы'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [pr, cityList, mgrList] = await Promise.all([
          b2bApi.listProjects(),
          b2bApi.listCities(),
          b2bApi.listManagers(),
        ]);
        setProjects(pr);
        setCities(cityList);
        setManagers(mgrList);
        if (pr.length) setSelectedProjectId(pr[0].id);
      } catch (err: any) {
        setError(extractApiError(err, 'Не удалось загрузить данные'));
      }
    })();
  }, []);

  useEffect(() => {
    loadSchools(selectedProjectId ?? undefined, selectedCity || undefined);
  }, [selectedCity, selectedProjectId, loadSchools]);

  const schoolsByStage = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    schools: schools.filter((s) => s.pipeline_stage === stage.value),
  }));

  const openCreate = () => {
    setEditingSchool(null);
    setForm({
      name: '',
      director: '',
      city: '',
      address: '',
      student_count: '',
      friendship_degree: '',
      pipeline_stage: 'new',
      next_step: '',
      next_step_date: '',
      manager_id: '',
      event_dates: '',
      meeting_scheduled_at: '',
      meeting_outcomes: '',
      walkthrough_scheduled_at: '',
    });
    setDialogOpen(true);
  };

  const openEdit = useCallback((school: B2BSchool) => {
    setEditingSchool(school);
    const meetingAt = school.meeting_scheduled_at
      ? format(parseISO(school.meeting_scheduled_at), "yyyy-MM-dd'T'HH:mm")
      : '';
    const walkAt = school.walkthrough_scheduled_at
      ? format(parseISO(school.walkthrough_scheduled_at), 'yyyy-MM-dd')
      : '';
    const nextDate = school.next_step_date ? format(parseISO(school.next_step_date), 'yyyy-MM-dd') : '';
    setForm({
      name: school.name,
      director: school.director ?? '',
      city: school.city ?? '',
      address: school.address ?? '',
      student_count: school.student_count ?? '',
      friendship_degree: school.friendship_degree ?? '',
      pipeline_stage: (school.pipeline_stage as B2BSchoolPipelineStage) ?? 'new',
      next_step: school.next_step ?? '',
      next_step_date: nextDate,
      manager_id: school.manager_id ?? '',
      event_dates: Array.isArray(school.event_dates) ? school.event_dates.join(', ') : '',
      meeting_scheduled_at: meetingAt,
      meeting_outcomes: school.meeting_outcomes ?? '',
      walkthrough_scheduled_at: walkAt,
    });
    setDialogOpen(true);
  }, []);

  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || openIdHandled.current || loading) return;
    const id = Number(openId);
    if (!Number.isFinite(id)) return;
    openIdHandled.current = true;
    const fromList = schools.find((s) => s.id === id);
    if (fromList) {
      openEdit(fromList);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      }, { replace: true });
      return;
    }
    b2bApi.getSchool(id).then((school) => {
      openEdit(school);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      }, { replace: true });
    }).catch(() => {
      openIdHandled.current = false;
    });
  }, [schools, loading, searchParams, openEdit, setSearchParams]);

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
      phone: c.phone,
      phone_extra: c.phone_extra ?? '',
    });
    setContactDialogOpen(true);
  };

  const handleSaveContact = async () => {
    if (!editingSchool || !contactForm.full_name.trim() || !contactForm.phone.trim()) return;
    try {
      if (editingContact) {
        await b2bApi.updateContact(editingSchool.id, editingContact.id, {
          full_name: contactForm.full_name.trim(),
          position: contactForm.position.trim() || undefined,
          phone: contactForm.phone.trim(),
          phone_extra: contactForm.phone_extra.trim() || undefined,
        });
      } else {
        await b2bApi.createContact(editingSchool.id, {
          full_name: contactForm.full_name.trim(),
          position: contactForm.position.trim() || undefined,
          phone: contactForm.phone.trim(),
          phone_extra: contactForm.phone_extra.trim() || undefined,
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

  const handleChangeProject = (projectId: number | null) => {
    setSelectedProjectId(projectId);
  };

  const openCreateProject = () => {
    setProjectForm({
      name: '',
      location: '',
      main_city: '',
      citiesText: '',
    });
    setProjectDialogOpen(true);
  };

  const handleSaveProject = async () => {
    if (!projectForm.name.trim()) {
      setError('Укажите название проекта');
      return;
    }
    const cities =
      projectForm.citiesText
        .split(/[,;]/)
        .map((c) => c.trim())
        .filter(Boolean) || [];
    try {
      const project = await b2bApi.createProject({
        name: projectForm.name.trim(),
        location: projectForm.location.trim() || undefined,
        main_city: projectForm.main_city.trim() || undefined,
        cities,
      });
      const nextProjects = [project, ...projects];
      setProjects(nextProjects);
      setProjectDialogOpen(false);
      await handleChangeProject(project.id);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить проект'));
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Укажите название школы');
      return;
    }
    const eventDates = form.event_dates
      ? form.event_dates.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      : undefined;
    const meetingAt =
      form.meeting_scheduled_at && form.pipeline_stage === 'meeting_scheduled'
        ? new Date(form.meeting_scheduled_at).toISOString()
        : null;
    const walkAt =
      form.walkthrough_scheduled_at && form.pipeline_stage === 'walkthrough_scheduled'
        ? new Date(form.walkthrough_scheduled_at + 'T12:00:00').toISOString()
        : null;
    const payload = {
      name: form.name.trim(),
      director: form.director.trim() || undefined,
      city: form.city.trim() || undefined,
      address: form.address.trim() || undefined,
      student_count: form.student_count === '' ? undefined : Number(form.student_count),
      friendship_degree: form.friendship_degree || undefined,
      pipeline_stage: form.pipeline_stage,
      next_step: form.next_step.trim() || null,
      next_step_date: form.next_step_date.trim() ? form.next_step_date : null,
      manager_id: form.manager_id === '' ? null : Number(form.manager_id),
      event_dates: eventDates,
      meeting_scheduled_at: meetingAt,
      meeting_outcomes: form.pipeline_stage === 'meeting_held' ? (form.meeting_outcomes.trim() || null) : undefined,
      walkthrough_scheduled_at: walkAt,
    };
    try {
      if (editingSchool) {
        await b2bApi.updateSchool(editingSchool.id, payload);
      } else {
        await b2bApi.createSchool(payload);
      }
      setDialogOpen(false);
      await loadSchools(selectedProjectId ?? undefined, selectedCity || undefined);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить школу'));
    }
  };

  const handleStageChange = async (school: B2BSchool, newStage: B2BSchoolPipelineStage) => {
    try {
      await b2bApi.updateSchool(school.id, { pipeline_stage: newStage });
      await loadSchools(selectedProjectId ?? undefined, selectedCity || undefined);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось изменить стадию'));
    }
  };

  const handleStageDrop = useCallback(
    async (targetStage: B2BSchoolPipelineStage, schoolIdStr: string) => {
      const schoolId = Number(schoolIdStr);
      if (!Number.isFinite(schoolId)) return;
      const school = schools.find((s) => s.id === schoolId);
      if (!school || school.pipeline_stage === targetStage) return;
      setDraggingSchoolId(null);
      setDropTargetStage(null);
      try {
        await b2bApi.updateSchool(schoolId, { pipeline_stage: targetStage });
        await loadSchools(selectedProjectId ?? undefined, selectedCity || undefined);
      } catch (err: any) {
        setError(extractApiError(err, 'Не удалось перенести школу'));
      }
    },
    [schools, selectedProjectId, selectedCity, loadSchools]
  );

  const schoolsForTable = useMemo(
    () => [...schools].sort((a, b) => {
      const stageOrder = PIPELINE_STAGES.map((s) => s.value);
      const ai = stageOrder.indexOf(a.pipeline_stage);
      const bi = stageOrder.indexOf(b.pipeline_stage);
      if (ai !== bi) return ai - bi;
      return (a.name || '').localeCompare(b.name || '');
    }),
    [schools]
  );

  const handleDelete = async (school: B2BSchool) => {
    if (!window.confirm(`Удалить школу «${school.name}»?`)) return;
    try {
      await b2bApi.deleteSchool(school.id);
      setDialogOpen(false);
      await loadSchools(selectedProjectId ?? undefined, selectedCity || undefined);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось удалить школу'));
    }
  };

  const formatEventDates = (dates: string[] | null | undefined) => {
    if (!dates?.length) return '—';
    return dates
      .map((d) => {
        try {
          const parsed = parseISO(d);
          return isValid(parsed) ? format(parsed, 'dd.MM.yyyy') : d;
        } catch {
          return d;
        }
      })
      .join(', ');
  };

  return (
    <Layout>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} spacing={2}>
        <Typography variant="h4">B2B (школы)</Typography>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Город</InputLabel>
            <Select
              label="Город"
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
            >
              <MenuItem value="">Все</MenuItem>
              {cities.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Проект</InputLabel>
            <Select
              label="Проект"
              value={selectedProjectId ?? ''}
              onChange={(e) =>
                handleChangeProject(e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <MenuItem value="">
                <em>Все школы</em>
              </MenuItem>
              {projects.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, v) => v != null && setViewMode(v)}
            size="small"
            sx={{ ml: 1 }}
          >
            <ToggleButton value="table" aria-label="Таблица">
              <TableChart sx={{ mr: 0.5 }} /> Таблица
            </ToggleButton>
            <ToggleButton value="kanban" aria-label="Канбан">
              <ViewModule sx={{ mr: 0.5 }} /> Канбан
            </ToggleButton>
          </ToggleButtonGroup>
          <Button variant="outlined" size="small" startIcon={<Add />} onClick={openCreateProject}>
            Создать проект
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
            Добавить школу
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Typography color="text.secondary">Загрузка…</Typography>
      ) : viewMode === 'table' ? (
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Директор</TableCell>
                <TableCell>Город</TableCell>
                <TableCell>Стадия</TableCell>
                <TableCell>След. действие</TableCell>
                <TableCell>Ответственный</TableCell>
                <TableCell align="right" width={100}>Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {schoolsForTable.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    Нет школ
                  </TableCell>
                </TableRow>
              ) : (
              schoolsForTable.map((school) => (
                <TableRow key={school.id} hover sx={{ cursor: 'pointer' }} onClick={() => openEdit(school)}>
                  <TableCell>{school.name}</TableCell>
                  <TableCell>{school.director || '—'}</TableCell>
                  <TableCell>{school.city || '—'}</TableCell>
                  <TableCell>
                    {PIPELINE_STAGES.find((s) => s.value === school.pipeline_stage)?.label ?? school.pipeline_stage}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 220 }}>
                    {hasNoNextAction(school) ? (
                      <Typography variant="body2" color="warning.main">Не задано</Typography>
                    ) : (
                      <Typography variant="body2">
                        {school.next_step}
                        {school.next_step_date ? ` (${format(parseISO(school.next_step_date), 'dd.MM.yyyy')})` : ''}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{school.manager_full_name || '—'}</TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <IconButton size="small" onClick={() => openEdit(school)} aria-label="Редактировать">
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(school)} aria-label="Удалить" color="error">
                      <Delete fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Box sx={{ overflowX: 'auto', pb: 2 }}>
          <Grid container spacing={2} sx={{ minWidth: 1400 }}>
            {schoolsByStage.map((col) => (
              <Grid item xs={12} sm={6} md={3} key={col.value} sx={{ minWidth: 280 }}>
                <Card
                  variant="outlined"
                  sx={{
                    height: '100%',
                    bgcolor: dropTargetStage === col.value ? 'action.selected' : 'grey.50',
                    transition: 'background-color 0.15s',
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDropTargetStage(col.value);
                  }}
                  onDragLeave={() => setDropTargetStage(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const schoolId = e.dataTransfer.getData('schoolId');
                    if (schoolId) void handleStageDrop(col.value as B2BSchoolPipelineStage, schoolId);
                    setDropTargetStage(null);
                  }}
                >
                  <CardContent sx={{ py: 1.5 }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      {col.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                      {col.schools.length} шт.
                    </Typography>
                    <Stack spacing={1}>
                      {col.schools.map((school) => (
                        <Card
                          key={school.id}
                          variant="outlined"
                          draggable
                          sx={{
                            bgcolor: 'background.paper',
                            opacity: draggingSchoolId === school.id ? 0.7 : 1,
                            cursor: 'grab',
                            '&:active': { cursor: 'grabbing' },
                          }}
                          onDragStart={(e) => {
                            setDraggingSchoolId(school.id);
                            e.dataTransfer.setData('schoolId', String(school.id));
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => setDraggingSchoolId(null)}
                        >
                          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                              <Typography variant="subtitle2">{school.name}</Typography>
                              <Stack direction="row" spacing={0.25}>
                                <IconButton size="small" onClick={() => openEdit(school)} aria-label="Редактировать">
                                  <Edit fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={() => handleDelete(school)} aria-label="Удалить" color="error">
                                  <Delete fontSize="small" />
                                </IconButton>
                              </Stack>
                            </Stack>
                            <Typography variant="caption" color="text.secondary" display="block">
                              Директор: {school.director || '—'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              Город: {school.city || '—'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block" noWrap title={school.address || ''}>
                              Адрес: {school.address || '—'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              Степень дружбы: {FRIENDSHIP_DEGREES.find((d) => d.value === school.friendship_degree)?.label ?? school.friendship_degree ?? '—'}
                            </Typography>
                            <Box sx={{ mt: 0.5, mb: 0.5 }}>
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 600 }}>
                                Следующее действие:
                              </Typography>
                              {hasNoNextAction(school) ? (
                                <>
                                  <Typography variant="caption" color="warning.main" display="block">
                                    Не задано
                                  </Typography>
                                  <Chip size="small" color="warning" label="Нет следующего действия" sx={{ mt: 0.25 }} />
                                </>
                              ) : (
                                <Typography variant="caption" display="block" sx={{ color: 'primary.main' }}>
                                  {school.next_step}
                                  {school.next_step_date ? ` · ${format(parseISO(school.next_step_date), 'dd.MM.yyyy')}` : ''}
                                </Typography>
                              )}
                              {school.manager_full_name && (
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                                  Менеджер: {school.manager_full_name}
                                </Typography>
                              )}
                            </Box>
                            <Typography variant="caption" color="text.secondary" display="block">
                              Контактов: {school.contacts?.length ?? 0}
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
                              <Chip size="small" label={`Учеников: ${school.student_count ?? '—'}`} />
                              <Chip size="small" label={`Лидов: ${school.leads_count ?? 0}`} />
                              <Chip size="small" color="success" label={`Конверсия: ${school.conversion_percent ?? 0}%`} />
                            </Stack>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                              Мероприятия: {formatEventDates(school.event_dates ?? undefined)}
                            </Typography>
                            <FormControl size="small" fullWidth sx={{ mt: 1 }}>
                              <InputLabel>Стадия</InputLabel>
                              <Select
                                value={school.pipeline_stage}
                                label="Стадия"
                                onChange={(e) => handleStageChange(school, e.target.value as B2BSchoolPipelineStage)}
                              >
                                {PIPELINE_STAGES.map((s) => (
                                  <MenuItem key={s.value} value={s.value}>
                                    {s.label}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingSchool ? 'Редактировать школу' : 'Новая школа'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
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
              onChange={(e) => setForm((f) => ({ ...f, student_count: e.target.value === '' ? '' : Number(e.target.value) }))}
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
                {FRIENDSHIP_DEGREES.map((d) => (
                  <MenuItem key={d.value} value={d.value}>
                    {d.label}
                  </MenuItem>
                ))}
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
                onChange={(e) => setForm((f) => ({ ...f, pipeline_stage: e.target.value as B2BSchoolPipelineStage }))}
              >
                {PIPELINE_STAGES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>
                    {s.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Следующий шаг"
              value={form.next_step}
              onChange={(e) => setForm((f) => ({ ...f, next_step: e.target.value }))}
              fullWidth
              placeholder="Что сделать дальше"
            />
            <TextField
              label="Дата следующего шага"
              type="date"
              value={form.next_step_date}
              onChange={(e) => setForm((f) => ({ ...f, next_step_date: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <FormControl fullWidth>
              <InputLabel>Ответственный (менеджер)</InputLabel>
              <Select
                value={form.manager_id === '' ? '' : form.manager_id}
                label="Ответственный (менеджер)"
                onChange={(e) => setForm((f) => ({ ...f, manager_id: e.target.value === '' ? '' : Number(e.target.value) }))}
              >
                <MenuItem value=""><em>Не назначен</em></MenuItem>
                {managers.map((m) => (
                  <MenuItem key={m.id} value={m.id}>{m.full_name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {form.pipeline_stage === 'meeting_scheduled' && (
              <TextField
                label="Когда назначена встреча"
                type="datetime-local"
                value={form.meeting_scheduled_at}
                onChange={(e) => setForm((f) => ({ ...f, meeting_scheduled_at: e.target.value }))}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            )}
            {form.pipeline_stage === 'meeting_held' && (
              <TextField
                label="Основные итоги встречи"
                value={form.meeting_outcomes}
                onChange={(e) => setForm((f) => ({ ...f, meeting_outcomes: e.target.value }))}
                fullWidth
                multiline
                rows={3}
              />
            )}
            {form.pipeline_stage === 'walkthrough_scheduled' && (
              <TextField
                label="Дата обхода"
                type="date"
                value={form.walkthrough_scheduled_at}
                onChange={(e) => setForm((f) => ({ ...f, walkthrough_scheduled_at: e.target.value }))}
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
                          <Typography variant="caption" color="text.secondary">{c.position || 'тАФ'}</Typography>
                          <Typography variant="caption" display="block">{c.phone}</Typography>
                          {c.phone_extra && (
                            <Typography variant="caption" display="block" color="text.secondary">Доп. тел.: {c.phone_extra}</Typography>
                          )}
                        </Box>
                        <Stack direction="row" spacing={0.25}>
                          <IconButton size="small" onClick={() => openEditContact(c)} aria-label="Редактировать контакт">
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleDeleteContact(c)} aria-label="Удалить контакт" color="error">
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
          {editingSchool && (
            <Button color="error" onClick={() => handleDelete(editingSchool)}>
              Удалить
            </Button>
          )}
          <Button variant="contained" onClick={() => void handleSave()}>
            Сохранить
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
              label="Номер телефона"
              value={contactForm.phone}
              onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Доп. номер телефона"
              value={contactForm.phone_extra}
              onChange={(e) => setContactForm((f) => ({ ...f, phone_extra: e.target.value }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContactDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleSaveContact()} disabled={!contactForm.full_name.trim() || !contactForm.phone.trim()}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={projectDialogOpen} onClose={() => setProjectDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Создать проект B2B</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Название проекта"
              value={projectForm.name}
              onChange={(e) => setProjectForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Локация (при необходимости)"
              value={projectForm.location}
              onChange={(e) => setProjectForm((f) => ({ ...f, location: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Город (основной)"
              value={projectForm.main_city}
              onChange={(e) => setProjectForm((f) => ({ ...f, main_city: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Какие города включить в проект"
              helperText="Перечислите через запятую (например: Иркутск, Ангарск)"
              value={projectForm.citiesText}
              onChange={(e) => setProjectForm((f) => ({ ...f, citiesText: e.target.value }))}
              fullWidth
              multiline
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProjectDialogOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={() => void handleSaveProject()}
            disabled={!projectForm.name.trim()}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default B2BSchoolsPage;
