import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Add as AddIcon, DoneAll, Payments, ReceiptLong } from '@mui/icons-material';
import { ownerCalculationsApi, type TrainerCalculationRow } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

const getDefaultMonth = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatDecimal = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value || 0);

const formatPeriod = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthNumber - 1, 1),
  );
};

type RateFieldProps = {
  value: number | null;
  disabled?: boolean;
  onChange: (value: number | null) => void;
  onBlur: (value: number | null) => void;
  label: string;
};

const RateField: React.FC<RateFieldProps> = ({ value, disabled, onChange, onBlur, label }) => {
  if (disabled) {
    return (
      <Typography variant="body2" color="text.secondary">
        Не применяется
      </Typography>
    );
  }

  return (
    <TextField
      size="small"
      type="number"
      value={value ?? ''}
      onChange={(e) => {
        const next = e.target.value === '' ? null : Number(e.target.value);
        onChange(Number.isNaN(next) ? null : next);
      }}
      onBlur={(e) => {
        const next = e.target.value === '' ? null : Number(e.target.value);
        if (!Number.isNaN(next)) onBlur(next);
      }}
      inputProps={{ min: 0, step: 0.01 }}
      aria-label={label}
      sx={{
        width: { xs: '100%', sm: 132 },
        '& .MuiOutlinedInput-root': {
          bgcolor: '#fff',
          borderRadius: 2,
        },
      }}
    />
  );
};

