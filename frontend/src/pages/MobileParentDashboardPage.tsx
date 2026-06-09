import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { ArrowBack, CalendarToday, CreditCard, Refresh, School } from '@mui/icons-material';
import { parentDashboardApi } from '../services/api';

const MobileParentDashboardPage: React.FC = () => {
  const navigate = useNavigate();

  const summaryQuery = useQuery({
    queryKey: ['parent-dashboard', 'summary'],
    queryFn: () => parentDashboardApi.getSummary(),
  });

  const summary = summaryQuery.data;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f6f8fb', pb: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => navigate('/mobile')} aria-label="Назад">
            <ArrowBack />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0, ml: 1 }}>
            <Typography variant="subtitle1" fontWeight={900} noWrap>Кабинет родителя</Typography>
            <Typography variant="caption" color="text.secondary">Успеваемость и оплаты</Typography>
          </Box>
          <IconButton onClick={() => summaryQuery.refetch()} aria-label="Обновить">
            <Refresh />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="sm" sx={{ pt: 2, px: { xs: 1.5, sm: 3 } }}>
        {summaryQuery.isLoading ? (
          <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
        ) : summaryQuery.isError ? (
          <Alert severity="error">Не удалось загрузить данные</Alert>
        ) : !summary?.students.length ? (
          <Alert severity="info">Нет привязанных учеников</Alert>
        ) : (
          <Stack spacing={2}>
            {summary.students.map((s) => (
              <Paper key={s.student_id} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                {/* Заголовок карточки */}
                <Box sx={{ p: 2, bgcolor: 'primary.50', borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="body1" fontWeight={900}>{s.student_name}</Typography>
                    <Chip
                      icon={<CreditCard fontSize="small" />}
                      label={`${s.current_balance.toLocaleString('ru-RU')} ₽`}
                      color={s.current_balance >= 0 ? 'success' : 'error'}
                      size="small"
                      variant="outlined"
                    />
                  </Stack>
                </Box>

                <Stack spacing={0} divider={<Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }} />}>
                  {/* Ближайший урок */}
                  {s.nearest_lesson ? (
                    <Box sx={{ p: 1.5 }}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{
                          width: 36, height: 36, borderRadius: 1.5, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          bgcolor: 'info.50', color: 'info.main',
                        }}>
                          <School fontSize="small" />
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={700} noWrap>
                            {s.nearest_lesson.group_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {format(new Date(`${s.nearest_lesson.lesson_date}T00:00:00`), 'd MMM, EEE', { locale: ru })}{' '}
                            {s.nearest_lesson.start_time.slice(0, 5)}–{s.nearest_lesson.end_time.slice(0, 5)}
                            {s.nearest_lesson.trainer_name ? ` • ${s.nearest_lesson.trainer_name}` : ''}
                          </Typography>
                        </Box>
                      </Stack>
                    </Box>
                  ) : (
                    <Box sx={{ p: 1.5 }}>
                      <Typography variant="body2" color="text.secondary">Ближайших занятий нет</Typography>
                    </Box>
                  )}

                  {/* Следующая оплата */}
                  {s.next_payment_date && (
                    <Box sx={{ p: 1.5 }}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{
                          width: 36, height: 36, borderRadius: 1.5, flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          bgcolor: 'warning.50', color: 'warning.main',
                        }}>
                          <CalendarToday fontSize="small" />
                        </Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography variant="body2" fontWeight={700}>Следующая оплата</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {format(new Date(`${s.next_payment_date}T00:00:00`), 'd MMMM yyyy', { locale: ru })}
                          </Typography>
                        </Box>
                        {s.payment_link && (
                          <Button
                            component="a"
                            href={s.payment_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="contained"
                            size="small"
                            sx={{ flexShrink: 0 }}
                          >
                            Оплатить
                          </Button>
                        )}
                      </Stack>
                    </Box>
                  )}

                  {/* AI-инсайт */}
                  {s.ai_insight && (
                    <Box sx={{ p: 1.5 }}>
                      {s.ai_insight.weak_zone && (
                        <Box sx={{ mb: 1 }}>
                          <Typography variant="caption" color="text.secondary">Слабая зона</Typography>
                          <Typography variant="body2">
                            {s.ai_insight.weak_zone.topic_name} — {s.ai_insight.weak_zone.average_grade.toFixed(1)} ср.
                          </Typography>
                        </Box>
                      )}
                      {s.ai_insight.dropout_risk && (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip
                            size="small"
                            label={`Риск: ${s.ai_insight.dropout_risk.level}`}
                            color={
                              s.ai_insight.dropout_risk.level === 'high' ? 'error'
                              : s.ai_insight.dropout_risk.level === 'medium' ? 'warning'
                              : 'success'
                            }
                            variant="outlined"
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                            {s.ai_insight.dropout_risk.recommended_action}
                          </Typography>
                        </Stack>
                      )}
                    </Box>
                  )}
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}
      </Container>
    </Box>
  );
};

export default MobileParentDashboardPage;
