import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tab,
  Tabs,
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
import { format, parseISO } from 'date-fns';
import { b2bApi, tasksApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { B2BSchool, B2BSchoolContact } from '../types';
import {
  MVP_STATUSES,
  pipelineStageToMVPStatus,
  MVP_STATUS_TO_PIPELINE_STAGE,
  type SchoolMVPStatus,
} from '../constants/b2bSchoolMVP';

export const B2BSchoolsMVPContent: React.FC = () => {
  const [schools, setSchools] = useState<B2BSchool[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [managers, setManagers] = useState<{ id: number; full_name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [selectedManagerId, setSelectedManagerId] = useState<number | ''>('');
  const [selectedStatus, setSelectedStatus] = useState<SchoolMVPStatus | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [cardOpen, setCardOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<B2BSchool | null>(null);
  const [cardTab, setCardTab] = useState(0);
  const [schoolInteractions, setSchoolInteractions] = useState<{ id: number; type: string; happened_at: string; summary: string | null; created_by_name: string | null }[]>([]);
  const [schoolEvents, setSchoolEvents] = useState<{ id: number; format: string; event_dates: string[] | null }[]>([]);
  const [allTasks, setAllTasks] = useState<{ id: number; title: string; status: string; assigned_to_id?: number | null }[]>([]);
  const [draggingSchoolId, setDraggingSchoolId] = useState<number | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<SchoolMVPStatus | null>(null);
  const [interactionForm, setInteractionForm] = useState({ type: 'call', happened_at: '', summary: '' });
  const [form, setForm] = useState({
    name: '',
    director: '',
    city: '',
    address: '',
    student_count: '' as number | '',
    manager_id: '' as number | '',
  });
  const searchParams = useSearchParams()[0];
  const setSearchParams = useSearchParams()[1];
  const openIdHandled = useRef(false);

  const loadSchools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await b2bApi.listSchools({
        city: selectedCity || undefined,
        manager_id: selectedManagerId === '' ? undefined : selectedManagerId,
        search: searchQuery.trim() || undefined,
      });
      setSchools(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить школы'));
    } finally {
      setLoading(false);
    }
  }, [selectedCity, selectedManagerId, searchQuery]);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  useEffect(() => {
    (async () => {
      try {
        const [cityList, mgrList] = await Promise.all([b2bApi.listCities(), b2bApi.listManagers()]);
        setCities(cityList);
        setManagers(mgrList);
      } catch (err: any) {
        setError(extractApiError(err, 'Не удалось загрузить справочники'));
      }
    })();
  }, []);

  const schoolsByStatus = useMemo(() => {
    const filtered = schools.filter((s) => {
      const status = pipelineStageToMVPStatus(s.pipeline_stage);
      if (selectedStatus && status !== selectedStatus) return false;
      return true;
    });
    return MVP_STATUSES.map((col) => ({
      ...col,
      schools: filtered.filter((s) => pipelineStageToMVPStatus(s.pipeline_stage) === col.value),
    }));
  }, [schools, selectedStatus]);

  const schoolsForTable = useMemo(
    () =>
      [...schools].filter((s) => {
        if (selectedStatus && pipelineStageToMVPStatus(s.pipeline_stage) !== selectedStatus) return false;
        return true;
      }),
    [schools, selectedStatus]
  );

  const openCard = useCallback(
    async (school: B2BSchool) => {
      setEditingSchool(school);
      setForm({
        name: school.name,
        director: school.director ?? '',
        city: school.city ?? '',
        address: school.address ?? '',
        student_count: school.student_count ?? '',
        manager_id: school.manager_id ?? '',
      });
      setCardTab(0);
      setCardOpen(true);
      try {
        const [interactions, events] = await Promise.all([
          b2bApi.listSchoolInteractions(school.id),
          b2bApi.listSchoolEvents(school.id),
        ]);
        setSchoolInteractions(interactions);
        setSchoolEvents(events);
      } catch (_) {
        setSchoolInteractions([]);
        setSchoolEvents([]);
      }
      try {
        const tasks = await tasksApi.listTasks('active');
        setAllTasks(tasks);
      } catch (_) {
        setAllTasks([]);
      }
    },
    []
  );

  const tasksForSchool = useMemo(() => {
    if (!editingSchool) return [];
    const name = (editingSchool.name || '').toLowerCase();
    return allTasks.filter((t) => t.status === 'active' && (t.title || '').toLowerCase().includes(name));
  }, [editingSchool, allTasks]);

  const handleSaveSchool = async () => {
    if (!editingSchool) return;
    setError(null);
    try {
      await b2bApi.updateSchool(editingSchool.id, {
        name: form.name.trim() || undefined,
        director: form.director.trim() || undefined,
        city: form.city.trim() || undefined,
        address: form.address.trim() || undefined,
        student_count: form.student_count === '' ? undefined : Number(form.student_count),
        manager_id: form.manager_id === '' ? null : form.manager_id,
      });
      setSuccess('Школа сохранена');
      const updated = await b2bApi.getSchool(editingSchool.id);
      setEditingSchool(updated);
      loadSchools();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить школу'));
    }
  };

  const handleDrop = useCallback(
    async (targetStatus: SchoolMVPStatus, schoolId: number) => {
      const school = schools.find((s) => s.id === schoolId);
      if (!school || pipelineStageToMVPStatus(school.pipeline_stage) === targetStatus) return;
      setDraggingSchoolId(null);
      setDropTargetStatus(null);
      try {
        await b2bApi.updateSchool(schoolId, {
          pipeline_stage: MVP_STATUS_TO_PIPELINE_STAGE[targetStatus] as import('../types').B2BSchoolPipelineStage,
        });
        await loadSchools();
      } catch (err: any) {
        setError(extractApiError(err, 'Не удалось перенести школу'));
      }
    },
    [schools, loadSchools]
  );

  const handleDelete = async (school: B2BSchool) => {
    if (!window.confirm(`Удалить школу «${school.name}»?`)) return;
    try {
      await b2bApi.deleteSchool(school.id);
      setCardOpen(false);
      await loadSchools();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось удалить школу'));
    }
  };

  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || openIdHandled.current || loading) return;
    const id = Number(openId);
    if (!Number.isFinite(id)) return;
    openIdHandled.current = true;
    const fromList = schools.find((s) => s.id === id);
    if (fromList) {
      openCard(fromList);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      }, { replace: true });
      return;
    }
    b2bApi.getSchool(id).then((s) => {
      openCard(s);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      }, { replace: true });
    }).catch(() => {
      openIdHandled.current = false;
    });
  }, [schools, loading, searchParams, openCard, setSearchParams]);

  const primaryPhone = editingSchool?.contacts?.length
    ? (editingSchool.contacts[0] as B2BSchoolContact).phone
    : '—';

  return (
    <>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} spacing={2} flexWrap="wrap">
        <Typography variant="h4">Работа со школами</Typography>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <TextField
            size="small"
            label="Поиск по названию"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Название или город"
            sx={{ minWidth: 200 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Город</InputLabel>
            <Select label="Город" value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)}>
              <MenuItem value="">Все</MenuItem>
              {cities.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Ответственный</InputLabel>
            <Select
              label="Ответственный"
              value={selectedManagerId === '' ? '' : selectedManagerId}
              onChange={(e) => setSelectedManagerId(e.target.value === '' ? '' : (e.target.value as number))}
            >
              <MenuItem value=""><em>Все</em></MenuItem>
              {managers.map((m) => (
                <MenuItem key={m.id} value={m.id}>{m.full_name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Статус</InputLabel>
            <Select
              label="Статус"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus((e.target.value as SchoolMVPStatus) || '')}
            >
              <MenuItem value="">Все</MenuItem>
              {MVP_STATUSES.map((s) => (
                <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, v) => v != null && setViewMode(v)}
            size="small"
          >
            <ToggleButton value="kanban" aria-label="Канбан"><ViewModule sx={{ mr: 0.5 }} /> Канбан</ToggleButton>
            <ToggleButton value="table" aria-label="Таблица"><TableChart sx={{ mr: 0.5 }} /> Таблица</ToggleButton>
          </ToggleButtonGroup>
          <Button variant="contained" startIcon={<Add />} onClick={() => { setEditingSchool(null); setForm({ name: '', director: '', city: '', address: '', student_count: '', manager_id: '' }); setCardTab(0); setCardOpen(true); setSchoolInteractions([]); setSchoolEvents([]); setAllTasks([]); }}>
            Добавить школу
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>
      )}

      {loading ? (
        <Typography color="text.secondary">Загрузка…</Typography>
      ) : viewMode === 'table' ? (
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Город</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Ответственный</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {schoolsForTable.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>Нет школ</TableCell>
                </TableRow>
              ) : (
                schoolsForTable.map((school) => (
                  <TableRow key={school.id} hover sx={{ cursor: 'pointer' }} onClick={() => openCard(school)}>
                    <TableCell>{school.name}</TableCell>
                    <TableCell>{school.city || '—'}</TableCell>
                    <TableCell>{MVP_STATUSES.find((s) => s.value === pipelineStageToMVPStatus(school.pipeline_stage))?.label ?? '—'}</TableCell>
                    <TableCell>{school.manager_full_name || '—'}</TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Button size="small" startIcon={<Edit />} onClick={() => openCard(school)}>Открыть</Button>
                      <Button size="small" color="error" startIcon={<Delete />} onClick={() => handleDelete(school)}>Удалить</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2, minHeight: 400 }}>
          {schoolsByStatus.map((col) => (
            <Card
              key={col.value}
              variant="outlined"
              sx={{
                minWidth: 280,
                flex: '1 1 0',
                bgcolor: dropTargetStatus === col.value ? 'action.selected' : 'grey.50',
                transition: 'background-color 0.15s',
              }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTargetStatus(col.value); }}
              onDragLeave={() => setDropTargetStatus(null)}
              onDrop={(e) => {
                e.preventDefault();
                const id = Number(e.dataTransfer.getData('schoolId'));
                if (Number.isFinite(id)) handleDrop(col.value, id);
                setDropTargetStatus(null);
              }}
            >
              <CardContent sx={{ py: 1.5 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>{col.label}</Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>{col.schools.length} шт.</Typography>
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
                      onDragStart={(e) => { setDraggingSchoolId(school.id); e.dataTransfer.setData('schoolId', String(school.id)); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragEnd={() => setDraggingSchoolId(null)}
                    >
                      <CardContent sx={{ p: 1.5 }} onClick={() => openCard(school)}>
                        <Typography variant="subtitle2">{school.name}</Typography>
                        <Typography variant="caption" color="text.secondary" display="block">Город: {school.city || '—'}</Typography>
                        <Typography variant="caption" color="text.secondary" display="block">Ответственный: {school.manager_full_name || '—'}</Typography>
                        <Stack direction="row" spacing={0.5} sx={{ mt: 1 }} onClick={(ev) => ev.stopPropagation()}>
                          <Button size="small" startIcon={<Edit />} onClick={() => openCard(school)}>Открыть</Button>
                          <Button size="small" color="error" startIcon={<Delete />} onClick={() => handleDelete(school)}>Удалить</Button>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <Dialog open={cardOpen} onClose={() => setCardOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingSchool ? `Школа: ${editingSchool.name}` : 'Новая школа'}</DialogTitle>
        <DialogContent>
          <Tabs value={cardTab} onChange={(_, v) => setCardTab(v)} sx={{ mb: 2 }}>
            <Tab label="Общая информация" />
            <Tab label="Активные задачи" />
            <Tab label="История взаимодействий" />
            <Tab label="Мероприятия" />
          </Tabs>

          {cardTab === 0 && (
            <Stack spacing={2}>
              <TextField label="Название" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} fullWidth required />
              <TextField label="Директор" value={form.director} onChange={(e) => setForm((f) => ({ ...f, director: e.target.value }))} fullWidth />
              <TextField label="Город" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} fullWidth />
              <TextField label="Адрес" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} fullWidth />
              <TextField label="Кол-во учеников" type="number" value={form.student_count} onChange={(e) => setForm((f) => ({ ...f, student_count: e.target.value === '' ? '' : Number(e.target.value) }))} fullWidth />
              <FormControl fullWidth>
                <InputLabel>Ответственный</InputLabel>
                <Select
                  label="Ответственный"
                  value={form.manager_id === '' ? '' : form.manager_id}
                  onChange={(e) => setForm((f) => ({ ...f, manager_id: e.target.value === '' ? '' : (e.target.value as number) }))}
                >
                  <MenuItem value=""><em>Не назначен</em></MenuItem>
                  {managers.map((m) => (
                    <MenuItem key={m.id} value={m.id}>{m.full_name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {editingSchool && (
                <Typography variant="body2" color="text.secondary">
                  Телефон (первый контакт): {primaryPhone}
                </Typography>
              )}
            </Stack>
          )}

          {cardTab === 1 && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Задачи, в названии которых упоминается школа (незакрытые).
              </Typography>
              {tasksForSchool.length === 0 ? (
                <Typography color="text.secondary">Нет активных задач по этой школе</Typography>
              ) : (
                <Stack spacing={0.5}>
                  {tasksForSchool.map((t) => (
                    <Typography key={t.id} variant="body2">{t.title}</Typography>
                  ))}
                </Stack>
              )}
              {editingSchool && (
                <Button
                  size="small"
                  startIcon={<Add />}
                  sx={{ mt: 2 }}
                  onClick={() => {
                    tasksApi.createTask({ title: editingSchool.name, assigned_to_id: editingSchool.manager_id ?? undefined }).then(() => {
                      setSuccess('Задача создана');
                      tasksApi.listTasks('active').then(setAllTasks);
                    }).catch((err: any) => setError(extractApiError(err, 'Не удалось создать задачу')));
                  }}
                >
                  Создать задачу по школе
                </Button>
              )}
            </Box>
          )}

          {cardTab === 2 && (
            <Box>
              {schoolInteractions.length === 0 ? (
                <Typography color="text.secondary">Нет взаимодействий</Typography>
              ) : (
                <Stack spacing={1} sx={{ mb: 2 }}>
                  {schoolInteractions.map((i) => (
                    <Typography key={i.id} variant="body2">
                      {i.type} — {format(parseISO(i.happened_at), 'dd.MM.yyyy HH:mm')} {i.created_by_name ? `(${i.created_by_name})` : ''}
                      {i.summary ? `: ${i.summary}` : ''}
                    </Typography>
                  ))}
                </Stack>
              )}
              {editingSchool && (
                <Stack spacing={1} sx={{ mt: 2 }}>
                  <Typography variant="subtitle2">Добавить взаимодействие</Typography>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Тип</InputLabel>
                    <Select
                      label="Тип"
                      value={interactionForm.type}
                      onChange={(e) => setInteractionForm((f) => ({ ...f, type: e.target.value }))}
                    >
                      <MenuItem value="call">Звонок</MenuItem>
                      <MenuItem value="letter">Письмо</MenuItem>
                      <MenuItem value="meeting">Встреча</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    label="Дата и время"
                    type="datetime-local"
                    size="small"
                    fullWidth
                    value={interactionForm.happened_at}
                    onChange={(e) => setInteractionForm((f) => ({ ...f, happened_at: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    label="Комментарий"
                    size="small"
                    fullWidth
                    multiline
                    value={interactionForm.summary}
                    onChange={(e) => setInteractionForm((f) => ({ ...f, summary: e.target.value }))}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={async () => {
                      if (!editingSchool || !interactionForm.happened_at) return;
                      try {
                        await b2bApi.createSchoolInteraction(editingSchool.id, {
                          type: interactionForm.type,
                          happened_at: new Date(interactionForm.happened_at).toISOString(),
                          summary: interactionForm.summary.trim() || undefined,
                        });
                        const list = await b2bApi.listSchoolInteractions(editingSchool.id);
                        setSchoolInteractions(list);
                        setInteractionForm({ type: 'call', happened_at: '', summary: '' });
                        setSuccess('Взаимодействие добавлено');
                      } catch (err: any) {
                        setError(extractApiError(err, 'Не удалось добавить взаимодействие'));
                      }
                    }}
                    disabled={!interactionForm.happened_at}
                  >
                    Добавить
                  </Button>
                </Stack>
              )}
            </Box>
          )}

          {cardTab === 3 && (
            <Box>
              {schoolEvents.length === 0 ? (
                <Typography color="text.secondary">Нет мероприятий</Typography>
              ) : (
                <Stack spacing={1}>
                  {schoolEvents.map((e) => (
                    <Typography key={e.id} variant="body2">
                      {e.format} — даты: {e.event_dates?.length ? e.event_dates.join(', ') : '—'}
                    </Typography>
                  ))}
                </Stack>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCardOpen(false)}>Закрыть</Button>
          {editingSchool && (
            <>
              <Button onClick={handleSaveSchool} variant="contained">Сохранить</Button>
              <Button color="error" onClick={() => editingSchool && handleDelete(editingSchool)}>Удалить школу</Button>
            </>
          )}
          {!editingSchool && (
            <Button
              variant="contained"
              onClick={async () => {
                try {
                  const created = await b2bApi.createSchool({
                    name: form.name.trim(),
                    director: form.director.trim() || undefined,
                    city: form.city.trim() || undefined,
                    address: form.address.trim() || undefined,
                    student_count: form.student_count === '' ? undefined : Number(form.student_count),
                    manager_id: form.manager_id === '' ? null : form.manager_id,
                  });
                  setSuccess('Школа создана');
                  setCardOpen(false);
                  await loadSchools();
                  openCard(created);
                } catch (err: any) {
                  setError(extractApiError(err, 'Не удалось создать школу'));
                }
              }}
            >
              Создать
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default B2BSchoolsMVPContent;
