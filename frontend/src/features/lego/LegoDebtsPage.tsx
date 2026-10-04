import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardContent, Chip, Grid, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { LegoShell } from './LegoShell';
import { formatDate, formatMoney, getDebts, LegoDebtRow, LegoDebtSummary, PAYMENT_STATUS_COLOR, PAYMENT_STATUS_LABEL } from './legoApi';

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'due_soon', label: 'Скоро оплата' },
  { key: 'overdue', label: 'Просрочено' },
  { key: 'overdue_3', label: '3+ дней' },
  { key: 'overdue_10', label: '10+ дней' },
  { key: 'unpaid', label: 'Не платил вообще' },
];

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Card variant="outlined">
    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6">{value ?? '—'}</Typography>
    </CardContent>
  </Card>
);

const LegoDebtsPage: React.FC = () => {
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState<LegoDebtRow[]>([]);
  const [summary, setSummary] = useState<LegoDebtSummary | null>(null);
  const [moneyVisible, setMoneyVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDebts(filter)
      .then((d) => {
        setRows(d.rows);
        setSummary(d.summary);
        setMoneyVisible(d.money_visible);
      })
      .catch(() => setError('Не удалось загрузить долги'));
  }, [filter]);

  return (
    <LegoShell title="Долги">
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {summary && (
        <Grid container spacing={1.5} sx={{ mb: 3 }}>
          <Grid item xs={6} md={3}><Stat label="Активных детей" value={summary.total_active} /></Grid>
          <Grid item xs={6} md={3}><Stat label="Оплачено" value={summary.paid_ok} /></Grid>
          <Grid item xs={6} md={3}><Stat label="Скоро оплата" value={summary.due_soon} /></Grid>
          <Grid item xs={6} md={3}><Stat label="Просрочено" value={summary.overdue} /></Grid>
          <Grid item xs={6} md={3}><Stat label="Просрочено 3+" value={summary.overdue_3} /></Grid>
          <Grid item xs={6} md={3}><Stat label="Просрочено 10+" value={summary.overdue_10} /></Grid>
          {moneyVisible && (
            <Grid item xs={12} md={6}><Stat label="Ожидаемая сумма задолженности" value={formatMoney(summary.expected_debt_amount)} /></Grid>
          )}
        </Grid>
      )}

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <Button key={f.key} size="small" variant={filter === f.key ? 'contained' : 'outlined'} onClick={() => setFilter(f.key)}>
            {f.label}
          </Button>
        ))}
      </Stack>

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Ребёнок</TableCell>
              <TableCell>Группа</TableCell>
              <TableCell>Родитель</TableCell>
              <TableCell>Телефон</TableCell>
              <TableCell align="right">Сумма</TableCell>
              <TableCell>Следующая оплата</TableCell>
              <TableCell align="right">Просрочка, дн.</TableCell>
              <TableCell>Статус</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.student_id} hover component={RouterLink} to={`/lego/students/${r.student_id}`} sx={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}>
                <TableCell>{r.full_name}</TableCell>
                <TableCell>{r.group_name ?? '—'}</TableCell>
                <TableCell>{r.parent_name ?? '—'}</TableCell>
                <TableCell>{r.parent_phone ?? '—'}</TableCell>
                <TableCell align="right">{formatMoney(r.payment_amount)}</TableCell>
                <TableCell>{formatDate(r.next_payment_date)}</TableCell>
                <TableCell align="right">{r.days_overdue || '—'}</TableCell>
                <TableCell><Chip size="small" color={PAYMENT_STATUS_COLOR[r.status]} label={PAYMENT_STATUS_LABEL[r.status]} /></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={8}><Typography color="text.secondary">Нет детей по выбранному фильтру</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </LegoShell>
  );
};

export default LegoDebtsPage;
