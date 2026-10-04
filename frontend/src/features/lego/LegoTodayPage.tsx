import React, { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Button, Card, CardActionArea, CardContent, Chip, Grid, Stack, Typography } from '@mui/material';
import { LegoShell } from './LegoShell';
import { formatMoney, getDashboard, LegoDashboard, LegoLesson, listLessons } from './legoApi';

const todayIso = () => new Date().toISOString().slice(0, 10);

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Card variant="outlined">
    <CardContent>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="h5">{value ?? '—'}</Typography>
    </CardContent>
  </Card>
);

const LegoTodayPage: React.FC = () => {
  const [dashboard, setDashboard] = useState<LegoDashboard | null>(null);
  const [lessons, setLessons] = useState<LegoLesson[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const today = todayIso();
    Promise.all([getDashboard(), listLessons({ date_from: today, date_to: today })])
      .then(([d, l]) => {
        setDashboard(d);
        setLessons(l);
      })
      .catch(() => setError('Не удалось загрузить данные модуля'));
  }, []);

  return (
    <LegoShell title="Сегодня">
      {error && <Alert severity="error">{error}</Alert>}
      {dashboard && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} md={3}><Stat label="Детей активно" value={dashboard.active_students} /></Grid>
          <Grid item xs={6} md={3}><Stat label="Занятий сегодня" value={dashboard.lessons_today} /></Grid>
          <Grid item xs={6} md={3}><Stat label="Пришли сегодня" value={dashboard.attended_today} /></Grid>
          <Grid item xs={6} md={3}><Stat label="Ожидается оплат" value={dashboard.payments_expected} /></Grid>
          {dashboard.money_visible && (
            <>
              <Grid item xs={6} md={3}><Stat label="Просрочено" value={dashboard.overdue} /></Grid>
              <Grid item xs={6} md={3}><Stat label="Сумма просрочки" value={formatMoney(dashboard.overdue_amount)} /></Grid>
              <Grid item xs={6} md={3}><Stat label="Выручка за месяц" value={formatMoney(dashboard.revenue_this_month)} /></Grid>
            </>
          )}
        </Grid>
      )}

      <Typography variant="h6" gutterBottom>Занятия на сегодня</Typography>
      {lessons.length === 0 ? (
        <Typography color="text.secondary">На сегодня занятий нет.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {lessons.map((lesson) => (
            <Card key={lesson.id} variant="outlined">
              <CardActionArea component={RouterLink} to={`/lego/lessons/${lesson.id}`}>
                <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                  <div>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {lesson.start_time ? lesson.start_time.slice(0, 5) : 'Время не указано'} · {lesson.group_name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">Детей в составе: {lesson.students_count}</Typography>
                  </div>
                  <Chip
                    size="small"
                    label={lesson.status === 'cancelled' ? 'Отменено' : lesson.status === 'completed' ? 'Отмечено' : 'Запланировано'}
                    color={lesson.status === 'cancelled' ? 'default' : lesson.status === 'completed' ? 'success' : 'primary'}
                  />
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}
      <Button sx={{ mt: 2 }} component={RouterLink} to="/lego/lessons" variant="text">Все занятия</Button>
    </LegoShell>
  );
};

export default LegoTodayPage;
