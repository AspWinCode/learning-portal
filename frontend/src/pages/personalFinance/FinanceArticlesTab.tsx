import React, { useState } from 'react';
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
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import { usePersonalFinance } from '../../contexts/PersonalFinanceContext';
import { FinanceArticle, FinanceArticleType } from '../../types/personalFinance';

export const FinanceArticlesTab: React.FC = () => {
  const { articles, addArticle, updateArticle, deleteArticle } = usePersonalFinance();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<FinanceArticleType>('expense');

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

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editingId) {
      updateArticle(editingId, { name: trimmed, type });
    } else {
      addArticle({ name: trimmed, type });
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Удалить статью?')) deleteArticle(id);
  };

  const incomeArticles = articles.filter((a) => a.type === 'income');
  const expenseArticles = articles.filter((a) => a.type === 'expense');

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Настройки статей</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={handleOpenAdd}>
          Добавить статью
        </Button>
      </Box>

      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Название</TableCell>
              <TableCell>Тип</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {articles.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                  Нет статей. Добавьте статью дохода или расхода.
                </TableCell>
              </TableRow>
            )}
            {incomeArticles.map((a) => (
              <TableRow key={a.id}>
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
              <TableRow key={a.id}>
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
