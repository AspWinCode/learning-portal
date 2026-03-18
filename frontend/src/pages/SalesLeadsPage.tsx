import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Autocomplete,
  Box,
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
  TablePagination,
} from '@mui/material';
import {
  Call as CallIcon,
  ChatBubbleOutline as ChatIcon,
  Send as SendIcon,
  EventNote as FollowUpIcon,
  Close as CloseIcon,
  Visibility as VisibilityIcon,
  ReceiptLong as ReceiptLongIcon,
  Sms as SmsIcon,
  Forum as MaxIcon,
} from '@mui/icons-material';
import { format, isValid, parseISO } from 'date-fns';
import Layout from '../components/Layout';
import { SendSMSModal } from '../components/SendSMSModal';
import { SendMaxModal } from '../components/SendMaxModal';
import { salesApi, settingsApi } from '../services/api';
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
  SalesCity,
  SalesSchool,
} from '../types';

const statusLabels: Record<LeadStatus, string> = {
  new: '\u041d\u043e\u0432\u044b\u0439',
  contacted: '\u0421\u0432\u044f\u0437\u0430\u043b\u0438\u0441\u044c',
  no_answer: '\u041d\u0435\u0434\u043e\u0437\u0432\u043e\u043d',
  demo: '\u0414\u0435\u043c\u043e',
  invoice_sent: '\u0418\u043d\u0432\u043e\u0439\u0441 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d',
  won: '\u0423\u0441\u043f\u0435\u0448\u043d\u043e',
  lost: '\u0417\u0430\u043a\u0440\u044b\u0442',
  thinking: '\u041f\u043e\u0434\u0443\u043c\u0430\u044e\u0442',
  refused: '\u041e\u0442\u043a\u0430\u0437\u0430\u043b\u0438',
  trial_scheduled: '\u0417\u0430\u043f\u0438\u0441\u0430\u043b\u0438 \u043d\u0430 \u043f\u0440\u043e\u0431\u043d\u043e\u0435',
  event_registered: 'Записали на мероприятие',
  decided_immediately: '\u0420\u0435\u0448\u0438\u043b \u0437\u0430\u043d\u0438\u043c\u0430\u0442\u044c\u0441\u044f \u0441\u0440\u0430\u0437\u0443',
};

/** h1dh�dddd h�h[dh[h\hQhU hdh[h$h�hb B$ hah$hUh\dhc dhhUdh[hQ h$hWd hWhUh$h[h� hU h�h[dh[h\hQhU */
/** Тег лида: пригласить на следующее мероприятие (воронка → колонка «Следующее мероприятие») */
const TAG_REINVITE_NEXT_EVENT = 'reinvite_next_event';

const PIPELINE_STATUSES: LeadStatus[] = [
  'new',
  'thinking',
  'no_answer',
  'refused',
  'trial_scheduled',
  'event_registered',
  'decided_immediately',
];

/** h1dh�dddd hWhUh$h� h[dh[h�dh�hbh�dddd h� hQh[hWh[h\hQha h�h[dh[h\hQhU (h$hWd ddh�ddd ddh�dddh[h� B$ h]h�hhhUh\h) */
function getPipelineColumnForStatus(status: LeadStatus): LeadStatus {
  const map: Partial<Record<LeadStatus, LeadStatus>> = {
    contacted: 'thinking',
    demo: 'trial_scheduled',
    invoice_sent: 'trial_scheduled',
    won: 'decided_immediately',
    lost: 'refused',
  };
  return map[status] ?? status;
}

const DEFAULT_REFUSED_REASONS = [
  'Нет времени',
  'Дорого',
  'Не подходит расписанию',
  'Уже занимается elsewhere',
  'Передумал',
  'Другое',
];

