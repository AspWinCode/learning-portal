import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  AccessTime as AccessTimeIcon,
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  Call as CallIcon,
  ChatBubbleOutline as ChatIcon,
  Check as CheckIcon,
  Forum as MaxIcon,
  PhoneDisabled as PhoneDisabledIcon,
  PushPin as PushPinIcon,
  Receipt as ReceiptIcon,
  Schedule as ScheduleIcon,
  Send as SendIcon,
  Sms as SmsIcon,
  ThumbDown as ThumbDownIcon,
  ThumbUp as ThumbUpIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { format, isValid, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import Layout from '../components/Layout';
import { salesApi, abonementsApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type {
  Abonement,
  Invoice,
  LeadActivity,
  LeadCardResponse,
  LeadInfoTemplate,
  LeadNextAction,
  LeadStatus,
  LeadTask,
  QuickActionType,
} from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────

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
    case 'no_answer': return 'warning';
    case 'demo': return 'warning';
    default: return 'primary';
  }
}

const invoiceStatusLabels: Record<string, string> = {
  draft: 'Черновик',
  sent: 'Ожидает оплаты',
  paid: 'Оплачен',
  overdue: 'Просрочен',
  cancelled: 'Отменён',
};

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

// ─── Auto follow-up suggestions ─────────────────────────────────────────────

function getAutoFollowUpHint(action: QuickActionType): string | null {
  if (action === 'no_answer') return 'Авто: перезвонить через 4 часа';
  if (action === 'sent_info') return 'Авто: follow-up через 2 дня';
  return null;
}

function getDefaultNextContact(action: QuickActionType): string {
  const now = new Date();
  if (action === 'no_answer') {
    now.setHours(now.getHours() + 4);
  } else if (action === 'sent_info') {
    now.setDate(now.getDate() + 2);
  } else {
    now.setDate(now.getDate() + 1);
  }
  return now.toISOString().slice(0, 16);
}

// ─── QuickActions panel ──────────────────────────────────────────────────────

interface QuickActionsProps {
  leadId: number;
  loading: boolean;
  infoTemplates: LeadInfoTemplate[];
  abonements: Abonement[];
  onComplete: (message: string, newStatus: string | null) => void;
  onError: (msg: string) => void;
}

