import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { FinanceAnalyticsSummary } from '../types';
import {
  AccountBalance,
  Add,
  ArrowDownward,
  ArrowUpward,
  BarChart,
  CheckCircle,
  ChevronRight,
  Delete,
  Edit,
  ExpandLess,
  ExpandMore,
  FiberManualRecord,
  Payment,
  SwapHoriz,
  TrendingDown,
  TrendingFlat,
  TrendingUp,
  Warning,
} from '@mui/icons-material';
import {
  Bar,
  BarChart as ReBarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Layout from '../components/Layout';
import { financeHubApi, financeApi } from '../services/api';
import type {
  HubAccount,
  HubAllocation,
  HubChart,
  HubDebt,
  HubForecast,
  HubSummary,
  HubTransaction,
  HubTransactionByProjectRow,
} from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────

const fmt = (n: number, currency = 'KZT') =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const CATEGORY_LABELS: Record<string, string> = {
  project_revenue: 'Доход проекта',
  investment: 'Инвестиции',
  personal_income: 'Личный доход',
  loan_received: 'Полученный займ',
  other_income: 'Прочие доходы',
  salary: 'Зарплата',
  operations: 'Операции',
  marketing: 'Маркетинг',
  personal_expense: 'Личные расходы',
  loan_repayment: 'Погашение долга',
  tax: 'Налоги',
  other_expense: 'Прочие расходы',
  allocation_in: 'Пополнение',
  allocation_out: 'Перевод',
};

// ─── Block wrapper ─────────────────────────────────────────────────────────

interface BlockProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  action?: React.ReactNode;
}

const Block: React.FC<BlockProps> = ({ title, icon, children, collapsible = true, defaultOpen = true, action }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Paper elevation={2} sx={{ mb: 3, borderRadius: 2, overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex', alignItems: 'center', px: 2.5, py: 1.5,
          bgcolor: 'grey.50', borderBottom: open ? '1px solid' : 'none', borderColor: 'divider',
          cursor: collapsible ? 'pointer' : 'default',
        }}
        onClick={collapsible ? () => setOpen(o => !o) : undefined}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
          {icon}
          <Typography fontWeight={600} fontSize={15}>{title}</Typography>
        </Box>
        {action && <Box onClick={e => e.stopPropagation()}>{action}</Box>}
        {collapsible && (open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />)}
      </Box>
      <Collapse in={open}>
        <Box sx={{ p: 2.5 }}>{children}</Box>
      </Collapse>
    </Paper>
  );
};

// ─── MetricCard ────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: number;
  currency?: string;
  color?: string;
  icon?: React.ReactNode;
  delta?: number;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, currency = 'KZT', color, icon, delta }) => (
  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      {icon}
    </Box>
    <Typography variant="h6" fontWeight={700} color={color || 'text.primary'}>
      {fmt(value, currency)}
    </Typography>
    {delta !== undefined && (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
        {delta > 0 ? <TrendingUp fontSize="small" color="success" /> :
          delta < 0 ? <TrendingDown fontSize="small" color="error" /> :
            <TrendingFlat fontSize="small" color="disabled" />}
        <Typography variant="caption" color={delta > 0 ? 'success.main' : delta < 0 ? 'error.main' : 'text.secondary'}>
          {delta > 0 ? '+' : ''}{fmt(delta, currency)}
        </Typography>
      </Box>
    )}
  </Paper>
);

// ─── DebtStatusChip ────────────────────────────────────────────────────────

const DebtStatusChip: React.FC<{ debt: HubDebt }> = ({ debt }) => {
  if (debt.is_overdue) return <Chip size="small" color="error" icon={<Warning />} label="Просрочен" />;
  if (debt.days_until_due !== null && debt.days_until_due <= 7 && debt.status !== 'closed')
    return <Chip size="small" color="warning" icon={<Warning />} label={`${debt.days_until_due} дн.`} />;
  if (debt.status === 'closed') return <Chip size="small" color="success" icon={<CheckCircle />} label="Закрыт" />;
  if (debt.status === 'partially_paid') return <Chip size="small" color="info" label="Частично" />;
  return <Chip size="small" color="default" label="Активен" />;
};

// ─── Main Page ─────────────────────────────────────────────────────────────