const leadCommunicationChannelLabels: Record<LeadCommunicationChannel, string> = {
  max: 'MAX',
  email: '\u043f\u043e\u0447\u0442\u0430',
  sms: 'смс',
  telegram: 'telegram',
};

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
  const [statusFilter, setStatusFilter] = useState<LeadStatus | '' | 'next_event'>('');
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
  const [salesCities, setSalesCities] = useState<SalesCity[]>([]);
  const [salesSchools, setSalesSchools] = useState<SalesSchool[]>([]);
  const [taskTemplates, setTaskTemplates] = useState<LeadTaskTemplate[]>([]);
  const [taskStatusOptions, setTaskStatusOptions] = useState<LeadTaskStatusOption[]>([]);
  const [leadStatusOptions, setLeadStatusOptions] = useState<LeadStatusOption[]>([]);
  const [infoTemplates, setInfoTemplates] = useState<LeadInfoTemplate[]>([]);
  const [sendInfoStatus, setSendInfoStatus] = useState<Record<number, 'open' | 'done' | 'none'>>({});
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
  const [pipelineSchoolFilter, setPipelineSchoolFilter] = useState('');
  const [tableClassFilter, setTableClassFilter] = useState('');
  const [tableSortField, setTableSortField] = useState<LeadsTableSortField>('created_at');
  const [tableSortOrder, setTableSortOrder] = useState<LeadsTableSortOrder>('desc');
  const [tablePage, setTablePage] = useState(0);
  const [tableRowsPerPage, setTableRowsPerPage] = useState(50);
  const [batchFollowUpOpen, setBatchFollowUpOpen] = useState(false);
  const [batchFollowUpAt, setBatchFollowUpAt] = useState('');
  const [batchSendOpen, setBatchSendOpen] = useState(false);
  const [batchTemplateId, setBatchTemplateId] = useState<number | ''>('');
  const [batchSendMessage, setBatchSendMessage] = useState('');
  const [batchSendChannel, setBatchSendChannel] = useState('messenger');
  const [batchSendFollowUpAt, setBatchSendFollowUpAt] = useState('');
  const [draggedLeadId, setDraggedLeadId] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<LeadStatus | 'archive' | 'next_event' | null>(null);
  const [showArchiveColumn, setShowArchiveColumn] = useState(false);
  const [noShowLeadIds, setNoShowLeadIds] = useState<Set<number>>(new Set());
  const [dropConfirmOpen, setDropConfirmOpen] = useState(false);
  const [dropTargetStatus, setDropTargetStatus] = useState<LeadStatus | null>(null);
  const [dropLeadId, setDropLeadId] = useState<number | null>(null);
  const [dropFollowUpAt, setDropFollowUpAt] = useState('');
  const [dropCallbackAt, setDropCallbackAt] = useState('');
  const [dropRefusedReason, setDropRefusedReason] = useState('');
  const [dropTrialAt, setDropTrialAt] = useState('');
  const [refusedReasons, setRefusedReasons] = useState<string[]>([]);
  const [dropEventId, setDropEventId] = useState<number | ''>('');
  const [dropEventNote, setDropEventNote] = useState('');
  const [noAnswerArchiveConfirmOpen, setNoAnswerArchiveConfirmOpen] = useState(false);
  const [pendingNoAnswerArchiveLead, setPendingNoAnswerArchiveLead] = useState<Lead | null>(null);
  const [leadCommentDraft, setLeadCommentDraft] = useState('');
  const [leadCommentSaving, setLeadCommentSaving] = useState(false);
  const [leadHeaderStatusDraft, setLeadHeaderStatusDraft] = useState<LeadStatus>('new');
  const [leadHeaderNextStepDraft, setLeadHeaderNextStepDraft] = useState('');
  const [leadHeaderSaving, setLeadHeaderSaving] = useState(false);
  const [leadCardTab, setLeadCardTab] = useState<'overview' | 'push'>('overview');
  const [leadPushStatsMap, setLeadPushStatsMap] = useState<Record<number, LeadPushStats>>({});
  const [leadInfoSaving, setLeadInfoSaving] = useState(false);
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const [smsModalPhone, setSmsModalPhone] = useState('');
  const [smsModalLeadId, setSmsModalLeadId] = useState<number | null>(null);
  const [maxModalOpen, setMaxModalOpen] = useState(false);
  const [maxModalLeadId, setMaxModalLeadId] = useState<number | null>(null);
  const [maxModalMaxUserId, setMaxModalMaxUserId] = useState<number | null>(null);
  const [maxModalPhone, setMaxModalPhone] = useState<string>('');
  const [leadInfoDraft, setLeadInfoDraft] = useState({
    parent_full_name: '',
    parent_phone: '',
    child_full_name: '',
    child_phone: '',
    email: '',
    city: '',
    school_name: '',
    school_class: '',
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
  });

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await salesApi.listLeads({
        q: qFilter.trim() || undefined,
        source: sourceFilter.trim() || undefined,
        tag: tagFilter.trim() || undefined,
        overdue_only: overdueOnly || undefined,
      });
      setLeads(data);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      const noResponse = !err?.response; // сеть недоступна, бэкенд не запущен, CORS
      const base = err?.config?.baseURL ?? '';
      const path = err?.config?.url ?? '';
      const requestUrl = base ? `${base.replace(/\/$/, '')}${path?.startsWith('/') ? path : '/' + path}` : (typeof window !== 'undefined' ? window.location.origin + path : path);
      if (process.env.NODE_ENV !== 'production') {
        console.error('[SalesLeads] loadLeads error', { status, noResponse, requestUrl, message: err?.message }, err);
      }
      if (
        noResponse ||
        status === 404 ||
        (typeof detail === 'string' && (detail === 'Not Found' || detail.includes('404')))
      ) {
        let msg = 'Не удалось загрузить список лидов (сервис недоступен или маршрут не найден). Проверьте, что бэкенд запущен и доступен по адресу API.';
        if (requestUrl) msg += ` Запрос: ${requestUrl}${status ? `, ответ: ${status}` : ''}.`;
        setError(msg);
      } else {
        setError(extractApiError(err, 'Не удалось загрузить лиды'));
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, qFilter, sourceFilter, tagFilter, overdueOnly]);

  const loadSalesMeta = useCallback(async () => {
    // Города и школы подгружаем отдельно, чтобы при ошибке других запросов списки всё равно обновились
    salesApi.listSalesCities(true).then(setSalesCities).catch(() => setSalesCities([]));
    salesApi.listSalesSchools(true).then(setSalesSchools).catch(() => setSalesSchools([]));
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
      try {
        const refused = await settingsApi.getRefusedReasons();
        setRefusedReasons(refused.items && refused.items.length ? refused.items : DEFAULT_REFUSED_REASONS);
      } catch {
        setRefusedReasons(DEFAULT_REFUSED_REASONS);
      }
    } catch {
      // ignore metadata fetch errors in UI
    }
  }, []);

  useEffect(() => {
    loadLeads();
    loadSalesMeta();
  }, [loadLeads, loadSalesMeta]);

  // h+hUh$d d h\hadh�hQh[hc h\h� h]hadh[hdhUddhUha B$ h$hWd hQh[hWh[h\hQhU ,;h1hWhah$ h]hadh[hdhUddhUha,W hU h�hQhWh�h$hQhU ,;h/h[hVh�h�dd hadha dh�hV,W
  useEffect(() => {
    if (viewMode !== 'kanban') return;
    let cancelled = false;
    const hasNoShowTag = (note: string | null | undefined) => {
      const lower = (note || '').toLowerCase();
      return lower.includes('[no-show]') || lower.includes('no-show');
    };
    salesApi
      .listEvents()
      .then((eventList) => {
        if (cancelled || !eventList.length) return;
        return Promise.allSettled(eventList.map((e) => salesApi.listEventRegistrations(e.id)));
      })
      .then((results) => {
        if (cancelled || !results) return;
        const ids = new Set<number>();
        results.forEach((r) => {
          if (r.status === 'fulfilled') {
            r.value.forEach((reg) => {
              if (reg.status === 'registered' && hasNoShowTag(reg.note)) ids.add(reg.lead_id);
            });
          }
        });
        if (!cancelled) setNoShowLeadIds(ids);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [viewMode]);

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
    if (viewMode !== 'kanban') return;
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
  }, [leads, viewMode]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const leadIdParam = params.get('open') || params.get('leadId') || params.get('detail');
    const leadId = leadIdParam ? Number(leadIdParam) : NaN;
    if (!leadIdParam || Number.isNaN(leadId)) return;
    const targetLead = leads.find((l) => l.id === leadId);
    if (targetLead) {
      setSelectedLead(targetLead);
      setDetailsOpen(true);
      void loadLeadDetails(targetLead);
      return;
    }
    salesApi.getLead(leadId).then((lead) => {
      setSelectedLead(lead);
      setDetailsOpen(true);
      void loadLeadDetails(lead);
    }).catch(() => {});
  }, [location.search, leads, navigate]);

  const cityOptions = useMemo(() => {
    const citySet = new Set<string>();
    salesCities.forEach((c) => citySet.add(c.name.trim()));
    leads.forEach((lead) => {
      const city = lead.city?.trim();
      if (city) citySet.add(city);
    });
    return Array.from(citySet).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [salesCities, leads]);

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
      // Фильтр по этапу воронки (таблица использует те же этапы, что и Воронка)
      if (statusFilter) {
        if (statusFilter === 'next_event') {
          if (!((lead.tags || []).includes(TAG_REINVITE_NEXT_EVENT))) return false;
        } else if (getPipelineColumnForStatus(lead.status) !== statusFilter) {
          return false;
        }
      }
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
  }, [leads, statusFilter, tableCityFilter, tableClassFilter, tableSchoolFilter, tableSortField, tableSortOrder]);

  const paginatedLeads = useMemo(
    () => filteredSortedLeads.slice(tablePage * tableRowsPerPage, (tablePage + 1) * tableRowsPerPage),
    [filteredSortedLeads, tablePage, tableRowsPerPage],
  );

  // Сброс страницы при смене фильтров
  useEffect(() => {
    setTablePage(0);
  }, [statusFilter, qFilter, sourceFilter, tagFilter, overdueOnly, tableCityFilter, tableClassFilter, tableSchoolFilter]);

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
    });
    setCreateOpen(true);
    // Подтягиваем актуальный список городов из Настройки Sales → Города при открытии формы
    salesApi.listSalesCities(true).then(setSalesCities).catch(() => setSalesCities([]));
  };

  const handleCreate = async () => {
    setError(null);
    if (!form.parent_full_name.trim()) {
      setError('Заполните ФИО родителя');
      return;
    }
    if (!form.parent_phone.trim()) {
      setError('Заполните телефон родителя');
      return;
    }
    if (!form.city.trim()) {
      setError('Выберите город');
      return;
    }
    if (!form.source_id) {
      setError('Выберите источник');
      return;
    }
    try {
      const sourceIdNumber = form.source_id ? Number(form.source_id) : undefined;
      const selectedSource = leadSources.find((s) => s.id === sourceIdNumber);
      if (selectedSource?.name.toLowerCase() === 'сарафанное радио' && !form.referral_name.trim()) {
        setError('Для источника "Сарафанное радио" нужно указать, кто порекомендовал');
        return;
      }
      if (!isValidRuPhone(form.parent_phone)) {
        setError('Некорректный телефон родителя, ожидается формат +7XXXXXXXXXX');
        return;
      }
      if (form.child_phone.trim() && !isValidRuPhone(form.child_phone)) {
        setError('Некорректный телефон ребёнка, ожидается формат +7XXXXXXXXXX');
        return;
      }
      const normalizedParentPhone = normalizeRuPhone(form.parent_phone);
      const normalizedChildPhone = normalizeRuPhone(form.child_phone);
      const contactName = form.parent_full_name || form.child_full_name || 'Имя не указано';
      const phone = normalizedParentPhone || normalizedChildPhone || 'нет телефона';
      await salesApi.createLead({
        contact_name: contactName,
        phone,
        parent_full_name: form.parent_full_name.trim(),
        child_full_name: form.child_full_name || undefined,
        parent_phone: normalizedParentPhone,
        child_phone: normalizedChildPhone || undefined,
        email: form.email || undefined,
        city: form.city.trim(),
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
      });
      setCreateOpen(false);
      await loadLeads();
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка операции'));
    }
  };

  const handleStatusChange = async (lead: Lead, newStatus: LeadStatus, statusOptionId?: number) => {
    if (lead.status === newStatus) return;
    if (newStatus === 'won') {
      const ok = window.confirm('Перевести лида в статус "Согласились заниматься"?');
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
    return `base:${getPipelineColumnForStatus(lead.status)}`;
  };

  const getLeadStatusDisplay = (lead: Lead): string => {
    return statusLabels[getPipelineColumnForStatus(lead.status)];
  };

  const handleLeadStatusSelectChange = async (lead: Lead, value: string) => {
    if (value === 'next_event') {
      try {
        const currentTags = lead.tags || [];
        if (currentTags.includes(TAG_REINVITE_NEXT_EVENT)) {
          return;
        }
        setActionLoadingId(lead.id);
        await salesApi.updateLead(lead.id, { tags: [...currentTags, TAG_REINVITE_NEXT_EVENT] });
        await loadLeads();
        setToast({
          open: true,
          message: `Лид «${lead.contact_name}» перенесён в «Следующее мероприятие». Он отображается во вкладке «Позвать снова на мероприятие».`,
          severity: 'success',
        });
      } catch (err: any) {
        setError(extractApiError(err, 'Не удалось перенести лид в «Следующее мероприятие»'));
      } finally {
        setActionLoadingId(null);
      }
      return;
    }
    if (value.startsWith('option:')) {
      const optionId = Number(value.replace('option:', ''));
      const option = leadStatusOptions.find((s) => s.id === optionId);
      if (!option) return;
      await handleStatusChange(lead, option.base_status, option.id);
      return;
    }
    if (value.startsWith('base:')) {
      const baseStatus = value.replace('base:', '') as LeadStatus;
      // В таблице «Лиды» запускать тот же сценарий перехода этапа, что и на «Воронке»
      await startStatusAutomation(lead, baseStatus);
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
      setError(extractApiError(err, 'Ошибка операции'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirmLost = async () => {
    if (!pendingLostLead) return;
    if (!lostReason.trim()) {
      setError('Ошибка операции');
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
      setError(extractApiError(err, 'Ошибка операции'));
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
      setError(extractApiError(err, 'Ошибка операции'));
    }
  };

  const handleOpenDetails = async (lead: Lead) => {
    setDetailsOpen(true);
    setSelectedLead(lead);
    setContactOutcome('connected');
    setContactNote('');
    setContactFollowUpAt('');
    setLeadCommentDraft(lead.comment || '');
    setLeadHeaderStatusDraft(getPipelineColumnForStatus(lead.status));
    setLeadHeaderNextStepDraft(lead.desired_slot || '');
    setLeadInfoDraft({
      parent_full_name: lead.parent_full_name || lead.contact_name || '',
      parent_phone: lead.parent_phone || lead.phone || '',
      child_full_name: lead.child_full_name || '',
      child_phone: lead.child_phone || '',
      email: lead.email || '',
      city: lead.city || '',
      school_name: lead.school_name || '',
      school_class: lead.school_class || '',
      communication_channel: (lead.communication_channel as LeadCommunicationChannel | null) || '',
      source: lead.source || '',
      referral_name: lead.referral_name || '',
    });
    try {
      const fullLead = await salesApi.getLead(lead.id);
      setSelectedLead(fullLead);
      setLeadCommentDraft(fullLead.comment ?? lead.comment ?? '');
      setLeadHeaderStatusDraft(getPipelineColumnForStatus(fullLead.status));
      setLeadHeaderNextStepDraft(fullLead.desired_slot ?? lead.desired_slot ?? '');
      setLeadInfoDraft({
        parent_full_name: fullLead.parent_full_name || fullLead.contact_name || lead.contact_name || '',
        parent_phone: fullLead.parent_phone || fullLead.phone || lead.phone || '',
        child_full_name: fullLead.child_full_name || lead.child_full_name || '',
        child_phone: fullLead.child_phone || lead.child_phone || '',
        email: fullLead.email || lead.email || '',
        city: fullLead.city || lead.city || '',
        school_name: fullLead.school_name || lead.school_name || '',
        school_class: fullLead.school_class || lead.school_class || '',
        communication_channel: (fullLead.communication_channel ?? lead.communication_channel as LeadCommunicationChannel | null) || '',
        source: fullLead.source || lead.source || '',
        referral_name: fullLead.referral_name || lead.referral_name || '',
      });
    } catch {
      // оставляем данные из списка (уже подставлены выше)
    }
    await loadLeadDetails(lead);
  };

  const handleCreateTask = async () => {
    if (!selectedLead) return;
    if (!taskTemplateId) {
      setError('Ошибка операции');
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
      setError(extractApiError(err, 'Ошибка операции'));
    }
  };

  const handleCloseTask = async (task: LeadTask) => {
    if (!selectedLead) return;
    try {
      await salesApi.closeTask(selectedLead.id, task.id);
      await loadLeadDetails(selectedLead);
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка операции'));
    }
  };

  const handleCreateAndSendInvoice = async (lead: Lead) => {
    setActionLoadingId(lead.id);
    setError(null);
    try {
      if (!lead.abonement_id) {
        setError('Ошибка операции');
        return;
      }
      const invoice = await salesApi.createInvoice(lead.id, {
        abonement_id: lead.abonement_id,
        email_to: lead.email || undefined,
      });
      await salesApi.sendInvoiceEmail(invoice.id);
      await loadLeads();
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка операции'));
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
        message: channel === 'call' ? '[quick-call] h!dddddhc hVh�h[h\h[hQ' : '[quick-messenger] h!ddddh[ha dh[h[h�dhah\hUha',
      });
      await loadLeadDetails(selectedLead);
      await loadLeads();
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка операции'));
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
      setError(extractApiError(err, 'Ошибка операции'));
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
      setError(extractApiError(err, 'Ошибка операции'));
    }
  };

  const handleRowQuickFollowUp = async (lead: Lead) => {
    const pushTemplate = taskTemplates.find((t) => t.name.toLowerCase().includes('h$h[hbhUh]')) || taskTemplates[0];
    if (!pushTemplate) {
      setError('Ошибка операции');
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
        message: `Follow-up запланирован: ${format(due, 'dd.MM.yyyy HH:mm')}`,
        severity: 'warning',
      });
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка операции'));
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
      setError('Ошибка операции');
      return;
    }
    const pushTemplate = taskTemplates.find((t) => t.name.toLowerCase().includes('h$h[hbhUh]')) || taskTemplates[0];
    if (!pushTemplate) {
      setError('Ошибка операции');
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
        ? `Follow-up h\h�hVh\h�dhah\: ${success}, h[dhUh�h[hQ: ${failed}. ${failedNames.length ? `h/dh[h�hWhah]h\dha hWhUh$d: ${failedNames.join(', ')}` : ''}`
        : `Follow-up h\h�hVh\h�dhah\: ${success}`,
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
      setError('Ошибка операции');
      return;
    }
    if (!batchSendFollowUpAt) {
      setError('Ошибка операции');
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
        ? `h(h\dh[ h[dhdh�h�hWhah\h[: ${success}, h[dhUh�h[hQ: ${failed}. ${failedNames.length ? `h/dh[h�hWhah]h\dha hWhUh$d: ${failedNames.join(', ')}` : ''}`
        : `h(h\dh[ h[dhdh�h�hWhah\h[: ${success}`,
      severity: failed ? 'warning' : 'success',
    });
  };

  const handleSaveContactResult = async () => {
    if (!selectedLead) return;
    if ((contactOutcome === 'no_answer' || contactOutcome === 'callback') && !contactFollowUpAt) {
      setError('Ошибка операции');
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
      setError(extractApiError(err, 'Ошибка операции'));
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
        setToast({ open: true, message: 'Звонок зафиксирован', severity: 'success' });
      } else if (outcome === 'no_answer') {
        setToast({
          open: true,
          message: `Недозвон, follow-up: ${format(new Date(followUpIso as string), 'dd.MM.yyyy HH:mm')}`,
          severity: 'warning',
        });
      } else {
        setToast({
          open: true,
          message: `Сообщение отправлено, follow-up: ${format(new Date(followUpIso as string), 'dd.MM.yyyy HH:mm')}`,
          severity: 'info',
        });
      }
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка операции'));
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
    if (detailsOpen && selectedLead) {
      salesApi.listSalesCities(true).then(setSalesCities).catch(() => setSalesCities([]));
    }
  }, [detailsOpen, selectedLead?.id]);

  useEffect(() => {
    if (!selectedLead) return;
    setLeadInfoDraft({
      parent_full_name: selectedLead.parent_full_name || selectedLead.contact_name || '',
      parent_phone: selectedLead.parent_phone || selectedLead.phone || '',
      child_full_name: selectedLead.child_full_name || '',
      child_phone: selectedLead.child_phone || '',
      email: selectedLead.email || '',
      city: selectedLead.city || '',
      school_name: selectedLead.school_name || '',
      school_class: selectedLead.school_class || '',
      communication_channel: (selectedLead.communication_channel as LeadCommunicationChannel | null) || '',
      source: selectedLead.source || '',
      referral_name: selectedLead.referral_name || '',
    });
  }, [selectedLead?.id]);

  useEffect(() => {
    if (!selectedLead) return;
    setLeadHeaderStatusDraft(getPipelineColumnForStatus(selectedLead.status));
    setLeadHeaderNextStepDraft(selectedLead.desired_slot || '');
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
        setError(extractApiError(err, 'Ошибка операции'));
      } finally {
        setLeadCommentSaving(false);
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [leadCommentDraft, selectedLead]);

  useEffect(() => {
    if (!selectedLead) return;
    if (
      getPipelineColumnForStatus(selectedLead.status) === leadHeaderStatusDraft &&
      (selectedLead.desired_slot || '') === leadHeaderNextStepDraft
    ) {
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        setLeadHeaderSaving(true);
        const updated = await salesApi.updateLead(selectedLead.id, {
          status: leadHeaderStatusDraft,
          desired_slot: leadHeaderNextStepDraft.trim() || undefined,
        });
        setSelectedLead((prev) =>
          prev ? { ...prev, status: updated.status, desired_slot: updated.desired_slot } : prev
        );
        setLeads((prev) =>
          prev.map((l) =>
            l.id === updated.id ? { ...l, status: updated.status, desired_slot: updated.desired_slot } : l
          )
        );
      } catch (err: any) {
        setError(extractApiError(err, 'Ошибка операции'));
      } finally {
        setLeadHeaderSaving(false);
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [leadHeaderStatusDraft, leadHeaderNextStepDraft, selectedLead]);

  const handleSaveLeadInfo = async () => {
    if (!selectedLead) return;
    try {
      setLeadInfoSaving(true);
      const updated = await salesApi.updateLead(selectedLead.id, {
        contact_name: leadInfoDraft.parent_full_name.trim() || undefined,
        parent_full_name: leadInfoDraft.parent_full_name.trim() || undefined,
        parent_phone: normalizeRuPhone(leadInfoDraft.parent_phone) || undefined,
        child_full_name: leadInfoDraft.child_full_name.trim() || undefined,
        child_phone: normalizeRuPhone(leadInfoDraft.child_phone) || undefined,
        email: leadInfoDraft.email.trim() || undefined,
        city: leadInfoDraft.city.trim() || undefined,
        school_name: leadInfoDraft.school_name.trim() || undefined,
        school_class: leadInfoDraft.school_class.trim() || undefined,
        communication_channel: leadInfoDraft.communication_channel || undefined,
        source: leadInfoDraft.source.trim() || undefined,
        referral_name: leadInfoDraft.referral_name.trim() || undefined,
      });
      setSelectedLead(updated);
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setToast({ open: true, message: 'Звонок зафиксирован', severity: 'success' });
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка операции'));
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
      setError('Ошибка операции');
      return;
    }
    if (!sendInfoForm.follow_up_at) {
      setError('Ошибка операции');
      return;
    }
    if (sendInfoForm.pause_reason && !['hbh$d!h] h[dh�had', 'hh[h$dh]h�dd', 'h\had h�dhah]hah\hU'].includes(sendInfoForm.pause_reason)) {
      setError('Ошибка операции');
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
      setError(extractApiError(err, 'Ошибка операции'));
    }
  };

  const handleAssignPush = async () => {
    if (!selectedLead) return;
    const pushTemplate = taskTemplates.find((t) => t.name.toLowerCase().includes('h$h[hbhUh]')) || taskTemplates[0];
    if (!pushTemplate) {
      setError('Ошибка операции');
      return;
    }
    const due = new Date();
    due.setHours(due.getHours() + 24);
    try {
      await salesApi.createTask(selectedLead.id, {
        template_id: pushTemplate.id,
        status_option_id: taskStatusOptionId ? Number(taskStatusOptionId) : undefined,
        note: 'h!dddddhc h$h[hbhUh]',
        channel: 'call',
        due_at: due.toISOString(),
      });
      await loadLeadDetails(selectedLead);
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка операции'));
    }
  };

  const handleAssignPushTemplateStep = async (step: 'first' | 'second' | 'final') => {
    if (!selectedLead) return;
    const pushTemplate = taskTemplates.find((t) => t.name.toLowerCase().includes('h$h[hbhUh]')) || taskTemplates[0];
    if (!pushTemplate) {
      setError('Ошибка операции');
      return;
    }
    const due = new Date();
    let note = '';
    if (step === 'first') {
      due.setHours(due.getHours() + 24);
      note = 'h$h[hbhUh]: 1-hc hQh[h\dh�hQd';
    } else if (step === 'second') {
      due.setHours(due.getHours() + 48);
      note = 'h$h[hbhUh]: 2-hc hQh[h\dh�hQd';
    } else {
      due.setHours(due.getHours() + 72);
      note = 'h$h[hbhUh]: dhUh\h�hWdh\dhc hQh[h\dh�hQd';
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
        message: `${note} (заметка сохранена)`,
        severity: 'success',
      });
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка операции'));
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
      setError('Ошибка операции');
      return;
    }
    try {
      await salesApi.registerLeadToEvent(Number(registerEventId), {
        lead_id: selectedLead.id,
        note: registerEventNote.trim() || undefined,
      });
      setRegisterEventOpen(false);
      setToast({ open: true, message: 'Звонок зафиксирован', severity: 'success' });
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка операции'));
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
      setError('Ошибка операции');
      return;
    }
    try {
      await salesApi.registerLeadToEvent(nearest.id, { lead_id: selectedLead.id });
      setToast({
        open: true,
        message: `Лид записан на мероприятие: ${formatEventOptionLabel(nearest)}`,
        severity: 'success',
      });
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка операции'));
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
        setError(`h(h]hh[dd hVh�h�haddhah\: dh[hVh$h�h\h[ ${result.created}, hdh[hddhah\h[ ${result.skipped}. h.dhUh�hQhU: ${result.errors.join('; ')}`);
      } else {
        setError(`h(h]hh[dd hVh�h�haddhah\: dh[hVh$h�h\h[ ${result.created}, hdh[hddhah\h[ ${result.skipped}`);
      }
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка операции'));
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
      setError(extractApiError(err, 'Ошибка операции'));
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
      if (lead.status === 'won') return { percent: 100, label: 'Закрыт: успешно' };
      if (lead.status === 'lost') return { percent: 100, label: 'Закрыт: отказ' };
      return { percent: 0, label: 'Шаги ещё не начаты' };
    }
    const byStatus: Record<LeadStatus, number> = {
      new: 0,
      contacted: 30,
      no_answer: 40,
      demo: 55,
      invoice_sent: 80,
      won: 100,
      lost: 100,
      thinking: 25,
      refused: 100,
      trial_scheduled: 50,
      event_registered: 60,
      decided_immediately: 100,
    };
    const base = byStatus[lead.status] ?? 0;
    if (lead.status === 'contacted' || lead.status === 'no_answer' || lead.status === 'demo' || lead.status === 'invoice_sent') {
      if (!lead.next_contact_at) {
        return { percent: Math.max(base - 10, 0), label: 'Ждём назначения follow‑up' };
      }
    }
    if (lead.status === 'won') return { percent: 100, label: 'Закрыт: успешно' };
    if (lead.status === 'lost') return { percent: 100, label: 'Закрыт: отказ' };
    return { percent: base, label: 'Продвижение по шагам' };
  };

  const requiresFollowUpOnDrop = (status: LeadStatus) =>
    status === 'contacted' || status === 'no_answer' || status === 'demo' || status === 'invoice_sent';

  const startStatusAutomation = async (lead: Lead, targetStatus: LeadStatus) => {
    if (lead.status === targetStatus) return;

    // Если лид находится в колонке «Следующее мероприятие» (тег reinvite_next_event),
    // при переводе в другой этап убираем этот тег, чтобы карточка вышла из колонки.
    const currentTags = lead.tags || [];
    const hasReinviteTag = currentTags.includes(TAG_REINVITE_NEXT_EVENT);
    const cleanedTags = hasReinviteTag ? currentTags.filter((t) => t !== TAG_REINVITE_NEXT_EVENT) : currentTags;
    const tagsPayload = hasReinviteTag ? { tags: cleanedTags } as { tags: string[] } : {};

    if (targetStatus === 'no_answer') {
      try {
        await salesApi.updateLead(lead.id, { status: 'no_answer', no_answer_attempt: 1, ...tagsPayload });
        await loadLeads();
        setToast({
          open: true,
          message: `Лид "${lead.contact_name}" перенесён в статус «Недозвон» (попытка 1)`,
          severity: 'success',
        });
      } catch (err: any) {
        setError(extractApiError(err, 'Ошибка операции'));
      }
      return;
    }

    if (targetStatus === 'decided_immediately') {
      try {
        await salesApi.updateLead(lead.id, {
          status: 'decided_immediately',
          questionnaire_filled: false,
          ...tagsPayload,
        });
        await loadLeads();
        setToast({
          open: true,
          message: `Лид "${lead.contact_name}" записан как «Решили сразу»`,
          severity: 'success',
        });
        navigate('/sales/agreed');
      } catch (err: any) {
        setError(extractApiError(err, 'Ошибка операции'));
      }
      return;
    }

    // Для остальных статусов открываем такое же окно, как при dnd-переносе карточки
    setDropLeadId(lead.id);
    setDropTargetStatus(targetStatus);
    setDropFollowUpAt('');
    setDropCallbackAt('');
    setDropRefusedReason('');
    setDropTrialAt('');
    setDropEventId('');
    setDropEventNote('');
    setDropConfirmOpen(true);
  };

  const handleKanbanDragStart = (e: React.DragEvent, leadId: number) => {
    const target = e.target as HTMLElement;
    if (target.closest?.('button, a, [role="button"]')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(leadId));
    e.dataTransfer.setData('application/lead-id', String(leadId));
    setDraggedLeadId(leadId);
  };

  const handleKanbanDragEnd = () => {
    setDraggedLeadId(null);
    setDragOverColumn(null);
  };

  const handleKanbanDrop = async (e: React.DragEvent, targetStatus: LeadStatus | 'next_event') => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverColumn(null);
    const leadId = draggedLeadId ?? (e.dataTransfer.getData('application/lead-id') || e.dataTransfer.getData('text/plain'));
    const id = leadId ? Number(leadId) : null;
    setDraggedLeadId(null);
    if (!id) return;
    const lead = leads.find((l) => l.id === id);
    if (!lead) return;

    if (targetStatus === 'next_event') {
      try {
        const currentTags = lead.tags || [];
        if (currentTags.includes(TAG_REINVITE_NEXT_EVENT)) return;
        await salesApi.updateLead(lead.id, { tags: [...currentTags, TAG_REINVITE_NEXT_EVENT] });
        await loadLeads();
        setToast({
          open: true,
          message: `Лид «${lead.contact_name}» перенесён в «Следующее мероприятие». Он отображается во вкладке «Позвать снова на мероприятие».`,
          severity: 'success',
        });
      } catch (err: any) {
        setError(extractApiError(err, 'Не удалось перенести лид в «Следующее мероприятие»'));
      }
      return;
    }

    if (lead.status === targetStatus) return;

    await startStatusAutomation(lead, targetStatus);
  };

  const handleKanbanDragOver = (e: React.DragEvent, columnStatus: LeadStatus | 'next_event') => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnStatus);
  };

  const handleKanbanDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDragOverColumn(null);
    }
  };

  const handleConfirmKanbanDrop = async () => {
    if (!dropLeadId || !dropTargetStatus) return;
    const lead = leads.find((l) => l.id === dropLeadId);
    if (!lead) {
      setDropConfirmOpen(false);
      return;
    }
    setError('');

    // При выходе из «Следующее мероприятие» убираем служебный тег reinvite_next_event
    const currentTags = lead.tags || [];
    const hasReinviteTag = currentTags.includes(TAG_REINVITE_NEXT_EVENT);
    const cleanedTags = hasReinviteTag ? currentTags.filter((t) => t !== TAG_REINVITE_NEXT_EVENT) : currentTags;
    const tagsPayload = hasReinviteTag ? ({ tags: cleanedTags } as { tags: string[] }) : {};
    if (dropTargetStatus === 'thinking') {
      if (!dropCallbackAt) {
        setError('Ошибка операции');
        return;
      }
      const d = new Date(dropCallbackAt);
      if (!isValid(d)) {
        setError('Ошибка операции');
        return;
      }
      try {
        await salesApi.updateLead(lead.id, {
          status: 'thinking',
          next_contact_at: d.toISOString(),
          ...tagsPayload,
        });
        await loadLeads();
        if (selectedLead?.id === lead.id) setSelectedLead((p) => (p ? { ...p, status: 'thinking', next_contact_at: d.toISOString() } : p));
        setDropConfirmOpen(false);
        setDropLeadId(null);
        setDropTargetStatus(null);
        setDropCallbackAt('');
        setToast({ open: true, message: `Лид "${lead.contact_name}" перенесён в «Думают»`, severity: 'success' });
      } catch (err: any) {
        setError(extractApiError(err, 'Ошибка операции'));
      }
      return;
    }
    if (dropTargetStatus === 'refused') {
      if (!dropRefusedReason.trim()) {
        setError('Ошибка операции');
        return;
      }
      try {
        await salesApi.updateLead(lead.id, {
          status: 'lost',
          lost_reason: dropRefusedReason.trim(),
          ...tagsPayload,
        });
        await loadLeads();
        setDropConfirmOpen(false);
        setDropLeadId(null);
        setDropTargetStatus(null);
        setDropRefusedReason('');
        setToast({ open: true, message: `Лид "${lead.contact_name}" отмечен как отказ`, severity: 'success' });
      } catch (err: any) {
        setError(extractApiError(err, 'Ошибка операции'));
      }
      return;
    }
    if (dropTargetStatus === 'trial_scheduled') {
      if (!dropTrialAt) {
        setError('Ошибка операции');
        return;
      }
      const d = new Date(dropTrialAt);
      if (!isValid(d)) {
        setError('Ошибка операции');
        return;
      }
      try {
        await salesApi.updateLead(lead.id, {
          status: 'trial_scheduled',
          desired_slot: format(d, 'dd.MM.yyyy HH:mm'),
          ...tagsPayload,
        });
        await loadLeads();
        if (selectedLead?.id === lead.id) setSelectedLead((p) => (p ? { ...p, status: 'trial_scheduled', desired_slot: format(d, 'dd.MM.yyyy HH:mm') } : p));
        setDropConfirmOpen(false);
        setDropLeadId(null);
        setDropTargetStatus(null);
        setDropTrialAt('');
        setToast({ open: true, message: `Лид "${lead.contact_name}" записан на пробное занятие`, severity: 'success' });
      } catch (err: any) {
        setError(extractApiError(err, 'Ошибка операции'));
      }
      return;
    }
    if (dropTargetStatus === 'event_registered') {
      if (!dropEventId) {
        setError('Ошибка операции');
        return;
      }
      try {
        await salesApi.registerLeadToEvent(Number(dropEventId), { lead_id: lead.id, note: dropEventNote || undefined });
        await salesApi.updateLead(lead.id, { status: 'event_registered' });
        await loadLeads();
        setDropConfirmOpen(false);
        setDropLeadId(null);
        setDropTargetStatus(null);
        setDropEventId('');
        setDropEventNote('');
        setToast({ open: true, message: `Лид "${lead.contact_name}" записан на мероприятие`, severity: 'success' });
      } catch (err: any) {
        setError(extractApiError(err, 'Ошибка операции'));
      }
      return;
    }
    let nextContactAtIso: string | undefined;
    if (requiresFollowUpOnDrop(dropTargetStatus) && !lead.next_contact_at) {
      if (!dropFollowUpAt) {
        setError('Ошибка операции');
        return;
      }
      const d = new Date(dropFollowUpAt);
      if (!isValid(d)) {
        setError('Ошибка операции');
        return;
      }
      nextContactAtIso = d.toISOString();
    }
      try {
        await salesApi.updateLead(lead.id, {
          status: dropTargetStatus,
          next_contact_at: nextContactAtIso,
          ...tagsPayload,
        });
      if (dropTargetStatus === 'demo' && dropEventId) {
        try {
          await salesApi.registerLeadToEvent(Number(dropEventId), { lead_id: lead.id, note: dropEventNote || undefined });
          setToast({ open: true, message: `Лид "${lead.contact_name}" записан на пробное и на мероприятие`, severity: 'success' });
        } catch (regErr: any) {
          setError(extractApiError(regErr, 'Ошибка операции'));
        }
      }
      await loadLeads();
      if (selectedLead?.id === lead.id) {
        setSelectedLead((prev) =>
          prev ? { ...prev, status: dropTargetStatus, next_contact_at: nextContactAtIso || prev.next_contact_at } : prev
        );
      }
      setDropConfirmOpen(false);
      setDropLeadId(null);
      setDropTargetStatus(null);
      setDropFollowUpAt('');
      setDropEventId('');
      setDropEventNote('');
      setToast({ open: true, message: `Лид "${lead.contact_name}" перенесён в "${statusLabels[dropTargetStatus]}"`, severity: 'success' });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось перенести лид в стадию'));
    }
  };

  const statusOptions = PIPELINE_STATUSES;
  const pipelineLeads = useMemo(
    () =>
      isPipelineRoute
        ? leads.filter((l) => !['event_registered', 'decided_immediately'].includes(l.status))
        : leads,
    [leads, isPipelineRoute]
  );
  /** Лиды с тегом «пригласить на следующее мероприятие» — показываются только в колонке «Следующее мероприятие» */
  const reinviteLeadIds = useMemo(
    () => new Set(leads.filter((l) => (l.tags || []).includes(TAG_REINVITE_NEXT_EVENT)).map((l) => l.id)),
    [leads]
  );
  const kanbanColumns = useMemo(
    () => {
      let source = isPipelineRoute ? pipelineLeads : leads;
      const schoolTrim = pipelineSchoolFilter.trim().toLowerCase();
      if (schoolTrim) {
        source = source.filter((l) => (l.school_name || '').toLowerCase().includes(schoolTrim));
      }
      // h*h[hh$h� h�ddhUh� dhQddd B$ hWhUh$d dh[ ddh�dddh[h] ,;h'h�hQddd,W h\ha hh[hQh�hVdh�h�hah] h� h�h[dh[h\hQha h�h[h[h�dha
      const visibleSource = showArchiveColumn ? source : source.filter((l) => l.status !== 'lost');
      // h+hUh$d d h\hadh�hQh[hc hh[hQh�hVdh�h�hah] dh[hWdhQh[ h� hQh[hWh[h\hQha ,;h1hWhah$ h]hadh[hdhUddhUha,W, hUhV h[ddh�hWdh\dd hQh[hWh[h\h[hQ dh�hUdh�hah]
      const notInNextEventColumn = (l: Lead) => !noShowLeadIds.has(l.id) && !reinviteLeadIds.has(l.id);
      const base = PIPELINE_STATUSES.map((st) => ({
        status: st as LeadStatus | 'archive' | 'next_event',
        title: statusLabels[st],
        leads:
          st === 'refused' && showArchiveColumn
            ? source.filter((l) => l.status === 'refused' && notInNextEventColumn(l))
            : visibleSource.filter((l) => getPipelineColumnForStatus(l.status) === st && notInNextEventColumn(l)),
      }));
      base.push({
        status: 'next_event',
        title: 'Следующее мероприятие',
        leads: source.filter((l) => noShowLeadIds.has(l.id) || reinviteLeadIds.has(l.id)),
      });
      if (showArchiveColumn) {
        base.push({
          status: 'archive',
          title: 'Архив',
          leads: source.filter((l) => l.status === 'lost'),
        });
      }
      return base;
    },
    [isPipelineRoute, leads, pipelineLeads, showArchiveColumn, noShowLeadIds, reinviteLeadIds, pipelineSchoolFilter]
  );

  useEffect(() => {
    if (viewMode !== 'kanban') return;
    const ids = [...new Set(kanbanColumns.flatMap((col) => col.leads.map((l) => l.id)))];
    if (!ids.length) return;
    salesApi.getLeadsSendInfoStatus(ids).then(setSendInfoStatus).catch(() => setSendInfoStatus({}));
  }, [viewMode, kanbanColumns]);

  const handleWidgetSendInfo = async (lead: Lead) => {
    try {
      setActionLoadingId(lead.id);
      await salesApi.createTask(lead.id, { note: 'Отправить информацию' });
      setSendInfoStatus((prev) => ({ ...prev, [lead.id]: 'open' }));
      await loadLeads();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось создать задачу'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleNoAnswerAttemptClick = async (attempt: 1 | 2 | 3) => {
    if (!selectedLead) return;
    if (attempt === 3) {
      setPendingNoAnswerArchiveLead(null);
      setNoAnswerArchiveConfirmOpen(true);
      return;
    }
    try {
      await salesApi.updateLead(selectedLead.id, { no_answer_attempt: attempt });
      await loadLeads();
      setSelectedLead((p) => (p ? { ...p, no_answer_attempt: attempt } : p));
      setToast({ open: true, message: `Попытка дозвона ${attempt}`, severity: 'info' });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось обновить попытку дозвона'));
    }
  };

  const handleWidgetNoAnswerAttempt = async (lead: Lead, attempt: 1 | 2 | 3) => {
    if (attempt === 3) {
      setPendingNoAnswerArchiveLead(lead);
      setNoAnswerArchiveConfirmOpen(true);
      return;
    }
    try {
      setActionLoadingId(lead.id);
      await salesApi.updateLead(lead.id, { no_answer_attempt: attempt });
      await loadLeads();
      setToast({ open: true, message: `Попытка дозвона ${attempt}`, severity: 'info' });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось обновить попытку дозвона'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleNoAnswerArchiveConfirm = async () => {
    const lead = selectedLead ?? pendingNoAnswerArchiveLead;
    if (!lead) return;
    try {
      await salesApi.updateLead(lead.id, { status: 'lost' });
      setNoAnswerArchiveConfirmOpen(false);
      setPendingNoAnswerArchiveLead(null);
      await loadLeads();
      setSelectedLead(null);
      setDetailsOpen(false);
      setToast({ open: true, message: 'Лид перенесён в статус «Отказали после 3 недозвонов»', severity: 'success' });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось перенести лида после 3 недозвонов'));
    }
  };

  const isValidEmail = (email?: string | null) => !!email && /\S+@\S+\.\S+/.test(email);
  const pushTasks = useMemo(
    () =>
      tasks.filter((t) => {
        const templateName = taskTemplates.find((tpl) => tpl.id === t.template_id)?.name?.toLowerCase() || '';
        const note = (t.note || '').toLowerCase();
        return templateName.includes('push') || note.includes('push');
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
            <InputLabel id="status-filter-label">Этап воронки</InputLabel>
            <Select
              labelId="status-filter-label"
              label="Этап воронки"
              value={statusFilter}
              onChange={(e) => setStatusFilter((e.target.value as LeadStatus | 'next_event') || '')}
            >
              <MenuItem value="">Любой</MenuItem>
              <MenuItem value="next_event">Следующее мероприятие</MenuItem>
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
            Только просроченные
          </Button>
          {viewMode === 'kanban' && (
            <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap sx={{ gap: 1 }}>
              <Autocomplete
                freeSolo
                options={schoolOptions}
                value={pipelineSchoolFilter}
                onChange={(_, value) => setPipelineSchoolFilter(value || '')}
                onInputChange={(_, value) => setPipelineSchoolFilter(value)}
                sx={{ minWidth: 220 }}
                renderInput={(params) => <TextField {...params} size="small" label="Школа (фильтр)" />}
              />
              {pipelineSchoolFilter && (
                <Button size="small" variant="text" onClick={() => setPipelineSchoolFilter('')}>
                  Сбросить школу
                </Button>
              )}
              <Checkbox
                id="show-archive-column"
                checked={showArchiveColumn}
                onChange={(e) => setShowArchiveColumn(e.target.checked)}
                size="small"
              />
              <Typography component="label" htmlFor="show-archive-column" variant="body2" sx={{ cursor: 'pointer' }}>
                Показывать колонку «Архив»
              </Typography>
            </Stack>
          )}
          {!isPipelineRoute && (
            <>
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
            </>
          )}
        </Stack>
      </Stack>

      {viewMode === 'table' && (
        <Stack direction="row" spacing={1} mb={1.25} flexWrap="wrap" useFlexGap>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="table-city-filter-label">Город (таблица)</InputLabel>
            <Select
              labelId="table-city-filter-label"
              label="Город (таблица)"
              value={tableCityFilter}
              onChange={(e) => setTableCityFilter(e.target.value as string)}
            >
              <MenuItem value="">Любой город</MenuItem>
              {cityOptions.map((city) => (
                <MenuItem key={city} value={city}>
                  {city}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="table-class-filter-label">Класс (таблица)</InputLabel>
            <Select
              labelId="table-class-filter-label"
              label="Класс (таблица)"
              value={tableClassFilter}
              onChange={(e) => setTableClassFilter(e.target.value as string)}
            >
              <MenuItem value="">Любой класс</MenuItem>
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
            renderInput={(params) => <TextField {...params} size="small" label="Школа (таблица / фильтр)" />}
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
            Сбросить фильтры таблицы
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
            Массовый follow‑up ({selectedLeadIds.length})
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={selectedLeadIds.length === 0}
            onClick={() => setBatchSendOpen(true)}
          >
            Массовая отправка информации
          </Button>
        </Stack>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12}>
      {viewMode === 'table' ? (
      <>
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
            <TableCell>ID</TableCell>
            <TableCell>Контакт</TableCell>
            <TableCell>Этап воронки</TableCell>
            <TableCell>Источник</TableCell>
            <TableCell>Следующий шаг</TableCell>
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
            <TableCell sortDirection={tableSortField === 'created_at' ? tableSortOrder : false}>
              <TableSortLabel
                active={tableSortField === 'created_at'}
                direction={tableSortField === 'created_at' ? tableSortOrder : 'desc'}
                onClick={() => handleTableSort('created_at')}
              >
                Создан
              </TableSortLabel>
            </TableCell>
            <TableCell align="center">Действия</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {paginatedLeads.map((lead) => (
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
                <Stack spacing={0.5} direction="row" alignItems="center" flexWrap="wrap" sx={{ gap: 0.5 }}>
                  <Typography variant="subtitle2">{lead.contact_name}</Typography>
                  {lead.questionnaire_filled && (
                    <Chip size="small" label="Из анкеты" color="info" variant="outlined" />
                  )}
                </Stack>
              </TableCell>
              <TableCell>{lead.phone || '—'}</TableCell>
              <TableCell>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <Select
                    value={getLeadStatusMenuValue(lead)}
                    onChange={(e) => void handleLeadStatusSelectChange(lead, e.target.value as string)}
                    renderValue={() => getLeadStatusDisplay(lead)}
                    disabled={actionLoadingId === lead.id}
                  >
                    <MenuItem value="next_event">
                      <Chip size="small" label="Следующее мероприятие" />
                    </MenuItem>
                    {statusOptions.map((st) => (
                      <MenuItem key={st} value={`base:${st}`}>
                        <Chip size="small" label={statusLabels[st]} color={badgeColor(st)} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </TableCell>
              <TableCell>{lead.source || '—'}</TableCell>
              <TableCell>
                {lead.communication_channel
                  ? (leadCommunicationChannelLabels[lead.communication_channel as LeadCommunicationChannel] ?? lead.communication_channel)
                  : '—'}
              </TableCell>
              <TableCell>{lead.school_class || '—'}</TableCell>
              <TableCell>{lead.school_name || '—'}</TableCell>
              <TableCell>{lead.city || '—'}</TableCell>
              <TableCell>
                {(() => {
                  const d = parseISO(lead.created_at);
                  return isValid(d) ? format(d, 'dd.MM.yyyy') : lead.created_at;
                })()}
              </TableCell>
              <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                  <Tooltip title="Позвонить">
                    <IconButton size="small" component="a" href={`tel:${lead.parent_phone || lead.phone || ''}`}>
                      <CallIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Telegram">
                    <IconButton size="small" component="a" href={`https://t.me/${(lead.parent_phone || lead.phone || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" disabled={!lead.phone}>
                      <ChatIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="SMS">
                    <IconButton
                      size="small"
                      onClick={() => {
                        setSmsModalPhone(lead.parent_phone || lead.phone || '');
                        setSmsModalLeadId(lead.id);
                        setSmsModalOpen(true);
                      }}
                    >
                      <SmsIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="MAX">
                    <IconButton
                      size="small"
                      onClick={() => {
                        setMaxModalLeadId(lead.id);
                        setMaxModalMaxUserId(lead.max_user_id ?? null);
                        setMaxModalPhone(lead.parent_phone || lead.phone || '');
                        setMaxModalOpen(true);
                      }}
                    >
                      <MaxIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
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
      <TablePagination
        component="div"
        count={filteredSortedLeads.length}
        page={tablePage}
        onPageChange={(_e, newPage) => setTablePage(newPage)}
        rowsPerPage={tableRowsPerPage}
        onRowsPerPageChange={(e) => { setTableRowsPerPage(parseInt(e.target.value, 10)); setTablePage(0); }}
        rowsPerPageOptions={[25, 50, 100, 200]}
        labelRowsPerPage="Строк на странице:"
        labelDisplayedRows={({ from, to, count }) => `${from}–${to} из ${count}`}
      />
      </>
      ) : (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'nowrap',
            gap: 2,
            overflowX: 'auto',
            pb: 1,
            minHeight: 400,
          }}
        >
          {kanbanColumns.map((col) => (
            <Box
              key={col.status}
              sx={{
                flex: '0 0 auto',
                width: 280,
                minWidth: 280,
              }}
            >
              <Card
                variant="outlined"
                sx={{
                  height: '100%',
                  transition: 'background-color 0.15s, box-shadow 0.15s',
                  ...((col.status !== 'archive') && dragOverColumn === col.status && draggedLeadId
                    ? { bgcolor: 'action.hover', boxShadow: 2 }
                    : {}),
                }}
                onDragOver={col.status === 'archive' ? undefined : (e) => handleKanbanDragOver(e, col.status as LeadStatus | 'next_event')}
                onDragLeave={col.status === 'archive' ? undefined : handleKanbanDragLeave}
                onDrop={col.status === 'archive' ? undefined : (e) => handleKanbanDrop(e, col.status as LeadStatus | 'next_event')}
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
                        draggable={col.status !== 'archive' && col.status !== 'next_event'}
                        onDragStart={col.status === 'archive' || col.status === 'next_event' ? undefined : (e) => handleKanbanDragStart(e, lead.id)}
                        onDragEnd={col.status === 'archive' || col.status === 'next_event' ? undefined : handleKanbanDragEnd}
                        onDragOver={col.status === 'archive' || col.status === 'next_event' ? undefined : (e) => handleKanbanDragOver(e, col.status as LeadStatus)}
                        onDragLeave={col.status === 'archive' || col.status === 'next_event' ? undefined : handleKanbanDragLeave}
                        onDrop={col.status === 'archive' || col.status === 'next_event' ? undefined : (e) => handleKanbanDrop(e, col.status as LeadStatus)}
                        sx={{
                          borderRadius: 2,
                          borderColor:
                            selectedLead?.id === lead.id
                              ? 'primary.main'
                              : getKanbanBorderColor(lead.next_contact_at),
                          borderWidth: 2,
                          opacity: draggedLeadId === lead.id ? 0.6 : 1,
                          cursor: draggedLeadId === lead.id ? 'grabbing' : 'grab',
                          userSelect: 'none',
                        }}
                      >
                        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Stack direction="row" alignItems="center" flexWrap="wrap" sx={{ gap: 0.5 }}>
                            <Typography variant="subtitle2">{lead.contact_name}</Typography>
                            {lead.questionnaire_filled && (
                              <Chip size="small" label="Из анкеты" color="info" variant="outlined" />
                            )}
                          </Stack>
                          <Typography variant="caption" color="text.secondary">{lead.phone}</Typography>
                          {lead.source && (
                            <Typography variant="caption" display="block" color="text.secondary">
                              Источник: {lead.source}
                            </Typography>
                          )}
                          {lead.status === 'thinking' && lead.next_contact_at && (
                            <Typography variant="caption" display="block" color="primary">
                              Следующий контакт: {format(parseISO(lead.next_contact_at), 'dd.MM HH:mm')}
                            </Typography>
                          )}
                          {lead.status === 'no_answer' && (
                            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} onClick={(e) => e.stopPropagation()}>
                              {([1, 2, 3] as const).map((n) => (
                                <Button
                                  key={n}
                                  size="small"
                                  variant={(lead.no_answer_attempt ?? 1) >= n ? 'contained' : 'outlined'}
                                  color={(lead.no_answer_attempt ?? 1) === n ? 'warning' : 'inherit'}
                                  sx={{ minWidth: 0, px: 0.75, fontSize: '0.7rem' }}
                                  disabled={actionLoadingId === lead.id}
                                  onClick={() => void handleWidgetNoAnswerAttempt(lead, n)}
                                >
                                  Попытка {n}
                                </Button>
                              ))}
                            </Stack>
                          )}
                          {(() => {
                            const p = getKanbanPushProgressEstimate(lead);
                            return (
                              <Stack spacing={0.5} mt={1}>
                                <Stack direction="row" justifyContent="space-between">
                                  <Typography variant="caption" color="text.secondary">
                                    Продвижение: {p.label}
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
                          <Box sx={{ mt: 1 }} onClick={(e) => e.stopPropagation()}>
                            <FormControl size="small" sx={{ minWidth: 160 }}>
                              <Select
                                value={getLeadStatusMenuValue(lead)}
                                onChange={(e) => void handleLeadStatusSelectChange(lead, e.target.value as string)}
                                renderValue={() => getLeadStatusDisplay(lead)}
                                disabled={actionLoadingId === lead.id}
                              >
                                <MenuItem value="next_event">
                                  <Chip size="small" label="Следующее мероприятие" />
                                </MenuItem>
                                {statusOptions.map((st) => (
                                  <MenuItem key={st} value={`base:${st}`}>
                                    <Chip size="small" label={statusLabels[st]} color={badgeColor(st)} />
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </Box>
                          <Stack direction="row" spacing={0.5} mt={1} alignItems="center" flexWrap="wrap" onClick={(e) => e.stopPropagation()}>
                            <Tooltip title="Позвонить">
                              <IconButton size="small" component="a" href={`tel:${lead.parent_phone || lead.phone || ''}`}>
                                <CallIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Telegram">
                              <IconButton size="small" component="a" href={`https://t.me/${(lead.parent_phone || lead.phone || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" disabled={!lead.phone}>
                                <ChatIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="SMS">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setSmsModalPhone(lead.parent_phone || lead.phone || '');
                                  setSmsModalLeadId(lead.id);
                                  setSmsModalOpen(true);
                                }}
                              >
                                <SmsIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="MAX">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setMaxModalLeadId(lead.id);
                                  setMaxModalMaxUserId(lead.max_user_id ?? null);
                                  setMaxModalPhone(lead.parent_phone || lead.phone || '');
                                  setMaxModalOpen(true);
                                }}
                              >
                                <MaxIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                          <Stack direction="row" spacing={1} mt={0.5} flexWrap="wrap" onClick={(e) => e.stopPropagation()}>
                            <Button size="small" onClick={() => handleOpenDetails(lead)}>
                              Открыть
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color={sendInfoStatus[lead.id] === 'done' ? 'success' : sendInfoStatus[lead.id] === 'open' ? 'error' : undefined}
                              disabled={actionLoadingId === lead.id}
                              onClick={() => void handleWidgetSendInfo(lead)}
                            >
                              Отправить информацию
                            </Button>
                          </Stack>
                        </CardContent>
                      </Card>
                    ))}
                    {col.leads.length === 0 && (
                      <Typography variant="caption" color="text.secondary">
                        Лидов нет
                      </Typography>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Box>
          ))}
        </Box>
      )}
        </Grid>

        <Dialog
          open={detailsOpen && !!selectedLead}
          onClose={() => { setDetailsOpen(false); setSelectedLead(null); navigate(location.pathname === '/sales/pipeline' ? '/sales/pipeline' : '/sales/leads', { replace: true }); }}
          maxWidth="xl"
          fullWidth
          scroll="paper"
          PaperProps={{ sx: { maxHeight: '95vh' } }}
        >
          <DialogContent sx={{ p: 0 }}>
        {detailsOpen && selectedLead && (
            <Card variant="outlined" sx={{ boxShadow: 'none' }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1} flexWrap="wrap" sx={{ gap: 1 }}>
                  <Stack direction="row" alignItems="center" flexWrap="wrap" sx={{ gap: 1 }}>
                    <Typography variant="h6">Карточка лида</Typography>
                    {selectedLead?.questionnaire_filled && (
                      <Chip size="small" label="Из анкеты" color="info" variant="outlined" />
                    )}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ width: '100%', mt: 0.5 }}>
                    Контакт: {selectedLead.contact_name || '—'} · {selectedLead.phone || '—'}
                  </Typography>
                  <Stack direction="row" alignItems="center" sx={{ width: '100%', mt: 0.5, gap: 1 }} flexWrap="wrap">
                    <Typography variant="caption" color="text.secondary">Телефон</Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<CallIcon />}
                      href={`tel:${selectedLead.parent_phone || selectedLead.phone || ''}`}
                      component="a"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Позвонить
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<ChatIcon />}
                      href={selectedLead.phone ? `https://t.me/${selectedLead.phone.replace(/\D/g, '')}` : undefined}
                      component="a"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      disabled={!selectedLead.phone}
                    >
                      Telegram
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<SmsIcon />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSmsModalPhone(selectedLead.parent_phone || selectedLead.phone || '');
                        setSmsModalLeadId(selectedLead.id);
                        setSmsModalOpen(true);
                      }}
                    >
                      SMS
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<MaxIcon />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMaxModalLeadId(selectedLead.id);
                        setMaxModalMaxUserId(selectedLead.max_user_id ?? null);
                        setMaxModalPhone(selectedLead.parent_phone || selectedLead.phone || '');
                        setMaxModalOpen(true);
                      }}
                    >
                      MAX
                    </Button>
                  </Stack>
                  {(selectedLead.comment || leadCommentDraft) && (
                    <Box sx={{ width: '100%', mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Typography variant="caption" color="text.secondary" component="span">
                        Комментарий:{' '}
                      </Typography>
                      <Typography variant="body2" component="span" sx={{ whiteSpace: 'pre-wrap' }}>
                        {leadCommentDraft || selectedLead.comment || ''}
                      </Typography>
                    </Box>
                  )}
                  {selectedLead.questionnaire_filled && selectedLead.questionnaire_data && Object.keys(selectedLead.questionnaire_data).length > 0 && (
                    <Box sx={{ width: '100%', mt: 1, p: 1.5, bgcolor: 'info.light', borderRadius: 1, border: '1px solid', borderColor: 'info.main' }}>
                      <Typography variant="subtitle2" color="info.dark" sx={{ mb: 1 }}>
                        Данные из анкеты
                      </Typography>
                      <Grid container spacing={1}>
                        {[
                          { key: 'child_full_name', label: 'ФИО ученика' },
                          { key: 'birth_date', label: 'Дата рождения' },
                          { key: 'child_phone', label: 'Телефон ученика' },
                          { key: 'child_telegram', label: 'Телеграм ученика' },
                          { key: 'student_email', label: 'Email ученика' },
                          { key: 'gender', label: 'Пол' },
                          { key: 'city', label: 'Город' },
                          { key: 'school_name', label: 'Образовательное учреждение' },
                          { key: 'school_class', label: 'Класс' },
                          { key: 'parent_full_name', label: 'ФИО родителя' },
                          { key: 'parent_phone', label: 'Телефон родителя' },
                          { key: 'parent_phone_2', label: 'Второй телефон' },
                          { key: 'parent_telegram', label: 'Телеграм родителя' },
                          { key: 'parent_email', label: 'Email родителя' },
                          { key: 'preferred_messenger', label: 'Мессенджер' },
                          { key: 'comment', label: 'Комментарий (цели обучения, уровень, удобное время и т.п.)' },
                          { key: 'source', label: 'Откуда о нас узнали' },
                        ].map(({ key, label }) => {
                          const value = (selectedLead.questionnaire_data as Record<string, unknown>)[key];
                          if (value == null || value === '') return null;
                          const display =
                            key === 'birth_date' && typeof value === 'string'
                              ? (() => {
                                  const d = parseISO(value);
                                  return isValid(d) ? format(d, 'dd.MM.yyyy') : value;
                                })()
                              : typeof value === 'string'
                                ? value
                                : String(value);
                          return (
                            <Grid item xs={12} sm={6} key={key}>
                              <Typography variant="caption" color="text.secondary" display="block">
                                {label}
                              </Typography>
                              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                {display}
                              </Typography>
                            </Grid>
                          );
                        })}
                      </Grid>
                    </Box>
                  )}
                  {/* Переписка SMS / MAX */}
                  <Box sx={{ width: '100%', mt: 1.5 }}>
                    <Typography variant="subtitle2">Переписка (SMS / MAX)</Typography>
                    <Stack
                      spacing={1}
                      sx={{
                        mt: 0.5,
                        maxHeight: 260,
                        overflowY: 'auto',
                        pr: 1,
                        borderRadius: 1,
                        bgcolor: 'background.default',
                      }}
                    >
                      {communications.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          Пока сообщений нет.
                        </Typography>
                      ) : (
                        communications
                          .slice()
                          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                          .map((c) => {
                            const isSms = c.channel === 'sms';
                            const isMax = c.channel === 'max';
                            const isManager = true; // пока все записи исходящие из CRM
                            return (
                              <Box
                                key={c.id}
                                sx={{
                                  display: 'flex',
                                  justifyContent: isManager ? 'flex-end' : 'flex-start',
                                }}
                              >
                                <Box sx={{ maxWidth: '80%' }}>
                                  <Box
                                    sx={{
                                      px: 1.5,
                                      py: 1,
                                      borderRadius: 2,
                                      bgcolor: isSms ? 'primary.main' : isMax ? 'success.main' : 'grey.800',
                                      color: 'common.white',
                                      fontSize: 13,
                                    }}
                                  >
                                    <Typography variant="caption" sx={{ opacity: 0.8 }}>
                                      {isSms ? 'SMS' : isMax ? 'MAX' : c.channel}
                                    </Typography>
                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                      {c.message}
                                    </Typography>
                                  </Box>
                                  <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.3 }}>
                                    {new Date(c.created_at).toLocaleString()}
                                  </Typography>
                                </Box>
                              </Box>
                            );
                          })
                      )}
                    </Stack>
                  </Box>
                  <Stack direction="row" alignItems="center" sx={{ gap: 1, flexWrap: 'wrap' }}>
                    {selectedLead && !selectedLead.converted_to_student_id && (
                      <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        disabled={actionLoadingId === selectedLead.id}
                        onClick={async () => {
                          if (!selectedLead) return;
                          setActionLoadingId(selectedLead.id);
                          try {
                            const { student_id } = await salesApi.convertLeadToStudent(selectedLead.id);
                            setToast({ open: true, message: 'Лид переведён в ученики', severity: 'success' });
                            setDetailsOpen(false);
                            setSelectedLead(null);
                            await loadLeads();
                            navigate(`/students?detail=${student_id}`);
                          } catch (e) {
                            const msg = extractApiError(e, 'Ошибка перевода в ученики');
                            setToast({ open: true, message: msg, severity: 'error' });
                          } finally {
                            setActionLoadingId(null);
                          }
                        }}
                      >
                        Перевести в ученики
                      </Button>
                    )}
                    {selectedLead && (
                      <Button
                        size="small"
                        color="secondary"
                        disabled={actionLoadingId === selectedLead.id}
                        onClick={async () => {
                          if (!selectedLead) return;
                          const confirmed = window.confirm('Удалить этого лида без возможности восстановления?');
                          if (!confirmed) return;
                          setActionLoadingId(selectedLead.id);
                          try {
                            await salesApi.deleteLead(selectedLead.id);
                            setToast({ open: true, message: 'Лид удалён', severity: 'success' });
                            setDetailsOpen(false);
                            setSelectedLead(null);
                            await loadLeads();
                          } catch (e) {
                            const msg = extractApiError(e, 'Не удалось удалить лида');
                            setToast({ open: true, message: msg, severity: 'error' });
                          } finally {
                            setActionLoadingId(null);
                          }
                        }}
                      >
                        Удалить лида
                      </Button>
                    )}
                    <Button
                      size="small"
                      onClick={() => {
                        setDetailsOpen(false);
                        setSelectedLead(null);
                        navigate(
                          location.pathname === '/sales/pipeline' ? '/sales/pipeline' : '/sales/leads',
                          { replace: true }
                        );
                      }}
                    >
                      Закрыть
                    </Button>
                  </Stack>
                </Stack>
                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle2">Контакты</Typography>
                    <Grid container spacing={1} sx={{ mt: 0.25 }}>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          size="small"
                          label="ФИО родителя"
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
                          label="ФИО ребёнка"
                          value={leadInfoDraft.child_full_name}
                          onChange={(e) => setLeadInfoDraft((s) => ({ ...s, child_full_name: e.target.value }))}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Телефон ребёнка"
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
                          <InputLabel id="lead-card-city-label">Город</InputLabel>
                          <Select
                            labelId="lead-card-city-label"
                            label="Город"
                            value={leadInfoDraft.city}
                            onChange={(e) => setLeadInfoDraft((s) => ({ ...s, city: e.target.value as string }))}
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
                      <Grid item xs={12}>
                        <Autocomplete
                          freeSolo
                          options={salesSchools.map((s) => s.name)}
                          value={leadInfoDraft.school_name}
                          onInputChange={(_, value) => setLeadInfoDraft((s) => ({ ...s, school_name: value }))}
                          onChange={(_, value) =>
                            setLeadInfoDraft((s) => ({ ...s, school_name: (value as string) ?? '' }))
                          }
                          renderInput={(params) => (
                            <TextField {...params} size="small" label="Школа" placeholder="Выберите или введите" />
                          )}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Класс"
                          value={leadInfoDraft.school_class}
                          onChange={(e) => setLeadInfoDraft((s) => ({ ...s, school_class: e.target.value }))}
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
                              <em>Не указан</em>
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
                          label="Кто порекомендовал"
                          value={leadInfoDraft.referral_name}
                          onChange={(e) => setLeadInfoDraft((s) => ({ ...s, referral_name: e.target.value }))}
                        />
                      </Grid>
                    </Grid>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => void handleSaveLeadInfo()}
                      disabled={leadInfoSaving}
                      sx={{ mt: 1 }}
                    >
                      {leadInfoSaving ? 'Сохранение...' : 'Сохранить контакты'}
                    </Button>
                    <TextField
                      fullWidth
                      multiline
                      minRows={2}
                      size="small"
                      sx={{ mt: 1 }}
                      label="Комментарий по лиду"
                      value={leadCommentDraft}
                      onChange={(e) => setLeadCommentDraft(e.target.value)}
                      helperText={leadCommentSaving ? 'Сохранение...' : 'Можно описать контекст, договорённости и след. шаги'}
                    />
                    {selectedLead.lost_reason && (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        Причина отказа: {selectedLead.lost_reason}
                      </Alert>
                    )}
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
        )}
          </DialogContent>
        </Dialog>
      </Grid>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Новый лид</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} md={6}>
              <TextField
                label="ФИО родителя *"
                fullWidth
                required
                value={form.parent_full_name}
                onChange={(e) => setForm((s) => ({ ...s, parent_full_name: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="ФИО ребёнка"
                fullWidth
                value={form.child_full_name}
                onChange={(e) => setForm((s) => ({ ...s, child_full_name: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Телефон родителя *"
                fullWidth
                required
                value={form.parent_phone}
                onChange={(e) => setForm((s) => ({ ...s, parent_phone: e.target.value }))}
                onBlur={() => setForm((s) => ({ ...s, parent_phone: normalizeRuPhone(s.parent_phone) }))}
                helperText="Формат: +7XXXXXXXXXX"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Телефон ребёнка"
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
              <FormControl fullWidth required>
                <InputLabel id="lead-city-label">Город *</InputLabel>
                <Select
                  labelId="lead-city-label"
                  label="Город *"
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
                {salesCities.length === 0 && cityOptions.length === 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    Добавьте города в Настройки Sales → Города.
                  </Typography>
                )}
                {salesCities.length === 0 && cityOptions.length > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    Список из существующих лидов. Для полного списка добавьте города в Настройки Sales → Города.
                  </Typography>
                )}
                {salesCities.length > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                    Список из раздела Настройки Sales → Города.
                  </Typography>
                )}
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <Autocomplete
                freeSolo
                options={schoolOptions}
                inputValue={form.school_name}
                onInputChange={(_, value) => setForm((s) => ({ ...s, school_name: value }))}
                renderInput={(params) => <TextField {...params} label="Школа" fullWidth helperText="Можно выбрать из списка или ввести свою" />}
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
              <FormControl fullWidth required>
                <InputLabel id="lead-source-label">Источник *</InputLabel>
                <Select
                  labelId="lead-source-label"
                  label="Источник *"
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
            {leadSources.find((s) => String(s.id) === String(form.source_id))?.name.toLowerCase() === 'сарафанное радио' && (
              <Grid item xs={12} md={6}>
                <TextField
                  label="Кто порекомендовал"
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
                  label="Комментарий по лиду"
                fullWidth
                multiline
                minRows={2}
                value={form.comment}
                onChange={(e) => setForm((s) => ({ ...s, comment: e.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!form.parent_full_name.trim() || !form.parent_phone.trim() || !form.city.trim() || !form.source_id}
          >
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={sendInfoOpen} onClose={() => setSendInfoOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Отправить информацию</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel id="info-template-label">Шаблон сообщения</InputLabel>
            <Select
              labelId="info-template-label"
              label="Шаблон сообщения"
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
            label="Пауза"
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
                <em>Без paузы</em>
              </MenuItem>
              <MenuItem value="нет ответа">Нет ответа</MenuItem>
              <MenuItem value="подумают">Подумают</MenuItem>
              <MenuItem value="после мероприятия">После мероприятия</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            type="datetime-local"
            label="Follow-up (когда связаться)"
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
        <DialogTitle>Быстрая запись на мероприятие</DialogTitle>
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
                <em>Не выбрано</em>
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
            label="Комментарий по регистрации"
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
        <DialogTitle>Причина отказа</DialogTitle>
        <DialogContent>
          <TextField
            label="Причина отказа"
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
            Подтвердить отказ
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={batchFollowUpOpen} onClose={() => setBatchFollowUpOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Массовый follow‑up</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Выбрано лидов: {selectedLeadIds.length}
          </Typography>
          <TextField
            fullWidth
            type="datetime-local"
            label="Дата и время follow‑up"
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 2 }}
            value={batchFollowUpAt}
            onChange={(e) => setBatchFollowUpAt(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBatchFollowUpOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleBatchAssignFollowUp()}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={batchSendOpen} onClose={() => setBatchSendOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Массовая отправка информации</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Выбрано лидов: {selectedLeadIds.length}
          </Typography>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel id="batch-template-label">Шаблон сообщения</InputLabel>
            <Select
              labelId="batch-template-label"
              label="Шаблон сообщения"
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
            label="Follow-up (когда связаться)"
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
        <DialogTitle>
          {dropTargetStatus === 'thinking' && 'Подумают — дата перезвона'}
          {dropTargetStatus === 'refused' && 'Отказали — причина'}
          {dropTargetStatus === 'trial_scheduled' && 'Запись на пробное'}
          {dropTargetStatus === 'event_registered' && 'Запись на мероприятие'}
          {dropTargetStatus && !['thinking', 'refused', 'trial_scheduled', 'event_registered'].includes(dropTargetStatus) && 'Подтвердить перенос стадии'}
        </DialogTitle>
        <DialogContent>
          {dropTargetStatus === 'thinking' && (
            <TextField
              fullWidth
              type="datetime-local"
              label="Дата и время перезвона"
              InputLabelProps={{ shrink: true }}
              sx={{ mt: 2 }}
              value={dropCallbackAt}
              onChange={(e) => setDropCallbackAt(e.target.value)}
            />
          )}
          {dropTargetStatus === 'refused' && (
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel id="drop-refused-label">Причина отказа</InputLabel>
              <Select labelId="drop-refused-label" label="Причина отказа" value={dropRefusedReason} onChange={(e) => setDropRefusedReason(e.target.value)}>
                <MenuItem value=""><em>Выберите</em></MenuItem>
                {(refusedReasons.length ? refusedReasons : DEFAULT_REFUSED_REASONS).map((r) => (
                  <MenuItem key={r} value={r}>{r}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          {dropTargetStatus === 'trial_scheduled' && (
            <TextField
              fullWidth
              type="datetime-local"
              label="Дата и время пробного"
              InputLabelProps={{ shrink: true }}
              sx={{ mt: 2 }}
              value={dropTrialAt}
              onChange={(e) => setDropTrialAt(e.target.value)}
            />
          )}
          {dropTargetStatus === 'event_registered' && (
            <>
              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel id="drop-event-reg-label">Мероприятие</InputLabel>
                <Select labelId="drop-event-reg-label" label="Мероприятие" value={dropEventId} onChange={(e) => setDropEventId((e.target.value as number) || '')}>
                  <MenuItem value=""><em>Выберите</em></MenuItem>
                  {events.map((ev) => (
                    <MenuItem key={ev.id} value={ev.id}>{formatEventOptionLabel(ev)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {dropEventId && (
                <TextField fullWidth multiline minRows={2} label="Комментарий к записи" sx={{ mt: 2 }} value={dropEventNote} onChange={(e) => setDropEventNote(e.target.value)} />
              )}
            </>
          )}
          {dropTargetStatus && !['thinking', 'refused', 'trial_scheduled', 'event_registered'].includes(dropTargetStatus) && (
            <>
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
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDropConfirmOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleConfirmKanbanDrop()}>
            {dropTargetStatus === 'refused' ? 'В архив' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={noAnswerArchiveConfirmOpen} onClose={() => { setNoAnswerArchiveConfirmOpen(false); setPendingNoAnswerArchiveLead(null); }}>
        <DialogTitle>Отправить в архив?</DialogTitle>
        <DialogContent>
          <Typography>После недозвона 3 лид будет отправлен в архив.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setNoAnswerArchiveConfirmOpen(false); setPendingNoAnswerArchiveLead(null); }}>Отмена</Button>
          <Button variant="contained" color="error" onClick={() => void handleNoAnswerArchiveConfirm()}>
            В архив
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
      <SendSMSModal
        open={smsModalOpen}
        onClose={() => { setSmsModalOpen(false); setSmsModalLeadId(null); }}
        phone={smsModalPhone}
        entityType="lead"
        entityId={smsModalLeadId ?? undefined}
        onSent={() => { if (selectedLead && smsModalLeadId === selectedLead.id) void loadLeadDetails(selectedLead); }}
      />
      <SendMaxModal
        open={maxModalOpen}
        onClose={() => { setMaxModalOpen(false); setMaxModalLeadId(null); setMaxModalMaxUserId(null); setMaxModalPhone(''); }}
        leadId={maxModalLeadId ?? undefined}
        initialMaxUserId={maxModalMaxUserId ?? undefined}
        initialPhone={maxModalPhone || undefined}
        onSent={() => { if (selectedLead && maxModalLeadId === selectedLead.id) void loadLeadDetails(selectedLead); }}
      />
    </Layout>
  );
};

export default SalesLeadsPage;
