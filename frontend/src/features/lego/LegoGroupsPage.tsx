import React, { useEffect, useState } from 'react';
import { Alert, Button, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { LegoShell } from './LegoShell';
import { createGroup, listGroups, LegoGroup } from './legoApi';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission } from '../../utils/permissions';

const LegoGroupsPage: React.FC = () => {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'lego.manage');
  const [groups, setGroups] = useState<LegoGroup[]>([]);
  const [name, setName] = useState('');
  const [weekday, setWeekday] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = () => listGroups().then(setGroups).catch(() => setError('Не удалось загрузить группы'));
  useEffect(() => {
    load();
  }, []);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createGroup({
        name: name.trim(),
        weekday: weekday === '' ? null : Number(weekday),
        start_time: startTime || null,
        end_time: endTime || null,
      });
      setName('');
      setWeekday('');
      setStartTime('');
      setEndTime('');
      load();
    } catch {
      setError('Не удалось создать группу');
    }
  };

  return (
    <LegoShell title="Группы">
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {canManage && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }} component="form" onSubmit={onCreate}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>Новая группа</Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ flexWrap: 'wrap' }}>
            <TextField size="small" label="Название *" value={name} onChange={(e) => setName(e.target.value)} required />
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
              <TableRow key={g.id}>
                <TableCell>{g.name}</TableCell>
                <TableCell>{g.trainer_name ?? '—'}</TableCell>
                <TableCell>
                  {g.weekday != null ? WEEKDAYS[g.weekday] : '—'}
                  {g.start_time ? ` ${g.start_time.slice(0, 5)}` : ''}
                  {g.end_time ? `–${g.end_time.slice(0, 5)}` : ''}
                </TableCell>
                <TableCell align="right">{g.students_count}</TableCell>
              </TableRow>
            ))}
            {groups.length === 0 && (
              <TableRow><TableCell colSpan={4}><Typography color="text.secondary">Назначенных групп нет</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </LegoShell>
  );
};

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default LegoGroupsPage;
