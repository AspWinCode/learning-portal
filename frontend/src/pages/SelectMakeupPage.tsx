import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Container, Stack, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { salesApi } from '../services/api';
import { PublicMakeupSlotsResponse } from '../types';
import { extractApiError } from '../utils/extractApiError';

const SelectMakeupPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [data, setData] = useState<PublicMakeupSlotsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!token) {
      setError('Ссылка на выбор отработки некорректна.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    salesApi.getPublicMakeupSelection(token)
      .then((response) => {
        if (!active) return;
        setData(response);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(extractApiError(err, 'Не удалось загрузить доступные отработки.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const handleSelect = async (groupId: number, lessonDate: string) => {
    const key = `${groupId}:${lessonDate}`;
    setSubmittingKey(key);
    setError(null);
    try {
      await salesApi.confirmPublicMakeupSelection({
        token,
        makeup_group_id: groupId,
        makeup_lesson_date: lessonDate,
      });
      setSuccess('Слот подтвержден. Менеджер увидит подтверждение, а отработка будет закреплена за учеником.');
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось подтвердить слот.'));
    } finally {
      setSubmittingKey(null);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        py: 6,
        background: 'linear-gradient(180deg, #f5f7fb 0%, #eef3ff 100%)',
      }}
    >
      <Container maxWidth="md">
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4" fontWeight={700}>Выбор отработки</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
              Подтвердите удобный слот для пропущенного занятия.
            </Typography>
          </Box>

          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          )}

          {error && <Alert severity="error">{error}</Alert>}
          {success && <Alert severity="success">{success}</Alert>}

          {!loading && data && !success && (
            <>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6">{data.student_name || 'Ученик'}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Пропущенное занятие: {data.missed_lesson_date}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Исходная группа: {data.original_group_name || '—'}
                  </Typography>
                </CardContent>
              </Card>

              {data.available_slots.length === 0 ? (
                <Alert severity="info">Пока нет доступных слотов для отработки. Попробуйте открыть ссылку позже.</Alert>
              ) : (
                <Stack spacing={2}>
                  {data.available_slots.map((slot) => {
                    const key = `${slot.group_id}:${slot.lesson_date}`;
                    return (
                      <Card key={key} variant="outlined">
                        <CardContent sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Box>
                            <Typography variant="subtitle1" fontWeight={600}>{slot.group_name}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {slot.lesson_date}{slot.start_time ? ` · ${slot.start_time}` : ''}{slot.program_name ? ` · ${slot.program_name}` : ''}
                            </Typography>
                          </Box>
                          <Button
                            variant="contained"
                            disabled={submittingKey === key}
                            onClick={() => handleSelect(slot.group_id, slot.lesson_date)}
                          >
                            {submittingKey === key ? 'Подтверждение…' : 'Выбрать слот'}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </Stack>
              )}
            </>
          )}
        </Stack>
      </Container>
    </Box>
  );
};

export default SelectMakeupPage;
