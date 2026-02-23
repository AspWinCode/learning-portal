import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Tab,
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
  status: string;
}

const STATUS_LABELS: Record<string, { label: string; color: 'default' | 'warning' | 'error' | 'success' }> = {
  overdue: { label: 'Просрочено', color: 'error' },
  due_soon: { label: 'Скоро', color: 'warning' },
  ok: { label: 'Оплачено', color: 'success' },
};

const SalesDebtsPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<PaymentStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  const statusFilter = tab === 0 ? undefined : tab === 1 ? 'overdue' : 'due_soon';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await salesApi.getPaymentStatus(statusFilter ? { status: statusFilter } : {});
      setItems(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const formatDate = (d: string | null | undefined) => {
    if (!d) return '—';
    try {
      return format(parseISO(d), 'd MMM yyyy', { locale: ru });
    } catch {
      return d;
    }
  };

  return (
    <Layout>
      <Box sx={{ p: 2 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Долги и оплаты
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Ученики с датой следующей оплаты. Просрочено — дата оплаты прошла; Скоро — в ближайшие 3 дня.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
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
                  <TableCell>Дата следующей оплаты</TableCell>
                  <TableCell>Начало периода</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.student_id} hover>
                    <TableCell>{row.student_name}</TableCell>
                    <TableCell>{formatDate(row.next_payment_date)}</TableCell>
                    <TableCell>{formatDate(row.learning_period_start)}</TableCell>
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
                ))}
              </TableBody>
            </Table>
            {items.length === 0 && (
              <CardContent>
                <Typography color="text.secondary">
                  {statusFilter === 'overdue' ? 'Нет просроченных оплат.' : statusFilter === 'due_soon' ? 'Нет оплат в ближайшие 3 дня.' : 'Нет данных о датах оплаты. Даты задаются при пополнении счёта.'}
                </Typography>
              </CardContent>
            )}
          </Card>
        )}
      </Box>
    </Layout>
  );
};

export default SalesDebtsPage;
