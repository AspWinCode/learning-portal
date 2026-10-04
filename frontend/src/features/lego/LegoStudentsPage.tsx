import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { LegoShell } from './LegoShell';
import { createStudent, formatDate, listStudents, LegoStudent } from './legoApi';

const emptyForm = { full_name: '', parent_name: '', parent_phone: '', birth_date: '', start_date: '', comment: '' };

const LegoStudentsPage: React.FC = () => {
  const [q, setQ] = useState('');
  const [students, setStudents] = useState<LegoStudent[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const load = () => listStudents({ q: q || undefined }).then(setStudents).catch(() => setError('Не удалось загрузить список'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    try {
      await createStudent({
        full_name: form.full_name.trim(),
        parent_name: form.parent_name || null,
        parent_phone: form.parent_phone || null,
        birth_date: form.birth_date || null,
        start_date: form.start_date || null,
        comment: form.comment || null,
      });
      setForm(emptyForm);
      load();
    } catch {
      setError('Не удалось создать карточку ребёнка');
    }
  };

  return (
    <LegoShell title="Дети">
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }} component="form" onSubmit={onCreate}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>Новый ребёнок</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ flexWrap: 'wrap' }}>
          <TextField size="small" label="ФИО ребёнка *" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
          <TextField size="small" label="Родитель" value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} />
          <TextField size="small" label="Телефон" value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} />
          <TextField size="small" type="date" label="Дата рождения" InputLabelProps={{ shrink: true }} value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
          <TextField size="small" type="date" label="Дата начала" InputLabelProps={{ shrink: true }} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          <Button type="submit" variant="contained">Добавить</Button>
        </Stack>
      </Paper>

      <TextField size="small" fullWidth placeholder="Поиск по ФИО или телефону" value={q} onChange={(e) => setQ(e.target.value)} sx={{ mb: 2 }} />
      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ФИО</TableCell>
              <TableCell>Группа</TableCell>
              <TableCell>Родитель</TableCell>
              <TableCell>Телефон</TableCell>
              <TableCell>Дата начала</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {students.map((s) => (
              <TableRow key={s.id} hover component={RouterLink} to={`/lego/students/${s.id}`} sx={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}>
                <TableCell>{s.full_name}</TableCell>
                <TableCell>{s.group_name ?? '—'}</TableCell>
                <TableCell>{s.parent_name ?? '—'}</TableCell>
                <TableCell>{s.parent_phone ?? '—'}</TableCell>
                <TableCell>{formatDate(s.start_date)}</TableCell>
              </TableRow>
            ))}
            {students.length === 0 && (
              <TableRow><TableCell colSpan={5}><Typography color="text.secondary">Дети не найдены</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </LegoShell>
  );
};

export default LegoStudentsPage;
