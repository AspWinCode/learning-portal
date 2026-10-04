import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { LegoShell } from './LegoShell';
import {
  addGroupMember,
  createGroup,
  getGroup,
  LegoGroup,
  LegoGroupDetail,
  leaveGroup,
  listGroups,
  listStudents,
  listTrainers,
  LegoStudent,
  updateGroup,
} from './legoApi';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission } from '../../utils/permissions';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const scheduleText = (g: { weekday: number | null; start_time: string | null; end_time: string | null }) =>
  [
    g.weekday != null ? WEEKDAYS[g.weekday] : null,
    g.start_time ? g.start_time.slice(0, 5) : null,
    g.end_time ? `–${g.end_time.slice(0, 5)}` : null,
  ]
    .filter(Boolean)
    .join(' ') || '—';

const LegoGroupsPage: React.FC = () => {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'lego.manage');

  const [groups, setGroups] = useState<LegoGroup[]>([]);
  const [trainers, setTrainers] = useState<{ id: number; full_name: string }[]>([]);
  const [students, setStudents] = useState<LegoStudent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Форма создания
  const [name, setName] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [weekday, setWeekday] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // Диалог группы
  const [detail, setDetail] = useState<LegoGroupDetail | null>(null);
  const [editTrainer, setEditTrainer] = useState('');
  const [addStudentId, setAddStudentId] = useState('');

  const loadGroups = () => listGroups().then(setGroups).catch(() => setError('Не удалось загрузить группы'));

  const loadDetail = (id: number) =>
    getGroup(id)
      .then((d) => {
        setDetail(d);
        setEditTrainer(d.trainer_id != null ? String(d.trainer_id) : '');
        setAddStudentId('');
      })
      .catch(() => setError('Не удалось открыть группу'));

  useEffect(() => {
    loadGroups();
    if (canManage) {
      listTrainers().then(setTrainers).catch(() => undefined);
      listStudents({ status: 'active' }).then(setStudents).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createGroup({
        name: name.trim(),
        trainer_id: trainerId ? Number(trainerId) : null,
        weekday: weekday === '' ? null : Number(weekday),
        start_time: startTime || null,
        end_time: endTime || null,
      });
      setName('');
      setTrainerId('');
      setWeekday('');
      setStartTime('');
      setEndTime('');
      setMessage('Группа создана');
      loadGroups();
    } catch {
      setError('Не удалось создать группу');
    }
  };

  const onSaveTrainer = async () => {
    if (!detail) return;
    setError(null);
    try {
      await updateGroup(detail.id, { trainer_id: editTrainer ? Number(editTrainer) : null });
      setMessage('Тренер сохранён');
      loadGroups();
      loadDetail(detail.id);
    } catch {
      setError('Не удалось сохранить тренера');
    }
  };

  const onAddMember = async () => {
    if (!detail || !addStudentId) return;
    setError(null);
    try {
      await addGroupMember(detail.id, Number(addStudentId));
      setMessage('Ребёнок добавлен в группу');
      loadGroups();
      loadDetail(detail.id);
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setError(status === 409 ? 'Ребёнок уже в этой группе' : 'Не удалось добавить ребёнка');
    }
  };

  const onRemoveMember = async (studentId: number) => {
    if (!detail) return;
    if (!window.confirm('Убрать ребёнка из группы? Прошлые занятия и посещаемость сохранятся.')) return;
    setError(null);
    try {
      await leaveGroup(detail.id, studentId);
      setMessage('Ребёнок убран из группы');
      loadGroups();
      loadDetail(detail.id);
    } catch {
      setError('Не удалось убрать ребёнка');
    }
  };

  // Дети, которых ещё нет в этой группе
  const availableStudents = detail
    ? students.filter((s) => !detail.members.some((m) => m.student_id === s.id))
    : [];

  return (
    <LegoShell title="Группы">
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message}</Alert>}

      {canManage && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }} component="form" onSubmit={onCreate}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>Новая группа</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ flexWrap: 'wrap' }}>
            <TextField size="small" label="Название *" value={name} onChange={(e) => setName(e.target.value)} required />
            <TextField size="small" select SelectProps={{ native: true }} label="Тренер" value={trainerId} onChange={(e) => setTrainerId(e.target.value)} sx={{ minWidth: 200 }}>
              <option value="">Не назначен</option>
              {trainers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </TextField>
            <TextField size="small" select SelectProps={{ native: true }} label="День недели" value={weekday} onChange={(e) => setWeekday(e.target.value)}>
              <option value="">—</option>
              {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </TextField>
            <TextField size="small" type="time" label="Начало" InputLabelProps={{ shrink: true }} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <TextField size="small" type="time" label="Окончание" InputLabelProps={{ shrink: true }} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            <Button type="submit" variant="contained">Создать</Button>
          </Stack>
        </Paper>
      )}

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Группа</TableCell>
              <TableCell>Тренер</TableCell>
              <TableCell>Расписание</TableCell>
              <TableCell align="right">Детей</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.map((g) => (
              <TableRow key={g.id} hover onClick={() => loadDetail(g.id)} sx={{ cursor: 'pointer' }}>
                <TableCell>{g.name}</TableCell>
                <TableCell>{g.trainer_name ?? <Typography component="span" color="text.secondary">не назначен</Typography>}</TableCell>
                <TableCell>{scheduleText(g)}</TableCell>
                <TableCell align="right">{g.students_count}</TableCell>
              </TableRow>
            ))}
            {groups.length === 0 && (
              <TableRow><TableCell colSpan={4}><Typography color="text.secondary">Назначенных групп нет</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={!!detail} onClose={() => setDetail(null)} fullWidth maxWidth="sm">
        {detail && (
          <>
            <DialogTitle>{detail.name}</DialogTitle>
            <DialogContent dividers>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Расписание: {scheduleText(detail)}
              </Typography>

              <Typography variant="subtitle2" sx={{ mt: 2 }}>Тренер</Typography>
              {canManage ? (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <TextField size="small" select SelectProps={{ native: true }} value={editTrainer} onChange={(e) => setEditTrainer(e.target.value)} fullWidth>
                    <option value="">Не назначен</option>
                    {trainers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </TextField>
                  <Button variant="outlined" onClick={onSaveTrainer} disabled={String(detail.trainer_id ?? '') === editTrainer}>
                    Сохранить
                  </Button>
                </Stack>
              ) : (
                <Typography sx={{ mb: 2 }}>{detail.trainer_name ?? 'не назначен'}</Typography>
              )}

              <Typography variant="subtitle2">Состав ({detail.members.length})</Typography>
              {detail.members.length === 0 ? (
                <Typography color="text.secondary" sx={{ mb: 1 }}>В группе пока нет детей</Typography>
              ) : (
                <List dense>
                  {detail.members.map((m) => (
                    <ListItem
                      key={m.student_id}
                      secondaryAction={canManage && (
                        <IconButton edge="end" aria-label={`Убрать ${m.full_name}`} onClick={() => onRemoveMember(m.student_id)}>
                          <DeleteOutlineIcon />
                        </IconButton>
                      )}
                    >
                      <ListItemText primary={m.full_name} secondary={`в группе с ${m.joined_at.split('-').reverse().join('.')}`} />
                    </ListItem>
                  ))}
                </List>
              )}

              {canManage && (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
                  <TextField size="small" select SelectProps={{ native: true }} value={addStudentId} onChange={(e) => setAddStudentId(e.target.value)} fullWidth>
                    <option value="">Выберите ребёнка</option>
                    {availableStudents.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </TextField>
                  <Button variant="contained" onClick={onAddMember} disabled={!addStudentId}>Добавить</Button>
                </Stack>
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

export default LegoGroupsPage;
