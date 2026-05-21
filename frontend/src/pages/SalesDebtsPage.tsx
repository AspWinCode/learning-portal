import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  TextField,
  Typography,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { studentsApi } from '../services/api';
import { salesApi } from '../services/api';
import { financeApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { BankTransaction, FinanceLedgerBankRow, Student } from '../types';
import { getEffectiveRole } from '../utils/permissions';

interface PaymentStatusRow {
  student_id: number;
  student_name: string;
  card_id?: number;
  next_payment_date?: string | null;
  learning_period_start?: string | null;
  status: string;
}

const STATUS_LABELS: Record<string, { label: string; color: 'default' | 'warning' | 'error' | 'success' }> = {
  overdue: { label: 'Просрочено', color: 'error' },
  due_soon: { label: 'Скоро', color: 'warning' },
  ok: { label: 'Оплачено', color: 'success' },
  unpaid: { label: 'Не оплачено', color: 'warning' },
};

const SalesDebtsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const effectiveRole = getEffectiveRole(user);
  const isAdmin = effectiveRole === 'admin';
  const isSales = effectiveRole === 'sales';
  const showBankTab = !isAdmin && !isSales;
  const [items, setItems] = useState<PaymentStatusRow[]>([]);
  const [bankItems, setBankItems] = useState<BankTransaction[]>([]);
  const [ledgerByOperationId, setLedgerByOperationId] = useState<Record<string, FinanceLedgerBankRow>>({});
  const [financeTargets, setFinanceTargets] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [financeArticles, setFinanceArticles] = useState<Array<{ id: number; name: string; direction: string }>>([]);
  const [financeAccounts, setFinanceAccounts] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [filterUnclassifiedOnly, setFilterUnclassifiedOnly] = useState(false);
  const [filterTransfersWithoutTo, setFilterTransfersWithoutTo] = useState(false);
  const [filterNewOnly, setFilterNewOnly] = useState(false);
  const [selectedBankOperationIds, setSelectedBankOperationIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<BankTransaction | null>(null);
  const [studentQuery, setStudentQuery] = useState('');
  const [studentOptions, setStudentOptions] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [importRunning, setImportRunning] = useState(false);
  const [importResult, setImportResult] = useState<{
    applied: number;
    no_match: number;
    ambiguous: number;
  } | null>(null);
  const [importFileRunning, setImportFileRunning] = useState(false);
  const [importFileResult, setImportFileResult] = useState<{
    imported: number;
    skipped: number;
    errors?: string[];
  } | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<{ overdue_3_count: number; overdue_10_count: number } | null>(null);

  // Админ и sales не видят вкладку "Операции банка" — при прямом доступе переключаем на первую
  useEffect(() => {
    if (!showBankTab && tab === 3) setTab(0);
  }, [showBankTab, tab]);

  const statusFilter = tab === 0 ? undefined : tab === 1 ? 'overdue' : tab === 2 ? 'due_soon' : undefined;

  const loadDebts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await salesApi.getPaymentStatus(statusFilter ? { status: statusFilter } : {});
      setItems(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const loadBankTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await salesApi.listBankTransactions();
      setBankItems(data);
      // Подгружаем сопоставленные записи единого журнала
      const ledger = await financeApi.listLedgerBank({ limit: 500 });
      const map: Record<string, FinanceLedgerBankRow> = {};
      ledger.forEach((row) => {
        const key = row.bank_operation_id || String(row.id);
        map[key] = row;
      });
      setLedgerByOperationId(map);
      // Справочники для выбора «Куда», «Статья» и счетов
      const [targets, articles, accounts] = await Promise.all([
        financeApi.listTargets(),
        financeApi.listArticles({}), // все активные статьи
        financeApi.listAccounts(),
      ]);
      setFinanceTargets(targets.map((t) => ({ id: t.id, code: t.code, name: t.name })));
      setFinanceArticles(articles.map((a) => ({ id: a.id, name: a.name, direction: a.direction })));
      setFinanceAccounts(accounts.map((a) => ({ id: a.id, code: a.code, name: a.name })));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить операции банка'));
      setBankItems([]);
      setLedgerByOperationId({});
      setFinanceTargets([]);
      setFinanceArticles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const runTochkaImportNow = useCallback(async () => {
    setImportRunning(true);
    setImportResult(null);
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date();
    from.setDate(from.getDate() - 14);
    const dateFrom = from.toISOString().slice(0, 10);
    try {
      const res = await salesApi.tochkaImportAndApply({ date_from: dateFrom, date_to: today });
      setImportResult({
        applied: res.applied?.length ?? 0,
        no_match: res.no_match?.length ?? 0,
        ambiguous: res.ambiguous?.length ?? 0,
      });
      await loadBankTransactions();
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка импорта Точка Банк. Проверьте TOCHKA_CLIENT_ID, TOCHKA_CLIENT_SECRET, TOCHKA_ACCOUNT_ID на сервере.'));
    } finally {
      setImportRunning(false);
    }
  }, [loadBankTransactions]);

  const loadPaymentSummary = useCallback(async () => {
    try {
      const data = await salesApi.getPaymentStatusSummary();
      setPaymentSummary(data);
    } catch {
      setPaymentSummary(null);
    }
  }, []);

  useEffect(() => {
    if (showBankTab && tab === 3) {
      void loadBankTransactions();
    } else {
      void loadDebts();
      void loadPaymentSummary();
    }
  }, [showBankTab, tab, loadDebts, loadBankTransactions, loadPaymentSummary]);

  useEffect(() => {
    if (!studentQuery.trim()) {
      setStudentOptions([]);
      return;
    }
    const t = setTimeout(() => {
      studentsApi
        .getAll({ q: studentQuery.trim(), limit: 20 })
        .then((data) => setStudentOptions(data))
        .catch(() => setStudentOptions([]));
    }, 300);
    return () => clearTimeout(t);
  }, [studentQuery]);

  const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    try {
      return format(parseISO(d), 'd MMM yyyy', { locale: ru });
    } catch {
      return d;
    }
  };

  return (
    <Layout>
      <Box sx={{ p: 2 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Долги и оплаты
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Ученики с датой следующей оплаты. Просрочено — дата оплаты прошла; Скоро — в ближайшие 3 дня.
          Для импорта и разбора всех финансовых операций используйте раздел «Финансы (журнал)». Здесь — только
          операционная работа с оплатами и очередью банковских операций.
        </Typography>

        {(!showBankTab || tab !== 3) && (
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
              KPI:
            </Typography>
            <Chip
              label={`Долгов 3+ дней: ${paymentSummary?.overdue_3_count ?? '—'}`}
              color={paymentSummary && paymentSummary.overdue_3_count > 0 ? 'warning' : 'default'}
              variant="outlined"
              sx={{ fontWeight: 500 }}
            />
            <Chip
              label={`Долгов 10+ дней: ${paymentSummary?.overdue_10_count ?? '—'}`}
              color={paymentSummary && paymentSummary.overdue_10_count > 0 ? 'error' : 'default'}
              variant="outlined"
              sx={{ fontWeight: 500 }}
            />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="Все" />
          <Tab label="Просрочено" />
          <Tab label="Скоро (3 дня)" />
          {showBankTab && <Tab label="Операции банка" />}
        </Tabs>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : showBankTab && tab === 3 ? (
          <Card variant="outlined" sx={{ overflow: 'visible' }}>
            <Box sx={{ p: 2, pb: 0, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                disabled={importRunning}
                onClick={() => void runTochkaImportNow()}
              >
                {importRunning ? 'Загрузка выписки…' : 'Загрузить выписку сейчас (14 дней)'}
              </Button>
              <Typography variant="body2" color="text.secondary">
                То же делает авто-импорт каждые 10 мин. Если здесь пусто — нажмите кнопку или проверьте настройки
                Точка Банк на сервере. Для импорта произвольных CSV/XLSX по другим счетам используйте раздел
                «Финансы (журнал)» → вкладка «Все операции».
              </Typography>
            </Box>
            <Box sx={{ p: 2, pt: 1, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                component="label"
                disabled={importFileRunning}
              >
                {importFileRunning ? 'Импорт выписки из файла…' : 'Импортировать выписку из XLSX (Точка)'}
                <input
                  type="file"
                  accept=".xlsx"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setImportFileRunning(true);
                      setImportFileResult(null);
                      const res = await salesApi.importBankTransactionsXlsx(file);
                      setImportFileResult({
                        imported: res.imported ?? 0,
                        skipped: res.skipped ?? 0,
                        errors: res.errors,
                      });
                      await loadBankTransactions();
                    } catch (err: any) {
                      setError(extractApiError(err, 'Ошибка импорта из файла'));
                    } finally {
                      setImportFileRunning(false);
                      e.target.value = '';
                    }
                  }}
                />
              </Button>
              <Typography variant="body2" color="text.secondary">
                Можно загрузить выписку, скачанную из банка в формате .xlsx. Новые операции появятся в списке ниже.
              </Typography>
            </Box>
            {importResult && (
              <Box sx={{ px: 2, pb: 1 }}>
                <Typography variant="body2">
                  Зачислено: <strong>{importResult.applied}</strong>, без совпадения: {importResult.no_match}, несколько кандидатов: {importResult.ambiguous}.
                </Typography>
              </Box>
            )}
            {importFileResult && (
              <Box sx={{ px: 2, pb: 1 }}>
                <Typography variant="body2">
                  Из файла добавлено операций: <strong>{importFileResult.imported}</strong>, пропущено (дубли или некорректные строки): {importFileResult.skipped}.
                </Typography>
                {importFileResult.errors && importFileResult.errors.length > 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {importFileResult.errors.join(' ')}
                  </Typography>
                )}
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filterUnclassifiedOnly}
                    onChange={(e) => setFilterUnclassifiedOnly(e.target.checked)}
                    size="small"
                  />
                }
                label="Не разобрано (нет target или статьи)"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filterTransfersWithoutTo}
                    onChange={(e) => setFilterTransfersWithoutTo(e.target.checked)}
                    size="small"
                  />
                }
                label="Только переводы без счёта назначения"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filterNewOnly}
                    onChange={(e) => setFilterNewOnly(e.target.checked)}
                    size="small"
                  />
                }
                label="Только новые"
              />
              <Button
                variant="outlined"
                size="small"
                disabled={selectedBankOperationIds.size !== 2}
                onClick={async () => {
                  const selected = bankItems.filter((tx) => selectedBankOperationIds.has(tx.operation_id));
                  if (selected.length !== 2) {
                    window.alert('Нужно выбрать ровно две операции для связывания как перевод.');
                    return;
                  }
                  const [tx1, tx2] = selected;
                  const l1 = ledgerByOperationId[tx1.operation_id];
                  const l2 = ledgerByOperationId[tx2.operation_id];
                  if (!l1 || !l2) {
                    window.alert('Для выбранных операций нет данных журнала.');
                    return;
                  }
                  if (Math.abs(l1.amount) !== Math.abs(l2.amount)) {
                    window.alert('Суммы выбранных операций должны совпадать по модулю.');
                    return;
                  }
                  if (tx1.payment_date && tx2.payment_date) {
                    const d1 = new Date(tx1.payment_date + 'T00:00:00');
                    const d2 = new Date(tx2.payment_date + 'T00:00:00');
                    const diffDays = Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24);
                    if (diffDays > 1.0001) {
                      window.alert('Переводы можно связывать только если разница по дате не более 1 дня.');
                      return;
                    }
                  }
                  const isFirstExpense = l1.amount < 0;
                  const from = isFirstExpense ? l1 : l2;
                  const to = isFirstExpense ? l2 : l1;
                  const pairIds = [from.id, to.id].sort((a, b) => a - b);
                  const transfer_group_id = `manual-${pairIds[0]}-${pairIds[1]}`;
                  try {
                    const updatedFrom = await financeApi.updateTransaction(from.id, {
                      direction: 'transfer',
                      to_account_id: to.account_id ?? null,
                      transfer_group_id,
                    });
                    const updatedTo = await financeApi.updateTransaction(to.id, {
                      direction: 'transfer',
                      to_account_id: from.account_id ?? null,
                      transfer_group_id,
                    });
                    setLedgerByOperationId((prev) => ({
                      ...prev,
                      [tx1.operation_id]: updatedFrom.id === l1.id ? updatedFrom : updatedTo,
                      [tx2.operation_id]: updatedFrom.id === l2.id ? updatedFrom : updatedTo,
                    }));
                    setSelectedBankOperationIds(new Set());
                  } catch (err: any) {
                    setError(extractApiError(err, 'Не удалось связать операции как перевод'));
                  }
                }}
              >
                Связать как перевод
              </Button>
            </Box>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    {/* выбор только по строкам с ledger */}
                  </TableCell>
                  <TableCell>Дата</TableCell>
                  <TableCell>Счёт</TableCell>
                  <TableCell>Тип</TableCell>
                  <TableCell>Куда перевод</TableCell>
                  <TableCell>Сумма</TableCell>
                  <TableCell>ФИО плательщика / Контрагент</TableCell>
                  <TableCell>Телефон</TableCell>
                  <TableCell>Куда (target)</TableCell>
                  <TableCell>Статья</TableCell>
                  <TableCell>Категория расхода</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell>Ученик</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {bankItems.map((tx) => {
                  const ledger = ledgerByOperationId[tx.operation_id] || null;
                  const direction = ledger?.direction || (tx.status === 'expense' || tx.amount < 0 ? 'expense' : 'income');
                  const isExpense = direction === 'expense';
                  const expenseCategorized = isExpense && !!(tx.expense_category ?? '').trim();
                  // Фильтры по ТЗ
                  if (filterUnclassifiedOnly) {
                    const unclassified = !ledger || !ledger.target_id || !ledger.article_id;
                    if (!unclassified) return null;
                  }
                  if (filterTransfersWithoutTo) {
                    const isTransferWithoutTo =
                      !!ledger && ledger.direction === 'transfer' && (!ledger.to_account_id || ledger.to_account_id === null);
                    if (!isTransferWithoutTo) return null;
                  }
                  if (filterNewOnly) {
                    const isNew = !ledger || ledger.status === 'new';
                    if (!isNew) return null;
                  }
                  const isSelected = !!ledger && selectedBankOperationIds.has(tx.operation_id);
                  return (
                    <TableRow
                      key={tx.id}
                      hover
                      sx={{
                        ...(expenseCategorized && {
                          bgcolor: 'success.light',
                          '&:hover': { bgcolor: 'success.light' },
                        }),
                      }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          disabled={!ledger}
                          checked={isSelected}
                          onChange={() => {
                            if (!ledger) return;
                            setSelectedBankOperationIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(tx.operation_id)) next.delete(tx.operation_id);
                              else next.add(tx.operation_id);
                              return next;
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell>{tx.payment_date || '—'}</TableCell>
                      <TableCell>
                        {ledger?.account_name
                          ? `${ledger.account_name}${ledger.account_code ? ` (${ledger.account_code})` : ''}`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {ledger ? (
                          <Select
                            size="small"
                            value={ledger.direction}
                            sx={{ minWidth: 120 }}
                            onChange={async (e) => {
                              if (!ledger) return;
                              const nextDirection = e.target.value as 'income' | 'expense' | 'transfer';
                              try {
                                const updated = await financeApi.updateTransaction(ledger.id, {
                                  direction: nextDirection,
                                  // если перестали быть переводом — сбрасываем счёт назначения
                                  to_account_id: nextDirection === 'transfer' ? ledger.to_account_id ?? null : null,
                                });
                                setLedgerByOperationId((prev) => ({
                                  ...prev,
                                  [tx.operation_id]: updated,
                                }));
                              } catch (err: any) {
                                setError(extractApiError(err, 'Не удалось сохранить тип операции'));
                              }
                            }}
                            renderValue={(v) => {
                              if (v === 'transfer') return 'Перевод';
                              if (v === 'expense') return 'Расход';
                              return 'Приход';
                            }}
                          >
                            <MenuItem value="income">Приход</MenuItem>
                            <MenuItem value="expense">Расход</MenuItem>
                            <MenuItem value="transfer">Перевод</MenuItem>
                          </Select>
                        ) : direction === 'transfer' ? (
                          'Перевод'
                        ) : isExpense ? (
                          'Расход'
                        ) : (
                          'Приход'
                        )}
                      </TableCell>
                      <TableCell>
                        {ledger && ledger.direction === 'transfer' ? (
                          <Select
                            size="small"
                            value={ledger.to_account_id ?? ''}
                            displayEmpty
                            sx={{ minWidth: 150 }}
                            onChange={async (e) => {
                              if (!ledger) return;
                              const value = e.target.value as number | '';
                              const to_account_id = value === '' ? null : Number(value);
                              try {
                                const updated = await financeApi.updateTransaction(ledger.id, { to_account_id });
                                setLedgerByOperationId((prev) => ({
                                  ...prev,
                                  [tx.operation_id]: updated,
                                }));
                              } catch (err: any) {
                                setError(extractApiError(err, 'Не удалось сохранить счёт назначения'));
                              }
                            }}
                            renderValue={(v) => {
                              if (!v) return <em>Не выбрано</em>;
                              const acc = financeAccounts.find((a) => a.id === v);
                              return acc ? `${acc.name}${acc.code ? ` (${acc.code})` : ''}` : v;
                            }}
                          >
                            <MenuItem value="">
                              <em>Не выбрано</em>
                            </MenuItem>
                            {financeAccounts.map((a) => (
                              <MenuItem key={a.id} value={a.id}>
                                {a.name}
                                {a.code ? ` (${a.code})` : ''}
                              </MenuItem>
                            ))}
                          </Select>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell sx={{ color: isExpense ? 'error.main' : undefined }}>
                        {isExpense ? '−' : '+'} {Math.abs(tx.amount).toFixed(2)} ₽
                      </TableCell>
                      <TableCell>{tx.payer_name || '—'}</TableCell>
                      <TableCell>{tx.payer_phone || '—'}</TableCell>
                      <TableCell>
                        {ledger ? (
                          <Select
                            size="small"
                            value={ledger.target_id ?? ''}
                            displayEmpty
                            sx={{ minWidth: 150 }}
                            onChange={async (e) => {
                              if (!ledger) return;
                              const value = e.target.value as number | '';
                              const target_id = value === '' ? null : Number(value);
                              try {
                                const updated = await financeApi.updateTransaction(ledger.id, { target_id });
                                setLedgerByOperationId((prev) => ({
                                  ...prev,
                                  [tx.operation_id]: updated,
                                }));
                              } catch (err: any) {
                                setError(extractApiError(err, 'Не удалось сохранить target'));
                              }
                            }}
                            renderValue={(v) => {
                              if (!ledger || !v) return <em>Не выбрано</em>;
                              const t = financeTargets.find((t) => t.id === v);
                              return t ? t.name : ledger.target_name || v;
                            }}
                          >
                            <MenuItem value="">
                              <em>Не выбрано</em>
                            </MenuItem>
                            {financeTargets.map((t) => (
                              <MenuItem key={t.id} value={t.id}>
                                {t.name}
                              </MenuItem>
                            ))}
                          </Select>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {ledger ? (
                          <Select
                            size="small"
                            value={ledger.article_id ?? ''}
                            displayEmpty
                            sx={{ minWidth: 180 }}
                            onChange={async (e) => {
                              if (!ledger) return;
                              const value = e.target.value as number | '';
                              const article_id = value === '' ? null : Number(value);
                              try {
                                const updated = await financeApi.updateTransaction(ledger.id, { article_id });
                                setLedgerByOperationId((prev) => ({
                                  ...prev,
                                  [tx.operation_id]: updated,
                                }));
                              } catch (err: any) {
                                setError(extractApiError(err, 'Не удалось сохранить статью'));
                              }
                            }}
                            renderValue={(v) => {
                              if (!ledger || !v) return <em>Не выбрано</em>;
                              const art = financeArticles.find((a) => a.id === v);
                              return art ? art.name : ledger.article_name || v;
                            }}
                          >
                            <MenuItem value="">
                              <em>Не выбрано</em>
                            </MenuItem>
                            {financeArticles.map((a) => (
                              <MenuItem key={a.id} value={a.id}>
                                {a.name}
                              </MenuItem>
                            ))}
                          </Select>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {isExpense ? (
                          <Select
                            size="small"
                            value={tx.expense_category ?? ''}
                            displayEmpty
                            sx={{ minWidth: 140 }}
                            onChange={async (e) => {
                              const value = e.target.value as string;
                              try {
                                await salesApi.updateBankTransactionExpenseCategory(tx.id, {
                                  expense_category: value || null,
                                });
                                await loadBankTransactions();
                              } catch (err: any) {
                                setError(extractApiError(err, 'Не удалось сохранить категорию'));
                              }
                            }}
                          >
                            <MenuItem value="">—</MenuItem>
                            <MenuItem value="комиссия">Комиссия</MenuItem>
                            <MenuItem value="типография">Типография</MenuItem>
                            <MenuItem value="аренда">Аренда</MenuItem>
                            <MenuItem value="канцтовары">Канцтовары</MenuItem>
                            <MenuItem value="прочее">Прочее</MenuItem>
                          </Select>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{isExpense ? '—' : tx.status}</TableCell>
                      <TableCell>
                        {tx.student_id ? (
                          <Typography
                            component="button"
                            variant="body2"
                            color="primary"
                            sx={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                            onClick={() => navigate(`/students?detail=${tx.student_id}`)}
                          >
                            Открыть ученика
                          </Typography>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {ledger && (
                            <Button
                              size="small"
                              color="error"
                              variant="outlined"
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    'Удалить запись из единого финансового журнала для этой операции? Это действие нельзя отменить.'
                                  )
                                ) {
                                  return;
                                }
                                try {
                                  await financeApi.deleteTransaction(ledger.id);
                                  setLedgerByOperationId((prev) => {
                                    const next = { ...prev };
                                    delete next[tx.operation_id];
                                    return next;
                                  });
                                } catch (err: any) {
                                  setError(extractApiError(err, 'Не удалось удалить запись журнала'));
                                }
                              }}
                            >
                              Удалить в журнале
                            </Button>
                          )}
                          {!isExpense && (
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => {
                                setSelectedTx(tx);
                                setSelectedStudent(null);
                                setStudentQuery('');
                                setApplyDialogOpen(true);
                              }}
                            >
                              Зачислить
                            </Button>
                          )}
                          {(
                            <Button
                              size="small"
                              color="error"
                              variant="outlined"
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    'Удалить банковскую операцию из очереди? Это действие нельзя отменить.'
                                  )
                                ) {
                                  return;
                                }
                                try {
                                  await salesApi.deleteBankTransaction(tx.id);
                                  setBankItems((prev) => prev.filter((b) => b.id !== tx.id));
                                  setLedgerByOperationId((prev) => {
                                    const next = { ...prev };
                                    delete next[tx.operation_id];
                                    return next;
                                  });
                                  setSelectedBankOperationIds((prev) => {
                                    const next = new Set(prev);
                                    next.delete(tx.operation_id);
                                    return next;
                                  });
                                } catch (err: any) {
                                  setError(extractApiError(err, 'Не удалось удалить банковскую операцию'));
                                }
                              }}
                            >
                              Удалить в банке
                            </Button>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {bankItems.length === 0 && (
              <CardContent>
                <Typography color="text.secondary">
                  Нет операций из банка для разбора. Как только авто-импорт или ручной импорт Точка Банк подтянут операции, они появятся здесь.
                </Typography>
              </CardContent>
            )}
          </Card>
        ) : (
          <Card variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Ученик</TableCell>
                  <TableCell>Дата следующей оплаты</TableCell>
                  <TableCell>Начало периода</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.student_id} hover>
                    <TableCell>{row.student_name}</TableCell>
                    <TableCell>{formatDate(row.next_payment_date)}</TableCell>
                    <TableCell>{formatDate(row.learning_period_start)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={STATUS_LABELS[row.status]?.label ?? row.status}
                        color={STATUS_LABELS[row.status]?.color ?? 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography
                        component="button"
                        variant="body2"
                        color="primary"
                        sx={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                        onClick={() => navigate(`/students?detail=${row.student_id}`)}
                      >
                        Карточка
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {items.length === 0 && (
              <CardContent>
                <Typography color="text.secondary">
                  {statusFilter === 'overdue'
                    ? 'Нет просроченных оплат.'
                    : statusFilter === 'due_soon'
                      ? 'Нет оплат в ближайшие 3 дня.'
                      : 'Нет данных о датах оплаты. Даты задаются при пополнении счёта.'}
                </Typography>
              </CardContent>
            )}
          </Card>
        )}
      </Box>

      <Dialog open={applyDialogOpen && !!selectedTx} onClose={() => setApplyDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Зачислить платёж</DialogTitle>
        <DialogContent>
          {selectedTx && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>Дата:</strong> {selectedTx.payment_date || '—'}
              </Typography>
              <Typography variant="body2">
                <strong>Сумма:</strong> {selectedTx.amount.toFixed(2)}
              </Typography>
              <Typography variant="body2">
                <strong>Плательщик:</strong> {selectedTx.payer_name || '—'}
              </Typography>
              <Typography variant="body2">
                <strong>Телефон:</strong> {selectedTx.payer_phone || '—'}
              </Typography>
            </Box>
          )}
          <TextField
            label="Поиск ученика по ФИО"
            fullWidth
            size="small"
            value={studentQuery}
            onChange={(e) => setStudentQuery(e.target.value)}
            helperText="Начните вводить ФИО ученика, чтобы найти и привязать платёж"
            sx={{ mb: 1 }}
          />
          {studentOptions.length > 0 && (
            <Box sx={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #eee', borderRadius: 1, p: 1 }}>
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApplyDialogOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            disabled={!selectedTx || !selectedStudent || applyLoading}
            onClick={async () => {
              if (!selectedTx || !selectedStudent) return;
              try {
                setApplyLoading(true);
                await salesApi.applyBankTransaction(selectedTx.id, { student_id: selectedStudent.id });
                setApplyDialogOpen(false);
                setSelectedTx(null);
                setSelectedStudent(null);
                setStudentQuery('');
                await loadBankTransactions();
              } catch (err: any) {
                setError(extractApiError(err, 'Не удалось зачислить платёж'));
              } finally {
                setApplyLoading(false);
              }
            }}
          >
            {applyLoading ? 'Сохранение...' : 'Зачислить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default SalesDebtsPage;
