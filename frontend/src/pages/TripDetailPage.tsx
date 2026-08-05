import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControl, Grid, IconButton,
  InputLabel, MenuItem, Paper, Select, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  ArrowBack, CalendarToday, Delete, Edit, FlightTakeoff, LinkOff, Place,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
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

const DIRECTION_LABELS: Record<string, string> = {
  income: 'Доход',
  expense: 'Расход',
  transfer: 'Перевод',
};

const CURRENCY_OPTIONS = ['RUB', 'USD', 'EUR', 'THB', 'AED', 'TRY', 'IDR', 'VND', 'MYR', 'SGD'];

const TripDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tripId = Number(id);

  const [trip, setTrip] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [t, txns] = await Promise.all([
        tripsApi.get(tripId),
        tripsApi.getTransactions(tripId),
      ]);
      setTrip(t);
      setTransactions(txns);
    } catch {
      setError('Не удалось загрузить поездку');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tripId]);

  const handleEditOpen = () => {
    if (!trip) return;
    setEditForm({
      title: trip.title,
      country: trip.country || '',
      city: trip.city || '',
      start_date: trip.start_date || '',
      end_date: trip.end_date || '',
      base_currency: trip.base_currency,
      local_currency: trip.local_currency,
      status: trip.status,
      notes: trip.notes || '',
    });
    setEditError('');
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editForm.title?.trim() || !editForm.start_date) {
      setEditError('Заполните название и дату начала');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      const updated = await tripsApi.update(tripId, {
        title: editForm.title.trim(),
        country: editForm.country.trim() || undefined,
        city: editForm.city.trim() || undefined,
        start_date: editForm.start_date,
        end_date: editForm.end_date || undefined,
        base_currency: editForm.base_currency,
        local_currency: editForm.local_currency,
        status: editForm.status,
        notes: editForm.notes.trim() || undefined,
      });
      setTrip(updated);
      setEditOpen(false);
    } catch (e: any) {
      setEditError(e.response?.data?.detail || 'Ошибка при сохранении');
    } finally {
      setEditSaving(false);
    }
  };

  const handleUnlink = async (txnId: number) => {
    try {
      await tripsApi.unlinkTransaction(tripId, txnId);
      setTransactions(prev => prev.filter(t => t.id !== txnId));
    } catch {
      // silent
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await tripsApi.delete(tripId);
      navigate('/travel');
    } catch {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const totalExpense = transactions
    .filter(t => t.direction === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  const totalIncome = transactions
    .filter(t => t.direction === 'income')
    .reduce((s, t) => s + t.amount, 0);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !trip) {
    return (
      <Box>
        <Alert severity="error">{error || 'Поездка не найдена'}</Alert>
        <Button sx={{ mt: 2 }} startIcon={<ArrowBack />} onClick={() => navigate('/travel')}>
          К списку поездок
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <IconButton onClick={() => navigate('/travel')} size="small">
          <ArrowBack />
        </IconButton>
        <FlightTakeoff sx={{ color: 'primary.main' }} />
        <Typography variant="h5" fontWeight={700} sx={{ flex: 1 }}>
          {trip.title}
        </Typography>
        <Chip
          label={STATUS_LABELS[trip.status] || trip.status}
          color={STATUS_COLORS[trip.status] || 'default'}
        />
        <Tooltip title="Редактировать">
          <IconButton onClick={handleEditOpen}><Edit /></IconButton>
        </Tooltip>
        <Tooltip title="Удалить поездку">
          <IconButton color="error" onClick={() => setDeleteOpen(true)}><Delete /></IconButton>
        </Tooltip>
      </Box>

      {/* Info cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {(trip.city || trip.country) && (
          <Grid item xs={12} sm={6} md={3}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Place sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                  Место
                </Typography>
              </Box>
              <Typography variant="body1" fontWeight={600}>
                {[trip.city, trip.country].filter(Boolean).join(', ')}
              </Typography>
            </Paper>
          </Grid>
        )}

        <Grid item xs={12} sm={6} md={3}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <CalendarToday sx={{ fontSize: 18, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
                Даты
              </Typography>
            </Box>
            <Typography variant="body1" fontWeight={600}>
              {trip.start_date}
              {trip.end_date ? ` — ${trip.end_date}` : ''}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
              Расходы ({trip.base_currency})
            </Typography>
            <Typography variant="h6" fontWeight={700} color="error.main" sx={{ mt: 0.5 }}>
              {totalExpense.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">
              Доходы ({trip.base_currency})
            </Typography>
            <Typography variant="h6" fontWeight={700} color="success.main" sx={{ mt: 0.5 }}>
              {totalIncome.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {trip.notes && (
        <Alert severity="info" icon={false} sx={{ mb: 3, borderRadius: 2 }}>
          <Typography variant="body2">{trip.notes}</Typography>
        </Alert>
      )}

      {/* Transactions */}
      <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
        Транзакции поездки
        <Chip size="small" label={transactions.length} sx={{ ml: 1 }} />
      </Typography>

      {transactions.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <Typography color="text.secondary" variant="body2">
            Транзакции из финансового журнала пока не привязаны к этой поездке.
            Привязать транзакцию можно из журнала — установив для неё эту поездку.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Дата</TableCell>
                <TableCell>Описание</TableCell>
                <TableCell>Контрагент</TableCell>
                <TableCell align="right">Сумма</TableCell>
                <TableCell>Тип</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.map(txn => (
                <TableRow key={txn.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {txn.occurred_at ? new Date(txn.occurred_at).toLocaleDateString('ru-RU') : '—'}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {txn.description_raw || '—'}
                  </TableCell>
                  <TableCell>{txn.counterparty_name || '—'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      color={txn.direction === 'income' ? 'success.main' : txn.direction === 'expense' ? 'error.main' : 'text.primary'}
                    >
                      {txn.direction === 'income' ? '+' : txn.direction === 'expense' ? '−' : ''}
                      {Number(txn.amount).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={DIRECTION_LABELS[txn.direction] || txn.direction}
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', height: 20 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Отвязать от поездки">
                      <IconButton size="small" onClick={() => handleUnlink(txn.id)}>
                        <LinkOff fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Редактировать поездку</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {editError && <Alert severity="error" sx={{ mb: 2 }}>{editError}</Alert>}
          <TextField
            fullWidth label="Название" required
            value={editForm.title || ''}
            onChange={e => setEditForm((p: any) => ({ ...p, title: e.target.value }))}
            sx={{ mb: 2, mt: 1 }}
          />
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <TextField fullWidth label="Страна"
                value={editForm.country || ''}
                onChange={e => setEditForm((p: any) => ({ ...p, country: e.target.value }))}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Город"
                value={editForm.city || ''}
                onChange={e => setEditForm((p: any) => ({ ...p, city: e.target.value }))}
              />
            </Grid>
          </Grid>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <TextField fullWidth label="Дата начала" type="date" required
                value={editForm.start_date || ''}
                onChange={e => setEditForm((p: any) => ({ ...p, start_date: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth label="Дата окончания" type="date"
                value={editForm.end_date || ''}
                onChange={e => setEditForm((p: any) => ({ ...p, end_date: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Базовая валюта</InputLabel>
                <Select value={editForm.base_currency || 'RUB'} label="Базовая валюта"
                  onChange={e => setEditForm((p: any) => ({ ...p, base_currency: e.target.value }))}
                >
                  {CURRENCY_OPTIONS.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Местная валюта</InputLabel>
                <Select value={editForm.local_currency || 'THB'} label="Местная валюта"
                  onChange={e => setEditForm((p: any) => ({ ...p, local_currency: e.target.value }))}
                >
                  {CURRENCY_OPTIONS.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Статус</InputLabel>
            <Select value={editForm.status || 'planned'} label="Статус"
              onChange={e => setEditForm((p: any) => ({ ...p, status: e.target.value }))}
            >
              <MenuItem value="planned">Запланирована</MenuItem>
              <MenuItem value="active">Активна</MenuItem>
              <MenuItem value="completed">Завершена</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth label="Заметки" multiline minRows={2}
            value={editForm.notes || ''}
            onChange={e => setEditForm((p: any) => ({ ...p, notes: e.target.value }))}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditOpen(false)} disabled={editSaving}>Отмена</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={editSaving}>
            {editSaving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Удалить поездку?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Поездка «{trip.title}» будет удалена. Транзакции журнала останутся, но потеряют привязку к поездке.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>Отмена</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Удаление...' : 'Удалить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TripDetailPage;
