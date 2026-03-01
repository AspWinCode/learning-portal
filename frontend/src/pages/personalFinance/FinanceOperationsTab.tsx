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
} from '@mui/material';
import { UploadFile, Delete, AccountBalanceWallet } from '@mui/icons-material';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { usePersonalFinance } from '../../contexts/PersonalFinanceContext';
import { FinanceOperation, OperationTarget, OPERATION_TARGET_LABELS } from '../../types/personalFinance';
import { parseFinanceXlsx } from '../../utils/parseFinanceXlsx';

export const FinanceOperationsTab: React.FC = () => {
  const {
    operations,
    updateOperation,
    addOperation,
    addOperations,
    addArticle,
    deleteOperations,
    incomeArticles,
    expenseArticles,
    getDisplayDescription,
  } = usePersonalFinance();
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

  const handleAddInitialBalance = () => {
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
    setInitialBalanceOpen(false);
    setInitialBalanceAmount('');
  };

  const openInitialBalanceDialog = () => {
    const d = new Date();
    setInitialBalanceDate(`${d.getFullYear()}-01-01`);
    setInitialBalanceAmount('');
    setInitialBalanceOpen(true);
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
            disabled={!someSelected}
          >
            Удалить выбранные {someSelected ? `(${selectedIds.size})` : ''}
          </Button>
          <Button
            variant="outlined"
            startIcon={<AccountBalanceWallet />}
            onClick={openInitialBalanceDialog}
          >
            Добавить начальный остаток
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
            onClick={() => fileInputRef.current?.click()}
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

      <Paper variant="outlined" sx={{ overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={someSelected && !allSelected}
                  checked={allSelected}
                  onChange={handleSelectAll}
                  disabled={sortedOps.length === 0}
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
                  Нет операций. Загрузите XLSX с колонками: дата, сумма, описание.
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
                selected={selectedIds.has(op.id)}
                onToggleSelect={() => handleToggleOne(op.id)}
                onUpdate={(patch) => updateOperation(op.id, patch)}
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
  onToggleSelect: () => void;
  onUpdate: (patch: Partial<FinanceOperation>) => void;
}) {
  const isIncome = operation.amount > 0;
  const articles = isIncome ? incomeArticles : expenseArticles;
  const displayDesc = getDisplayDescription(operation.description);
  const hasRecognition = displayDesc !== operation.description;

  return (
    <TableRow hover selected={selected}>
      <TableCell padding="checkbox">
        <Checkbox
          checked={selected}
          onChange={onToggleSelect}
          size="small"
          onClick={(e) => e.stopPropagation()}
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
          onChange={(e) => onUpdate({ target: e.target.value as OperationTarget })}
          sx={{ minWidth: 160 }}
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
            onChange={(e) => onUpdate({ articleId: e.target.value || null })}
            renderValue={(v) => {
              if (!v) return <em>Не выбрано</em>;
              const name = articles.find((a) => a.id === v)?.name ?? v;
              return name;
            }}
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
