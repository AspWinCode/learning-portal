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
} from '@mui/material';
import { UploadFile } from '@mui/icons-material';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { usePersonalFinance } from '../../contexts/PersonalFinanceContext';
import { FinanceOperation } from '../../types/personalFinance';
import { parseFinanceXlsx } from '../../utils/parseFinanceXlsx';

export const FinanceOperationsTab: React.FC = () => {
  const {
    operations,
    updateOperation,
    addOperations,
    incomeArticles,
    expenseArticles,
  } = usePersonalFinance();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

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

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 2 }}>
        <Typography variant="h6">Операции</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
              <TableCell>Дата</TableCell>
              <TableCell>Сумма</TableCell>
              <TableCell>Описание</TableCell>
              <TableCell>Куда</TableCell>
              <TableCell>Статья (доход/расход)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedOps.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
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
                onUpdate={(patch) => updateOperation(op.id, patch)}
              />
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
};

function OperationRow({
  operation,
  incomeArticles,
  expenseArticles,
  onUpdate,
}: {
  operation: FinanceOperation;
  incomeArticles: { id: string; name: string }[];
  expenseArticles: { id: string; name: string }[];
  onUpdate: (patch: Partial<FinanceOperation>) => void;
}) {
  const isIncome = operation.amount > 0;
  const articles = isIncome ? incomeArticles : expenseArticles;

  return (
    <TableRow>
      <TableCell>{format(new Date(operation.date + 'T12:00:00'), 'dd.MM.yyyy', { locale: ru })}</TableCell>
      <TableCell sx={{ color: isIncome ? 'success.main' : 'error.main', fontWeight: 600 }}>
        {isIncome ? '+' : ''}{operation.amount}
      </TableCell>
      <TableCell>{operation.description}</TableCell>
      <TableCell>
        <Select
          size="small"
          value={operation.target}
          onChange={(e) => onUpdate({ target: e.target.value as 'academy' | 'personal' })}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="academy">Счёт академии</MenuItem>
          <MenuItem value="personal">Личная</MenuItem>
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
