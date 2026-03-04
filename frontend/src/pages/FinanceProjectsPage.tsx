import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
} from '@mui/material';
import Layout from '../components/Layout';
import { financeApi } from '../services/api';
import type { FinanceLedgerBankRow } from '../types';

type ProjectTab = 'leninets' | 'gogol_mogol';

const PROJECT_LABELS: Record<ProjectTab, string> = {
  leninets: 'Ленинец',
  gogol_mogol: 'Гоголь-Моголь',
};

const FinanceProjectsPageContent: React.FC = () => {
  const [tab, setTab] = useState<ProjectTab>('leninets');
  const [journalRows, setJournalRows] = useState<FinanceLedgerBankRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [targets, setTargets] = useState<Array<{ id: number; code: string; name: string }>>([]);

  const currentTargetId = useMemo(() => {
    const t = targets.find((t) => t.code === tab);
    return t?.id ?? null;
  }, [targets, tab]);

  useEffect(() => {
    financeApi
      .listTargets()
      .then((list) => {
        setTargets(list.map((t) => ({ id: t.id, code: t.code, name: t.name })));
      })
      .catch(() => setTargets([]));
  }, []);

  useEffect(() => {
    if (!currentTargetId) {
      setJournalRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    financeApi
      .listJournalTransactions({
        target_ids: [currentTargetId],
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 5000,
      })
      .then(setJournalRows)
      .catch((err: any) => {
        setError(err?.response?.data?.detail || err?.message || 'Не удалось загрузить операции по проекту');
        setJournalRows([]);
      })
      .finally(() => setLoading(false));
  }, [currentTargetId, dateFrom, dateTo]);

  const saldo = useMemo(() => {
    return journalRows.reduce(
      (sum, row) =>
        sum +
        (row.direction === 'income' ? row.amount : row.direction === 'expense' ? -Math.abs(row.amount) : 0),
      0
    );
  }, [journalRows]);

  const incomeTotal = useMemo(
    () => journalRows.filter((r) => r.direction === 'income').reduce((s, r) => s + r.amount, 0),
    [journalRows]
  );
  const expenseTotal = useMemo(
    () => journalRows.filter((r) => r.direction === 'expense').reduce((s, r) => s + Math.abs(r.amount), 0),
    [journalRows]
  );

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
        >
          <Tab value="leninets" label="Ленинец" />
          <Tab value="gogol_mogol" label="Гоголь-Моголь" />
        </Tabs>
      </Box>

      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>
          {PROJECT_LABELS[tab]} — операции журнала
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
          <TextField
            label="С"
            type="date"
            size="small"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="По"
            type="date"
            size="small"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          {loading && (
            <Typography variant="body2" color="text.secondary">
              Загрузка…
            </Typography>
          )}
          {error && (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          )}
        </Box>

        <Paper variant="outlined" sx={{ mb: 2, p: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Сводка за период
          </Typography>
          <Typography variant="body2">
            Доходы:{' '}
            <Box component="span" sx={{ color: 'success.main', fontWeight: 600 }}>
              {incomeTotal.toFixed(2)}
            </Box>
          </Typography>
          <Typography variant="body2">
            Расходы:{' '}
            <Box component="span" sx={{ color: 'error.main', fontWeight: 600 }}>
              {expenseTotal.toFixed(2)}
            </Box>
          </Typography>
          <Typography variant="body2">
            Сальдо:{' '}
            <Box component="span" sx={{ fontWeight: 600 }}>
              {saldo.toFixed(2)}
            </Box>
          </Typography>
        </Paper>

        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Дата</TableCell>
                <TableCell>Счёт</TableCell>
                <TableCell>Статья</TableCell>
                <TableCell>Тип</TableCell>
                <TableCell align="right">Сумма</TableCell>
                <TableCell>Контрагент</TableCell>
                <TableCell>Описание / источник</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {journalRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {row.occurred_at ? new Date(row.occurred_at).toLocaleString('ru-RU') : '—'}
                  </TableCell>
                  <TableCell>
                    {row.account_name
                      ? `${row.account_name}${row.account_code ? ` (${row.account_code})` : ''}`
                      : '—'}
                  </TableCell>
                  <TableCell>{row.article_name || '—'}</TableCell>
                  <TableCell>
                    {row.direction === 'income'
                      ? 'Доход'
                      : row.direction === 'expense'
                      ? 'Расход'
                      : 'Перевод'}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: row.direction === 'expense' ? 'error.main' : 'success.main' }}
                  >
                    {row.amount.toFixed(2)}
                  </TableCell>
                  <TableCell>{row.counterparty_name || '—'}</TableCell>
                  <TableCell>
                    {row.bank_source
                      ? `${row.bank_source}${row.bank_operation_id ? ` (${row.bank_operation_id})` : ''}`
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {journalRows.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    Нет операций по проекту за выбранный период.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      </Box>
    </Box>
  );
};

const FinanceProjectsPage: React.FC = () => (
  <Layout>
    <FinanceProjectsPageContent />
  </Layout>
);

export default FinanceProjectsPage;

