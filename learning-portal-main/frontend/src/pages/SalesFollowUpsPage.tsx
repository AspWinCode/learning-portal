import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { format, isValid, parseISO } from 'date-fns';
import Layout from '../components/Layout';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { EventItem, FollowUpItem, LeadSource } from '../types';

type Period = 'today' | 'tomorrow' | 'week' | 'overdue';

const SalesFollowUpsPage: React.FC = () => {
  const location = useLocation();
  const [period, setPeriod] = useState<Period>('today');
  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [sourceFilter, setSourceFilter] = useState('');
  const [eventFilter, setEventFilter] = useState<number | ''>('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadMeta = async () => {
    try {
      const [src, ev] = await Promise.all([
        salesApi.listLeadSources(true),
        salesApi.listEvents('active'),
      ]);
      setSources(src);
      setEvents(ev);
    } catch {
      // ignore metadata errors
    }
  };

  const loadFollowUps = async () => {
    try {
      const data = await salesApi.listFollowUps({
        period,
        source: sourceFilter || undefined,
        event_id: eventFilter || undefined,
        reason: reasonFilter || undefined,
      });
      setItems(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить follow-ups'));
    }
  };

  useEffect(() => {
    const p = new URLSearchParams(location.search).get('period');
    if (p === 'today' || p === 'tomorrow' || p === 'week' || p === 'overdue') {
      setPeriod(p);
    }
  }, [location.search]);

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    loadFollowUps();
  }, [period, sourceFilter, eventFilter, reasonFilter]);

  const addTag = (base: string | null | undefined, tag: string) => `${tag} ${(base || '').trim()}`.trim();
  const AUTO_ATTENDED_MARKER = '[auto_attended_offer]';
  const AUTO_NO_SHOW_MARKER = '[auto_no_show_reactivate]';

  const getAutomationLabel = (note?: string | null): string | null => {
    const lower = (note || '').toLowerCase();
    if (lower.includes(AUTO_ATTENDED_MARKER)) return 'ATTENDED авто';
    if (lower.includes(AUTO_NO_SHOW_MARKER)) return 'NO_SHOW авто';
    return null;
  };

  const cleanTaskNote = (note?: string | null): string => {
    const value = (note || '').trim();
    if (!value) return '—';
    const cleaned = value
      .replaceAll(AUTO_ATTENDED_MARKER, '')
      .replaceAll(AUTO_NO_SHOW_MARKER, '')
      .trim();
    return cleaned || '—';
  };

  const getAutomationRowSx = (note?: string | null) => {
    const lower = (note || '').toLowerCase();
    if (lower.includes(AUTO_ATTENDED_MARKER)) {
      return {
        bgcolor: 'success.50',
        '&:hover': { bgcolor: 'success.100' },
      };
    }
    if (lower.includes(AUTO_NO_SHOW_MARKER)) {
      return {
        bgcolor: 'warning.50',
        '&:hover': { bgcolor: 'warning.100' },
      };
    }
    return undefined;
  };

  const handleWrite = async (item: FollowUpItem) => {
    try {
      await salesApi.updateTask(item.lead_id, item.task_id, {
        channel: 'messenger',
        note: addTag(item.note, '[write]'),
      });
      await loadFollowUps();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось отметить действие'));
    }
  };

  const handleCall = async (item: FollowUpItem) => {
    try {
      await salesApi.updateTask(item.lead_id, item.task_id, {
        channel: 'call',
        note: addTag(item.note, '[call]'),
      });
      await loadFollowUps();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось отметить звонок'));
    }
  };

  const handleReschedule = async (item: FollowUpItem) => {
    const raw = window.prompt('Новая дата/время (YYYY-MM-DDTHH:mm):', '');
    if (!raw) return;
    const d = new Date(raw);
    if (!isValid(d)) {
      setError('Неверная дата');
      return;
    }
    try {
      await salesApi.updateTask(item.lead_id, item.task_id, { due_at: d.toISOString() });
      await loadFollowUps();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось перенести задачу'));
    }
  };

  const handleClose = async (item: FollowUpItem) => {
    try {
      await salesApi.closeTask(item.lead_id, item.task_id);
      await loadFollowUps();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось закрыть задачу'));
    }
  };

  return (
    <Layout>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">Фоллоу-апы</Typography>
        <Button variant="outlined" onClick={loadFollowUps}>Обновить</Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Tabs value={period} onChange={(_, v) => setPeriod(v)}>
            <Tab value="today" label="Сегодня" />
            <Tab value="tomorrow" label="Завтра" />
            <Tab value="week" label="Неделя" />
            <Tab value="overdue" label="Просрочено" />
          </Tabs>

          <Stack direction="row" spacing={1} mt={2} flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="source-filter">Источник</InputLabel>
              <Select
                labelId="source-filter"
                label="Источник"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <MenuItem value="">Все</MenuItem>
                {sources.map((s) => (
                  <MenuItem key={s.id} value={s.name}>{s.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel id="event-filter">Мероприятие</InputLabel>
              <Select
                labelId="event-filter"
                label="Мероприятие"
                value={eventFilter}
                onChange={(e) => setEventFilter((e.target.value as number) || '')}
              >
                <MenuItem value="">Все</MenuItem>
                {events.map((ev) => (
                  <MenuItem key={ev.id} value={ev.id}>{ev.title}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              size="small"
              label="Причина молчания / паузы"
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
            />
          </Stack>
        </CardContent>
      </Card>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Лид</TableCell>
            <TableCell>Источник</TableCell>
            <TableCell>Срок</TableCell>
            <TableCell>Канал</TableCell>
            <TableCell>Комментарий</TableCell>
            <TableCell align="right">Действия</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.task_id} sx={getAutomationRowSx(item.note)}>
              <TableCell>{item.lead_name} ({item.lead_phone})</TableCell>
              <TableCell>{item.lead_source || '—'}</TableCell>
              <TableCell>
                {item.due_at
                  ? (() => {
                      const d = parseISO(item.due_at);
                      return isValid(d) ? format(d, 'dd.MM.yyyy HH:mm') : item.due_at;
                    })()
                  : '—'}
              </TableCell>
              <TableCell>{item.channel || '—'}</TableCell>
              <TableCell>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  {getAutomationLabel(item.note) && (
                    <Chip
                      size="small"
                      color={item.note?.toLowerCase().includes(AUTO_ATTENDED_MARKER) ? 'success' : 'warning'}
                      label={getAutomationLabel(item.note)}
                    />
                  )}
                  <Typography variant="body2">{cleanTaskNote(item.note)}</Typography>
                </Stack>
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button size="small" onClick={() => handleWrite(item)}>написать</Button>
                  <Button size="small" onClick={() => handleCall(item)}>позвонить</Button>
                  <Button size="small" onClick={() => handleReschedule(item)}>перенести</Button>
                  <Button size="small" color="success" onClick={() => handleClose(item)}>закрыть</Button>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6}>
                <Typography color="text.secondary">Задач нет</Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Layout>
  );
};

export default SalesFollowUpsPage;
