import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  Button,
} from '@mui/material';
import { ArrowForward } from '@mui/icons-material';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [summaryPeriod, setSummaryPeriod] = useState<PeriodKey>('month');
  const [summaryBaseDate, setSummaryBaseDate] = useState(() => new Date());
  const [rangeFrom, setRangeFrom] = useState<string>('');
  const [rangeTo, setRangeTo] = useState<string>('');
  const [monthFilter, setMonthFilter] = useState<string>('all');

  const personalOps = useMemo(
    () => operations.filter((o) => o.target === 'personal'),
    [operations]
  );

  const leninetsOps = useMemo(() => operations.filter((o) => o.target === 'leninets'), [operations]);
  const gogolMogolOps = useMemo(() => operations.filter((o) => o.target === 'gogol_mogol'), [operations]);
  const academyOps = useMemo(() => operations.filter((o) => o.target === 'academy'), [operations]);

  const leninetsIncome = useMemo(() => leninetsOps.filter((o) => o.amount > 0).reduce((s, o) => s + o.amount, 0), [leninetsOps]);
  const leninetsExpense = useMemo(() => leninetsOps.filter((o) => o.amount < 0).reduce((s, o) => s + Math.abs(o.amount), 0), [leninetsOps]);
  const gogolIncome = useMemo(() => gogolMogolOps.filter((o) => o.amount > 0).reduce((s, o) => s + o.amount, 0), [gogolMogolOps]);
  const gogolExpense = useMemo(() => gogolMogolOps.filter((o) => o.amount < 0).reduce((s, o) => s + Math.abs(o.amount), 0), [gogolMogolOps]);
  const academyIncome = useMemo(() => academyOps.filter((o) => o.amount > 0).reduce((s, o) => s + o.amount, 0), [academyOps]);
  const academyExpense = useMemo(() => academyOps.filter((o) => o.amount < 0).reduce((s, o) => s + Math.abs(o.amount), 0), [academyOps]);

  const dates = useMemo(() => {
    const set = new Set<string>();
    personalOps.forEach((o) => set.add(o.date));
    return Array.from(set).sort();
  }, [personalOps]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    personalOps.forEach((o) => {
      if (o.date.length >= 7) {
        set.add(o.date.slice(0, 7)); // YYYY-MM
      }
    });
    return Array.from(set).sort();
  }, [personalOps]);

  const tableDates = useMemo(() => {
    let filtered = dates;
    if (monthFilter !== 'all') {
      filtered = dates.filter((d) => d.startsWith(monthFilter));
    }
    if (filtered.length === 0) {
      const today = format(new Date(), 'yyyy-MM-dd');
      return [today];
    }
    return filtered;
  }, [dates, monthFilter]);

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

  const rangeIncome = useMemo(() => {
    if (!rangeFrom && !rangeTo) return 0;
    const from = rangeFrom ? new Date(rangeFrom + 'T00:00:00') : null;
    const to = rangeTo ? new Date(rangeTo + 'T23:59:59') : null;
    return personalOps
      .filter((o) => {
        if (o.amount <= 0) return false;
        const d = new Date(o.date + 'T12:00:00');
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      })
      .reduce((s, o) => s + o.amount, 0);
  }, [personalOps, rangeFrom, rangeTo]);

  const rangeExpense = useMemo(() => {
    if (!rangeFrom && !rangeTo) return 0;
    const from = rangeFrom ? new Date(rangeFrom + 'T00:00:00') : null;
    const to = rangeTo ? new Date(rangeTo + 'T23:59:59') : null;
    return personalOps
      .filter((o) => {
        if (o.amount >= 0) return false;
        const d = new Date(o.date + 'T12:00:00');
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      })
      .reduce((s, o) => s + Math.abs(o.amount), 0);
  }, [personalOps, rangeFrom, rangeTo]);

  const rangeBalance = rangeIncome - rangeExpense;

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
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography color="text.secondary" gutterBottom fontWeight={600}>
                Ленинец
              </Typography>
              <Typography variant="body2">
                Доходы: <Box component="span" sx={{ color: 'success.main', fontWeight: 600 }}>{leninetsIncome.toFixed(2)}</Box>
              </Typography>
              <Typography variant="body2">
                Расходы: <Box component="span" sx={{ color: 'error.main', fontWeight: 600 }}>{leninetsExpense.toFixed(2)}</Box>
              </Typography>
              <Typography variant="body2">
                Итого: <Box component="strong">{(leninetsIncome - leninetsExpense).toFixed(2)}</Box>
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography color="text.secondary" gutterBottom fontWeight={600}>
                Гоголь Моголь
              </Typography>
              <Typography variant="body2">
                Доходы: <Box component="span" sx={{ color: 'success.main', fontWeight: 600 }}>{gogolIncome.toFixed(2)}</Box>
              </Typography>
              <Typography variant="body2">
                Расходы: <Box component="span" sx={{ color: 'error.main', fontWeight: 600 }}>{gogolExpense.toFixed(2)}</Box>
              </Typography>
              <Typography variant="body2">
                Итого: <Box component="strong">{(gogolIncome - gogolExpense).toFixed(2)}</Box>
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card variant="outlined">
            <CardContent>
              <Typography color="text.secondary" gutterBottom fontWeight={600}>
                Счёт академии
              </Typography>
              <Typography variant="body2">
                Доходы: <Box component="span" sx={{ color: 'success.main', fontWeight: 600 }}>{academyIncome.toFixed(2)}</Box>
              </Typography>
              <Typography variant="body2">
                Расходы: <Box component="span" sx={{ color: 'error.main', fontWeight: 600 }}>{academyExpense.toFixed(2)}</Box>
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Итого: <Box component="strong">{(academyIncome - academyExpense).toFixed(2)}</Box>
              </Typography>
              <Button
                size="small"
                variant="outlined"
                endIcon={<ArrowForward />}
                onClick={() => setSearchParams({ tab: 'articles' })}
              >
                Настройки статей
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

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
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
                <TextField
                  size="small"
                  label="От"
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 150 }}
                />
                <TextField
                  size="small"
                  label="До"
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 150 }}
                />
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Месяц (таблица)</InputLabel>
                  <Select
                    value={monthFilter}
                    label="Месяц (таблица)"
                    onChange={(e) => setMonthFilter(e.target.value)}
                  >
                    <MenuItem value="all">Все месяцы</MenuItem>
                    {monthOptions.map((m) => (
                      <MenuItem key={m} value={m}>
                        {format(new Date(m + '-01T12:00:00'), 'LLLL yyyy', { locale: ru })}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              <Typography variant="body2">
                Доходы: <Box component="strong" sx={{ color: 'success.main' }}>{periodIncome.toFixed(2)}</Box>
              </Typography>
              <Typography variant="body2">
                Расходы: <Box component="strong" sx={{ color: 'error.main' }}>{periodExpense.toFixed(2)}</Box>
              </Typography>
              <Typography variant="body2">
                Сальдо: <Box component="strong">{periodBalance.toFixed(2)}</Box>
              </Typography>
              {(rangeFrom || rangeTo) && (
                <>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    По фильтру от/до:
                  </Typography>
                  <Typography variant="body2">
                    Доходы: <Box component="strong" sx={{ color: 'success.main' }}>{rangeIncome.toFixed(2)}</Box>
                  </Typography>
                  <Typography variant="body2">
                    Расходы: <Box component="strong" sx={{ color: 'error.main' }}>{rangeExpense.toFixed(2)}</Box>
                  </Typography>
                  <Typography variant="body2">
                    Сальдо: <Box component="strong">{rangeBalance.toFixed(2)}</Box>
                  </Typography>
                </>
              )}
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
                Свободный остаток: <Box component="strong">{freeRemainder.toFixed(2)}</Box>
              </Typography>
              <Typography variant="body2">
                Осталось нераспределённым: <Box component="strong">{unallocated.toFixed(2)}</Box>
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell
                sx={{
                  minWidth: 200,
                  fontWeight: 700,
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  bgcolor: 'background.paper',
                }}
              >
                Статья
              </TableCell>
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
                  <TableCell
                    sx={{
                      pl: 3,
                      position: 'sticky',
                      left: 0,
                      zIndex: 2,
                      bgcolor: 'background.paper',
                    }}
                  >
                    {art.name}
                  </TableCell>
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
              <TableCell
                sx={{
                  pl: 3,
                  fontStyle: 'italic',
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  bgcolor: 'background.paper',
                }}
              >
                Без статьи
              </TableCell>
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
                  <TableCell
                    sx={{
                      pl: 3,
                      position: 'sticky',
                      left: 0,
                      zIndex: 2,
                      bgcolor: 'background.paper',
                    }}
                  >
                    {art.name}
                  </TableCell>
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
              <TableCell
                sx={{
                  pl: 3,
                  fontStyle: 'italic',
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  bgcolor: 'background.paper',
                }}
              >
                Без статьи
              </TableCell>
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
              <TableCell
                sx={{
                  fontWeight: 700,
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  bgcolor: 'background.paper',
                }}
              >
                Итого по дням
              </TableCell>
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
