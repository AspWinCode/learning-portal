import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import {
  AccessTime as AccessTimeIcon,
  Close as CloseIcon,
  OpenInNew as OpenInNewIcon,
  PushPin as PushPinIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { format, isValid, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { Invoice, Lead, LeadCommunication, LeadStatus, LeadTask } from '../types';

const statusLabels: Record<LeadStatus, string> = {
  new: 'Новый',
  contacted: 'Связались',
  no_answer: 'Недозвон',
  demo: 'Демо',
  invoice_sent: 'Инвойс отправлен',
  won: 'Успешно',
  lost: 'Закрыт',
  thinking: 'Думают',
  refused: 'Отказали',
  trial_scheduled: 'Записали на пробное',
  event_registered: 'Записали на мероприятие',
  decided_immediately: 'Решил заниматься сразу',
};

function badgeColor(status: LeadStatus): 'success' | 'default' | 'info' | 'warning' | 'primary' | 'error' {
  switch (status) {
    case 'won': return 'success';
    case 'lost':
    case 'refused': return 'default';
    case 'invoice_sent': return 'info';
    case 'no_answer':
    case 'demo': return 'warning';
    default: return 'primary';
  }
}

const channelLabels: Record<string, string> = {
  sms: 'SMS',
  telegram: 'Telegram',
  max: 'MAX',
  email: 'Email',
};

interface TimelineItem {
  id: string;
  date: Date;
  type: 'task' | 'communication' | 'lead_created';
  title: string;
  description?: string;
}

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
  onLeadUpdated: _onLeadUpdated,
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
    } catch (err: unknown) {
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
    ? [lead.parent_full_name || lead.contact_name, lead.child_full_name]
        .filter(Boolean)
        .join(' / ') ||
      lead.phone ||
      `Лид #${lead.id}`
    : '';

  const phone = lead ? lead.parent_phone || lead.phone || '' : '';

  // Следующий контакт
  const nextContactDate = lead?.next_contact_at && isValid(parseISO(lead.next_contact_at))
    ? parseISO(lead.next_contact_at) : null;
  const now = new Date();
  const isOverdue = nextContactDate ? nextContactDate.getTime() < now.getTime() : false;
  const isToday = nextContactDate ? nextContactDate.toDateString() === now.toDateString() : false;

  // Ближайшая открытая задача
  const nextTask = useMemo(() => {
    const open = tasks.filter((t) => t.status === 'open' && t.due_at);
    open.sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
    return open[0] || null;
  }, [tasks]);

  // Неоплаченные счета
  const unpaidInvoices = useMemo(
    () => invoices.filter((inv) => inv.status === 'sent' || inv.status === 'overdue'),
    [invoices],
  );

  // Таймлайн: задачи + коммуникации, сортировка по дате убыванию
  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    if (lead) {
      items.push({
        id: `created-${lead.id}`,
        date: parseISO(lead.created_at),
        type: 'lead_created',
        title: 'Лид создан',
        description: lead.source ? `Источник: ${lead.source}` : undefined,
      });
    }
    for (const t of tasks) {
      items.push({
        id: `task-${t.id}`,
        date: parseISO(t.updated_at || t.created_at),
        type: 'task',
        title: t.status === 'done' ? 'Задача выполнена' : 'Задача создана',
        description: t.note || undefined,
      });
    }
    for (const c of communications) {
      items.push({
        id: `comm-${c.id}`,
        date: parseISO(c.created_at),
        type: 'communication',
        title: channelLabels[c.channel] || c.channel,
        description: c.message.length > 80 ? `${c.message.slice(0, 80)}…` : c.message,
      });
    }
    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [lead, tasks, communications]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      scroll="paper"
      PaperProps={{ sx: { maxHeight: '90vh' } }}
    >
      <DialogContent sx={{ p: 0 }}>
        {/* ── Шапка диалога ── */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
        >
          <Button size="small" startIcon={<OpenInNewIcon />} onClick={handleOpenFull}>
            Открыть полную карточку
          </Button>
          <IconButton size="small" onClick={onClose} aria-label="Закрыть">
            <CloseIcon />
          </IconButton>
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
          <>
            {/* ── Блок A: Header ── */}
            <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="h6" noWrap sx={{ fontWeight: 700 }}>
                    {leadName}
                  </Typography>
                  {phone && (
                    <Typography
                      variant="body2"
                      component="a"
                      href={`tel:${phone}`}
                      sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                    >
                      {phone}
                    </Typography>
                  )}
                </Box>
                <Chip
                  size="small"
                  label={statusLabels[lead.status] ?? lead.status}
                  color={badgeColor(lead.status)}
                  sx={{ flexShrink: 0 }}
                />
              </Stack>
              <Stack direction="row" spacing={1.5} sx={{ mt: 0.75 }} flexWrap="wrap">
                {lead.source && (
                  <Typography variant="caption" color="text.secondary">
                    Источник: {lead.source}
                  </Typography>
                )}
                {lead.updated_at && (
                  <Typography variant="caption" color="text.secondary">
                    Обновлён: {format(parseISO(lead.updated_at), 'dd.MM.yyyy')}
                  </Typography>
                )}
              </Stack>
              {/* Бейджи рисков */}
              {(isOverdue || unpaidInvoices.length > 0) && (
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.75 }} flexWrap="wrap">
                  {isOverdue && (
                    <Chip
                      size="small"
                      icon={<WarningIcon />}
                      label="Контакт просрочен"
                      color="error"
                      variant="outlined"
                    />
                  )}
                  {unpaidInvoices.length > 0 && (
                    <Chip
                      size="small"
                      label={`Счёт ожидает оплаты`}
                      color="warning"
                      variant="outlined"
                    />
                  )}
                </Stack>
              )}
            </Box>

            <Divider />

            {/* ── Блок B: Pinned comment ── */}
            {lead.comment && (
              <>
                <Box
                  sx={{
                    mx: 2,
                    my: 1.5,
                    p: 1.25,
                    bgcolor: 'warning.light',
                    borderRadius: 1,
                    borderLeft: '3px solid',
                    borderColor: 'warning.main',
                  }}
                >
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
                    <PushPinIcon sx={{ fontSize: 14, color: 'warning.dark' }} />
                    <Typography variant="caption" color="warning.dark" sx={{ fontWeight: 600 }}>
                      Заметка
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {lead.comment}
                  </Typography>
                </Box>
                <Divider />
              </>
            )}

            {/* ── Блок C: Next Action ── */}
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Следующий шаг
              </Typography>
              {nextContactDate || nextTask ? (
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: isOverdue ? 'error.main' : isToday ? 'warning.main' : 'divider',
                    bgcolor: isOverdue
                      ? 'error.light'
                      : isToday
                      ? 'warning.light'
                      : 'action.hover',
                  }}
                >
                  {nextContactDate && (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <AccessTimeIcon
                        sx={{
                          fontSize: 16,
                          color: isOverdue ? 'error.main' : isToday ? 'warning.dark' : 'text.secondary',
                        }}
                      />
                      <Typography
                        variant="body2"
                        sx={{
                          color: isOverdue ? 'error.main' : isToday ? 'warning.dark' : 'text.primary',
                          fontWeight: isOverdue || isToday ? 600 : 400,
                        }}
                      >
                        {isOverdue
                          ? `Просрочено — ${format(nextContactDate, 'dd MMM, HH:mm', { locale: ru })}`
                          : isToday
                          ? `Сегодня в ${format(nextContactDate, 'HH:mm')}`
                          : format(nextContactDate, 'dd MMM yyyy, HH:mm', { locale: ru })}
                      </Typography>
                    </Stack>
                  )}
                  {nextTask && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: nextContactDate ? 0.5 : 0 }}>
                      Задача: {nextTask.note || '—'}
                      {nextTask.due_at && ` · ${format(parseISO(nextTask.due_at), 'dd.MM HH:mm')}`}
                    </Typography>
                  )}
                </Box>
              ) : (
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 1,
                    border: '1px dashed',
                    borderColor: 'divider',
                    bgcolor: 'action.hover',
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    Следующий шаг не назначен
                  </Typography>
                </Box>
              )}
            </Box>

            <Divider />

            {/* ── Блок D: Timeline preview ── */}
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                История
              </Typography>
              {timeline.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Нет записей
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {timeline.slice(0, 7).map((item) => (
                    <Stack key={item.id} direction="row" spacing={1.5} alignItems="flex-start">
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ minWidth: 72, flexShrink: 0, pt: 0.15 }}
                      >
                        {isValid(item.date)
                          ? format(item.date, 'dd.MM HH:mm')
                          : '—'}
                      </Typography>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                          {item.title}
                        </Typography>
                        {item.description && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block', wordBreak: 'break-word' }}
                          >
                            {item.description}
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  ))}
                  {timeline.length > 7 && (
                    <Typography variant="caption" color="text.secondary">
                      и ещё {timeline.length - 7} событий…
                    </Typography>
                  )}
                </Stack>
              )}
            </Box>

            <Divider />

            {/* ── Кнопка открыть полную карточку ── */}
            <Box sx={{ px: 2, py: 1.5 }}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<OpenInNewIcon />}
                onClick={handleOpenFull}
              >
                Открыть полную карточку для редактирования
              </Button>
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
