import React, { useEffect, useState } from 'react';
import {
  Alert,
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
  Tabs,
  Tab,
  Button,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import Layout from '../components/Layout';
import { financeApi, studentsApi } from '../services/api';
import type { FinanceAccountBalance, FinanceLedgerBankRow, FinanceAnalyticsSummary, Student } from '../types';
import { EmptyState, FilterPanel, FormDialog, LoadingSkeleton } from '../components/ui';

const FinanceOverviewPageContent: React.FC = () => {
  const [tab, setTab] = useState<'analytics' | 'overview' | 'all' | 'unclassified'>('analytics');
  const [asOf, setAsOf] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [balances, setBalances] = useState<FinanceAccountBalance[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesError, setBalancesError] = useState<string | null>(null);

  const [pnlFrom, setPnlFrom] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [pnlTo, setPnlTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [analytics, setAnalytics] = useState<FinanceAnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const [journalRows, setJournalRows] = useState<FinanceLedgerBankRow[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [journalFrom, setJournalFrom] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [journalTo, setJournalTo] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [journalTargetFilter, setJournalTargetFilter] = useState<'all' | number>('all');
  const [journalDirectionFilter, setJournalDirectionFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [targets, setTargets] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [articles, setArticles] = useState<Array<{ id: number; name: string; direction: string }>>([]);
  const [accounts, setAccounts] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [importAccountId, setImportAccountId] = useState<number | ''>('');
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedJournalTx, setSelectedJournalTx] = useState<FinanceLedgerBankRow | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentOptions, setStudentOptions] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualAccountId, setManualAccountId] = useState<number | ''>('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualDirection, setManualDirection] = useState<'income' | 'expense'>('income');
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualArticleId, setManualArticleId] = useState<number | ''>('');
  const [manualTargetId, setManualTargetId] = useState<number | ''>('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

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
    if (tab !== 'analytics') return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    financeApi
      .getAnalyticsSummary({
        date_from: pnlFrom || undefined,
        date_to: pnlTo || undefined,
        group_by: 'month',
      })
      .then(setAnalytics)
      .catch((err: any) => {
        setAnalyticsError(err?.response?.data?.detail || err?.message || 'Не удалось загрузить финансовую аналитику');
        setAnalytics(null);
      })
      .finally(() => setAnalyticsLoading(false));
  }, [tab, pnlFrom, pnlTo]);

  useEffect(() => {
    if (!applyDialogOpen || !studentSearch.trim()) {
      setStudentOptions([]);
      return;
    }
    const t = setTimeout(() => {
      studentsApi
        .getAll({ q: studentSearch.trim(), limit: 20 })
        .then((data) => setStudentOptions(data))
        .catch(() => setStudentOptions([]));
    }, 300);
    return () => clearTimeout(t);
  }, [applyDialogOpen, studentSearch]);

  useEffect(() => {
    if (tab === 'overview') return;
    // Загружаем справочники один раз при первом открытии вкладки журнала
    if (!targets.length) {
      financeApi
        .listTargets()
        .then((list) => {
          setTargets(list.map((t) => ({ id: t.id, code: t.code, name: t.name })));
        })
        .catch(() => setTargets([]));
    }
    if (!articles.length) {
      financeApi
        .listArticles({})
        .then((list) => {
          setArticles(list.map((a) => ({ id: a.id, name: a.name, direction: a.direction })));
        })
        .catch(() => setArticles([]));
    }

    if (!accounts.length) {
      financeApi
        .listAccounts()
        .then((list) => {
          setAccounts(list.map((a) => ({ id: a.id, code: a.code, name: a.name })));
        })
        .catch(() => setAccounts([]));
    }

    setJournalLoading(true);
    setJournalError(null);
    financeApi
      .listJournalTransactions({
        unclassified_only: tab === 'unclassified',
        target_ids: journalTargetFilter === 'all' ? undefined : [journalTargetFilter],
        direction: journalDirectionFilter === 'all' ? undefined : journalDirectionFilter,
        date_from: journalFrom || undefined,
        date_to: journalTo || undefined,
        limit: 5000,
      })
      .then(setJournalRows)
      .catch((err: any) => {
        setJournalError(err?.response?.data?.detail || err?.message || 'Не удалось загрузить операции журнала');
        setJournalRows([]);
      })
      .finally(() => setJournalLoading(false));
  }, [tab, journalFrom, journalTo, journalTargetFilter, journalDirectionFilter, targets.length, articles.length, accounts.length]);

  const closeApplyDialog = () => {
    setApplyDialogOpen(false);
    setSelectedJournalTx(null);
    setStudentSearch('');
    setStudentOptions([]);
    setSelectedStudent(null);
  };

  const handleApplyStudentPayment = async () => {
    if (!selectedJournalTx || !selectedStudent) return;
    try {
      setApplyLoading(true);
      const updated = await financeApi.applyTransactionToStudent(selectedJournalTx.id, {
        student_id: selectedStudent.id,
      });
      setJournalRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      closeApplyDialog();
    } catch (err: any) {
      setJournalError(
        err?.response?.data?.detail ||
          err?.message ||
          'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°С‡РёСЃР»РёС‚СЊ РїР»Р°С‚С‘Р¶ РЅР° СЃС‡С‘С‚ СѓС‡РµРЅРёРєР°'
      );
    } finally {
      setApplyLoading(false);
    }
  };

  const handleCreateManualOperation = async () => {
    if (!manualAccountId || !manualAmount || Number(manualAmount) <= 0) return;
    setManualSubmitting(true);
    setManualError(null);
    try {
      await financeApi.createManualTransaction({
        account_id: Number(manualAccountId),
        amount: Number(manualAmount),
        direction: manualDirection,
        occurred_at: manualDate,
        article_id: manualArticleId === '' ? null : manualArticleId,
        target_id: manualTargetId === '' ? null : manualTargetId,
        description: manualDescription.trim() || null,
      });
      setManualDialogOpen(false);
      const refreshed = await financeApi.listJournalTransactions({
        unclassified_only: tab === 'unclassified',
        target_ids: journalTargetFilter === 'all' ? undefined : [journalTargetFilter],
        direction: journalDirectionFilter === 'all' ? undefined : journalDirectionFilter,
        date_from: journalFrom || undefined,
        date_to: journalTo || undefined,
        limit: 5000,
      });
      setJournalRows(refreshed);
    } catch (err: any) {
      setManualError(err?.response?.data?.detail || err?.message || 'РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ РѕРїРµСЂР°С†РёСЋ');
    } finally {
      setManualSubmitting(false);
    }
  };

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
        >
          <Tab value="overview" label="Обзор" />
          <Tab value="all" label="Все операции" />
          <Tab value="unclassified" label="Неразобранные" />
          <Tab value="analytics" label="Аналитика" />
        </Tabs>
      </Box>

      {tab === 'analytics' && (
        <Box>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Управленческая финансовая аналитика
          </Typography>
          <FilterPanel>
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
            {analyticsLoading && (
              <Typography variant="body2" color="text.secondary">
                Загрузка...
              </Typography>
            )}
          </FilterPanel>

          {analyticsError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {analyticsError}
            </Alert>
          )}

          {analyticsLoading && <LoadingSkeleton rows={4} />}

          {!analyticsLoading && !analyticsError && !analytics && (
            <EmptyState
              title="Финансовая аналитика недоступна"
              description="Выберите период или дождитесь загрузки данных."
            />
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
        </Box>
      )}

      {tab === 'overview' && (
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
      )}

      {tab !== 'overview' && (
        <Box>
        <Typography variant="h6" sx={{ mb: 1 }}>
          {tab === 'all' ? 'Все операции журнала' : 'Неразобранные операции журнала'}
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Счёт для импорта</InputLabel>
            <Select
              label="Счёт для импорта"
              value={importAccountId === '' ? '' : String(importAccountId)}
              onChange={(e) => {
                const v = e.target.value;
                setImportAccountId(v === '' ? '' : Number(v));
              }}
            >
              <MenuItem value="">
                <em>Не выбран</em>
              </MenuItem>
              {accounts.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name}
                  {a.code ? ` (${a.code})` : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            component="label"
            disabled={importLoading || !importAccountId}
          >
            {importLoading ? 'Импорт операций…' : 'Импортировать CSV/XLSX'}
            <input
              type="file"
              accept=".csv,.xlsx"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                if (!importAccountId) {
                  setJournalError('Сначала выберите счёт для импорта');
                  return;
                }
                const acc = accounts.find((a) => a.id === importAccountId);
                if (!acc) {
                  setJournalError('Выбранный счёт не найден');
                  return;
                }
                setImportLoading(true);
                setJournalError(null);
                setImportMessage(null);
                try {
                  const res = await financeApi.importJournalFile(acc.code, file);
                  setImportMessage(
                    `Импортировано операций: ${res.imported}. Пропущено (дубли или ошибки): ${res.skipped}.`
                  );
                  // перезагружаем список с текущими фильтрами
                  const refreshed = await financeApi.listJournalTransactions({
                    unclassified_only: tab === 'unclassified',
                    target_ids: journalTargetFilter === 'all' ? undefined : [journalTargetFilter],
                    direction: journalDirectionFilter === 'all' ? undefined : journalDirectionFilter,
                    date_from: journalFrom || undefined,
                    date_to: journalTo || undefined,
                    limit: 5000,
                  });
                  setJournalRows(refreshed);
                } catch (err: any) {
                  setJournalError(
                    err?.response?.data?.detail ||
                      err?.message ||
                      'Ошибка импорта файла. Убедитесь, что формат: date,amount,counterparty,description[,bank_operation_id].'
                  );
                } finally {
                  setImportLoading(false);
                }
              }}
            />
          </Button>
          {importMessage && (
            <Typography variant="body2" color="text.secondary">
              {importMessage}
            </Typography>
          )}
          <Button
            variant="contained"
            onClick={() => {
              const nalichka = accounts.find((a) => a.code === 'nalichka');
              setManualAccountId(nalichka?.id ?? accounts[0]?.id ?? '');
              setManualAmount('');
              setManualDirection('income');
              setManualDate(new Date().toISOString().slice(0, 10));
              setManualArticleId('');
              setManualTargetId('');
              setManualDescription('');
              setManualError(null);
              setManualDialogOpen(true);
            }}
          >
            Добавить операцию (наличные)
          </Button>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
          <TextField
            label="С"
            type="date"
            size="small"
            value={journalFrom}
            onChange={(e) => setJournalFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="По"
            type="date"
            size="small"
            value={journalTo}
            onChange={(e) => setJournalTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Проект</InputLabel>
            <Select
              label="Проект"
              value={journalTargetFilter === 'all' ? 'all' : String(journalTargetFilter)}
              onChange={(e) => {
                const v = e.target.value;
                setJournalTargetFilter(v === 'all' ? 'all' : Number(v));
              }}
            >
              <MenuItem value="all">Все проекты</MenuItem>
              {targets.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Тип</InputLabel>
            <Select
              label="Тип"
              value={journalDirectionFilter}
              onChange={(e) => setJournalDirectionFilter(e.target.value as typeof journalDirectionFilter)}
            >
              <MenuItem value="all">Все</MenuItem>
              <MenuItem value="income">Доход</MenuItem>
              <MenuItem value="expense">Расход</MenuItem>
              <MenuItem value="transfer">Перевод</MenuItem>
            </Select>
          </FormControl>
          {journalLoading && (
            <Typography variant="body2" color="text.secondary">
              Загрузка…
            </Typography>
          )}
          {journalError && (
            <Typography variant="body2" color="error">
              {journalError}
            </Typography>
          )}
        </Box>
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Дата</TableCell>
                <TableCell>Счёт</TableCell>
                <TableCell>Проект</TableCell>
                <TableCell>Статья</TableCell>
                <TableCell>Тип</TableCell>
                <TableCell align="right">Сумма</TableCell>
                <TableCell>Контрагент</TableCell>
                <TableCell>Описание / источник</TableCell>
                <TableCell>Ученики</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {journalRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.occurred_at ? new Date(row.occurred_at).toLocaleString('ru-RU') : '—'}</TableCell>
                  <TableCell>
                    {row.account_name
                      ? `${row.account_name}${row.account_code ? ` (${row.account_code})` : ''}`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <FormControl size="small" sx={{ minWidth: 180 }}>
                      <Select
                        value={row.target_id ?? ''}
                        displayEmpty
                        onChange={async (e) => {
                          const v = e.target.value as number | '';
                          const target_id = v === '' ? null : Number(v);
                          try {
                            const updated = await financeApi.updateTransaction(row.id, { target_id });
                            setJournalRows((prev) =>
                              prev
                                .map((r) => (r.id === row.id ? updated : r))
                                .filter((r) =>
                                  tab === 'unclassified'
                                    ? !(
                                        r.target_id !== null &&
                                        r.target_id !== undefined &&
                                        r.article_id !== null &&
                                        r.article_id !== undefined
                                      )
                                    : true
                                )
                            );
                          } catch (err: any) {
                            setJournalError(
                              err?.response?.data?.detail ||
                                err?.message ||
                                'Не удалось сохранить проект операции'
                            );
                          }
                        }}
                        renderValue={(v) => {
                          if (!v) return <em>Не выбран</em>;
                          const t = targets.find((t) => t.id === v);
                          return t ? t.name : row.target_name || row.target_code || v;
                        }}
                      >
                        <MenuItem value="">
                          <em>Не выбран</em>
                        </MenuItem>
                        {targets.map((t) => (
                          <MenuItem key={t.id} value={t.id}>
                            {t.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell>
                    {row.direction === 'transfer' ? (
                      row.article_name || '—'
                    ) : (
                      <FormControl size="small" sx={{ minWidth: 200 }}>
                        <Select
                          value={row.article_id ?? ''}
                          displayEmpty
                          onChange={async (e) => {
                            const v = e.target.value as number | '';
                            const article_id = v === '' ? null : Number(v);
                            try {
                              const updated = await financeApi.updateTransaction(row.id, { article_id });
                              setJournalRows((prev) =>
                                prev
                                  .map((r) => (r.id === row.id ? updated : r))
                                  .filter((r) =>
                                    tab === 'unclassified'
                                      ? !(
                                          r.target_id !== null &&
                                          r.target_id !== undefined &&
                                          r.article_id !== null &&
                                          r.article_id !== undefined
                                        )
                                      : true
                                  )
                              );
                            } catch (err: any) {
                              setJournalError(
                                err?.response?.data?.detail ||
                                  err?.message ||
                                  'Не удалось сохранить статью операции'
                              );
                            }
                          }}
                          renderValue={(v) => {
                            if (!v) return <em>Не выбрана</em>;
                            const a = articles.find((a) => a.id === v);
                            return a ? a.name : row.article_name || v;
                          }}
                        >
                          <MenuItem value="">
                            <em>Не выбрана</em>
                          </MenuItem>
                          {articles
                            .filter((a) =>
                              row.direction === 'income'
                                ? a.direction === 'income'
                                : row.direction === 'expense'
                                ? a.direction === 'expense'
                                : true
                            )
                            .map((a) => (
                              <MenuItem key={a.id} value={a.id}>
                                {a.name}
                              </MenuItem>
                            ))}
                        </Select>
                      </FormControl>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.direction === 'income'
                      ? 'Доход'
                      : row.direction === 'expense'
                      ? 'Расход'
                      : 'Перевод'}
                  </TableCell>
                  <TableCell align="right" sx={{ color: row.direction === 'expense' ? 'error.main' : 'success.main' }}>
                    {row.amount.toFixed(2)}
                  </TableCell>
                  <TableCell>{row.counterparty_name || '—'}</TableCell>
                  <TableCell>
                    {row.bank_source
                      ? `${row.bank_source}${row.bank_operation_id ? ` (${row.bank_operation_id})` : ''}`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {row.direction === 'income' && (!row.status || row.status !== 'applied') && (
                      <Typography
                        component="button"
                        variant="body2"
                        color="primary"
                        sx={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          p: 0,
                        }}
                        onClick={() => {
                          setSelectedJournalTx(row);
                          setStudentSearch('');
                          setSelectedStudent(null);
                          setStudentOptions([]);
                          setApplyDialogOpen(true);
                        }}
                      >
                        Зачислить ученику
                      </Typography>
                    )}
                    {row.direction === 'income' && row.status === 'applied' && row.student_id && (
                      <Typography variant="body2" color="text.secondary">
                        Зачислено (ученик #{row.student_id})
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      variant="text"
                      color="error"
                      size="small"
                      startIcon={<DeleteIcon fontSize="small" />}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            'Удалить эту операцию из единого финансового журнала? Это действие нельзя отменить.'
                          )
                        ) {
                          return;
                        }
                        try {
                          await financeApi.deleteTransaction(row.id);
                          setJournalRows((prev) => prev.filter((r) => r.id !== row.id));
                        } catch (err: any) {
                          setJournalError(
                            err?.response?.data?.detail ||
                              err?.message ||
                              'Не удалось удалить операцию из журнала'
                          );
                        }
                      }}
                    >
                      Удалить
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {journalRows.length === 0 && !journalLoading && (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    Нет операций за выбранный период.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      </Box>
      )}

      <FormDialog
        open={applyDialogOpen && !!selectedJournalTx}
        onClose={() => {
          setApplyDialogOpen(false);
          setSelectedJournalTx(null);
          setStudentSearch('');
          setStudentOptions([]);
          setSelectedStudent(null);
        }}
        onSubmit={handleApplyStudentPayment}
        submitLabel={applyLoading ? 'РЎРѕС…СЂР°РЅРµРЅРёРµ...' : 'Р—Р°С‡РёСЃР»РёС‚СЊ'}
        submitDisabled={!selectedJournalTx || !selectedStudent || applyLoading}
        title="Р—Р°С‡РёСЃР»РёС‚СЊ РїР»Р°С‚С‘Р¶ СѓС‡РµРЅРёРєСѓ"
        maxWidth="sm"
      >
        <DialogTitle>Зачислить платёж ученику</DialogTitle>
          {selectedJournalTx && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>Дата:</strong>{' '}
                {selectedJournalTx.occurred_at
                  ? new Date(selectedJournalTx.occurred_at).toLocaleString('ru-RU')
                  : '—'}
              </Typography>
              <Typography variant="body2">
                <strong>Сумма:</strong> {selectedJournalTx.amount.toFixed(2)}
              </Typography>
              <Typography variant="body2">
                <strong>Контрагент:</strong> {selectedJournalTx.counterparty_name || '—'}
              </Typography>
            </Box>
          )}
          <TextField
            label="Поиск ученика по ФИО"
            fullWidth
            size="small"
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            helperText="Начните вводить ФИО ученика, чтобы найти и привязать платёж"
            sx={{ mb: 1 }}
          />
          {studentOptions.length > 0 && (
            <Box
              sx={{
                maxHeight: 200,
                overflowY: 'auto',
                border: '1px solid #eee',
                borderRadius: 1,
                p: 1,
              }}
            >
              {studentOptions.map((s) => (
                <Typography
                  key={s.id}
                  variant="body2"
                  sx={{
                    py: 0.5,
                    px: 1,
                    borderRadius: 1,
                    cursor: 'pointer',
                    bgcolor: selectedStudent?.id === s.id ? 'action.selected' : 'transparent',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                  onClick={() => setSelectedStudent(s)}
                >
                  {s.full_name} (id: {s.id})
                </Typography>
              ))}
            </Box>
          )}
        <DialogActions>
          <Button
            onClick={() => {
              setApplyDialogOpen(false);
              setSelectedJournalTx(null);
              setStudentSearch('');
              setStudentOptions([]);
              setSelectedStudent(null);
            }}
          >
            Отмена
          </Button>
          <Button
            variant="contained"
            disabled={!selectedJournalTx || !selectedStudent || applyLoading}
            onClick={async () => {
              if (!selectedJournalTx || !selectedStudent) return;
              try {
                setApplyLoading(true);
                const updated = await financeApi.applyTransactionToStudent(selectedJournalTx.id, {
                  student_id: selectedStudent.id,
                });
                setJournalRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
                setApplyDialogOpen(false);
                setSelectedJournalTx(null);
                setStudentSearch('');
                setStudentOptions([]);
                setSelectedStudent(null);
              } catch (err: any) {
                setJournalError(
                  err?.response?.data?.detail ||
                    err?.message ||
                    'Не удалось зачислить платёж на счёт ученика'
                );
              } finally {
                setApplyLoading(false);
              }
            }}
          >
            {applyLoading ? 'Сохранение...' : 'Зачислить'}
          </Button>
        </DialogActions>
      </FormDialog>

      <FormDialog open={manualDialogOpen} onClose={() => !manualSubmitting && setManualDialogOpen(false)} onSubmit={handleCreateManualOperation} submitLabel={manualSubmitting ? 'РЎРѕС…СЂР°РЅРµРЅРёРµвЂ¦' : 'Р”РѕР±Р°РІРёС‚СЊ'} submitDisabled={manualSubmitting || !manualAccountId || !manualAmount || Number(manualAmount) <= 0} title="Р”РѕР±Р°РІРёС‚СЊ РѕРїРµСЂР°С†РёСЋ (СЂСѓС‡РЅР°СЏ Р·Р°РїРёСЃСЊ)" maxWidth="sm">
        <DialogTitle>Добавить операцию (ручная запись)</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            {manualError && (
              <Typography color="error" variant="body2">{manualError}</Typography>
            )}
            <FormControl size="small" fullWidth>
              <InputLabel>Счёт</InputLabel>
              <Select
                label="Счёт"
                value={manualAccountId === '' ? '' : String(manualAccountId)}
                onChange={(e) => setManualAccountId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                {accounts.map((a) => (
                  <MenuItem key={a.id} value={a.id}>{a.name}{a.code ? ` (${a.code})` : ''}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Дата"
              type="date"
              size="small"
              fullWidth
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Направление</InputLabel>
              <Select
                label="Направление"
                value={manualDirection}
                onChange={(e) => setManualDirection(e.target.value as 'income' | 'expense')}
              >
                <MenuItem value="income">Приход</MenuItem>
                <MenuItem value="expense">Расход</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Сумма"
              type="number"
              size="small"
              fullWidth
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              inputProps={{ min: 0, step: 0.01 }}
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Статья</InputLabel>
              <Select
                label="Статья"
                value={manualArticleId === '' ? '' : String(manualArticleId)}
                onChange={(e) => setManualArticleId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <MenuItem value="">— Не выбрана</MenuItem>
                {articles.filter((a) => a.direction === manualDirection).map((a) => (
                  <MenuItem key={a.id} value={a.id}>{a.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Проект / цель</InputLabel>
              <Select
                label="Проект / цель"
                value={manualTargetId === '' ? '' : String(manualTargetId)}
                onChange={(e) => setManualTargetId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <MenuItem value="">— Не выбран</MenuItem>
                {targets.map((t) => (
                  <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Комментарий (необязательно)"
              size="small"
              fullWidth
              multiline
              minRows={2}
              value={manualDescription}
              onChange={(e) => setManualDescription(e.target.value)}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => !manualSubmitting && setManualDialogOpen(false)} disabled={manualSubmitting}>Отмена</Button>
          <Button
            variant="contained"
            disabled={manualSubmitting || !manualAccountId || !manualAmount || Number(manualAmount) <= 0}
            onClick={async () => {
              if (!manualAccountId || !manualAmount || Number(manualAmount) <= 0) return;
              setManualSubmitting(true);
              setManualError(null);
              try {
                await financeApi.createManualTransaction({
                  account_id: Number(manualAccountId),
                  amount: Number(manualAmount),
                  direction: manualDirection,
                  occurred_at: manualDate,
                  article_id: manualArticleId === '' ? null : manualArticleId,
                  target_id: manualTargetId === '' ? null : manualTargetId,
                  description: manualDescription.trim() || null,
                });
                setManualDialogOpen(false);
                const refreshed = await financeApi.listJournalTransactions({
                  unclassified_only: tab === 'unclassified',
                  target_ids: journalTargetFilter === 'all' ? undefined : [journalTargetFilter],
                  direction: journalDirectionFilter === 'all' ? undefined : journalDirectionFilter,
                  date_from: journalFrom || undefined,
                  date_to: journalTo || undefined,
                  limit: 5000,
                });
                setJournalRows(refreshed);
              } catch (err: any) {
                setManualError(err?.response?.data?.detail || err?.message || 'Не удалось добавить операцию');
              } finally {
                setManualSubmitting(false);
              }
            }}
          >
            {manualSubmitting ? 'Сохранение…' : 'Добавить'}
          </Button>
        </DialogActions>
      </FormDialog>
    </Box>
  );
};

const FinanceOverviewPage: React.FC = () => (
  <Layout>
    <FinanceOverviewPageContent />
  </Layout>
);

export default FinanceOverviewPage;

