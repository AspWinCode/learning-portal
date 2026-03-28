/**
 * Диалог переноса занятия на другую дату/время.
 */
import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stack, TextField, Alert, CircularProgress, Typography,
} from '@mui/material';
import { format, addDays, parseISO } from 'date-fns';
import type { LessonInstance } from '../../types';
import { lessonsApi } from '../../services/api';

interface Props {
  open: boolean;
  lesson: LessonInstance | null;
  onClose: () => void;
  onMoved: (newLesson: LessonInstance) => void;
}

export function LessonMoveDialog({ open, lesson, onClose, onMoved }: Props) {
  const [toDate, setToDate] = useState('');
  const [toStartTime, setToStartTime] = useState('');
  const [toEndTime, setToEndTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lesson && open) {
      // По умолчанию — следующий день, то же время
      const nextDay = format(addDays(parseISO(lesson.lesson_date), 1), 'yyyy-MM-dd');
      setToDate(nextDay);
      setToStartTime(lesson.start_time);
      setToEndTime(lesson.end_time ?? '');
      setError(null);
    }
  }, [lesson, open]);

  const handleMove = async () => {
    if (!lesson || !toDate) return;
    setSaving(true);
    setError(null);
    try {
      const newLesson = await lessonsApi.move(lesson.id, {
        to_date: toDate,
        to_start_time: toStartTime || undefined,
        to_end_time: toEndTime || undefined,
      });
      onMoved(newLesson);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка переноса занятия');
    } finally {
      setSaving(false);
    }
  };

  if (!lesson) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Перенести занятие</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {lesson.group_name ?? lesson.title} · {lesson.lesson_date} {lesson.start_time}
          </Typography>

          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Перенести на дату"
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
            size="small"
          />
          <Stack direction="row" spacing={1}>
            <TextField
              label="Время начала"
              type="time"
              value={toStartTime}
              onChange={e => setToStartTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              fullWidth
            />
            <TextField
              label="Время конца"
              type="time"
              value={toEndTime}
              onChange={e => setToEndTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              fullWidth
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Отмена</Button>
        <Button
          variant="contained"
          onClick={handleMove}
          disabled={saving || !toDate}
        >
          {saving ? <CircularProgress size={20} /> : 'Перенести'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
