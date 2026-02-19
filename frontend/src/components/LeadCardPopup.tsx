import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import { format, isValid, parseISO } from 'date-fns';
import { Close as CloseIcon, OpenInNew } from '@mui/icons-material';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { Lead, LeadTask, Invoice, LeadCommunication } from '../types';

const statusLabels: Record<string, string> = {
  new: 'Новый',
  contacted: 'Связались',
  no_answer: 'Недозвон',
  demo: 'Демо',
  invoice_sent: 'Инвойс отправлен',
  won: 'Успешно',
  lost: 'Закрыт',
};

interface LeadCardPopupProps {
  leadId: number | null;
  open: boolean;
  onClose: () => void;
  onLeadUpdated?: () => void;
}

export const LeadCardPopup: React.FC<LeadCardPopupProps> = ({
  leadId,
  open,
  onClose,
  onLeadUpdated,
}) => {
  const navigate = useNavigate();
  const [lead, setLead] = useState<Lead | null>(null);
  const [tasks, setTasks] = useState<LeadTask[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [communications, setCommunications] = useState<LeadCommunication[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetails = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    try {
      const [leadData, tasksData, invoicesData, commData] = await Promise.all([
        salesApi.getLead(leadId),
        salesApi.listTasks(leadId),
        salesApi.listInvoices(leadId),
        salesApi.listLeadCommunications(leadId),
      ]);
      setLead(leadData);
      setTasks(tasksData);
      setInvoices(invoicesData);
      setCommunications(commData);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить карточку'));
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (open && leadId) {
      loadDetails();
    } else {
      setLead(null);
      setTasks([]);
      setInvoices([]);
      setCommunications([]);
      setError(null);
    }
  }, [open, leadId, loadDetails]);

  const handleOpenFull = () => {
    if (leadId) {
      navigate(`/sales/leads?open=${leadId}`);
      onClose();
    }
  };

  const leadName = lead
    ? [lead.parent_full_name || lead.contact_name, lead.child_full_name].filter(Boolean).join(' / ') || lead.phone || `Лид #${lead.id}`
    : '';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
      PaperProps={{ sx: { maxHeight: '90vh' } }}
    >
      <DialogContent sx={{ p: 0 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">Карточка лида</Typography>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Button size="small" startIcon={<OpenInNew />} onClick={handleOpenFull}>
              Открыть полную карточку
            </Button>
            <IconButton size="small" onClick={onClose} aria-label="Закрыть">
              <CloseIcon />
            </IconButton>
          </Stack>
        </Stack>

        {loading && (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            Загрузка…
          </Typography>
        )}

        {error && (
          <Typography color="error" sx={{ p: 2 }}>
            {error}
          </Typography>
        )}

        {!loading && !error && lead && (
          <Stack spacing={2} sx={{ p: 2 }}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">Контакт</Typography>
                <Typography variant="body1">{leadName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {lead.parent_phone || lead.phone || '—'}
                  {lead.email ? ` • ${lead.email}` : ''}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Chip size="small" label={statusLabels[lead.status] ?? lead.status} />
                </Stack>
                {lead.comment && (
                  <Typography variant="body2" sx={{ mt: 1 }}>{lead.comment}</Typography>
                )}
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">Задачи ({tasks.length})</Typography>
                {tasks.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">Нет задач</Typography>
                ) : (
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {tasks.slice(0, 5).map((t) => (
                      <Stack key={t.id} direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2">{t.note || '—'}</Typography>
                        <Chip size="small" label={t.status === 'open' ? 'Открыта' : 'Закрыта'} color={t.status === 'open' ? 'default' : 'success'} />
                        {t.due_at && (
                          <Typography variant="caption" color="text.secondary">
                            {isValid(parseISO(t.due_at)) ? format(parseISO(t.due_at), 'dd.MM HH:mm') : t.due_at}
                          </Typography>
                        )}
                      </Stack>
                    ))}
                    {tasks.length > 5 && (
                      <Typography variant="caption" color="text.secondary">и ещё {tasks.length - 5}</Typography>
                    )}
                  </Stack>
                )}
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">Инвойсы ({invoices.length})</Typography>
                {invoices.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">Нет инвойсов</Typography>
                ) : (
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {invoices.map((inv) => (
                      <Stack key={inv.id} direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2">{inv.amount} {inv.currency}</Typography>
                        <Chip size="small" label={inv.status} />
                      </Stack>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">Коммуникации ({communications.length})</Typography>
                {communications.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">Нет</Typography>
                ) : (
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {communications.slice(0, 3).map((c) => (
                      <Typography key={c.id} variant="body2" noWrap sx={{ maxWidth: '100%' }}>
                        [{c.channel}] {c.message}
                      </Typography>
                    ))}
                    {communications.length > 3 && (
                      <Typography variant="caption" color="text.secondary">и ещё {communications.length - 3}</Typography>
                    )}
                  </Stack>
                )}
              </CardContent>
            </Card>

            <Button fullWidth variant="outlined" startIcon={<OpenInNew />} onClick={handleOpenFull} sx={{ mt: 1 }}>
              Открыть полную карточку для редактирования
            </Button>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
};
