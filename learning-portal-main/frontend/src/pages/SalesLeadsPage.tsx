import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Autocomplete,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  TableContainer,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Alert,
  CircularProgress,
  Snackbar,
  IconButton,
  Tooltip,
  Checkbox,
  Tabs,
  Tab,
  LinearProgress,
} from '@mui/material';
import {
  Call as CallIcon,
  ChatBubbleOutline as ChatIcon,
  Send as SendIcon,
  EventNote as FollowUpIcon,
  Close as CloseIcon,
  Visibility as VisibilityIcon,
  ReceiptLong as ReceiptLongIcon,
} from '@mui/icons-material';
import { format, isValid, parseISO } from 'date-fns';
import Layout from '../components/Layout';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import {
  EventItem,
  Invoice,
  Lead,
  LeadCommunication,
  LeadCommunicationChannel,
  LeadInfoTemplate,
  LeadSource,
  LeadStatus,
  LeadStatusOption,
  LeadTask,
  LeadTaskStatusOption,
  LeadTaskTemplate,
  LeadPushStats,
} from '../types';

const statusLabels: Record<LeadStatus, string> = {
  new: 'Новый',
  contacted: 'Связались',
  no_answer: 'Недозвон',
  demo: 'Демо',
  invoice_sent: 'Инвойс отправлен',
  won: 'Успешно',
  lost: 'Закрыт',
};

const leadCommunicationChannelLabels: Record<LeadCommunicationChannel, string> = {
  max: 'MAX',
  email: 'почта',
  sms: 'смс',
  telegram: 'telegram',
};

const DEFAULT_CITY_OPTIONS = [
  'Алматы',
  'Астана',
  'Шымкент',
  'Караганда',
  'Актобе',
  'Павлодар',
  'Семей',
  'Усть-Каменогорск',
];

const normalizeRuPhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  return raw.trim();
};

const isValidRuPhone = (raw: string): boolean => /^\+7\d{10}$/.test(normalizeRuPhone(raw));
type LeadsTableSortField = 'created_at' | 'school_class' | 'school_name' | 'city';
type LeadsTableSortOrder = 'asc' | 'desc';

const SalesLeadsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isPipelineRoute = location.pathname === '/sales/pipeline';
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | ''>('');
  const [qFilter, setQFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [tasks, setTasks] = useState<LeadTask[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [taskNote, setTaskNote] = useState('');
  const [taskTemplateId, setTaskTemplateId] = useState<number | ''>('');
  const [taskStatusOptionId, setTaskStatusOptionId] = useState<number | ''>('');
  const [taskDueAt, setTaskDueAt] = useState('');
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
  const [taskTemplates, setTaskTemplates] = useState<LeadTaskTemplate[]>([]);
  const [taskStatusOptions, setTaskStatusOptions] = useState<LeadTaskStatusOption[]>([]);
  const [leadStatusOptions, setLeadStatusOptions] = useState<LeadStatusOption[]>([]);
  const [infoTemplates, setInfoTemplates] = useState<LeadInfoTemplate[]>([]);
  const [communications, setCommunications] = useState<LeadCommunication[]>([]);
  const [sendInfoOpen, setSendInfoOpen] = useState(false);
  const [sendInfoForm, setSendInfoForm] = useState({
    template_id: '',
    channel: 'messenger',
    message: '',
    follow_up_at: '',
    pause_reason: '',
  });
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [pendingLostLead, setPendingLostLead] = useState<Lead | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [registerEventOpen, setRegisterEventOpen] = useState(false);
  const [registerEventId, setRegisterEventId] = useState<number | ''>('');
  const [registerEventNote, setRegisterEventNote] = useState('');
  const [contactOutcome, setContactOutcome] = useState<'connected' | 'no_answer' | 'callback'>('connected');
  const [contactNote, setContactNote] = useState('');
  const [contactFollowUpAt, setContactFollowUpAt] = useState('');
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'info' | 'warning' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);
  const [tableCityFilter, setTableCityFilter] = useState('');
  const [tableSchoolFilter, setTableSchoolFilter] = useState('');
  const [tableClassFilter, setTableClassFilter] = useState('');
  const [tableSortField, setTableSortField] = useState<LeadsTableSortField>('created_at');
  const [tableSortOrder, setTableSortOrder] = useState<LeadsTableSortOrder>('desc');
  const [batchFollowUpOpen, setBatchFollowUpOpen] = useState(false);
  const [batchFollowUpAt, setBatchFollowUpAt] = useState('');
  const [batchSendOpen, setBatchSendOpen] = useState(false);
  const [batchTemplateId, setBatchTemplateId] = useState<number | ''>('');
  const [batchSendMessage, setBatchSendMessage] = useState('');
  const [batchSendChannel, setBatchSendChannel] = useState('messenger');
  const [batchSendFollowUpAt, setBatchSendFollowUpAt] = useState('');
  const [draggedLeadId, setDraggedLeadId] = useState<number | null>(null);
  const [dropConfirmOpen, setDropConfirmOpen] = useState(false);
  const [dropTargetStatus, setDropTargetStatus] = useState<LeadStatus | null>(null);
  const [dropLeadId, setDropLeadId] = useState<number | null>(null);
  const [dropFollowUpAt, setDropFollowUpAt] = useState('');
  const [dropEventId, setDropEventId] = useState<number | ''>('');
  const [dropEventNote, setDropEventNote] = useState('');
  const [leadCommentDraft, setLeadCommentDraft] = useState('');
  const [leadCommentSaving, setLeadCommentSaving] = useState(false);
  const [leadHeaderStatusDraft, setLeadHeaderStatusDraft] = useState<LeadStatus>('new');
  const [leadHeaderNextStepDraft, setLeadHeaderNextStepDraft] = useState('');
  const [leadHeaderNextContactDraft, setLeadHeaderNextContactDraft] = useState('');
  const [leadHeaderSaving, setLeadHeaderSaving] = useState(false);
  const [leadCardTab, setLeadCardTab] = useState<'overview' | 'push'>('overview');
  const [leadPushStatsMap, setLeadPushStatsMap] = useState<Record<number, LeadPushStats>>({});
  const [leadInfoSaving, setLeadInfoSaving] = useState(false);
  const [leadInfoDraft, setLeadInfoDraft] = useState({
    parent_full_name: '',
    parent_phone: '',
    child_full_name: '',
    child_phone: '',
    email: '',
    communication_channel: '' as '' | LeadCommunicationChannel,
    source: '',
    referral_name: '',
  });

  const [form, setForm] = useState({
    parent_full_name: '',
    child_full_name: '',
    parent_phone: '',
    child_phone: '',
    email: '',
    city: '',
    school_name: '',
    school_class: '',
    outreach_at: '',
    source_id: '',
    referral_name: '',
    tags: '',
    comment: '',
    next_contact_at: '',
  });

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await salesApi.listLeads({
        status_filter: statusFilter || undefined,
        q: qFilter.trim() || undefined,
        source: sourceFilter.trim() || undefined,
        tag: tagFilter.trim() || undefined,
        overdue_only: overdueOnly || undefined,
      });
      setLeads(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить лиды'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, qFilter, sourceFilter, tagFilter, overdueOnly]);

  const loadSalesMeta = useCallback(async () => {
    try {
      const [sources, templates, statuses, leadStatuses] = await Promise.all([
        salesApi.listLeadSources(true),
        salesApi.listLeadTaskTemplates(true),
        salesApi.listLeadTaskStatuses(true),
        salesApi.listLeadStatuses(true),
      ]);
      setLeadSources(sources);
      setTaskTemplates(templates);
      setTaskStatusOptions(statuses);
      setLeadStatusOptions(leadStatuses);
      const defaultOpen = statuses.find((s) => !s.is_closed);
      if (defaultOpen) {
        setTaskStatusOptionId(defaultOpen.id);
      }
      const infoTpl = await salesApi.listLeadInfoTemplates(true);
      setInfoTemplates(infoTpl);
      const eventsData = await salesApi.listEvents('active');
      setEvents(eventsData);
    } catch {
      // ignore metadata fetch errors in UI
    }
  }, []);

  useEffect(() => {
    loadLeads();
    loadSalesMeta();
  }, [loadLeads, loadSalesMeta]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const queryStatus = params.get('status');
    const queryOverdue = params.get('overdue');
    const queryQ = params.get('q');
    const queryView = params.get('view');
    const queryCreate = params.get('create');
    if (queryStatus && Object.keys(statusLabels).includes(queryStatus)) {
      setStatusFilter(queryStatus as LeadStatus);
    }
    if (queryOverdue === '1') {
      setOverdueOnly(true);
    }
    if (queryQ) {
      setQFilter(queryQ);
    }
    if (isPipelineRoute) {
      setViewMode('kanban');
    } else if (queryView === 'kanban') {
      setViewMode('kanban');
    } else if (queryView === 'table') {
      setViewMode('table');
    } else if (location.pathname === '/sales/leads') {
      // Keep leads page table-first by default.
      setViewMode('table');
    }
    if (queryCreate === '1') {
      handleOpenCreate();
    }
    // We keep params in URL for shareable filtered links.
  }, [isPipelineRoute, location.search, location.pathname]);

  useEffect(() => {
    setSelectedLeadIds((prev) => prev.filter((id) => leads.some((l) => l.id === id)));
  }, [leads]);

  useEffect(() => {
    const loadPushStats = async () => {
      if (leads.length === 0) {
        setLeadPushStatsMap({});
        return;
      }
      try {
        const stats = await salesApi.getLeadsPushStats(leads.map((l) => l.id));
        const map: Record<number, LeadPushStats> = {};
        stats.forEach((s) => {
          map[s.lead_id] = s;
        });
        setLeadPushStatsMap(map);
      } catch {
        // ignore; fallback estimate will be used
      }
    };
    void loadPushStats();
  }, [leads]);

  useEffect(() => {
    const leadIdParam = new URLSearchParams(location.search).get('leadId');
    const leadId = leadIdParam ? Number(leadIdParam) : NaN;
    if (!leadIdParam || Number.isNaN(leadId) || leads.length === 0) return;
    const targetLead = leads.find((lead) => lead.id === leadId);
    if (!targetLead) return;
    setSelectedLead(targetLead);
    setDetailsOpen(true);
    void loadLeadDetails(targetLead);
    navigate('/sales/leads', { replace: true });
  }, [location.search, leads, navigate]);

  const cityOptions = useMemo(() => {
    const citySet = new Set(DEFAULT_CITY_OPTIONS);
    leads.forEach((lead) => {
      const city = lead.city?.trim();
      if (city) citySet.add(city);
    });
    return Array.from(citySet).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [leads]);

  const schoolOptions = useMemo(() => {
    const schoolSet = new Set<string>();
    leads.forEach((lead) => {
      const schoolName = lead.school_name?.trim();
      if (schoolName) schoolSet.add(schoolName);
    });
    return Array.from(schoolSet).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [leads]);

  const classOptions = useMemo(() => {
    const classSet = new Set<string>();
    leads.forEach((lead) => {
      const schoolClass = lead.school_class?.trim();
      if (schoolClass) classSet.add(schoolClass);
    });
    return Array.from(classSet).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [leads]);

  const filteredSortedLeads = useMemo(() => {
    const normalizedSchoolFilter = tableSchoolFilter.trim().toLowerCase();
    const filtered = leads.filter((lead) => {
      if (tableCityFilter && (lead.city || '') !== tableCityFilter) return false;
      if (tableClassFilter && (lead.school_class || '') !== tableClassFilter) return false;
      if (
        normalizedSchoolFilter &&
        !(lead.school_name || '').toLowerCase().includes(normalizedSchoolFilter)
      ) {
        return false;
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (tableSortField === 'created_at') {
        const aTs = new Date(a.created_at).getTime();
        const bTs = new Date(b.created_at).getTime();
        return (Number.isNaN(aTs) ? 0 : aTs) - (Number.isNaN(bTs) ? 0 : bTs);
      }
      const av = (a[tableSortField] || '').toString();
      const bv = (b[tableSortField] || '').toString();
      return av.localeCompare(bv, 'ru', { sensitivity: 'base' });
    });

    return tableSortOrder === 'asc' ? sorted : sorted.reverse();
  }, [leads, tableCityFilter, tableClassFilter, tableSchoolFilter, tableSortField, tableSortOrder]);

  const selectedVisibleCount = useMemo(() => {
    const visibleIds = new Set(filteredSortedLeads.map((lead) => lead.id));
    return selectedLeadIds.filter((id) => visibleIds.has(id)).length;
  }, [filteredSortedLeads, selectedLeadIds]);

  const handleTableSort = (field: LeadsTableSortField) => {
    setTableSortField((prevField) => {
      if (prevField === field) {
        setTableSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        return prevField;
      }
      setTableSortOrder(field === 'created_at' ? 'desc' : 'asc');
      return field;
    });
  };

  const handleOpenCreate = () => {
    setForm({
      parent_full_name: '',
      child_full_name: '',
      parent_phone: '',
      child_phone: '',
      email: '',
      city: '',
      school_name: '',
      school_class: '',
      outreach_at: '',
      source_id: '',
      referral_name: '',
      tags: '',
      comment: '',
      next_contact_at: '',
    });
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    setError(null);
    try {
      const sourceIdNumber = form.source_id ? Number(form.source_id) : undefined;
      const selectedSource = leadSources.find((s) => s.id === sourceIdNumber);
      if (selectedSource?.name.toLowerCase() === 'рекомендация' && !form.referral_name.trim()) {
        setError('Для источника "рекомендация" укажите, кто пригласил');
        return;
      }
      if (form.parent_phone.trim() && !isValidRuPhone(form.parent_phone)) {
        setError('Телефон родителя должен быть в формате +7XXXXXXXXXX');
        return;
      }
      if (form.child_phone.trim() && !isValidRuPhone(form.child_phone)) {
        setError('Телефон школьника должен быть в формате +7XXXXXXXXXX');
        return;
      }
      const normalizedParentPhone = normalizeRuPhone(form.parent_phone);
      const normalizedChildPhone = normalizeRuPhone(form.child_phone);
      const contactName = form.parent_full_name || form.child_full_name || 'Без имени';
      const phone = normalizedParentPhone || normalizedChildPhone || 'не указан';
      await salesApi.createLead({
        contact_name: contactName,
        phone,
        parent_full_name: form.parent_full_name || undefined,
        child_full_name: form.child_full_name || undefined,
        parent_phone: normalizedParentPhone || undefined,
        child_phone: normalizedChildPhone || undefined,
        email: form.email || undefined,
        city: form.city || undefined,
        school_name: form.school_name || undefined,
        school_class: form.school_class || undefined,
        outreach_at: form.outreach_at
          ? (() => {
              const d = new Date(form.outreach_at);
              return isValid(d) ? d.toISOString() : undefined;
            })()
          : undefined,
        source_id: sourceIdNumber,
        source: selectedSource?.name,
        referral_name: form.referral_name || undefined,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        comment: form.comment || undefined,
        next_contact_at: form.next_contact_at
          ? (() => {
              const d = new Date(form.next_contact_at);
              return isValid(d) ? d.toISOString() : undefined;
            })()
          : undefined,
      });
      setCreateOpen(false);
      await loadLeads();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось создать лид'));
    }
  };

  const handleStatusChange = async (lead: Lead, newStatus: LeadStatus, statusOptionId?: number) => {
    if (lead.status === newStatus) return;
    if (newStatus === 'won') {
      const ok = window.confirm('Подтвердить перевод лида в "Успешно"?');
      if (!ok) return;
    }
    if (newStatus === 'lost') {
      setPendingLostLead(lead);
      setLostReason(lead.lost_reason || '');
      setLostDialogOpen(true);
      return;
    }
    setActionLoadingId(lead.id);
    setError(null);
    try {
      await salesApi.updateLead(lead.id, { status: newStatus, status_option_id: statusOptionId });
      await loadLeads();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось обновить статус лида'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const getLeadStatusMenuValue = (lead: Lead): string => {
    if (lead.status_option_id) return `option:${lead.status_option_id}`;
    return `base:${lead.status}`;
  };

  const getLeadStatusDisplay = (lead: Lead): string => {
    const selected = leadStatusOptions.find((s) => s.id === lead.status_option_id);
    return selected?.name || statusLabels[lead.status];
  };

  const handleLeadStatusSelectChange = async (lead: Lead, value: string) => {
    if (value.startsWith('option:')) {
      const optionId = Number(value.replace('option:', ''));
      const option = leadStatusOptions.find((s) => s.id === optionId);
      if (!option) return;
      await handleStatusChange(lead, option.base_status, option.id);
      return;
    }
    if (value.startsWith('base:')) {
      const baseStatus = value.replace('base:', '') as LeadStatus;
      await handleStatusChange(lead, baseStatus, undefined);
    }
  };

  const handleCommunicationChannelChange = async (
    lead: Lead,
    channel: '' | LeadCommunicationChannel
  ) => {
    const nextChannel = channel || undefined;
    if ((lead.communication_channel || undefined) === nextChannel) return;
    setActionLoadingId(lead.id);
    setError(null);
    try {
      const updated = await salesApi.updateLead(lead.id, {
        communication_channel: nextChannel,
      });
      setLeads((prev) =>
        prev.map((l) =>
          l.id === updated.id
            ? {
                ...l,
                communication_channel: updated.communication_channel,
              }
            : l
        )
      );
      if (selectedLead?.id === updated.id) {
        setSelectedLead((prev) =>
          prev
            ? {
                ...prev,
                communication_channel: updated.communication_channel,
              }
            : prev
        );
      }
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось обновить канал общения'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirmLost = async () => {
    if (!pendingLostLead) return;
    if (!lostReason.trim()) {
      setError('Укажите причину закрытия лида');
      return;
    }
    setActionLoadingId(pendingLostLead.id);
    setLostDialogOpen(false);
    setError(null);
    try {
      await salesApi.updateLead(pendingLostLead.id, {
        status: 'lost',
        lost_reason: lostReason.trim(),
      });
      await loadLeads();
      if (selectedLead && selectedLead.id === pendingLostLead.id) {
        setSelectedLead({ ...selectedLead, status: 'lost', lost_reason: lostReason.trim() });
      }
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось закрыть лид'));
    } finally {
      setActionLoadingId(null);
      setPendingLostLead(null);
      setLostReason('');
    }
  };

  const loadLeadDetails = async (lead: Lead) => {
    try {
      const [tasksData, invoicesData, commData] = await Promise.all([
        salesApi.listTasks(lead.id),
        salesApi.listInvoices(lead.id),
        salesApi.listLeadCommunications(lead.id),
      ]);
      setTasks(tasksData);
      setInvoices(invoicesData);
      setCommunications(commData);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить карточку лида'));
    }
  };

  const handleOpenDetails = async (lead: Lead) => {
    setSelectedLead(lead);
    setDetailsOpen(true);
    setContactOutcome('connected');
    setContactNote('');
    setContactFollowUpAt('');
    setLeadCommentDraft(lead.comment || '');
    setLeadHeaderStatusDraft(lead.status);
    setLeadHeaderNextStepDraft(lead.desired_slot || '');
    setLeadHeaderNextContactDraft(
      lead.next_contact_at
        ? format(new Date(lead.next_contact_at), "yyyy-MM-dd'T'HH:mm")
        : ''
    );
    setLeadInfoDraft({
      parent_full_name: lead.parent_full_name || '',
      parent_phone: lead.parent_phone || '',
      child_full_name: lead.child_full_name || '',
      child_phone: lead.child_phone || '',
      email: lead.email || '',
      communication_channel: (lead.communication_channel as LeadCommunicationChannel | null) || '',
      source: lead.source || '',
      referral_name: lead.referral_name || '',
    });
    await loadLeadDetails(lead);
  };

  const handleCreateTask = async () => {
    if (!selectedLead) return;
    if (!taskTemplateId) {
      setError('Выберите задачу из списка');
      return;
    }
    try {
      await salesApi.createTask(selectedLead.id, {
        template_id: Number(taskTemplateId),
        status_option_id: taskStatusOptionId ? Number(taskStatusOptionId) : undefined,
        note: taskNote.trim(),
        due_at: taskDueAt ? new Date(taskDueAt).toISOString() : undefined,
      });
      setTaskTemplateId('');
      setTaskNote('');
      setTaskDueAt('');
      await loadLeadDetails(selectedLead);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось создать задачу'));
    }
  };

  const handleCloseTask = async (task: LeadTask) => {
    if (!selectedLead) return;
    try {
      await salesApi.closeTask(selectedLead.id, task.id);
      await loadLeadDetails(selectedLead);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось закрыть задачу'));
    }
  };

  const handleCreateAndSendInvoice = async (lead: Lead) => {
    setActionLoadingId(lead.id);
    setError(null);
    try {
      if (!lead.abonement_id) {
        setError('Для создания инвойса у лида должен быть выбран абонемент');
        return;
      }
      const invoice = await salesApi.createInvoice(lead.id, {
        abonement_id: lead.abonement_id,
        email_to: lead.email || undefined,
      });
      await salesApi.sendInvoiceEmail(invoice.id);
      await loadLeads();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось создать/отправить инвойс'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenSendInfo = () => {
    setSendInfoForm({
      template_id: '',
      channel: 'messenger',
      message: '',
      follow_up_at: '',
      pause_reason: '',
    });
    setSendInfoOpen(true);
  };

  const handleQuickCommunication = async (channel: 'call' | 'messenger') => {
    if (!selectedLead) return;
    try {
      await salesApi.logLeadCommunication(selectedLead.id, {
        channel,
        message: channel === 'call' ? '[quick-call] Быстрый звонок' : '[quick-messenger] Быстрое сообщение',
      });
      await loadLeadDetails(selectedLead);
      await loadLeads();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось зафиксировать коммуникацию'));
    }
  };

  const handleRowQuickCall = async (lead: Lead) => {
    try {
      await salesApi.saveLeadContactResult(lead.id, {
        outcome: 'connected',
        note: '[row-quick-call]',
      });
      await loadLeads();
      if (selectedLead?.id === lead.id) {
        await loadLeadDetails(lead);
      }
      setToast({ open: true, message: 'Звонок зафиксирован', severity: 'success' });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось зафиксировать звонок'));
    }
  };

  const handleRowQuickMessage = async (lead: Lead) => {
    try {
      await salesApi.logLeadCommunication(lead.id, {
        channel: 'messenger',
        message: '[row-quick-message]',
      });
      await loadLeads();
      if (selectedLead?.id === lead.id) {
        await loadLeadDetails(lead);
      }
      setToast({ open: true, message: 'Сообщение зафиксировано', severity: 'info' });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось зафиксировать сообщение'));
    }
  };

  const handleRowQuickFollowUp = async (lead: Lead) => {
    const pushTemplate = taskTemplates.find((t) => t.name.toLowerCase().includes('дожим')) || taskTemplates[0];
    if (!pushTemplate) {
      setError('Сначала добавьте шаблон задачи в справочниках');
      return;
    }
    const due = new Date();
    due.setHours(due.getHours() + 24);
    try {
      await salesApi.createTask(lead.id, {
        template_id: pushTemplate.id,
        status_option_id: taskStatusOptionId ? Number(taskStatusOptionId) : undefined,
        note: '[row-quick-follow-up]',
        channel: 'call',
        due_at: due.toISOString(),
      });
      await loadLeads();
      if (selectedLead?.id === lead.id) {
        await loadLeadDetails(lead);
      }
      setToast({
        open: true,
        message: `Follow-up назначен: ${format(due, 'dd.MM.yyyy HH:mm')}`,
        severity: 'warning',
      });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось назначить follow-up'));
    }
  };

  const handleRowQuickSendInfo = (lead: Lead) => {
    setSelectedLead(lead);
    setSendInfoForm({
      template_id: '',
      channel: 'messenger',
      message: '',
      follow_up_at: '',
      pause_reason: '',
    });
    setSendInfoOpen(true);
  };

  const handleRowQuickCloseLead = (lead: Lead) => {
    setPendingLostLead(lead);
    setLostReason(lead.lost_reason || '');
    setLostDialogOpen(true);
  };

  const toggleLeadSelection = (leadId: number, checked: boolean) => {
    setSelectedLeadIds((prev) => {
      if (checked) {
        if (prev.includes(leadId)) return prev;
        return [...prev, leadId];
      }
      return prev.filter((id) => id !== leadId);
    });
  };

  const handleSelectAllVisible = (checked: boolean) => {
    const visibleIds = filteredSortedLeads.map((l) => l.id);
    if (!checked) {
      setSelectedLeadIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedLeadIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const handleBatchAssignFollowUp = async () => {
    if (!batchFollowUpAt) {
      setError('Укажите дату follow-up');
      return;
    }
    const pushTemplate = taskTemplates.find((t) => t.name.toLowerCase().includes('дожим')) || taskTemplates[0];
    if (!pushTemplate) {
      setError('Сначала добавьте шаблон задачи в справочниках');
      return;
    }
    const dueIso = new Date(batchFollowUpAt).toISOString();
    const results = await Promise.allSettled(
      selectedLeadIds.map((leadId) =>
        salesApi.createTask(leadId, {
          template_id: pushTemplate.id,
          status_option_id: taskStatusOptionId ? Number(taskStatusOptionId) : undefined,
          note: '[batch-follow-up]',
          channel: 'call',
          due_at: dueIso,
        })
      )
    );
    const success = results.filter((r) => r.status === 'fulfilled').length;
    const failedIds = results
      .map((r, idx) => (r.status === 'rejected' ? selectedLeadIds[idx] : null))
      .filter((id): id is number => id !== null);
    const failed = failedIds.length;
    const failedNames = leads
      .filter((l) => failedIds.includes(l.id))
      .map((l) => l.contact_name)
      .slice(0, 3);
    await loadLeads();
    if (selectedLead && selectedLeadIds.includes(selectedLead.id)) {
      await loadLeadDetails(selectedLead);
    }
    setBatchFollowUpOpen(false);
    setBatchFollowUpAt('');
    setToast({
      open: true,
      message: failed
        ? `Follow-up назначен: ${success}, ошибок: ${failed}. ${failedNames.length ? `Проблемные лиды: ${failedNames.join(', ')}` : ''}`
        : `Follow-up назначен: ${success}`,
      severity: failed ? 'warning' : 'success',
    });
  };

  const handleBatchTemplateChange = (value: number | '') => {
    setBatchTemplateId(value);
    const tpl = infoTemplates.find((t) => t.id === value);
    if (tpl) {
      setBatchSendMessage(tpl.body);
    }
  };

  const handleBatchSendTemplate = async () => {
    if (!batchSendMessage.trim()) {
      setError('Введите сообщение или выберите шаблон');
      return;
    }
    if (!batchSendFollowUpAt) {
      setError('Укажите follow-up дату');
      return;
    }
    const followUpIso = new Date(batchSendFollowUpAt).toISOString();
    const results = await Promise.allSettled(
      selectedLeadIds.map((leadId) =>
        salesApi.sendLeadInfo(leadId, {
          template_id: batchTemplateId ? Number(batchTemplateId) : undefined,
          channel: batchSendChannel,
          message: batchSendMessage.trim(),
          follow_up_at: followUpIso,
        })
      )
    );
    const success = results.filter((r) => r.status === 'fulfilled').length;
    const failedIds = results
      .map((r, idx) => (r.status === 'rejected' ? selectedLeadIds[idx] : null))
      .filter((id): id is number => id !== null);
    const failed = failedIds.length;
    const failedNames = leads
      .filter((l) => failedIds.includes(l.id))
      .map((l) => l.contact_name)
      .slice(0, 3);
    await loadLeads();
    if (selectedLead && selectedLeadIds.includes(selectedLead.id)) {
      await loadLeadDetails(selectedLead);
    }
    setBatchSendOpen(false);
    setBatchTemplateId('');
    setBatchSendMessage('');
    setBatchSendFollowUpAt('');
    setToast({
      open: true,
      message: failed
        ? `Инфо отправлено: ${success}, ошибок: ${failed}. ${failedNames.length ? `Проблемные лиды: ${failedNames.join(', ')}` : ''}`
        : `Инфо отправлено: ${success}`,
      severity: failed ? 'warning' : 'success',
    });
  };

  const handleSaveContactResult = async () => {
    if (!selectedLead) return;
    if ((contactOutcome === 'no_answer' || contactOutcome === 'callback') && !contactFollowUpAt) {
      setError('Для "Не дозвон" и "Перезвонить" укажите follow-up дату');
      return;
    }
    try {
      await salesApi.saveLeadContactResult(selectedLead.id, {
        outcome: contactOutcome,
        note: contactNote.trim() || undefined,
        follow_up_at: contactFollowUpAt ? new Date(contactFollowUpAt).toISOString() : undefined,
      });
      setContactNote('');
      setContactFollowUpAt('');
      await loadLeadDetails(selectedLead);
      await loadLeads();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить результат контакта'));
    }
  };

  const submitOneClickContactResult = async (outcome: 'connected' | 'no_answer' | 'callback') => {
    if (!selectedLead) return;
    let followUpIso: string | undefined;
    if (outcome === 'no_answer') {
      const d = new Date();
      d.setHours(d.getHours() + 24);
      followUpIso = d.toISOString();
    }
    if (outcome === 'callback') {
      const d = new Date();
      d.setHours(d.getHours() + 2);
      followUpIso = d.toISOString();
    }
    try {
      await salesApi.saveLeadContactResult(selectedLead.id, {
        outcome,
        note: '[one-click]',
        follow_up_at: followUpIso,
      });
      await loadLeadDetails(selectedLead);
      await loadLeads();
      if (outcome === 'connected') {
        setToast({ open: true, message: 'Дозвон сохранен', severity: 'success' });
      } else if (outcome === 'no_answer') {
        setToast({
          open: true,
          message: `Не дозвон сохранен, follow-up: ${format(new Date(followUpIso as string), 'dd.MM.yyyy HH:mm')}`,
          severity: 'warning',
        });
      } else {
        setToast({
          open: true,
          message: `Перезвон сохранен, follow-up: ${format(new Date(followUpIso as string), 'dd.MM.yyyy HH:mm')}`,
          severity: 'info',
        });
      }
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить быстрый результат'));
    }
  };

  useEffect(() => {
    if (!detailsOpen || !selectedLead) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = (target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
          return;
        }
      }
      if (e.key === '1') {
        e.preventDefault();
        void submitOneClickContactResult('connected');
      }
      if (e.key === '2') {
        e.preventDefault();
        void submitOneClickContactResult('no_answer');
      }
      if (e.key === '3') {
        e.preventDefault();
        void submitOneClickContactResult('callback');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [detailsOpen, selectedLead]);

  useEffect(() => {
    if (!selectedLead) return;
    setLeadCommentDraft(selectedLead.comment || '');
  }, [selectedLead?.id]);

  useEffect(() => {
    if (!selectedLead) return;
    setLeadInfoDraft({
      parent_full_name: selectedLead.parent_full_name || '',
      parent_phone: selectedLead.parent_phone || '',
      child_full_name: selectedLead.child_full_name || '',
      child_phone: selectedLead.child_phone || '',
      email: selectedLead.email || '',
      communication_channel: (selectedLead.communication_channel as LeadCommunicationChannel | null) || '',
      source: selectedLead.source || '',
      referral_name: selectedLead.referral_name || '',
    });
  }, [selectedLead?.id]);

  useEffect(() => {
    if (!selectedLead) return;
    setLeadHeaderStatusDraft(selectedLead.status);
    setLeadHeaderNextStepDraft(selectedLead.desired_slot || '');
    setLeadHeaderNextContactDraft(
      selectedLead.next_contact_at
        ? format(new Date(selectedLead.next_contact_at), "yyyy-MM-dd'T'HH:mm")
        : ''
    );
  }, [selectedLead?.id]);

  useEffect(() => {
    if (!selectedLead) return;
    if ((selectedLead.comment || '') === leadCommentDraft) return;
    const timer = window.setTimeout(async () => {
      try {
        setLeadCommentSaving(true);
        const updated = await salesApi.updateLead(selectedLead.id, {
          comment: leadCommentDraft.trim() || undefined,
        });
        setSelectedLead((prev) => (prev ? { ...prev, comment: updated.comment } : prev));
        setLeads((prev) => prev.map((l) => (l.id === updated.id ? { ...l, comment: updated.comment } : l)));
      } catch (err: any) {
        setError(extractApiError(err, 'Не удалось автосохранить заметку'));
      } finally {
        setLeadCommentSaving(false);
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [leadCommentDraft, selectedLead]);

  useEffect(() => {
    if (!selectedLead) return;
    const currentNextContactLocal = selectedLead.next_contact_at
      ? format(new Date(selectedLead.next_contact_at), "yyyy-MM-dd'T'HH:mm")
      : '';
    if (
      selectedLead.status === leadHeaderStatusDraft &&
      (selectedLead.desired_slot || '') === leadHeaderNextStepDraft &&
      currentNextContactLocal === leadHeaderNextContactDraft
    ) {
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        setLeadHeaderSaving(true);
        let nextContactIso: string | undefined;
        if (leadHeaderNextContactDraft) {
          const d = new Date(leadHeaderNextContactDraft);
          if (!isValid(d)) {
            setError('Неверная дата next contact');
            return;
          }
          nextContactIso = d.toISOString();
        }
        const updated = await salesApi.updateLead(selectedLead.id, {
          status: leadHeaderStatusDraft,
          desired_slot: leadHeaderNextStepDraft.trim() || undefined,
          next_contact_at: nextContactIso,
        });
        setSelectedLead((prev) =>
          prev
            ? {
                ...prev,
                status: updated.status,
                desired_slot: updated.desired_slot,
                next_contact_at: updated.next_contact_at,
              }
            : prev
        );
        setLeads((prev) =>
          prev.map((l) =>
            l.id === updated.id
              ? {
                  ...l,
                  status: updated.status,
                  desired_slot: updated.desired_slot,
                  next_contact_at: updated.next_contact_at,
                }
              : l
          )
        );
      } catch (err: any) {
        setError(extractApiError(err, 'Не удалось автосохранить шапку лида'));
      } finally {
        setLeadHeaderSaving(false);
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [leadHeaderStatusDraft, leadHeaderNextStepDraft, leadHeaderNextContactDraft, selectedLead]);

  const handleSaveLeadInfo = async () => {
    if (!selectedLead) return;
    try {
      setLeadInfoSaving(true);
      const updated = await salesApi.updateLead(selectedLead.id, {
        parent_full_name: leadInfoDraft.parent_full_name.trim() || undefined,
        parent_phone: normalizeRuPhone(leadInfoDraft.parent_phone) || undefined,
        child_full_name: leadInfoDraft.child_full_name.trim() || undefined,
        child_phone: normalizeRuPhone(leadInfoDraft.child_phone) || undefined,
        email: leadInfoDraft.email.trim() || undefined,
        communication_channel: leadInfoDraft.communication_channel || undefined,
        source: leadInfoDraft.source.trim() || undefined,
        referral_name: leadInfoDraft.referral_name.trim() || undefined,
      });
      setSelectedLead(updated);
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setToast({ open: true, message: 'Информация лида обновлена', severity: 'success' });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить информацию лида'));
    } finally {
      setLeadInfoSaving(false);
    }
  };

  const handleTemplateChange = (templateIdStr: string) => {
    const tpl = infoTemplates.find((t) => String(t.id) === templateIdStr);
    setSendInfoForm((s) => ({
      ...s,
      template_id: templateIdStr,
      message: tpl?.body || s.message,
    }));
  };

  const handleSendInfo = async () => {
    if (!selectedLead) return;
    if (!sendInfoForm.message.trim()) {
      setError('Введите текст отправки');
      return;
    }
    if (!sendInfoForm.follow_up_at) {
      setError('Укажите обязательный follow-up');
      return;
    }
    if (sendInfoForm.pause_reason && !['ждём ответ', 'подумать', 'нет времени'].includes(sendInfoForm.pause_reason)) {
      setError('Недопустимая причина паузы');
      return;
    }
    try {
      await salesApi.sendLeadInfo(selectedLead.id, {
        template_id: sendInfoForm.template_id ? Number(sendInfoForm.template_id) : undefined,
        channel: sendInfoForm.channel,
        message: sendInfoForm.message.trim(),
        follow_up_at: new Date(sendInfoForm.follow_up_at).toISOString(),
        pause_reason: sendInfoForm.pause_reason || undefined,
      });
      setSendInfoOpen(false);
      await loadLeadDetails(selectedLead);
      await loadLeads();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось отправить инфо'));
    }
  };

  const handleAssignPush = async () => {
    if (!selectedLead) return;
    const pushTemplate = taskTemplates.find((t) => t.name.toLowerCase().includes('дожим')) || taskTemplates[0];
    if (!pushTemplate) {
      setError('Сначала добавьте шаблон задачи в справочниках');
      return;
    }
    const due = new Date();
    due.setHours(due.getHours() + 24);
    try {
      await salesApi.createTask(selectedLead.id, {
        template_id: pushTemplate.id,
        status_option_id: taskStatusOptionId ? Number(taskStatusOptionId) : undefined,
        note: 'Быстрый дожим',
        channel: 'call',
        due_at: due.toISOString(),
      });
      await loadLeadDetails(selectedLead);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось назначить дожим'));
    }
  };

  const handleAssignPushTemplateStep = async (step: 'first' | 'second' | 'final') => {
    if (!selectedLead) return;
    const pushTemplate = taskTemplates.find((t) => t.name.toLowerCase().includes('дожим')) || taskTemplates[0];
    if (!pushTemplate) {
      setError('Сначала добавьте шаблон задачи в справочниках');
      return;
    }
    const due = new Date();
    let note = '';
    if (step === 'first') {
      due.setHours(due.getHours() + 24);
      note = 'Дожим: 1-й контакт';
    } else if (step === 'second') {
      due.setHours(due.getHours() + 48);
      note = 'Дожим: 2-й контакт';
    } else {
      due.setHours(due.getHours() + 72);
      note = 'Дожим: финальный контакт';
    }
    try {
      await salesApi.createTask(selectedLead.id, {
        template_id: pushTemplate.id,
        status_option_id: taskStatusOptionId ? Number(taskStatusOptionId) : undefined,
        note,
        channel: 'call',
        due_at: due.toISOString(),
      });
      await loadLeadDetails(selectedLead);
      setToast({
        open: true,
        message: `${note} добавлен`,
        severity: 'success',
      });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось добавить шаг дожима'));
    }
  };

  const handleOpenRegisterEvent = () => {
    const now = new Date();
    const nearest = events
      .filter((ev) => {
        const d = parseISO(ev.starts_at);
        return isValid(d) && d.getTime() >= now.getTime();
      })
      .sort((a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime())[0];
    setRegisterEventId(nearest?.id || events[0]?.id || '');
    setRegisterEventNote('');
    setRegisterEventOpen(true);
  };

  const formatEventOptionLabel = (ev: EventItem) => {
    const d = parseISO(ev.starts_at);
    const dateLabel = isValid(d) ? format(d, 'dd.MM.yyyy HH:mm') : ev.starts_at;
    return `${ev.title} — ${dateLabel}`;
  };

  const handleRegisterToEvent = async () => {
    if (!selectedLead) return;
    if (!registerEventId) {
      setError('Выберите мероприятие');
      return;
    }
    try {
      await salesApi.registerLeadToEvent(Number(registerEventId), {
        lead_id: selectedLead.id,
        note: registerEventNote.trim() || undefined,
      });
      setRegisterEventOpen(false);
      setToast({ open: true, message: 'Лид записан на мероприятие', severity: 'success' });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось записать на мероприятие'));
    }
  };

  const handleQuickRegisterToNearestEvent = async () => {
    if (!selectedLead) return;
    const now = new Date();
    const nearest = events
      .filter((ev) => {
        const d = parseISO(ev.starts_at);
        return isValid(d) && d.getTime() >= now.getTime();
      })
      .sort((a, b) => parseISO(a.starts_at).getTime() - parseISO(b.starts_at).getTime())[0];
    if (!nearest) {
      setError('Нет ближайших активных мероприятий');
      return;
    }
    try {
      await salesApi.registerLeadToEvent(nearest.id, { lead_id: selectedLead.id });
      setToast({
        open: true,
        message: `Лид записан: ${formatEventOptionLabel(nearest)}`,
        severity: 'success',
      });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось записать на ближайшее мероприятие'));
    }
  };

  const handleQuickCloseLead = () => {
    if (!selectedLead) return;
    setPendingLostLead(selectedLead);
    setLostReason(selectedLead.lost_reason || '');
    setLostDialogOpen(true);
  };

  const handleImportLeads = async (file: File | null) => {
    if (!file) return;
    setError(null);
    try {
      const result = await salesApi.importLeadsXlsx(file);
      await loadLeads();
      if (result.errors?.length) {
        setError(`Импорт завершен: создано ${result.created}, пропущено ${result.skipped}. Ошибки: ${result.errors.join('; ')}`);
      } else {
        setError(`Импорт завершен: создано ${result.created}, пропущено ${result.skipped}`);
      }
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось импортировать Excel'));
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await salesApi.downloadLeadsImportTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leads_import_template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось скачать шаблон Excel'));
    }
  };

  const badgeColor = (status: LeadStatus) => {
    switch (status) {
      case 'won':
        return 'success';
      case 'lost':
        return 'default';
      case 'invoice_sent':
        return 'info';
      case 'no_answer':
      case 'demo':
        return 'warning';
      default:
        return 'primary';
    }
  };

  const getKanbanBorderColor = (nextContactAt?: string | null) => {
    if (!nextContactAt) return '#9ca3af';
    const d = parseISO(nextContactAt);
    if (!isValid(d)) return '#9ca3af';
    const now = new Date();
    if (d.getTime() < now.getTime()) return '#ef4444';
    if (d.toDateString() === now.toDateString()) return '#f59e0b';
    return '#9ca3af';
  };
  const getKanbanPushProgressEstimate = (lead: Lead): { percent: number; label: string } => {
    const real = leadPushStatsMap[lead.id];
    if (real) {
      if (real.total_steps > 0) {
        return {
          percent: real.progress_percent,
          label: `${real.done_steps}/${real.total_steps} шагов`,
        };
      }
      if (lead.status === 'won') return { percent: 100, label: 'оплачено' };
      if (lead.status === 'lost') return { percent: 100, label: 'закрыто' };
      return { percent: 0, label: 'нет шагов' };
    }
    const byStatus: Record<LeadStatus, number> = {
      new: 0,
      contacted: 30,
      no_answer: 40,
      demo: 55,
      invoice_sent: 80,
      won: 100,
      lost: 100,
    };
    const base = byStatus[lead.status] ?? 0;
    if (lead.status === 'contacted' || lead.status === 'no_answer' || lead.status === 'demo' || lead.status === 'invoice_sent') {
      if (!lead.next_contact_at) {
        return { percent: Math.max(base - 10, 0), label: 'без follow-up' };
      }
    }
    if (lead.status === 'won') return { percent: 100, label: 'оплачено' };
    if (lead.status === 'lost') return { percent: 100, label: 'закрыто' };
    return { percent: base, label: 'дожим' };
  };

  const requiresFollowUpOnDrop = (status: LeadStatus) =>
    status === 'contacted' || status === 'no_answer' || status === 'demo' || status === 'invoice_sent';

  const handleKanbanDrop = (targetStatus: LeadStatus) => {
    if (!draggedLeadId) return;
    const lead = leads.find((l) => l.id === draggedLeadId);
    setDraggedLeadId(null);
    if (!lead || lead.status === targetStatus) return;
    setDropLeadId(lead.id);
    setDropTargetStatus(targetStatus);
    setDropFollowUpAt('');
    setDropEventId('');
    setDropEventNote('');
    setDropConfirmOpen(true);
  };

  const handleConfirmKanbanDrop = async () => {
    if (!dropLeadId || !dropTargetStatus) return;
    const lead = leads.find((l) => l.id === dropLeadId);
    if (!lead) {
      setDropConfirmOpen(false);
      return;
    }
    let nextContactAtIso: string | undefined;
    if (requiresFollowUpOnDrop(dropTargetStatus) && !lead.next_contact_at) {
      if (!dropFollowUpAt) {
        setError('Для этой стадии укажите follow-up');
        return;
      }
      const d = new Date(dropFollowUpAt);
      if (!isValid(d)) {
        setError('Неверная дата follow-up');
        return;
      }
      nextContactAtIso = d.toISOString();
    }
    try {
      await salesApi.updateLead(lead.id, {
        status: dropTargetStatus,
        next_contact_at: nextContactAtIso,
      });
      
      // Если переносим в "demo" и выбрано мероприятие — записываем на него
      if (dropTargetStatus === 'demo' && dropEventId) {
        try {
          await salesApi.registerLeadToEvent(Number(dropEventId), {
            lead_id: lead.id,
            note: dropEventNote || undefined,
          });
          setToast({
            open: true,
            message: `Лид "${lead.contact_name}" записан на пробное занятие`,
            severity: 'success',
          });
        } catch (regErr: any) {
          setError(extractApiError(regErr, 'Не удалось записать на мероприятие'));
        }
      }
      
      await loadLeads();
      if (selectedLead?.id === lead.id) {
        setSelectedLead((prev) =>
          prev
            ? {
                ...prev,
                status: dropTargetStatus,
                next_contact_at: nextContactAtIso || prev.next_contact_at,
              }
            : prev
        );
      }
      setDropConfirmOpen(false);
      setDropLeadId(null);
      setDropTargetStatus(null);
      setDropFollowUpAt('');
      setDropEventId('');
      setDropEventNote('');
      setToast({
        open: true,
        message: `Лид "${lead.contact_name}" перенесен в "${statusLabels[dropTargetStatus]}"`,
        severity: 'success',
      });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось перенести лид в стадию'));
    }
  };

  const statusOptions = useMemo(() => Object.keys(statusLabels) as LeadStatus[], []);
  const kanbanColumns = useMemo(
    () =>
      statusOptions.map((st) => ({
        status: st,
        title: statusLabels[st],
        leads: leads.filter((l) => l.status === st),
      })),
    [leads, statusOptions]
  );
  const isValidEmail = (email?: string | null) => !!email && /\S+@\S+\.\S+/.test(email);
  const pushTasks = useMemo(
    () =>
      tasks.filter((t) => {
        const templateName = taskTemplates.find((tpl) => tpl.id === t.template_id)?.name?.toLowerCase() || '';
        const note = (t.note || '').toLowerCase();
        return templateName.includes('дожим') || note.includes('дожим') || note.includes('push');
      }),
    [tasks, taskTemplates]
  );
  const pushDoneCount = useMemo(
    () => pushTasks.filter((t) => t.status === 'done').length,
    [pushTasks]
  );
  const pushProgressPercent = useMemo(
    () => (pushTasks.length ? Math.round((pushDoneCount / pushTasks.length) * 100) : 0),
    [pushDoneCount, pushTasks.length]
  );

  return (
    <Layout>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1.5}>
        <Typography variant="h4">{isPipelineRoute ? 'Воронка' : 'Лиды'}</Typography>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          {!isPipelineRoute && (
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              size="small"
              onChange={(_, v) => {
                if (v) setViewMode(v);
              }}
            >
              <ToggleButton value="table">Таблица</ToggleButton>
              <ToggleButton value="kanban">Воронка</ToggleButton>
            </ToggleButtonGroup>
          )}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="status-filter-label">Статус</InputLabel>
            <Select
              labelId="status-filter-label"
              label="Статус"
              value={statusFilter}
              onChange={(e) => setStatusFilter((e.target.value as LeadStatus) || '')}
            >
              <MenuItem value="">Все</MenuItem>
              {statusOptions.map((st) => (
                <MenuItem key={st} value={st}>
                  {statusLabels[st]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Поиск"
            value={qFilter}
            onChange={(e) => setQFilter(e.target.value)}
          />
          <TextField
            size="small"
            label="Источник"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          />
          <TextField
            size="small"
            label="Тег"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          />
          <Button variant={overdueOnly ? 'contained' : 'outlined'} size="small" onClick={() => setOverdueOnly((v) => !v)}>
            Просроченные
          </Button>
          <Button size="small" variant="contained" onClick={handleOpenCreate} sx={{ whiteSpace: 'nowrap' }}>
            Новый лид
          </Button>
          <Button size="small" variant="outlined" component="label" sx={{ whiteSpace: 'nowrap' }}>
            Импорт из Excel
            <input
              type="file"
              hidden
              accept=".xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                void handleImportLeads(file);
                e.currentTarget.value = '';
              }}
            />
          </Button>
          <Button size="small" variant="text" onClick={handleDownloadTemplate} sx={{ whiteSpace: 'nowrap' }}>
            Шаблон Excel
          </Button>
        </Stack>
      </Stack>

      {viewMode === 'table' && (
        <Stack direction="row" spacing={1} mb={1.25} flexWrap="wrap" useFlexGap>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="table-city-filter-label">Город (быстрый)</InputLabel>
            <Select
              labelId="table-city-filter-label"
              label="Город (быстрый)"
              value={tableCityFilter}
              onChange={(e) => setTableCityFilter(e.target.value as string)}
            >
              <MenuItem value="">Все города</MenuItem>
              {cityOptions.map((city) => (
                <MenuItem key={city} value={city}>
                  {city}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="table-class-filter-label">Класс (быстрый)</InputLabel>
            <Select
              labelId="table-class-filter-label"
              label="Класс (быстрый)"
              value={tableClassFilter}
              onChange={(e) => setTableClassFilter(e.target.value as string)}
            >
              <MenuItem value="">Все классы</MenuItem>
              {classOptions.map((schoolClass) => (
                <MenuItem key={schoolClass} value={schoolClass}>
                  {schoolClass}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Autocomplete
            freeSolo
            options={schoolOptions}
            value={tableSchoolFilter}
            onChange={(_, value) => setTableSchoolFilter(value || '')}
            onInputChange={(_, value) => setTableSchoolFilter(value)}
            sx={{ minWidth: 250 }}
            renderInput={(params) => <TextField {...params} size="small" label="Школа (быстрый поиск)" />}
          />
          <Button
            size="small"
            variant="text"
            onClick={() => {
              setTableCityFilter('');
              setTableClassFilter('');
              setTableSchoolFilter('');
            }}
          >
            Сбросить быстрые фильтры
          </Button>
        </Stack>
      )}

      {viewMode === 'table' && (
        <Stack direction="row" spacing={1} mb={1.5}>
          <Button
            size="small"
            variant="outlined"
            disabled={selectedLeadIds.length === 0}
            onClick={() => setBatchFollowUpOpen(true)}
          >
            Массовый follow-up ({selectedLeadIds.length})
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={selectedLeadIds.length === 0}
            onClick={() => setBatchSendOpen(true)}
          >
            Массовая отправка шаблона
          </Button>
        </Stack>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} lg={detailsOpen ? 7 : 12}>
      {viewMode === 'table' ? (
      <TableContainer sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: 1280 }}>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Checkbox
                checked={filteredSortedLeads.length > 0 && selectedVisibleCount === filteredSortedLeads.length}
                indeterminate={selectedVisibleCount > 0 && selectedVisibleCount < filteredSortedLeads.length}
                onChange={(e) => handleSelectAllVisible(e.target.checked)}
              />
            </TableCell>
            <TableCell>Клиент</TableCell>
            <TableCell>Контакты</TableCell>
            <TableCell>Статус</TableCell>
            <TableCell>Источник</TableCell>
            <TableCell>Канал общения</TableCell>
            <TableCell sortDirection={tableSortField === 'school_class' ? tableSortOrder : false}>
              <TableSortLabel
                active={tableSortField === 'school_class'}
                direction={tableSortField === 'school_class' ? tableSortOrder : 'asc'}
                onClick={() => handleTableSort('school_class')}
              >
                Класс
              </TableSortLabel>
            </TableCell>
            <TableCell sortDirection={tableSortField === 'school_name' ? tableSortOrder : false}>
              <TableSortLabel
                active={tableSortField === 'school_name'}
                direction={tableSortField === 'school_name' ? tableSortOrder : 'asc'}
                onClick={() => handleTableSort('school_name')}
              >
                Школа
              </TableSortLabel>
            </TableCell>
            <TableCell sortDirection={tableSortField === 'city' ? tableSortOrder : false}>
              <TableSortLabel
                active={tableSortField === 'city'}
                direction={tableSortField === 'city' ? tableSortOrder : 'asc'}
                onClick={() => handleTableSort('city')}
              >
                Город
              </TableSortLabel>
            </TableCell>
            <TableCell>След. контакт</TableCell>
            <TableCell sortDirection={tableSortField === 'created_at' ? tableSortOrder : false}>
              <TableSortLabel
                active={tableSortField === 'created_at'}
                direction={tableSortField === 'created_at' ? tableSortOrder : 'desc'}
                onClick={() => handleTableSort('created_at')}
              >
                Создан
              </TableSortLabel>
            </TableCell>
            <TableCell align="right">Действия</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredSortedLeads.map((lead) => (
            <TableRow
              key={lead.id}
              hover
              selected={selectedLead?.id === lead.id}
              onClick={() => {
                void handleOpenDetails(lead);
              }}
              sx={{ cursor: 'pointer' }}
            >
              <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedLeadIds.includes(lead.id)}
                  onChange={(e) => toggleLeadSelection(lead.id, e.target.checked)}
                />
              </TableCell>
              <TableCell>
                <Stack spacing={0.5}>
                  <Typography variant="subtitle2">{lead.contact_name}</Typography>
                </Stack>
              </TableCell>
              <TableCell>
                <Stack spacing={0.5}>
                  <Typography variant="body2">{lead.phone}</Typography>
                  {lead.email && (
                    <Typography variant="caption" color="text.secondary">
                      {lead.email}
                    </Typography>
                  )}
                </Stack>
              </TableCell>
              <TableCell>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <Select
                    value={getLeadStatusMenuValue(lead)}
                    onChange={(e) => void handleLeadStatusSelectChange(lead, e.target.value as string)}
                    renderValue={() => getLeadStatusDisplay(lead)}
                    disabled={actionLoadingId === lead.id}
                  >
                    {leadStatusOptions.length > 0
                      ? leadStatusOptions.map((st) => (
                          <MenuItem key={st.id} value={`option:${st.id}`}>
                            <Chip
                              size="small"
                              label={st.name}
                              color={badgeColor(st.base_status)}
                              sx={{ mr: 1 }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              {statusLabels[st.base_status]}
                            </Typography>
                          </MenuItem>
                        ))
                      : statusOptions.map((st) => (
                          <MenuItem key={st} value={`base:${st}`}>
                            <Chip size="small" label={statusLabels[st]} color={badgeColor(st)} />
                          </MenuItem>
                        ))}
                  </Select>
                </FormControl>
              </TableCell>
              <TableCell>{lead.source || '—'}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <Select
                    value={lead.communication_channel || ''}
                    displayEmpty
                    onChange={(e) =>
                      void handleCommunicationChannelChange(
                        lead,
                        (e.target.value as '' | LeadCommunicationChannel) || ''
                      )
                    }
                    disabled={actionLoadingId === lead.id}
                  >
                    <MenuItem value="">
                      <em>Не задан</em>
                    </MenuItem>
                    {Object.entries(leadCommunicationChannelLabels).map(([value, label]) => (
                      <MenuItem key={value} value={value}>
                        {label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </TableCell>
              <TableCell>{lead.school_class || '—'}</TableCell>
              <TableCell>{lead.school_name || '—'}</TableCell>
              <TableCell>{lead.city || '—'}</TableCell>
              <TableCell>
                {lead.next_contact_at
                  ? (() => {
                      const d = parseISO(lead.next_contact_at);
                      return isValid(d) ? format(d, 'dd.MM.yyyy HH:mm') : lead.next_contact_at;
                    })()
                  : '—'}
              </TableCell>
              <TableCell>
                {(() => {
                  const d = parseISO(lead.created_at);
                  return isValid(d) ? format(d, 'dd.MM.yyyy') : lead.created_at;
                })()}
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                  <Tooltip title="Позвонить">
                    <IconButton
                      size="small"
                      color="success"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRowQuickCall(lead);
                      }}
                    >
                      <CallIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Написать">
                    <IconButton
                      size="small"
                      color="info"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRowQuickMessage(lead);
                      }}
                    >
                      <ChatIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Отправить инфо">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowQuickSendInfo(lead);
                      }}
                    >
                      <SendIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Назначить follow-up">
                    <IconButton
                      size="small"
                      color="warning"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRowQuickFollowUp(lead);
                      }}
                    >
                      <FollowUpIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Закрыть лид">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowQuickCloseLead(lead);
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Открыть карточку">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDetails(lead);
                      }}
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Инвойс + Email">
                    <IconButton
                      size="small"
                      color="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreateAndSendInvoice(lead);
                      }}
                      disabled={actionLoadingId === lead.id}
                    >
                      {actionLoadingId === lead.id ? <CircularProgress size={14} /> : <ReceiptLongIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  {/* Keep row compact: full buttons moved to lead card */}
                  {/* <Button
                    size="small"
                    variant="text"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDetails(lead);
                    }}
                  >
                    Карточка
                  </Button> */}
                  {/* <Button
                    size="small"
                    variant="outlined"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreateAndSendInvoice(lead);
                    }}
                    disabled={actionLoadingId === lead.id}
                  >
                    {actionLoadingId === lead.id ? <CircularProgress size={16} /> : 'Инвойс + Email'}
                  </Button> */}
                </Stack>
              </TableCell>
            </TableRow>
          ))}
          {!loading && filteredSortedLeads.length === 0 && (
            <TableRow>
              <TableCell colSpan={11}>
                <Typography color="text.secondary">Лидов нет</Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </TableContainer>
      ) : (
        <Grid container spacing={2}>
          {kanbanColumns.map((col) => (
            <Grid item xs={12} md={6} lg={4} xl={2} key={col.status}>
              <Card
                variant="outlined"
                sx={{ height: '100%' }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => void handleKanbanDrop(col.status)}
              >
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="subtitle1">{col.title}</Typography>
                    <Chip size="small" label={col.leads.length} />
                  </Stack>
                  <Stack spacing={1.5}>
                    {col.leads.map((lead) => (
                      <Card
                        key={lead.id}
                        variant="outlined"
                        draggable
                        onDragStart={() => setDraggedLeadId(lead.id)}
                        sx={{
                          borderRadius: 2,
                          borderColor:
                            selectedLead?.id === lead.id
                              ? 'primary.main'
                              : getKanbanBorderColor(lead.next_contact_at),
                          borderWidth: 2,
                        }}
                      >
                        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Typography variant="subtitle2">{lead.contact_name}</Typography>
                          <Typography variant="caption" color="text.secondary">{lead.phone}</Typography>
                          {lead.source && (
                            <Typography variant="caption" display="block" color="text.secondary">
                              Источник: {lead.source}
                            </Typography>
                          )}
                          {(() => {
                            const p = getKanbanPushProgressEstimate(lead);
                            return (
                              <Stack spacing={0.5} mt={1}>
                                <Stack direction="row" justifyContent="space-between">
                                  <Typography variant="caption" color="text.secondary">
                                    Прогресс: {p.label}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {p.percent}%
                                  </Typography>
                                </Stack>
                                <LinearProgress
                                  variant="determinate"
                                  value={p.percent}
                                  color={p.percent >= 80 ? 'success' : p.percent >= 40 ? 'warning' : 'primary'}
                                  sx={{ height: 6, borderRadius: 1 }}
                                />
                              </Stack>
                            );
                          })()}
                          <Stack direction="row" spacing={1} mt={1}>
                            <Button size="small" onClick={() => handleOpenDetails(lead)}>
                              Карточка
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => handleCreateAndSendInvoice(lead)}
                              disabled={actionLoadingId === lead.id}
                            >
                              Инвойс
                            </Button>
                          </Stack>
                        </CardContent>
                      </Card>
                    ))}
                    {col.leads.length === 0 && (
                      <Typography variant="caption" color="text.secondary">
                        Пусто
                      </Typography>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
        </Grid>

        {detailsOpen && selectedLead && (
          <Grid item xs={12} lg={5}>
            <Card variant="outlined" sx={{ position: { lg: 'sticky' }, top: { lg: 88 }, maxHeight: { lg: 'calc(100vh - 110px)' }, overflow: 'auto' }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="h6">Карточка лида</Typography>
                  <Button size="small" onClick={() => setDetailsOpen(false)}>Скрыть</Button>
                </Stack>
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid item xs={12}>
                    <Tabs
                      value={leadCardTab}
                      onChange={(_, v) => setLeadCardTab(v)}
                      sx={{ mb: 1 }}
                    >
                      <Tab label="Обзор" value="overview" />
                      <Tab label="Дожим" value="push" />
                    </Tabs>
                    <Card variant="outlined" sx={{ mb: 1 }}>
                      <CardContent sx={{ py: 1.5 }}>
                        <Typography variant="subtitle2">Шапка лида</Typography>
                        <Grid container spacing={1} sx={{ mt: 1 }}>
                          <Grid item xs={12} sm={6}>
                            <TextField
                              size="small"
                              label="Имя"
                              value={selectedLead.contact_name}
                              InputProps={{ readOnly: true }}
                              fullWidth
                            />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <TextField
                              size="small"
                              label="Телефон"
                              value={selectedLead.phone}
                              InputProps={{ readOnly: true }}
                              fullWidth
                            />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <FormControl size="small" fullWidth>
                              <InputLabel id="header-status-label">Стадия</InputLabel>
                              <Select
                                labelId="header-status-label"
                                label="Стадия"
                                value={leadHeaderStatusDraft}
                                onChange={(e) => setLeadHeaderStatusDraft(e.target.value as LeadStatus)}
                              >
                                {statusOptions.map((st) => (
                                  <MenuItem key={st} value={st}>
                                    {statusLabels[st]}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <TextField
                              size="small"
                              label="Следующий шаг"
                              value={leadHeaderNextStepDraft}
                              onChange={(e) => setLeadHeaderNextStepDraft(e.target.value)}
                              fullWidth
                            />
                          </Grid>
                          <Grid item xs={12}>
                            <TextField
                              size="small"
                              type="datetime-local"
                              label="Следующий контакт"
                              InputLabelProps={{ shrink: true }}
                              value={leadHeaderNextContactDraft}
                              onChange={(e) => setLeadHeaderNextContactDraft(e.target.value)}
                              fullWidth
                            />
                          </Grid>
                        </Grid>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                          {leadHeaderSaving ? 'Сохраняем шапку...' : 'Шапка сохраняется автоматически'}
                        </Typography>
                      </CardContent>
                    </Card>
                    <Card
                      variant="outlined"
                      sx={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                        borderColor: 'rgba(15, 23, 42, 0.12)',
                        bgcolor: 'background.paper',
                      }}
                    >
                      <CardContent sx={{ py: 1.5 }}>
                        <Typography variant="subtitle2">Действия</Typography>
                        <Grid container spacing={1} sx={{ mt: 1 }}>
                          <Grid item xs={12} sm={6}>
                            <Button fullWidth size="small" variant="contained" onClick={() => void handleQuickCommunication('call')}>
                              Позвонить
                            </Button>
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <Button fullWidth size="small" variant="contained" color="secondary" onClick={() => void handleQuickCommunication('messenger')}>
                              Написать
                            </Button>
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <Button fullWidth size="small" variant="outlined" onClick={handleOpenSendInfo}>
                              Отправить инфо
                            </Button>
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <Button fullWidth size="small" variant="outlined" onClick={handleAssignPush}>
                              Назначить дожим
                            </Button>
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <Button fullWidth size="small" variant="outlined" onClick={handleOpenRegisterEvent}>
                              Записать на пробное
                            </Button>
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <Button fullWidth size="small" variant="text" onClick={handleQuickRegisterToNearestEvent}>
                              Ближайший ивент
                            </Button>
                          </Grid>
                          <Grid item xs={12}>
                            <Button fullWidth size="small" color="warning" variant="contained" onClick={handleQuickCloseLead}>
                              Закрыть лид
                            </Button>
                          </Grid>
                        </Grid>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
                          Быстрые результаты звонка
                        </Typography>
                        <Grid container spacing={1} sx={{ mt: 0.25 }}>
                          <Grid item xs={12} sm={4}>
                            <Button fullWidth size="small" color="success" variant="contained" onClick={() => void submitOneClickContactResult('connected')}>
                              Дозвон (1)
                            </Button>
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <Button fullWidth size="small" color="warning" variant="contained" onClick={() => void submitOneClickContactResult('no_answer')}>
                              Не дозвон (2)
                            </Button>
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <Button fullWidth size="small" color="info" variant="contained" onClick={() => void submitOneClickContactResult('callback')}>
                              Перезвон (3)
                            </Button>
                          </Grid>
                        </Grid>
                        <Stack spacing={1} sx={{ mt: 1 }}>
                          <FormControl size="small" fullWidth>
                            <InputLabel id="contact-result-label">Результат звонка</InputLabel>
                            <Select
                              labelId="contact-result-label"
                              label="Результат звонка"
                              value={contactOutcome}
                              onChange={(e) => setContactOutcome(e.target.value as 'connected' | 'no_answer' | 'callback')}
                            >
                              <MenuItem value="connected">Дозвон</MenuItem>
                              <MenuItem value="no_answer">Не дозвонились</MenuItem>
                              <MenuItem value="callback">Перезвонить</MenuItem>
                            </Select>
                          </FormControl>
                          <TextField
                            size="small"
                            label="Комментарий"
                            value={contactNote}
                            onChange={(e) => setContactNote(e.target.value)}
                            fullWidth
                          />
                          <TextField
                            size="small"
                            type="datetime-local"
                            label="Дата follow-up"
                            InputLabelProps={{ shrink: true }}
                            value={contactFollowUpAt}
                            onChange={(e) => setContactFollowUpAt(e.target.value)}
                            required={contactOutcome === 'no_answer' || contactOutcome === 'callback'}
                            fullWidth
                          />
                          <Button size="small" variant="outlined" onClick={handleSaveContactResult} sx={{ alignSelf: 'flex-start' }}>
                            Сохранить результат
                          </Button>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} xl={4}>
                    <Typography variant="subtitle2">Клиент</Typography>
                    <Grid container spacing={1} sx={{ mt: 0.25 }}>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Родитель"
                          value={leadInfoDraft.parent_full_name}
                          onChange={(e) => setLeadInfoDraft((s) => ({ ...s, parent_full_name: e.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Телефон родителя"
                          value={leadInfoDraft.parent_phone}
                          onChange={(e) => setLeadInfoDraft((s) => ({ ...s, parent_phone: e.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Ребенок"
                          value={leadInfoDraft.child_full_name}
                          onChange={(e) => setLeadInfoDraft((s) => ({ ...s, child_full_name: e.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Телефон школьника"
                          value={leadInfoDraft.child_phone}
                          onChange={(e) => setLeadInfoDraft((s) => ({ ...s, child_phone: e.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Email"
                          value={leadInfoDraft.email}
                          onChange={(e) => setLeadInfoDraft((s) => ({ ...s, email: e.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <FormControl size="small" fullWidth>
                          <InputLabel id="lead-communication-channel-label">Канал общения</InputLabel>
                          <Select
                            labelId="lead-communication-channel-label"
                            label="Канал общения"
                            value={leadInfoDraft.communication_channel}
                            onChange={(e) =>
                              setLeadInfoDraft((s) => ({
                                ...s,
                                communication_channel: (e.target.value as '' | LeadCommunicationChannel) || '',
                              }))
                            }
                          >
                            <MenuItem value="">
                              <em>Не задан</em>
                            </MenuItem>
                            {Object.entries(leadCommunicationChannelLabels).map(([value, label]) => (
                              <MenuItem key={value} value={value}>
                                {label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Источник"
                          value={leadInfoDraft.source}
                          onChange={(e) => setLeadInfoDraft((s) => ({ ...s, source: e.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Кто пригласил"
                          value={leadInfoDraft.referral_name}
                          onChange={(e) => setLeadInfoDraft((s) => ({ ...s, referral_name: e.target.value }))}
                        />
                      </Grid>
                    </Grid>
                    {selectedLead.pause_reason && (
                      <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                        Пауза: {selectedLead.pause_reason}
                      </Typography>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => void handleSaveLeadInfo()}
                      disabled={leadInfoSaving}
                      sx={{ mt: 1 }}
                    >
                      {leadInfoSaving ? 'Сохраняем...' : 'Сохранить информацию'}
                    </Button>
                    <TextField
                      fullWidth
                      multiline
                      minRows={2}
                      size="small"
                      sx={{ mt: 1 }}
                      label="Заметка (автосохранение)"
                      value={leadCommentDraft}
                      onChange={(e) => setLeadCommentDraft(e.target.value)}
                      helperText={leadCommentSaving ? 'Сохраняем...' : 'Сохраняется автоматически'}
                    />
                    <Typography variant="subtitle2" sx={{ mt: 1 }}>Таймлайн коммуникаций</Typography>
                    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                      {communications.map((c) => (
                        <Card key={c.id} variant="outlined" sx={{ p: 1 }}>
                          <Stack direction="row" spacing={0.5} mb={0.5}>
                            <Chip size="small" label={c.channel} />
                            {c.pause_reason && <Chip size="small" color="warning" label={c.pause_reason} />}
                          </Stack>
                          <Typography variant="caption" display="block">{c.message}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {(() => {
                              const d = parseISO(c.created_at);
                              return isValid(d) ? format(d, 'dd.MM.yyyy HH:mm') : c.created_at;
                            })()}
                            {' • follow-up: '}
                            {(() => {
                              const d = parseISO(c.follow_up_at);
                              return isValid(d) ? format(d, 'dd.MM.yyyy HH:mm') : c.follow_up_at;
                            })()}
                          </Typography>
                        </Card>
                      ))}
                      {communications.length === 0 && (
                        <Typography color="text.secondary" variant="caption">Коммуникаций пока нет</Typography>
                      )}
                    </Stack>
                    {selectedLead.lost_reason && (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        Причина закрытия: {selectedLead.lost_reason}
                      </Alert>
                    )}
                  </Grid>
                  <Grid item xs={12} xl={4}>
                    <Typography variant="subtitle2">Задачи</Typography>
                    <Stack spacing={1} sx={{ mt: 1 }}>
                      {leadCardTab === 'overview' ? (
                        <>
                          <FormControl size="small" fullWidth>
                            <InputLabel id="task-template-label">Задача</InputLabel>
                            <Select
                              labelId="task-template-label"
                              label="Задача"
                              value={taskTemplateId}
                              onChange={(e) => setTaskTemplateId((e.target.value as number) || '')}
                            >
                              <MenuItem value="">
                                <em>Выберите задачу</em>
                              </MenuItem>
                              {taskTemplates.map((tpl) => (
                                <MenuItem key={tpl.id} value={tpl.id}>
                                  {tpl.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <FormControl size="small" fullWidth>
                            <InputLabel id="task-status-option-label">Статус</InputLabel>
                            <Select
                              labelId="task-status-option-label"
                              label="Статус"
                              value={taskStatusOptionId}
                              onChange={(e) => setTaskStatusOptionId((e.target.value as number) || '')}
                            >
                              {taskStatusOptions.map((st) => (
                                <MenuItem key={st.id} value={st.id}>
                                  {st.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <TextField
                            size="small"
                            label="Комментарий к задаче"
                            value={taskNote}
                            onChange={(e) => setTaskNote(e.target.value)}
                          />
                          <TextField
                            size="small"
                            type="datetime-local"
                            label="Срок"
                            InputLabelProps={{ shrink: true }}
                            value={taskDueAt}
                            onChange={(e) => setTaskDueAt(e.target.value)}
                          />
                          <Button variant="outlined" onClick={handleCreateTask}>
                            Добавить задачу
                          </Button>
                          {tasks.map((task) => (
                            <Stack key={task.id} direction="row" justifyContent="space-between" alignItems="center">
                              <Typography variant="body2">
                                {taskTemplates.find((tpl) => tpl.id === task.template_id)?.name || 'Задача'}: {task.note || 'Без комментария'} (
                                {taskStatusOptions.find((st) => st.id === task.status_option_id)?.name || task.status})
                              </Typography>
                              {task.status === 'open' && (
                                <Button size="small" onClick={() => handleCloseTask(task)}>
                                  Закрыть
                                </Button>
                              )}
                            </Stack>
                          ))}
                          {tasks.length === 0 && <Typography color="text.secondary">Задач пока нет</Typography>}
                        </>
                      ) : (
                        <>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <Chip
                              size="small"
                              color={pushProgressPercent >= 70 ? 'success' : pushProgressPercent >= 30 ? 'warning' : 'default'}
                              label={`${pushDoneCount}/${pushTasks.length} шагов`}
                            />
                            <Typography variant="caption" color="text.secondary">
                              Прогресс дожима: {pushProgressPercent}%
                            </Typography>
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={pushProgressPercent}
                            sx={{ borderRadius: 1, height: 8 }}
                          />
                          <Typography variant="body2" color="text.secondary">
                            Чеклист касаний по дожиму
                          </Typography>
                          <Stack direction="row" spacing={1} flexWrap="wrap">
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => void handleAssignPushTemplateStep('first')}
                            >
                              1-й контакт
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => void handleAssignPushTemplateStep('second')}
                            >
                              2-й контакт
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => void handleAssignPushTemplateStep('final')}
                            >
                              Финальный
                            </Button>
                            <Button size="small" variant="text" onClick={handleAssignPush}>
                              + произвольный
                            </Button>
                          </Stack>
                          {pushTasks.map((task) => {
                            const dueLabel = task.due_at && isValid(parseISO(task.due_at))
                              ? format(parseISO(task.due_at), 'dd.MM.yyyy HH:mm')
                              : 'без срока';
                            return (
                              <Stack key={task.id} direction="row" spacing={1} alignItems="center">
                                <Checkbox checked={task.status === 'done'} disabled />
                                <Typography variant="body2">
                                  {task.note || 'Шаг дожима'} ({dueLabel})
                                </Typography>
                              </Stack>
                            );
                          })}
                          {pushTasks.length === 0 && (
                            <Typography color="text.secondary">Шагов дожима пока нет</Typography>
                          )}
                        </>
                      )}
                    </Stack>
                  </Grid>
                  <Grid item xs={12} xl={4}>
                    <Typography variant="subtitle2">Инвойсы</Typography>
                    <Stack spacing={1} sx={{ mt: 1 }}>
                      <Button
                        variant="outlined"
                        onClick={() => handleCreateAndSendInvoice(selectedLead)}
                        disabled={!selectedLead.abonement_id || !isValidEmail(selectedLead.email)}
                      >
                        Инвойс + Email
                      </Button>
                      {!isValidEmail(selectedLead.email) && (
                        <Typography color="warning.main" variant="caption">
                          Нужен корректный email для отправки
                        </Typography>
                      )}
                      {invoices.map((inv) => (
                        <Typography key={inv.id} variant="body2">
                          #{inv.id} — {inv.amount} {inv.currency} ({inv.status})
                        </Typography>
                      ))}
                      {invoices.length === 0 && <Typography color="text.secondary">Инвойсов пока нет</Typography>}
                    </Stack>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Заполнить лид</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} md={6}>
              <TextField
                label="ФИО родителя"
                fullWidth
                value={form.parent_full_name}
                onChange={(e) => setForm((s) => ({ ...s, parent_full_name: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="ФИО ребенка"
                fullWidth
                value={form.child_full_name}
                onChange={(e) => setForm((s) => ({ ...s, child_full_name: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Телефон родителя"
                fullWidth
                value={form.parent_phone}
                onChange={(e) => setForm((s) => ({ ...s, parent_phone: e.target.value }))}
                onBlur={() => setForm((s) => ({ ...s, parent_phone: normalizeRuPhone(s.parent_phone) }))}
                helperText="Формат: +7XXXXXXXXXX"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Телефон школьника"
                fullWidth
                value={form.child_phone}
                onChange={(e) => setForm((s) => ({ ...s, child_phone: e.target.value }))}
                onBlur={() => setForm((s) => ({ ...s, child_phone: normalizeRuPhone(s.child_phone) }))}
                helperText="Формат: +7XXXXXXXXXX"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Email"
                fullWidth
                value={form.email}
                onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel id="lead-city-label">Город</InputLabel>
                <Select
                  labelId="lead-city-label"
                  label="Город"
                  value={form.city}
                  onChange={(e) => setForm((s) => ({ ...s, city: e.target.value as string }))}
                >
                  <MenuItem value="">
                    <em>Не выбран</em>
                  </MenuItem>
                  {cityOptions.map((city) => (
                    <MenuItem key={city} value={city}>
                      {city}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <Autocomplete
                freeSolo
                options={schoolOptions}
                inputValue={form.school_name}
                onInputChange={(_, value) => setForm((s) => ({ ...s, school_name: value }))}
                renderInput={(params) => <TextField {...params} label="Школа" fullWidth helperText="Можно выбрать из списка или найти через поиск" />}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="Класс"
                fullWidth
                value={form.school_class}
                onChange={(e) => setForm((s) => ({ ...s, school_class: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Дата обхода"
                type="date"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={form.outreach_at}
                onChange={(e) => setForm((s) => ({ ...s, outreach_at: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel id="lead-source-label">Источник</InputLabel>
                <Select
                  labelId="lead-source-label"
                  label="Источник"
                  value={form.source_id}
                  onChange={(e) => setForm((s) => ({ ...s, source_id: e.target.value as string }))}
                >
                  <MenuItem value="">
                    <em>Не выбран</em>
                  </MenuItem>
                  {leadSources.map((src) => (
                    <MenuItem key={src.id} value={src.id}>
                      {src.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            {leadSources.find((s) => String(s.id) === String(form.source_id))?.name.toLowerCase() === 'рекомендация' && (
              <Grid item xs={12} md={6}>
                <TextField
                  label="Кто пригласил"
                  fullWidth
                  value={form.referral_name}
                  onChange={(e) => setForm((s) => ({ ...s, referral_name: e.target.value }))}
                />
              </Grid>
            )}
            <Grid item xs={12} md={6}>
              <TextField
                label="Теги (через запятую)"
                fullWidth
                value={form.tags}
                onChange={(e) => setForm((s) => ({ ...s, tags: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={12}>
              <TextField
                label="Комментарий"
                fullWidth
                multiline
                minRows={2}
                value={form.comment}
                onChange={(e) => setForm((s) => ({ ...s, comment: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Следующий контакт"
                type="datetime-local"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={form.next_contact_at}
                onChange={(e) => setForm((s) => ({ ...s, next_contact_at: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={
              (!form.parent_full_name.trim() && !form.child_full_name.trim()) ||
              (!form.parent_phone.trim() && !form.child_phone.trim())
            }
          >
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={sendInfoOpen} onClose={() => setSendInfoOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Отправить инфо</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel id="info-template-label">Шаблон</InputLabel>
            <Select
              labelId="info-template-label"
              label="Шаблон"
              value={sendInfoForm.template_id}
              onChange={(e) => handleTemplateChange(String(e.target.value))}
            >
              <MenuItem value="">
                <em>Без шаблона</em>
              </MenuItem>
              {infoTemplates.map((tpl) => (
                <MenuItem key={tpl.id} value={tpl.id}>{tpl.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel id="info-channel-label">Канал</InputLabel>
            <Select
              labelId="info-channel-label"
              label="Канал"
              value={sendInfoForm.channel}
              onChange={(e) => setSendInfoForm((s) => ({ ...s, channel: String(e.target.value) }))}
            >
              <MenuItem value="messenger">messenger</MenuItem>
              <MenuItem value="call">call</MenuItem>
              <MenuItem value="email">email</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Текст"
            sx={{ mt: 2 }}
            value={sendInfoForm.message}
            onChange={(e) => setSendInfoForm((s) => ({ ...s, message: e.target.value }))}
          />
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel id="pause-reason-label">Причина паузы</InputLabel>
            <Select
              labelId="pause-reason-label"
              label="Причина паузы"
              value={sendInfoForm.pause_reason}
              onChange={(e) => setSendInfoForm((s) => ({ ...s, pause_reason: String(e.target.value) }))}
            >
              <MenuItem value="">
                <em>Без паузы</em>
              </MenuItem>
              <MenuItem value="ждём ответ">ждём ответ</MenuItem>
              <MenuItem value="подумать">подумать</MenuItem>
              <MenuItem value="нет времени">нет времени</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            type="datetime-local"
            label="Follow-up (обязательно)"
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 2 }}
            value={sendInfoForm.follow_up_at}
            onChange={(e) => setSendInfoForm((s) => ({ ...s, follow_up_at: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSendInfoOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleSendInfo}>Отправить</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={registerEventOpen} onClose={() => setRegisterEventOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Записать на мероприятие</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel id="quick-event-label">Мероприятие</InputLabel>
            <Select
              labelId="quick-event-label"
              label="Мероприятие"
              value={registerEventId}
              onChange={(e) => setRegisterEventId((e.target.value as number) || '')}
            >
              <MenuItem value="">
                <em>Выберите мероприятие</em>
              </MenuItem>
              {events.map((ev) => (
                <MenuItem key={ev.id} value={ev.id}>
                  {formatEventOptionLabel(ev)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            multiline
            minRows={2}
            label="Комментарий"
            sx={{ mt: 2 }}
            value={registerEventNote}
            onChange={(e) => setRegisterEventNote(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegisterEventOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleRegisterToEvent}>Записать</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={lostDialogOpen} onClose={() => setLostDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Закрыть лид</DialogTitle>
        <DialogContent>
          <TextField
            label="Причина закрытия"
            fullWidth
            multiline
            minRows={3}
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLostDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" color="warning" onClick={handleConfirmLost}>
            Подтвердить
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={batchFollowUpOpen} onClose={() => setBatchFollowUpOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Массовый follow-up</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Выбрано лидов: {selectedLeadIds.length}
          </Typography>
          <TextField
            fullWidth
            type="datetime-local"
            label="Дата и время follow-up"
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 2 }}
            value={batchFollowUpAt}
            onChange={(e) => setBatchFollowUpAt(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBatchFollowUpOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleBatchAssignFollowUp()}>
            Назначить
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={batchSendOpen} onClose={() => setBatchSendOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Массовая отправка шаблона</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Выбрано лидов: {selectedLeadIds.length}
          </Typography>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel id="batch-template-label">Шаблон</InputLabel>
            <Select
              labelId="batch-template-label"
              label="Шаблон"
              value={batchTemplateId}
              onChange={(e) => handleBatchTemplateChange((e.target.value as number) || '')}
            >
              <MenuItem value="">
                <em>Без шаблона</em>
              </MenuItem>
              {infoTemplates.map((tpl) => (
                <MenuItem key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel id="batch-channel-label">Канал</InputLabel>
            <Select
              labelId="batch-channel-label"
              label="Канал"
              value={batchSendChannel}
              onChange={(e) => setBatchSendChannel(String(e.target.value))}
            >
              <MenuItem value="messenger">messenger</MenuItem>
              <MenuItem value="call">call</MenuItem>
              <MenuItem value="email">email</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Сообщение"
            sx={{ mt: 2 }}
            value={batchSendMessage}
            onChange={(e) => setBatchSendMessage(e.target.value)}
          />
          <TextField
            fullWidth
            type="datetime-local"
            label="Follow-up (обязательно)"
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 2 }}
            value={batchSendFollowUpAt}
            onChange={(e) => setBatchSendFollowUpAt(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBatchSendOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleBatchSendTemplate()}>
            Отправить
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={dropConfirmOpen} onClose={() => setDropConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Подтвердить перенос стадии</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Новая стадия: {dropTargetStatus ? statusLabels[dropTargetStatus] : '—'}
          </Typography>
          {(() => {
            const lead = dropLeadId ? leads.find((l) => l.id === dropLeadId) : null;
            const requireFollowUp = !!dropTargetStatus && requiresFollowUpOnDrop(dropTargetStatus) && !lead?.next_contact_at;
            if (!requireFollowUp) return null;
            return (
              <TextField
                fullWidth
                type="datetime-local"
                label="Follow-up (обязательно)"
                InputLabelProps={{ shrink: true }}
                sx={{ mt: 2 }}
                value={dropFollowUpAt}
                onChange={(e) => setDropFollowUpAt(e.target.value)}
              />
            );
          })()}
          {dropTargetStatus === 'demo' && (
            <>
              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel id="drop-event-label">Пробное занятие (опционально)</InputLabel>
                <Select
                  labelId="drop-event-label"
                  label="Пробное занятие (опционально)"
                  value={dropEventId}
                  onChange={(e) => setDropEventId((e.target.value as number) || '')}
                >
                  <MenuItem value="">
                    <em>Не записывать</em>
                  </MenuItem>
                  {events.map((ev) => (
                    <MenuItem key={ev.id} value={ev.id}>
                      {formatEventOptionLabel(ev)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {dropEventId && (
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  label="Комментарий к записи"
                  sx={{ mt: 2 }}
                  value={dropEventNote}
                  onChange={(e) => setDropEventNote(e.target.value)}
                />
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDropConfirmOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleConfirmKanbanDrop()}>
            Перенести
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={toast.open}
        autoHideDuration={2500}
        onClose={() => setToast((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setToast((s) => ({ ...s, open: false }))}
          severity={toast.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Layout>
  );
};

export default SalesLeadsPage;
