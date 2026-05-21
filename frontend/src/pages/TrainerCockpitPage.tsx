import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import Layout from '../components/Layout';
import { trainerCockpitApi, trainerLessonsApi } from '../services/api';
import type { TrainerLessonSlot } from '../types';
import { extractApiError } from '../utils/extractApiError';
import { useTrainerCockpitStore } from '../stores/trainerCockpitStore';

type AttendanceDraft = Record<number, boolean>;

const formatLessonLabel = (slot: TrainerLessonSlot) =>
  `${slot.start_time.slice(0, 5)}-${slot.end_time.slice(0, 5)} • ${slot.group_name}`;

const TrainerCockpitPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setSelectedLesson = useTrainerCockpitStore((state) => state.setSelectedLesson);
  const setSelectedStudentId = useTrainerCockpitStore((state) => state.setSelectedStudentId);
  const today = useMemo(() => format(startOfDay(new Date()), 'yyyy-MM-dd'), []);
  const upcomingDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => format(addDays(startOfDay(new Date()), index + 1), 'yyyy-MM-dd')),
    []
  );

  const [attendanceDialogOpen, setAttendanceDialogOpen] = useState(false);
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
      const rows = await Promise.all(upcomingDates.map((lessonDate) => trainerLessonsApi.getForDate(lessonDate)));
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
        attendances: attendanceSlot.students.map((student) => ({
          student_id: student.id,
          attended: Boolean(attendanceDraft[student.id]),
        })),
      });
    },
    onSuccess: async () => {
      setPageError(null);
      setPageInfo('Посещаемость сохранена.');
      setAttendanceDialogOpen(false);
      setAttendanceSlot(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['trainer-cockpit', 'today-lessons'] }),
        queryClient.invalidateQueries({ queryKey: ['trainer-cockpit', 'summary'] }),
      ]);
    },
    onError: (error: unknown) => {
      setPageError(extractApiError(error, 'Не удалось сохранить посещаемость'));
    },
  });

  const openAttendanceDialog = (slot: TrainerLessonSlot) => {
    const nextDraft: AttendanceDraft = {};
    slot.students.forEach((student) => {
      nextDraft[student.id] = student.attended ?? true;
    });
    setAttendanceDraft(nextDraft);
    setAttendanceSlot(slot);
    setAttendanceDialogOpen(true);
  };

  const openTrainerGrades = (slot: TrainerLessonSlot, studentId?: number) => {
    setSelectedLesson({
      groupId: slot.group_id,
      lessonDate: slot.lesson_date,
      startTime: slot.start_time,
      endTime: slot.end_time,
    });
    setSelectedStudentId(studentId ?? null);
    navigate('/trainer-grades');
  };

  const todayLessons = todayLessonsQuery.data ?? [];
  const upcomingLessons = upcomingLessonsQuery.data ?? [];
  const summary = summaryQuery.data;

  return (
    <Layout>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Кокпит тренера
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Сегодня, быстрые действия, ученики и ближайшее расписание без перегруженного ERP-интерфейса.
          </Typography>
        </Box>

        {(pageError || pageInfo) && (
          <Stack spacing={1}>
            {pageError ? <Alert severity="error" onClose={() => setPageError(null)}>{pageError}</Alert> : null}
            {pageInfo ? <Alert severity="success" onClose={() => setPageInfo(null)}>{pageInfo}</Alert> : null}
          </Stack>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12} lg={7}>
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="h6">Сегодня</Typography>
                  <Chip
                    label={format(new Date(`${today}T00:00:00`), 'd MMMM, EEEE', { locale: ru })}
                    color="primary"
                    variant="outlined"
                  />
                </Stack>
                {todayLessonsQuery.isLoading ? (
                  <LinearProgress />
                ) : todayLessons.length === 0 ? (
                  <Typography color="text.secondary">На сегодня занятий нет.</Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {todayLessons.map((slot) => {
                      const markedCount = slot.students.filter((student) => student.attended !== null && student.attended !== undefined).length;
                      return (
                        <Card key={`${slot.lesson_date}-${slot.group_id}-${slot.start_time}`} variant="outlined">
                          <CardContent>
                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
                              <Box>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                  {formatLessonLabel(slot)}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {slot.program_name || 'Без программы'} • {slot.students.length} учеников
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  Отмечено: {markedCount} из {slot.students.length}
                                </Typography>
                              </Box>
                              <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="flex-end">
                                <Button variant="outlined" onClick={() => openAttendanceDialog(slot)}>
                                  Посещаемость
                                </Button>
                                <Button variant="contained" onClick={() => openTrainerGrades(slot)}>
                                  Оценки
                                </Button>
                              </Stack>
                            </Stack>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} lg={5}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Надо сделать
                </Typography>
                {summaryQuery.isLoading ? (
                  <LinearProgress />
                ) : (
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Без оценок за последние 2 занятия
                      </Typography>
                      {summary?.todo_grade_items.length ? (
                        <Stack spacing={1}>
                          {summary.todo_grade_items.slice(0, 6).map((item) => (
                            <Card key={item.student_id} variant="outlined">
                              <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                                  <Box>
                                    <Typography sx={{ fontWeight: 700 }}>{item.student_name}</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {item.group_name || 'Без группы'} • пропущено оценок: {item.lessons_without_grade_count}
                                    </Typography>
                                  </Box>
                                  <Button size="small" onClick={() => navigate('/trainer-grades')}>
                                    Оценить
                                  </Button>
                                </Stack>
                              </CardContent>
                            </Card>
                          ))}
                        </Stack>
                      ) : (
                        <Typography color="text.secondary">Хвостов по оценкам нет.</Typography>
                      )}
                    </Box>
                    <Divider />
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Характеристики в draft
                      </Typography>
                      {summary?.draft_characteristics.length ? (
                        <Stack spacing={1}>
                          {summary.draft_characteristics.slice(0, 6).map((item) => (
                            <Card key={item.characteristic_id} variant="outlined">
                              <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                                  <Box>
                                    <Typography sx={{ fontWeight: 700 }}>{item.student_name}</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {String(item.month).padStart(2, '0')}/{item.year}
                                    </Typography>
                                  </Box>
                                  <Button size="small" onClick={() => navigate('/characteristics')}>
                                    Открыть
                                  </Button>
                                </Stack>
                              </CardContent>
                            </Card>
                          ))}
                        </Stack>
                      ) : (
                        <Typography color="text.secondary">Черновиков нет.</Typography>
                      )}
                    </Box>
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} lg={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Мои ученики
                </Typography>
                {summaryQuery.isLoading ? (
                  <LinearProgress />
                ) : (
                  <Stack spacing={1.5}>
                    {(summary?.my_students ?? []).slice(0, 8).map((item) => (
                      <Card key={item.student_id} variant="outlined">
                        <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                          <Stack spacing={1}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Box>
                                <Typography sx={{ fontWeight: 700 }}>{item.student_name}</Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {item.group_name || 'Без группы'} • {item.program_name || 'Программа не назначена'}
                                </Typography>
                              </Box>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                {item.progress_percent}%
                              </Typography>
                            </Stack>
                            <LinearProgress variant="determinate" value={item.progress_percent} />
                            <Typography variant="caption" color="text.secondary">
                              Тем оценено: {item.graded_topics} из {item.total_topics}
                            </Typography>
                            {item.ai_insight?.weak_zone ? (
                              <Typography variant="caption" color="warning.main">
                                Слабая зона: {item.ai_insight.weak_zone.topic_name} ({item.ai_insight.weak_zone.average_grade.toFixed(1)})
                              </Typography>
                            ) : null}
                            {item.ai_insight?.dropout_risk ? (
                              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                <Chip
                                  size="small"
                                  label={`Риск: ${item.ai_insight.dropout_risk.level}`}
                                  color={
                                    item.ai_insight.dropout_risk.level === 'high'
                                      ? 'error'
                                      : item.ai_insight.dropout_risk.level === 'medium'
                                      ? 'warning'
                                      : 'success'
                                  }
                                  variant="outlined"
                                />
                                <Typography variant="caption" color="text.secondary">
                                  {item.ai_insight.dropout_risk.recommended_action}
                                </Typography>
                              </Stack>
                            ) : null}
                          </Stack>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} lg={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Предстоящие занятия
                </Typography>
                {upcomingLessonsQuery.isLoading ? (
                  <LinearProgress />
                ) : upcomingLessons.length === 0 ? (
                  <Typography color="text.secondary">На ближайшую неделю занятий нет.</Typography>
                ) : (
                  <Stack spacing={1}>
                    {upcomingLessons.slice(0, 10).map((slot) => (
                      <Card key={`${slot.lesson_date}-${slot.group_id}-${slot.start_time}`} variant="outlined">
                        <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                            <Box>
                              <Typography sx={{ fontWeight: 700 }}>{slot.group_name}</Typography>
                              <Typography variant="body2" color="text.secondary">
                                {format(new Date(`${slot.lesson_date}T00:00:00`), 'd MMMM, EEEE', { locale: ru })} •{' '}
                                {slot.start_time.slice(0, 5)}-{slot.end_time.slice(0, 5)}
                              </Typography>
                            </Box>
                            <Chip label={`${slot.students.length} учен.`} size="small" />
                          </Stack>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Нотификации
                </Typography>
                {summaryQuery.isLoading ? (
                  <LinearProgress />
                ) : (
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Согласование характеристик
                      </Typography>
                      <Stack spacing={1}>
                        {(summary?.characteristic_notifications ?? []).slice(0, 5).map((item, index) => (
                          <Card key={`${item.notification_type}-${index}`} variant="outlined">
                            <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                              <Typography sx={{ fontWeight: 700 }}>{item.title}</Typography>
                              <Typography variant="body2" color="text.secondary">
                                {item.description}
                              </Typography>
                            </CardContent>
                          </Card>
                        ))}
                        {!summary?.characteristic_notifications.length ? (
                          <Typography color="text.secondary">Новых статусов по характеристикам нет.</Typography>
                        ) : null}
                      </Stack>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Подмены
                      </Typography>
                      <Stack spacing={1}>
                        {(summary?.substitution_notifications ?? []).slice(0, 5).map((item, index) => (
                          <Card key={`${item.notification_type}-${index}`} variant="outlined">
                            <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                              <Typography sx={{ fontWeight: 700 }}>{item.title}</Typography>
                              <Typography variant="body2" color="text.secondary">
                                {item.description}
                              </Typography>
                            </CardContent>
                          </Card>
                        ))}
                        {!summary?.substitution_notifications.length ? (
                          <Typography color="text.secondary">Запланированных подмен нет.</Typography>
                        ) : null}
                      </Stack>
                    </Grid>
                  </Grid>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Stack>

      <Dialog open={attendanceDialogOpen} onClose={() => setAttendanceDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Быстрая отметка посещаемости</DialogTitle>
        <DialogContent dividers>
          {attendanceSlot ? (
            <Stack spacing={1.5}>
              <Typography variant="subtitle2">
                {attendanceSlot.group_name} • {attendanceSlot.start_time.slice(0, 5)}-{attendanceSlot.end_time.slice(0, 5)}
              </Typography>
              {attendanceSlot.students.map((student) => (
                <FormControlLabel
                  key={student.id}
                  control={
                    <Checkbox
                      checked={Boolean(attendanceDraft[student.id])}
                      onChange={(event) =>
                        setAttendanceDraft((current) => ({
                          ...current,
                          [student.id]: event.target.checked,
                        }))
                      }
                    />
                  }
                  label={student.full_name}
                />
              ))}
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAttendanceDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => attendanceMutation.mutate()} disabled={attendanceMutation.isPending}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default TrainerCockpitPage;
