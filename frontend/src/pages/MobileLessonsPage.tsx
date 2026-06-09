import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Alert,
  AppBar,
  Box,
  Chip,
  CircularProgress,
  Container,
  Divider,
  IconButton,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { ArrowBack, CalendarToday, Refresh } from '@mui/icons-material';
import { trainerLessonsApi } from '../services/api';

const MobileLessonsPage: React.FC = () => {
  const navigate = useNavigate();
  const today = useMemo(() => format(startOfDay(new Date()), 'yyyy-MM-dd'), []);

  const dates = useMemo(
    () => Array.from({ length: 8 }, (_, i) => format(addDays(startOfDay(new Date()), i), 'yyyy-MM-dd')),
    []
  );

  const [refetchKey, setRefetchKey] = useState(0);

  const lessonsQuery = useQuery({
    queryKey: ['mobile-lessons', today, refetchKey],
    queryFn: async () => {
      const rows = await Promise.all(dates.map((d) => trainerLessonsApi.getForDate(d)));
      return dates.map((d, i) => ({ date: d, slots: rows[i] })).filter((g) => g.slots.length > 0);
    },
  });

  const groups = lessonsQuery.data ?? [];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f6f8fb', pb: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => navigate('/mobile')} aria-label="Назад">
            <ArrowBack />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0, ml: 1 }}>
            <Typography variant="subtitle1" fontWeight={900} noWrap>Уроки</Typography>
            <Typography variant="caption" color="text.secondary">Расписание на 7 дней</Typography>
          </Box>
          <IconButton onClick={() => setRefetchKey((k) => k + 1)} aria-label="Обновить">
            <Refresh />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="sm" sx={{ pt: 2, px: { xs: 1.5, sm: 3 } }}>
        {lessonsQuery.isLoading ? (
          <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
        ) : lessonsQuery.isError ? (
          <Alert severity="error">Не удалось загрузить расписание</Alert>
        ) : groups.length === 0 ? (
          <Alert severity="info">На ближайшие 8 дней занятий нет</Alert>
        ) : (
          <Stack spacing={2}>
            {groups.map(({ date, slots }) => (
              <Box key={date}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, px: 0.5 }}>
                  <CalendarToday fontSize="small" sx={{ color: 'text.secondary' }} />
                  <Typography variant="subtitle2" color="text.secondary">
                    {date === today
                      ? 'СЕГОДНЯ'
                      : format(new Date(`${date}T00:00:00`), 'd MMMM, EEEE', { locale: ru }).toUpperCase()}
                  </Typography>
                  <Chip label={slots.length} size="small" />
                </Stack>
                <Stack spacing={1}>
                  {slots.map((slot) => {
                    const marked = slot.students.filter((s) => s.attended !== null && s.attended !== undefined).length;
                    return (
                      <Paper
                        key={`${slot.lesson_date}-${slot.group_id}-${slot.start_time}`}
                        variant="outlined"
                        sx={{ p: 1.5, borderRadius: 2 }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={700} noWrap>{slot.group_name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                              {slot.program_name ? ` • ${slot.program_name}` : ''}
                            </Typography>
                          </Box>
                          <Stack spacing={0.5} alignItems="flex-end" sx={{ flexShrink: 0 }}>
                            <Chip size="small" label={`${slot.students.length} уч.`} />
                            {date === today && slot.students.length > 0 && (
                              <Typography variant="caption" color={marked === slot.students.length ? 'success.main' : 'warning.main'}>
                                {marked}/{slot.students.length}
                              </Typography>
                            )}
                          </Stack>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Container>
    </Box>
  );
};

export default MobileLessonsPage;
