import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
} from '@mui/material';
import { Delete } from '@mui/icons-material';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { loadAcademyOperations, removeAcademyOperation } from '../utils/academyOperationsStorage';
import type { FinanceOperation } from '../types/personalFinance';

export const AcademyOperationsTab: React.FC = () => {
  const [operations, setOperations] = useState<FinanceOperation[]>([]);

  const refresh = useCallback(() => {
    setOperations(loadAcademyOperations());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRemove = (id: string) => {
    if (window.confirm('Удалить операцию из списка?')) {
      removeAcademyOperation(id);
      refresh();
    }
  };

  const sorted = [...operations].sort((a, b) => b.date.localeCompare(a.date));
  const totalIncome = operations.filter((o) => o.amount > 0).reduce((s, o) => s + o.amount, 0);
  const totalExpense = operations.filter((o) => o.amount < 0).reduce((s, o) => s + Math.abs(o.amount), 0);

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Операции по расходам и доходам
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Сюда переносятся операции со страницы «Личные финансы», когда в колонке «Куда» выбрано «Счёт академии». Операции удаляются из личных и отображаются здесь.
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2">
          Доходы: <Box component="span" sx={{ color: 'success.main', fontWeight: 600 }}>{totalIncome.toFixed(2)}</Box>
          {' · '}
          Расходы: <Box component="span" sx={{ color: 'error.main', fontWeight: 600 }}>{totalExpense.toFixed(2)}</Box>
          {' · '}
          Итого: <Box component="span" fontWeight={600}>{(totalIncome - totalExpense).toFixed(2)}</Box>
        </Typography>
      </Box>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Дата</TableCell>
            <TableCell>Сумма</TableCell>
            <TableCell>Контрагент</TableCell>
            <TableCell>Описание</TableCell>
            <TableCell width={80} align="right">Действия</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                Нет перенесённых операций. На странице «Личные финансы» выберите в колонке «Куда» значение «Счёт академии» — операция будет перенесена сюда.
              </TableCell>
            </TableRow>
          )}
          {sorted.map((op) => (
            <TableRow key={op.id}>
              <TableCell>{format(new Date(op.date + 'T12:00:00'), 'dd.MM.yyyy', { locale: ru })}</TableCell>
              <TableCell sx={{ color: op.amount > 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                {op.amount > 0 ? '+' : ''}{op.amount}
              </TableCell>
              <TableCell>{op.description}</TableCell>
              <TableCell>{op.typeDescription || '—'}</TableCell>
              <TableCell align="right">
                <IconButton size="small" color="error" onClick={() => handleRemove(op.id)} title="Удалить из списка">
                  <Delete fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
};
