import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { LegoShell } from './LegoShell';
import { createLesson, formatDate, listGroups, listLessons, LegoGroup, LegoLesson } from './legoApi';

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const STATUS_LABEL: Record<LegoLesson['status'], string> = {
  planned: 'Запланировано',
  completed: 'Отмечено',
  cancelled: 'Отменено',
};

const LegoLessonsPage: React.FC = () => {
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(plusDays(14));
  const [lessons, setLessons] = useState<LegoLesson[]>([]);
  const [groups, setGroups] = useState<LegoGroup[]>([]);
  const [groupId, setGroupId] = useState('');
  const [lessonDate, setLessonDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    listLessons({ date_from: from, date_to: to }).then(setLessons).catch(() => setError('Не удалось загрузить занятия'));

  useEffect(() => {
    load();
    listGroups().then(setGroups).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupId) return;
    try {
      await createLesson({ group_id: Number(groupId), lesson_date: lessonDate });
      load();
    } catch {
      setError('Не удалось создать занятие');
    }
  };

  return (
    <LegoShell title="Занятия">
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }} component="form" onSubmit={onCreate}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>Новое занятие</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField size="small" select SelectProps={{ native: true }} label="Группа" value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
            <option value="">Выберите группу</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </TextField>
          <TextField size="small" type="date" label="Дата" InputLabelProps={{ shrink: true }} value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} />
          <Button type="submit" variant="contained">Создать занятие</Button>
        </Stack>
      </Paper>

      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" type="date" label="С" InputLabelProps={{ shrink: true }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField size="small" type="date" label="По" InputLabelProps={{ shrink: true }} value={to} onChange={(e) => setTo(e.target.value)} />
      </Stack>

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Дата</TableCell>
              <TableCell>Время</TableCell>
              <TableCell>Группа</TableCell>
              <TableCell align="right">Детей</TableCell>
              <TableCell>Статус</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lessons.map((l) => (
              <TableRow key={l.id} hover component={RouterLink} to={`/lego/lessons/${l.id}`} sx={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}>
                <TableCell>{formatDate(l.lesson_date)}</TableCell>
                <TableCell>{l.start_time ? l.start_time.slice(0, 5) : '—'}</TableCell>
                <TableCell>{l.group_name}</TableCell>
                <TableCell align="right">{l.students_count}</TableCell>
                <TableCell><Chip size="small" label={STATUS_LABEL[l.status]} color={l.status === 'completed' ? 'success' : l.status === 'cancelled' ? 'default' : 'primary'} /></TableCell>
              </TableRow>
            ))}
            {lessons.length === 0 && (
              <TableRow><TableCell colSpan={5}><Typography color="text.secondary">Занятий в периоде нет</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </LegoShell>
  );
};

export default LegoLessonsPage;
