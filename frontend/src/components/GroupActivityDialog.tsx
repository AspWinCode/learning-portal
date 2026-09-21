import React, { useEffect, useState } from 'react';
import {
  Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, Select, Table, TableBody, TableCell,
  TableHead, TableRow, Typography,
} from '@mui/material';
import { studentPortalAdminApi } from '../services/api';
import { CourseCatalogItemOut, GroupActivityResponse } from '../types';

interface Props {
  open: boolean;
  groupId: number;
  groupName: string;
  onClose: () => void;
}

const STATUS_META: Record<string, { label: string; color: 'default' | 'info' | 'warning' | 'error' | 'success' }> = {
  not_started: { label: 'Не приступил', color: 'default' },
  in_progress: { label: 'В процессе', color: 'info' },
  behind: { label: 'Отстаёт', color: 'warning' },
  overdue: { label: 'Просрочено', color: 'error' },
  completed: { label: 'Завершено', color: 'success' },
};

/** ANA-003/004/005: активность учеников группы по выбранному курсу —
 * кто не приступил, кто отстаёт от графика, у кого дедлайн уже прошёл. */
export default function GroupActivityDialog({ open, groupId, groupName, onClose }: Props) {
  const [catalog, setCatalog] = useState<CourseCatalogItemOut[]>([]);
  const [catalogItemId, setCatalogItemId] = useState('');
  const [data, setData] = useState<GroupActivityResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      studentPortalAdminApi.listCatalog().then(setCatalog).catch(() => {});
      setCatalogItemId('');
      setData(null);
      setError('');
    }
  }, [open]);

  const load = async (itemId: string) => {
    if (!itemId) return;
    setLoading(true);
    setError('');
    try {
      setData(await studentPortalAdminApi.getGroupActivity(groupId, Number(itemId)));
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Не удалось загрузить активность');
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!catalogItemId) return;
    const item = catalog.find((c) => c.id.toString() === catalogItemId);
    studentPortalAdminApi.downloadGroupActivityCsv(groupId, Number(catalogItemId), `${groupName}_${item?.name || catalogItemId}.csv`);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Активность по курсу — «{groupName}»</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <FormControl fullWidth sx={{ mt: 1, mb: 2 }}>
          <InputLabel>Курс</InputLabel>
          <Select
            value={catalogItemId}
            label="Курс"
            onChange={(e) => { setCatalogItemId(e.target.value); load(e.target.value); }}
          >
            {catalog.map((c) => (
              <MenuItem key={c.id} value={c.id.toString()}>{c.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {loading && <Typography variant="body2" color="text.secondary">Загрузка…</Typography>}

        {data && (
          <>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Данные на {new Date(data.generated_at).toLocaleString('ru-RU')}
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Ученик</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell>% выполнено</TableCell>
                  <TableCell>Задач</TableCell>
                  <TableCell>Дедлайн</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rows.map((r) => {
                  const meta = STATUS_META[r.status] || { label: r.status, color: 'default' as const };
                  return (
                    <TableRow key={r.student_id}>
                      <TableCell>{r.full_name}</TableCell>
                      <TableCell><Chip size="small" label={meta.label} color={meta.color} /></TableCell>
                      <TableCell>{r.percent_complete}%</TableCell>
                      <TableCell>{r.cases_solved} / {r.cases_total}</TableCell>
                      <TableCell>{r.deadline_at ? new Date(r.deadline_at).toLocaleDateString('ru-RU') : '—'}</TableCell>
                    </TableRow>
                  );
                })}
                {data.rows.length === 0 && (
                  <TableRow><TableCell colSpan={5}><Typography variant="caption" color="text.secondary">В группе нет активных учеников</Typography></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
        {data && data.rows.length > 0 && <Button onClick={downloadCsv}>Скачать CSV</Button>}
      </DialogActions>
    </Dialog>
  );
}
