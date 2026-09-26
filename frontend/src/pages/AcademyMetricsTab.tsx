import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useQuery } from '@tanstack/react-query';

import { ownerDashboardApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

type RatingField = 'grade' | 'school';

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const currentMonthBounds = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: toLocalDateString(start),
    to: toLocalDateString(end),
  };
};

const rub = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

const AcademyMetricsTab: React.FC = () => {
  const navigate = useNavigate();
  const initial = currentMonthBounds();
  const [fromDate, setFromDate] = useState<string>(initial.from);
  const [toDate, setToDate] = useState<string>(initial.to);
  const [selectedRating, setSelectedRating] = useState<{ field: RatingField; label: string } | null>(null);

  const metricsQuery = useQuery({
    queryKey: ['owner-dashboard', 'academy-metrics', fromDate, toDate],
    queryFn: () => ownerDashboardApi.getAcademyMetrics({ date_from: fromDate, date_to: toDate }),
  });

  const ratingStudentsQuery = useQuery({
    queryKey: ['owner-dashboard', 'academy-metrics-students', selectedRating?.field, selectedRating?.label],
    queryFn: () =>
      ownerDashboardApi.getAcademyMetricsRatingStudents({
        field: selectedRating!.field,
        label: selectedRating!.label,
      }),
    enabled: !!selectedRating,
  });

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h5" gutterBottom>
        Показатели Академии
      </Typography>

      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3, flexWrap: 'wrap' }}>
        <TextField
          label="С"
          type="date"
          size="small"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label="По"
          type="date"
          size="small"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      </Stack>

      {metricsQuery.isLoading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : metricsQuery.isError ? (
        <Alert severity="error">
          {extractApiError(metricsQuery.error, 'Не удалось загрузить показатели академии')}
        </Alert>
      ) : metricsQuery.data ? (
        <Box>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={4}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Средний чек
                </Typography>
                <Typography variant="h4" sx={{ mt: 1 }}>
                  {rub(metricsQuery.data.average_check)}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Учеников с оплатой за период
                </Typography>
                <Typography variant="h4" sx={{ mt: 1 }}>
                  {metricsQuery.data.students_count}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Сумма чеков за период
                </Typography>
                <Typography variant="h4" sx={{ mt: 1 }}>
                  {rub(metricsQuery.data.total_amount)}
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Разбивка по форматам абонементов
            </Typography>
            {metricsQuery.data.breakdown_by_format.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Нет оплат за выбранный период.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Формат абонемента</TableCell>
                    <TableCell align="right">Учеников</TableCell>
                    <TableCell align="right">Сумма чеков</TableCell>
                    <TableCell align="right">Средний чек</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {metricsQuery.data.breakdown_by_format.map((row) => (
                    <TableRow key={row.abonement_format}>
                      <TableCell>{row.format_label}</TableCell>
                      <TableCell align="right">{row.students_count}</TableCell>
                      <TableCell align="right">{rub(row.total_amount)}</TableCell>
                      <TableCell align="right">{rub(row.average_check)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              CAC, LTV, Retention, NPS
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="text.secondary">
                  CAC
                </Typography>
                <Typography variant="h5">{rub(metricsQuery.data.cac)}</Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="text.secondary">
                  LTV
                </Typography>
                <Typography variant="h5">{rub(metricsQuery.data.ltv)}</Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="text.secondary">
                  LTV / CAC
                </Typography>
                <Typography variant="h5">{metricsQuery.data.ltv_cac_ratio.toFixed(2)}</Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="caption" color="text.secondary">
                  NPS {metricsQuery.data.nps.responses_count > 0 ? `(${metricsQuery.data.nps.responses_count} отв.)` : '(нет ответов)'}
                </Typography>
                <Typography variant="h5">
                  {metricsQuery.data.nps.nps_score === null ? '—' : metricsQuery.data.nps.nps_score}
                </Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">
                  Retention 3 мес.
                </Typography>
                <Typography variant="h6">{metricsQuery.data.retention_3_pct}%</Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">
                  Retention 6 мес.
                </Typography>
                <Typography variant="h6">{metricsQuery.data.retention_6_pct}%</Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">
                  Retention 12 мес.
                </Typography>
                <Typography variant="h6">{metricsQuery.data.retention_12_pct}%</Typography>
              </Grid>
            </Grid>

            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              CAC = расходы на маркетинг/продажи за период / новые ученики за период (первая оплата в периоде).
              <br />
              LTV = ARPU × валовая маржа% × Lifetime(мес.), где Lifetime = 100/Churn% (или средний фактический
              срок жизни, если Churn = 0); Churn% = ушедшие из прошлого периода / платившие в прошлом периоде.
              <br />
              Retention N мес. = % учеников когорты (по месяцу первой оплаты), у кого была оплата ровно через
              N месяцев после первой.
              <br />
              NPS = %Промоутеров(оценка 9–10) − %Детракторов(оценка 0–6) по ответам на опрос в кабинете
              родителя (раз в квартал) за выбранный период.
            </Typography>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              Выручка по группам
            </Typography>
            {metricsQuery.data.breakdown_by_group.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Нет данных: ни у одной группы нет учеников с оплатой за выбранный период.
              </Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Группа</TableCell>
                    <TableCell>Тренер</TableCell>
                    <TableCell align="right">Учеников</TableCell>
                    <TableCell align="right">Выручка</TableCell>
                    <TableCell align="right">Средний чек</TableCell>
                    <TableCell align="right">Расход на тренера</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {metricsQuery.data.breakdown_by_group.map((row) => (
                    <TableRow key={row.group_id}>
                      <TableCell>{row.group_name}</TableCell>
                      <TableCell>{row.trainer_name || '—'}</TableCell>
                      <TableCell align="right">{row.students_count}</TableCell>
                      <TableCell align="right">{rub(row.total_amount)}</TableCell>
                      <TableCell align="right">{rub(row.average_check)}</TableCell>
                      <TableCell align="right">{rub(row.trainer_cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Выручка группы = сумма чеков учеников, у которых сейчас активное членство в этой группе и
              которые заплатили в выбранном периоде. Ученик без активной группы (например, чисто
              индивидуальный) сюда не попадает, но учтён в общей цифре и разбивке по форматам выше.
              <br />
              Расход на тренера = ставка группы (за занятие или за час — как задано в «Расчётах») × число
              занятий/часов за выбранный период. Если ставка группе не задана, расход будет 0 ₽.
            </Typography>
          </Paper>

          <Grid container spacing={2} sx={{ mt: 0 }}>
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                <Typography variant="h6" gutterBottom>
                  Рейтинг по классам
                </Typography>
                {metricsQuery.data.rating_by_grade.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Нет активных учеников.
                  </Typography>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Класс</TableCell>
                        <TableCell align="right">Учеников</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {metricsQuery.data.rating_by_grade.map((row) => (
                        <TableRow
                          key={row.label}
                          hover
                          sx={{ cursor: 'pointer' }}
                          onClick={() => setSelectedRating({ field: 'grade', label: row.label })}
                        >
                          <TableCell>{row.label}</TableCell>
                          <TableCell align="right">{row.students_count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                <Typography variant="h6" gutterBottom>
                  Рейтинг по школам
                </Typography>
                {metricsQuery.data.rating_by_school.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Нет активных учеников.
                  </Typography>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Школа</TableCell>
                        <TableCell align="right">Учеников</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {metricsQuery.data.rating_by_school.map((row) => (
                        <TableRow
                          key={row.label}
                          hover
                          sx={{ cursor: 'pointer' }}
                          onClick={() => setSelectedRating({ field: 'school', label: row.label })}
                        >
                          <TableCell>{row.label}</TableCell>
                          <TableCell align="right">{row.students_count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Paper>
            </Grid>
          </Grid>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, mb: 2, display: 'block' }}>
            Рейтинги по классам и школам считаются по всем активным ученикам сейчас (не зависят от выбранного
            периода) — это срез состава академии, а не денежная метрика.
          </Typography>

          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            Средний чек = цена абонемента ученика (с учётом персональной скидки), засчитанная один раз за
            период на ученика — вне зависимости от того, одним платежом или в рассрочку он вносил оплату.
          </Typography>
        </Box>
      ) : null}

      <Dialog open={!!selectedRating} onClose={() => setSelectedRating(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {selectedRating ? (selectedRating.field === 'grade' ? `Класс: ${selectedRating.label}` : `Школа: ${selectedRating.label}`) : ''}
          <IconButton onClick={() => setSelectedRating(null)} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {ratingStudentsQuery.isLoading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress />
            </Box>
          ) : ratingStudentsQuery.isError ? (
            <Alert severity="error">
              {extractApiError(ratingStudentsQuery.error, 'Не удалось загрузить список учеников')}
            </Alert>
          ) : ratingStudentsQuery.data && ratingStudentsQuery.data.length > 0 ? (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Ученик</TableCell>
                  <TableCell>{selectedRating?.field === 'grade' ? 'Школа' : 'Класс'}</TableCell>
                  <TableCell>Телефон</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ratingStudentsQuery.data.map((student) => (
                  <TableRow
                    key={student.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/students?detail=${student.id}`)}
                  >
                    <TableCell>{student.full_name}</TableCell>
                    <TableCell>{(selectedRating?.field === 'grade' ? student.school : student.grade) || '—'}</TableCell>
                    <TableCell>{student.phone || student.parent_phone || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Нет учеников.
            </Typography>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default AcademyMetricsTab;
