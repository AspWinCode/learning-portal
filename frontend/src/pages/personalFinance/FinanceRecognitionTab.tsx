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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Paper,
} from '@mui/material';
import { Add, Edit, Delete } from '@mui/icons-material';
import { usePersonalFinance } from '../../contexts/PersonalFinanceContext';

export const FinanceRecognitionTab: React.FC = () => {
  const { recognitionRules, addRecognitionRule, updateRecognitionRule, deleteRecognitionRule } = usePersonalFinance();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pattern, setPattern] = useState('');
  const [displayName, setDisplayName] = useState('');

  const handleOpenAdd = () => {
    setEditingId(null);
    setPattern('');
    setDisplayName('');
    setDialogOpen(true);
  };

  const handleOpenEdit = (rule: { id: string; pattern: string; displayName: string }) => {
    setEditingId(rule.id);
    setPattern(rule.pattern);
    setDisplayName(rule.displayName);
    setDialogOpen(true);
  };

  const handleSave = () => {
    const p = pattern.trim();
    const d = displayName.trim();
    if (!p || !d) return;
    if (editingId) {
      updateRecognitionRule(editingId, { pattern: p, displayName: d });
    } else {
      addRecognitionRule({ pattern: p, displayName: d });
    }
    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Удалить правило опознавания?')) deleteRecognitionRule(id);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Опознавание</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={handleOpenAdd}>
          Добавить правило
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Если в операции описание совпадает с текстом в колонке «Искать» (или содержится в нём), в списке операций будет показано «Отображать как». Например: IP Shapiro N.A. Irkutsk RUS → Кофейня Блисс.
      </Typography>
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Искать (в описании операции)</TableCell>
              <TableCell>Отображать как</TableCell>
              <TableCell align="right" width={100}>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recognitionRules.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                  Нет правил. Добавьте правило, чтобы подменять длинные названия на короткие.
                </TableCell>
              </TableRow>
            )}
            {recognitionRules.map((r) => (
              <TableRow key={r.id}>
                <TableCell sx={{ wordBreak: 'break-word', maxWidth: 320 }}>{r.pattern}</TableCell>
                <TableCell>{r.displayName}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleOpenEdit(r)}>
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(r.id)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Редактировать правило' : 'Добавить правило опознавания'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Искать (точное совпадение или подстрока в описании)"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              fullWidth
              placeholder="IP Shapiro N.A. Irkutsk RUS"
              autoFocus
            />
            <TextField
              label="Отображать как"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              fullWidth
              placeholder="Кофейня Блисс"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleSave} disabled={!pattern.trim() || !displayName.trim()}>
            {editingId ? 'Сохранить' : 'Добавить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
