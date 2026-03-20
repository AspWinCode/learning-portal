import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  Divider,
  Grid,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  Close as CloseIcon,
  OpenInNew,
  Phone as PhoneIcon,
  Schedule as ScheduleIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Edit as EditIcon,
  EventRepeat as RescheduleIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { format, isValid, parseISO } from 'date-fns';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { Lead, LeadTask, Invoice } from '../types';

const statusLabels: Record<string, string> = {
  new: 'Новый',
  contacted: 'Связались',
  no_answer: 'Недозвон',
  demo: 'Демо',
  invoice_sent: 'Инвойс отправлен',
  won: 'Успешно',
  lost: 'Закрыт',
  thinking: 'Подумают',
  refused: 'Отказали',
  trial_scheduled: 'Записали на пробное',
  event_registered: 'Записали на мероприятие',
  decided_immediately: 'Решил сразу',
};

const statusColors: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  new: 'info',
  contacted: 'primary',
  no_answer: 'warning',
  thinking: 'default',
  trial_scheduled: 'primary',
  event_registered: 'primary',
  decided_immediately: 'success',
  won: 'success',
  lost: 'error',
  refused: 'error',
};

interface LeadCardPopupProps {
  leadId: number | null;
  open: boolean;
  onClose: () => void;
  onLeadUpdated?: () => void;
}

interface TimelineEvent {
  id: number;
  type: string;
  title: string;
  description?: string;
  channel?: string;
  created_at: string;
  creator_name?: string;
  status_effect_from?: string;
  status_effect_to?: string;
}

interface NextAction {
  type?: string;
  title?: string;
  due_at?: string;
  owner_name?: string;
  task_id?: number;
  state: string;
}

interface SidebarSummary {
  contacts: Record<string, string | null>;
  source?: string;
  owner_name?: string;
  created_at?: string;
  updated_at?: string;
  upcoming_tasks: { id: number; note: string; due_at?: string; status: string }[];
  latest_invoice?: { id: number; amount: number; currency: string; status: string };
}

const timelineTypeLabels: Record<string, string> = {
  lead_created: 'Лид создан',
  call: 'Звонок',
  message: 'Сообщение',
  task_created: 'Задача создана',
  task_done: 'Задача выполнена',
  invoice_created: 'Счёт создан',
  invoice_paid: 'Счёт оплачен',
  status_changed: 'Статус изменён',
  comment_added: 'Комментарий',
  no_answer: 'Не дозвонились',
  info_sent: 'Отправлена информация',
  follow_up: 'Назначен повторный контакт',
  payment_received: 'Получена оплата',
  refused: 'Отказ',
  won: 'Записан',
};

const invoiceStatusLabels: Record<string, string> = {
  draft: 'Черновик',
  sent: 'Отправлен',
  paid: 'Оплачен',
  overdue: 'Просрочен',
  cancelled: 'Отменён',
};

