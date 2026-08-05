import React, { useEffect, useState } from 'react';
import {
  Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControl, Grid, InputLabel, MenuItem, Select, TextField, Typography, Alert,
} from '@mui/material';
import { Add, FlightTakeoff, Place, CalendarToday } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { tripsApi } from '../services/api';

const STATUS_LABELS: Record<string, string> = {
  planned: 'Запланирована',
  active: 'Активна',
  completed: 'Завершена',
};

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success'> = {
  planned: 'default',
  active: 'primary',
  completed: 'success',
};

const CURRENCY_OPTIONS = ['RUB', 'USD', 'EUR', 'THB', 'AED', 'TRY', 'IDR', 'VND', 'MYR', 'SGD'];

const defaultForm = {
  title: '',
  country: '',
  city: '',
  start_date: '',
  end_date: '',
  base_currency: 'RUB',
  local_currency: 'THB',
  status: 'planned',
  notes: '',
};

const TravelPage: React.FC = () => {
  const navigate = useNavigate();
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await tripsApi.list(statusFilter || undefined);
      setTrips(data);
    } catch {
      setError('Не удалось загрузить поездки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleOpen = () => {
    setForm(defaultForm);
    setSaveError('');
    setDialogOpen(true);
  };

  const handleClose = () => setDialogOpen(false);

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.start_date) {
      setSaveError('Заполните название и дату начала');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await tripsApi.create({
        title: form.title.trim(),
        country: form.country.trim() || undefined,
        city: form.city.trim() || undefined,
        start_date: form.start_date,
        end_date: form.end_date || undefined,
        base_currency: form.base_currency,
        local_currency: form.local_currency,
        status: form.status,
        notes: form.notes.trim() || undefined,
      });
      setDialogOpen(false);
      load();
    } catch (e: any) {
      setSaveError(e.response?.data?.detail || 'Ошибка при создании поездки');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <FlightTakeoff sx={{ color: 'primary.main', fontSize: 28 }} />
          <Typography variant="h5" fontWeight={700}>Путешествия</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" size="small" onClick={() => navigate('/travel/compare')}>
            Сравнить
          </Button>
          <Button variant="contained" startIcon={<Add />} onClick={handleOpen}>
            Новая поездка
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['', 'planned', 'active', 'completed'] as const).map(s => (
          <Chip
            key={s}
            label={s === '' ? 'Все' : STATUS_LABELS[s]}
            onClick={() => setStatusFilter(s)}
            color={statusFilter === s ? 'primary' : 'default'}
            variant={statusFilter === s ? 'filled' : 'outlined'}
            clickable
          />
        ))}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      ) : trips.length === 0 ? (
        <Box
          sx={{
            mt: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            color: 'text.secondary',
          }}
        >
          <FlightTakeoff sx={{ fontSize: 56, opacity: 0.3 }} />
          <Typography variant="h6" fontWeight={500}>Поездок пока нет</Typography>
          <Typography variant="body2">Создайте первую поездку, чтобы начать отслеживать траты в путешествиях</Typography>
          <Button variant="outlined" startIcon={<Add />} onClick={handleOpen}>
            Создать поездку
          </Button>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {trips.map(trip => (
            <Grid item xs={12} sm={6} md={4} key={trip.id}>
              <Card
                variant="outlined"
                sx={{
                  borderRadius: 2,
                  transition: 'box-shadow 0.18s',
                  '&:hover': { boxShadow: 3 },
                }}
              >
                <CardActionArea onClick={() => navigate(`/travel/${trip.id}`)}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                      <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                        {trip.title}
                      </Typography>
                      <Chip
                        size="small"
                        label={STATUS_LABELS[trip.status] || trip.status}
                        color={STATUS_COLORS[trip.status] || 'default'}
                        sx={{ ml: 1, flexShrink: 0 }}
                      />
                    </Box>

                    {(trip.city || trip.country) && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
                        <Place sx={{ fontSize: 15, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                          {[trip.city, trip.country].filter(Boolean).join(', ')}
                        </Typography>
                      </Box>
                    )}

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
                      <CalendarToday sx={{ fontSize: 14, color: 'text.secondary' }} />
                      <Typography variant="body2" color="text.secondary">
                        {trip.start_date}
                        {trip.end_date ? ` — ${trip.end_date}` : ''}
                      </Typography>
                    </Box>

                    <Divider sx={{ mb: 1.5 }} />

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <Chip
                        size="small"
                        label={`${trip.local_currency} / ${trip.base_currency}`}
                        variant="outlined"
                        sx={{ fontSize: '0.72rem', height: 22 }}
                      />
                      <Chip
                        size="small"
                        label={`${trip.transaction_count ?? 0} транзакций`}
                        variant="outlined"
                        sx={{ fontSize: '0.72rem', height: 22 }}
                      />
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Новая поездка</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}

          <TextField
            fullWidth label="Название поездки" required
            value={form.title}
            onChange={e => handleChange('title', e.target.value)}
            placeholder="Например: Тайланд, Пхукет 2026"
            sx={{ mb: 2, mt: 1 }}
          />

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <TextField
                fullWidth label="Страна"
                value={form.country}
                onChange={e => handleChange('country', e.target.value)}
                placeholder="Тайланд"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth label="Город"
                value={form.city}
                onChange={e => handleChange('city', e.target.value)}
                placeholder="Пхукет"
              />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <TextField
                fullWidth label="Дата начала" required type="date"
                value={form.start_date}
                onChange={e => handleChange('start_date', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth label="Дата окончания" type="date"
                value={form.end_date}
                onChange={e => handleChange('end_date', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Базовая валюта</InputLabel>
                <Select
                  value={form.base_currency}
                  label="Базовая валюта"
                  onChange={e => handleChange('base_currency', e.target.value)}
                >
                  {CURRENCY_OPTIONS.map(c => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Местная валюта</InputLabel>
                <Select
                  value={form.local_currency}
                  label="Местная валюта"
                  onChange={e => handleChange('local_currency', e.target.value)}
                >
                  {CURRENCY_OPTIONS.map(c => (
                    <MenuItem key={c} value={c}>{c}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Статус</InputLabel>
            <Select
              value={form.status}
              label="Статус"
              onChange={e => handleChange('status', e.target.value)}
            >
              <MenuItem value="planned">Запланирована</MenuItem>
              <MenuItem value="active">Активна</MenuItem>
              <MenuItem value="completed">Завершена</MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth label="Заметки" multiline minRows={2}
            value={form.notes}
            onChange={e => handleChange('notes', e.target.value)}
            placeholder="Дополнительная информация о поездке..."
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={saving}>Отмена</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Сохранение...' : 'Создать'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TravelPage;
