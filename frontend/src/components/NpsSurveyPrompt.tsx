import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';

import { parentDashboardApi } from '../services/api';

const SCORES = Array.from({ length: 11 }, (_, i) => i);

const NpsSurveyPrompt: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    parentDashboardApi
      .getNpsPromptStatus()
      .then((status) => {
        if (!cancelled && status.should_prompt) {
          setOpen(true);
        }
      })
      .catch(() => {
        // тихо не показываем опрос, если статус не удалось получить
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    if (score === null) return;
    setSubmitting(true);
    setError('');
    try {
      await parentDashboardApi.submitNps({ score, comment: comment.trim() || undefined });
      setDone(true);
      setTimeout(() => setOpen(false), 1200);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось отправить оценку');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle>Оцените нас</DialogTitle>
      <DialogContent>
        {done ? (
          <Alert severity="success">Спасибо за оценку!</Alert>
        ) : (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2">
              С какой вероятностью вы порекомендуете нашу академию друзьям или знакомым? (0 — точно нет, 10 — точно да)
            </Typography>
            <ToggleButtonGroup
              value={score}
              exclusive
              onChange={(_, value) => setScore(value)}
              size="small"
              sx={{ flexWrap: 'wrap' }}
            >
              {SCORES.map((value) => (
                <ToggleButton key={value} value={value} sx={{ minWidth: 36 }}>
                  {value}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <TextField
              label="Комментарий (необязательно)"
              multiline
              minRows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        )}
      </DialogContent>
      {!done ? (
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Позже</Button>
          <Button variant="contained" disabled={score === null || submitting} onClick={handleSubmit}>
            Отправить
          </Button>
        </DialogActions>
      ) : null}
    </Dialog>
  );
};

export default NpsSurveyPrompt;
