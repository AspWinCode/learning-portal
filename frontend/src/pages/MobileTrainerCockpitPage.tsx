import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { ArrowBack, CheckCircle, Refresh, School } from '@mui/icons-material';
import { trainerCockpitApi, trainerLessonsApi } from '../services/api';
import type { TrainerLessonSlot } from '../types';
import { extractApiError } from '../utils/extractApiError';

type AttendanceDraft = Record<number, boolean>;

const MobileTrainerCockpitPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = useMemo(() => format(startOfDay(new Date()), 'yyyy-MM-dd'), []);
  const upcomingDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => format(addDays(startOfDay(new Date()), i + 1), 'yyyy-MM-dd')),
    []
  );

  const [attendanceSlot, setAttendanceSlot] = useState<TrainerLessonSlot | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<AttendanceDraft>({});
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageInfo, setPageInfo] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: ['trainer-cockpit', 'summary', today],
    queryFn: () => trainerCockpitApi.getSummary(today),
  });

  const todayLessonsQuery = useQuery({
    queryKey: ['trainer-cockpit', 'today-lessons', today],
    queryFn: () => trainerLessonsApi.getForDate(today),
  });

  const upcomingLessonsQuery = useQuery({
    queryKey: ['trainer-cockpit', 'upcoming-lessons', today],
    queryFn: async () => {
      const rows = await Promise.all(upcomingDates.map((d) => trainerLessonsApi.getForDate(d)));
      return rows.flat();
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: async () => {
      if (!attendanceSlot) return;
      await trainerLessonsApi.saveAttendance({
        group_id: attendanceSlot.group_id,
        lesson_date: attendanceSlot.lesson_date,
        start_time: attendanceSlot.start_time,
        end_time: attendanceSlot.end_time,
        attendances: attendanceSlot.students.map((s) => ({
          student_id: s.id,
          attended: Boolean(attendanceDraft[s.id]),
        })),
      });
    },
    onSuccess: async () => {
      setPageInfo('Посещаемость сохранена');
      setAttendanceSlot(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['trainer-cockpit', 'today-lessons'] }),
        queryClient.invalidateQueries({ queryKey: ['trainer-cockpit', 'summary'] }),
      ]);
    },
    onError: (err: unknown) => setPageError(extractApiError(err, 'Не удалось сохранить')),
  });

  const openAttendance = (slot: TrainerLessonSlot) => {
    const draft: AttendanceDraft = {};
    slot.students.forEach((s) => { draft[s.id] = s.attended ?? true; });
    setAttendanceDraft(draft);
    setAttendanceSlot(slot);
  };

  const todayLessons = todayLessonsQuery.data ?? [];
  const upcomingLessons = upcomingLessonsQuery.data ?? [];
  const summary = summaryQuery.data;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['trainer-cockpit'] });
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f6f8fb', pb: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => navigate('/mobile')} aria-label="Назад">
            <ArrowBack />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0, ml: 1 }}>
            <Typography variant="subtitle1" fontWeight={900} noWrap>Кокпит тренера</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {format(new Date(`${today}T00:00:00`), 'd MMMM, EEEE', { locale: ru })}
            </Typography>
          </Box>
          <IconButton onClick={handleRefresh} aria-label="Обновить"><Refresh /></IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="sm" sx={{ pt: 2, px: { xs: 1.5, sm: 3 } }}>
        <Stack spacing={2}>
          {pageError && <Alert severity="error" onClose={() => setPageError(null)}>{pageError}</Alert>}
          {pageInfo && <Alert severity="success" onClose={() => setPageInfo(null)}>{pageInfo}</Alert>}

          {/* Сегодняшние уроки */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, px: 0.5 }}>
              СЕГОДНЯ
            </Typography>
            {todayLessonsQuery.isLoading ? (
              <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
            ) : todayLessons.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography color="text.secondary">На сегодня занятий нет</Typography>
              </Paper>
            ) : (
              <Stack spacing={1.25}>
                {todayLessons.map((slot) => {
                  const marked = slot.students.filter((s) => s.attended !== null && s.attended !== undefined).length;
                  const allMarked = marked === slot.students.length && slot.students.length > 0;
                  return (
                    <Paper
                      key={`${slot.lesson_date}-${slot.group_id}-${slot.start_time}`}
                      variant="outlined"
                      sx={{ p: 1.5, borderRadius: 2 }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body1" fontWeight={900} noWrap>{slot.group_name}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)} • {slot.students.length} уч.
                          </Typography>
                          <Typography variant="body2" color={allMarked ? 'success.main' : 'warning.main'}>
                            {allMarked ? '✓ Все отмечены' : `Отмечено: ${marked}/${slot.students.length}`}
                          </Typography>
                        </Box>
                        <Button
                          variant={allMarked ? 'outlined' : 'contained'}
                          size="small"
                          onClick={() => openAttendance(slot)}
                          sx={{ flexShrink: 0, mt: 0.5 }}
                        >
                          Посещаемость
                        </Button>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}
          </Box>

          <Divider />

          {/* Надо сделать */}
          {summaryQuery.isLoading ? null : (
            <>
              {(summary?.todo_grade_items?.length ?? 0) > 0 && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, px: 0.5 }}>
                    БЕЗ ОЦЕНОК
                  </Typography>
                  <Stack spacing={1}>
                    {(summary?.todo_grade_items ?? []).slice(0, 5).map((item) => (
                      <Paper key={item.student_id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={700} noWrap>{item.student_name}</Typography>
                            <Typography variant="caption" color="text.secondary">{item.group_name}</Typography>
                          </Box>
                          <Chip label={`${item.lessons_without_grade_count} ур.`} size="small" color="warning" />
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </Box>
              )}

              {(summary?.my_students?.length ?? 0) > 0 && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, px: 0.5 }}>
                    МОИ УЧЕНИКИ
                  </Typography>
                  <Stack spacing={1}>
                    {(summary?.my_students ?? []).slice(0, 8).map((item) => (
                      <Paper key={item.student_id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="body2" fontWeight={700} noWrap>{item.student_name}</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>{item.group_name}</Typography>
                            <LinearProgress
                              variant="determinate"
                              value={item.progress_percent}
                              sx={{ mt: 0.75, borderRadius: 1, height: 4 }}
                            />
                          </Box>
                          <Typography variant="body2" fontWeight={900} sx={{ flexShrink: 0 }}>
                            {item.progress_percent}%
                          </Typography>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </Box>
              )}
            </>
          )}

          {/* Предстоящие занятия */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, px: 0.5 }}>
              БЛИЖАЙШИЕ 7 ДНЕЙ
            </Typography>
            {upcomingLessonsQuery.isLoading ? (
              <Box sx={{ py: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress size={24} /></Box>
            ) : upcomingLessons.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Typography color="text.secondary">Занятий нет</Typography>
              </Paper>
            ) : (
              <Stack spacing={1}>
                {upcomingLessons.slice(0, 10).map((slot) => (
                  <Paper
                    key={`${slot.lesson_date}-${slot.group_id}-${slot.start_time}`}
                    variant="outlined"
                    sx={{ p: 1.5, borderRadius: 2, display: 'flex', gap: 1.5, alignItems: 'center' }}
                  >
                    <Box
                      sx={{
                        width: 40, height: 40, borderRadius: 1.5, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: 'primary.50', color: 'primary.main',
                      }}
                    >
                      <School fontSize="small" />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={700} noWrap>{slot.group_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {format(new Date(`${slot.lesson_date}T00:00:00`), 'd MMM, EEE', { locale: ru })} •{' '}
                        {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}
                      </Typography>
                    </Box>
                    <Chip label={`${slot.students.length}`} size="small" sx={{ ml: 'auto', flexShrink: 0 }} />
                  </Paper>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </Container>

      {/* Диалог посещаемости */}
      <Dialog
        open={Boolean(attendanceSlot)}
        onClose={() => setAttendanceSlot(null)}
        maxWidth="sm"
        fullWidth
        fullScreen={window.innerWidth < 600}
      >
        <DialogTitle>
          Посещаемость — {attendanceSlot?.group_name}
          <Typography variant="body2" color="text.secondary">
            {attendanceSlot?.start_time.slice(0, 5)}–{attendanceSlot?.end_time.slice(0, 5)}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {attendanceSlot?.students.map((s) => (
            <FormControlLabel
              key={s.id}
              control={
                <Checkbox
                  checked={Boolean(attendanceDraft[s.id])}
                  onChange={(e) => setAttendanceDraft((prev) => ({ ...prev, [s.id]: e.target.checked }))}
                />
              }
              label={s.full_name}
              sx={{ display: 'flex', mb: 0.5 }}
            />
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAttendanceSlot(null)}>Отмена</Button>
          <Button
            variant="contained"
            startIcon={<CheckCircle />}
            onClick={() => attendanceMutation.mutate()}
            disabled={attendanceMutation.isPending}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MobileTrainerCockpitPage;
