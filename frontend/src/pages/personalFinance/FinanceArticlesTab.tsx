import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Paper,
  Checkbox,
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import { usePersonalFinance } from '../../contexts/PersonalFinanceContext';
import { FinanceArticle, FinanceArticleType } from '../../types/personalFinance';
import { financeApi } from '../../services/api';

interface FinanceArticlesTabProps {
  /** Режим работы через единый справочник статей (scope=personal). */
  useLedgerSource?: boolean;
}

export const FinanceArticlesTab: React.FC<FinanceArticlesTabProps> = ({ useLedgerSource = false }) => {
  const { articles: ctxArticles, addArticle, updateArticle, deleteArticle, deleteArticles } = usePersonalFinance();
  const [remoteArticles, setRemoteArticles] = useState<Array<{ id: number; name: string; direction: 'income' | 'expense' }>>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<FinanceArticleType>('expense');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const articles: FinanceArticle[] = useLedgerSource
    ? remoteArticles.map((a, index) => ({
        id: String(a.id),
        name: a.name,
        type: a.direction,
        order: index,
      }))
    : ctxArticles;

  useEffect(() => {
    if (!useLedgerSource) return;
    setLoadingRemote(true);
    setRemoteError(null);
    financeApi
      .listArticles({ scope: 'personal' })
      .then((list) => {
        setRemoteArticles(
          list
            .filter((a) => a.is_active)
            .map((a) => ({
              id: a.id,
              name: a.name,
              direction: a.direction as 'income' | 'expense',
            }))
        );
      })
      .catch((err: any) => {
        setRemoteError(err?.response?.data?.detail || err?.message || 'Не удалось загрузить статьи из единого справочника');
      })
      .finally(() => setLoadingRemote(false));
  }, [useLedgerSource]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setName('');
    setType('expense');
    setDialogOpen(true);
  };

  const handleOpenEdit = (a: FinanceArticle) => {
    setEditingId(a.id);
    setName(a.name);
    setType(a.type);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (useLedgerSource) {
      try {
        if (editingId) {
          const numericId = Number(editingId);
          await financeApi.updateArticle(numericId, { name: trimmed, direction: type });
        } else {
          await financeApi.createArticle({ name: trimmed, direction: type, scope: 'personal', cost_kind: 'none' });
        }
        // перезагружаем список
        const list = await financeApi.listArticles({ scope: 'personal' });
        setRemoteArticles(
          list
            .filter((a) => a.is_active)
            .map((a) => ({
              id: a.id,
              name: a.name,
              direction: a.direction as 'income' | 'expense',
            }))
        );
      } catch (err) {
        // оставляем локальное состояние, покажем ошибку как alert выше при следующей загрузке
        // eslint-disable-next-line no-console
        console.error('Failed to save article in finance journal', err);
      }
    } else {
      if (editingId) {
        updateArticle(editingId, { name: trimmed, type });
      } else {
        addArticle({ name: trimmed, type });
      }
    }
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Удалить статью?')) return;
    if (useLedgerSource) {
      try {
        await financeApi.deleteArticle(Number(id));
        const list = await financeApi.listArticles({ scope: 'personal' });
        setRemoteArticles(
          list
            .filter((a) => a.is_active)
            .map((a) => ({
              id: a.id,
              name: a.name,
              direction: a.direction as 'income' | 'expense',
            }))
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to delete article in finance journal', err);
      }
    } else {
      deleteArticle(id);
    }
  };

  const allIds = articles.map((a) => a.id);
  const allSelected = articles.length > 0 && selectedIds.size === articles.length;
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

  const handleDeleteSelected = async () => {
    if (!someSelected) return;
    if (!window.confirm(`Удалить выбранные статьи (${selectedIds.size})?`)) return;
    const ids = Array.from(selectedIds);
    if (useLedgerSource) {
      try {
        await Promise.all(ids.map((id) => financeApi.deleteArticle(Number(id))));
        const list = await financeApi.listArticles({ scope: 'personal' });
        setRemoteArticles(
          list
            .filter((a) => a.is_active)
            .map((a) => ({
              id: a.id,
              name: a.name,
              direction: a.direction as 'income' | 'expense',
            }))
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to bulk delete articles in finance journal', err);
      }
    } else {
      deleteArticles(ids);
    }
    setSelectedIds(new Set());
  };

  const incomeArticles = articles.filter((a) => a.type === 'income');
  const expenseArticles = articles.filter((a) => a.type === 'expense');

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Typography variant="h6">
          Настройки статей
          {useLedgerSource && (
            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              (единый справочник personal)
            </Typography>
          )}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            color="error"
            startIcon={<Delete />}
            onClick={handleDeleteSelected}
            disabled={!someSelected}
          >
            Удалить выбранные {someSelected ? `(${selectedIds.size})` : ''}
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={handleOpenAdd}>
            Добавить статью
          </Button>
        </Box>
      </Box>

      {useLedgerSource && loadingRemote && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Загрузка статей из единого справочника…
        </Typography>
      )}
      {useLedgerSource && remoteError && (
        <Typography variant="body2" color="error" sx={{ mb: 1 }}>
          {remoteError}
        </Typography>
      )}

      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={someSelected && !allSelected}
                  checked={allSelected}
                  onChange={handleSelectAll}
                  disabled={articles.length === 0}
                  size="small"
                />
              </TableCell>
              <TableCell>Название</TableCell>
              <TableCell>Тип</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {articles.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                  Нет статей. Добавьте статью дохода или расхода.
                </TableCell>
              </TableRow>
            )}
            {incomeArticles.map((a) => (
              <TableRow key={a.id} hover selected={selectedIds.has(a.id)}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedIds.has(a.id)}
                    onChange={() => handleToggleOne(a.id)}
                    size="small"
                    onClick={(e) => e.stopPropagation()}
                  />
                </TableCell>
                <TableCell>{a.name}</TableCell>
                <TableCell>Доход</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleOpenEdit(a)}>
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(a.id)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {expenseArticles.map((a) => (
              <TableRow key={a.id} hover selected={selectedIds.has(a.id)}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedIds.has(a.id)}
                    onChange={() => handleToggleOne(a.id)}
                    size="small"
                    onClick={(e) => e.stopPropagation()}
                  />
                </TableCell>
                <TableCell>{a.name}</TableCell>
                <TableCell>Расход</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleOpenEdit(a)}>
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(a.id)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Редактировать статью' : 'Добавить статью'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Название"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              autoFocus
            />
            <FormControl fullWidth>
              <InputLabel>Тип</InputLabel>
              <Select
                value={type}
                label="Тип"
                onChange={(e) => setType(e.target.value as FinanceArticleType)}
              >
                <MenuItem value="income">Доход</MenuItem>
                <MenuItem value="expense">Расход</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleSave} disabled={!name.trim()}>
            {editingId ? 'Сохранить' : 'Добавить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
