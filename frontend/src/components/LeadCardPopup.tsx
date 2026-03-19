import React, { useCallback, useEffect, useState } from 'react';
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
  TextField,
  Typography,
} from '@mui/material';
import {
  AccessTime as AccessTimeIcon,
  Call as CallIcon,
  Close as CloseIcon,
  OpenInNew as OpenInNewIcon,
  PhoneDisabled as PhoneDisabledIcon,
  PushPin as PushPinIcon,
  Receipt as ReceiptIcon,
  Send as SendIcon,
  Schedule as ScheduleIcon,
  ThumbDown as ThumbDownIcon,
  ThumbUp as ThumbUpIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { format, isValid, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type {
  LeadActivity,
  LeadCardResponse,
  LeadNextAction,
  LeadStatus,
  QuickActionType,
} from '../types';

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

function badgeColor(status: LeadStatus): 'success' | 'default' | 'info' | 'warning' | 'primary' {
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

const activityTypeLabels: Record<string, string> = {
  lead_created: 'Лид создан',
  call: 'Звонок',
  called: 'Дозвонились',
  no_answer: 'Не дозвонились',
  message: 'Сообщение',
  sent_info: 'Отправлена информация',
  task_created: 'Задача создана',
  task_done: 'Задача выполнена',
  invoice_created: 'Создан счёт',
  invoice_paid: 'Оплата получена',
  status_changed: 'Статус изменён',
  comment_added: 'Комментарий',
  schedule_contact: 'Назначен контакт',
  payment_received: 'Оплата получена',
  refused: 'Отказ',
  enrolled: 'Успешно записан',
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
  const [card, setCard] = useState<LeadCardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Quick Action form state
  const [qaComment, setQaComment] = useState('');
  const [qaNextContact, setQaNextContact] = useState('');
  const [qaLostReason, setQaLostReason] = useState('');
  const [qaExpandedAction, setQaExpandedAction] = useState<QuickActionType | null>(null);

  const loadCard = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await salesApi.getLeadCard(leadId);
      setCard(data);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить карточку'));
      setCard(null);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (open && leadId) {
      loadCard();
      setActionFeedback(null);
      setQaExpandedAction(null);
      setQaComment('');
      setQaNextContact('');
      setQaLostReason('');
    } else {
      setCard(null);
      setError(null);
    }
  }, [open, leadId, loadCard]);

  const handleOpenFull = () => {
    if (leadId) {
      navigate(`/sales/leads?open=${leadId}`);
      onClose();
    }
  };

  const executeQuickAction = async (action: QuickActionType, extra?: Record<string, unknown>) => {
    if (!leadId) return;
    setActionLoading(true);
    setActionFeedback(null);
    try {
      const result = await salesApi.leadQuickAction(leadId, {
        action,
        comment: qaComment || undefined,
        next_contact_at: qaNextContact || undefined,
        lost_reason: action === 'refused' ? (qaLostReason || undefined) : undefined,
        ...extra,
      });
      setActionFeedback(
        result.new_status
          ? `${result.message} → ${statusLabels[result.new_status as LeadStatus] ?? result.new_status}`
          : result.message,
      );
      setQaExpandedAction(null);
      setQaComment('');
      setQaNextContact('');
      setQaLostReason('');
      await loadCard();
      onLeadUpdated?.();
    } catch (err: unknown) {
      setActionFeedback(extractApiError(err, 'Ошибка'));
    } finally {
      setActionLoading(false);
    }
  };

  const lead = card?.lead;
  const leadName = lead
    ? [lead.parent_full_name || lead.contact_name, lead.child_full_name]
        .filter(Boolean)
        .join(' / ') ||
      lead.phone ||
      `Лид #${lead.id}`
    : '';
  const phone = lead ? lead.parent_phone || lead.phone || '' : '';
  const nextAction: LeadNextAction | null = card?.next_action ?? null;

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
          <Typography color="text.secondary" sx={{ p: 2 }}>Загрузка…</Typography>
        )}
        {error && (
          <Typography color="error" sx={{ p: 2 }}>{error}</Typography>
        )}

        {!loading && !error && lead && card && (
          <>
            {/* ── Блок A: Header ── */}
            <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="h6" noWrap sx={{ fontWeight: 700 }}>{leadName}</Typography>
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
              {(nextAction?.is_overdue || (card.sidebar.unpaid_invoices_count > 0)) && (
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.75 }} flexWrap="wrap">
                  {nextAction?.is_overdue && (
                    <Chip size="small" icon={<WarningIcon />} label="Контакт просрочен" color="error" variant="outlined" />
                  )}
                  {card.sidebar.unpaid_invoices_count > 0 && (
                    <Chip size="small" label="Счёт ожидает оплаты" color="warning" variant="outlined" />
                  )}
                </Stack>
              )}
            </Box>

            <Divider />

            {/* ── Блок B: Pinned comment ── */}
            {card.pinned_comment && (
              <>
                <Box sx={{ mx: 2, my: 1.5, p: 1.25, bgcolor: 'warning.light', borderRadius: 1, borderLeft: '3px solid', borderColor: 'warning.main' }}>
                  <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
                    <PushPinIcon sx={{ fontSize: 14, color: 'warning.dark' }} />
                    <Typography variant="caption" color="warning.dark" sx={{ fontWeight: 600 }}>Заметка</Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{card.pinned_comment}</Typography>
                </Box>
                <Divider />
              </>
            )}

            {/* ── Блок C: Next Action ── */}
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Следующий шаг</Typography>
              {nextAction ? (
                <Box
                  sx={{
                    p: 1.5, borderRadius: 1, border: '1px solid',
                    borderColor: nextAction.is_overdue ? 'error.main' : nextAction.is_today ? 'warning.main' : 'divider',
                    bgcolor: nextAction.is_overdue ? 'error.light' : nextAction.is_today ? 'warning.light' : 'action.hover',
                  }}
                >
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <AccessTimeIcon sx={{ fontSize: 16, color: nextAction.is_overdue ? 'error.main' : nextAction.is_today ? 'warning.dark' : 'text.secondary' }} />
                    <Typography variant="body2" sx={{
                      fontWeight: nextAction.is_overdue || nextAction.is_today ? 600 : 400,
                      color: nextAction.is_overdue ? 'error.main' : nextAction.is_today ? 'warning.dark' : 'text.primary',
                    }}>
                      {nextAction.title}
                      {nextAction.due_at && isValid(parseISO(nextAction.due_at)) && (
                        <> · {nextAction.is_overdue
                          ? `Просрочено — ${format(parseISO(nextAction.due_at), 'dd MMM, HH:mm', { locale: ru })}`
                          : nextAction.is_today
                          ? `Сегодня в ${format(parseISO(nextAction.due_at), 'HH:mm')}`
                          : format(parseISO(nextAction.due_at), 'dd MMM yyyy, HH:mm', { locale: ru })}</>
                      )}
                    </Typography>
                  </Stack>
                </Box>
              ) : (
                <Box sx={{ p: 1.5, borderRadius: 1, border: '1px dashed', borderColor: 'divider', bgcolor: 'action.hover' }}>
                  <Typography variant="body2" color="text.secondary">Следующий шаг не назначен</Typography>
                </Box>
              )}
            </Box>

            <Divider />

            {/* ── Блок D: Quick Actions ── */}
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Быстрые действия</Typography>

              {actionFeedback && (
                <Typography variant="body2" sx={{ mb: 1, p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
                  {actionFeedback}
                </Typography>
              )}

              <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ gap: 0.5 }}>
                <Button size="small" variant="outlined" startIcon={<CallIcon />} disabled={actionLoading}
                  onClick={() => qaExpandedAction === 'called' ? setQaExpandedAction(null) : setQaExpandedAction('called')}>
                  Позвонил
                </Button>
                <Button size="small" variant="outlined" startIcon={<PhoneDisabledIcon />} disabled={actionLoading}
                  onClick={() => qaExpandedAction === 'no_answer' ? setQaExpandedAction(null) : setQaExpandedAction('no_answer')}>
                  Не дозвонился
                </Button>
                <Button size="small" variant="outlined" startIcon={<SendIcon />} disabled={actionLoading}
                  onClick={() => qaExpandedAction === 'sent_info' ? setQaExpandedAction(null) : setQaExpandedAction('sent_info')}>
                  Отправил инфо
                </Button>
                <Button size="small" variant="outlined" startIcon={<ScheduleIcon />} disabled={actionLoading}
                  onClick={() => qaExpandedAction === 'schedule_contact' ? setQaExpandedAction(null) : setQaExpandedAction('schedule_contact')}>
                  Назначить контакт
                </Button>
                <Button size="small" variant="outlined" startIcon={<ReceiptIcon />} disabled={actionLoading}
                  onClick={() => handleOpenFull()}>
                  Создать счёт
                </Button>
                <Button size="small" variant="outlined" startIcon={<ThumbUpIcon />} disabled={actionLoading}
                  onClick={() => executeQuickAction('enrolled')}>
                  Записан
                </Button>
                <Button size="small" variant="outlined" color="error" startIcon={<ThumbDownIcon />} disabled={actionLoading}
                  onClick={() => qaExpandedAction === 'refused' ? setQaExpandedAction(null) : setQaExpandedAction('refused')}>
                  Отказ
                </Button>
              </Stack>

              {/* Раскрытая форма действия */}
              {qaExpandedAction && (
                <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                  {(qaExpandedAction === 'called' || qaExpandedAction === 'no_answer' || qaExpandedAction === 'sent_info') && (
                    <TextField
                      fullWidth size="small" label="Комментарий" multiline rows={2}
                      value={qaComment} onChange={(e) => setQaComment(e.target.value)}
                      sx={{ mb: 1 }}
                    />
                  )}
                  {(qaExpandedAction === 'called' || qaExpandedAction === 'no_answer' || qaExpandedAction === 'sent_info' || qaExpandedAction === 'schedule_contact') && (
                    <TextField
                      fullWidth size="small" label="Следующий контакт" type="datetime-local"
                      value={qaNextContact} onChange={(e) => setQaNextContact(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      sx={{ mb: 1 }}
                    />
                  )}
                  {qaExpandedAction === 'refused' && (
                    <>
                      <TextField
                        fullWidth size="small" label="Причина отказа"
                        value={qaLostReason} onChange={(e) => setQaLostReason(e.target.value)}
                        sx={{ mb: 1 }}
                      />
                      <TextField
                        fullWidth size="small" label="Комментарий" multiline rows={2}
                        value={qaComment} onChange={(e) => setQaComment(e.target.value)}
                        sx={{ mb: 1 }}
                      />
                    </>
                  )}
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small" variant="contained" disabled={actionLoading}
                      onClick={() => executeQuickAction(qaExpandedAction)}
                    >
                      Подтвердить
                    </Button>
                    <Button size="small" onClick={() => setQaExpandedAction(null)}>Отмена</Button>
                  </Stack>
                </Box>
              )}
            </Box>

            <Divider />

            {/* ── Блок E: Timeline preview ── */}
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>История</Typography>
              {card.timeline_preview.length === 0 ? (
                <Typography variant="body2" color="text.secondary">Нет записей</Typography>
              ) : (
                <Stack spacing={1}>
                  {card.timeline_preview.slice(0, 10).map((item: LeadActivity) => (
                    <Stack key={item.id} direction="row" spacing={1.5} alignItems="flex-start">
                      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 72, flexShrink: 0, pt: 0.15 }}>
                        {isValid(parseISO(item.created_at)) ? format(parseISO(item.created_at), 'dd.MM HH:mm') : '—'}
                      </Typography>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                          {activityTypeLabels[item.type] ?? item.title}
                        </Typography>
                        {item.description && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
                            {item.description}
                          </Typography>
                        )}
                        {item.status_effect_from && item.status_effect_to && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {statusLabels[item.status_effect_from as LeadStatus] ?? item.status_effect_from}
                            {' → '}
                            {statusLabels[item.status_effect_to as LeadStatus] ?? item.status_effect_to}
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>

            {/* ── Sidebar summary (встроено в нижнюю часть) ── */}
            {(card.sidebar.open_tasks_count > 0 || card.sidebar.last_invoice) && (
              <>
                <Divider />
                <Box sx={{ px: 2, py: 1.5 }}>
                  {card.sidebar.open_tasks_count > 0 && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Открытых задач: {card.sidebar.open_tasks_count}
                      {card.sidebar.nearest_tasks.length > 0 && (
                        <> · Ближайшая: {card.sidebar.nearest_tasks[0].note || '—'}
                          {card.sidebar.nearest_tasks[0].due_at && (
                            <> ({format(parseISO(card.sidebar.nearest_tasks[0].due_at), 'dd.MM HH:mm')})</>
                          )}
                        </>
                      )}
                    </Typography>
                  )}
                  {card.sidebar.last_invoice && (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                      Последний счёт: {card.sidebar.last_invoice.amount} {card.sidebar.last_invoice.currency} — {card.sidebar.last_invoice.status}
                    </Typography>
                  )}
                </Box>
              </>
            )}

            <Divider />

            {/* ── Кнопка открыть полную карточку ── */}
            <Box sx={{ px: 2, py: 1.5 }}>
              <Button fullWidth variant="outlined" startIcon={<OpenInNewIcon />} onClick={handleOpenFull}>
                Открыть полную карточку для редактирования
              </Button>
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
