import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Chip, CircularProgress, Divider, LinearProgress,
  Paper, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ArrowBack } from '@mui/icons-material';
import { Button } from '@mui/material';
import { tripsApi } from '../services/api';

const CATEGORY_LABELS: Record<string, string> = {
  food: '🍜 Еда', transport: '🚕 Транспорт', excursion: '🏝 Экскурсия',
  accommodation: '🏨 Жильё', shopping: '🛍 Шоппинг', health: '💊 Здоровье',
  visa: '🛂 Виза', entertainment: '🎭 Развлечения', other: '📦 Прочее',
};

const STATUS_LABELS: Record<string, string> = {
  planned: 'Запланирована', active: 'Активна', completed: 'Завершена',
};

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success'> = {
  planned: 'default', active: 'primary', completed: 'success',
};

const fmt = (n: number | null | undefined, dec = 0) => {
  if (n == null) return '—';
  return n.toLocaleString('ru-RU', { maximumFractionDigits: dec, minimumFractionDigits: dec });
};

const TravelComparePage: React.FC = () => {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    tripsApi.compareTrips()
      .then(data => setTrips(data))
      .catch(() => setError('Не удалось загрузить данные'))
      .finally(() => setLoading(false));
  }, []);

  const allCats = Array.from(
    new Set(trips.flatMap(t => Object.keys(t.by_category || {})))
  ).sort();

  const maxSpent = Math.max(...trips.map(t => t.total_spent_local || 0), 1);

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/travel')} size="small">
          Назад
        </Button>
        <Typography variant="h5" fontWeight={700}>Сравнение поездок</Typography>
      </Box>

      {loading && <CircularProgress />}
      {error && <Alert severity="error">{error}</Alert>}

      {!loading && trips.length === 0 && (
        <Typography color="text.secondary">Нет поездок для сравнения</Typography>
      )}

      {trips.length > 0 && (
        <>
          {/* Cards overview */}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 4 }}>
            {trips.map(t => (
              <Paper
                key={t.id}
                variant="outlined"
                sx={{ p: 2, minWidth: 220, flex: '1 1 220px', cursor: 'pointer', '&:hover': { boxShadow: 3 } }}
                onClick={() => navigate(`/travel/${t.id}`)}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ maxWidth: 160 }}>{t.title}</Typography>
                  <Chip size="small" label={STATUS_LABELS[t.status] || t.status}
                    color={STATUS_COLORS[t.status] || 'default'} sx={{ fontSize: '0.65rem', height: 18 }} />
                </Box>
                {t.country && (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                    {t.country}{t.city ? `, ${t.city}` : ''}
                  </Typography>
                )}
                {t.start_date && (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    {t.start_date}{t.end_date ? ` → ${t.end_date}` : ''}
                    {t.days_total ? ` (${t.days_total} дн.)` : ''}
                  </Typography>
                )}
                <Typography variant="body1" fontWeight={700} color="error.main">
                  {fmt(t.total_spent_local)} {t.local_currency}
                </Typography>
                {t.total_plan && (
                  <Typography variant="caption" color="text.secondary">
                    бюджет: {fmt(t.total_plan)} — {fmt(t.budget_used_pct, 0)}% использовано
                  </Typography>
                )}
                {t.daily_avg != null && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    {fmt(t.daily_avg)} {t.local_currency}/день
                  </Typography>
                )}
                <Box sx={{ mt: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={(t.total_spent_local / maxSpent) * 100}
                    sx={{ height: 4, borderRadius: 2 }}
                  />
                </Box>
              </Paper>
            ))}
          </Box>

          <Divider sx={{ mb: 3 }} />

          {/* Comparison table */}
          <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Детальное сравнение</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, minWidth: 140 }}>Показатель</TableCell>
                  {trips.map(t => (
                    <TableCell key={t.id} align="right" sx={{ fontWeight: 700, minWidth: 130 }}>
                      <Box
                        component="span"
                        sx={{ cursor: 'pointer', color: 'primary.main', '&:hover': { textDecoration: 'underline' } }}
                        onClick={() => navigate(`/travel/${t.id}`)}
                      >
                        {t.title}
                      </Box>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Статус</TableCell>
                  {trips.map(t => (
                    <TableCell key={t.id} align="right">
                      <Chip size="small" label={STATUS_LABELS[t.status] || t.status}
                        color={STATUS_COLORS[t.status] || 'default'} sx={{ fontSize: '0.65rem', height: 18 }} />
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>Страна / город</TableCell>
                  {trips.map(t => (
                    <TableCell key={t.id} align="right" sx={{ fontSize: '0.8rem' }}>
                      {t.country || '—'}{t.city ? `, ${t.city}` : ''}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>Длительность (дней)</TableCell>
                  {trips.map(t => <TableCell key={t.id} align="right">{t.days_total ?? '—'}</TableCell>)}
                </TableRow>
                <TableRow>
                  <TableCell>Кол-во трат</TableCell>
                  {trips.map(t => <TableCell key={t.id} align="right">{t.expense_count}</TableCell>)}
                </TableRow>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Итого потрачено</TableCell>
                  {trips.map(t => (
                    <TableCell key={t.id} align="right" sx={{ fontWeight: 700, color: 'error.main' }}>
                      {fmt(t.total_spent_local)} {t.local_currency}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>В базовой валюте</TableCell>
                  {trips.map(t => (
                    <TableCell key={t.id} align="right" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                      {fmt(t.total_spent_base)} {t.base_currency}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>Бюджет</TableCell>
                  {trips.map(t => (
                    <TableCell key={t.id} align="right">
                      {t.total_plan ? `${fmt(t.total_plan)} ${t.local_currency}` : '—'}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>% бюджета</TableCell>
                  {trips.map(t => (
                    <TableCell key={t.id} align="right"
                      sx={{ color: t.budget_used_pct > 100 ? 'error.main' : 'inherit' }}>
                      {t.budget_used_pct != null ? `${fmt(t.budget_used_pct, 0)}%` : '—'}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell>Обменяно нала</TableCell>
                  {trips.map(t => (
                    <TableCell key={t.id} align="right">
                      {fmt(t.total_exchanged_local)} {t.local_currency}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 700 }}>Расход/день</TableCell>
                  {trips.map(t => (
                    <TableCell key={t.id} align="right" sx={{ fontWeight: 700 }}>
                      {t.daily_avg != null ? `${fmt(t.daily_avg)} ${t.local_currency}` : '—'}
                    </TableCell>
                  ))}
                </TableRow>
                {allCats.map(cat => (
                  <TableRow key={cat}>
                    <TableCell sx={{ pl: 3, color: 'text.secondary', fontSize: '0.8rem' }}>
                      {CATEGORY_LABELS[cat] || cat}
                    </TableCell>
                    {trips.map(t => (
                      <TableCell key={t.id} align="right" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                        {t.by_category[cat] ? `${fmt(t.by_category[cat])} ${t.local_currency}` : '—'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Box>
  );
};

export default TravelComparePage;
