import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import Layout from '../components/Layout';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

interface PaymentStatusRow {
  student_id: number;
  student_name: string;
  card_id?: number;
  next_payment_date?: string | null;
  learning_period_start?: string | null;
  lessons_since_payment?: number;
  status: string;
}

const LESSON_THRESHOLD = 8;

const STATUS_LABELS: Record<string, { label: string; color: 'default' | 'warning' | 'error' | 'success' | 'info' }> = {
  overdue: { label: 'Просрочено', color: 'error' },
  due_soon: { label: 'Скоро', color: 'warning' },
  ok: { label: 'Оплачено', color: 'success' },
  unpaid: { label: 'Не оплачено', color: 'warning' },
};

const SalesDebtsPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<PaymentStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [paymentSummary, setPaymentSummary] = useState<{ overdue_3_count: number; overdue_10_count: number } | null>(null);

  const statusFilter = tab === 0 ? undefined : tab === 1 ? 'overdue' : tab === 2 ? 'due_soon' : undefined;

  const loadDebts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await salesApi.getPaymentStatus(statusFilter ? { status: statusFilter } : {});
      setItems(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить оплаты'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const loadPaymentSummary = useCallback(async () => {
    try {
      const data = await salesApi.getPaymentStatusSummary();
      setPaymentSummary(data);
    } catch {
      setPaymentSummary(null);
    }
  }, []);

  useEffect(() => {
    void loadDebts();
    void loadPaymentSummary();
  }, [loadDebts, loadPaymentSummary]);

  const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    try {
      return format(parseISO(d), 'd MMM yyyy', { locale: ru });
    } catch {
      return d;
    }
  };

  const emptyText =
    statusFilter === 'overdue'
      ? 'Нет просроченных оплат.'
      : statusFilter === 'due_soon'
        ? 'Нет оплат в ближайшие 3 дня.'
        : 'Нет данных. Оплата запрашивается автоматически после 8 посещённых уроков.';

  return (
    <Layout>
      <Box sx={{ p: 2 }}>
        <Typography variant="h5" sx={{ mb: 1 }}>
          Долги и оплаты
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Ученик появляется здесь с первого урока, если оплата за период не поступила.
          Оплата закрывает текущий период (8 уроков). После 8 уроков — нужна следующая оплата.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
            KPI:
          </Typography>
          <Chip
            label={`Долгов 3+ дней: ${paymentSummary?.overdue_3_count ?? '—'}`}
            color={paymentSummary && paymentSummary.overdue_3_count > 0 ? 'warning' : 'default'}
            variant="outlined"
            sx={{ fontWeight: 500 }}
          />
          <Chip
            label={`Долгов 10+ дней: ${paymentSummary?.overdue_10_count ?? '—'}`}
            color={paymentSummary && paymentSummary.overdue_10_count > 0 ? 'error' : 'default'}
            variant="outlined"
            sx={{ fontWeight: 500 }}
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
          <Tab label="Все" />
          <Tab label="Просрочено" />
          <Tab label="Скоро (3 дня)" />
        </Tabs>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Card variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Ученик</TableCell>
                  <TableCell>Уроков в периоде</TableCell>
                  <TableCell>Начало периода</TableCell>
                  <TableCell>Дата следующей оплаты</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((row) => {
                  const lessons = row.lessons_since_payment ?? 0;
                  const pct = Math.min(100, Math.round((lessons / LESSON_THRESHOLD) * 100));
                  const overThreshold = lessons > LESSON_THRESHOLD;
                  return (
                    <TableRow key={row.student_id} hover>
                      <TableCell sx={{ fontWeight: 500 }}>{row.student_name}</TableCell>
                      <TableCell sx={{ minWidth: 160 }}>
                        <Tooltip title={`${lessons} из ${LESSON_THRESHOLD} уроков`}>
                          <Box>
                            <Typography variant="caption" color={overThreshold ? 'error' : 'text.secondary'}>
                              {lessons} / {LESSON_THRESHOLD} уроков
                            </Typography>
                            <LinearProgress
                              variant="determinate"
                              value={pct}
                              color={overThreshold ? 'error' : lessons >= LESSON_THRESHOLD ? 'warning' : 'primary'}
                              sx={{ height: 6, borderRadius: 3, mt: 0.3 }}
                            />
                          </Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell>{formatDate(row.learning_period_start)}</TableCell>
                      <TableCell>{formatDate(row.next_payment_date)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={STATUS_LABELS[row.status]?.label ?? row.status}
                          color={STATUS_LABELS[row.status]?.color ?? 'default'}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography
                          component="button"
                          variant="body2"
                          color="primary"
                          sx={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                          onClick={() => navigate(`/students?detail=${row.student_id}`)}
                        >
                          Карточка
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {items.length === 0 && (
              <CardContent>
                <Typography color="text.secondary">{emptyText}</Typography>
              </CardContent>
            )}
          </Card>
        )}
      </Box>
    </Layout>
  );
};

export default SalesDebtsPage;
