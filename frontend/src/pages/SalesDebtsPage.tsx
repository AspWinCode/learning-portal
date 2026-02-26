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
} from '@mui/material';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import Layout from '../components/Layout';
import { studentsApi } from '../services/api';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { BankTransaction, Student } from '../types';

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
  const [items, setItems] = useState<PaymentStatusRow[]>([]);
  const [bankItems, setBankItems] = useState<BankTransaction[]>([]);
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
  const [importFileResult, setImportFileResult] = useState<{ imported: number; skipped: number } | null>(null);

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
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить операции банка'));
      setBankItems([]);
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

  useEffect(() => {
    if (tab === 3) {
      void loadBankTransactions();
    } else {
      void loadDebts();
    }
  }, [tab, loadDebts, loadBankTransactions]);

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
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab label="Все" />
          <Tab label="Просрочено" />
          <Tab label="Скоро (3 дня)" />
          <Tab label="Операции банка" />
        </Tabs>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : tab === 3 ? (
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
                То же делает авто-импорт каждые 10 мин. Если здесь пусто — нажмите кнопку или проверьте настройки Точка Банк на сервере.
              </Typography>
            </Box>
            <Box sx={{ p: 2, pt: 1, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                component="label"
                disabled={importFileRunning}
              >
                {importFileRunning ? 'Импорт выписки из файла…' : 'Импортировать выписку из XLSX'}
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
                      setImportFileResult({ imported: res.imported ?? 0, skipped: res.skipped ?? 0 });
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
              </Box>
            )}
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Дата</TableCell>
                  <TableCell>Тип</TableCell>
                  <TableCell>Сумма</TableCell>
                  <TableCell>ФИО плательщика / Контрагент</TableCell>
                  <TableCell>Телефон</TableCell>
                  <TableCell>Категория расхода</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell>Ученик</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {bankItems.map((tx) => {
                  const isExpense = tx.status === 'expense' || tx.amount < 0;
                  const expenseCategorized = isExpense && !!(tx.expense_category ?? '').trim();
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
                      <TableCell>{tx.payment_date || '—'}</TableCell>
                      <TableCell>{isExpense ? 'Расход' : 'Приход'}</TableCell>
                      <TableCell sx={{ color: isExpense ? 'error.main' : undefined }}>
                        {isExpense ? '−' : '+'} {Math.abs(tx.amount).toFixed(2)} ₽
                      </TableCell>
                      <TableCell>{tx.payer_name || '—'}</TableCell>
                      <TableCell>{tx.payer_phone || '—'}</TableCell>
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
                        {!isExpense && tx.status !== 'applied' && (
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
