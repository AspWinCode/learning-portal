import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import Layout from '../components/Layout';
import { financeApi } from '../services/api';
import type { FinanceAccountBalance, FinancePnlRow } from '../types';

const FinanceOverviewPageContent: React.FC = () => {
  const [asOf, setAsOf] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [balances, setBalances] = useState<FinanceAccountBalance[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesError, setBalancesError] = useState<string | null>(null);

  const [targetCode, setTargetCode] = useState<string>('academy');
  const [pnlFrom, setPnlFrom] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [pnlTo, setPnlTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [pnlRows, setPnlRows] = useState<FinancePnlRow[]>([]);
  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlError, setPnlError] = useState<string | null>(null);

  useEffect(() => {
    setBalancesLoading(true);
    setBalancesError(null);
    financeApi
      .getBalances(asOf ? { as_of: asOf } : undefined)
      .then(setBalances)
      .catch((err: any) => {
        setBalancesError(err?.response?.data?.detail || err?.message || 'Не удалось загрузить остатки по счетам');
      })
      .finally(() => setBalancesLoading(false));
  }, [asOf]);

  useEffect(() => {
    setPnlLoading(true);
    setPnlError(null);
    financeApi
      .getPnl({
        target_code: targetCode || 'academy',
        date_from: pnlFrom || undefined,
        date_to: pnlTo || undefined,
        group_by: 'month',
      })
      .then(setPnlRows)
      .catch((err: any) => {
        setPnlError(err?.response?.data?.detail || err?.message || 'Не удалось загрузить P&L');
      })
      .finally(() => setPnlLoading(false));
  }, [targetCode, pnlFrom, pnlTo]);

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Остатки по счетам
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
          <TextField
            label="На дату"
            type="date"
            size="small"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          {balancesLoading && (
            <Typography variant="body2" color="text.secondary">
              Загрузка…
            </Typography>
          )}
          {balancesError && (
            <Typography variant="body2" color="error">
              {balancesError}
            </Typography>
          )}
        </Box>
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Счёт</TableCell>
                <TableCell align="right">Доходы</TableCell>
                <TableCell align="right">Расходы</TableCell>
                <TableCell align="right">Остаток</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {balances.map((row) => (
                <TableRow key={row.account_id}>
                  <TableCell>
                    {row.account_name}
                    {row.account_code ? ` (${row.account_code})` : ''}
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'success.main' }}>
                    {row.income_total.toFixed(2)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'error.main' }}>
                    {row.expense_total.toFixed(2)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {row.balance.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
              {balances.length === 0 && !balancesLoading && (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    Нет данных по остаткам.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      </Box>

      <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>
          P&L по проекту
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Проект (target)</InputLabel>
            <Select
              label="Проект (target)"
              value={targetCode}
              onChange={(e) => setTargetCode(e.target.value as string)}
            >
              <MenuItem value="academy">Академия</MenuItem>
              <MenuItem value="personal">Личные</MenuItem>
              <MenuItem value="leninets">Ленинец</MenuItem>
              <MenuItem value="gogol_mogol">Гоголь Моголь</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="С"
            type="date"
            size="small"
            value={pnlFrom}
            onChange={(e) => setPnlFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="По"
            type="date"
            size="small"
            value={pnlTo}
            onChange={(e) => setPnlTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          {pnlLoading && (
            <Typography variant="body2" color="text.secondary">
              Загрузка…
            </Typography>
          )}
          {pnlError && (
            <Typography variant="body2" color="error">
              {pnlError}
            </Typography>
          )}
        </Box>
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Период</TableCell>
                <TableCell align="right">Доходы</TableCell>
                <TableCell align="right">Расходы</TableCell>
                <TableCell align="right">Прибыль</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pnlRows.map((row) => (
                <TableRow key={row.period}>
                  <TableCell>{row.period}</TableCell>
                  <TableCell align="right" sx={{ color: 'success.main' }}>
                    {row.income.toFixed(2)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'error.main' }}>
                    {row.expense.toFixed(2)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {row.profit.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
              {pnlRows.length === 0 && !pnlLoading && (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    Нет данных по P&L за выбранный период.
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

const FinanceOverviewPage: React.FC = () => (
  <Layout>
    <FinanceOverviewPageContent />
  </Layout>
);

export default FinanceOverviewPage;

