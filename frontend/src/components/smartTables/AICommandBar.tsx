import React, { useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Paper, TextField, Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { smartTablesApi } from '../../services/api/smartTables';
import type { AiPendingAction, SheetDetail, SpreadsheetOperation } from '../../types/smartTables';

// AI-слой (Phase 5): свободный текст -> backend резолвит в SpreadsheetOperation.
// "Безопасные" действия (добавить колонку, подсветить, отсортировать) уже
// применены сервером к моменту ответа — applied[] просто показывает, что
// произошло. Деструктивное действие (удаление строк) приходит в pending и
// НЕ применено — подтверждение шлёт эти же ops через обычный applyOperations,
// у AI нет отдельного write-пути (см. docs/smart-tables-architecture.md, раздел L).

interface AICommandBarProps {
  sheetId: number;
  onSheetUpdated: (sheet: SheetDetail) => void;
}

const AICommandBar: React.FC<AICommandBarProps> = ({ sheetId, onSheetUpdated }) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [appliedLog, setAppliedLog] = useState<string[]>([]);
  const [pending, setPending] = useState<AiPendingAction | null>(null);
  const [applyingPending, setApplyingPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError('');
    setAnswer(null);
    setAppliedLog([]);
    setPending(null);
    try {
      const result = await smartTablesApi.aiCommand(sheetId, trimmed);
      onSheetUpdated(result.sheet);
      if (result.mode === 'answer') {
        setAnswer(result.answer || '');
      } else {
        setAppliedLog(result.applied.map((a) => a.description));
        if (result.pending) setPending(result.pending);
      }
      setPrompt('');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'AI не смогла выполнить команду');
    } finally {
      setLoading(false);
    }
  };

  const confirmPending = async () => {
    if (!pending) return;
    setApplyingPending(true);
    try {
      const result = await smartTablesApi.applyOperations(sheetId, pending.ops as SpreadsheetOperation[]);
      onSheetUpdated(result.sheet);
      setAppliedLog((log) => [...log, `Применено: ${pending.description}`]);
      setPending(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Не удалось применить действие');
    } finally {
      setApplyingPending(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <AutoAwesomeIcon color="primary" fontSize="small" />
        <TextField
          size="small" fullWidth placeholder="Спросите AI или дайте команду: «добавь колонку Маржа и посчитай её»…"
          value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={loading}
        />
        <Button type="submit" variant="contained" disabled={loading || !prompt.trim()}>
          {loading ? <CircularProgress size={20} /> : 'Спросить'}
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      {answer && <Alert severity="info" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>{answer}</Alert>}
      {appliedLog.length > 0 && (
        <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {appliedLog.map((desc, i) => <Chip key={i} size="small" color="success" label={desc} />)}
        </Box>
      )}

      <Dialog open={!!pending} onClose={() => setPending(null)} maxWidth="xs" fullWidth>
        <DialogTitle>AI предлагает</DialogTitle>
        <DialogContent>
          <Typography>{pending?.description}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)} disabled={applyingPending}>Отмена</Button>
          <Button variant="contained" color="error" onClick={confirmPending} disabled={applyingPending}>
            {applyingPending ? <CircularProgress size={20} /> : 'Применить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default AICommandBar;
