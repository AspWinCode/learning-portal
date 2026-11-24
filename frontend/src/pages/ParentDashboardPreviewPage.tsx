import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Grid, Paper, Stack, Typography } from '@mui/material';
import Layout from '../components/Layout';
import { parentDashboardApi } from '../services/api';
import type { ParentDashboardSummary } from '../types';
import { extractApiError } from '../utils/extractApiError';

const ParentDashboardPreviewPage: React.FC = () => {
  const { parentId } = useParams<{ parentId: string }>();
  const navigate = useNavigate();
  const [parent, setParent] = useState<{ id: number; full_name: string; email: string } | null>(null);
  const [summary, setSummary] = useState<ParentDashboardSummary>({ students: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = Number(parentId);
    if (!Number.isInteger(id)) {
      setError('Некорректный идентификатор родителя.');
      setLoading(false);
      return;
    }
    parentDashboardApi.getPreview(id)
      .then((data) => { setParent(data.parent); setSummary(data.summary); })
      .catch((err) => setError(extractApiError(err, 'Не удалось открыть кабинет родителя.')))
      .finally(() => setLoading(false));
  }, [parentId]);

  return (
    <Layout>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={2}>
          <Alert severity="info" icon={false}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between">
              <span><strong>Режим просмотра.</strong> Вы видите кабинет глазами выбранного родителя. Авторизация сотрудника не меняется.</span>
              <Button size="small" onClick={() => navigate('/students?tab=parents')}>К родителям</Button>
            </Stack>
          </Alert>
          {loading ? <Stack direction="row" spacing={1} alignItems="center"><CircularProgress size={22} /><Typography>Загрузка кабинета…</Typography></Stack> : null}
          {!loading && error ? <Alert severity="error">{error}</Alert> : null}
          {!loading && parent ? (
            <>
              <Box>
                <Typography variant="h4">Кабинет родителя</Typography>
                <Typography color="text.secondary">{parent.full_name} · {parent.email}</Typography>
              </Box>
              {summary.students.length === 0 ? <Paper sx={{ p: 3 }}><Typography>У родителя пока нет активных детей.</Typography></Paper> : null}
              <Grid container spacing={2}>
                {summary.students.map((student) => (
                  <Grid item xs={12} md={6} key={student.student_id}>
                    <Paper sx={{ p: 2.5, height: '100%' }}>
                      <Stack spacing={1.5}>
                        <Typography variant="h6">{student.student_name}</Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          <Chip label={`Баланс: ${student.current_balance.toLocaleString('ru-RU')} ₽`} color={student.current_balance < 0 ? 'error' : 'default'} />
                          <Chip label={student.nearest_lesson ? `Ближайшее занятие: ${new Date(student.nearest_lesson.lesson_date).toLocaleDateString('ru-RU')}` : 'Ближайших занятий нет'} variant="outlined" />
                        </Stack>
                        {student.nearest_lesson ? <Typography variant="body2" color="text.secondary">{student.nearest_lesson.group_name} · {student.nearest_lesson.start_time.slice(0, 5)} · тренер: {student.nearest_lesson.trainer_name || '—'}</Typography> : null}
                        {student.course_progress?.length ? (
                          <Stack spacing={1}>
                            <Typography variant="subtitle2">Прогресс по курсам</Typography>
                            {student.course_progress.map((course) => <Box key={course.course_code}><Typography variant="body2">{course.course_name}</Typography><Typography variant="caption" color="text.secondary">{course.cases_solved} из {course.cases_total} заданий · {course.badges_count} достижений</Typography></Box>)}
                          </Stack>
                        ) : <Typography variant="body2" color="text.secondary">Прогресс по внешним курсам пока не заполнен.</Typography>}
                      </Stack>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </>
          ) : null}
        </Stack>
      </Box>
    </Layout>
  );
};

export default ParentDashboardPreviewPage;
