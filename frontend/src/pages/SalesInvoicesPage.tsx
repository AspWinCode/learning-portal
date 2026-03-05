import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { format, isValid, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { salesApi } from '../services/api';
import { Invoice, Lead } from '../types';
import { extractApiError } from '../utils/extractApiError';

const invoiceStatusLabels: Record<Invoice['status'], string> = {
  draft: 'Черновик',
  sent: 'Отправлен',
  paid: 'Оплачен',
  overdue: 'Просрочен',
  cancelled: 'Отменен',
};
const invoiceStatusOrder: Invoice['status'][] = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

const getInvoiceStatusChipColor = (
  status: Invoice['status']
): 'default' | 'success' | 'warning' | 'info' => {
  switch (status) {
    case 'paid':
      return 'success';
    case 'overdue':
      return 'warning';
    case 'sent':
      return 'info';
    default:
      return 'default';
  }
};

export const SalesInvoicesPageContent: React.FC = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'' | Invoice['status']>('');
  const [leadFilter, setLeadFilter] = useState<number | ''>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const leadMap = useMemo(() => {
    const m = new Map<number, Lead>();
    leads.forEach((l) => m.set(l.id, l));
    return m;
  }, [leads]);

  const totals = useMemo(() => {
    return invoices.reduce(
      (acc, inv) => {
        acc.total += 1;
        if (inv.status === 'paid') acc.paid += 1;
        if (inv.status === 'overdue') acc.overdue += 1;
        acc.amount += Number(inv.amount || 0);
        return acc;
      },
      { total: 0, paid: 0, overdue: 0, amount: 0 }
    );
  }, [invoices]);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [invoiceData, leadData] = await Promise.all([
        salesApi.listAllInvoices({
          status_filter: statusFilter || undefined,
          lead_id: leadFilter || undefined,
          created_from: fromDate ? new Date(fromDate).toISOString() : undefined,
          created_to: toDate ? new Date(toDate).toISOString() : undefined,
        }),
        salesApi.listLeads(),
      ]);
      setInvoices(invoiceData);
      setLeads(leadData);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить инвойсы'));
    }
  }, [statusFilter, leadFilter, fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">Инвойсы</Typography>
        <Button variant="outlined" onClick={loadData}>Обновить</Button>
      </Stack>

      <Stack direction="row" spacing={1.5} mb={2} flexWrap="wrap">
        <Card variant="outlined" sx={{ minWidth: 180 }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary">Всего</Typography>
            <Typography variant="h5">{totals.total}</Typography>
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ minWidth: 180 }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary">Оплачено</Typography>
            <Typography variant="h5" color="success.main">{totals.paid}</Typography>
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ minWidth: 180 }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary">Просрочено</Typography>
            <Typography variant="h5" color="warning.main">{totals.overdue}</Typography>
          </CardContent>
        </Card>
        <Card variant="outlined" sx={{ minWidth: 220 }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary">Сумма (по выборке)</Typography>
            <Typography variant="h5">{totals.amount.toFixed(2)}</Typography>
          </CardContent>
        </Card>
      </Stack>

      <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="invoice-status-filter">Статус</InputLabel>
          <Select
            labelId="invoice-status-filter"
            label="Статус"
            value={statusFilter}
            onChange={(e) => setStatusFilter((e.target.value as Invoice['status']) || '')}
            renderValue={(value) =>
              value ? (
                <Chip
                  size="small"
                  color={getInvoiceStatusChipColor(value as Invoice['status'])}
                  label={invoiceStatusLabels[value as Invoice['status']]}
                />
              ) : (
                'Все'
              )
            }
          >
            <MenuItem value="">Все</MenuItem>
            {invoiceStatusOrder.map((status) => (
              <MenuItem key={status} value={status}>
                <Chip
                  size="small"
                  color={getInvoiceStatusChipColor(status)}
                  label={invoiceStatusLabels[status]}
                />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="invoice-lead-filter">Лид</InputLabel>
          <Select
            labelId="invoice-lead-filter"
            label="Лид"
            value={leadFilter}
            onChange={(e) => setLeadFilter((e.target.value as number) || '')}
          >
            <MenuItem value="">Все</MenuItem>
            {leads.map((lead) => (
              <MenuItem key={lead.id} value={lead.id}>
                {lead.contact_name} ({lead.phone})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          type="date"
          label="С даты"
          InputLabelProps={{ shrink: true }}
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <TextField
          size="small"
          type="date"
          label="По дату"
          InputLabelProps={{ shrink: true }}
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            <TableCell>Лид</TableCell>
            <TableCell>Сумма</TableCell>
            <TableCell>Статус</TableCell>
            <TableCell>Email</TableCell>
            <TableCell>Создан</TableCell>
            <TableCell>Отправлен</TableCell>
            <TableCell>Оплачен</TableCell>
            <TableCell align="right">Действие</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {invoices.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell>#{inv.id}</TableCell>
              <TableCell>{leadMap.get(inv.lead_id)?.contact_name || `Lead #${inv.lead_id}`}</TableCell>
              <TableCell>{inv.amount} {inv.currency}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  color={getInvoiceStatusChipColor(inv.status)}
                  label={invoiceStatusLabels[inv.status] || inv.status}
                />
              </TableCell>
              <TableCell>{inv.email_to || '—'}</TableCell>
              <TableCell>
                {(() => {
                  const d = parseISO(inv.created_at);
                  return isValid(d) ? format(d, 'dd.MM.yyyy HH:mm') : inv.created_at;
                })()}
              </TableCell>
              <TableCell>
                {inv.sent_at
                  ? (() => {
                      const d = parseISO(inv.sent_at);
                      return isValid(d) ? format(d, 'dd.MM.yyyy HH:mm') : inv.sent_at;
                    })()
                  : '—'}
              </TableCell>
              <TableCell>
                {inv.paid_at
                  ? (() => {
                      const d = parseISO(inv.paid_at);
                      return isValid(d) ? format(d, 'dd.MM.yyyy HH:mm') : inv.paid_at;
                    })()
                  : '—'}
              </TableCell>
              <TableCell align="right">
                <Button
                  size="small"
                  variant="text"
                  onClick={() => navigate(`/sales/leads?leadId=${inv.lead_id}`)}
                >
                  К лиду
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {invoices.length === 0 && (
            <TableRow>
              <TableCell colSpan={9}>
                <Typography color="text.secondary">Инвойсов пока нет</Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </>
  );
};

const SalesInvoicesPage: React.FC = () => (
  <Layout>
    <SalesInvoicesPageContent />
  </Layout>
);

export default SalesInvoicesPage;