export const LeadCardPopup: React.FC<LeadCardPopupProps> = ({
  leadId,
  open,
  onClose,
  onLeadUpdated,
}) => {
  const navigate = useNavigate();
  const [lead, setLead] = useState<Lead | null>(null);
  const [nextAction, setNextAction] = useState<NextAction>({ state: 'none' });
  const [pinnedComment, setPinnedComment] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState<SidebarSummary | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [tasks, setTasks] = useState<LeadTask[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [tabsLoaded, setTabsLoaded] = useState<Record<number, boolean>>({});

  // Pinned comment edit state
  const [editingPinned, setEditingPinned] = useState(false);
  const [pinnedDraft, setPinnedDraft] = useState('');

  // Task management state
  const [newTaskNote, setNewTaskNote] = useState('');
  const [newTaskDueAt, setNewTaskDueAt] = useState('');
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [rescheduleTaskId, setRescheduleTaskId] = useState<number | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');

  // Quick action state
  const [quickActionDialog, setQuickActionDialog] = useState<string | null>(null);
  const [quickActionComment, setQuickActionComment] = useState('');
  const [quickActionFollowUp, setQuickActionFollowUp] = useState('');
  const [quickActionChannel, setQuickActionChannel] = useState('');
  const [quickActionLoading, setQuickActionLoading] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);

  const loadCard = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await salesApi.getLeadCard(leadId);
      setLead(data.lead);
      setNextAction(data.next_action || { state: 'none' });
      setPinnedComment(data.pinned_comment);
      setSidebar(data.sidebar);
      setTimelineEvents(data.timeline_preview || []);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить карточку'));
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (open && leadId) {
      loadCard();
      setActiveTab(0);
      setTabsLoaded({});
    } else {
      setLead(null);
      setNextAction({ state: 'none' });
      setPinnedComment(null);
      setSidebar(null);
      setTimelineEvents([]);
      setTasks([]);
      setInvoices([]);
      setError(null);
    }
  }, [open, leadId, loadCard]);

  // Lazy load tabs
  useEffect(() => {
    if (!leadId || !open) return;
    if (activeTab === 1 && !tabsLoaded[1]) {
      salesApi.listTasks(leadId).then(setTasks).catch(() => {});
      setTabsLoaded((prev) => ({ ...prev, 1: true }));
    }
    if (activeTab === 2 && !tabsLoaded[2]) {
      salesApi.listInvoices(leadId).then(setInvoices).catch(() => {});
      setTabsLoaded((prev) => ({ ...prev, 2: true }));
    }
  }, [activeTab, leadId, open, tabsLoaded]);

  const handleOpenFull = () => {
    if (leadId) {
      navigate(`/sales/leads?open=${leadId}`);
      onClose();
    }
  };

  const leadName = lead
    ? [lead.parent_full_name || lead.contact_name, lead.child_full_name].filter(Boolean).join(' / ') || lead.phone || `Лид #${lead.id}`
    : '';

  const handleQuickAction = async (type: string, extraPayload: Record<string, unknown> = {}) => {
    if (!leadId || !lead) return;
    setQuickActionLoading(true);
    try {
      const payload: any = {
        type,
        title: timelineTypeLabels[type] || type,
        description: quickActionComment || undefined,
        channel: quickActionChannel || undefined,
        ...extraPayload,
      };
      const activity = await salesApi.createLeadActivity(leadId, payload);

      // Follow-up date
      if (quickActionFollowUp) {
        await salesApi.updateLead(leadId, { next_contact_at: new Date(quickActionFollowUp).toISOString() });
      }

      let toastMsg = `Действие "${timelineTypeLabels[type] || type}" выполнено`;
      if (activity?.status_effect_from && activity?.status_effect_to) {
        const fromLabel = statusLabels[activity.status_effect_from] ?? activity.status_effect_from;
        const toLabel = statusLabels[activity.status_effect_to] ?? activity.status_effect_to;
        toastMsg += ` · Статус: ${fromLabel} → ${toLabel}`;
      }
      setActionToast(toastMsg);
      setQuickActionDialog(null);
      setQuickActionComment('');
      setQuickActionFollowUp('');
      setQuickActionChannel('');
      await loadCard();
      onLeadUpdated?.();
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка при выполнении действия'));
    } finally {
      setQuickActionLoading(false);
    }
  };

  const nextActionBorderColor = nextAction.state === 'overdue' ? 'error.main' : nextAction.state === 'today' ? 'warning.main' : 'primary.main';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      scroll="paper"
      PaperProps={{ sx: { maxHeight: '95vh' } }}
    >
      <DialogContent sx={{ p: 0 }}>
        {/* Close bar */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h6">Карточка лида</Typography>
          <Stack direction="row" spacing={0.5}>
            <Button size="small" startIcon={<OpenInNew />} onClick={handleOpenFull}>Полная карточка</Button>
            <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
          </Stack>
        </Stack>

        {loading && <Typography color="text.secondary" sx={{ p: 3 }}>Загрузка...</Typography>}
        {error && <Typography color="error" sx={{ p: 2 }}>{error}</Typography>}
        {actionToast && (
          <Box sx={{ px: 2, py: 1, bgcolor: 'success.light', color: 'success.dark' }}>
            <Typography variant="body2">{actionToast}</Typography>
          </Box>
        )}

        {!loading && !error && lead && (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {/* BLOCK A: Header */}
            <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" sx={{ gap: 1 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{leadName}</Typography>
                  <Typography
                    variant="body2"
                    component="a"
                    href={`tel:${lead.parent_phone || lead.phone || ''}`}
                    sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                  >
                    <PhoneIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                    {lead.parent_phone || lead.phone || '—'}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label={statusLabels[lead.status] ?? lead.status} color={statusColors[lead.status] ?? 'default'} />
                </Stack>
              </Stack>
              <Stack direction="row" spacing={2} sx={{ mt: 0.5 }} flexWrap="wrap">
                {lead.source && <Typography variant="caption" color="text.secondary">Источник: {lead.source}</Typography>}
                {sidebar?.owner_name && <Typography variant="caption" color="text.secondary">Менеджер: {sidebar.owner_name}</Typography>}
                {lead.last_contact_at && isValid(parseISO(lead.last_contact_at)) ? (
                  <Typography variant="caption" color="text.secondary">
                    Последний контакт: {format(parseISO(lead.last_contact_at), 'dd.MM.yyyy HH:mm')}
                  </Typography>
                ) : (
                  lead.created_at && <Typography variant="caption" color="text.secondary">Создан: {format(parseISO(lead.created_at), 'dd.MM.yyyy')}</Typography>
                )}
              </Stack>
            </Box>

            {/* Pinned comment */}
            <Box sx={{ px: 2, py: 1, bgcolor: pinnedComment ? 'warning.light' : 'transparent', borderBottom: 1, borderColor: 'divider' }}>
              {editingPinned ? (
                <Stack spacing={1}>
                  <TextField
                    fullWidth size="small" multiline rows={2}
                    label="Заметка менеджера"
                    value={pinnedDraft}
                    onChange={(e) => setPinnedDraft(e.target.value)}
                    autoFocus
                  />
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="contained" onClick={async () => {
                      if (!leadId) return;
                      await salesApi.updateLead(leadId, { comment: pinnedDraft.trim() || undefined });
                      setPinnedComment(pinnedDraft.trim() || null);
                      setEditingPinned(false);
                    }}>Сохранить</Button>
                    <Button size="small" onClick={() => setEditingPinned(false)}>Отмена</Button>
                  </Stack>
                </Stack>
              ) : (
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  {pinnedComment ? (
                    <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'warning.dark', flex: 1 }}>
                      {pinnedComment}
                    </Typography>
                  ) : (
                    <Typography variant="caption" color="text.disabled">Заметка менеджера не добавлена</Typography>
                  )}
                  <Button size="small" sx={{ ml: 1, flexShrink: 0 }} onClick={() => { setPinnedDraft(pinnedComment || ''); setEditingPinned(true); }}>
                    {pinnedComment ? 'Изменить' : 'Добавить заметку'}
                  </Button>
                </Stack>
              )}
            </Box>

            {/* BLOCK B: Next Action */}
            <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              {nextAction.state !== 'none' ? (
                <Card variant="outlined" sx={{ borderColor: nextActionBorderColor, borderWidth: 2 }}>
                  <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          {nextAction.state === 'overdue' && <WarningIcon color="error" sx={{ fontSize: 18 }} />}
                          {nextAction.state === 'today' && <ScheduleIcon color="warning" sx={{ fontSize: 18 }} />}
                          <Typography variant="subtitle2">
                            {nextAction.title || 'Следующий шаг'}
                          </Typography>
                        </Stack>
                        <Stack direction="row" spacing={1.5} sx={{ mt: 0.25 }}>
                          {nextAction.due_at && (
                            <Typography variant="caption" sx={{ fontWeight: 600, color: nextAction.state === 'overdue' ? 'error.main' : nextAction.state === 'today' ? 'warning.main' : 'text.secondary' }}>
                              {format(parseISO(nextAction.due_at), 'dd.MM.yyyy HH:mm')}
                            </Typography>
                          )}
                          {nextAction.owner_name && (
                            <Typography variant="caption" color="text.secondary">{nextAction.owner_name}</Typography>
                          )}
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={0.5}>
                        <Button size="small" variant="contained" startIcon={<CheckCircleIcon />} onClick={() => {
                          if (nextAction.task_id && leadId) {
                            salesApi.closeTask(leadId, nextAction.task_id).then(() => { loadCard(); onLeadUpdated?.(); });
                          }
                        }}>
                          Выполнить
                        </Button>
                        <Button size="small" variant="outlined" startIcon={<RescheduleIcon />} onClick={() => setQuickActionDialog('follow_up')}>
                          Перенести
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ) : (
                <Button variant="outlined" fullWidth startIcon={<AddIcon />} onClick={() => setQuickActionDialog('follow_up')}>
                  Назначить следующий шаг
                </Button>
              )}
            </Box>

            {/* BLOCK C: Quick Actions */}
            <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Быстрые действия</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ gap: 0.5 }}>
                <Button size="small" variant="outlined" onClick={() => setQuickActionDialog('call')}>Позвонил</Button>
                <Button size="small" variant="outlined" onClick={() => setQuickActionDialog('no_answer')}>Не дозвонился</Button>
                <Button size="small" variant="outlined" onClick={() => setQuickActionDialog('info_sent')}>Отправил информацию</Button>
                <Button size="small" variant="outlined" onClick={() => setQuickActionDialog('follow_up')}>Повторный контакт</Button>
                <Button size="small" variant="outlined" onClick={() => setQuickActionDialog('invoice_created')}>Создать счёт</Button>
                <Button size="small" variant="outlined" onClick={() => setQuickActionDialog('payment_received')}>Получил оплату</Button>
                <Button size="small" variant="outlined" color="error" onClick={() => setQuickActionDialog('refused')}>Отказ</Button>
                <Button size="small" variant="outlined" color="success" onClick={() => setQuickActionDialog('won')}>Записан</Button>
              </Stack>
            </Box>

            {/* BLOCK D: Timeline + BLOCK sidebar */}
            <Grid container sx={{ minHeight: 300 }}>
              {/* Timeline */}
              <Grid item xs={12} md={7} sx={{ borderRight: { md: 1 }, borderColor: { md: 'divider' }, p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Таймлайн</Typography>
                {timelineEvents.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">Событий пока нет</Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {timelineEvents.map((ev) => (
                      <Box key={ev.id} sx={{ pl: 2, borderLeft: 3, borderColor: 'divider' }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="caption" color="text.secondary">
                            {ev.created_at && isValid(parseISO(ev.created_at)) ? format(parseISO(ev.created_at), 'dd.MM HH:mm') : ''}
                          </Typography>
                          <Chip size="small" label={timelineTypeLabels[ev.type] || ev.type} sx={{ height: 18, fontSize: '0.65rem' }} />
                        </Stack>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{ev.title}</Typography>
                        {ev.description && <Typography variant="caption" color="text.secondary">{ev.description}</Typography>}
                        {ev.creator_name && <Typography variant="caption" display="block" color="text.secondary">Менеджер: {ev.creator_name}</Typography>}
                        {ev.status_effect_from && ev.status_effect_to && (
                          <Typography variant="caption" sx={{ color: 'info.main' }}>
                            {statusLabels[ev.status_effect_from] ?? ev.status_effect_from} → {statusLabels[ev.status_effect_to] ?? ev.status_effect_to}
                          </Typography>
                        )}
                      </Box>
                    ))}
                    {timelineEvents.length >= 10 && (
                      <Button size="small" onClick={async () => {
                        if (!leadId) return;
                        const more = await salesApi.getLeadTimeline(leadId, timelineEvents.length, 20);
                        setTimelineEvents((prev) => [...prev, ...more]);
                      }}>
                        Загрузить ещё
                      </Button>
                    )}
                  </Stack>
                )}
              </Grid>

              {/* Sidebar */}
              <Grid item xs={12} md={5} sx={{ p: 2 }}>
                {sidebar && (
                  <Stack spacing={2}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Контакты</Typography>
                      {sidebar.contacts.phone && <Typography variant="body2">Телефон: {sidebar.contacts.phone}</Typography>}
                      {sidebar.contacts.child_phone && <Typography variant="body2">Тел. ребёнка: {sidebar.contacts.child_phone}</Typography>}
                      {sidebar.contacts.email && <Typography variant="body2">Email: {sidebar.contacts.email}</Typography>}
                      {sidebar.contacts.telegram && <Typography variant="body2">Telegram: {sidebar.contacts.telegram}</Typography>}
                      {sidebar.contacts.communication_channel && <Typography variant="body2">Канал: {sidebar.contacts.communication_channel}</Typography>}
                    </Box>
                    <Divider />
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Информация</Typography>
                      {sidebar.source && <Typography variant="body2">Источник: {sidebar.source}</Typography>}
                      {sidebar.owner_name && <Typography variant="body2">Менеджер: {sidebar.owner_name}</Typography>}
                      {sidebar.created_at && <Typography variant="body2">Создан: {format(parseISO(sidebar.created_at), 'dd.MM.yyyy')}</Typography>}
                    </Box>
                    {sidebar.upcoming_tasks.length > 0 && (
                      <>
                        <Divider />
                        <Box>
                          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Ближайшие задачи</Typography>
                          {sidebar.upcoming_tasks.map((t) => (
                            <Stack key={t.id} direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                              <Typography variant="body2" noWrap sx={{ maxWidth: '70%' }}>{t.note || '—'}</Typography>
                              {t.due_at && (
                                <Typography variant="caption" color="text.secondary">
                                  {isValid(parseISO(t.due_at)) ? format(parseISO(t.due_at), 'dd.MM HH:mm') : ''}
                                </Typography>
                              )}
                            </Stack>
                          ))}
                        </Box>
                      </>
                    )}
                    {sidebar.latest_invoice && (
                      <>
                        <Divider />
                        <Box>
                          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Последний счёт</Typography>
                          <Typography variant="body2">
                            {sidebar.latest_invoice.amount} {sidebar.latest_invoice.currency}
                            {' — '}
                            <Chip size="small" label={invoiceStatusLabels[sidebar.latest_invoice.status] ?? sidebar.latest_invoice.status} sx={{ height: 18, fontSize: '0.65rem' }} />
                          </Typography>
                        </Box>
                      </>
                    )}
                  </Stack>
                )}
              </Grid>
            </Grid>

            {/* BLOCK E: Secondary Tabs */}
            <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
              <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ px: 2 }}>
                <Tab label="Задачи" />
                <Tab label="Счета" />
                <Tab label="Детали" />
              </Tabs>
              <Box sx={{ p: 2 }}>
                {activeTab === 0 && (
                  <>
                    {!tabsLoaded[1] ? (
                      <Typography variant="body2" color="text.secondary">Нажмите для загрузки...</Typography>
                    ) : (
                      <Stack spacing={1}>
                        {tasks.length === 0 && !showNewTaskForm && (
                          <Typography variant="body2" color="text.secondary">Нет задач</Typography>
                        )}
                        {tasks.map((t) => (
                          <Stack key={t.id} direction="row" justifyContent="space-between" alignItems="center">
                            <Box sx={{ flex: 1, minWidth: 0, mr: 1 }}>
                              <Typography variant="body2" noWrap>{t.note || '—'}</Typography>
                              {t.due_at && (
                                <Typography variant="caption" color={isValid(parseISO(t.due_at)) && parseISO(t.due_at) < new Date() && t.status === 'open' ? 'error.main' : 'text.secondary'}>
                                  {isValid(parseISO(t.due_at)) ? format(parseISO(t.due_at), 'dd.MM HH:mm') : t.due_at}
                                </Typography>
                              )}
                            </Box>
                            <Stack direction="row" spacing={0.5} alignItems="center" flexShrink={0}>
                              <Chip size="small" label={t.status === 'open' ? 'Открыта' : 'Закрыта'} color={t.status === 'open' ? 'default' : 'success'} />
                              {t.status === 'open' && leadId && (<>
                                <Button size="small" onClick={() => { setRescheduleTaskId(t.id); setRescheduleDate(t.due_at ? format(parseISO(t.due_at), "yyyy-MM-dd'T'HH:mm") : ''); }}>
                                  Перенести
                                </Button>
                                <Button size="small" onClick={() => { salesApi.closeTask(leadId, t.id).then(() => { salesApi.listTasks(leadId).then(setTasks); loadCard(); onLeadUpdated?.(); }); }}>
                                  Завершить
                                </Button>
                              </>)}
                            </Stack>
                          </Stack>
                        ))}
                        {showNewTaskForm && leadId && (
                          <Stack spacing={1} sx={{ pt: 1, borderTop: 1, borderColor: 'divider' }}>
                            <TextField size="small" label="Название задачи" value={newTaskNote} onChange={(e) => setNewTaskNote(e.target.value)} fullWidth />
                            <TextField size="small" label="Срок" type="datetime-local" InputLabelProps={{ shrink: true }} value={newTaskDueAt} onChange={(e) => setNewTaskDueAt(e.target.value)} fullWidth />
                            <Stack direction="row" spacing={1}>
                              <Button size="small" variant="contained" disabled={!newTaskNote.trim()} onClick={async () => {
                                if (!leadId || !newTaskNote.trim()) return;
                                await salesApi.createTask(leadId, { note: newTaskNote.trim(), due_at: newTaskDueAt ? new Date(newTaskDueAt).toISOString() : undefined });
                                const updated = await salesApi.listTasks(leadId);
                                setTasks(updated);
                                setShowNewTaskForm(false);
                                setNewTaskNote('');
                                setNewTaskDueAt('');
                                await loadCard();
                                onLeadUpdated?.();
                              }}>Создать</Button>
                              <Button size="small" onClick={() => { setShowNewTaskForm(false); setNewTaskNote(''); setNewTaskDueAt(''); }}>Отмена</Button>
                            </Stack>
                          </Stack>
                        )}
                        {!showNewTaskForm && (
                          <Button size="small" startIcon={<AddIcon />} onClick={() => setShowNewTaskForm(true)}>Создать задачу</Button>
                        )}
                      </Stack>
                    )}
                  </>
                )}
                {activeTab === 1 && (
                  <>
                    {!tabsLoaded[2] ? (
                      <Typography variant="body2" color="text.secondary">Нажмите для загрузки...</Typography>
                    ) : invoices.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">Нет счетов</Typography>
                    ) : (
                      <Stack spacing={0.5}>
                        {invoices.map((inv) => (
                          <Stack key={inv.id} direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2">{inv.amount} {inv.currency}</Typography>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Chip size="small" label={invoiceStatusLabels[inv.status] ?? inv.status} color={inv.status === 'paid' ? 'success' : 'default'} />
                              {inv.created_at && (
                                <Typography variant="caption" color="text.secondary">
                                  {format(parseISO(inv.created_at), 'dd.MM.yyyy')}
                                </Typography>
                              )}
                              {inv.status !== 'paid' && inv.status !== 'cancelled' && leadId && (
                                <Button size="small" color="success" onClick={async () => {
                                  await salesApi.markInvoicePaid(leadId, inv.id);
                                  const updated = await salesApi.listInvoices(leadId);
                                  setInvoices(updated);
                                  await loadCard();
                                  onLeadUpdated?.();
                                }}>
                                  Оплачен
                                </Button>
                              )}
                            </Stack>
                          </Stack>
                        ))}
                      </Stack>
                    )}
                  </>
                )}
                {activeTab === 2 && lead && (
                  <Grid container spacing={1}>
                    {[
                      { label: 'ФИО родителя', value: lead.parent_full_name },
                      { label: 'Телефон', value: lead.parent_phone || lead.phone },
                      { label: 'ФИО ребёнка', value: lead.child_full_name },
                      { label: 'Телефон ребёнка', value: lead.child_phone },
                      { label: 'Email', value: lead.email },
                      { label: 'Город', value: lead.city },
                      { label: 'Школа', value: lead.school_name },
                      { label: 'Класс', value: lead.school_class },
                      { label: 'Источник', value: lead.source },
                      { label: 'Канал', value: lead.communication_channel },
                      { label: 'Комментарий', value: lead.comment },
                    ].filter(({ value }) => value).map(({ label, value }) => (
                      <Grid item xs={12} sm={6} key={label}>
                        <Typography variant="caption" color="text.secondary">{label}</Typography>
                        <Typography variant="body2">{value}</Typography>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Box>
            </Box>
          </Box>
        )}

        {/* Reschedule Task Dialog */}
        <Dialog open={rescheduleTaskId !== null} onClose={() => setRescheduleTaskId(null)} maxWidth="xs" fullWidth>
          <DialogContent>
            <Typography variant="h6" sx={{ mb: 2 }}>Перенести срок задачи</Typography>
            <TextField fullWidth size="small" label="Новый срок" type="datetime-local" InputLabelProps={{ shrink: true }} value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button variant="contained" disabled={!rescheduleDate} onClick={async () => {
                if (!leadId || !rescheduleTaskId || !rescheduleDate) return;
                await salesApi.updateTask(leadId, rescheduleTaskId, { due_at: new Date(rescheduleDate).toISOString() });
                const updated = await salesApi.listTasks(leadId);
                setTasks(updated);
                setRescheduleTaskId(null);
                setRescheduleDate('');
                await loadCard();
              }}>Сохранить</Button>
              <Button onClick={() => { setRescheduleTaskId(null); setRescheduleDate(''); }}>Отмена</Button>
            </Stack>
          </DialogContent>
        </Dialog>

        {/* Quick Action Dialogs */}
        <Dialog open={!!quickActionDialog} onClose={() => setQuickActionDialog(null)} maxWidth="xs" fullWidth>
          <DialogContent>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {quickActionDialog && (timelineTypeLabels[quickActionDialog] || quickActionDialog)}
            </Typography>

            {quickActionDialog === 'call' && (
              <Stack spacing={2}>
                <TextField fullWidth size="small" label="Комментарий" multiline rows={2} value={quickActionComment} onChange={(e) => setQuickActionComment(e.target.value)} />
                <TextField fullWidth size="small" label="Следующий контакт" type="datetime-local" InputLabelProps={{ shrink: true }} value={quickActionFollowUp} onChange={(e) => setQuickActionFollowUp(e.target.value)} />
                <TextField fullWidth size="small" label="Новый статус" select SelectProps={{ native: true }} value={quickActionChannel || 'contacted'} onChange={(e) => setQuickActionChannel(e.target.value)}>
                  <option value="contacted">Связались</option>
                  <option value="thinking">Подумают</option>
                  <option value="trial_scheduled">Записали на пробное</option>
                  <option value="demo">Демо</option>
                  <option value="invoice_sent">Инвойс отправлен</option>
                </TextField>
                <Button variant="contained" disabled={quickActionLoading} onClick={() => handleQuickAction('call', { status_effect_from: lead?.status, status_effect_to: quickActionChannel || 'contacted' })}>
                  Сохранить
                </Button>
              </Stack>
            )}

            {quickActionDialog === 'no_answer' && (
              <Stack spacing={2}>
                <TextField fullWidth size="small" label="Дата следующего контакта" type="datetime-local" InputLabelProps={{ shrink: true }} value={quickActionFollowUp} onChange={(e) => setQuickActionFollowUp(e.target.value)} />
                <TextField fullWidth size="small" label="Комментарий" multiline rows={2} value={quickActionComment} onChange={(e) => setQuickActionComment(e.target.value)} />
                <Button variant="contained" disabled={quickActionLoading} onClick={() => handleQuickAction('no_answer', { status_effect_from: lead?.status, status_effect_to: 'no_answer' })}>
                  Сохранить
                </Button>
              </Stack>
            )}

            {quickActionDialog === 'info_sent' && (
              <Stack spacing={2}>
                <TextField fullWidth size="small" label="Канал" select SelectProps={{ native: true }} value={quickActionChannel} onChange={(e) => setQuickActionChannel(e.target.value)}>
                  <option value="">Выберите канал</option>
                  <option value="telegram">Telegram</option>
                  <option value="sms">SMS</option>
                  <option value="max">MAX</option>
                  <option value="email">Email</option>
                </TextField>
                <TextField fullWidth size="small" label="Комментарий" multiline rows={2} value={quickActionComment} onChange={(e) => setQuickActionComment(e.target.value)} />
                <TextField fullWidth size="small" label="Follow-up дата" type="datetime-local" InputLabelProps={{ shrink: true }} value={quickActionFollowUp} onChange={(e) => setQuickActionFollowUp(e.target.value)} />
                <Button variant="contained" disabled={quickActionLoading} onClick={() => handleQuickAction('info_sent', { status_effect_from: lead?.status, status_effect_to: 'thinking', channel: quickActionChannel })}>
                  Сохранить
                </Button>
              </Stack>
            )}

            {quickActionDialog === 'follow_up' && (
              <Stack spacing={2}>
                <TextField fullWidth size="small" label="Дата и время" type="datetime-local" InputLabelProps={{ shrink: true }} value={quickActionFollowUp} onChange={(e) => setQuickActionFollowUp(e.target.value)} />
                <TextField fullWidth size="small" label="Комментарий" multiline rows={2} value={quickActionComment} onChange={(e) => setQuickActionComment(e.target.value)} />
                <Button variant="contained" disabled={quickActionLoading || !quickActionFollowUp} onClick={() => handleQuickAction('follow_up')}>
                  Назначить
                </Button>
              </Stack>
            )}

            {quickActionDialog === 'invoice_created' && (
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">Счёт будет создан через полную форму. Нажмите для перехода.</Typography>
                <Button variant="contained" onClick={() => { setQuickActionDialog(null); handleOpenFull(); }}>
                  Открыть полную карточку
                </Button>
              </Stack>
            )}

            {quickActionDialog === 'payment_received' && (
              <Stack spacing={2}>
                <TextField fullWidth size="small" label="Комментарий" multiline rows={2} value={quickActionComment} onChange={(e) => setQuickActionComment(e.target.value)} />
                <Button variant="contained" color="success" disabled={quickActionLoading} onClick={() => handleQuickAction('payment_received', { status_effect_from: lead?.status, status_effect_to: 'won' })}>
                  Подтвердить оплату
                </Button>
              </Stack>
            )}

            {quickActionDialog === 'refused' && (
              <Stack spacing={2}>
                <TextField fullWidth size="small" label="Причина отказа" multiline rows={2} value={quickActionComment} onChange={(e) => setQuickActionComment(e.target.value)} />
                <Button variant="contained" color="error" disabled={quickActionLoading || !quickActionComment} onClick={() => handleQuickAction('refused', { status_effect_from: lead?.status, status_effect_to: 'lost' })}>
                  Подтвердить отказ
                </Button>
              </Stack>
            )}

            {quickActionDialog === 'won' && (
              <Stack spacing={2}>
                <TextField fullWidth size="small" label="Комментарий" multiline rows={2} value={quickActionComment} onChange={(e) => setQuickActionComment(e.target.value)} />
                <Button variant="contained" color="success" disabled={quickActionLoading} onClick={() => handleQuickAction('won', { status_effect_from: lead?.status, status_effect_to: 'won' })}>
                  Подтвердить запись
                </Button>
              </Stack>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};
