import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { LegoShell } from './LegoShell';
import {
  createEvent,
  formatDate,
  formatMoney,
  getEvent,
  LegoBranch,
  LegoEventDetail,
  LegoEventItem,
  listBranches,
  listEvents,
  listStudents,
  LegoStudent,
  markEventAttendance,
  payForEvent,
  registerParticipant,
} from './legoApi';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission } from '../../utils/permissions';

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const newPayKey = () => `lego-event-pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// Разовые мастер-классы: отдельно от групп и курса. Участники новые каждый раз, в долги не попадают.
const LegoEventsPage: React.FC = () => {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'lego.manage');
  const canAttend = hasPermission(user, 'lego.attendance');
  const canPay = hasPermission(user, 'lego.payments_manage');

  const [events, setEvents] = useState<LegoEventItem[]>([]);
  const [branches, setBranches] = useState<LegoBranch[]>([]);
  const [students, setStudents] = useState<LegoStudent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Форма создания
  const [branchId, setBranchId] = useState('');
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(todayIso());
  const [startTime, setStartTime] = useState('');
  const [price, setPrice] = useState('');
  const [capacity, setCapacity] = useState('');

  // Диалог мастер-класса
  const [detail, setDetail] = useState<LegoEventDetail | null>(null);
  const [newStudentId, setNewStudentId] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const payKey = useRef<string>(newPayKey());
  const [paying, setPaying] = useState<number | null>(null);

  const loadEvents = () =>
    listEvents({ date_from: todayIso(), date_to: plusDays(60) })
      .then(setEvents)
      .catch(() => setError('Не удалось загрузить мастер-классы'));

  const loadDetail = (id: number) =>
    getEvent(id)
      .then((d) => {
        setDetail(d);
        setNewStudentId('');
        setNewName('');
        setNewPhone('');
      })
      .catch(() => setError('Не удалось открыть мастер-класс'));

  useEffect(() => {
    loadEvents();
    listBranches().then((b) => {
      setBranches(b);
      if (b.length && !branchId) setBranchId(String(b[0].id));
    }).catch(() => undefined);
    if (canManage || canAttend) {
      listStudents({ status: 'active' }).then(setStudents).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createEvent({
        branch_id: Number(branchId),
        title: title.trim(),
        event_date: eventDate,
        start_time: startTime || null,
        price: price ? Number(price) : null,
        capacity: capacity ? Number(capacity) : null,
      });
      setTitle('');
      setPrice('');
      setCapacity('');
      setStartTime('');
      setMessage('Мастер-класс создан');
      loadEvents();
    } catch {
      setError('Не удалось создать мастер-класс');
    }
  };

  const onRegister = async () => {
    if (!detail) return;
    setError(null);
    try {
      await registerParticipant(detail.id, {
        student_id: newStudentId ? Number(newStudentId) : undefined,
        full_name: newStudentId ? undefined : newName.trim() || undefined,
        parent_phone: newStudentId ? undefined : newPhone || undefined,
      });
      setMessage('Участник записан');
      loadDetail(detail.id);
      loadEvents();
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(d || 'Не удалось записать участника');
    }
  };

  const onAttend = async (studentId: number, attended: boolean) => {
    if (!detail) return;
    await markEventAttendance(detail.id, studentId, attended);
    loadDetail(detail.id);
  };

  const onPay = async (studentId: number) => {
    if (!detail || paying !== null) return;
    setError(null);
    setPaying(studentId);
    try {
      const res = await payForEvent(detail.id, studentId, { idempotency_key: payKey.current });
      setMessage(res.created ? `Оплата ${formatMoney(res.amount)} зарегистрирована` : 'Оплата уже была зарегистрирована');
      payKey.current = newPayKey();
      loadDetail(detail.id);
      loadEvents();
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(d || 'Не удалось зарегистрировать оплату');
    } finally {
      setPaying(null);
    }
  };

  // Дети, которых ещё нет на этом мастер-классе
  const available = detail ? students.filter((s) => !detail.participants.some((p) => p.student_id === s.id)) : [];

  return (
    <LegoShell title="Мастер-классы">
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message}</Alert>}

      {canManage && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }} component="form" onSubmit={onCreate}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>Новый мастер-класс</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ flexWrap: 'wrap' }}>
            <TextField size="small" select SelectProps={{ native: true }} label="Филиал" value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </TextField>
            <TextField size="small" label="Название *" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <TextField size="small" type="date" label="Дата *" InputLabelProps={{ shrink: true }} value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
            <TextField size="small" type="time" label="Начало" InputLabelProps={{ shrink: true }} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <TextField size="small" type="number" label="Цена, ₽" value={price} onChange={(e) => setPrice(e.target.value)} />
            <TextField size="small" type="number" label="Мест (пусто = без лимита)" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            <Button type="submit" variant="contained" disabled={!branchId}>Создать</Button>
          </Stack>
        </Paper>
      )}

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Дата</TableCell>
              <TableCell>Название</TableCell>
              <TableCell>Филиал</TableCell>
              <TableCell align="right">Цена</TableCell>
              <TableCell align="right">Записано</TableCell>
              <TableCell>Статус</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {events.map((ev) => (
              <TableRow key={ev.id} hover onClick={() => loadDetail(ev.id)} sx={{ cursor: 'pointer' }}>
                <TableCell>{formatDate(ev.event_date)}{ev.start_time ? ` ${ev.start_time.slice(0, 5)}` : ''}</TableCell>
                <TableCell>{ev.title}</TableCell>
                <TableCell>{ev.branch_name ?? '—'}</TableCell>
                <TableCell align="right">{formatMoney(ev.price)}</TableCell>
                <TableCell align="right">{ev.registered}{ev.capacity ? ` / ${ev.capacity}` : ''}</TableCell>
                <TableCell>
                  <Chip size="small" label={ev.status === 'cancelled' ? 'Отменён' : 'Запланирован'} color={ev.status === 'cancelled' ? 'default' : 'primary'} />
                </TableCell>
              </TableRow>
            ))}
            {events.length === 0 && (
              <TableRow><TableCell colSpan={6}><Typography color="text.secondary">Мастер-классов на ближайшие 60 дней нет</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={!!detail} onClose={() => setDetail(null)} fullWidth maxWidth="md">
        {detail && (
          <>
            <DialogTitle>
              {detail.title}
              <Typography variant="body2" color="text.secondary">
                {formatDate(detail.event_date)}{detail.start_time ? ` ${detail.start_time.slice(0, 5)}` : ''} · {detail.branch_name} · {formatMoney(detail.price)}
              </Typography>
            </DialogTitle>
            <DialogContent dividers>
              <Typography variant="subtitle2" gutterBottom>
                Участники ({detail.participants.length}{detail.capacity ? ` из ${detail.capacity}` : ''})
              </Typography>
              {detail.participants.length === 0 ? (
                <Typography color="text.secondary" sx={{ mb: 2 }}>Пока никто не записан</Typography>
              ) : (
                <Table size="small" sx={{ mb: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>ФИО</TableCell>
                      <TableCell>Телефон</TableCell>
                      {canAttend && <TableCell align="center">Пришёл</TableCell>}
                      <TableCell>Оплата</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detail.participants.map((p) => (
                      <TableRow key={p.student_id}>
                        <TableCell>{p.full_name}</TableCell>
                        <TableCell>{p.parent_phone ?? '—'}</TableCell>
                        {canAttend && (
                          <TableCell align="center">
                            <Switch checked={p.attended} onChange={(e) => onAttend(p.student_id, e.target.checked)} inputProps={{ 'aria-label': `Пришёл: ${p.full_name}` }} />
                          </TableCell>
                        )}
                        <TableCell>
                          {p.paid ? (
                            <Chip size="small" color="success" label="Оплачено" />
                          ) : canPay ? (
                            <Button size="small" variant="outlined" onClick={() => onPay(p.student_id)} disabled={paying !== null}>
                              Принять оплату
                            </Button>
                          ) : (
                            <Chip size="small" label="Не оплачено" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {canAttend && (
                <>
                  <Typography variant="subtitle2" gutterBottom>Записать участника</Typography>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: 'center' }}>
                    <TextField size="small" select SelectProps={{ native: true }} value={newStudentId} onChange={(e) => setNewStudentId(e.target.value)} fullWidth>
                      <option value="">Новый участник →</option>
                      {available.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </TextField>
                    {!newStudentId && (
                      <>
                        <TextField size="small" label="ФИО *" value={newName} onChange={(e) => setNewName(e.target.value)} fullWidth />
                        <TextField size="small" label="Телефон" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} fullWidth />
                      </>
                    )}
                    <Button variant="contained" onClick={onRegister} disabled={!newStudentId && !newName.trim()}>Записать</Button>
                  </Stack>
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetail(null)}>Закрыть</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </LegoShell>
  );
};

export default LegoEventsPage;
