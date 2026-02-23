import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  Link,
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
import { format, isValid, parseISO } from 'date-fns';
import Layout from '../components/Layout';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { EventItem, EventRegistration, Lead } from '../types';

const SalesEventsPage: React.FC = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | ''>('');
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<number | ''>('');
  const [registerNote, setRegisterNote] = useState('');
  const [selectedRegistrationIds, setSelectedRegistrationIds] = useState<number[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    starts_at: '',
    ends_at: '',
    location: '',
    capacity: '',
  });

  const loadEvents = useCallback(async () => {
    try {
      const data = await salesApi.listEvents('active');
      setEvents(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить мероприятия'));
    }
  }, []);

  const loadLeads = useCallback(async () => {
    try {
      const data = await salesApi.listLeads();
      setLeads(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить лиды'));
    }
  }, []);

  const loadRegistrations = useCallback(async (eventId: number) => {
    try {
      const data = await salesApi.listEventRegistrations(eventId);
      setRegistrations(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить регистрации'));
    }
  }, []);

  useEffect(() => {
    loadEvents();
    loadLeads();
  }, [loadEvents, loadLeads]);

  useEffect(() => {
    if (selectedEventId) {
      loadRegistrations(Number(selectedEventId));
    } else {
      setRegistrations([]);
    }
  }, [selectedEventId, loadRegistrations]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  const leadsMap = useMemo(() => {
    const map = new Map<number, Lead>();
    leads.forEach((lead) => map.set(lead.id, lead));
    return map;
  }, [leads]);

  /** Полное ФИО: родитель / ребёнок или contact_name */
  const leadDisplayName = (lead: Lead | null | undefined, fallbackId?: number): string => {
    if (!lead) return fallbackId != null ? `Лид #${fallbackId}` : '—';
    const name = [lead.parent_full_name || lead.contact_name, lead.child_full_name].filter(Boolean).join(' / ');
    return name || lead.phone || `Лид #${lead.id}`;
  };

  const conversion = useMemo(() => {
    const registered = registrations.filter((r) => r.status === 'registered');
    const hasTag = (note: string | null | undefined, tag: string) => (note || '').toLowerCase().includes(tag);
    const confirmed = registered.filter((r) => hasTag(r.note, '[confirmed]'));
    const came = registered.filter((r) => hasTag(r.note, '[came]'));
    const noShow = registered.filter((r) => hasTag(r.note, '[no-show]'));

    const getLead = (reg: EventRegistration) => reg.lead || leadsMap.get(reg.lead_id);
    const offer = registered.filter((r) => {
      const lead = getLead(r);
      return lead?.status === 'invoice_sent' || lead?.status === 'won';
    });
    const paid = registered.filter((r) => {
      const lead = getLead(r);
      return lead?.status === 'won';
    });
    return {
      registered: registered.length,
      confirmed: confirmed.length,
      came: came.length,
      noShow: noShow.length,
      offer: offer.length,
      paid: paid.length,
    };
  }, [registrations, leadsMap]);

  const percent = (part: number, total: number) => {
    if (!total) return 0;
    return Math.round((part / total) * 100);
  };

  const stageHealth = (pct: number): 'success' | 'warning' | 'error' => {
    if (pct >= 70) return 'success';
    if (pct >= 40) return 'warning';
    return 'error';
  };

  /** Status tag from note → Russian label. Backend prepends new tags, so the first tag is the latest. */
  const getStatusLabel = (reg: EventRegistration): string => {
    if (reg.status === 'cancelled') return 'Отменён';
    const note = (reg.note || '').trim();
    const matches = [...note.matchAll(/\[([^\]]+)\]/g)];
    const firstTag = matches.length ? matches[0][1].toLowerCase() : '';
    if (firstTag === 'came') return 'Пришли';
    if (firstTag === 'no-show') return 'Не явились';
    if (firstTag === 'confirmed') return 'Подтвердили';
    return 'Записан';
  };

  const pConfirm = percent(conversion.confirmed, conversion.registered);
  const pCame = percent(conversion.came, conversion.confirmed || conversion.registered);
  const pOffer = percent(conversion.offer, conversion.came || conversion.registered);
  const pPaid = percent(conversion.paid, conversion.offer || conversion.came || conversion.registered);

  const weakestStage = useMemo(() => {
    const stages = [
      { key: 'confirm', label: 'Подтверждение от регистрации', value: pConfirm, hint: 'усилить напоминания и скрипт первого контакта' },
      { key: 'came', label: 'Явка от подтвержденных', value: pCame, hint: 'добавить напоминания за 24ч/2ч и контроль ответа' },
      { key: 'offer', label: 'Оффер от пришедших', value: pOffer, hint: 'фиксировать оффер сразу после мероприятия' },
      { key: 'paid', label: 'Оплата от оффера', value: pPaid, hint: 'усилить дожим и follow-up в первые 24 часа' },
    ];
    return stages.sort((a, b) => a.value - b.value)[0];
  }, [pCame, pConfirm, pOffer, pPaid]);

  const slotsUsed = useMemo(
    () => registrations.filter((r) => r.status === 'registered').length,
    [registrations]
  );
  const slotsLeft = useMemo(() => {
    if (!selectedEvent || selectedEvent.capacity === null || selectedEvent.capacity === undefined) return null;
    return Math.max(selectedEvent.capacity - slotsUsed, 0);
  }, [selectedEvent, slotsUsed]);
  const isEventFull = useMemo(
    () => slotsLeft !== null && slotsLeft <= 0,
    [slotsLeft]
  );

  const handleCreateEvent = async () => {
    if (!eventForm.title.trim() || !eventForm.starts_at) {
      setError('Заполните название и дату начала');
      return;
    }
    try {
      await salesApi.createEvent({
        title: eventForm.title.trim(),
        description: eventForm.description.trim() || undefined,
        starts_at: new Date(eventForm.starts_at).toISOString(),
        ends_at: eventForm.ends_at ? new Date(eventForm.ends_at).toISOString() : undefined,
        location: eventForm.location.trim() || undefined,
        capacity: eventForm.capacity ? Number(eventForm.capacity) : undefined,
      });
      setCreateOpen(false);
      setEventForm({ title: '', description: '', starts_at: '', ends_at: '', location: '', capacity: '' });
      await loadEvents();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось создать мероприятие'));
    }
  };

  const handleRegisterLead = async () => {
    if (!selectedEventId || !selectedLeadId) {
      setError('Выберите мероприятие и лида');
      return;
    }
    try {
      await salesApi.registerLeadToEvent(Number(selectedEventId), {
        lead_id: Number(selectedLeadId),
        note: registerNote.trim() || undefined,
      });
      setRegisterOpen(false);
      setSelectedLeadId('');
      setRegisterNote('');
      await loadRegistrations(Number(selectedEventId));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось зарегистрировать лида'));
    }
  };

  const handleCancelRegistration = async (reg: EventRegistration) => {
    if (!selectedEventId) return;
    try {
      await salesApi.cancelEventRegistration(Number(selectedEventId), reg.id);
      await loadRegistrations(Number(selectedEventId));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось отменить регистрацию'));
    }
  };

  /** Как на бэкенде: новый тег добавляется в начало заметки (для оптимистичного обновления) */
  const prependNoteTag = (note: string | null | undefined, tag: string): string => {
    const s = (note || '').trim();
    if (s.toLowerCase().includes(tag.toLowerCase())) return s;
    return `${tag} ${s}`.trim();
  };

  const handleConfirmRegistration = async (reg: EventRegistration) => {
    if (!selectedEventId) return;
    const eventId = Number(selectedEventId);
    const prevRegistrations = registrations;
    const optimisticNote = prependNoteTag(reg.note, '[confirmed]');
    setRegistrations((prev) =>
      prev.map((r) => (r.id === reg.id ? { ...r, note: optimisticNote } : r))
    );
    try {
      const updated = await salesApi.confirmEventRegistration(eventId, reg.id);
      const note = updated?.note ?? optimisticNote;
      setRegistrations((prev) => prev.map((r) => (r.id === reg.id ? { ...r, note } : r)));
    } catch (err: any) {
      setRegistrations(prevRegistrations);
      setError(extractApiError(err, 'Не удалось подтвердить участие'));
    }
  };

  const handleMarkCame = async (reg: EventRegistration) => {
    if (!selectedEventId) return;
    const eventId = Number(selectedEventId);
    const prevRegistrations = registrations;
    const optimisticNote = prependNoteTag(reg.note, '[came]');
    setRegistrations((prev) =>
      prev.map((r) => (r.id === reg.id ? { ...r, note: optimisticNote } : r))
    );
    try {
      const updated = await salesApi.markEventRegistrationCame(eventId, reg.id);
      const note = updated?.note ?? optimisticNote;
      setRegistrations((prev) => prev.map((r) => (r.id === reg.id ? { ...r, note } : r)));
    } catch (err: any) {
      setRegistrations(prevRegistrations);
      setError(extractApiError(err, 'Не удалось отметить "пришел"'));
    }
  };

  const handleMarkNoShow = async (reg: EventRegistration) => {
    if (!selectedEventId) return;
    const eventId = Number(selectedEventId);
    const prevRegistrations = registrations;
    const optimisticNote = prependNoteTag(reg.note, '[no-show]');
    setRegistrations((prev) =>
      prev.map((r) => (r.id === reg.id ? { ...r, note: optimisticNote } : r))
    );
    try {
      const updated = await salesApi.markEventRegistrationNoShow(eventId, reg.id);
      const note = updated?.note ?? optimisticNote;
      setRegistrations((prev) => prev.map((r) => (r.id === reg.id ? { ...r, note } : r)));
    } catch (err: any) {
      setRegistrations(prevRegistrations);
      setError(extractApiError(err, 'Не удалось отметить «не явились»'));
    }
  };

  useEffect(() => {
    const allowed = new Set(
      registrations
        .filter((r) => r.status === 'registered')
        .map((r) => r.id)
    );
    setSelectedRegistrationIds((prev) => prev.filter((id) => allowed.has(id)));
  }, [registrations]);

  const registeredRows = useMemo(
    () => registrations.filter((r) => r.status === 'registered'),
    [registrations]
  );

  const allRegisteredSelected = useMemo(() => (
    registeredRows.length > 0 && registeredRows.every((r) => selectedRegistrationIds.includes(r.id))
  ), [registeredRows, selectedRegistrationIds]);

  const toggleRowSelection = (regId: number) => {
    setSelectedRegistrationIds((prev) => (
      prev.includes(regId) ? prev.filter((id) => id !== regId) : [...prev, regId]
    ));
  };

  const toggleSelectAllRegistered = () => {
    if (allRegisteredSelected) {
      setSelectedRegistrationIds([]);
      return;
    }
    setSelectedRegistrationIds(registeredRows.map((r) => r.id));
  };

  const runBulkAction = async (action: 'confirm' | 'came' | 'no-show' | 'cancel') => {
    if (!selectedEventId || selectedRegistrationIds.length === 0 || bulkBusy) return;
    const eventId = Number(selectedEventId);
    const ids = new Set(selectedRegistrationIds);
    setBulkBusy(true);
    setSuccessMessage(null);
    try {
      const targetRows = registrations.filter((r) => ids.has(r.id));
      const jobs = targetRows.map((reg) => {
        if (action === 'confirm') return salesApi.confirmEventRegistration(eventId, reg.id);
        if (action === 'came') return salesApi.markEventRegistrationCame(eventId, reg.id);
        if (action === 'no-show') return salesApi.markEventRegistrationNoShow(eventId, reg.id);
        return salesApi.cancelEventRegistration(eventId, reg.id);
      });
      const results = await Promise.allSettled(jobs);
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - ok;
      const tag =
        action === 'confirm' ? '[confirmed]' : action === 'came' ? '[came]' : action === 'no-show' ? '[no-show]' : null;
      if (tag && ok > 0) {
        setRegistrations((prev) =>
          prev.map((r) => (ids.has(r.id) ? { ...r, note: prependNoteTag(r.note, tag) } : r))
        );
      }
      setSuccessMessage(
        failed > 0
          ? `Массовое действие выполнено частично: успешно ${ok}, с ошибкой ${failed}`
          : `Массовое действие выполнено: ${ok}`
      );
      if (failed > 0) {
        setError(`Не все действия выполнены: ${failed} ошибок`);
      }
      setSelectedRegistrationIds([]);
      await loadRegistrations(eventId);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось выполнить массовое действие'));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <Layout>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">Мероприятия</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => setRegisterOpen(true)} disabled={!selectedEventId || isEventFull}>
            Зарегистрировать лида
          </Button>
          <Button variant="contained" onClick={() => setCreateOpen(true)}>
            Новое мероприятие
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Список мероприятий</Typography>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel id="event-select">Выберите мероприятие</InputLabel>
              <Select
                labelId="event-select"
                label="Выберите мероприятие"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value as number)}
              >
                {events.map((event) => (
                  <MenuItem key={event.id} value={event.id}>
                    {event.title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {selectedEvent && (
              <Box>
                <Typography variant="subtitle2">{selectedEvent.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedEvent.location || 'Локация не указана'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {(() => {
                    const d = parseISO(selectedEvent.starts_at);
                    return isValid(d) ? format(d, 'dd.MM.yyyy HH:mm') : selectedEvent.starts_at;
                  })()}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Слоты: {selectedEvent.capacity ?? 'без лимита'}
                  {selectedEvent.capacity !== null && selectedEvent.capacity !== undefined
                    ? ` • занято ${slotsUsed}, осталось ${slotsLeft}`
                    : ''}
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Регистрации</Typography>
            <Grid container spacing={1} sx={{ mb: 1.5 }}>
              <Grid item xs={6} md={4}>
                <Card variant="outlined"><CardContent><Typography variant="caption">Зарегистрировано</Typography><Typography variant="h6">{conversion.registered}</Typography></CardContent></Card>
              </Grid>
              <Grid item xs={6} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption">Подтверждено</Typography>
                    <Typography variant="h6">{conversion.confirmed}</Typography>
                    <Chip size="small" color={stageHealth(pConfirm)} label={`${pConfirm}% от регистрации`} />
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption">Пришло</Typography>
                    <Typography variant="h6">{conversion.came}</Typography>
                    <Chip size="small" color={stageHealth(pCame)} label={`${pCame}% к подтвержденным`} />
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption">Не явились</Typography>
                    <Typography variant="h6">{conversion.noShow}</Typography>
                    <Chip
                      size="small"
                      color={conversion.noShow > 0 && percent(conversion.noShow, conversion.registered) > 30 ? 'error' : 'success'}
                      label={`${percent(conversion.noShow, conversion.registered)}% от регистрации`}
                    />
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption">Оффер</Typography>
                    <Typography variant="h6">{conversion.offer}</Typography>
                    <Chip size="small" color={stageHealth(pOffer)} label={`${pOffer}% от пришедших`} />
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="caption">Оплата</Typography>
                    <Typography variant="h6">{conversion.paid}</Typography>
                    <Chip size="small" color={stageHealth(pPaid)} label={`${pPaid}% от оффера`} />
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
            <Alert
              severity={weakestStage.value < 40 ? 'warning' : 'info'}
              sx={{ mb: 1.5 }}
            >
              Узкое место: <strong>{weakestStage.label}</strong> ({weakestStage.value}%).
              {' '}Рекомендация: {weakestStage.hint}.
            </Alert>
            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap">
              <Button
                size="small"
                variant="outlined"
                onClick={() => runBulkAction('confirm')}
                disabled={selectedRegistrationIds.length === 0 || bulkBusy}
              >
                Подтвердить ({selectedRegistrationIds.length})
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => runBulkAction('came')}
                disabled={selectedRegistrationIds.length === 0 || bulkBusy}
              >
                Пришел ({selectedRegistrationIds.length})
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="warning"
                onClick={() => runBulkAction('no-show')}
                disabled={selectedRegistrationIds.length === 0 || bulkBusy}
              >
                Не явились ({selectedRegistrationIds.length})
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                onClick={() => runBulkAction('cancel')}
                disabled={selectedRegistrationIds.length === 0 || bulkBusy}
              >
                Отменить ({selectedRegistrationIds.length})
              </Button>
            </Stack>
            <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 860 }}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={allRegisteredSelected}
                      indeterminate={selectedRegistrationIds.length > 0 && !allRegisteredSelected}
                      onChange={toggleSelectAllRegistered}
                      inputProps={{ 'aria-label': 'Выбрать все регистрации' }}
                    />
                  </TableCell>
                  <TableCell>Лид</TableCell>
                  <TableCell>Контакт</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell align="right" sx={{ minWidth: 320, whiteSpace: 'nowrap' }}>Действия</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {registrations.map((reg) => (
                  <TableRow key={reg.id}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedRegistrationIds.includes(reg.id)}
                        onChange={() => toggleRowSelection(reg.id)}
                        disabled={reg.status !== 'registered'}
                        inputProps={{ 'aria-label': `Выбрать регистрацию ${reg.id}` }}
                      />
                    </TableCell>
                    <TableCell>
                      <Link
                        component="button"
                        variant="body2"
                        onClick={() => navigate(`/sales/leads?detail=${reg.lead_id}`)}
                        sx={{ textAlign: 'left', cursor: 'pointer' }}
                      >
                        {leadDisplayName(reg.lead, reg.lead_id)}
                      </Link>
                    </TableCell>
                    <TableCell>{reg.lead?.phone ?? '—'}</TableCell>
                    <TableCell>{getStatusLabel(reg)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {reg.status === 'registered' && (
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Button size="small" sx={{ whiteSpace: 'nowrap' }} onClick={() => handleConfirmRegistration(reg)}>
                            Подтвердить
                          </Button>
                          <Button size="small" sx={{ whiteSpace: 'nowrap' }} onClick={() => handleMarkCame(reg)}>
                            Пришел
                          </Button>
                          <Button size="small" color="warning" sx={{ whiteSpace: 'nowrap' }} onClick={() => handleMarkNoShow(reg)}>
                            Не явились
                          </Button>
                          <Button size="small" color="error" sx={{ whiteSpace: 'nowrap' }} onClick={() => handleCancelRegistration(reg)}>
                            Отменить
                          </Button>
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {registrations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography color="text.secondary">Регистраций пока нет</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Новое мероприятие</DialogTitle>
        <DialogContent>
          <TextField
            label="Название"
            fullWidth
            required
            sx={{ mt: 1 }}
            value={eventForm.title}
            onChange={(e) => setEventForm((s) => ({ ...s, title: e.target.value }))}
          />
          <TextField
            label="Описание"
            fullWidth
            multiline
            minRows={2}
            sx={{ mt: 2 }}
            value={eventForm.description}
            onChange={(e) => setEventForm((s) => ({ ...s, description: e.target.value }))}
          />
          <TextField
            label="Начало"
            type="datetime-local"
            fullWidth
            required
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 2 }}
            value={eventForm.starts_at}
            onChange={(e) => setEventForm((s) => ({ ...s, starts_at: e.target.value }))}
          />
          <TextField
            label="Окончание"
            type="datetime-local"
            fullWidth
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 2 }}
            value={eventForm.ends_at}
            onChange={(e) => setEventForm((s) => ({ ...s, ends_at: e.target.value }))}
          />
          <TextField
            label="Локация"
            fullWidth
            sx={{ mt: 2 }}
            value={eventForm.location}
            onChange={(e) => setEventForm((s) => ({ ...s, location: e.target.value }))}
          />
          <TextField
            label="Лимит мест"
            type="number"
            fullWidth
            sx={{ mt: 2 }}
            value={eventForm.capacity}
            onChange={(e) => setEventForm((s) => ({ ...s, capacity: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleCreateEvent}>Создать</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={registerOpen} onClose={() => setRegisterOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Регистрация лида</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel id="lead-select-label">Лид</InputLabel>
            <Select
              labelId="lead-select-label"
              label="Лид"
              value={selectedLeadId}
              onChange={(e) => setSelectedLeadId(e.target.value as number)}
            >
              {leads.map((lead) => (
                <MenuItem key={lead.id} value={lead.id}>
                  {leadDisplayName(lead)} ({lead.phone})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Заметка"
            fullWidth
            multiline
            minRows={2}
            sx={{ mt: 2 }}
            value={registerNote}
            onChange={(e) => setRegisterNote(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegisterOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleRegisterLead} disabled={isEventFull}>
            {isEventFull ? 'Слоты закончились' : 'Зарегистрировать'}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default SalesEventsPage;
