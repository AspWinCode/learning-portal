import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, Grid, IconButton,
  InputAdornment, InputLabel, LinearProgress, MenuItem, Paper, Select,
  Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  ArrowBack, CalendarToday, Delete, Edit, FlightTakeoff, LinkOff,
  Place, Add, CurrencyExchange, Receipt, Dashboard, Savings,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { tripsApi } from '../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  planned: 'Запланирована', active: 'Активна', completed: 'Завершена',
};
const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success'> = {
  planned: 'default', active: 'primary', completed: 'success',
};
const DIRECTION_LABELS: Record<string, string> = {
  income: 'Доход', expense: 'Расход', transfer: 'Перевод',
};
const CATEGORY_LABELS: Record<string, string> = {
  food: '🍜 Еда', transport: '🚕 Транспорт', excursion: '🏝 Экскурсия',
  accommodation: '🏨 Жильё', shopping: '🛍 Шоппинг', health: '💊 Здоровье',
  visa: '🛂 Виза/Страховка', entertainment: '🎭 Развлечения', other: '📦 Прочее',
};
const CURRENCY_OPTIONS = ['RUB', 'USD', 'EUR', 'THB', 'AED', 'TRY', 'IDR', 'VND', 'MYR', 'SGD'];

// ── Small helpers ─────────────────────────────────────────────────────────────

const fmt = (v: number, decimals = 2) =>
  v.toLocaleString('ru-RU', { maximumFractionDigits: decimals, minimumFractionDigits: 0 });

// ── SummaryCard ───────────────────────────────────────────────────────────────

const SummaryCard: React.FC<{
  label: string; value: string; subtitle?: string;
  color?: string; icon?: React.ReactNode;
}> = ({ label, value, subtitle, color, icon }) => (
  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
    {icon && <Box sx={{ mb: 0.5, color: 'text.secondary' }}>{icon}</Box>}
    <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase" letterSpacing="0.05em">
      {label}
    </Typography>
    <Typography variant="h6" fontWeight={700} color={color || 'text.primary'} sx={{ mt: 0.25, lineHeight: 1.2 }}>
      {value}
    </Typography>
    {subtitle && (
      <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
    )}
  </Paper>
);

// ── Main Component ────────────────────────────────────────────────────────────

const TripDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tripId = Number(id);

  const [trip, setTrip] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [exchanges, setExchanges] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);

  // Edit trip dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete trip dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Add expense dialog
  const [expOpen, setExpOpen] = useState(false);
  const [expForm, setExpForm] = useState({
    category: 'food', description: '', amount_local: '', exchange_rate: '', occurred_at: '', notes: '',
  });
  const [expSaving, setExpSaving] = useState(false);
  const [expError, setExpError] = useState('');

  // Add exchange dialog
  const [exOpen, setExOpen] = useState(false);
  const [exForm, setExForm] = useState({
    amount_base: '', exchange_rate: '', occurred_at: '', notes: '',
  });
  const [exSaving, setExSaving] = useState(false);
  const [exError, setExError] = useState('');

  // Budget state
  const [budgetSummary, setBudgetSummary] = useState<any>(null);
  const [budgetEdit, setBudgetEdit] = useState<Record<string, string>>({});
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetMsg, setBudgetMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [t, sm, exp, exch, txns, bs] = await Promise.all([
        tripsApi.get(tripId),
        tripsApi.getSummary(tripId),
        tripsApi.listExpenses(tripId),
        tripsApi.listCashExchanges(tripId),
        tripsApi.getTransactions(tripId),
        tripsApi.getBudgetSummary(tripId),
      ]);
      setTrip(t);
      setSummary(sm);
      setExpenses(exp);
      setExchanges(exch);
      setTransactions(txns);
      setBudgetSummary(bs);
      // Pre-fill budget edit form
      const initEdit: Record<string, string> = {};
      if (bs.total_plan != null) initEdit['total'] = String(bs.total_plan);
      Object.entries(bs.by_category || {}).forEach(([cat, data]: any) => {
        if (data.plan != null) initEdit[cat] = String(data.plan);
      });
      setBudgetEdit(initEdit);
    } catch {
      setError('Не удалось загрузить поездку');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

  // ── Edit Trip ───────────────────────────────────────────────────────────────
  const handleEditOpen = () => {
    if (!trip) return;
    setEditForm({
      title: trip.title, country: trip.country || '', city: trip.city || '',
      start_date: trip.start_date || '', end_date: trip.end_date || '',
      base_currency: trip.base_currency, local_currency: trip.local_currency,
      status: trip.status, notes: trip.notes || '',
    });
    setEditError('');
    setEditOpen(true);
  };
  const handleEditSave = async () => {
    if (!editForm.title?.trim() || !editForm.start_date) { setEditError('Заполните название и дату начала'); return; }
    setEditSaving(true); setEditError('');
    try {
      const updated = await tripsApi.update(tripId, {
        title: editForm.title.trim(),
        country: editForm.country.trim() || undefined,
        city: editForm.city.trim() || undefined,
        start_date: editForm.start_date,
        end_date: editForm.end_date || undefined,
        base_currency: editForm.base_currency,
        local_currency: editForm.local_currency,
        status: editForm.status,
        notes: editForm.notes.trim() || undefined,
      });
      setTrip(updated);
      setEditOpen(false);
    } catch (e: any) {
      setEditError(e.response?.data?.detail || 'Ошибка при сохранении');
    } finally { setEditSaving(false); }
  };

  // ── Delete Trip ─────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    try { await tripsApi.delete(tripId); navigate('/travel'); }
    catch { setDeleting(false); setDeleteOpen(false); }
  };

  // ── Expenses ────────────────────────────────────────────────────────────────
  const handleExpSave = async () => {
    const al = parseFloat(expForm.amount_local);
    const rate = parseFloat(expForm.exchange_rate);
    if (!expForm.occurred_at || isNaN(al) || al <= 0 || isNaN(rate) || rate <= 0) {
      setExpError('Заполните дату, сумму и курс (все > 0)'); return;
    }
    setExpSaving(true); setExpError('');
    try {
      const newExp = await tripsApi.createExpense(tripId, {
        category: expForm.category,
        description: expForm.description.trim() || undefined,
        amount_local: al,
        local_currency: trip.local_currency,
        exchange_rate: rate,
        occurred_at: expForm.occurred_at,
        notes: expForm.notes.trim() || undefined,
      });
      setExpenses(prev => [newExp, ...prev]);
      // refresh summary
      const sm = await tripsApi.getSummary(tripId);
      setSummary(sm);
      setExpOpen(false);
      setExpForm({ category: 'food', description: '', amount_local: '', exchange_rate: '', occurred_at: '', notes: '' });
    } catch (e: any) {
      setExpError(e.response?.data?.detail || 'Ошибка при сохранении');
    } finally { setExpSaving(false); }
  };

  const handleDeleteExpense = async (expId: number) => {
    try {
      await tripsApi.deleteExpense(tripId, expId);
      setExpenses(prev => prev.filter(e => e.id !== expId));
      const sm = await tripsApi.getSummary(tripId);
      setSummary(sm);
    } catch { /* silent */ }
  };

  // ── Cash Exchanges ──────────────────────────────────────────────────────────
  const handleExSave = async () => {
    const ab = parseFloat(exForm.amount_base);
    const rate = parseFloat(exForm.exchange_rate);
    if (!exForm.occurred_at || isNaN(ab) || ab <= 0 || isNaN(rate) || rate <= 0) {
      setExError('Заполните дату, сумму и курс (все > 0)'); return;
    }
    setExSaving(true); setExError('');
    try {
      const newEx = await tripsApi.createCashExchange(tripId, {
        amount_base: ab,
        exchange_rate: rate,
        occurred_at: exForm.occurred_at,
        notes: exForm.notes.trim() || undefined,
      });
      setExchanges(prev => [newEx, ...prev]);
      const sm = await tripsApi.getSummary(tripId);
      setSummary(sm);
      setExOpen(false);
      setExForm({ amount_base: '', exchange_rate: '', occurred_at: '', notes: '' });
    } catch (e: any) {
      setExError(e.response?.data?.detail || 'Ошибка при сохранении');
    } finally { setExSaving(false); }
  };

  const handleDeleteExchange = async (exId: number) => {
    try {
      await tripsApi.deleteCashExchange(tripId, exId);
      setExchanges(prev => prev.filter(e => e.id !== exId));
      const sm = await tripsApi.getSummary(tripId);
      setSummary(sm);
    } catch { /* silent */ }
  };

  const handleUnlinkTxn = async (txnId: number) => {
    try {
      await tripsApi.unlinkTransaction(tripId, txnId);
      setTransactions(prev => prev.filter(t => t.id !== txnId));
    } catch { /* silent */ }
  };

  const handleBudgetSave = async () => {
    setBudgetSaving(true);
    setBudgetMsg('');
    try {
      const budgets: Record<string, number> = {};
      Object.entries(budgetEdit).forEach(([cat, val]) => {
        const n = parseFloat(val);
        budgets[cat] = isNaN(n) || val === '' ? 0 : n;
      });
      await tripsApi.setBudget(tripId, budgets);
      const bs = await tripsApi.getBudgetSummary(tripId);
      setBudgetSummary(bs);
      setBudgetMsg('Бюджет сохранён');
      setTimeout(() => setBudgetMsg(''), 2500);
    } catch {
      setBudgetMsg('Ошибка при сохранении бюджета');
    } finally {
      setBudgetSaving(false);
    }
  };

  // Derived for exchange preview
  const expLocalPreview = (() => {
    const al = parseFloat(expForm.amount_local);
    const rate = parseFloat(expForm.exchange_rate);
    if (!isNaN(al) && al > 0 && !isNaN(rate) && rate > 0 && trip)
      return `≈ ${fmt(al / rate)} ${trip.base_currency}`;
    return null;
  })();

  const exLocalPreview = (() => {
    const ab = parseFloat(exForm.amount_base);
    const rate = parseFloat(exForm.exchange_rate);
    if (!isNaN(ab) && ab > 0 && !isNaN(rate) && rate > 0 && trip)
      return `= ${fmt(ab * rate)} ${trip.local_currency}`;
    return null;
  })();

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>
  );
  if (error || !trip) return (
    <Box>
      <Alert severity="error">{error || 'Поездка не найдена'}</Alert>
      <Button sx={{ mt: 2 }} startIcon={<ArrowBack />} onClick={() => navigate('/travel')}>К списку</Button>
    </Box>
  );

  const cashUsedPct = summary && summary.total_exchanged_local > 0
    ? Math.min(100, (summary.total_expense_local / summary.total_exchanged_local) * 100)
    : 0;

  return (
    <Box>
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5, flexWrap: 'wrap' }}>
        <IconButton onClick={() => navigate('/travel')} size="small"><ArrowBack /></IconButton>
        <FlightTakeoff sx={{ color: 'primary.main' }} />
        <Typography variant="h5" fontWeight={700} sx={{ flex: 1, minWidth: 0 }}>{trip.title}</Typography>
        <Chip label={STATUS_LABELS[trip.status] || trip.status} color={STATUS_COLORS[trip.status] || 'default'} />
        <Tooltip title="Редактировать"><IconButton onClick={handleEditOpen}><Edit /></IconButton></Tooltip>
        <Tooltip title="Удалить"><IconButton color="error" onClick={() => setDeleteOpen(true)}><Delete /></IconButton></Tooltip>
      </Box>

      {/* ── Meta chips ── */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        {(trip.city || trip.country) && (
          <Chip size="small" icon={<Place sx={{ fontSize: 14 }} />}
            label={[trip.city, trip.country].filter(Boolean).join(', ')} variant="outlined" />
        )}
        <Chip size="small" icon={<CalendarToday sx={{ fontSize: 14 }} />}
          label={trip.start_date + (trip.end_date ? ` — ${trip.end_date}` : '')} variant="outlined" />
        <Chip size="small" label={`${trip.local_currency} / ${trip.base_currency}`} variant="outlined" />
      </Box>

      {/* ── Tabs ── */}
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 1 }}>
          <Tab icon={<Dashboard sx={{ fontSize: 18 }} />} iconPosition="start" label="Обзор" sx={{ minHeight: 48, fontSize: '0.84rem' }} />
          <Tab icon={<Receipt sx={{ fontSize: 18 }} />} iconPosition="start"
            label={`Траты${expenses.length ? ` (${expenses.length})` : ''}`}
            sx={{ minHeight: 48, fontSize: '0.84rem' }} />
          <Tab icon={<CurrencyExchange sx={{ fontSize: 18 }} />} iconPosition="start"
            label={`Обменник${exchanges.length ? ` (${exchanges.length})` : ''}`}
            sx={{ minHeight: 48, fontSize: '0.84rem' }} />
          <Tab label={`Журнал${transactions.length ? ` (${transactions.length})` : ''}`}
            sx={{ minHeight: 48, fontSize: '0.84rem' }} />
          <Tab label="Бюджет" sx={{ minHeight: 48, fontSize: '0.84rem' }} />
        </Tabs>

        {/* ── Tab 0: Overview ── */}
        {tab === 0 && (
          <Box sx={{ p: 2.5 }}>
            {summary ? (
              <>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={6} md={3}>
                    <SummaryCard
                      label={`Потрачено, ${summary.local_currency}`}
                      value={fmt(summary.total_expense_local)}
                      subtitle={`${fmt(summary.total_expense_base)} ${summary.base_currency}`}
                      color="error.main"
                    />
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <SummaryCard
                      label={`Обменяно, ${summary.local_currency}`}
                      value={fmt(summary.total_exchanged_local)}
                      subtitle={`из ${fmt(summary.total_exchanged_base)} ${summary.base_currency}`}
                      color="info.main"
                    />
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <SummaryCard
                      label={`Остаток нала, ${summary.local_currency}`}
                      value={fmt(summary.cash_balance_local)}
                      subtitle={summary.cash_balance_local >= 0 ? 'Достаточно' : '⚠️ Нехватает'}
                      color={summary.cash_balance_local >= 0 ? 'success.main' : 'error.main'}
                    />
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <SummaryCard
                      label="Средний курс"
                      value={summary.avg_exchange_rate
                        ? `1 ${summary.base_currency} = ${fmt(summary.avg_exchange_rate, 4)} ${summary.local_currency}`
                        : '—'}
                      subtitle="По всем обменам"
                    />
                  </Grid>
                </Grid>

                {/* Cash usage progress */}
                {summary.total_exchanged_local > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        Использовано наличных
                      </Typography>
                      <Typography variant="caption" fontWeight={600}>
                        {fmt(cashUsedPct, 1)}%
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={cashUsedPct}
                      color={cashUsedPct > 90 ? 'error' : cashUsedPct > 70 ? 'warning' : 'success'}
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        {fmt(summary.total_expense_local)} {summary.local_currency} потрачено
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {fmt(summary.total_exchanged_local)} {summary.local_currency} обменяно
                      </Typography>
                    </Box>
                  </Box>
                )}

                {/* By category */}
                {Object.keys(summary.by_category).length > 0 && (
                  <>
                    <Divider sx={{ mb: 2 }} />
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>По категориям</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {Object.entries(summary.by_category)
                        .sort((a: any, b: any) => b[1].local - a[1].local)
                        .map(([cat, data]: any) => {
                          const pct = summary.total_expense_local > 0
                            ? (data.local / summary.total_expense_local) * 100 : 0;
                          return (
                            <Box key={cat}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                                <Typography variant="body2">
                                  {CATEGORY_LABELS[cat] || cat}
                                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                                    ({data.count} шт.)
                                  </Typography>
                                </Typography>
                                <Box sx={{ textAlign: 'right' }}>
                                  <Typography variant="body2" fontWeight={600}>
                                    {fmt(data.local)} {summary.local_currency}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {fmt(data.base)} {summary.base_currency}
                                  </Typography>
                                </Box>
                              </Box>
                              <LinearProgress
                                variant="determinate" value={pct}
                                sx={{ height: 4, borderRadius: 2 }}
                              />
                            </Box>
                          );
                        })}
                    </Box>
                  </>
                )}

                {summary.expense_count === 0 && summary.exchange_count === 0 && (
                  <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                    <Typography variant="body2">
                      Добавьте траты и операции обмена во вкладках выше, чтобы увидеть аналитику
                    </Typography>
                  </Box>
                )}
              </>
            ) : (
              <CircularProgress size={24} />
            )}
          </Box>
        )}

        {/* ── Tab 1: Expenses ── */}
        {tab === 1 && (
          <Box sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
              <Button variant="contained" size="small" startIcon={<Add />} onClick={() => { setExpError(''); setExpOpen(true); }}>
                Добавить трату
              </Button>
            </Box>
            {expenses.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}>
                <Receipt sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
                <Typography variant="body2">Нет записанных трат</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Дата</TableCell>
                      <TableCell>Категория</TableCell>
                      <TableCell>Описание</TableCell>
                      <TableCell align="right">Сумма ({trip.local_currency})</TableCell>
                      <TableCell align="right">Курс</TableCell>
                      <TableCell align="right">Сумма ({trip.base_currency})</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {expenses.map(e => (
                      <TableRow key={e.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{e.occurred_at}</TableCell>
                        <TableCell>{CATEGORY_LABELS[e.category] || e.category}</TableCell>
                        <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.description || '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: 'error.main' }}>
                          {fmt(e.amount_local)}
                        </TableCell>
                        <TableCell align="right" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                          {fmt(e.exchange_rate, 4)}
                        </TableCell>
                        <TableCell align="right">
                          {fmt(e.amount_base)}
                        </TableCell>
                        <TableCell>
                          <Tooltip title="Удалить">
                            <IconButton size="small" color="error" onClick={() => handleDeleteExpense(e.id)}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {/* ── Tab 2: Cash Exchanges ── */}
        {tab === 2 && (
          <Box sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
              <Button variant="contained" size="small" startIcon={<Add />} onClick={() => { setExError(''); setExOpen(true); }}>
                Добавить обмен
              </Button>
            </Box>
            {exchanges.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}>
                <CurrencyExchange sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
                <Typography variant="body2">Нет операций обмена</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Дата</TableCell>
                      <TableCell align="right">Отдал ({trip.base_currency})</TableCell>
                      <TableCell align="right">Курс</TableCell>
                      <TableCell align="right">Получил ({trip.local_currency})</TableCell>
                      <TableCell>Заметки</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {exchanges.map(ex => (
                      <TableRow key={ex.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{ex.occurred_at}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{fmt(ex.amount_base)}</TableCell>
                        <TableCell align="right" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                          1 {trip.base_currency} = {fmt(ex.exchange_rate, 4)} {trip.local_currency}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>
                          {fmt(ex.amount_local)}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ex.notes || '—'}
                        </TableCell>
                        <TableCell>
                          <Tooltip title="Удалить">
                            <IconButton size="small" color="error" onClick={() => handleDeleteExchange(ex.id)}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {/* ── Tab 3: Journal Transactions ── */}
        {tab === 3 && (
          <Box sx={{ p: 2.5 }}>
            {transactions.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
                <Typography color="text.secondary" variant="body2">
                  Транзакции журнала пока не привязаны к поездке.
                  Привязать можно из финансового журнала.
                </Typography>
              </Paper>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Дата</TableCell>
                      <TableCell>Описание</TableCell>
                      <TableCell>Контрагент</TableCell>
                      <TableCell align="right">Сумма</TableCell>
                      <TableCell>Тип</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {transactions.map(txn => (
                      <TableRow key={txn.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {txn.occurred_at ? new Date(txn.occurred_at).toLocaleDateString('ru-RU') : '—'}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {txn.description_raw || '—'}
                        </TableCell>
                        <TableCell>{txn.counterparty_name || '—'}</TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={600}
                            color={txn.direction === 'income' ? 'success.main' : txn.direction === 'expense' ? 'error.main' : 'text.primary'}>
                            {txn.direction === 'income' ? '+' : txn.direction === 'expense' ? '−' : ''}
                            {fmt(txn.amount)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={DIRECTION_LABELS[txn.direction] || txn.direction}
                            variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                        </TableCell>
                        <TableCell>
                          <Tooltip title="Отвязать">
                            <IconButton size="small" onClick={() => handleUnlinkTxn(txn.id)}>
                              <LinkOff fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
        {/* ── Tab 4: Budget ── */}
        {tab === 4 && (
          <Box sx={{ p: 2.5 }}>
            {budgetSummary ? (
              <>
                {/* Total budget status */}
                {budgetSummary.total_plan != null && (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2, mb: 3, borderRadius: 2,
                      borderColor: budgetSummary.total_over ? 'error.main' : 'divider',
                      bgcolor: budgetSummary.total_over ? 'error.50' : 'background.paper',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                      <Box>
                        <Typography variant="subtitle2" fontWeight={700}>
                          {budgetSummary.total_over ? '⚠️ Бюджет превышен!' : '💰 Общий бюджет'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Потрачено {fmt(budgetSummary.total_actual)} из {fmt(budgetSummary.total_plan)} {budgetSummary.local_currency}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography
                          variant="h6" fontWeight={700}
                          color={budgetSummary.total_over ? 'error.main' : 'success.main'}
                        >
                          {budgetSummary.total_remaining != null
                            ? `${budgetSummary.total_over ? '−' : '+'}${fmt(Math.abs(budgetSummary.total_remaining))} ${budgetSummary.local_currency}`
                            : '—'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {budgetSummary.total_pct != null ? `${budgetSummary.total_pct}% использовано` : ''}
                        </Typography>
                      </Box>
                    </Box>
                    {budgetSummary.total_plan > 0 && (
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(100, budgetSummary.total_pct || 0)}
                        color={budgetSummary.total_over ? 'error' : budgetSummary.total_pct > 80 ? 'warning' : 'success'}
                        sx={{ height: 10, borderRadius: 5 }}
                      />
                    )}
                  </Paper>
                )}

                {/* Forecast */}
                {budgetSummary.daily_avg != null && (
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={6} sm={3}>
                      <SummaryCard label="Дней прошло" value={String(budgetSummary.days_elapsed ?? '—')} />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <SummaryCard label="Дней осталось" value={String(budgetSummary.days_remaining ?? '—')}
                        color={budgetSummary.days_remaining === 0 ? 'error.main' : undefined} />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <SummaryCard
                        label={`В день, ${budgetSummary.local_currency}`}
                        value={fmt(budgetSummary.daily_avg)}
                        subtitle="средний расход"
                      />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <SummaryCard
                        label={`Прогноз, ${budgetSummary.local_currency}`}
                        value={fmt(budgetSummary.projected_total)}
                        subtitle="при текущем темпе"
                        color={
                          budgetSummary.total_plan && budgetSummary.projected_total > budgetSummary.total_plan
                            ? 'error.main' : 'text.primary'
                        }
                      />
                    </Grid>
                  </Grid>
                )}

                {/* Category plan vs actual */}
                {Object.keys(budgetSummary.by_category).length > 0 && (
                  <>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                      По категориям: план vs факт
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
                      {Object.entries(budgetSummary.by_category)
                        .sort((a: any, b: any) => (b[1].actual || 0) - (a[1].actual || 0))
                        .map(([cat, data]: any) => (
                          <Box key={cat}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                <Typography variant="body2" fontWeight={500}>
                                  {CATEGORY_LABELS[cat] || cat}
                                </Typography>
                                {data.over && (
                                  <Chip size="small" label="Превышен" color="error"
                                    sx={{ height: 18, fontSize: '0.65rem' }} />
                                )}
                              </Box>
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="body2" fontWeight={600}
                                  color={data.over ? 'error.main' : 'text.primary'}>
                                  {fmt(data.actual)} {data.plan != null ? `/ ${fmt(data.plan)}` : ''} {budgetSummary.local_currency}
                                </Typography>
                                {data.remaining != null && (
                                  <Typography variant="caption"
                                    color={data.over ? 'error.main' : 'text.secondary'}>
                                    {data.over ? `перерасход ${fmt(Math.abs(data.remaining))}` : `осталось ${fmt(data.remaining)}`}
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                            {data.plan != null && data.plan > 0 && (
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(100, data.pct || 0)}
                                color={data.over ? 'error' : data.pct > 80 ? 'warning' : 'success'}
                                sx={{ height: 6, borderRadius: 3 }}
                              />
                            )}
                          </Box>
                        ))}
                    </Box>
                  </>
                )}

                <Divider sx={{ mb: 2.5 }} />

                {/* Budget editor */}
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                  Установить бюджет ({trip?.local_currency})
                </Typography>
                {budgetMsg && (
                  <Alert
                    severity={budgetMsg.includes('Ошибка') ? 'error' : 'success'}
                    sx={{ mb: 2, py: 0.5 }}
                  >
                    {budgetMsg}
                  </Alert>
                )}
                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={12} sm={6} md={4}>
                    <TextField
                      fullWidth label={`Общий бюджет (${trip?.local_currency})`}
                      type="number" inputProps={{ min: 0, step: 'any' }}
                      value={budgetEdit['total'] || ''}
                      onChange={e => setBudgetEdit(p => ({ ...p, total: e.target.value }))}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">💰</InputAdornment>,
                      }}
                      helperText="Общий лимит на всю поездку"
                    />
                  </Grid>
                </Grid>
                <Grid container spacing={2} sx={{ mb: 2.5 }}>
                  {Object.entries(CATEGORY_LABELS).map(([cat, label]) => (
                    <Grid item xs={12} sm={6} md={4} key={cat}>
                      <TextField
                        fullWidth label={label} type="number"
                        inputProps={{ min: 0, step: 'any' }}
                        value={budgetEdit[cat] || ''}
                        placeholder="без лимита"
                        onChange={e => setBudgetEdit(p => ({ ...p, [cat]: e.target.value }))}
                      />
                    </Grid>
                  ))}
                </Grid>
                <Button
                  variant="contained" onClick={handleBudgetSave} disabled={budgetSaving}
                  startIcon={<Savings />}
                >
                  {budgetSaving ? 'Сохранение...' : 'Сохранить бюджет'}
                </Button>
              </>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
                <CircularProgress size={24} />
              </Box>
            )}
          </Box>
        )}
      </Paper>

      {/* ── Dialogs ── */}

      {/* Edit Trip */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Редактировать поездку</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {editError && <Alert severity="error" sx={{ mb: 2 }}>{editError}</Alert>}
          <TextField fullWidth label="Название" required value={editForm.title || ''}
            onChange={e => setEditForm((p: any) => ({ ...p, title: e.target.value }))} sx={{ mb: 2, mt: 1 }} />
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <TextField fullWidth label="Страна" value={editForm.country || ''}
                onChange={e => setEditForm((p: any) => ({ ...p, country: e.target.value }))} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Город" value={editForm.city || ''}
                onChange={e => setEditForm((p: any) => ({ ...p, city: e.target.value }))} />
            </Grid>
          </Grid>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <TextField fullWidth label="Дата начала" type="date" required value={editForm.start_date || ''}
                onChange={e => setEditForm((p: any) => ({ ...p, start_date: e.target.value }))}
                InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Дата окончания" type="date" value={editForm.end_date || ''}
                onChange={e => setEditForm((p: any) => ({ ...p, end_date: e.target.value }))}
                InputLabelProps={{ shrink: true }} />
            </Grid>
          </Grid>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Базовая валюта</InputLabel>
                <Select value={editForm.base_currency || 'RUB'} label="Базовая валюта"
                  onChange={e => setEditForm((p: any) => ({ ...p, base_currency: e.target.value }))}>
                  {CURRENCY_OPTIONS.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Местная валюта</InputLabel>
                <Select value={editForm.local_currency || 'THB'} label="Местная валюта"
                  onChange={e => setEditForm((p: any) => ({ ...p, local_currency: e.target.value }))}>
                  {CURRENCY_OPTIONS.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Статус</InputLabel>
            <Select value={editForm.status || 'planned'} label="Статус"
              onChange={e => setEditForm((p: any) => ({ ...p, status: e.target.value }))}>
              <MenuItem value="planned">Запланирована</MenuItem>
              <MenuItem value="active">Активна</MenuItem>
              <MenuItem value="completed">Завершена</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth label="Заметки" multiline minRows={2} value={editForm.notes || ''}
            onChange={e => setEditForm((p: any) => ({ ...p, notes: e.target.value }))} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditOpen(false)} disabled={editSaving}>Отмена</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={editSaving}>
            {editSaving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Trip */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить поездку?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Поездка «{trip.title}» будет удалена вместе со всеми тратами и обменами. Транзакции журнала останутся, но потеряют привязку.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>Отмена</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Удаление...' : 'Удалить'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Expense */}
      <Dialog open={expOpen} onClose={() => setExpOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Добавить трату</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {expError && <Alert severity="error" sx={{ mb: 2 }}>{expError}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5, mb: 2 }}>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Категория</InputLabel>
                <Select value={expForm.category} label="Категория"
                  onChange={e => setExpForm(p => ({ ...p, category: e.target.value }))}>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <MenuItem key={k} value={k}>{v}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Дата" type="date" required value={expForm.occurred_at}
                onChange={e => setExpForm(p => ({ ...p, occurred_at: e.target.value }))}
                InputLabelProps={{ shrink: true }} />
            </Grid>
          </Grid>
          <TextField fullWidth label="Описание" value={expForm.description}
            onChange={e => setExpForm(p => ({ ...p, description: e.target.value }))}
            placeholder="Ужин в ресторане, такси в аэропорт..." sx={{ mb: 2 }} />
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <TextField fullWidth label={`Сумма (${trip.local_currency})`} type="number"
                required inputProps={{ min: 0, step: 'any' }}
                value={expForm.amount_local}
                onChange={e => setExpForm(p => ({ ...p, amount_local: e.target.value }))}
                InputProps={{
                  endAdornment: <InputAdornment position="end">{trip.local_currency}</InputAdornment>,
                }} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth
                label={`Курс (1 ${trip.base_currency} = ? ${trip.local_currency})`}
                type="number" required inputProps={{ min: 0, step: 'any' }}
                value={expForm.exchange_rate}
                onChange={e => setExpForm(p => ({ ...p, exchange_rate: e.target.value }))}
                helperText={expLocalPreview || ' '} />
            </Grid>
          </Grid>
          <TextField fullWidth label="Заметки" multiline minRows={1} value={expForm.notes}
            onChange={e => setExpForm(p => ({ ...p, notes: e.target.value }))} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setExpOpen(false)} disabled={expSaving}>Отмена</Button>
          <Button variant="contained" onClick={handleExpSave} disabled={expSaving}>
            {expSaving ? 'Сохранение...' : 'Добавить'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Cash Exchange */}
      <Dialog open={exOpen} onClose={() => setExOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Обмен наличных</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {exError && <Alert severity="error" sx={{ mb: 2 }}>{exError}</Alert>}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mt: 0.5 }}>
            Фиксируйте сумму, которую вы отдали в обменнике, и реальный курс, по которому получили {trip.local_currency}.
          </Typography>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <TextField fullWidth label={`Отдал (${trip.base_currency})`} type="number"
                required inputProps={{ min: 0, step: 'any' }}
                value={exForm.amount_base}
                onChange={e => setExForm(p => ({ ...p, amount_base: e.target.value }))}
                InputProps={{
                  endAdornment: <InputAdornment position="end">{trip.base_currency}</InputAdornment>,
                }} />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth
                label={`Курс (1 ${trip.base_currency} = ? ${trip.local_currency})`}
                type="number" required inputProps={{ min: 0, step: 'any' }}
                value={exForm.exchange_rate}
                onChange={e => setExForm(p => ({ ...p, exchange_rate: e.target.value }))}
                helperText={exLocalPreview || ' '} />
            </Grid>
          </Grid>
          <TextField fullWidth label="Дата" type="date" required value={exForm.occurred_at}
            onChange={e => setExForm(p => ({ ...p, occurred_at: e.target.value }))}
            InputLabelProps={{ shrink: true }} sx={{ mb: 2 }} />
          <TextField fullWidth label="Заметки" value={exForm.notes}
            onChange={e => setExForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Обменник у отеля, курс выгоднее..." />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setExOpen(false)} disabled={exSaving}>Отмена</Button>
          <Button variant="contained" onClick={handleExSave} disabled={exSaving}>
            {exSaving ? 'Сохранение...' : 'Записать'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TripDetailPage;
