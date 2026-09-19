import React, { useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Grid,
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
import { useQuery } from '@tanstack/react-query';

import { ownerDashboardApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const currentMonthBounds = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: toLocalDateString(start),
    to: toLocalDateString(end),
  };
};

const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

const AcademyMetricsTab: React.FC = () => {
  const initial = currentMonthBounds();
  const [fromDate, setFromDate] = useState<string>(initial.from);
  const [toDate, setToDate] = useState<string>(initial.to);

  const metricsQuery = useQuery({
    queryKey: ['owner-dashboard', 'academy-metrics', fromDate, toDate],
    queryFn: () => ownerDashboardApi.getAcademyMetrics({ date_from: fromDate, date_to: toDate }),
  });

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h5" gutterBottom>
        Показатели Академии
      </Typography>

      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3, flexWrap: 'wrap' }}>
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

      {metricsQuery.isLoading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : metricsQuery.isError ? (
        <Alert severity="error">
          {extractApiError(metricsQuery.error, 'Не удалось загрузить показатели академии')}
        </Alert>
      ) : metricsQuery.data ? (
        <Box>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={4}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Средний чек
                </Typography>
                <Typography variant="h4" sx={{ mt: 1 }}>
                  {rub(metricsQuery.data.average_check)}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Учеников с оплатой за период
                </Typography>
                <Typography variant="h4" sx={{ mt: 1 }}>
                  {metricsQuery.data.students_count}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Сумма чеков за период
                </Typography>
                <Typography variant="h4" sx={{ mt: 1 }}>
                  {rub(metricsQuery.data.total_amount)}
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Разбивка по форматам абонементов
            </Typography>
            {metricsQuery.data.breakdown_by_format.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Нет оплат за выбранный период.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Формат абонемента</TableCell>
                    <TableCell align="right">Учеников</TableCell>
                    <TableCell align="right">Сумма чеков</TableCell>
                    <TableCell align="right">Средний чек</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {metricsQuery.data.breakdown_by_format.map((row) => (
                    <TableRow key={row.abonement_format}>
                      <TableCell>{row.format_label}</TableCell>
                      <TableCell align="right">{row.students_count}</TableCell>
                      <TableCell align="right">{rub(row.total_amount)}</TableCell>
                      <TableCell align="right">{rub(row.average_check)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Выручка по группам
            </Typography>
            {metricsQuery.data.breakdown_by_group.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Нет данных: ни у одной группы нет учеников с оплатой за выбранный период.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Группа</TableCell>
                    <TableCell>Тренер</TableCell>
                    <TableCell align="right">Учеников</TableCell>
                    <TableCell align="right">Выручка</TableCell>
                    <TableCell align="right">Средний чек</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {metricsQuery.data.breakdown_by_group.map((row) => (
                    <TableRow key={row.group_id}>
                      <TableCell>{row.group_name}</TableCell>
                      <TableCell>{row.trainer_name || '—'}</TableCell>
                      <TableCell align="right">{row.students_count}</TableCell>
                      <TableCell align="right">{rub(row.total_amount)}</TableCell>
                      <TableCell align="right">{rub(row.average_check)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Выручка группы = сумма чеков учеников, у которых сейчас активное членство в этой группе и
              которые заплатили в выбранном периоде. Ученик без активной группы (например, чисто
              индивидуальный) сюда не попадает, но учтён в общей цифре и разбивке по форматам выше.
            </Typography>
          </Paper>

          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            Средний чек = цена абонемента ученика (с учётом персональной скидки), засчитанная один раз за
            период на ученика — вне зависимости от того, одним платежом или в рассрочку он вносил оплату.
          </Typography>
        </Box>
      ) : null}
    </Box>
  );
};

export default AcademyMetricsTab;
