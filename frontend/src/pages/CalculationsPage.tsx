import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { ownerCalculationsApi, type TrainerCalculationRow } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

const getDefaultMonth = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
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
    payload: { rate_per_lesson?: number | null; rate_per_hour?: number | null }
  ) => {
    try {
      await ownerCalculationsApi.updateTrainerRate(trainerId, payload);
      load();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить ставку'));
    }
  };

  return (
    <Layout>
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h4">Расчёты</Typography>
        <TextField
          label="Период"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value.slice(0, 7))}
          InputLabelProps={{ shrink: true }}
          size="small"
          sx={{ width: 160 }}
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Тренеры
      </Typography>

      {loading ? (
        <Typography color="text.secondary">Загрузка...</Typography>
      ) : (
        <Paper>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>№</TableCell>
                <TableCell>Тренер</TableCell>
                <TableCell>Ставка за урок</TableCell>
                <TableCell>Ставка за час</TableCell>
                <TableCell>Проведенные уроки</TableCell>
                <TableCell>Часы</TableCell>
                <TableCell>Оплата</TableCell>
                <TableCell>Премия</TableCell>
                <TableCell>Итог по оплате</TableCell>
                <TableCell>Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow key={row.trainer_id}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>{row.full_name}</TableCell>
                  <TableCell>
                    {row.is_individual_format ? (
                      '—'
                    ) : (
                      <TextField
                        size="small"
                        type="number"
                        value={row.rate_per_lesson ?? ''}
                        onChange={(e) => {
                          const v = e.target.value === '' ? null : Number(e.target.value);
                          setRows((prev) =>
                            prev.map((r) =>
                              r.trainer_id === row.trainer_id ? { ...r, rate_per_lesson: v } : r
                            )
                          );
                        }}
                        onBlur={(e) => {
                          const v = e.target.value === '' ? null : Number((e.target as HTMLInputElement).value);
                          if (Number.isNaN(v)) return;
                          handleRateBlur(row.trainer_id, {
                            rate_per_lesson: v,
                            rate_per_hour: row.rate_per_hour,
                          });
                        }}
                        inputProps={{ min: 0, step: 0.01 }}
                        sx={{ width: 100 }}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      value={row.rate_per_hour ?? ''}
                      onChange={(e) => {
                        const v = e.target.value === '' ? null : Number(e.target.value);
                        setRows((prev) =>
                          prev.map((r) =>
                            r.trainer_id === row.trainer_id ? { ...r, rate_per_hour: v } : r
                          )
                        );
                      }}
                      onBlur={(e) => {
                        const v = e.target.value === '' ? null : Number((e.target as HTMLInputElement).value);
                        if (Number.isNaN(v)) return;
                        handleRateBlur(row.trainer_id, {
                          rate_per_hour: v,
                        });
                      }}
                      inputProps={{ min: 0, step: 0.01 }}
                      sx={{ width: 100 }}
                    />
                  </TableCell>
                  <TableCell>{row.is_individual_format ? '—' : row.lessons_count}</TableCell>
                  <TableCell>{row.is_individual_format ? row.hours_count : '—'}</TableCell>
                  <TableCell>{row.base_payment.toFixed(2)} ₽</TableCell>
                  <TableCell>{row.bonus.toFixed(2)} ₽</TableCell>
                  <TableCell>{row.total_payment.toFixed(2)} ₽</TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => setBonusDialog({ trainerId: row.trainer_id, fullName: row.full_name })}
                      sx={{ mr: 1 }}
                    >
                      Добавить премию
                    </Button>
                    {row.already_paid ? (
                      <Typography variant="body2" color="success.main">
                        Выплачено
                      </Typography>
                    ) : (
                      <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        disabled={payingId === row.trainer_id}
                        onClick={() => handlePay(row.trainer_id)}
                      >
                        {payingId === row.trainer_id ? 'Оформление...' : 'Выплатить'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Dialog open={!!bonusDialog} onClose={() => setBonusDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Добавить премию</DialogTitle>
        <DialogContent>
          {bonusDialog && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
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
