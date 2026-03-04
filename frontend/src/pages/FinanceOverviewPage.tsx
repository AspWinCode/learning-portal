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
  Tabs,
  Tab,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import Layout from '../components/Layout';
import { financeApi, studentsApi } from '../services/api';
import type { FinanceAccountBalance, FinancePnlRow, FinanceLedgerBankRow, Student } from '../types';

const FinanceOverviewPageContent: React.FC = () => {
  const [tab, setTab] = useState<'overview' | 'all' | 'unclassified'>('overview');
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
  }, [tab, journalFrom, journalTo, journalTargetFilter, journalDirectionFilter, targets.length, articles.length]);

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
        </Tabs>
      </Box>

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

      <Dialog
        open={applyDialogOpen && !!selectedJournalTx}
        onClose={() => {
          setApplyDialogOpen(false);
          setSelectedJournalTx(null);
          setStudentSearch('');
          setStudentOptions([]);
          setSelectedStudent(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Зачислить платёж ученику</DialogTitle>
        <DialogContent>
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
        </DialogContent>
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
      </Dialog>
    </Box>
  );
};

const FinanceOverviewPage: React.FC = () => (
  <Layout>
    <FinanceOverviewPageContent />
  </Layout>
);

export default FinanceOverviewPage;