const CalculationsPage: React.FC = () => {
  const [month, setMonth] = useState(getDefaultMonth);
  const [rows, setRows] = useState<TrainerCalculationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bonusDialog, setBonusDialog] = useState<{ trainerId: number; fullName: string } | null>(null);
  const [bonusAmount, setBonusAmount] = useState<string>('');
  const [bonusSaving, setBonusSaving] = useState(false);
  const [payingId, setPayingId] = useState<number | null>(null);

  const summary = useMemo(
    () => ({
      trainers: rows.length,
      lessons: rows.reduce((acc, row) => acc + (row.is_individual_format ? 0 : row.lessons_count), 0),
      hours: rows.reduce((acc, row) => acc + (row.is_individual_format ? row.hours_count : 0), 0),
      bonus: rows.reduce((acc, row) => acc + row.bonus, 0),
      total: rows.reduce((acc, row) => acc + row.total_payment, 0),
      unpaid: rows.reduce((acc, row) => acc + (row.already_paid ? 0 : row.total_payment), 0),
      paid: rows.filter((row) => row.already_paid).length,
    }),
    [rows],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ownerCalculationsApi.getTrainers(month);
      setRows(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить расчёты'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddBonus = async () => {
    if (!bonusDialog || bonusAmount === '' || Number.isNaN(Number(bonusAmount))) return;
    setBonusSaving(true);
    setError(null);
    try {
      await ownerCalculationsApi.addBonus(bonusDialog.trainerId, month, Number(bonusAmount));
      setBonusDialog(null);
      setBonusAmount('');
      load();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось добавить премию'));
    } finally {
      setBonusSaving(false);
    }
  };

  const handlePay = async (trainerId: number) => {
    setPayingId(trainerId);
    setError(null);
    try {
      await ownerCalculationsApi.pay(trainerId, month);
      load();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось оформить выплату'));
    } finally {
      setPayingId(null);
    }
  };

  const handleRateBlur = async (
    trainerId: number,
    payload: { rate_per_lesson?: number | null; rate_per_hour?: number | null },
  ) => {
    try {
      await ownerCalculationsApi.updateTrainerRate(trainerId, payload);
      load();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить ставку'));
    }
  };

  const updateRow = (trainerId: number, patch: Partial<TrainerCalculationRow>) => {
    setRows((prev) => prev.map((row) => (row.trainer_id === trainerId ? { ...row, ...patch } : row)));
  };

  const renderActions = (row: TrainerCalculationRow) => (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
      <Button
        size="small"
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={() => setBonusDialog({ trainerId: row.trainer_id, fullName: row.full_name })}
        sx={{ whiteSpace: 'nowrap' }}
      >
        Премия
      </Button>
      {row.already_paid ? (
        <Chip color="success" icon={<DoneAll />} label="Выплачено" variant="outlined" />
      ) : (
        <Button
          size="small"
          variant="contained"
          color="primary"
          disabled={payingId === row.trainer_id}
          onClick={() => handlePay(row.trainer_id)}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {payingId === row.trainer_id ? 'Оформление...' : 'Выплатить'}
        </Button>
      )}
    </Stack>
  );

  return (
    <Layout>
      <Stack spacing={2.5}>
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2, md: 2.5 },
            borderRadius: 3,
            borderColor: 'rgba(15, 23, 42, 0.08)',
            boxShadow: '0 14px 35px rgba(15, 23, 42, 0.06)',
          }}
        >
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', md: 'center' }}
            justifyContent="space-between"
          >
            <Box>
              <Typography variant="h6" fontWeight={900}>
                Расчёты за {formatPeriod(month)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Ставки, премии и выплаты тренерам за выбранный период.
              </Typography>
            </Box>
            <TextField
              label="Период"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value.slice(0, 7))}
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={{
                width: { xs: '100%', sm: 220 },
                '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 2 },
              }}
            />
          </Stack>

          <Box
            sx={{
              mt: 2,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' },
              gap: 1.25,
            }}
          >
            {[
              { label: 'К выплате', value: formatCurrency(summary.total), icon: <Payments color="primary" /> },
              { label: 'Не выплачено', value: formatCurrency(summary.unpaid), icon: <ReceiptLong color="warning" /> },
              { label: 'Премии', value: formatCurrency(summary.bonus), icon: <AddIcon color="success" /> },
              { label: 'Тренеры', value: `${summary.trainers}`, icon: <DoneAll color="action" /> },
            ].map((item) => (
              <Paper
                key={item.label}
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  borderColor: 'rgba(15, 23, 42, 0.08)',
                  bgcolor: 'rgba(248, 250, 252, 0.78)',
                }}
              >
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: '#fff',
                      boxShadow: '0 8px 20px rgba(15, 23, 42, 0.06)',
                    }}
                  >
                    {item.icon}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary">
                      {item.label}
                    </Typography>
                    <Typography variant="h6" fontWeight={900} noWrap>
                      {item.value}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Box>
        </Paper>

        {error && (
          <Alert severity="error" onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Paper
          variant="outlined"
          sx={{
            borderRadius: 3,
            overflow: 'hidden',
            borderColor: 'rgba(15, 23, 42, 0.08)',
            boxShadow: '0 14px 35px rgba(15, 23, 42, 0.06)',
          }}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            justifyContent="space-between"
            sx={{ px: 2, py: 1.75, bgcolor: '#fff' }}
          >
            <Box>
              <Typography variant="subtitle1" fontWeight={900}>
                Тренеры
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Проведено: {summary.lessons} уроков, {formatDecimal(summary.hours)} часов. Выплачено: {summary.paid} из {summary.trainers}.
              </Typography>
            </Box>
          </Stack>
          <Divider />

          {loading ? (
            <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : rows.length === 0 ? (
            <Box sx={{ px: 2, py: 6, textAlign: 'center' }}>
              <Typography fontWeight={800}>Нет тренеров для расчёта</Typography>
              <Typography variant="body2" color="text.secondary">
                Выберите другой период или проверьте настройки тренеров.
              </Typography>
            </Box>
          ) : (
            <>
              <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
                <Table>
                  <TableHead>
                    <TableRow
                      sx={{
                        '& th': {
                          bgcolor: 'rgba(248, 250, 252, 0.95)',
                          color: 'text.secondary',
                          fontWeight: 800,
                          borderBottomColor: 'rgba(15, 23, 42, 0.08)',
                        },
                      }}
                    >
                      <TableCell sx={{ width: 56 }}>№</TableCell>
                      <TableCell>Тренер</TableCell>
                      <TableCell sx={{ width: 150 }}>Ставка за урок</TableCell>
                      <TableCell sx={{ width: 150 }}>Ставка за час</TableCell>
                      <TableCell align="right">Нагрузка</TableCell>
                      <TableCell align="right">Оплата</TableCell>
                      <TableCell align="right">Премия</TableCell>
                      <TableCell align="right">Итого</TableCell>
                      <TableCell sx={{ width: 220 }}>Действия</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row, idx) => (
                      <TableRow key={row.trainer_id} hover sx={{ '& td': { py: 1.5 } }}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={800}>
                            {row.full_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.is_individual_format ? 'Индивидуальный формат' : 'Групповой формат'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <RateField
                            label="Ставка за урок"
                            disabled={row.is_individual_format}
                            value={row.rate_per_lesson}
                            onChange={(value) => updateRow(row.trainer_id, { rate_per_lesson: value })}
                            onBlur={(value) =>
                              handleRateBlur(row.trainer_id, {
                                rate_per_lesson: value,
                                rate_per_hour: row.rate_per_hour,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <RateField
                            label="Ставка за час"
                            value={row.rate_per_hour}
                            onChange={(value) => updateRow(row.trainer_id, { rate_per_hour: value })}
                            onBlur={(value) => handleRateBlur(row.trainer_id, { rate_per_hour: value })}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={800}>
                            {row.is_individual_format ? `${formatDecimal(row.hours_count)} ч` : `${row.lessons_count} уроков`}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{formatCurrency(row.base_payment)}</TableCell>
                        <TableCell align="right">{formatCurrency(row.bonus)}</TableCell>
                        <TableCell align="right">
                          <Typography fontWeight={900}>{formatCurrency(row.total_payment)}</Typography>
                        </TableCell>
                        <TableCell>{renderActions(row)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Stack spacing={1.25} sx={{ display: { xs: 'flex', md: 'none' }, p: 1.25 }}>
                {rows.map((row, idx) => (
                  <Paper key={row.trainer_id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Stack spacing={1.25}>
                      <Stack direction="row" justifyContent="space-between" spacing={1}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="caption" color="text.secondary">
                            № {idx + 1}
                          </Typography>
                          <Typography fontWeight={900}>{row.full_name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.is_individual_format ? 'Индивидуальный формат' : 'Групповой формат'}
                          </Typography>
                        </Box>
                        {row.already_paid ? <Chip color="success" size="small" label="Выплачено" /> : null}
                      </Stack>

                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Оплата
                          </Typography>
                          <Typography fontWeight={800}>{formatCurrency(row.base_payment)}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Итого
                          </Typography>
                          <Typography fontWeight={900}>{formatCurrency(row.total_payment)}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Нагрузка
                          </Typography>
                          <Typography fontWeight={800}>
                            {row.is_individual_format ? `${formatDecimal(row.hours_count)} ч` : `${row.lessons_count} уроков`}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Премия
                          </Typography>
                          <Typography fontWeight={800}>{formatCurrency(row.bonus)}</Typography>
                        </Box>
                      </Box>

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <RateField
                          label="Ставка за урок"
                          disabled={row.is_individual_format}
                          value={row.rate_per_lesson}
                          onChange={(value) => updateRow(row.trainer_id, { rate_per_lesson: value })}
                          onBlur={(value) =>
                            handleRateBlur(row.trainer_id, {
                              rate_per_lesson: value,
                              rate_per_hour: row.rate_per_hour,
                            })
                          }
                        />
                        <RateField
                          label="Ставка за час"
                          value={row.rate_per_hour}
                          onChange={(value) => updateRow(row.trainer_id, { rate_per_hour: value })}
                          onBlur={(value) => handleRateBlur(row.trainer_id, { rate_per_hour: value })}
                        />
                      </Stack>
                      {renderActions(row)}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </>
          )}
        </Paper>
      </Stack>

      <Dialog open={!!bonusDialog} onClose={() => setBonusDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Добавить премию</DialogTitle>
        <DialogContent>
          {bonusDialog && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Тренер: {bonusDialog.fullName}
            </Typography>
          )}
          <TextField
            fullWidth
            label="Сумма премии, ₽"
            type="number"
            value={bonusAmount}
            onChange={(e) => setBonusAmount(e.target.value)}
            inputProps={{ min: 0, step: 0.01 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBonusDialog(null)}>Отмена</Button>
          <Button onClick={handleAddBonus} variant="contained" disabled={bonusSaving || !bonusAmount}>
            {bonusSaving ? 'Сохранение...' : 'Добавить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default CalculationsPage;
