import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { LegoShell } from './LegoShell';
import { formatDate, formatMoney, getPaymentSummary, LegoDebtSummary, listPayments, listStudents, LegoStudent, registerPayment } from './legoApi';

const newPayKey = () => `lego-pay-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// Оплаты LEGO. Проводка уходит в общий finance-журнал с target `leninets`.
const LegoPaymentsPage: React.FC = () => {
  const [payments, setPayments] = useState<Awaited<ReturnType<typeof listPayments>>>([]);
  const [students, setStudents] = useState<LegoStudent[]>([]);
  const [summary, setSummary] = useState<{ revenue_this_month: number; summary: LegoDebtSummary } | null>(null);
  const [studentId, setStudentId] = useState('');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Ключ идемпотентности живёт до успешной отправки: повторный клик не создаёт вторую проводку.
  const payKey = useRef<string>(newPayKey());

  const load = () => {
    listPayments().then(setPayments).catch(() => setError('Не удалось загрузить оплаты'));
    getPaymentSummary().then(setSummary).catch(() => undefined);
  };

  useEffect(() => {
    load();
    listStudents().then(setStudents).catch(() => undefined);
  }, []);

  const onPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      const res = await registerPayment(Number(studentId), {
        amount: Number(amount),
        comment: comment || undefined,
        idempotency_key: payKey.current,
      });
      setMessage(res.created ? 'Оплата зарегистрирована' : 'Оплата уже была зарегистрирована');
      setAmount('');
      setComment('');
      payKey.current = newPayKey();
      load();
    } catch {
      setError('Не удалось зарегистрировать оплату');
    } finally {
      setSaving(false);
    }
  };

  return (
    <LegoShell title="Оплаты">
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      {summary && (
        <Typography variant="body1" sx={{ mb: 2 }}>
          Выручка за текущий месяц: <b>{formatMoney(summary.revenue_this_month)}</b> · Ожидаемая задолженность: <b>{formatMoney(summary.summary.expected_debt_amount)}</b>
        </Typography>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }} component="form" onSubmit={onPay}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>Зарегистрировать оплату</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ flexWrap: 'wrap' }}>
          <TextField size="small" select SelectProps={{ native: true }} label="Ребёнок" value={studentId} onChange={(e) => setStudentId(e.target.value)} required sx={{ minWidth: 240 }}>
            <option value="">Выберите ребёнка</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </TextField>
          <TextField size="small" type="number" label="Сумма, ₽" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <TextField size="small" label="Комментарий" value={comment} onChange={(e) => setComment(e.target.value)} />
          <Button type="submit" variant="contained" disabled={!studentId || !amount || saving}>Провести оплату</Button>
        </Stack>
      </Paper>

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Дата</TableCell>
              <TableCell>Ребёнок</TableCell>
              <TableCell align="right">Сумма</TableCell>
              <TableCell>Оплачено до</TableCell>
              <TableCell>Проводка</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{formatDate(p.payment_date)}</TableCell>
                <TableCell>{p.student_name}</TableCell>
                <TableCell align="right">{formatMoney(p.amount)}</TableCell>
                <TableCell>{formatDate(p.paid_until)}</TableCell>
                <TableCell>{p.finance_transaction_id ? `#${p.finance_transaction_id}` : '—'}</TableCell>
              </TableRow>
            ))}
            {payments.length === 0 && (
              <TableRow><TableCell colSpan={5}><Typography color="text.secondary">Оплат пока нет</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </LegoShell>
  );
};

export default LegoPaymentsPage;
