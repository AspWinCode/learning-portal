import React, { useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Card,
  CardContent,
  TextField,
} from '@mui/material';
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear, isWithinInterval } from 'date-fns';
import { ru } from 'date-fns/locale';
import { usePersonalFinance } from '../../contexts/PersonalFinanceContext';
import { FinanceOperation } from '../../types/personalFinance';

type PeriodKey = 'day' | 'week' | 'month' | 'year';

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'year', label: 'Год' },
];

function getPeriodRange(period: PeriodKey, baseDate: Date): { start: Date; end: Date } {
  const start = startOfDay(baseDate);
  let end: Date;
  if (period === 'day') {
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  } else if (period === 'week') {
    const weekStart = startOfWeek(start, { weekStartsOn: 1 });
    end = new Date(weekStart);
    end.setDate(end.getDate() + 7);
  } else if (period === 'month') {
    const monthStart = startOfMonth(start);
    end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  } else {
    const yearStart = startOfYear(start);
    end = new Date(yearStart.getFullYear() + 1, 0, 1);
  }
  return { start, end };
}

export const FinanceDashboardTab: React.FC = () => {
  const { operations, incomeArticles, expenseArticles } = usePersonalFinance();
  const [summaryPeriod, setSummaryPeriod] = useState<PeriodKey>('month');
  const [summaryBaseDate, setSummaryBaseDate] = useState(() => new Date());

  const personalOps = useMemo(
    () => operations.filter((o) => o.target === 'personal'),
    [operations]
  );

  const dates = useMemo(() => {
    const set = new Set<string>();
    personalOps.forEach((o) => set.add(o.date));
    return Array.from(set).sort();
  }, [personalOps]);

  const tableDates = useMemo(() => {
    if (dates.length === 0) {
      const today = format(new Date(), 'yyyy-MM-dd');
      return [today];
    }
    return dates;
  }, [dates]);

  const byDateAndArticle = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    personalOps.forEach((op) => {
      const key = op.date;
      if (!map.has(key)) map.set(key, new Map());
      const row = map.get(key)!;
      const articleKey = op.articleId ?? (op.amount > 0 ? '__income__' : '__expense__');
      const prev = row.get(articleKey) ?? 0;
      row.set(articleKey, prev + op.amount);
    });
    return map;
  }, [personalOps]);

  const totalsByDate = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    personalOps.forEach((op) => {
      const key = op.date;
      if (!map.has(key)) map.set(key, { income: 0, expense: 0 });
      const t = map.get(key)!;
      if (op.amount > 0) t.income += op.amount;
      else t.expense += Math.abs(op.amount);
    });
    return map;
  }, [personalOps]);

  const { start, end } = useMemo(
    () => getPeriodRange(summaryPeriod, summaryBaseDate),
    [summaryPeriod, summaryBaseDate]
  );

  const periodIncome = useMemo(() => {
    return personalOps
      .filter((o) => o.amount > 0 && isWithinInterval(new Date(o.date + 'T12:00:00'), { start, end }))
      .reduce((s, o) => s + o.amount, 0);
  }, [personalOps, start, end]);

  const periodExpense = useMemo(() => {
    return personalOps
      .filter((o) => o.amount < 0 && isWithinInterval(new Date(o.date + 'T12:00:00'), { start, end }))
      .reduce((s, o) => s + Math.abs(o.amount), 0);
  }, [personalOps, start, end]);

  const periodBalance = periodIncome - periodExpense;

  const totalIncome = useMemo(
    () => personalOps.filter((o) => o.amount > 0).reduce((s, o) => s + o.amount, 0),
    [personalOps]
  );
  const totalExpense = useMemo(
    () => personalOps.filter((o) => o.amount < 0).reduce((s, o) => s + Math.abs(o.amount), 0),
    [personalOps]
  );
  const freeRemainder = totalIncome - totalExpense;
  const allocatedIncome = useMemo(() => {
    return personalOps
      .filter((o) => o.amount > 0 && o.articleId != null)
      .reduce((s, o) => s + o.amount, 0);
  }, [personalOps]);
  const allocatedExpense = useMemo(() => {
    return personalOps
      .filter((o) => o.amount < 0 && o.articleId != null)
      .reduce((s, o) => s + Math.abs(o.amount), 0);
  }, [personalOps]);
  const unallocated = freeRemainder - (allocatedIncome - allocatedExpense);

  const getCell = (date: string, articleId: string): number => {
    return byDateAndArticle.get(date)?.get(articleId) ?? 0;
  };

  const getDateTotal = (date: string) => totalsByDate.get(date) ?? { income: 0, expense: 0 };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Дашборд по финансам
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card variant="outlined">
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Сводка за период
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <InputLabel>Период</InputLabel>
                  <Select
                    value={summaryPeriod}
                    label="Период"
                    onChange={(e) => setSummaryPeriod(e.target.value as PeriodKey)}
                  >
                    {PERIOD_OPTIONS.map((o) => (
                      <MenuItem key={o.value} value={o.value}>
                        {o.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  label="Дата"
                  type="date"
                  value={summaryBaseDate.toISOString().slice(0, 10)}
                  onChange={(e) => setSummaryBaseDate(new Date(e.target.value))}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 160 }}
                />
              </Box>
              <Typography variant="body2">
                Доходы: <strong sx={{ color: 'success.main' }}>{periodIncome.toFixed(2)}</strong>
              </Typography>
              <Typography variant="body2">
                Расходы: <strong sx={{ color: 'error.main' }}>{periodExpense.toFixed(2)}</strong>
              </Typography>
              <Typography variant="body2">
                Сальдо: <strong>{periodBalance.toFixed(2)}</strong>
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card variant="outlined">
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                Общие показатели (все операции)
              </Typography>
              <Typography variant="body2">
                Свободный остаток: <strong>{freeRemainder.toFixed(2)}</strong>
              </Typography>
              <Typography variant="body2">
                Осталось нераспределённым: <strong>{unallocated.toFixed(2)}</strong>
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 200, fontWeight: 700 }}>Статья</TableCell>
              {tableDates.map((d) => (
                <TableCell key={d} align="right" sx={{ minWidth: 90 }}>
                  {format(new Date(d + 'T12:00:00'), 'dd.MM', { locale: ru })}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                Итого
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              <TableCell colSpan={tableDates.length + 2} sx={{ fontWeight: 600 }}>
                Доходы
              </TableCell>
            </TableRow>
            {incomeArticles.map((art) => {
              const rowTotal = tableDates.reduce((s, date) => s + getCell(date, art.id), 0);
              return (
                <TableRow key={art.id}>
                  <TableCell sx={{ pl: 3 }}>{art.name}</TableCell>
                  {tableDates.map((d) => (
                    <TableCell key={d} align="right" sx={{ color: 'success.main' }}>
                      {getCell(d, art.id) !== 0 ? getCell(d, art.id).toFixed(2) : '—'}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>
                    {rowTotal !== 0 ? rowTotal.toFixed(2) : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow>
              <TableCell sx={{ pl: 3, fontStyle: 'italic' }}>Без статьи</TableCell>
              {tableDates.map((d) => {
                const v = byDateAndArticle.get(d)?.get('__income__') ?? 0;
                return (
                  <TableCell key={d} align="right" sx={{ color: 'success.main' }}>
                    {v !== 0 ? v.toFixed(2) : '—'}
                  </TableCell>
                );
              })}
              <TableCell align="right">—</TableCell>
            </TableRow>
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              <TableCell colSpan={tableDates.length + 2} sx={{ fontWeight: 600 }}>
                Расходы
              </TableCell>
            </TableRow>
            {expenseArticles.map((art) => {
              const rowTotal = tableDates.reduce((s, date) => s + getCell(date, art.id), 0);
              return (
                <TableRow key={art.id}>
                  <TableCell sx={{ pl: 3 }}>{art.name}</TableCell>
                  {tableDates.map((d) => (
                    <TableCell key={d} align="right" sx={{ color: 'error.main' }}>
                      {getCell(d, art.id) !== 0 ? (-getCell(d, art.id)).toFixed(2) : '—'}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 600, color: 'error.main' }}>
                    {rowTotal !== 0 ? (-rowTotal).toFixed(2) : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow>
              <TableCell sx={{ pl: 3, fontStyle: 'italic' }}>Без статьи</TableCell>
              {tableDates.map((d) => {
                const v = byDateAndArticle.get(d)?.get('__expense__') ?? 0;
                return (
                  <TableCell key={d} align="right" sx={{ color: 'error.main' }}>
                    {v !== 0 ? v.toFixed(2) : '—'}
                  </TableCell>
                );
              })}
              <TableCell align="right">—</TableCell>
            </TableRow>
            <TableRow sx={{ bgcolor: 'action.selected' }}>
              <TableCell sx={{ fontWeight: 700 }}>Итого по дням</TableCell>
              {tableDates.map((d) => {
                const t = getDateTotal(d);
                const saldo = t.income - t.expense;
                return (
                  <TableCell key={d} align="right" sx={{ fontWeight: 600 }}>
                    {saldo >= 0 ? '+' : ''}{saldo.toFixed(2)}
                  </TableCell>
                );
              })}
              <TableCell align="right" sx={{ fontWeight: 700 }}>
                {freeRemainder >= 0 ? '+' : ''}{freeRemainder.toFixed(2)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
}
