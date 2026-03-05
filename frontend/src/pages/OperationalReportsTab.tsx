import React, { useEffect, useState } from 'react';
import {
  Box,
  Stack,
  TextField,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from '@mui/material';
import { tasksApi } from '../services/api';

interface ParentResponsesStat {
  date: string;
  user_id: number;
  user_name: string;
  replies: number;
  escalations: number;
}

const OperationalReportsTab: React.FC = () => {
  const today = new Date().toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState<string>(today);
  const [toDate, setToDate] = useState<string>(today);
  const [rows, setRows] = useState<ParentResponsesStat[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await tasksApi.getParentResponsesStats(fromDate, toDate);
        setRows(data);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [fromDate, toDate]);

  const totalReplies = rows.reduce((sum, r) => sum + r.replies, 0);
  const totalEsc = rows.reduce((sum, r) => sum + r.escalations, 0);

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h5" gutterBottom>
        Операционные отчёты
      </Typography>
      <Typography variant="subtitle1" gutterBottom>
        Ответы на сообщения родителей
      </Typography>

      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap' }}>
        <TextField
          label="С"
          type="date"
          size="small"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="По"
          type="date"
          size="small"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      </Stack>

      <Typography variant="body2" sx={{ mb: 1 }}>
        Всего ответов: {totalReplies} · Передано тренеру: {totalEsc}
      </Typography>

      {loading ? (
        <Typography color="text.secondary">Загрузка...</Typography>
      ) : rows.length === 0 ? (
        <Typography color="text.secondary">Нет данных за выбранный период.</Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Дата</TableCell>
              <TableCell>Менеджер</TableCell>
              <TableCell>Ответов родителям</TableCell>
              <TableCell>Передано тренеру</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.date}-${r.user_id}`}>
                <TableCell>{r.date}</TableCell>
                <TableCell>{r.user_name}</TableCell>
                <TableCell>{r.replies}</TableCell>
                <TableCell>{r.escalations}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
};

export default OperationalReportsTab;

