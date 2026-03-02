import React, { useRef, useState } from 'react';
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  Paper,
  Alert,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
import { UploadFile, Delete, AccountBalanceWallet, Add } from '@mui/icons-material';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { usePersonalFinance } from '../../contexts/PersonalFinanceContext';
import { FinanceOperation, FinanceArticle, OperationTarget, OPERATION_TARGET_LABELS } from '../../types/personalFinance';
import { financeApi } from '../../services/api';
import { parseFinanceXlsx } from '../../utils/parseFinanceXlsx';

interface FinanceOperationsTabProps {
  /** Режим чтения из единого журнала: операции и статьи приходят из finance_transactions/finance_articles */
  useLedgerSource?: boolean;
  ledgerLoading?: boolean;
  ledgerOperations?: FinanceOperation[];
  ledgerIncomeArticles?: FinanceArticle[];
  ledgerExpenseArticles?: FinanceArticle[];
}

export const FinanceOperationsTab: React.FC<FinanceOperationsTabProps> = ({
  useLedgerSource = false,
  ledgerLoading = false,
  ledgerOperations = [],
  ledgerIncomeArticles = [],
  ledgerExpenseArticles = [],
}) => {
  const {
    operations: ctxOperations,
    updateOperation,
    addOperation,
    addOperations,
    addArticle,
    deleteOperations,
    incomeArticles: ctxIncomeArticles,
    expenseArticles: ctxExpenseArticles,
    getDisplayDescription,
  } = usePersonalFinance();
  const operations = useLedgerSource ? ledgerOperations : ctxOperations;
  const incomeArticles = useLedgerSource && ledgerIncomeArticles.length > 0 ? ledgerIncomeArticles : ctxIncomeArticles;
  const expenseArticles =
    useLedgerSource && ledgerExpenseArticles.length > 0 ? ledgerExpenseArticles : ctxExpenseArticles;
  const readOnly = useLedgerSource;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [initialBalanceOpen, setInitialBalanceOpen] = useState(false);
  const [initialBalanceDate, setInitialBalanceDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [initialBalanceAmount, setInitialBalanceAmount] = useState<string>('');

  const [manualOpOpen, setManualOpOpen] = useState(false);
  const [manualOpType, setManualOpType] = useState<'income' | 'expense'>('income');
  const [manualOpDate, setManualOpDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [manualOpAmount, setManualOpAmount] = useState<string>('');
  const [manualOpDescription, setManualOpDescription] = useState<string>('');
  const [manualOpTarget, setManualOpTarget] = useState<OperationTarget>('personal');
  const [manualOpArticleId, setManualOpArticleId] = useState<string>('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setImportError(null);
    setImportSuccess(null);
    if (!file) return;
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setImportError('Выберите файл Excel (.xlsx или .xls)');
      return;
    }
    try {
      const { operations: parsed, errors } = await parseFinanceXlsx(file);
      if (parsed.length > 0) {
        addOperations(parsed);
        setImportSuccess(`Импортировано операций: ${parsed.length}. ${errors.length ? 'Предупреждения: ' + errors.slice(0, 3).join('; ') : ''}`);
      } else {
        setImportError(errors[0] || 'Не удалось распознать операции в файле');
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Ошибка импорта');
    }
  };

  const sortedOps = [...operations].sort((a, b) => b.date.localeCompare(a.date));
  const allIds = sortedOps.map((o) => o.id);
  const allSelected = sortedOps.length > 0 && selectedIds.size === sortedOps.length;
  const someSelected = selectedIds.size > 0;

  const handleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allIds));
  };

  const handleToggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (!someSelected) return;
    if (window.confirm(`Удалить выбранные операции (${selectedIds.size})?`)) {
      deleteOperations(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  const handleAddInitialBalance = async () => {
    const amount = Number(initialBalanceAmount.replace(/\s/g, '').replace(',', '.'));
    if (!initialBalanceDate || !Number.isFinite(amount) || amount <= 0) return;
    let articleId = incomeArticles.find((a) => a.name === 'Начальный остаток')?.id ?? null;
    if (!articleId) {
      articleId = addArticle({ name: 'Начальный остаток', type: 'income' });
    }
    addOperation({
      date: initialBalanceDate,
      amount: Math.abs(amount),
      description: 'Начальный остаток',
      target: 'personal',
      articleId,
    });
    // Записываем в единый журнал как ручную личную операцию (без привязки к статье)
    try {
      await financeApi.createPersonalOperation({
        date: initialBalanceDate,
        amount: Math.abs(amount),
        description: 'Начальный остаток',
        target_code: 'personal',
      });
    } catch {
      // В случае ошибки журнал не обновится, но локальные данные останутся
    }
    setInitialBalanceOpen(false);
    setInitialBalanceAmount('');
  };

  const openInitialBalanceDialog = () => {
    const d = new Date();
    setInitialBalanceDate(`${d.getFullYear()}-01-01`);
    setInitialBalanceAmount('');
    setInitialBalanceOpen(true);
  };

  const parsedManualAmount = (() => {
    const n = Number(manualOpAmount.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? Math.abs(n) : 0;
  })();
  const manualOpIsIncome = manualOpType === 'income';
  const manualOpArticles = manualOpIsIncome ? incomeArticles : expenseArticles;

  const openManualOpDialog = () => {
    const d = new Date();
    setManualOpType('income');
    setManualOpDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    setManualOpAmount('');
    setManualOpDescription('');
    setManualOpTarget('personal');
    setManualOpArticleId('');
    setManualOpOpen(true);
  };

  const handleAddManualOperation = async () => {
    if (!manualOpDate || parsedManualAmount === 0) return;
    const amount = manualOpType === 'income' ? parsedManualAmount : -parsedManualAmount;
    addOperation({
      date: manualOpDate,
      amount,
      description: manualOpDescription.trim() || 'Вручную',
      target: manualOpTarget,
      articleId: manualOpArticleId || null,
    });
    try {
      await financeApi.createPersonalOperation({
        date: manualOpDate,
        amount,
        description: manualOpDescription.trim() || 'Вручную',
        target_code: manualOpTarget,
      });
    } catch {
      // Не блокируем локальное добавление при ошибке сохранения в журнал
    }
    setManualOpOpen(false);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 2 }}>
        <Typography variant="h6">Операции</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            variant="outlined"
            color="error"
            startIcon={<Delete />}
            onClick={handleDeleteSelected}
            disabled={!someSelected || readOnly}
          >
            Удалить выбранные {someSelected ? `(${selectedIds.size})` : ''}
          </Button>
          <Button
            variant="outlined"
            startIcon={<AccountBalanceWallet />}
            onClick={readOnly ? undefined : openInitialBalanceDialog}
            disabled={readOnly}
          >
            Начальный остаток
          </Button>
          <Button
            variant="outlined"
            startIcon={<Add />}
            onClick={readOnly ? undefined : openManualOpDialog}
            disabled={readOnly}
          >
            Добавить операцию
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <Button
            variant="outlined"
            startIcon={<UploadFile />}
            onClick={readOnly ? undefined : () => fileInputRef.current?.click()}
            disabled={readOnly}
          >
            Импорт из XLSX
          </Button>
        </Box>
      </Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        Поддерживаются форматы: 1) Таблица — первая строка: заголовки (Дата, Сумма, Описание), далее по одной операции в строке.
        2) Вертикальный A/B — подписи в колонке A, значения в B. 3) Выписка — одна колонка: заголовки дат («Сегодня», «Вчера», «27 феврал»), под каждым блоки «сумма ₽», контрагент (AZS KRAISI, Наталья Ю), тип (Оплата то, Входящий).
      </Typography>

      {importError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setImportError(null)}>
          {importError}
        </Alert>
      )}
      {importSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setImportSuccess(null)}>
          {importSuccess}
        </Alert>
      )}

      {readOnly && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Режим просмотра из единого финансового журнала. Операции здесь только для чтения, добавление и удаление недоступны.
        </Alert>
      )}

      {useLedgerSource && ledgerLoading && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Загрузка операций из журнала…
        </Typography>
      )}

      <Paper variant="outlined" sx={{ overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={someSelected && !allSelected}
                  checked={allSelected}
                  onChange={readOnly ? undefined : handleSelectAll}
                  disabled={sortedOps.length === 0 || readOnly}
                  size="small"
                />
              </TableCell>
              <TableCell>Дата</TableCell>
              <TableCell>Сумма</TableCell>
              <TableCell>Контрагент</TableCell>
              <TableCell>Описание</TableCell>
              <TableCell>Куда</TableCell>
              <TableCell>Статья (доход/расход)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedOps.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  {useLedgerSource
                    ? 'Нет операций в едином финансовом журнале для выбранных целей.'
                    : 'Нет операций. Загрузите XLSX с колонками: дата, сумма, описание.'}
                </TableCell>
              </TableRow>
            )}
            {sortedOps.map((op) => (
              <OperationRow
                key={op.id}
                operation={op}
                incomeArticles={incomeArticles}
                expenseArticles={expenseArticles}
                getDisplayDescription={getDisplayDescription}
                selected={selectedIds.has(op.id) && !readOnly}
                onToggleSelect={readOnly ? undefined : () => handleToggleOne(op.id)}
                onUpdate={readOnly ? undefined : (patch) => updateOperation(op.id, patch)}
                readOnly={readOnly}
              />
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={initialBalanceOpen} onClose={() => setInitialBalanceOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Добавить начальный остаток</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Свободные деньги, оставшиеся с прошлого периода (например, с декабря). Будет добавлена одна операция «доход» с датой и суммой.
          </Typography>
          <TextField
            label="Дата"
            type="date"
            value={initialBalanceDate}
            onChange={(e) => setInitialBalanceDate(e.target.value)}
            fullWidth
            size="small"
            sx={{ mb: 2 }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Сумма (руб)"
            value={initialBalanceAmount}
            onChange={(e) => setInitialBalanceAmount(e.target.value)}
            fullWidth
            size="small"
            placeholder="Например, 50000"
            inputProps={{ inputMode: 'decimal' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInitialBalanceOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={handleAddInitialBalance}
            disabled={!initialBalanceDate || !initialBalanceAmount.trim() || !(Number(initialBalanceAmount.replace(/\s/g, '').replace(',', '.')) > 0)}
          >
            Добавить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={manualOpOpen} onClose={() => setManualOpOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Добавить операцию</DialogTitle>
        <DialogContent sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Подойдёт для наличных и прочих операций без выписки.
          </Typography>
          <FormControl component="fieldset" size="small">
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>Тип операции</Typography>
            <RadioGroup
              row
              value={manualOpType}
              onChange={(e) => {
                setManualOpType(e.target.value as 'income' | 'expense');
                setManualOpArticleId('');
              }}
            >
              <FormControlLabel value="income" control={<Radio size="small" />} label="Доход" />
              <FormControlLabel value="expense" control={<Radio size="small" />} label="Расход" />
            </RadioGroup>
          </FormControl>
          <TextField
            label="Дата"
            type="date"
            value={manualOpDate}
            onChange={(e) => setManualOpDate(e.target.value)}
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Сумма (руб)"
            value={manualOpAmount}
            onChange={(e) => setManualOpAmount(e.target.value)}
            fullWidth
            size="small"
            placeholder={manualOpType === 'income' ? 'Например, 5000' : 'Например, 300'}
            inputProps={{ inputMode: 'decimal' }}
          />
          <TextField
            label="Описание (контрагент)"
            value={manualOpDescription}
            onChange={(e) => setManualOpDescription(e.target.value)}
            fullWidth
            size="small"
            placeholder="Наличные, подарок и т.д."
          />
          <FormControl size="small" fullWidth>
            <InputLabel>Куда</InputLabel>
            <Select
              value={manualOpTarget}
              label="Куда"
              onChange={(e) => setManualOpTarget(e.target.value as OperationTarget)}
            >
              {(Object.keys(OPERATION_TARGET_LABELS) as OperationTarget[]).map((t) => (
                <MenuItem key={t} value={t}>
                  {OPERATION_TARGET_LABELS[t]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Статья ({manualOpIsIncome ? 'доход' : 'расход'})</InputLabel>
            <Select
              value={manualOpArticleId}
              label={`Статья (${manualOpIsIncome ? 'доход' : 'расход'})`}
              onChange={(e) => setManualOpArticleId(e.target.value)}
              displayEmpty
              renderValue={(v) => manualOpArticles.find((a) => a.id === v)?.name ?? (v ? v : 'Не выбрано')}
            >
              <MenuItem value="">
                <em>Не выбрано</em>
              </MenuItem>
              {manualOpArticles.map((a) => (
                <MenuItem key={a.id} value={a.id}>
                  {a.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManualOpOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={handleAddManualOperation}
            disabled={!manualOpDate || parsedManualAmount === 0}
          >
            Добавить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

function OperationRow({
  operation,
  incomeArticles,
  expenseArticles,
  getDisplayDescription,
  selected,
  onToggleSelect,
  onUpdate,
}: {
  operation: FinanceOperation;
  incomeArticles: { id: string; name: string }[];
  expenseArticles: { id: string; name: string }[];
  getDisplayDescription: (description: string) => string;
  selected: boolean;
  onToggleSelect?: () => void;
  onUpdate?: (patch: Partial<FinanceOperation>) => void;
  readOnly?: boolean;
}) {
  const readOnly = !onUpdate;
  const isIncome = operation.amount > 0;
  const articles = isIncome ? incomeArticles : expenseArticles;
  const displayDesc = getDisplayDescription(operation.description);
  const hasRecognition = displayDesc !== operation.description;

  return (
    <TableRow hover selected={selected}>
      <TableCell padding="checkbox">
        <Checkbox
          checked={selected}
          onChange={readOnly ? undefined : onToggleSelect}
          size="small"
          onClick={(e) => e.stopPropagation()}
          disabled={readOnly}
        />
      </TableCell>
      <TableCell>{format(new Date(operation.date + 'T12:00:00'), 'dd.MM.yyyy', { locale: ru })}</TableCell>
      <TableCell sx={{ color: isIncome ? 'success.main' : 'error.main', fontWeight: 600 }}>
        {isIncome ? '+' : ''}{operation.amount}
      </TableCell>
      <TableCell title={hasRecognition ? operation.description : undefined}>
        {displayDesc}
      </TableCell>
      <TableCell sx={{ maxWidth: 200 }} title={operation.typeDescription || operation.description}>
        {operation.typeDescription || (hasRecognition ? operation.description : '—')}
      </TableCell>
      <TableCell>
        <Select
          size="small"
          value={operation.target in OPERATION_TARGET_LABELS ? operation.target : 'personal'}
          onChange={readOnly ? undefined : (e) => onUpdate?.({ target: e.target.value as OperationTarget })}
          sx={{ minWidth: 160 }}
          disabled={readOnly}
        >
          {(Object.keys(OPERATION_TARGET_LABELS) as OperationTarget[]).map((t) => (
            <MenuItem key={t} value={t}>
              {OPERATION_TARGET_LABELS[t]}
            </MenuItem>
          ))}
        </Select>
      </TableCell>
      <TableCell>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <Select
            value={operation.articleId ?? ''}
            displayEmpty
            onChange={readOnly ? undefined : (e) => onUpdate?.({ articleId: e.target.value || null })}
            renderValue={(v) => {
              if (!v) return <em>Не выбрано</em>;
              const name = articles.find((a) => a.id === v)?.name ?? v;
              return name;
            }}
            disabled={readOnly}
          >
            <MenuItem value="">
              <em>Не выбрано</em>
            </MenuItem>
            {articles.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </TableCell>
    </TableRow>
  );
}
