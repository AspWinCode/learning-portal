import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Chip, Grid, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, Button } from '@mui/material';
import { LegoShell } from './LegoShell';
import {
  formatDate,
  formatMoney,
  getStudent,
  LegoStudentCard,
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUS_LABEL,
  registerPayment,
  setPaymentPlan,
} from './legoApi';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission } from '../../utils/permissions';

const newPayKey = () => `lego-pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <Grid item xs={12} sm={6}>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography>{value || '—'}</Typography>
  </Grid>
);

// Карточка LEGO-ребёнка. Не ведёт в академическую карточку Student.
const LegoStudentCardPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canMoney = hasPermission(user, 'lego.payments_manage');
  const [card, setCard] = useState<LegoStudentCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [planAmount, setPlanAmount] = useState('');
  const [saving, setSaving] = useState(false);
  // Ключ идемпотентности живёт, пока форма не отправлена успешно: двойной клик не создаст вторую проводку.
  const payKey = useRef<string>(newPayKey());

  const load = useCallback(() => {
    getStudent(Number(id))
      .then((d) => {
        setCard(d);
        setPlanAmount(d.payments?.plan.payment_amount?.toString() ?? '');
      })
      .catch(() => setError('Ребёнок не найден или недоступен'));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const onPay = async () => {
    const value = Number(amount);
    if (!value || value <= 0 || !card || saving) return;
    setSaving(true);
    try {
      await registerPayment(card.id, { amount: value, idempotency_key: payKey.current });
      setAmount('');
      payKey.current = newPayKey();
      load();
    } catch {
      setError('Не удалось зарегистрировать оплату');
    } finally {
      setSaving(false);
    }
  };

  const onPlanSave = async () => {
    if (!card) return;
    await setPaymentPlan(card.id, { payment_amount: planAmount ? Number(planAmount) : null });
    load();
  };

  if (error) return <LegoShell title="Карточка"><Alert severity="error">{error}</Alert></LegoShell>;
  if (!card) return <LegoShell title="Карточка"><Typography>Загрузка…</Typography></LegoShell>;

  return (
    <LegoShell title={card.full_name}>
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>Основное</Typography>
        <Grid container spacing={2}>
          <Field label="ФИО" value={card.full_name} />
          <Field label="Дата рождения" value={formatDate(card.birth_date)} />
          <Field label="Родитель" value={card.parent_name} />
          <Field label="Телефон" value={card.parent_phone} />
          <Field label="Доп. телефон" value={card.secondary_phone} />
          <Field label="Дата начала" value={formatDate(card.start_date)} />
          <Field label="Группа" value={card.group_name} />
          <Field label="Статус" value={card.status === 'active' ? 'Активен' : 'В архиве'} />
          <Field label="Комментарий" value={card.comment} />
        </Grid>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>Посещаемость</Typography>
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <Chip label={`Занятий: ${card.attendance.total}`} />
          <Chip color="success" label={`Посещено: ${card.attendance.attended}`} />
          <Chip color="default" label={`Пропущено: ${card.attendance.missed}`} />
        </Stack>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Дата</TableCell>
              <TableCell>Группа</TableCell>
              <TableCell>Пришёл</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {card.attendance.history.map((h) => (
              <TableRow key={`${h.lesson_id}`}>
                <TableCell>{formatDate(h.date)}</TableCell>
                <TableCell>{h.group_name}</TableCell>
                <TableCell>{h.attended ? 'Да' : 'Нет'}</TableCell>
              </TableRow>
            ))}
            {card.attendance.history.length === 0 && (
              <TableRow><TableCell colSpan={3}><Typography color="text.secondary">Занятий пока нет</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {card.payments && canMoney && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>Оплаты</Typography>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap' }}>
            <Chip color={PAYMENT_STATUS_COLOR[card.payments.status.status]} label={PAYMENT_STATUS_LABEL[card.payments.status.status]} />
            <Typography variant="body2">Тариф: {formatMoney(card.payments.plan.payment_amount)} / месяц</Typography>
            <Typography variant="body2">Оплачено до: {formatDate(card.payments.plan.paid_until)}</Typography>
            <Typography variant="body2">Следующая оплата: {formatDate(card.payments.plan.next_payment_date)}</Typography>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
            <TextField size="small" type="number" label="Сумма оплаты" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Button variant="contained" onClick={onPay} disabled={!amount || saving}>Зарегистрировать оплату</Button>
            <TextField size="small" type="number" label="Тариф, ₽/мес" value={planAmount} onChange={(e) => setPlanAmount(e.target.value)} />
            <Button variant="outlined" onClick={onPlanSave}>Сохранить тариф</Button>
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Дата</TableCell>
                <TableCell>Период</TableCell>
                <TableCell>Сумма</TableCell>
                <TableCell>Проводка</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {card.payments.history.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatDate(p.payment_date)}</TableCell>
                  <TableCell>{formatDate(p.period_start)} — {formatDate(p.period_end)}</TableCell>
                  <TableCell>{formatMoney(p.amount)}</TableCell>
                  <TableCell>{p.finance_transaction_id ? `#${p.finance_transaction_id}` : '—'}</TableCell>
                </TableRow>
              ))}
              {card.payments.history.length === 0 && (
                <TableRow><TableCell colSpan={4}><Typography color="text.secondary">Оплат пока нет</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}
    </LegoShell>
  );
};

export default LegoStudentCardPage;
