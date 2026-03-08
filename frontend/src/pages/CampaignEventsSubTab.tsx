import React, { useCallback, useEffect, useState } from 'react';
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
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Edit from '@mui/icons-material/Edit';
import { format, parseISO } from 'date-fns';
import { campaignsApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { CampaignEvent } from '../types';
import {
  CAMPAIGN_EVENT_STATUSES,
  INVITE_STATUSES,
  PARTICIPATION_STATUSES,
  HOST_STATUSES,
  getEventStatusLabel,
  getInviteLabel,
  getParticipationLabel,
  getHostLabel,
} from '../constants/campaignEventStages';

interface CampaignEventsSubTabProps {
  campaignId: number;
  onError: (msg: string | null) => void;
}

export const CampaignEventsSubTab: React.FC<CampaignEventsSubTabProps> = ({ campaignId, onError }) => {
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: '',
    event_date: '',
    starts_at: '',
    ends_at: '',
    location: '',
    city: '',
    status: 'planned',
    notes: '',
  });
  const [eventDetailOpen, setEventDetailOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CampaignEvent | null>(null);
  const [eventSchools, setEventSchools] = useState<Array<{
    school_campaign_id: number;
    school_name: string | null;
    school_city: string | null;
    stage: string;
    invite_status: string;
    participation_status: string;
    participant_count: number | null;
    host_status: string;
    notes: string | null;
    school_campaign_event_id: number | null;
  }>>([]);
  const [eventSchoolsLoading, setEventSchoolsLoading] = useState(false);
  const [cellEditOpen, setCellEditOpen] = useState(false);
  const [cellEditRow, setCellEditRow] = useState<typeof eventSchools[0] | null>(null);
  const [cellEditForm, setCellEditForm] = useState({
    invite_status: 'not_invited',
    participation_status: 'not_planned',
    host_status: 'not_host',
    participant_count: '' as number | '',
    notes: '',
  });
  const [cellEditSaving, setCellEditSaving] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await campaignsApi.listCampaignEvents(campaignId);
      setEvents(data);
    } catch (err: any) {
      onError(extractApiError(err, 'Не удалось загрузить джемы'));
    } finally {
      setLoading(false);
    }
  }, [campaignId, onError]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleCreateEvent = async () => {
    if (!eventForm.title.trim() || !eventForm.event_date) {
      onError('Заполните название и дату');
      return;
    }
    onError(null);
    try {
      await campaignsApi.createCampaignEvent(campaignId, {
        title: eventForm.title.trim(),
        event_date: eventForm.event_date,
        starts_at: eventForm.starts_at || undefined,
        ends_at: eventForm.ends_at || undefined,
        location: eventForm.location.trim() || undefined,
        city: eventForm.city.trim() || undefined,
        status: eventForm.status,
        notes: eventForm.notes.trim() || undefined,
      });
      setCreateOpen(false);
      setEventForm({ title: '', event_date: '', starts_at: '', ends_at: '', location: '', city: '', status: 'planned', notes: '' });
      await loadEvents();
    } catch (err: any) {
      onError(extractApiError(err, 'Не удалось создать джем'));
    }
  };

  const openEventDetail = (event: CampaignEvent) => {
    setSelectedEvent(event);
    setEventDetailOpen(true);
    setEventSchoolsLoading(true);
    setEventSchools([]);
    campaignsApi
      .listEventSchools(campaignId, event.id)
      .then(setEventSchools)
      .catch(() => setEventSchools([]))
      .finally(() => setEventSchoolsLoading(false));
  };

  const openCellEdit = (row: typeof eventSchools[0]) => {
    setCellEditRow(row);
    setCellEditForm({
      invite_status: row.invite_status,
      participation_status: row.participation_status,
      host_status: row.host_status,
      participant_count: row.participant_count ?? '',
      notes: row.notes ?? '',
    });
    setCellEditOpen(true);
  };

  const handleSaveCellEdit = async () => {
    if (!selectedEvent || !cellEditRow) return;
    setCellEditSaving(true);
    onError(null);
    try {
      await campaignsApi.upsertSchoolCampaignEvent(campaignId, selectedEvent.id, cellEditRow.school_campaign_id, {
        invite_status: cellEditForm.invite_status,
        participation_status: cellEditForm.participation_status,
        host_status: cellEditForm.host_status,
        participant_count: cellEditForm.participant_count === '' ? undefined : Number(cellEditForm.participant_count),
        notes: cellEditForm.notes.trim() || undefined,
      });
      setCellEditOpen(false);
      setCellEditRow(null);
      const updated = await campaignsApi.listEventSchools(campaignId, selectedEvent.id);
      setEventSchools(updated);
    } catch (err: any) {
      onError(extractApiError(err, 'Не удалось сохранить'));
    } finally {
      setCellEditSaving(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">Джемы кампании</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
          Создать джем
        </Button>
      </Stack>
      {loading ? (
        <Typography color="text.secondary">Загрузка…</Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Дата</TableCell>
                <TableCell>Место</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    Нет джемов. Создайте первый.
                  </TableCell>
                </TableRow>
              ) : (
                events.map((ev) => (
                  <TableRow key={ev.id} hover>
                    <TableCell>{ev.title}</TableCell>
                    <TableCell>{ev.event_date ? format(parseISO(ev.event_date), 'dd.MM.yyyy') : '—'}</TableCell>
                    <TableCell>{ev.location || ev.city || '—'}</TableCell>
                    <TableCell>{getEventStatusLabel(ev.status)}</TableCell>
                    <TableCell>
                      <Button size="small" onClick={() => openEventDetail(ev)}>Открыть</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Новый джем</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Название"
              value={eventForm.title}
              onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Дата"
              type="date"
              value={eventForm.event_date}
              onChange={(e) => setEventForm((f) => ({ ...f, event_date: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
              required
            />
            <TextField
              label="Время начала"
              type="datetime-local"
              value={eventForm.starts_at}
              onChange={(e) => setEventForm((f) => ({ ...f, starts_at: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Время окончания"
              type="datetime-local"
              value={eventForm.ends_at}
              onChange={(e) => setEventForm((f) => ({ ...f, ends_at: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Локация"
              value={eventForm.location}
              onChange={(e) => setEventForm((f) => ({ ...f, location: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Город"
              value={eventForm.city}
              onChange={(e) => setEventForm((f) => ({ ...f, city: e.target.value }))}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Статус</InputLabel>
              <Select
                value={eventForm.status}
                label="Статус"
                onChange={(e) => setEventForm((f) => ({ ...f, status: e.target.value }))}
              >
                {CAMPAIGN_EVENT_STATUSES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Комментарий"
              value={eventForm.notes}
              onChange={(e) => setEventForm((f) => ({ ...f, notes: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleCreateEvent} disabled={!eventForm.title.trim() || !eventForm.event_date}>Создать</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={eventDetailOpen} onClose={() => setEventDetailOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          {selectedEvent?.title} {selectedEvent?.event_date ? `(${format(parseISO(selectedEvent.event_date), 'dd.MM.yyyy')})` : ''}
        </DialogTitle>
        <DialogContent>
          {selectedEvent && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {selectedEvent.location || selectedEvent.city || 'Локация не указана'} · {getEventStatusLabel(selectedEvent.status)}
              </Typography>
            </Box>
          )}
          {eventSchoolsLoading ? (
            <Typography color="text.secondary">Загрузка школ…</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small" sx={{ minWidth: 800 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Школа</TableCell>
                    <TableCell>Город</TableCell>
                    <TableCell>Общая стадия</TableCell>
                    <TableCell>Приглашение</TableCell>
                    <TableCell>Участие</TableCell>
                    <TableCell>Площадка</TableCell>
                    <TableCell align="right">Дети</TableCell>
                    <TableCell>Комментарий</TableCell>
                    <TableCell>Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {eventSchools.map((row) => (
                    <TableRow key={row.school_campaign_id} hover>
                      <TableCell>{row.school_name ?? '—'}</TableCell>
                      <TableCell>{row.school_city ?? '—'}</TableCell>
                      <TableCell>{row.stage}</TableCell>
                      <TableCell>{getInviteLabel(row.invite_status)}</TableCell>
                      <TableCell>{getParticipationLabel(row.participation_status)}</TableCell>
                      <TableCell>{getHostLabel(row.host_status)}</TableCell>
                      <TableCell align="right">{row.participant_count ?? '—'}</TableCell>
                      <TableCell sx={{ maxWidth: 150 }}>{row.notes ?? '—'}</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => openCellEdit(row)}>Изменить</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEventDetailOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cellEditOpen} onClose={() => setCellEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Редактировать запись школы в джеме</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Приглашение</InputLabel>
              <Select
                value={cellEditForm.invite_status}
                label="Приглашение"
                onChange={(e) => setCellEditForm((f) => ({ ...f, invite_status: e.target.value }))}
              >
                {INVITE_STATUSES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Участие</InputLabel>
              <Select
                value={cellEditForm.participation_status}
                label="Участие"
                onChange={(e) => setCellEditForm((f) => ({ ...f, participation_status: e.target.value }))}
              >
                {PARTICIPATION_STATUSES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Площадка</InputLabel>
              <Select
                value={cellEditForm.host_status}
                label="Площадка"
                onChange={(e) => setCellEditForm((f) => ({ ...f, host_status: e.target.value }))}
              >
                {HOST_STATUSES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Кол-во детей"
              type="number"
              size="small"
              value={cellEditForm.participant_count}
              onChange={(e) => setCellEditForm((f) => ({ ...f, participant_count: e.target.value === '' ? '' : Number(e.target.value) }))}
              fullWidth
              InputProps={{ inputProps: { min: 0 } }}
            />
            <TextField
              label="Комментарий"
              value={cellEditForm.notes}
              onChange={(e) => setCellEditForm((f) => ({ ...f, notes: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
              size="small"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCellEditOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleSaveCellEdit} disabled={cellEditSaving}>{cellEditSaving ? 'Сохранение…' : 'Сохранить'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