const QuickActions: React.FC<QuickActionsProps> = ({
  leadId, loading, infoTemplates, abonements, onComplete, onError,
}) => {
  const [expanded, setExpanded] = useState<QuickActionType | null>(null);
  const [comment, setComment] = useState('');
  const [nextContact, setNextContact] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [abonementId, setAbonementId] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);

  const toggleAction = (action: QuickActionType) => {
    if (expanded === action) {
      setExpanded(null);
      return;
    }
    setExpanded(action);
    setComment('');
    setLostReason('');
    setTemplateId('');
    setAbonementId('');
    // Pre-fill next contact date
    if (['no_answer', 'sent_info', 'schedule_contact', 'called'].includes(action)) {
      setNextContact(getDefaultNextContact(action));
    } else {
      setNextContact('');
    }
  };

  const handleSubmit = async () => {
    if (!expanded) return;
    setSubmitting(true);
    try {
      const result = await salesApi.leadQuickAction(leadId, {
        action: expanded,
        comment: comment || undefined,
        next_contact_at: nextContact || undefined,
        lost_reason: expanded === 'refused' ? (lostReason || undefined) : undefined,
        template_id: expanded === 'sent_info' && templateId ? Number(templateId) : undefined,
        abonement_id: expanded === 'create_invoice' && abonementId ? Number(abonementId) : undefined,
      });
      const statusMsg = result.new_status
        ? ` → ${statusLabels[result.new_status as LeadStatus] ?? result.new_status}`
        : '';
      onComplete(`${result.message}${statusMsg}`, result.new_status ?? null);
      setExpanded(null);
      setComment('');
      setNextContact('');
      setLostReason('');
      setTemplateId('');
      setAbonementId('');
    } catch (err: unknown) {
      onError(extractApiError(err, 'Ошибка'));
    } finally {
      setSubmitting(false);
    }
  };

  const busy = loading || submitting;
  const autoHint = expanded ? getAutoFollowUpHint(expanded) : null;

  return (
    <Box>
      <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ gap: 0.5 }}>
        <Button size="small" variant={expanded === 'called' ? 'contained' : 'outlined'}
          startIcon={<CallIcon />} disabled={busy} onClick={() => toggleAction('called')}>
          Позвонил
        </Button>
        <Button size="small" variant={expanded === 'no_answer' ? 'contained' : 'outlined'}
          startIcon={<PhoneDisabledIcon />} disabled={busy} onClick={() => toggleAction('no_answer')}>
          Не дозвонился
        </Button>
        <Button size="small" variant={expanded === 'sent_info' ? 'contained' : 'outlined'}
          startIcon={<SendIcon />} disabled={busy} onClick={() => toggleAction('sent_info')}>
          Отправил инфо
        </Button>
        <Button size="small" variant={expanded === 'schedule_contact' ? 'contained' : 'outlined'}
          startIcon={<ScheduleIcon />} disabled={busy} onClick={() => toggleAction('schedule_contact')}>
          Назначить контакт
        </Button>
        <Button size="small" variant={expanded === 'create_invoice' ? 'contained' : 'outlined'}
          startIcon={<ReceiptIcon />} disabled={busy} onClick={() => toggleAction('create_invoice')}>
          Создать счёт
        </Button>
        <Button size="small" variant={expanded === 'enrolled' ? 'contained' : 'outlined'}
          color="success" startIcon={<ThumbUpIcon />} disabled={busy}
          onClick={async () => {
            setSubmitting(true);
            try {
              const r = await salesApi.leadQuickAction(leadId, { action: 'enrolled' });
              onComplete(r.message + (r.new_status ? ` → ${statusLabels[r.new_status as LeadStatus] ?? r.new_status}` : ''), r.new_status ?? null);
            } catch (e: unknown) { onError(extractApiError(e, 'Ошибка')); }
            finally { setSubmitting(false); }
          }}>
          Записан
        </Button>
        <Button size="small" variant={expanded === 'refused' ? 'contained' : 'outlined'}
          color="error" startIcon={<ThumbDownIcon />} disabled={busy} onClick={() => toggleAction('refused')}>
          Отказ
        </Button>
      </Stack>

      {expanded && (
        <Box sx={{ mt: 1.5, p: 2, borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
          {/* Template selector for sent_info */}
          {expanded === 'sent_info' && infoTemplates.length > 0 && (
            <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
              <InputLabel>Шаблон информации</InputLabel>
              <Select
                value={templateId}
                label="Шаблон информации"
                onChange={(e) => {
                  const val = e.target.value as number | '';
                  setTemplateId(val);
                  if (val) {
                    const tpl = infoTemplates.find((t) => t.id === val);
                    if (tpl && !comment) setComment(tpl.body);
                  }
                }}
              >
                <MenuItem value="">Без шаблона</MenuItem>
                {infoTemplates.map((t) => (
                  <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Abonement selector for create_invoice */}
          {expanded === 'create_invoice' && (
            <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
              <InputLabel>Абонемент</InputLabel>
              <Select
                value={abonementId}
                label="Абонемент"
                onChange={(e) => setAbonementId(e.target.value as number | '')}
              >
                <MenuItem value="">Выберите абонемент</MenuItem>
                {abonements.map((a) => (
                  <MenuItem key={a.id} value={a.id}>{a.name} — {a.price} ₽</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Lost reason for refused */}
          {expanded === 'refused' && (
            <TextField fullWidth size="small" label="Причина отказа" value={lostReason}
              onChange={(e) => setLostReason(e.target.value)} sx={{ mb: 1.5 }} />
          )}

          {/* Comment */}
          {['called', 'no_answer', 'sent_info', 'refused'].includes(expanded) && (
            <TextField
              fullWidth size="small" label="Комментарий" multiline rows={2}
              value={comment} onChange={(e) => setComment(e.target.value)} sx={{ mb: 1.5 }}
            />
          )}

          {/* Next contact date */}
          {['called', 'no_answer', 'sent_info', 'schedule_contact'].includes(expanded) && (
            <Box sx={{ mb: 1.5 }}>
              <TextField
                fullWidth size="small" label="Следующий контакт" type="datetime-local"
                value={nextContact} onChange={(e) => setNextContact(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              {autoHint && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {autoHint}
                </Typography>
              )}
            </Box>
          )}

          <Stack direction="row" spacing={1}>
            <Button
              size="small" variant="contained" disabled={busy}
              startIcon={submitting ? <CircularProgress size={14} /> : <CheckIcon />}
              onClick={handleSubmit}
            >
              Подтвердить
            </Button>
            <Button size="small" disabled={busy} onClick={() => setExpanded(null)}>Отмена</Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
};

// ─── NextActionBlock ─────────────────────────────────────────────────────────

const NextActionBlock: React.FC<{ nextAction: LeadNextAction | null }> = ({ nextAction }) => {
  if (!nextAction) {
    return (
      <Box sx={{ p: 2, borderRadius: 1, border: '1px dashed', borderColor: 'divider', bgcolor: 'action.hover' }}>
        <Typography variant="body2" color="text.secondary">Следующий шаг не назначен</Typography>
      </Box>
    );
  }

  const dueDate = nextAction.due_at && isValid(parseISO(nextAction.due_at))
    ? parseISO(nextAction.due_at) : null;

  return (
    <Box sx={{
      p: 2, borderRadius: 1, border: '1px solid',
      borderColor: nextAction.is_overdue ? 'error.main' : nextAction.is_today ? 'warning.main' : 'divider',
      bgcolor: nextAction.is_overdue ? 'error.light' : nextAction.is_today ? 'warning.light' : 'action.hover',
    }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <AccessTimeIcon sx={{
          fontSize: 20,
          color: nextAction.is_overdue ? 'error.main' : nextAction.is_today ? 'warning.dark' : 'text.secondary',
        }} />
        <Box>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {nextAction.title}
          </Typography>
          {dueDate && (
            <Typography variant="body2" sx={{
              color: nextAction.is_overdue ? 'error.main' : nextAction.is_today ? 'warning.dark' : 'text.secondary',
            }}>
              {nextAction.is_overdue
                ? `Просрочено — ${format(dueDate, 'dd MMM yyyy, HH:mm', { locale: ru })}`
                : nextAction.is_today
                ? `Сегодня в ${format(dueDate, 'HH:mm')}`
                : format(dueDate, 'dd MMM yyyy, HH:mm', { locale: ru })}
            </Typography>
          )}
        </Box>
        {nextAction.is_overdue && (
          <Chip size="small" icon={<WarningIcon />} label="Просрочено" color="error" sx={{ ml: 'auto' }} />
        )}
        {!nextAction.is_overdue && nextAction.is_today && (
          <Chip size="small" label="Сегодня" color="warning" sx={{ ml: 'auto' }} />
        )}
      </Stack>
    </Box>
  );
};

// ─── Timeline ────────────────────────────────────────────────────────────────

interface TimelineProps {
  leadId: number;
  preview: LeadActivity[];
}

const TimelineSection: React.FC<TimelineProps> = ({ leadId, preview }) => {
  const [items, setItems] = useState<LeadActivity[]>(preview);
  const [total, setTotal] = useState(preview.length);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(preview.length);

  useEffect(() => {
    setItems(preview);
    setOffset(preview.length);
  }, [preview]);

  const loadMore = async () => {
    setLoading(true);
    try {
      const result = await salesApi.getLeadTimeline(leadId, { offset, limit: 15 });
      setItems((prev) => [...prev, ...result.items]);
      setTotal(result.total);
      setOffset((prev) => prev + result.items.length);
    } finally {
      setLoading(false);
    }
  };

  const hasMore = offset < total;

  return (
    <Stack spacing={0}>
      {items.map((item, idx) => (
        <Stack
          key={item.id}
          direction="row"
          spacing={1.5}
          sx={{ py: 1, borderBottom: idx < items.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}
        >
          {/* Дата */}
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90, flexShrink: 0, pt: 0.2 }}>
            {isValid(parseISO(item.created_at))
              ? format(parseISO(item.created_at), 'dd.MM.yyyy')
              : '—'}
            <br />
            {isValid(parseISO(item.created_at)) && (
              <span style={{ color: '#aaa' }}>
                {format(parseISO(item.created_at), 'HH:mm')}
              </span>
            )}
          </Typography>
          {/* Контент */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {activityTypeLabels[item.type] ?? item.title}
            </Typography>
            {item.description && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
                {item.description}
              </Typography>
            )}
            {item.status_effect_from && item.status_effect_to && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.25 }}>
                <Chip size="small" label={statusLabels[item.status_effect_from as LeadStatus] ?? item.status_effect_from} sx={{ height: 18, fontSize: '0.65rem' }} />
                {' → '}
                <Chip size="small" label={statusLabels[item.status_effect_to as LeadStatus] ?? item.status_effect_to} sx={{ height: 18, fontSize: '0.65rem' }} />
              </Typography>
            )}
            {item.channel && (
              <Typography variant="caption" color="text.secondary">
                {item.channel.toUpperCase()}
              </Typography>
            )}
          </Box>
        </Stack>
      ))}
      {hasMore && (
        <Button
          size="small" onClick={loadMore} disabled={loading}
          startIcon={loading ? <CircularProgress size={14} /> : undefined}
          sx={{ mt: 1, alignSelf: 'flex-start' }}
        >
          Загрузить ещё ({total - offset})
        </Button>
      )}
      {items.length === 0 && (
        <Typography variant="body2" color="text.secondary">История пуста</Typography>
      )}
    </Stack>
  );
};

// ─── Tab panels ──────────────────────────────────────────────────────────────

interface TasksTabProps {
  leadId: number;
  tasks: LeadTask[];
  onTaskChanged: () => void;
}

const TasksTab: React.FC<TasksTabProps> = ({ leadId, tasks, onTaskChanged }) => {
  const [createOpen, setCreateOpen] = useState(false);
  const [note, setNote] = useState('');
  const [channel, setChannel] = useState('call');
  const [dueAt, setDueAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [closingId, setClosingId] = useState<number | null>(null);

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      await salesApi.createTask(leadId, {
        note: note.trim() || undefined,
        channel: channel || undefined,
        due_at: dueAt || undefined,
      });
      setCreateOpen(false);
      setNote('');
      setDueAt('');
      onTaskChanged();
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  const handleClose = async (taskId: number) => {
    setClosingId(taskId);
    try {
      await salesApi.closeTask(leadId, taskId);
      onTaskChanged();
    } catch { /* ignore */ }
    setClosingId(null);
  };

  return (
    <Stack spacing={1} sx={{ py: 1 }}>
      <Button
        size="small"
        variant={createOpen ? 'outlined' : 'contained'}
        startIcon={<AddIcon />}
        onClick={() => setCreateOpen((v) => !v)}
        sx={{ alignSelf: 'flex-start' }}
      >
        {createOpen ? 'Отмена' : 'Создать задачу'}
      </Button>

      {createOpen && (
        <Stack spacing={1} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <TextField
            size="small"
            label="Заметка"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            rows={2}
          />
          <Stack direction="row" spacing={1}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Канал</InputLabel>
              <Select value={channel} label="Канал" onChange={(e) => setChannel(e.target.value as string)}>
                <MenuItem value="call">Звонок</MenuItem>
                <MenuItem value="messenger">Мессенджер</MenuItem>
                <MenuItem value="email">Email</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Срок"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
          </Stack>
          <Button size="small" variant="contained" onClick={handleCreate} disabled={submitting}>
            Создать
          </Button>
        </Stack>
      )}

      {tasks.length === 0 && !createOpen && (
        <Typography variant="body2" color="text.secondary">Задач нет</Typography>
      )}

      {tasks.map((task) => (
        <Stack key={task.id} direction="row" spacing={1} alignItems="flex-start">
          <Chip
            size="small"
            label={task.status === 'done' ? 'Готово' : 'Открыта'}
            color={task.status === 'done' ? 'success' : 'default'}
            sx={{ mt: 0.25 }}
          />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2">{task.note || '—'}</Typography>
            {task.due_at && (
              <Typography variant="caption" color="text.secondary">
                {format(parseISO(task.due_at), 'dd.MM HH:mm')}
              </Typography>
            )}
          </Box>
          {task.status !== 'done' && (
            <Tooltip title="Выполнить">
              <span>
                <IconButton
                  size="small"
                  color="success"
                  disabled={closingId === task.id}
                  onClick={() => handleClose(task.id)}
                >
                  <CheckIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Stack>
      ))}
    </Stack>
  );
};

const InvoicesTab: React.FC<{ invoices: Invoice[] }> = ({ invoices }) => {
  if (invoices.length === 0) {
    return <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>Счетов нет</Typography>;
  }
  return (
    <Stack spacing={1} sx={{ py: 1 }}>
      {invoices.map((inv) => (
        <Stack key={inv.id} direction="row" spacing={1} alignItems="center">
          <Chip
            size="small"
            label={invoiceStatusLabels[inv.status] ?? inv.status}
            color={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'error' : inv.status === 'sent' ? 'warning' : 'default'}
          />
          <Typography variant="body2" sx={{ flex: 1 }}>
            {inv.amount} {inv.currency}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {format(parseISO(inv.created_at), 'dd.MM.yyyy')}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────

const LeadCardPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const leadId = id ? Number(id) : NaN;

  const [card, setCard] = useState<LeadCardResponse | null>(null);
  const [tasks, setTasks] = useState<LeadTask[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [infoTemplates, setInfoTemplates] = useState<LeadInfoTemplate[]>([]);
  const [abonements, setAbonements] = useState<Abonement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabIndex, setTabIndex] = useState(0);
  const [tabsLoaded, setTabsLoaded] = useState({ tasks: false, invoices: false });
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  const loadCard = useCallback(async () => {
    if (isNaN(leadId)) return;
    setLoading(true);
    setError(null);
    try {
      const [cardData, templatesData, abonementsData] = await Promise.all([
        salesApi.getLeadCard(leadId),
        salesApi.listLeadInfoTemplates(),
        abonementsApi.getAll(),
      ]);
      setCard(cardData);
      setInfoTemplates(templatesData);
      setAbonements(abonementsData);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось загрузить карточку лида'));
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    loadCard();
  }, [loadCard]);

  const handleTabChange = async (_: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue);
    if (newValue === 0 && !tabsLoaded.tasks) {
      try {
        const data = await salesApi.listTasks(leadId);
        setTasks(data);
        setTabsLoaded((prev) => ({ ...prev, tasks: true }));
      } catch { /* ignore */ }
    } else if (newValue === 1 && !tabsLoaded.invoices) {
      try {
        const data = await salesApi.listInvoices(leadId);
        setInvoices(data);
        setTabsLoaded((prev) => ({ ...prev, invoices: true }));
      } catch { /* ignore */ }
    }
  };

  const handleActionComplete = async (message: string, newStatus: string | null) => {
    setToast({ open: true, message, severity: 'success' });
    if (newStatus) {
      // Обновляем статус в текущем card без полного reload
      setCard((prev) => prev ? { ...prev, lead: { ...prev.lead, status: newStatus as LeadStatus } } : prev);
    }
    // Перезагружаем карточку для актуальных данных
    await loadCard();
    // Сбрасываем загруженные вкладки (данные могли измениться)
    setTabsLoaded({ tasks: false, invoices: false });
  };

  const handleActionError = (msg: string) => {
    setToast({ open: true, message: msg, severity: 'error' });
  };

  const handleTaskChanged = useCallback(async () => {
    await loadCard();
    try {
      const data = await salesApi.listTasks(leadId);
      setTasks(data);
    } catch { /* ignore */ }
  }, [leadId, loadCard]);

  const lead = card?.lead;
  const phone = lead ? lead.parent_phone || lead.phone || '' : '';
  const leadName = lead
    ? [lead.parent_full_name || lead.contact_name, lead.child_full_name]
        .filter(Boolean).join(' / ') || lead.phone || `Лид #${lead.id}`
    : '';

  if (loading && !card) {
    return (
      <Layout>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <Box sx={{ p: 3 }}>
          <Alert severity="error">{error}</Alert>
          <Button sx={{ mt: 2 }} onClick={() => navigate(-1)} startIcon={<ArrowBackIcon />}>Назад</Button>
        </Box>
      </Layout>
    );
  }

  if (!lead || !card) return null;

  return (
    <Layout>
      <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 1, sm: 2 }, py: 2 }}>
        {/* ── Хлебные крошки / навигация ── */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <IconButton size="small" onClick={() => navigate(-1)}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="body2" color="text.secondary">
            Лиды
          </Typography>
          <Typography variant="body2" color="text.secondary">/</Typography>
          <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>{leadName}</Typography>
          {loading && <CircularProgress size={14} sx={{ ml: 1 }} />}
        </Stack>

        {/* ════════════════ БЛОК A: HEADER ════════════════ */}
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent sx={{ pb: '16px !important' }}>
            <Grid container spacing={2} alignItems="flex-start">
              <Grid item xs={12} md={8}>
                {/* Имя + статус */}
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>{leadName}</Typography>
                  <Chip
                    label={statusLabels[lead.status] ?? lead.status}
                    color={badgeColor(lead.status)}
                    size="small"
                  />
                  {card.next_action?.is_overdue && (
                    <Chip icon={<WarningIcon />} label="Просрочено" color="error" size="small" variant="outlined" />
                  )}
                  {card.sidebar.unpaid_invoices_count > 0 && (
                    <Chip label="Счёт ожидает оплаты" color="warning" size="small" variant="outlined" />
                  )}
                </Stack>
                {/* Телефон */}
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                  {phone && (
                    <Typography
                      variant="body1"
                      component="a"
                      href={`tel:${phone}`}
                      sx={{ color: 'primary.main', textDecoration: 'none', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}
                    >
                      {phone}
                    </Typography>
                  )}
                  {phone && (
                    <>
                      <Tooltip title="Звонок">
                        <IconButton size="small" component="a" href={`tel:${phone}`}>
                          <CallIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Telegram">
                        <IconButton size="small" component="a" href={`https://t.me/${phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                          <ChatIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="SMS">
                        <IconButton size="small" component="a" href={`sms:${phone}`}>
                          <SmsIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </Stack>
                {/* Метаданные */}
                <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ gap: 0.5 }}>
                  {lead.source && (
                    <Typography variant="caption" color="text.secondary">Источник: {lead.source}</Typography>
                  )}
                  {lead.email && (
                    <Typography variant="caption" color="text.secondary">{lead.email}</Typography>
                  )}
                  {lead.updated_at && (
                    <Typography variant="caption" color="text.secondary">
                      Обновлён: {format(parseISO(lead.updated_at), 'dd.MM.yyyy HH:mm')}
                    </Typography>
                  )}
                  {lead.created_at && (
                    <Typography variant="caption" color="text.secondary">
                      Создан: {format(parseISO(lead.created_at), 'dd.MM.yyyy')}
                    </Typography>
                  )}
                </Stack>
              </Grid>
              {/* Sidebar summary на десктопе */}
              <Grid item xs={12} md={4}>
                <Stack spacing={0.5}>
                  {card.sidebar.open_tasks_count > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      Открытых задач: {card.sidebar.open_tasks_count}
                    </Typography>
                  )}
                  {card.sidebar.last_invoice && (
                    <Typography variant="caption" color="text.secondary">
                      Последний счёт: {card.sidebar.last_invoice.amount} {card.sidebar.last_invoice.currency}
                      {' '}— {invoiceStatusLabels[card.sidebar.last_invoice.status] ?? card.sidebar.last_invoice.status}
                    </Typography>
                  )}
                  {card.sidebar.nearest_tasks.slice(0, 2).map((t) => (
                    <Typography key={t.id} variant="caption" color="text.secondary">
                      • {t.note || '—'}{t.due_at ? ` (${format(parseISO(t.due_at), 'dd.MM HH:mm')})` : ''}
                    </Typography>
                  ))}
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* ════════════════ БЛОК B: PINNED COMMENT ════════════════ */}
        {card.pinned_comment && (
          <Box sx={{ mb: 2, p: 1.5, bgcolor: 'warning.light', borderRadius: 1, borderLeft: '4px solid', borderColor: 'warning.main' }}>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
              <PushPinIcon sx={{ fontSize: 16, color: 'warning.dark' }} />
              <Typography variant="caption" color="warning.dark" sx={{ fontWeight: 600 }}>Заметка менеджера</Typography>
            </Stack>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{card.pinned_comment}</Typography>
          </Box>
        )}

        {/* ════════════════ БЛОК C: NEXT ACTION ════════════════ */}
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent sx={{ pb: '16px !important' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>Следующий шаг</Typography>
            <NextActionBlock nextAction={card.next_action ?? null} />
          </CardContent>
        </Card>

        {/* ════════════════ БЛОК D: QUICK ACTIONS ════════════════ */}
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent sx={{ pb: '16px !important' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>Действия</Typography>
            <QuickActions
              leadId={leadId}
              loading={loading}
              infoTemplates={infoTemplates}
              abonements={abonements}
              onComplete={handleActionComplete}
              onError={handleActionError}
            />
          </CardContent>
        </Card>

        {/* ════════════════ БЛОК E: TIMELINE + TABS ════════════════ */}
        <Grid container spacing={2}>
          {/* Таймлайн */}
          <Grid item xs={12} md={8}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>История</Typography>
                <TimelineSection leadId={leadId} preview={card.timeline_preview} />
              </CardContent>
            </Card>
          </Grid>

          {/* Боковая панель */}
          <Grid item xs={12} md={4}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                {/* Вкладки */}
                <Tabs value={tabIndex} onChange={handleTabChange} sx={{ mb: 1.5 }}>
                  <Tab label="Задачи" />
                  <Tab label="Счета" />
                  <Tab label="Детали" />
                </Tabs>

                {tabIndex === 0 && <TasksTab leadId={leadId} tasks={tasks} onTaskChanged={handleTaskChanged} />}
                {tabIndex === 1 && <InvoicesTab invoices={invoices} />}
                {tabIndex === 2 && (
                  <Stack spacing={0.75} sx={{ py: 1 }}>
                    {lead.parent_full_name && (
                      <Typography variant="body2">ФИО родителя: {lead.parent_full_name}</Typography>
                    )}
                    {lead.child_full_name && (
                      <Typography variant="body2">ФИО ребёнка: {lead.child_full_name}</Typography>
                    )}
                    {lead.city && (
                      <Typography variant="body2">Город: {lead.city}</Typography>
                    )}
                    {lead.school_name && (
                      <Typography variant="body2">Школа: {lead.school_name}</Typography>
                    )}
                    {lead.school_class && (
                      <Typography variant="body2">Класс: {lead.school_class}</Typography>
                    )}
                    {lead.desired_slot && (
                      <Typography variant="body2">Желаемое время: {lead.desired_slot}</Typography>
                    )}
                    {lead.comment && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Комментарий</Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{lead.comment}</Typography>
                      </Box>
                    )}
                    {lead.no_answer_attempt != null && lead.no_answer_attempt > 0 && (
                      <Typography variant="body2" color="warning.dark">
                        Попыток дозвона: {lead.no_answer_attempt}
                      </Typography>
                    )}
                    {lead.lost_reason && (
                      <Typography variant="body2" color="error.main">
                        Причина отказа: {lead.lost_reason}
                      </Typography>
                    )}
                  </Stack>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* ── Toast ── */}
        <Snackbar
          open={toast.open}
          autoHideDuration={4000}
          onClose={() => setToast((s) => ({ ...s, open: false }))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={() => setToast((s) => ({ ...s, open: false }))} severity={toast.severity} sx={{ width: '100%' }}>
            {toast.message}
          </Alert>
        </Snackbar>
      </Box>
    </Layout>
  );
};

export default LeadCardPage;
