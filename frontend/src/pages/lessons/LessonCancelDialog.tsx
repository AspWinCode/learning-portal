/**
 * Диалог подтверждения отмены занятия.
 */
import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Alert, CircularProgress, Typography, Stack,
} from '@mui/material';
import type { LessonInstance } from '../../types';
import { lessonsApi } from '../../services/api';

interface Props {
  open: boolean;
  lesson: LessonInstance | null;
  onClose: () => void;
  onCancelled: (updated: LessonInstance) => void;
}

export function LessonCancelDialog({ open, lesson, onClose, onCancelled }: Props) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const handleCancel = async () => {
    if (!lesson) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await lessonsApi.cancel(lesson.id, reason || undefined);
      onCancelled(updated);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка отмены занятия');
    } finally {
      setSaving(false);
    }
  };

  if (!lesson) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Отменить занятие</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {lesson.group_name ?? lesson.title} · {lesson.lesson_date} {lesson.start_time}
          </Typography>
          <Typography variant="body2">
            Занятие будет отмечено как отменённое. Удалено не будет.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Причина отмены (необязательно)"
            value={reason}
            onChange={e => setReason(e.target.value)}
            multiline
            rows={2}
            fullWidth
            size="small"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Назад</Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleCancel}
          disabled={saving}
        >
          {saving ? <CircularProgress size={20} /> : 'Да, отменить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
