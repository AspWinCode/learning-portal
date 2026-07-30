import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AccountBalance,
  ArrowDownward,
  ArrowUpward,
  Close,
  CreditCard,
  ErrorOutline,
  SwapHoriz,
  TrendingDown,
  TrendingUp,
} from '@mui/icons-material';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie,
} from 'recharts';
import { financeApi } from '../services/api';
import type { CommandCenterResponse, FinanceLedgerBankRow } from '../types';

const PROJECT_COLORS = [
  '#185FA5', '#0F6E56', '#854F0B', '#534AB7', '#993C1D',
  '#3B6D11', '#993556', '#185F5F',
];

const fmt = (v: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(v));

const fmtPct = (v: number) =>
  `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;

const currentMonth = () => new Date().toISOString().slice(0, 7);

const monthLabel = (period: string) => {
  const [y, m] = period.split('-');
  const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
};

interface Props {
  onNavigateToJournal?: () => void;
}

type ArticleRow = { name: string; amount: number };

function groupByArticle(rows: FinanceLedgerBankRow[], direction: 'income' | 'expense'): ArticleRow[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.direction !== direction) continue;
    const key = r.article_name || 'Без статьи';
    map.set(key, (map.get(key) ?? 0) + Math.abs(r.amount));
  }
  return Array.from(map.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

const INCOME_COLOR = '#22c55e';
const EXPENSE_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f43f5e',
];

const fmtRub = (v: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' ₽';

// Recharts custom tooltip
const ChartTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: ArticleRow }> }) => {
  if (!active || !payload?.length) return null;
  return (
    <Paper variant="outlined" sx={{ px: 1.5, py: 0.75, borderRadius: 1.5 }}>
      <Typography variant="caption" sx={{ fontWeight: 600 }}>{payload[0].payload.name}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{fmtRub(payload[0].value)}</Typography>
    </Paper>
  );
};

const FinanceCommandCenter: React.FC<Props> = ({ onNavigateToJournal }) => {
  const [period, setPeriod] = useState(currentMonth);
  const [data, setData] = useState<CommandCenterResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalRows, setModalRows] = useState<FinanceLedgerBankRow[]>([]);
  const [drillArticle, setDrillArticle] = useState<{ name: string; direction: 'income' | 'expense' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await financeApi.getCommandCenter(period);
      setData(result);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e?.response?.data?.detail || e?.message || 'Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  const openPersonalModal = async () => {
    if (!data || data.personal_projects.length === 0) return;
    setModalOpen(true);
    setModalLoading(true);
    setDrillArticle(null);
    try {
      const targetIds = data.personal_projects
        .map((p) => p.target_id)
        .filter((id): id is number => id != null);
      const [y, m] = period.split('-');
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      const rows = await financeApi.listJournalTransactions({
        target_ids: targetIds.length > 0 ? targetIds : undefined,
        date_from: `${period}-01`,
        date_to: `${period}-${String(lastDay).padStart(2, '0')}`,
        limit: 5000,
      });
      setModalRows(rows);
    } catch {
      setModalRows([]);
    } finally {
      setModalLoading(false);
    }
  };

  const kpi = data?.kpi;
  const maxCashflow = data
    ? Math.max(...data.cashflow.map((p) => Math.max(p.income, p.expense)), 1)
    : 1;

  const projectColors: Record<string, string> = {};
  const projectColorsById: Record<number, string> = {};
  data?.projects.forEach((p, i) => {
    const color = PROJECT_COLORS[i % PROJECT_COLORS.length];
    projectColors[p.target_code] = color;
    if (p.target_id != null) projectColorsById[p.target_id] = color;
  });

  const totalIncome = data?.projects.reduce((s, p) => s + p.income, 0) ?? 0;


  return (
    <Stack spacing={1.5}>
      {/* Period selector */}
      <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
        <TextField
          type="month"
          size="small"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          InputLabelProps={{ shrink: true }}
          label="Период"
          sx={{ width: 160 }}
        />
        {loading && <CircularProgress size={18} />}
      </Stack>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* Alerts */}
      {data?.alerts && data.alerts.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {data.alerts.map((a, i) => (
            <Chip
              key={i}
              icon={<ErrorOutline />}
              label={a.message}
              color="warning"
              size="small"
              onClick={onNavigateToJournal}
              sx={{ cursor: onNavigateToJournal ? 'pointer' : 'default' }}
            />
          ))}
        </Stack>
      )}

      {/* KPI cards */}
      {kpi && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
          {[
            {
              label: 'Баланс всех счетов',
              value: `${fmt(kpi.total_balance)} ₽`,
              delta: kpi.balance_delta,
              deltaLabel: `${kpi.balance_delta >= 0 ? '+' : ''}${fmt(kpi.balance_delta)} ₽`,
              icon: <AccountBalance sx={{ fontSize: 18 }} />,
              color: '#185FA5',
            },
            {
              label: 'Доходы',
              value: `${fmt(kpi.income_month)} ₽`,
              delta: kpi.income_delta_pct,
              deltaLabel: fmtPct(kpi.income_delta_pct) + ' vs пред. мес.',
              icon: <TrendingUp sx={{ fontSize: 18 }} />,
              color: '#0F6E56',
            },
            {
              label: 'Расходы',
              value: `${fmt(kpi.expense_month)} ₽`,
              delta: -kpi.expense_delta_pct,
              deltaLabel: fmtPct(kpi.expense_delta_pct) + ' vs пред. мес.',
              icon: <TrendingDown sx={{ fontSize: 18 }} />,
              color: '#A32D2D',
            },
            {
              label: 'Чистая прибыль',
              value: `${fmt(kpi.net_profit_month)} ₽`,
              delta: kpi.profit_delta,
              deltaLabel: `Маржа ${kpi.net_margin_month}%`,
              icon: <TrendingUp sx={{ fontSize: 18 }} />,
              color: kpi.net_profit_month >= 0 ? '#0F6E56' : '#A32D2D',
            },
          ].map((card) => (
            <Paper
              key={card.label}
              variant="outlined"
              sx={{ p: 1.5, borderRadius: 2, borderColor: 'divider' }}
            >
              <Stack direction="row" alignItems="center" spacing={0.8} mb={0.5}>
                <Box sx={{ color: card.color }}>{card.icon}</Box>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.68rem' }}>
                  {card.label}
                </Typography>
              </Stack>
              <Typography variant="h6" sx={{ fontWeight: 500, fontSize: '1.2rem', lineHeight: 1.2 }}>
                {card.value}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: card.delta >= 0 ? 'success.main' : 'error.main', fontSize: '0.72rem' }}
              >
                {card.delta >= 0 ? '↑' : '↓'} {card.deltaLabel}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}

      {/* Main content: projects table + accounts */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 270px', gap: 1.5, alignItems: 'start' }}>

        {/* Project comparison table */}
        <Paper variant="outlined" sx={{ borderRadius: 2, minWidth: 0, overflow: 'hidden' }}>
          <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.68rem', fontWeight: 500 }}>
              Сравнение проектов — {data ? monthLabel(data.period) : ''}
            </Typography>
          </Box>
          <TableContainer sx={{ maxWidth: '100%' }}>
            <Table size="small" sx={{ 'td,th': { fontSize: '0.78rem' } }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 500, py: 0.8 }}>Статья</TableCell>
                  {data?.projects.map((p) => (
                    <TableCell key={p.target_code} align="right" sx={{ fontWeight: 500, py: 0.8, whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: projectColors[p.target_code], flexShrink: 0 }} />
                        <Tooltip title={p.target_name}><span>{p.target_name.length > 14 ? p.target_name.slice(0, 12) + '…' : p.target_name}</span></Tooltip>
                      </Box>
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 600, py: 0.8, color: 'text.primary' }}>Итого</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {/* Income */}
                <TableRow sx={{ bgcolor: '#f0f7f0' }}>
                  <TableCell colSpan={(data?.projects.length ?? 0) + 2} sx={{ fontWeight: 500, py: 0.5, fontSize: '0.72rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Доходы
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ pl: 2.5, color: 'text.secondary' }}>Выручка</TableCell>
                  {data?.projects.map((p) => (
                    <TableCell key={p.target_code} align="right">{p.income ? fmt(p.income) : '—'}</TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 500 }}>{data ? fmt(data.projects.reduce((s, p) => s + p.income, 0)) : '—'}</TableCell>
                </TableRow>

                {/* Variable expenses — only if any */}
                {(data?.projects.some((p) => p.variable_expense > 0)) && (
                  <>
                    <TableRow sx={{ bgcolor: '#fff5f5' }}>
                      <TableCell colSpan={(data?.projects.length ?? 0) + 2} sx={{ fontWeight: 500, py: 0.5, fontSize: '0.72rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Переменные расходы
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ pl: 2.5, color: 'text.secondary' }}>Итого</TableCell>
                      {data?.projects.map((p) => (
                        <TableCell key={p.target_code} align="right" sx={{ color: p.variable_expense ? 'error.main' : 'text.disabled' }}>
                          {p.variable_expense ? `−${fmt(p.variable_expense)}` : '—'}
                        </TableCell>
                      ))}
                      <TableCell align="right" sx={{ fontWeight: 500, color: 'error.main' }}>
                        −{fmt(data?.projects.reduce((s, p) => s + p.variable_expense, 0) ?? 0)}
                      </TableCell>
                    </TableRow>
                    {/* Gross profit */}
                    <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Валовая прибыль</TableCell>
                      {data?.projects.map((p) => (
                        <TableCell key={p.target_code} align="right" sx={{ fontWeight: 600, color: p.gross_profit >= 0 ? 'success.main' : 'error.main' }}>
                          {fmt(p.gross_profit)}
                        </TableCell>
                      ))}
                      <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>
                        {fmt(data?.projects.reduce((s, p) => s + p.gross_profit, 0) ?? 0)}
                      </TableCell>
                    </TableRow>
                  </>
                )}

                {/* Fixed expenses */}
                {(data?.projects.some((p) => p.fixed_expense > 0)) && (
                  <>
                    <TableRow sx={{ bgcolor: '#fff5f5' }}>
                      <TableCell colSpan={(data?.projects.length ?? 0) + 2} sx={{ fontWeight: 500, py: 0.5, fontSize: '0.72rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Постоянные расходы
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ pl: 2.5, color: 'text.secondary' }}>Итого</TableCell>
                      {data?.projects.map((p) => (
                        <TableCell key={p.target_code} align="right" sx={{ color: p.fixed_expense ? 'error.main' : 'text.disabled' }}>
                          {p.fixed_expense ? `−${fmt(p.fixed_expense)}` : '—'}
                        </TableCell>
                      ))}
                      <TableCell align="right" sx={{ fontWeight: 500, color: 'error.main' }}>
                        −{fmt(data?.projects.reduce((s, p) => s + p.fixed_expense, 0) ?? 0)}
                      </TableCell>
                    </TableRow>
                  </>
                )}

                {/* Other expenses */}
                {(data?.projects.some((p) => p.other_expense > 0)) && (
                  <>
                    <TableRow sx={{ bgcolor: '#fff5f5' }}>
                      <TableCell colSpan={(data?.projects.length ?? 0) + 2} sx={{ fontWeight: 500, py: 0.5, fontSize: '0.72rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Прочие расходы
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ pl: 2.5, color: 'text.secondary' }}>Итого</TableCell>
                      {data?.projects.map((p) => (
                        <TableCell key={p.target_code} align="right" sx={{ color: p.other_expense ? 'error.main' : 'text.disabled' }}>
                          {p.other_expense ? `−${fmt(p.other_expense)}` : '—'}
                        </TableCell>
                      ))}
                      <TableCell align="right" sx={{ fontWeight: 500, color: 'error.main' }}>
                        −{fmt(data?.projects.reduce((s, p) => s + p.other_expense, 0) ?? 0)}
                      </TableCell>
                    </TableRow>
                  </>
                )}

                {/* Net profit */}
                <TableRow sx={{ bgcolor: '#e3f2fd', borderTop: '2px solid #90caf9' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Чистая прибыль</TableCell>
                  {data?.projects.map((p) => (
                    <TableCell key={p.target_code} align="right" sx={{ fontWeight: 700, color: p.net_profit >= 0 ? 'success.main' : 'error.main' }}>
                      {fmt(p.net_profit)}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 700, color: (data?.projects.reduce((s, p) => s + p.net_profit, 0) ?? 0) >= 0 ? 'success.main' : 'error.main' }}>
                    {fmt(data?.projects.reduce((s, p) => s + p.net_profit, 0) ?? 0)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>Рентабельность</TableCell>
                  {data?.projects.map((p) => (
                    <TableCell key={p.target_code} align="right" sx={{ fontSize: '0.72rem', color: p.net_margin >= 0 ? 'success.main' : 'error.main', fontWeight: 500 }}>
                      {p.net_margin.toFixed(1)}%
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                    {data && data.projects.reduce((s, p) => s + p.income, 0) > 0
                      ? `${((data.projects.reduce((s, p) => s + p.net_profit, 0) / data.projects.reduce((s, p) => s + p.income, 0)) * 100).toFixed(1)}%`
                      : '—'}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Right column: accounts + income structure */}
        <Stack spacing={1.5}>
          {/* Accounts */}
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.68rem', fontWeight: 500, display: 'block', mb: 1 }}>
              Счета и карты
            </Typography>
            <Stack spacing={0.8}>
              {data?.accounts.map((acc) => (
                <Box
                  key={acc.id}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 0.8, border: '0.5px solid', borderColor: 'divider', borderRadius: 1.5 }}
                >
                  <Box sx={{ width: 32, height: 32, borderRadius: '8px', bgcolor: '#E6F1FB', color: '#185FA5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CreditCard sx={{ fontSize: 16 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>{acc.code}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>{fmt(acc.balance)} ₽</Typography>
                    <Typography variant="caption" sx={{ fontSize: '0.68rem', color: acc.balance_delta >= 0 ? 'success.main' : 'error.main' }}>
                      {acc.balance_delta >= 0 ? '↑' : '↓'} {fmt(Math.abs(acc.balance_delta))}
                    </Typography>
                  </Box>
                </Box>
              ))}
              {data?.accounts.length === 0 && (
                <Typography variant="caption" color="text.secondary">Нет счетов</Typography>
              )}
            </Stack>
          </Paper>

          {/* Income structure */}
          {data && data.projects.length > 0 && totalIncome > 0 && (
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.68rem', fontWeight: 500, display: 'block', mb: 1 }}>
                Структура доходов
              </Typography>
              <Box sx={{ display: 'flex', height: 8, borderRadius: 1, overflow: 'hidden', mb: 1.2 }}>
                {data.projects.map((p) => (
                  <Box
                    key={p.target_code}
                    sx={{ height: '100%', bgcolor: projectColors[p.target_code], flex: p.income / totalIncome }}
                  />
                ))}
              </Box>
              <Stack spacing={0.5}>
                {data.projects.map((p) => (
                  <Box key={p.target_code} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, minWidth: 0 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: projectColors[p.target_code], flexShrink: 0 }} />
                      <Typography variant="caption" sx={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.target_name}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right', flexShrink: 0, pl: 1 }}>
                      <Typography variant="caption" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>{fmt(p.income)} ₽</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', ml: 0.5 }}>
                        {totalIncome > 0 ? `${Math.round((p.income / totalIncome) * 100)}%` : ''}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Paper>
          )}
        </Stack>
      </Box>

      {/* Personal finances block */}
      {data && data.personal_projects.length > 0 && (
        <Paper
          variant="outlined"
          onClick={openPersonalModal}
          sx={{
            borderRadius: 2, p: 2, cursor: 'pointer',
            transition: 'box-shadow 0.15s, border-color 0.15s',
            '&:hover': { boxShadow: 2, borderColor: 'primary.main' },
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.68rem', fontWeight: 500, display: 'block', mb: 1.5 }}>
            Личные финансы — {monthLabel(data.period)}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {data.personal_projects.map((p, i) => {
              const color = PROJECT_COLORS[(i + 4) % PROJECT_COLORS.length];
              const totalExp = p.variable_expense + p.fixed_expense + p.other_expense;
              return (
                <Box
                  key={p.target_code}
                  sx={{
                    flex: '1 1 200px',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1.5,
                    p: 1.5,
                    borderLeft: `3px solid ${color}`,
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem', mb: 1 }}>
                    {p.target_name}
                  </Typography>
                  <Stack spacing={0.5}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">Поступления</Typography>
                      <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 500 }}>
                        {p.income ? `+${fmt(p.income)}` : '—'} ₽
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" color="text.secondary">Расходы</Typography>
                      <Typography variant="caption" sx={{ color: totalExp ? 'error.main' : 'text.disabled', fontWeight: 500 }}>
                        {totalExp ? `−${fmt(totalExp)}` : '—'} ₽
                      </Typography>
                    </Box>
                    <Box sx={{ height: '0.5px', bgcolor: 'divider', my: 0.3 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>Остаток</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: p.net_profit >= 0 ? 'success.main' : 'error.main' }}>
                        {fmt(p.net_profit)} ₽
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
              );
            })}
          </Box>
        </Paper>
      )}

      {/* ── Modal: personal finance breakdown by articles ── */}
      {(() => {
        const incomeRows = groupByArticle(modalRows, 'income');
        const expenseRows = groupByArticle(modalRows, 'expense');
        const totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
        const totalExpense = expenseRows.reduce((s, r) => s + r.amount, 0);
        const net = totalIncome - totalExpense;

        // Drill-down: transactions for selected article
        const drillRows = drillArticle
          ? modalRows.filter(
              (r) =>
                r.direction === drillArticle.direction &&
                (r.article_name || 'Без статьи') === drillArticle.name
            )
          : [];

        return (
          <Dialog
            open={modalOpen}
            onClose={() => { setModalOpen(false); setDrillArticle(null); }}
            maxWidth="md"
            fullWidth
            PaperProps={{ sx: { borderRadius: 2 } }}
          >
            <DialogTitle sx={{ pb: 1, pr: 6 }}>
              {drillArticle ? (
                <Stack direction="row" alignItems="center" gap={1}>
                  <IconButton size="small" onClick={() => setDrillArticle(null)}>
                    <ArrowUpward sx={{ transform: 'rotate(-90deg)', fontSize: 18 }} />
                  </IconButton>
                  <Box>
                    <Typography variant="h6" fontWeight={700}>{drillArticle.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {drillArticle.direction === 'income' ? 'Поступления' : 'Расходы'} — {data ? monthLabel(data.period) : ''}
                    </Typography>
                  </Box>
                </Stack>
              ) : (
                <Box>
                  <Typography variant="h6" fontWeight={700}>Личные финансы — {data ? monthLabel(data.period) : ''}</Typography>
                  <Typography variant="caption" color="text.secondary">Нажмите на статью для просмотра транзакций</Typography>
                </Box>
              )}
              <IconButton onClick={() => { setModalOpen(false); setDrillArticle(null); }} size="small"
                sx={{ position: 'absolute', top: 12, right: 12 }}>
                <Close fontSize="small" />
              </IconButton>
            </DialogTitle>

            <DialogContent sx={{ pb: 3 }}>
              {modalLoading ? (
                <LinearProgress sx={{ mt: 1 }} />
              ) : drillArticle ? (
                /* ── DRILL-DOWN: транзакции по статье ── */
                <Stack spacing={0}>
                  {drillRows.length === 0 ? (
                    <Typography color="text.secondary">Нет транзакций</Typography>
                  ) : (
                    drillRows.map((r) => (
                      <Box key={r.id} sx={{
                        py: 1, px: 0.5, borderBottom: '1px solid', borderColor: 'divider',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2,
                      }}>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" fontWeight={500} noWrap>
                            {r.description || r.counterparty_name || r.bank_source || '—'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {r.occurred_at ? new Date(r.occurred_at).toLocaleDateString('ru-RU') : '—'}
                            {r.account_name ? ` · ${r.account_name}` : ''}
                          </Typography>
                        </Box>
                        <Typography variant="body2" fontWeight={700}
                          sx={{ color: r.direction === 'expense' ? 'error.main' : 'success.main', whiteSpace: 'nowrap' }}>
                          {r.direction === 'expense' ? '−' : '+'}{fmtRub(Math.abs(r.amount))}
                        </Typography>
                      </Box>
                    ))
                  )}
                  <Box sx={{ pt: 1.5, display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" fontWeight={700}>Итого</Typography>
                    <Typography variant="body2" fontWeight={800}
                      sx={{ color: drillArticle.direction === 'expense' ? 'error.main' : 'success.main' }}>
                      {fmtRub(drillRows.reduce((s, r) => s + Math.abs(r.amount), 0))}
                    </Typography>
                  </Box>
                </Stack>
              ) : (
                /* ── OVERVIEW: графики ── */
                <Stack spacing={3} sx={{ mt: 0.5 }}>
                  {/* KPI row */}
                  <Stack direction="row" spacing={2}>
                    {[
                      { label: 'Поступления', value: `+${fmtRub(totalIncome)}`, color: INCOME_COLOR },
                      { label: 'Расходы', value: `−${fmtRub(totalExpense)}`, color: '#ef4444' },
                      { label: 'Остаток', value: (net >= 0 ? '+' : '') + fmtRub(net), color: net >= 0 ? INCOME_COLOR : '#ef4444' },
                    ].map((kv) => (
                      <Paper key={kv.label} variant="outlined" sx={{ flex: 1, p: 1.5, borderRadius: 1.5, textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary">{kv.label}</Typography>
                        <Typography variant="subtitle1" fontWeight={800} sx={{ color: kv.color, fontSize: '1rem' }}>{kv.value}</Typography>
                      </Paper>
                    ))}
                  </Stack>

                  {/* Donut: income vs expense */}
                  <Box>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Структура (доходы vs расходы)</Typography>
                    <Box sx={{ height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Поступления', value: totalIncome },
                              { name: 'Расходы', value: totalExpense },
                            ]}
                            cx="50%" cy="50%"
                            innerRadius={55} outerRadius={85}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                          >
                            <Cell fill={INCOME_COLOR} />
                            <Cell fill="#ef4444" />
                          </Pie>
                          <ReTooltip formatter={(v: number) => fmtRub(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </Box>
                  </Box>

                  <Divider />

                  {/* Bar chart: income by article */}
                  {incomeRows.length > 0 && (
                    <Box>
                      <Typography variant="subtitle2" fontWeight={700} color="success.main" sx={{ mb: 1 }}>
                        Поступления по статьям
                      </Typography>
                      <Box sx={{ height: Math.max(120, incomeRows.length * 36) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={incomeRows} layout="vertical" margin={{ left: 8, right: 60, top: 0, bottom: 0 }}
                            onClick={(e) => { if (e?.activePayload?.[0]?.payload) setDrillArticle({ name: e.activePayload[0].payload.name, direction: 'income' }); }}
                          >
                            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
                            <ReTooltip content={<ChartTooltip />} />
                            <Bar dataKey="amount" radius={[0, 4, 4, 0]} cursor="pointer"
                              label={{ position: 'right', formatter: (v: number) => fmtRub(v), fontSize: 11, fill: '#22c55e' }}>
                              {incomeRows.map((_, i) => <Cell key={i} fill={INCOME_COLOR} fillOpacity={1 - i * 0.08} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </Box>
                    </Box>
                  )}

                  {/* Bar chart: expense by article */}
                  {expenseRows.length > 0 && (
                    <Box>
                      <Typography variant="subtitle2" fontWeight={700} color="error.main" sx={{ mb: 1 }}>
                        Расходы по статьям
                      </Typography>
                      <Box sx={{ height: Math.max(120, expenseRows.length * 36) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={expenseRows} layout="vertical" margin={{ left: 8, right: 60, top: 0, bottom: 0 }}
                            onClick={(e) => { if (e?.activePayload?.[0]?.payload) setDrillArticle({ name: e.activePayload[0].payload.name, direction: 'expense' }); }}
                          >
                            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12 }} />
                            <ReTooltip content={<ChartTooltip />} />
                            <Bar dataKey="amount" radius={[0, 4, 4, 0]} cursor="pointer"
                              label={{ position: 'right', formatter: (v: number) => fmtRub(v), fontSize: 11, fill: '#ef4444' }}>
                              {expenseRows.map((_, i) => <Cell key={i} fill={EXPENSE_COLORS[i % EXPENSE_COLORS.length]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </Box>
                    </Box>
                  )}
                </Stack>
              )}
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Bottom row: cashflow + recent transactions */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>

        {/* Cashflow bars */}
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.68rem', fontWeight: 500, display: 'block', mb: 1.2 }}>
            Денежный поток — 6 месяцев
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 90 }}>
            {data?.cashflow.map((point) => {
              const incH = Math.max(4, Math.round((point.income / maxCashflow) * 78));
              const expH = Math.max(4, Math.round((point.expense / maxCashflow) * 78));
              const isCurrent = point.period === data.period;
              return (
                <Tooltip
                  key={point.period}
                  title={`${monthLabel(point.period)}: +${fmt(point.income)} / −${fmt(point.expense)}`}
                >
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.3, flex: 1 }}>
                    <Box sx={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: 78 }}>
                      <Box sx={{ width: 11, height: incH, bgcolor: isCurrent ? '#185FA5' : '#B5D4F4', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                      <Box sx={{ width: 11, height: expH, bgcolor: isCurrent ? '#E24B4A' : '#F7C1C1', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} />
                    </Box>
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', color: isCurrent ? 'text.primary' : 'text.secondary', fontWeight: isCurrent ? 600 : 400, whiteSpace: 'nowrap' }}>
                      {monthLabel(point.period)}
                    </Typography>
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
          <Stack direction="row" spacing={1.5} mt={0.8}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: '#185FA5' }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Доходы</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: '#E24B4A' }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Расходы</Typography>
            </Box>
          </Stack>
        </Paper>

        {/* Recent transactions */}
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.68rem', fontWeight: 500, display: 'block', mb: 1 }}>
            Последние операции
          </Typography>
          <Stack spacing={0} divider={<Box sx={{ height: '0.5px', bgcolor: 'divider' }} />}>
            {data?.recent_transactions.slice(0, 8).map((tx) => {
              const isIncome = tx.direction === 'income';
              const isTransfer = tx.direction === 'transfer';
              const targetColor = tx.target_id != null ? projectColorsById[tx.target_id] : undefined;
              return (
                <Box key={tx.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.7 }}>
                  <Box sx={{
                    width: 26, height: 26, borderRadius: '7px', flexShrink: 0,
                    bgcolor: isTransfer ? '#FFF8E1' : isIncome ? '#E1F5EE' : '#FFEBEE',
                    color: isTransfer ? '#E65100' : isIncome ? '#0F6E56' : '#C62828',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isTransfer
                      ? <SwapHoriz sx={{ fontSize: 14 }} />
                      : isIncome
                        ? <ArrowDownward sx={{ fontSize: 14 }} />
                        : <ArrowUpward sx={{ fontSize: 14 }} />}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.article_name || tx.description || (isTransfer ? 'Перевод' : isIncome ? 'Поступление' : 'Расход')}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                        {tx.account_name || '—'} · {tx.occurred_at ? new Date(tx.occurred_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—'}
                      </Typography>
                      {tx.target_name && (
                        <Box component="span" sx={{ fontSize: '0.65rem', px: 0.6, py: 0.1, borderRadius: '10px', bgcolor: targetColor ? `${targetColor}22` : 'action.selected', color: targetColor || 'text.secondary', whiteSpace: 'nowrap' }}>
                          {tx.target_name}
                        </Box>
                      )}
                    </Box>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.78rem', flexShrink: 0, color: isTransfer ? 'text.secondary' : isIncome ? 'success.main' : 'error.main' }}>
                    {isTransfer ? '' : isIncome ? '+' : '−'}{fmt(Math.abs(tx.amount))}
                  </Typography>
                </Box>
              );
            })}
            {data?.recent_transactions.length === 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ py: 1 }}>
                Нет операций
              </Typography>
            )}
          </Stack>
        </Paper>

      </Box>
    </Stack>
  );
};

export default FinanceCommandCenter;