const FinanceHubContent: React.FC = () => {
  // Period filter
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(today());
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('month');

  // Data
  const [summary, setSummary] = useState<HubSummary | null>(null);
  const [chart, setChart] = useState<HubChart | null>(null);
  const [accounts, setAccounts] = useState<HubAccount[]>([]);
  const [transactions, setTransactions] = useState<HubTransaction[]>([]);
  const [byProject, setByProject] = useState<HubTransactionByProjectRow[]>([]);
  const [debts, setDebts] = useState<HubDebt[]>([]);
  const [allocations, setAllocations] = useState<HubAllocation[]>([]);
  const [forecast, setForecast] = useState<HubForecast | null>(null);

  // Analytics
  const [pnlFrom, setPnlFrom] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [pnlTo, setPnlTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [analytics, setAnalytics] = useState<FinanceAnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // Loading / Error
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialogs
  const [addTxOpen, setAddTxOpen] = useState(false);
  const [addDebtOpen, setAddDebtOpen] = useState(false);
  const [addAllocOpen, setAddAllocOpen] = useState(false);
  const [payDebtId, setPayDebtId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState('');

  // New transaction form
  const [txForm, setTxForm] = useState({
    account_id: '', direction: 'income', category: 'project_revenue',
    amount: '', transaction_date: today(), hub_status: 'completed', description: '',
  });

  // New debt form
  const [debtForm, setDebtForm] = useState({
    debt_type: 'owe', counterparty: '', amount: '', currency: 'KZT',
    due_date: '', description: '',
  });

  // New allocation form
  const [allocForm, setAllocForm] = useState({
    amount: '', from_account_id: '', to_type: 'personal', to_account_id: '', date: today(), comment: '',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sum, ch, accts, txs, byProj, dbs, allocs, fcast] = await Promise.all([
        financeHubApi.getSummary({ date_from: dateFrom, date_to: dateTo }),
        financeHubApi.getChart({ date_from: dateFrom, date_to: dateTo, group_by: groupBy }),
        financeHubApi.listAccounts(),
        financeHubApi.listTransactions({ date_from: dateFrom, date_to: dateTo }),
        financeHubApi.getByProject({ date_from: dateFrom, date_to: dateTo }),
        financeHubApi.listDebts(),
        financeHubApi.listAllocations({ date_from: dateFrom, date_to: dateTo }),
        financeHubApi.getForecast(),
      ]);
      setSummary(sum);
      setChart(ch);
      setAccounts(accts);
      setTransactions(txs);
      setByProject(byProj);
      setDebts(dbs);
      setAllocations(allocs);
      setForecast(fcast);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, groupBy]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    financeApi
      .getAnalyticsSummary({ date_from: pnlFrom || undefined, date_to: pnlTo || undefined, group_by: 'month' })
      .then(setAnalytics)
      .catch((err: any) => {
        setAnalyticsError(err?.response?.data?.detail || err?.message || 'Не удалось загрузить аналитику');
        setAnalytics(null);
      })
      .finally(() => setAnalyticsLoading(false));
  }, [pnlFrom, pnlTo]);

  // ── Handlers ──
  const handleCreateTx = async () => {
    if (!txForm.account_id || !txForm.amount) return;
    await financeHubApi.createTransaction({
      account_id: Number(txForm.account_id),
      direction: txForm.direction,
      category: txForm.category,
      amount: Number(txForm.amount),
      transaction_date: txForm.transaction_date,
      hub_status: txForm.hub_status,
      description: txForm.description || undefined,
    });
    setAddTxOpen(false);
    setTxForm({ account_id: '', direction: 'income', category: 'project_revenue', amount: '', transaction_date: today(), hub_status: 'completed', description: '' });
    loadAll();
  };

  const handleCreateDebt = async () => {
    if (!debtForm.counterparty || !debtForm.amount) return;
    await financeHubApi.createDebt({
      debt_type: debtForm.debt_type,
      counterparty: debtForm.counterparty,
      amount: Number(debtForm.amount),
      currency: debtForm.currency,
      due_date: debtForm.due_date || undefined,
      description: debtForm.description || undefined,
    });
    setAddDebtOpen(false);
    setDebtForm({ debt_type: 'owe', counterparty: '', amount: '', currency: 'KZT', due_date: '', description: '' });
    loadAll();
  };

  const handleCreateAlloc = async () => {
    if (!allocForm.amount) return;
    await financeHubApi.createAllocation({
      amount: Number(allocForm.amount),
      from_account_id: allocForm.from_account_id ? Number(allocForm.from_account_id) : undefined,
      to_type: allocForm.to_type,
      to_account_id: allocForm.to_account_id ? Number(allocForm.to_account_id) : undefined,
      date: allocForm.date,
      comment: allocForm.comment || undefined,
    });
    setAddAllocOpen(false);
    setAllocForm({ amount: '', from_account_id: '', to_type: 'personal', to_account_id: '', date: today(), comment: '' });
    loadAll();
  };

  const handlePayDebt = async () => {
    if (!payDebtId || !payAmount) return;
    await financeHubApi.payDebt(payDebtId, Number(payAmount));
    setPayDebtId(null);
    setPayAmount('');
    loadAll();
  };

  const handleDeleteDebt = async (id: number) => {
    if (!window.confirm('Удалить долг?')) return;
    await financeHubApi.deleteDebt(id);
    loadAll();
  };

  const handleDeleteAlloc = async (id: number) => {
    if (!window.confirm('Отменить распределение? Транзакции будут откатаны.')) return;
    await financeHubApi.deleteAllocation(id);
    loadAll();
  };

  const incomeCategories = ['project_revenue', 'investment', 'personal_income', 'loan_received', 'other_income'];
  const expenseCategories = ['salary', 'operations', 'marketing', 'personal_expense', 'loan_repayment', 'tax', 'other_expense'];

  const incomeTxs = transactions.filter(t => t.direction === 'income' && t.hub_status === 'completed');
  const expenseTxs = transactions.filter(t => t.direction === 'expense' && t.hub_status === 'completed');
  const personalAccounts = accounts.filter(a => !a.project_id);
  const projectAccounts = accounts.filter(a => a.project_id);

  const activeDebts = debts.filter(d => d.status !== 'closed');
  const oweDebts = debts.filter(d => d.debt_type === 'owe');
  const owedDebts = debts.filter(d => d.debt_type === 'owed');

  return (
    <Box>
      {/* ── Period Filter ── */}
      <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography fontWeight={600} fontSize={14} sx={{ mr: 1 }}>📅 Период:</Typography>
          <TextField size="small" type="date" label="С" value={dateFrom} onChange={e => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
          <TextField size="small" type="date" label="По" value={dateTo} onChange={e => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
          <FormControl size="small" sx={{ width: 140 }}>
            <InputLabel>График</InputLabel>
            <Select label="График" value={groupBy} onChange={e => setGroupBy(e.target.value as 'day' | 'week' | 'month')}>
              <MenuItem value="day">По дням</MenuItem>
              <MenuItem value="week">По неделям</MenuItem>
              <MenuItem value="month">По месяцам</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="contained" size="small" startIcon={<Add />} onClick={() => setAddTxOpen(true)}>Транзакция</Button>
          <Button variant="outlined" size="small" startIcon={<SwapHoriz />} onClick={() => setAddAllocOpen(true)}>Распределить</Button>
        </Box>
      </Paper>

      {loading && <LinearProgress sx={{ mb: 2 }} />}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* ── БЛОК 1: Сводка ── */}
      <Block title="Блок 1 — Сводка" icon={<BarChart color="primary" />} collapsible={false}>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard label="Общий баланс" value={summary?.total_balance ?? 0} icon={<AccountBalance fontSize="small" color="primary" />} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard label="Пришло за период" value={summary?.period_income ?? 0} color="success.main" icon={<ArrowDownward fontSize="small" color="success" />} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard label="Ушло за период" value={summary?.period_expense ?? 0} color="error.main" icon={<ArrowUpward fontSize="small" color="error" />} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              label="Чистый поток"
              value={summary?.net_flow ?? 0}
              color={(summary?.net_flow ?? 0) >= 0 ? 'success.main' : 'error.main'}
              delta={summary?.net_flow}
            />
          </Grid>
        </Grid>

        {chart && chart.points.length > 0 && (
          <Box sx={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ReBarChart data={chart.points} margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <ReTooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="income" name="Доход" fill="#4caf50" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expense" name="Расход" fill="#f44336" radius={[3, 3, 0, 0]} />
              </ReBarChart>
            </ResponsiveContainer>
          </Box>
        )}
        {chart && chart.points.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
            <Typography variant="body2">Нет данных для графика за выбранный период</Typography>
          </Box>
        )}
      </Block>

      {/* ── БЛОК 2: Входящие и исходящие ── */}
      <Block title="Блок 2 — Входящие и исходящие" icon={<SwapHoriz color="primary" />}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="success.main" fontWeight={600} gutterBottom>
              ↓ Входящие ({fmt(summary?.period_income ?? 0)})
            </Typography>
            {incomeCategories.map(cat => {
              const catTxs = incomeTxs.filter(t => t.category === cat);
              if (!catTxs.length) return null;
              const total = catTxs.reduce((s, t) => s + t.amount, 0);
              return (
                <Box key={cat} sx={{ mb: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, px: 1, bgcolor: 'success.50', borderRadius: 1, cursor: 'pointer' }}>
                    <Typography variant="body2" fontWeight={500}>{CATEGORY_LABELS[cat] ?? cat}</Typography>
                    <Typography variant="body2" color="success.main" fontWeight={600}>{fmt(total)}</Typography>
                  </Box>
                  {catTxs.slice(0, 3).map(tx => (
                    <Box key={tx.id} sx={{ display: 'flex', justifyContent: 'space-between', px: 2, py: 0.25 }}>
                      <Typography variant="caption" color="text.secondary">{tx.description || tx.transaction_date}</Typography>
                      <Typography variant="caption" color="success.main">{fmt(tx.amount)}</Typography>
                    </Box>
                  ))}
                </Box>
              );
            })}
            {incomeTxs.length === 0 && <Typography variant="body2" color="text.secondary">Нет входящих за период</Typography>}
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="error.main" fontWeight={600} gutterBottom>
              ↑ Исходящие ({fmt(summary?.period_expense ?? 0)})
            </Typography>
            {expenseCategories.map(cat => {
              const catTxs = expenseTxs.filter(t => t.category === cat);
              if (!catTxs.length) return null;
              const total = catTxs.reduce((s, t) => s + t.amount, 0);
              return (
                <Box key={cat} sx={{ mb: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, px: 1, bgcolor: 'error.50', borderRadius: 1 }}>
                    <Typography variant="body2" fontWeight={500}>{CATEGORY_LABELS[cat] ?? cat}</Typography>
                    <Typography variant="body2" color="error.main" fontWeight={600}>{fmt(total)}</Typography>
                  </Box>
                  {catTxs.slice(0, 3).map(tx => (
                    <Box key={tx.id} sx={{ display: 'flex', justifyContent: 'space-between', px: 2, py: 0.25 }}>
                      <Typography variant="caption" color="text.secondary">{tx.description || tx.transaction_date}</Typography>
                      <Typography variant="caption" color="error.main">{fmt(tx.amount)}</Typography>
                    </Box>
                  ))}
                </Box>
              );
            })}
            {expenseTxs.length === 0 && <Typography variant="body2" color="text.secondary">Нет исходящих за период</Typography>}
          </Grid>
        </Grid>
      </Block>

      {/* ── БЛОК 3: По проектам ── */}
      <Block title="Блок 3 — Разбивка по проектам" icon={<ChevronRight color="primary" />}>
        {byProject.length > 0 ? (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell><strong>Проект</strong></TableCell>
                <TableCell align="right"><strong>Доход</strong></TableCell>
                <TableCell align="right"><strong>Расходы</strong></TableCell>
                <TableCell align="right"><strong>P&L</strong></TableCell>
                <TableCell align="right"><strong>Доля</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {byProject.map((row, i) => {
                const totalIncome = byProject.reduce((s, r) => s + r.income, 0);
                const share = totalIncome > 0 ? Math.round((row.income / totalIncome) * 100) : 0;
                return (
                  <TableRow key={i} hover>
                    <TableCell>{row.project_name}</TableCell>
                    <TableCell align="right" sx={{ color: 'success.main' }}>{fmt(row.income)}</TableCell>
                    <TableCell align="right" sx={{ color: 'error.main' }}>{fmt(row.expense)}</TableCell>
                    <TableCell align="right" sx={{ color: row.net >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                      {row.net >= 0 ? '+' : ''}{fmt(row.net)}
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                        <LinearProgress variant="determinate" value={share} sx={{ width: 60, height: 6, borderRadius: 3 }} />
                        <Typography variant="caption">{share}%</Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <Typography variant="body2" color="text.secondary">Нет данных по проектам за выбранный период</Typography>
        )}
      </Block>

      {/* ── БЛОК 4: Личные финансы ── */}
      <Block title="Блок 4 — Личные финансы" icon={<AccountBalance color="primary" />}>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          {personalAccounts.map(a => (
            <Grid item xs={12} sm={6} md={4} key={a.id}>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" fontWeight={500}>{a.name}</Typography>
                  <Chip size="small" label={a.account_type} variant="outlined" />
                </Box>
                <Typography variant="h6" fontWeight={700}>{fmt(a.balance, a.currency)}</Typography>
                <Typography variant="caption" color="text.secondary">{a.currency}</Typography>
              </Paper>
            </Grid>
          ))}
          {personalAccounts.length === 0 && (
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary">Нет личных счетов</Typography>
            </Grid>
          )}
        </Grid>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>Счета проектов</Typography>
        <Grid container spacing={2}>
          {projectAccounts.map(a => (
            <Grid item xs={12} sm={6} md={4} key={a.id}>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1.5, borderColor: 'primary.light' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" fontWeight={500}>{a.name}</Typography>
                  <FiberManualRecord fontSize="small" color="primary" />
                </Box>
                <Typography variant="h6" fontWeight={700}>{fmt(a.balance, a.currency)}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Block>

      {/* ── БЛОК 5: Долги и обязательства ── */}
      <Block
        title={`Блок 5 — Долги и обязательства ${activeDebts.length > 0 ? `(${activeDebts.length} активных)` : ''}`}
        icon={<Warning color={activeDebts.some(d => d.is_overdue) ? 'error' : 'primary'} />}
        action={<Button size="small" startIcon={<Add />} onClick={() => setAddDebtOpen(true)}>Добавить</Button>}
      >
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>Я должен</Typography>
            {oweDebts.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Нет долгов</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow><TableCell>Кому</TableCell><TableCell align="right">Остаток</TableCell><TableCell>Срок</TableCell><TableCell /></TableRow>
                </TableHead>
                <TableBody>
                  {oweDebts.map(d => (
                    <TableRow key={d.id} hover>
                      <TableCell>
                        <Typography variant="body2">{d.counterparty}</Typography>
                        <Typography variant="caption" color="text.secondary">{d.description}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600}>{fmt(d.debt_remaining, d.currency)}</Typography>
                        <LinearProgress variant="determinate" value={d.amount > 0 ? (d.paid_amount / d.amount) * 100 : 0} sx={{ height: 4, borderRadius: 2, mt: 0.5 }} />
                      </TableCell>
                      <TableCell><DebtStatusChip debt={d} /></TableCell>
                      <TableCell>
                        <Tooltip title="Выплатить">
                          <IconButton size="small" onClick={() => { setPayDebtId(d.id); setPayAmount(''); }} disabled={d.status === 'closed'}>
                            <Payment fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Удалить">
                          <IconButton size="small" color="error" onClick={() => handleDeleteDebt(d.id)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>Мне должны</Typography>
            {owedDebts.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Нет дебиторки</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow><TableCell>От кого</TableCell><TableCell align="right">Остаток</TableCell><TableCell>Срок</TableCell><TableCell /></TableRow>
                </TableHead>
                <TableBody>
                  {owedDebts.map(d => (
                    <TableRow key={d.id} hover>
                      <TableCell>
                        <Typography variant="body2">{d.counterparty}</Typography>
                        <Typography variant="caption" color="text.secondary">{d.description}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600} color="success.main">{fmt(d.debt_remaining, d.currency)}</Typography>
                      </TableCell>
                      <TableCell><DebtStatusChip debt={d} /></TableCell>
                      <TableCell>
                        <Tooltip title="Удалить">
                          <IconButton size="small" color="error" onClick={() => handleDeleteDebt(d.id)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Grid>
        </Grid>
      </Block>

      {/* ── БЛОК 6: Распределение ── */}
      <Block
        title="Блок 6 — Распределение средств"
        icon={<SwapHoriz color="primary" />}
        action={<Button size="small" startIcon={<Add />} onClick={() => setAddAllocOpen(true)}>Распределить</Button>}
      >
        {allocations.length > 0 ? (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell>Дата</TableCell>
                <TableCell>Сумма</TableCell>
                <TableCell>Откуда</TableCell>
                <TableCell>Куда</TableCell>
                <TableCell>Комментарий</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {allocations.map(a => (
                <TableRow key={a.id} hover>
                  <TableCell><Typography variant="body2">{a.date}</Typography></TableCell>
                  <TableCell><Typography variant="body2" fontWeight={600}>{fmt(a.amount, a.currency)}</Typography></TableCell>
                  <TableCell><Typography variant="body2">{a.from_account_name ?? '—'}</Typography></TableCell>
                  <TableCell><Typography variant="body2">{a.to_account_name ?? a.to_project_name ?? '—'}</Typography></TableCell>
                  <TableCell><Typography variant="caption" color="text.secondary">{a.comment ?? ''}</Typography></TableCell>
                  <TableCell>
                    <Tooltip title="Отменить">
                      <IconButton size="small" color="error" onClick={() => handleDeleteAlloc(a.id)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Typography variant="body2" color="text.secondary">Нет распределений за выбранный период</Typography>
        )}
      </Block>

      {/* ── БЛОК 7: Планирование и прогноз ── */}
      <Block title="Блок 7 — Планирование и прогноз" icon={<TrendingUp color="primary" />}>
        {forecast && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: 'primary.50' }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={4}>
                <Typography variant="caption" color="text.secondary">Баланс сейчас</Typography>
                <Typography variant="h6" fontWeight={700}>{fmt(forecast.current_balance)}</Typography>
              </Grid>
              <Grid item xs={12} md={1} sx={{ textAlign: 'center' }}>
                <Typography color="text.secondary">→</Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="caption" color="text.secondary">Ожидаемый баланс</Typography>
                <Typography variant="h6" fontWeight={700} color={forecast.forecast_balance >= 0 ? 'success.main' : 'error.main'}>
                  {fmt(forecast.forecast_balance)}
                </Typography>
              </Grid>
              <Grid item xs={12} md={3}>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Box>
                    <Typography variant="caption" color="success.main">+ {fmt(forecast.planned_income)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="error.main">− {fmt(forecast.planned_expense)}</Typography>
                  </Box>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        )}

        {forecast && forecast.planned_transactions.length > 0 ? (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell>Дата</TableCell>
                <TableCell>Описание</TableCell>
                <TableCell>Направление</TableCell>
                <TableCell align="right">Сумма</TableCell>
                <TableCell>Статус</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {forecast.planned_transactions.map(tx => (
                <TableRow key={tx.id} hover>
                  <TableCell><Typography variant="body2">{tx.transaction_date ?? '—'}</Typography></TableCell>
                  <TableCell><Typography variant="body2">{tx.description ?? CATEGORY_LABELS[tx.category ?? ''] ?? tx.category}</Typography></TableCell>
                  <TableCell>
                    <Chip size="small" label={tx.direction === 'income' ? 'Доход' : 'Расход'}
                      color={tx.direction === 'income' ? 'success' : 'error'} variant="outlined" />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={600} color={tx.direction === 'income' ? 'success.main' : 'error.main'}>
                      {tx.direction === 'income' ? '+' : '−'}{fmt(tx.amount)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={tx.hub_status === 'planned' ? 'Запланировано' : 'Ожидается'} color="warning" variant="outlined" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Typography variant="body2" color="text.secondary">Нет запланированных транзакций</Typography>
        )}
      </Block>

      {/* ── БЛОК 8: Аналитика (P&L) ── */}
      <Block title="Блок 8 — Финансовая аналитика (P&L)" icon={<BarChart color="primary" />}>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField size="small" type="date" label="С" value={pnlFrom} onChange={e => setPnlFrom(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
          <TextField size="small" type="date" label="По" value={pnlTo} onChange={e => setPnlTo(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 160 }} />
          {analyticsLoading && <Typography variant="body2" color="text.secondary">Загрузка...</Typography>}
        </Box>
        {analyticsError && <Alert severity="error" sx={{ mb: 2 }}>{analyticsError}</Alert>}
        {!analyticsLoading && !analyticsError && !analytics && (
          <Typography variant="body2" color="text.secondary">Нет данных за выбранный период.</Typography>
        )}
        {analytics && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="caption" color="text.secondary">Доходы</Typography>
                  <Typography variant="h5" sx={{ mt: 1 }}>{analytics.kpi.income_total.toFixed(2)}</Typography>
                  <Typography variant="body2" color={analytics.kpi.income_delta >= 0 ? 'success.main' : 'error.main'}>
                    Δ {analytics.kpi.income_delta >= 0 ? '+' : ''}{analytics.kpi.income_delta.toFixed(2)}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} md={3}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="caption" color="text.secondary">Расходы</Typography>
                  <Typography variant="h5" sx={{ mt: 1 }}>{analytics.kpi.expense_total.toFixed(2)}</Typography>
                  <Typography variant="body2" color={analytics.kpi.expense_delta <= 0 ? 'success.main' : 'error.main'}>
                    Δ {analytics.kpi.expense_delta >= 0 ? '+' : ''}{analytics.kpi.expense_delta.toFixed(2)}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} md={3}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="caption" color="text.secondary">Прибыль</Typography>
                  <Typography variant="h5" sx={{ mt: 1 }}>{analytics.kpi.profit_total.toFixed(2)}</Typography>
                  <Typography variant="body2" color={analytics.kpi.profit_delta >= 0 ? 'success.main' : 'error.main'}>
                    Δ {analytics.kpi.profit_delta >= 0 ? '+' : ''}{analytics.kpi.profit_delta.toFixed(2)}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} md={3}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="caption" color="text.secondary">Контроль качества</Typography>
                  <Typography variant="h5" sx={{ mt: 1 }}>
                    {analytics.kpi.overdue_payments_3_count} / {analytics.kpi.unclassified_transactions_count}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Просрочки 10+: {analytics.kpi.overdue_payments_10_count}, неразобранное: {analytics.kpi.unclassified_transactions_amount.toFixed(2)}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>P&L по периоду</Typography>
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
                  {analytics.pnl.map((row) => (
                    <TableRow key={row.period}>
                      <TableCell>{row.period}</TableCell>
                      <TableCell align="right">{row.income.toFixed(2)}</TableCell>
                      <TableCell align="right">{row.expense.toFixed(2)}</TableCell>
                      <TableCell align="right" sx={{ color: row.profit >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                        {row.profit.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>

            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>По проектам</Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Проект</TableCell>
                        <TableCell align="right">Доходы</TableCell>
                        <TableCell align="right">Расходы</TableCell>
                        <TableCell align="right">Прибыль</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {analytics.target_breakdown.map((row) => (
                        <TableRow key={row.target_code}>
                          <TableCell>{row.target_name}</TableCell>
                          <TableCell align="right">{row.income.toFixed(2)}</TableCell>
                          <TableCell align="right">{row.expense.toFixed(2)}</TableCell>
                          <TableCell align="right" sx={{ color: row.profit >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                            {row.profit.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>Топ расходов по статьям</Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Статья</TableCell>
                        <TableCell>Тип</TableCell>
                        <TableCell align="right">Сумма</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {analytics.expense_breakdown.map((row) => (
                        <TableRow key={`${row.article_id ?? 'none'}-${row.article_name}`}>
                          <TableCell>{row.article_name}</TableCell>
                          <TableCell>{row.cost_kind || '—'}</TableCell>
                          <TableCell align="right">{row.amount.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>
              </Grid>
            </Grid>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>Остатки по счетам</Typography>
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
                  {analytics.account_balances.map((row) => (
                    <TableRow key={row.account_id}>
                      <TableCell>{row.account_name}{row.account_code ? ` (${row.account_code})` : ''}</TableCell>
                      <TableCell align="right">{row.income_total.toFixed(2)}</TableCell>
                      <TableCell align="right">{row.expense_total.toFixed(2)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{row.balance.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Box>
        )}
      </Block>

      {/* ─── Dialogs ─────────────────────────────────────────────────────── */}

      {/* Add Transaction */}
      <Dialog open={addTxOpen} onClose={() => setAddTxOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Добавить транзакцию</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Счёт</InputLabel>
            <Select label="Счёт" value={txForm.account_id} onChange={e => setTxForm(f => ({ ...f, account_id: e.target.value as string }))}>
              {accounts.map(a => <MenuItem key={a.id} value={a.id}>{a.name} ({fmt(a.balance, a.currency)})</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>Направление</InputLabel>
            <Select label="Направление" value={txForm.direction} onChange={e => setTxForm(f => ({ ...f, direction: e.target.value }))}>
              <MenuItem value="income">Доход</MenuItem>
              <MenuItem value="expense">Расход</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>Категория</InputLabel>
            <Select label="Категория" value={txForm.category} onChange={e => setTxForm(f => ({ ...f, category: e.target.value }))}>
              {(txForm.direction === 'income' ? incomeCategories : expenseCategories).map(c => (
                <MenuItem key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField size="small" label="Сумма" type="number" value={txForm.amount} onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))} />
          <TextField size="small" label="Дата" type="date" value={txForm.transaction_date} onChange={e => setTxForm(f => ({ ...f, transaction_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
          <FormControl fullWidth size="small">
            <InputLabel>Статус</InputLabel>
            <Select label="Статус" value={txForm.hub_status} onChange={e => setTxForm(f => ({ ...f, hub_status: e.target.value }))}>
              <MenuItem value="completed">Выполнен</MenuItem>
              <MenuItem value="pending">Ожидается</MenuItem>
              <MenuItem value="planned">Запланировано</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" label="Описание (опционально)" value={txForm.description} onChange={e => setTxForm(f => ({ ...f, description: e.target.value }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddTxOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleCreateTx} disabled={!txForm.account_id || !txForm.amount}>Добавить</Button>
        </DialogActions>
      </Dialog>

      {/* Add Debt */}
      <Dialog open={addDebtOpen} onClose={() => setAddDebtOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Добавить долг</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Тип</InputLabel>
            <Select label="Тип" value={debtForm.debt_type} onChange={e => setDebtForm(f => ({ ...f, debt_type: e.target.value }))}>
              <MenuItem value="owe">Я должен</MenuItem>
              <MenuItem value="owed">Мне должны</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" label="Контрагент" value={debtForm.counterparty} onChange={e => setDebtForm(f => ({ ...f, counterparty: e.target.value }))} />
          <TextField size="small" label="Сумма" type="number" value={debtForm.amount} onChange={e => setDebtForm(f => ({ ...f, amount: e.target.value }))} />
          <FormControl fullWidth size="small">
            <InputLabel>Валюта</InputLabel>
            <Select label="Валюта" value={debtForm.currency} onChange={e => setDebtForm(f => ({ ...f, currency: e.target.value }))}>
              <MenuItem value="KZT">KZT</MenuItem>
              <MenuItem value="USD">USD</MenuItem>
              <MenuItem value="RUB">RUB</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" label="Срок погашения" type="date" value={debtForm.due_date} onChange={e => setDebtForm(f => ({ ...f, due_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
          <TextField size="small" label="Описание" value={debtForm.description} onChange={e => setDebtForm(f => ({ ...f, description: e.target.value }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDebtOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleCreateDebt} disabled={!debtForm.counterparty || !debtForm.amount}>Добавить</Button>
        </DialogActions>
      </Dialog>

      {/* Pay Debt */}
      <Dialog open={payDebtId !== null} onClose={() => setPayDebtId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Зафиксировать выплату</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {payDebtId && (() => {
            const debt = debts.find(d => d.id === payDebtId);
            return debt ? (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2"><strong>{debt.counterparty}</strong> — остаток: {fmt(debt.debt_remaining, debt.currency)}</Typography>
              </Box>
            ) : null;
          })()}
          <TextField fullWidth size="small" label="Сумма выплаты" type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayDebtId(null)}>Отмена</Button>
          <Button variant="contained" onClick={handlePayDebt} disabled={!payAmount}>Выплатить</Button>
        </DialogActions>
      </Dialog>

      {/* Add Allocation */}
      <Dialog open={addAllocOpen} onClose={() => setAddAllocOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Распределить средства</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField size="small" label="Сумма" type="number" value={allocForm.amount} onChange={e => setAllocForm(f => ({ ...f, amount: e.target.value }))} />
          <FormControl fullWidth size="small">
            <InputLabel>Откуда</InputLabel>
            <Select label="Откуда" value={allocForm.from_account_id} onChange={e => setAllocForm(f => ({ ...f, from_account_id: e.target.value as string }))}>
              <MenuItem value="">Общий пул</MenuItem>
              {accounts.map(a => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>Куда (тип)</InputLabel>
            <Select label="Куда (тип)" value={allocForm.to_type} onChange={e => setAllocForm(f => ({ ...f, to_type: e.target.value }))}>
              <MenuItem value="personal">Личный счёт</MenuItem>
              <MenuItem value="project">Проект</MenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>Счёт-назначение</InputLabel>
            <Select label="Счёт-назначение" value={allocForm.to_account_id} onChange={e => setAllocForm(f => ({ ...f, to_account_id: e.target.value as string }))}>
              <MenuItem value="">—</MenuItem>
              {accounts.map(a => <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField size="small" label="Дата" type="date" value={allocForm.date} onChange={e => setAllocForm(f => ({ ...f, date: e.target.value }))} InputLabelProps={{ shrink: true }} />
          <TextField size="small" label="Комментарий" value={allocForm.comment} onChange={e => setAllocForm(f => ({ ...f, comment: e.target.value }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddAllocOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleCreateAlloc} disabled={!allocForm.amount}>Распределить</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

const FinanceHubPage: React.FC = () => (
  <Layout>
    <Box sx={{ px: { xs: 1, sm: 2, md: 3 }, py: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <AccountBalance color="primary" sx={{ fontSize: 28 }} />
        <Typography variant="h5" fontWeight={700}>Finance Hub</Typography>
        <Chip size="small" label="только owner" color="primary" variant="outlined" />
      </Box>
      <FinanceHubContent />
    </Box>
  </Layout>
);

export default FinanceHubPage;
