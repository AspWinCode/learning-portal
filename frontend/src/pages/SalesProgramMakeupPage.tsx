import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import Layout from '../components/Layout';
import { salesApi } from '../services/api';
import { programsApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

interface CompatRow {
  id: number;
  source_program_id: number;
  target_program_id: number;
  source_program_name?: string | null;
  target_program_name?: string | null;
}

interface ProgramOption {
  id: number;
  name: string;
}

export const ProgramMakeupContent: React.FC = () => {
  const [items, setItems] = useState<CompatRow[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [sourceId, setSourceId] = useState<number | ''>('');
  const [targetId, setTargetId] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, progs] = await Promise.all([
        salesApi.getProgramMakeupCompatibility(),
        programsApi.getAll(),
      ]);
      setItems(list);
      setPrograms(Array.isArray(progs) ? progs.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name })) : []);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!sourceId || !targetId) return;
    setAdding(true);
    setError(null);
    try {
      const created = await salesApi.createProgramMakeupCompatibility({
        source_program_id: sourceId,
        target_program_id: targetId,
      });
      setItems((prev) => [...prev, created]);
      setSourceId('');
      setTargetId('');
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось добавить'));
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await salesApi.deleteProgramMakeupCompatibility(id);
      setItems((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось удалить'));
    }
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Укажите, в каких программах ученик одной программы может отрабатывать пропуск. Например: «Первый шаг» только с «Первый шаг»; Специалист/Эксперт/Backend/Frontend — между собой. ОГЭ не участвует. После деплоя можно запустить сид-миграцию (0037) для заполнения по названиям программ.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Добавить правило
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Программа (ученик)</InputLabel>
              <Select
                value={sourceId === '' ? '' : sourceId}
                label="Программа (ученик)"
                onChange={(e) => setSourceId(Number(e.target.value))}
              >
                {programs.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography color="text.secondary">→ может отрабатывать в →</Typography>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Программа (группа)</InputLabel>
              <Select
                value={targetId === '' ? '' : targetId}
                label="Программа (группа)"
                onChange={(e) => setTargetId(Number(e.target.value))}
              >
                {programs.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="contained" onClick={handleAdd} disabled={adding || !sourceId || !targetId}>
              {adding ? 'Добавление…' : 'Добавить'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {loading ? (
        <Typography color="text.secondary">Загрузка…</Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Программа (ученик)</TableCell>
              <TableCell>Может отрабатывать в</TableCell>
              <TableCell width={80} />
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.source_program_name ?? `#${row.source_program_id}`}</TableCell>
                <TableCell>{row.target_program_name ?? `#${row.target_program_id}`}</TableCell>
                <TableCell>
                  <Button size="small" color="secondary" onClick={() => handleDelete(row.id)}>
                    Удалить
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {!loading && items.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          Правил нет. Добавьте выше или выполните миграцию 0037 для автозаполнения по названиям программ.
        </Typography>
      )}
    </Box>
  );
};

const SalesProgramMakeupPage: React.FC = () => {
  return (
    <Layout>
      <Box sx={{ p: 2 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Совместимость программ для отработок
        </Typography>
        <ProgramMakeupContent />
      </Box>
    </Layout>
  );
};

export default SalesProgramMakeupPage;
