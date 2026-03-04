import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Edit from '@mui/icons-material/Edit';
import Delete from '@mui/icons-material/Delete';
import ViewModule from '@mui/icons-material/ViewModule';
import TableChart from '@mui/icons-material/TableChart';
import { format, isValid, parseISO } from 'date-fns';
import Layout from '../components/Layout';
import { b2bApi, tasksApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { B2BSchool, B2BSchoolPipelineStage, B2BSchoolContact, B2BProject } from '../types';
import { ALL_FUNNEL_STAGES, hasNoNextAction } from '../constants/b2bFunnel';

const PIPELINE_STAGES = ALL_FUNNEL_STAGES;

const FRIENDSHIP_DEGREES: { value: string; label: string }[] = [
  { value: 'unknown', label: 'Не знаем друг друга' },
  { value: 'indirect', label: 'Знаем косвенно' },
  { value: 'friends', label: 'Друзья' },
  { value: 'enemies', label: 'Враги' },
];

export const B2BSchoolsContent: React.FC = () => {
  const [schools, setSchools] = useState<B2BSchool[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [projects, setProjects] = useState<B2BProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [managers, setManagers] = useState<{ id: number; full_name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<B2BSchool | null>(null);
  const PARTNERSHIP_KEYS = [
    { key: 'invited', label: 'Пригласили' },
    { key: 'agreement_sent', label: 'Отправили соглашение' },
    { key: 'signed_school', label: 'Подписано школой' },
    { key: 'signed_both', label: 'Подписано с двух сторон' },
    { key: 'originals_received', label: 'Оригиналы получены' },
    { key: 'icon_on_site', label: 'Иконка на сайт' },
    { key: 'active_partner', label: 'Активный партнёр' },
  ] as const;
  const SUPPORT_LETTER_OPTIONS = [
    { value: '', label: 'Не требуется' },
    { value: 'requested', label: 'Запрошено' },
    { value: 'received', label: 'Получено' },
    { value: 'archive', label: 'Архив' },
  ];
  const [form, setForm] = useState({
    name: '',
    director: '',
    city: '',
    address: '',
    student_count: '' as number | '',
    friendship_degree: '',
    pipeline_stage: 'new' as B2BSchoolPipelineStage,
    next_step: '',
    next_step_date: '',
    manager_id: '' as number | '',
    support_letter_status: '',
    preference: '',
    partnership: {} as Record<string, boolean>,
    event_dates: '',
    meeting_scheduled_at: '',
    meeting_outcomes: '',
    walkthrough_scheduled_at: '',
  });
  const [contactForm, setContactForm] = useState({ full_name: '', position: '', phone: '', phone_extra: '' });
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<B2BSchoolContact | null>(null);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectForm, setProjectForm] = useState({
    name: '',
    location: '',
    main_city: '',
    citiesText: '',
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const openIdHandled = useRef(false);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('kanban');
  const [draggingSchoolId, setDraggingSchoolId] = useState<number | null>(null);
  const [dropTargetStage, setDropTargetStage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedManagerId, setSelectedManagerId] = useState<number | ''>('');
  const [selectedStageFilter, setSelectedStageFilter] = useState<string>('');
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [stageDropDialog, setStageDropDialog] = useState<{
    schoolId: number;
    targetStage: string;
    schoolName: string;
  } | null>(null);
  const [stageDropForm, setStageDropForm] = useState({
    what_done: '' as 'call' | 'letter' | 'meeting' | '',
    next_step: '',
    next_step_date: '',
  });

  const loadSchools = useCallback(
    async (opts?: {
      projectId?: number | null;
      city?: string;
      manager_id?: number | null;
      pipeline_stage?: string;
      overdue?: boolean;
      search?: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const data = await b2bApi.listSchools({
          ...(opts?.projectId ? { project_id: opts.projectId } : {}),
          ...(opts?.city ? { city: opts.city } : {}),
          ...(opts?.manager_id != null ? { manager_id: opts.manager_id } : {}),
          ...(opts?.pipeline_stage ? { pipeline_stage: opts.pipeline_stage } : {}),
          ...(opts?.overdue === true ? { overdue: true } : {}),
          ...(opts?.search?.trim() ? { search: opts.search.trim() } : {}),
        });
        setSchools(data);
      } catch (err: any) {
        setError(extractApiError(err, 'Не удалось загрузить школы'));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    (async () => {
      try {
        const [pr, cityList, mgrList] = await Promise.all([
          b2bApi.listProjects({ archived: false }),
          b2bApi.listCities(),
          b2bApi.listManagers(),
        ]);
        setProjects(pr);
        setCities(cityList);
        setManagers(mgrList);
        if (pr.length) setSelectedProjectId(pr[0].id);
      } catch (err: any) {
        setError(extractApiError(err, 'Не удалось загрузить данные'));
      }
    })();
  }, []);

  useEffect(() => {
    loadSchools({
      projectId: selectedProjectId ?? undefined,
      city: selectedCity || undefined,
      manager_id: selectedManagerId === '' ? undefined : selectedManagerId,
      pipeline_stage: selectedStageFilter || undefined,
      overdue: filterOverdue || undefined,
      search: searchQuery.trim() || undefined,
    });
  }, [
    selectedCity,
    selectedProjectId,
    selectedManagerId,
    selectedStageFilter,
    filterOverdue,
    searchQuery,
    loadSchools,
  ]);

  const schoolsByStage = PIPELINE_STAGES.map((stage) => ({
    ...stage,
    schools: schools.filter((s) => s.pipeline_stage === stage.value),
  }));

  const openCreate = () => {
    setEditingSchool(null);
    setForm({
      name: '',
      director: '',
      city: '',
      address: '',
      student_count: '',
      friendship_degree: '',
      pipeline_stage: 'new',
      next_step: '',
      next_step_date: '',
      manager_id: '',
      support_letter_status: '',
      preference: '',
      partnership: {},
      event_dates: '',
      meeting_scheduled_at: '',
      meeting_outcomes: '',
      walkthrough_scheduled_at: '',
    });
    setDialogOpen(true);
  };

  const openEdit = useCallback((school: B2BSchool) => {
    setEditingSchool(school);
    const meetingAt = school.meeting_scheduled_at
      ? format(parseISO(school.meeting_scheduled_at), "yyyy-MM-dd'T'HH:mm")
      : '';
    const walkAt = school.walkthrough_scheduled_at
      ? format(parseISO(school.walkthrough_scheduled_at), 'yyyy-MM-dd')
      : '';
    const nextDate = school.next_step_date ? format(parseISO(school.next_step_date), 'yyyy-MM-dd') : '';
    setForm({
      name: school.name,
      director: school.director ?? '',
      city: school.city ?? '',
      address: school.address ?? '',
      student_count: school.student_count ?? '',
      friendship_degree: school.friendship_degree ?? '',
      pipeline_stage: (school.pipeline_stage as B2BSchoolPipelineStage) ?? 'new',
      next_step: school.next_step ?? '',
      next_step_date: nextDate,
      manager_id: school.manager_id ?? '',
      support_letter_status: school.support_letter_status ?? '',
      preference: school.preference ?? '',
      partnership: (school.partnership && typeof school.partnership === 'object' ? school.partnership as Record<string, boolean> : {}),
      event_dates: Array.isArray(school.event_dates) ? school.event_dates.join(', ') : '',
      meeting_scheduled_at: meetingAt,
      meeting_outcomes: school.meeting_outcomes ?? '',
      walkthrough_scheduled_at: walkAt,
    });
    setDialogOpen(true);
  }, []);

  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || openIdHandled.current || loading) return;
    const id = Number(openId);
    if (!Number.isFinite(id)) return;
    openIdHandled.current = true;
    const fromList = schools.find((s) => s.id === id);
    if (fromList) {
      openEdit(fromList);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      }, { replace: true });
      return;
    }
    b2bApi.getSchool(id).then((school) => {
      openEdit(school);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      }, { replace: true });
    }).catch(() => {
      openIdHandled.current = false;
    });
  }, [schools, loading, searchParams, openEdit, setSearchParams]);

  const refreshEditingSchool = useCallback(async () => {
    if (!editingSchool) return;
    try {
      const updated = await b2bApi.getSchool(editingSchool.id);
      setEditingSchool(updated);
    } catch (_) {}
  }, [editingSchool?.id]);

  const openAddContact = () => {
    setEditingContact(null);
    setContactForm({ full_name: '', position: '', phone: '', phone_extra: '' });
    setContactDialogOpen(true);
  };

  const openEditContact = (c: B2BSchoolContact) => {
    setEditingContact(c);
    setContactForm({
      full_name: c.full_name,
      position: c.position ?? '',
      phone: c.phone,
      phone_extra: c.phone_extra ?? '',
    });
    setContactDialogOpen(true);
  };

  const handleSaveContact = async () => {
    if (!editingSchool || !contactForm.full_name.trim() || !contactForm.phone.trim()) return;
    try {
      if (editingContact) {
        await b2bApi.updateContact(editingSchool.id, editingContact.id, {
          full_name: contactForm.full_name.trim(),
          position: contactForm.position.trim() || undefined,
          phone: contactForm.phone.trim(),
          phone_extra: contactForm.phone_extra.trim() || undefined,
        });
      } else {
        await b2bApi.createContact(editingSchool.id, {
          full_name: contactForm.full_name.trim(),
          position: contactForm.position.trim() || undefined,
          phone: contactForm.phone.trim(),
          phone_extra: contactForm.phone_extra.trim() || undefined,
        });
      }
      setContactDialogOpen(false);
      await refreshEditingSchool();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить контакт'));
    }
  };

  const handleDeleteContact = async (c: B2BSchoolContact) => {
    if (!editingSchool || !window.confirm(`Удалить контакт ${c.full_name}?`)) return;
    try {
      await b2bApi.deleteContact(editingSchool.id, c.id);
      await refreshEditingSchool();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось удалить контакт'));
    }
  };

  const [requestSupportLetterLoading, setRequestSupportLetterLoading] = useState(false);
  const handleRequestSupportLetter = async () => {
    if (!editingSchool) return;
    setError(null);
    setRequestSupportLetterLoading(true);
    try {
      await b2bApi.updateSchool(editingSchool.id, { support_letter_status: 'requested' });
      setForm((f) => ({ ...f, support_letter_status: 'requested' }));
      setSuccess('Письмо поддержки запрошено, задача создана');
      await refreshEditingSchool();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось запросить письмо поддержки'));
    } finally {
      setRequestSupportLetterLoading(false);
    }
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const [creatingFindContactsTask, setCreatingFindContactsTask] = useState(false);
  const handleCreateFindContactsTask = async () => {
    if (!editingSchool) return;
    setError(null);
    setCreatingFindContactsTask(true);
    try {
      await tasksApi.createTask({
        title: `Найти контакты (директор/завуч/информатика): ${editingSchool.name}`,
        assigned_to_id: editingSchool.manager_id ?? undefined,
      });
      setSuccess('Задача создана');
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось создать задачу'));
    } finally {
      setCreatingFindContactsTask(false);
    }
  };

  const [schoolLeads, setSchoolLeads] = useState<{ id: number; contact_name: string; phone: string; status: string; source: string | null; source_event: string | null; created_at: string }[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [transferLeadsLoading, setTransferLeadsLoading] = useState(false);

  useEffect(() => {
    if (!dialogOpen || !editingSchool?.id) {
      setSchoolLeads([]);
      return;
    }
    setLoadingLeads(true);
    b2bApi.listSchoolLeads(editingSchool.id).then((data) => {
      setSchoolLeads(data);
    }).catch(() => {
      setSchoolLeads([]);
    }).finally(() => {
      setLoadingLeads(false);
    });
  }, [dialogOpen, editingSchool?.id]);

  const handleTransferLeads = async () => {
    if (!editingSchool) return;
    setError(null);
    setTransferLeadsLoading(true);
    try {
      const res = await b2bApi.transferSchoolLeads(editingSchool.id);
      setSuccess(res.updated > 0 ? `Передано в обработку: ${res.updated} лид(ов)` : 'Нет лидов со статусом «Новый» для передачи');
      const data = await b2bApi.listSchoolLeads(editingSchool.id);
      setSchoolLeads(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось передать лиды'));
    } finally {
      setTransferLeadsLoading(false);
    }
  };

  type SchoolInteraction = { id: number; b2b_school_id: number; type: string; happened_at: string; summary: string | null; created_by_id: number | null; created_by_name: string | null; created_at: string };
  const [schoolInteractions, setSchoolInteractions] = useState<SchoolInteraction[]>([]);
  const [loadingInteractions, setLoadingInteractions] = useState(false);
  const [interactionForm, setInteractionForm] = useState({ type: 'call', happened_at: '', summary: '', next_step: '', next_step_date: '' });
  const [addInteractionLoading, setAddInteractionLoading] = useState(false);

  useEffect(() => {
    if (!dialogOpen || !editingSchool?.id) {
      setSchoolInteractions([]);
      return;
    }
    setLoadingInteractions(true);
    b2bApi.listSchoolInteractions(editingSchool.id).then((data) => {
      setSchoolInteractions(data);
    }).catch(() => {
      setSchoolInteractions([]);
    }).finally(() => {
      setLoadingInteractions(false);
    });
  }, [dialogOpen, editingSchool?.id]);

  const handleAddInteraction = async () => {
    if (!editingSchool) return;
    if (!interactionForm.happened_at.trim()) {
      setError('Укажите дату и время взаимодействия');
      return;
    }
    setError(null);
    setAddInteractionLoading(true);
    try {
      await b2bApi.createSchoolInteraction(editingSchool.id, {
        type: interactionForm.type,
        happened_at: interactionForm.happened_at,
        summary: interactionForm.summary.trim() || undefined,
        next_step: interactionForm.next_step.trim() || undefined,
        next_step_date: interactionForm.next_step_date || undefined,
      });
      setSuccess('Взаимодействие добавлено');
      const data = await b2bApi.listSchoolInteractions(editingSchool.id);
      setSchoolInteractions(data);
      if (interactionForm.next_step || interactionForm.next_step_date) {
        setForm((f) => ({
          ...f,
          next_step: interactionForm.next_step || f.next_step,
          next_step_date: interactionForm.next_step_date || f.next_step_date,
        }));
        setInteractionForm((prev) => ({ ...prev, next_step: '', next_step_date: '' }));
      }
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось добавить взаимодействие'));
    } finally {
      setAddInteractionLoading(false);
    }
  };

  type SchoolEvent = { id: number; b2b_school_id: number; format: string; online_type: string | null; event_dates: string[] | null; created_at: string };
  const [schoolEvents, setSchoolEvents] = useState<SchoolEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventForm, setEventForm] = useState({ format: 'offline', online_type: '', datesText: '' });
  const [addEventLoading, setAddEventLoading] = useState(false);

  useEffect(() => {
    if (!dialogOpen || !editingSchool?.id) {
      setSchoolEvents([]);
      return;
    }
    setLoadingEvents(true);
    b2bApi.listSchoolEvents(editingSchool.id).then((data) => {
      setSchoolEvents(data);
    }).catch(() => {
      setSchoolEvents([]);
    }).finally(() => {
      setLoadingEvents(false);
    });
  }, [dialogOpen, editingSchool?.id]);

  const handleAddEvent = async () => {
    if (!editingSchool) return;
    setError(null);
    setAddEventLoading(true);
    try {
      const dates = eventForm.datesText.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      await b2bApi.createSchoolEvent(editingSchool.id, {
        format: eventForm.format,
        online_type: eventForm.format === 'online' && eventForm.online_type ? eventForm.online_type : undefined,
        dates: dates.length ? dates : undefined,
      });
      setSuccess('Мероприятие добавлено');
      const data = await b2bApi.listSchoolEvents(editingSchool.id);
      setSchoolEvents(data);
      setEventDialogOpen(false);
      setEventForm({ format: 'offline', online_type: '', datesText: '' });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось добавить мероприятие'));
    } finally {
      setAddEventLoading(false);
    }
  };

  const handleChangeProject = (projectId: number | null) => {
    setSelectedProjectId(projectId);
  };

  const openCreateProject = () => {
    setProjectForm({
      name: '',
      location: '',
      main_city: '',
      citiesText: '',
    });
    setProjectDialogOpen(true);
  };

  const handleSaveProject = async () => {
    if (!projectForm.name.trim()) {
      setError('Укажите название проекта');
      return;
    }
    const cities =
      projectForm.citiesText
        .split(/[,;]/)
        .map((c) => c.trim())
        .filter(Boolean) || [];
    try {
      const project = await b2bApi.createProject({
        name: projectForm.name.trim(),
        location: projectForm.location.trim() || undefined,
        main_city: projectForm.main_city.trim() || undefined,
        cities,
      });
      const nextProjects = [project, ...projects];
      setProjects(nextProjects);
      setProjectDialogOpen(false);
      await handleChangeProject(project.id);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить проект'));
    }
  };

  const handleArchiveCurrentProject = async () => {
    if (!selectedProjectId) return;
    const current = projects.find((p) => p.id === selectedProjectId);
    if (!current) return;
    if (!window.confirm(`Отправить проект «${current.name}» в архив?`)) return;
    try {
      await b2bApi.updateProject(current.id, { archived: true });
      setSuccess('Проект отправлен в архив');
      const pr = await b2bApi.listProjects({ archived: false });
      setProjects(pr);
      setSelectedProjectId(pr.length ? pr[0].id : null);
      await handleChangeProject(pr.length ? pr[0].id : null);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось отправить проект в архив'));
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('Укажите название школы');
      return;
    }
    const eventDates = form.event_dates
      ? form.event_dates.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      : undefined;
    const meetingAt =
      form.meeting_scheduled_at && form.pipeline_stage === 'meeting_scheduled'
        ? new Date(form.meeting_scheduled_at).toISOString()
        : null;
    const walkAt =
      form.walkthrough_scheduled_at && form.pipeline_stage === 'walkthrough_scheduled'
        ? new Date(form.walkthrough_scheduled_at + 'T12:00:00').toISOString()
        : null;
    const payload = {
      name: form.name.trim(),
      director: form.director.trim() || undefined,
      city: form.city.trim() || undefined,
      address: form.address.trim() || undefined,
      student_count: form.student_count === '' ? undefined : Number(form.student_count),
      friendship_degree: form.friendship_degree || undefined,
      pipeline_stage: form.pipeline_stage,
      next_step: form.next_step.trim() || null,
      next_step_date: form.next_step_date.trim() ? form.next_step_date : null,
      manager_id: form.manager_id === '' ? null : Number(form.manager_id),
      preference: form.preference?.trim() || null,
      event_dates: eventDates,
      meeting_scheduled_at: meetingAt,
      meeting_outcomes: form.pipeline_stage === 'meeting_held' ? (form.meeting_outcomes.trim() || null) : undefined,
      walkthrough_scheduled_at: walkAt,
      ...(editingSchool
        ? {
            support_letter_status: form.support_letter_status.trim() || null,
            partnership: Object.keys(form.partnership).length ? form.partnership : null,
          }
        : {}),
    };
    try {
      if (editingSchool) {
        await b2bApi.updateSchool(editingSchool.id, payload);
      } else {
        await b2bApi.createSchool(payload);
      }
      setDialogOpen(false);
      await loadSchools({
        projectId: selectedProjectId ?? undefined,
        city: selectedCity || undefined,
        manager_id: selectedManagerId === '' ? undefined : selectedManagerId,
        pipeline_stage: selectedStageFilter || undefined,
        overdue: filterOverdue || undefined,
        search: searchQuery.trim() || undefined,
      });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить школу'));
    }
  };

  const handleStageChange = async (school: B2BSchool, newStage: B2BSchoolPipelineStage) => {
    try {
      await b2bApi.updateSchool(school.id, { pipeline_stage: newStage });
      await loadSchools({
        projectId: selectedProjectId ?? undefined,
        city: selectedCity || undefined,
        manager_id: selectedManagerId === '' ? undefined : selectedManagerId,
        pipeline_stage: selectedStageFilter || undefined,
        overdue: filterOverdue || undefined,
        search: searchQuery.trim() || undefined,
      });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось изменить стадию'));
    }
  };

  const handleStageDrop = useCallback(
    async (targetStage: B2BSchoolPipelineStage, schoolIdStr: string) => {
      const schoolId = Number(schoolIdStr);
      if (!Number.isFinite(schoolId)) return;
      const school = schools.find((s) => s.id === schoolId);
      if (!school || school.pipeline_stage === targetStage) return;
      setDraggingSchoolId(null);
      setDropTargetStage(null);
      try {
        await b2bApi.updateSchool(schoolId, { pipeline_stage: targetStage });
        await loadSchools({
          projectId: selectedProjectId ?? undefined,
          city: selectedCity || undefined,
          manager_id: selectedManagerId === '' ? undefined : selectedManagerId,
          pipeline_stage: selectedStageFilter || undefined,
          overdue: filterOverdue || undefined,
          search: searchQuery.trim() || undefined,
        });
      } catch (err: any) {
        setError(extractApiError(err, 'Не удалось перенести школу'));
      }
    },
    [
      schools,
      selectedProjectId,
      selectedCity,
      selectedManagerId,
      selectedStageFilter,
      filterOverdue,
      searchQuery,
      loadSchools,
    ]
  );

  const schoolsForTable = useMemo(
    () => [...schools].sort((a, b) => {
      const stageOrder = PIPELINE_STAGES.map((s) => s.value as string);
      const stageA = (a.pipeline_stage ?? '') as string;
      const stageB = (b.pipeline_stage ?? '') as string;
      const ai = stageOrder.indexOf(stageA);
      const bi = stageOrder.indexOf(stageB);
      if (ai !== bi) return ai - bi;
      return (a.name || '').localeCompare(b.name || '');
    }),
    [schools]
  );

  const handleStageDropDialogSubmit = async () => {
    if (!stageDropDialog) return;
    setError(null);
    try {
      const payload: {
        pipeline_stage: B2BSchoolPipelineStage;
        next_step?: string | null;
        next_step_date?: string | null;
      } = {
        pipeline_stage: stageDropDialog.targetStage as B2BSchoolPipelineStage,
      };
      if (stageDropForm.next_step.trim()) payload.next_step = stageDropForm.next_step.trim();
      if (stageDropForm.next_step_date.trim()) payload.next_step_date = stageDropForm.next_step_date.trim();
      await b2bApi.updateSchool(stageDropDialog.schoolId, payload);
      setStageDropDialog(null);
      await loadSchools({
        projectId: selectedProjectId ?? undefined,
        city: selectedCity || undefined,
        manager_id: selectedManagerId === '' ? undefined : selectedManagerId,
        pipeline_stage: selectedStageFilter || undefined,
        overdue: filterOverdue || undefined,
        search: searchQuery.trim() || undefined,
      });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось обновить школу'));
    }
  };

  const handleDelete = async (school: B2BSchool) => {
    if (!window.confirm(`Удалить школу «${school.name}»?`)) return;
    try {
      await b2bApi.deleteSchool(school.id);
      setDialogOpen(false);
      await loadSchools({
        projectId: selectedProjectId ?? undefined,
        city: selectedCity || undefined,
        manager_id: selectedManagerId === '' ? undefined : selectedManagerId,
        pipeline_stage: selectedStageFilter || undefined,
        overdue: filterOverdue || undefined,
        search: searchQuery.trim() || undefined,
      });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось удалить школу'));
    }
  };

  const formatEventDates = (dates: string[] | null | undefined) => {
    if (!dates?.length) return '—';
    return dates
      .map((d) => {
        try {
          const parsed = parseISO(d);
          return isValid(parsed) ? format(parsed, 'dd.MM.yyyy') : d;
        } catch {
          return d;
        }
      })
      .join(', ');
  };

  return (
    <>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} spacing={2}>
        <Typography variant="h4">Работа со школами</Typography>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <TextField
            size="small"
            label="Поиск школы"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Название или город"
            sx={{ minWidth: 200 }}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Город</InputLabel>
            <Select
              label="Город"
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
            >
              <MenuItem value="">Все</MenuItem>
              {cities.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Ответственный</InputLabel>
            <Select
              label="Ответственный"
              value={selectedManagerId === '' ? '' : selectedManagerId}
              onChange={(e) => setSelectedManagerId(e.target.value === '' ? '' : (e.target.value as number))}
            >
              <MenuItem value="">
                <em>Все</em>
              </MenuItem>
              {managers.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.full_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Стадия</InputLabel>
            <Select
              label="Стадия"
              value={selectedStageFilter}
              onChange={(e) => setSelectedStageFilter(e.target.value)}
            >
              <MenuItem value="">
                <em>Все</em>
              </MenuItem>
              {PIPELINE_STAGES.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Checkbox
                checked={filterOverdue}
                onChange={(e) => setFilterOverdue(e.target.checked)}
              />
            }
            label="Просрочено"
          />
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Проект</InputLabel>
            <Select
              label="Проект"
              value={selectedProjectId ?? ''}
              onChange={(e) =>
                handleChangeProject(e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <MenuItem value="">
                <em>Все школы</em>
              </MenuItem>
              {projects.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, v) => v != null && setViewMode(v)}
            size="small"
            sx={{ ml: 1 }}
          >
            <ToggleButton value="table" aria-label="Таблица">
              <TableChart sx={{ mr: 0.5 }} /> Таблица
            </ToggleButton>
            <ToggleButton value="kanban" aria-label="Канбан">
              <ViewModule sx={{ mr: 0.5 }} /> Канбан
            </ToggleButton>
          </ToggleButtonGroup>
          <Button variant="outlined" size="small" startIcon={<Add />} onClick={openCreateProject}>
            Создать проект
          </Button>
          {selectedProjectId && (
            <Button
              variant="outlined"
              size="small"
              color="warning"
              onClick={() => void handleArchiveCurrentProject()}
            >
              В архив
            </Button>
          )}
          <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
            Добавить школу
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {loading ? (
        <Typography color="text.secondary">Загрузка…</Typography>
      ) : viewMode === 'table' ? (
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Город</TableCell>
                <TableCell>Стадия</TableCell>
                <TableCell>След. действие</TableCell>
                <TableCell>Ответственный</TableCell>
                <TableCell align="right">Лиды</TableCell>
                <TableCell align="right">Мероприятий</TableCell>
                <TableCell>Партнёрство</TableCell>
                <TableCell>Степень дружбы</TableCell>
                <TableCell align="right" width={100}>Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {schoolsForTable.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    Нет школ
                  </TableCell>
                </TableRow>
              ) : (
              schoolsForTable.map((school) => (
                <TableRow key={school.id} hover sx={{ cursor: 'pointer' }} onClick={() => openEdit(school)}>
                  <TableCell>{school.name}</TableCell>
                  <TableCell>{school.city || '—'}</TableCell>
                  <TableCell>
                    {PIPELINE_STAGES.find((s) => s.value === school.pipeline_stage)?.label ?? school.pipeline_stage}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 220 }}>
                    {hasNoNextAction(school) ? (
                      <Typography variant="body2" color="warning.main">Не задано</Typography>
                    ) : (
                      <Typography variant="body2">
                        {school.next_step}
                        {school.next_step_date ? ` (${format(parseISO(school.next_step_date), 'dd.MM.yyyy')})` : ''}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{school.manager_full_name || '—'}</TableCell>
                  <TableCell align="right">{school.leads_count ?? 0}</TableCell>
                  <TableCell align="right">
                    {Array.isArray(school.event_dates) ? school.event_dates.length : 0}
                  </TableCell>
                  <TableCell>
                    {school.pipeline_stage === 'partners' || (school.partnership as Record<string, boolean>)?.active_partner
                      ? 'Партнёр'
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {FRIENDSHIP_DEGREES.find((d) => d.value === school.friendship_degree)?.label ?? school.friendship_degree ?? '—'}
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <IconButton size="small" onClick={() => openEdit(school)} aria-label="Редактировать">
                      <Edit fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(school)} aria-label="Удалить" color="error">
                      <Delete fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Box sx={{ overflowX: 'auto', pb: 2 }}>
          <Grid container spacing={2} sx={{ minWidth: 1400 }}>
            {schoolsByStage.map((col) => (
              <Grid item xs={12} sm={6} md={3} key={col.value} sx={{ minWidth: 280 }}>
                <Card
                  variant="outlined"
                  sx={{
                    height: '100%',
                    bgcolor: dropTargetStage === col.value ? 'action.selected' : 'grey.50',
                    transition: 'background-color 0.15s',
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDropTargetStage(col.value);
                  }}
                  onDragLeave={() => setDropTargetStage(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const schoolId = e.dataTransfer.getData('schoolId');
                    const id = schoolId ? Number(schoolId) : 0;
                    if (id && Number.isFinite(id)) {
                      const school = schools.find((s) => s.id === id);
                      if (school && (school.pipeline_stage as string) !== col.value) {
                        setStageDropDialog({
                          schoolId: id,
                          targetStage: col.value,
                          schoolName: school.name || 'Школа',
                        });
                        setStageDropForm({ what_done: '', next_step: '', next_step_date: '' });
                      } else if (school) {
                        setDropTargetStage(null);
                        return;
                      } else {
                        void handleStageDrop(col.value as B2BSchoolPipelineStage, schoolId);
                      }
                    }
                    setDropTargetStage(null);
                  }}
                >
                  <CardContent sx={{ py: 1.5 }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      {col.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                      {col.schools.length} шт.
                    </Typography>
                    <Stack spacing={1}>
                      {col.schools.map((school) => (
                        <Card
                          key={school.id}
                          variant="outlined"
                          draggable
                          sx={{
                            bgcolor: 'background.paper',
                            opacity: draggingSchoolId === school.id ? 0.7 : 1,
                            cursor: 'grab',
                            '&:active': { cursor: 'grabbing' },
                          }}
                          onDragStart={(e) => {
                            setDraggingSchoolId(school.id);
                            e.dataTransfer.setData('schoolId', String(school.id));
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => setDraggingSchoolId(null)}
                        >
                          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                              <Typography variant="subtitle2">{school.name}</Typography>
                              <Stack direction="row" spacing={0.25}>
                                <IconButton size="small" onClick={() => openEdit(school)} aria-label="Редактировать">
                                  <Edit fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={() => handleDelete(school)} aria-label="Удалить" color="error">
                                  <Delete fontSize="small" />
                                </IconButton>
                              </Stack>
                            </Stack>
                            <Typography variant="caption" color="text.secondary" display="block">
                              Директор: {school.director || '—'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              Город: {school.city || '—'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block" noWrap title={school.address || ''}>
                              Адрес: {school.address || '—'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block">
                              Степень дружбы: {FRIENDSHIP_DEGREES.find((d) => d.value === school.friendship_degree)?.label ?? school.friendship_degree ?? '—'}
                            </Typography>
                            <Box sx={{ mt: 0.5, mb: 0.5 }}>
                              <Typography variant="caption" color="text.secondary" display="block" sx={{ fontWeight: 600 }}>
                                Следующее действие:
                              </Typography>
                              {hasNoNextAction(school) ? (
                                <>
                                  <Typography variant="caption" color="warning.main" display="block">
                                    Не задано
                                  </Typography>
                                  <Chip size="small" color="warning" label="Нет следующего действия" sx={{ mt: 0.25 }} />
                                </>
                              ) : (
                                <Typography variant="caption" display="block" sx={{ color: 'primary.main' }}>
                                  {school.next_step}
                                  {school.next_step_date ? ` · ${format(parseISO(school.next_step_date), 'dd.MM.yyyy')}` : ''}
                                </Typography>
                              )}
                              {school.manager_full_name && (
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                                  Менеджер: {school.manager_full_name}
                                </Typography>
                              )}
                            </Box>
                            <Typography variant="caption" color="text.secondary" display="block">
                              Контактов: {school.contacts?.length ?? 0}
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 0.5 }}>
                              {school.preference && (
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label={school.preference === 'online' ? 'Онлайн' : school.preference === 'offline' ? 'Офлайн' : 'Любой'}
                                />
                              )}
                              <Chip size="small" label={`Учеников: ${school.student_count ?? '—'}`} />
                              <Chip size="small" label={`Лидов: ${school.leads_count ?? 0}`} />
                              <Chip size="small" color="success" label={`Конверсия: ${school.conversion_percent ?? 0}%`} />
                              {(school.pipeline_stage === 'partners' || (school.partnership as Record<string, boolean>)?.active_partner) && (
                                <Chip size="small" color="primary" label="Партнёр" />
                              )}
                            </Stack>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                              Мероприятия: {formatEventDates(school.event_dates ?? undefined)}
                            </Typography>
                            <FormControl size="small" fullWidth sx={{ mt: 1 }}>
                              <InputLabel>Стадия</InputLabel>
                              <Select
                                value={school.pipeline_stage}
                                label="Стадия"
                                onChange={(e) => handleStageChange(school, e.target.value as B2BSchoolPipelineStage)}
                              >
                                {PIPELINE_STAGES.map((s) => (
                                  <MenuItem key={s.value} value={s.value}>
                                    {s.label}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </CardContent>
                        </Card>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      <Dialog
        open={!!stageDropDialog}
        onClose={() => setStageDropDialog(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          Перенести в стадию «{stageDropDialog ? PIPELINE_STAGES.find((s) => s.value === stageDropDialog.targetStage)?.label : ''}»
        </DialogTitle>
        <DialogContent>
          {stageDropDialog && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {stageDropDialog.schoolName}
              </Typography>
              <FormControl component="fieldset">
                <Typography variant="subtitle2" gutterBottom>Что сделали?</Typography>
                <RadioGroup
                  value={stageDropForm.what_done}
                  onChange={(e) => setStageDropForm((f) => ({ ...f, what_done: e.target.value as 'call' | 'letter' | 'meeting' }))}
                >
                  <FormControlLabel value="call" control={<Radio size="small" />} label="Звонок" />
                  <FormControlLabel value="letter" control={<Radio size="small" />} label="Письмо" />
                  <FormControlLabel value="meeting" control={<Radio size="small" />} label="Встреча" />
                </RadioGroup>
              </FormControl>
              <TextField
                label="Следующее действие"
                value={stageDropForm.next_step}
                onChange={(e) => setStageDropForm((f) => ({ ...f, next_step: e.target.value }))}
                fullWidth
                size="small"
              />
              <TextField
                label="Дата след. действия"
                type="date"
                value={stageDropForm.next_step_date}
                onChange={(e) => setStageDropForm((f) => ({ ...f, next_step_date: e.target.value }))}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStageDropDialog(null)}>Отмена</Button>
          <Button
            onClick={() => {
              if (stageDropDialog) {
                void b2bApi.updateSchool(stageDropDialog.schoolId, { pipeline_stage: stageDropDialog.targetStage as B2BSchoolPipelineStage }).then(() => {
                  setStageDropDialog(null);
                  loadSchools({
                    projectId: selectedProjectId ?? undefined,
                    city: selectedCity || undefined,
                    manager_id: selectedManagerId === '' ? undefined : selectedManagerId,
                    pipeline_stage: selectedStageFilter || undefined,
                    overdue: filterOverdue || undefined,
                    search: searchQuery.trim() || undefined,
                  });
                });
              }
            }}
          >
            Перенести без заполнения
          </Button>
          <Button variant="contained" onClick={() => void handleStageDropDialogSubmit()}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialogOpen} onClose={() => { setDialogOpen(false); setSuccess(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>{editingSchool ? 'Редактировать школу' : 'Новая школа'}</DialogTitle>
        <DialogContent>
          {editingSchool && (
            <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mb: 2 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  tasksApi.createTask({
                    title: `Задача: ${editingSchool.name}`,
                    assigned_to_id: editingSchool.manager_id ?? undefined,
                  }).then(() => setSuccess('Задача создана')).catch((err: any) => setError(extractApiError(err, 'Не удалось создать задачу')));
                }}
              >
                + Задача
              </Button>
              <Button size="small" variant="outlined" onClick={() => scrollToSection('card-section-events')}>
                + Мероприятие
              </Button>
              <Button size="small" variant="outlined" onClick={() => scrollToSection('card-section-interactions')}>
                + Взаимодействие
              </Button>
              <Button size="small" variant="outlined" onClick={() => scrollToSection('card-section-partnership')}>
                Партнёрство
              </Button>
              <Button size="small" variant="outlined" onClick={() => scrollToSection('card-section-support-letter')}>
                Письмо поддержки
              </Button>
              <Button size="small" variant="outlined" onClick={() => scrollToSection('card-section-leads')}>
                Лиды
              </Button>
            </Stack>
          )}
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Название школы"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Директор школы"
              value={form.director}
              onChange={(e) => setForm((f) => ({ ...f, director: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Город"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Адрес"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Количество детей в школе"
              type="number"
              value={form.student_count}
              onChange={(e) => setForm((f) => ({ ...f, student_count: e.target.value === '' ? '' : Number(e.target.value) }))}
              fullWidth
              InputProps={{ inputProps: { min: 0 } }}
            />
            <FormControl fullWidth>
<InputLabel>Степень дружбы</InputLabel>
                <Select
                value={form.friendship_degree}
                label="Степень дружбы"
                onChange={(e) => setForm((f) => ({ ...f, friendship_degree: e.target.value }))}
              >
                {FRIENDSHIP_DEGREES.map((d) => (
                  <MenuItem key={d.value} value={d.value}>
                    {d.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box id="card-section-events">
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Мероприятия</Typography>
                {editingSchool && (
                  <Button size="small" variant="outlined" startIcon={<Add />} onClick={() => setEventDialogOpen(true)}>
                    Добавить мероприятие
                  </Button>
                )}
              </Stack>
              {editingSchool && (
                <>
                  {loadingEvents ? (
                    <Typography variant="caption" color="text.secondary">Загрузка…</Typography>
                  ) : schoolEvents.length > 0 ? (
                    <Stack spacing={0.5} sx={{ mb: 1 }}>
                      {schoolEvents.map((ev) => (
                        <Card key={ev.id} variant="outlined" sx={{ p: 1 }}>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Chip size="small" label={ev.format === 'online' ? 'Онлайн' : ev.format === 'hybrid' ? 'Гибрид' : 'Офлайн'} />
                            {ev.format === 'online' && ev.online_type && (
                              <Typography variant="caption" color="text.secondary">
                                {ev.online_type === 'webinar' ? 'Вебинар' : ev.online_type === 'olympiad' ? 'Олимпиада' : ev.online_type === 'open_doors' ? 'День открытых дверей' : ev.online_type}
                              </Typography>
                            )}
                            {ev.event_dates && ev.event_dates.length > 0 && (
                              <Typography variant="caption" color="text.secondary">
                                {ev.event_dates.join(', ')}
                              </Typography>
                            )}
                          </Stack>
                        </Card>
                      ))}
                    </Stack>
                  ) : null}
                </>
              )}
              <TextField
                label="Даты мероприятий (через запятую)"
                value={form.event_dates}
                onChange={(e) => setForm((f) => ({ ...f, event_dates: e.target.value }))}
                fullWidth
                placeholder="2025-03-01, 2025-03-15"
              />
            </Box>
            <FormControl fullWidth>
              <InputLabel>Стадия воронки</InputLabel>
              <Select
                value={form.pipeline_stage}
                label="Стадия воронки"
                onChange={(e) => setForm((f) => ({ ...f, pipeline_stage: e.target.value as B2BSchoolPipelineStage }))}
              >
                {PIPELINE_STAGES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>
                    {s.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Следующий шаг"
              value={form.next_step}
              onChange={(e) => setForm((f) => ({ ...f, next_step: e.target.value }))}
              fullWidth
              placeholder="Что сделать дальше"
            />
            <TextField
              label="Дата следующего шага"
              type="date"
              value={form.next_step_date}
              onChange={(e) => setForm((f) => ({ ...f, next_step_date: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <FormControl fullWidth>
              <InputLabel>Ответственный (менеджер)</InputLabel>
              <Select
                value={form.manager_id === '' ? '' : form.manager_id}
                label="Ответственный (менеджер)"
                onChange={(e) => setForm((f) => ({ ...f, manager_id: e.target.value === '' ? '' : Number(e.target.value) }))}
              >
                <MenuItem value=""><em>Не назначен</em></MenuItem>
                {managers.map((m) => (
                  <MenuItem key={m.id} value={m.id}>{m.full_name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Формат предпочтение (канбан)</InputLabel>
              <Select
                value={form.preference || ''}
                label="Формат предпочтение (канбан)"
                onChange={(e) => setForm((f) => ({ ...f, preference: e.target.value }))}
              >
                <MenuItem value="">—</MenuItem>
                <MenuItem value="online">Онлайн</MenuItem>
                <MenuItem value="offline">Офлайн</MenuItem>
                <MenuItem value="any">Любой</MenuItem>
              </Select>
            </FormControl>

            {form.pipeline_stage === 'meeting_scheduled' && (
              <TextField
                label="Когда назначена встреча"
                type="datetime-local"
                value={form.meeting_scheduled_at}
                onChange={(e) => setForm((f) => ({ ...f, meeting_scheduled_at: e.target.value }))}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            )}
            {form.pipeline_stage === 'meeting_held' && (
              <TextField
                label="Основные итоги встречи"
                value={form.meeting_outcomes}
                onChange={(e) => setForm((f) => ({ ...f, meeting_outcomes: e.target.value }))}
                fullWidth
                multiline
                rows={3}
              />
            )}
            {form.pipeline_stage === 'walkthrough_scheduled' && (
              <TextField
                label="Дата обхода"
                type="date"
                value={form.walkthrough_scheduled_at}
                onChange={(e) => setForm((f) => ({ ...f, walkthrough_scheduled_at: e.target.value }))}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            )}

            <Box id="card-section-support-letter">
              <FormControl fullWidth sx={{ mt: 1 }}>
                <InputLabel>Письмо поддержки</InputLabel>
                <Select
                  value={form.support_letter_status}
                  label="Письмо поддержки"
                  onChange={(e) => setForm((f) => ({ ...f, support_letter_status: e.target.value }))}
                >
                  {SUPPORT_LETTER_OPTIONS.map((o) => (
                    <MenuItem key={o.value || 'none'} value={o.value}>{o.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {editingSchool && form.support_letter_status !== 'requested' && form.support_letter_status !== 'received' && (
                <Tooltip title={editingSchool.manager_id ? '' : 'Назначьте ответственного школе'}>
                  <span>
                    <Button
                      size="small"
                      variant="outlined"
                      sx={{ mt: 0.5 }}
                      disabled={requestSupportLetterLoading || !editingSchool.manager_id}
                      onClick={() => void handleRequestSupportLetter()}
                    >
                      {requestSupportLetterLoading ? 'Отправка…' : 'Запросить'}
                    </Button>
                  </span>
                </Tooltip>
              )}
            </Box>
            <Box id="card-section-partnership">
              <Typography variant="subtitle2" gutterBottom>Партнёрство</Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {PARTNERSHIP_KEYS.map(({ key, label }) => (
                  <FormControlLabel
                    key={key}
                    control={
                      <Checkbox
                        size="small"
                        checked={!!form.partnership[key]}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            partnership: { ...f.partnership, [key]: e.target.checked },
                          }))
                        }
                      />
                    }
                    label={label}
                  />
                ))}
              </Stack>
            </Box>

            {editingSchool && (
              <Box id="card-section-interactions">
                <Typography variant="subtitle2" gutterBottom>Взаимодействия</Typography>
                {loadingInteractions ? (
                  <Typography variant="caption" color="text.secondary">Загрузка…</Typography>
                ) : (
                  <Stack spacing={1} sx={{ mb: 2 }}>
                    {schoolInteractions.length === 0 ? (
                      <Typography variant="caption" color="text.secondary">Нет записей. Добавьте взаимодействие ниже.</Typography>
                    ) : (
                      schoolInteractions.map((i) => (
                        <Card key={i.id} variant="outlined" sx={{ p: 1 }}>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Chip size="small" label={i.type === 'call' ? 'Звонок' : i.type === 'letter' ? 'Письмо' : 'Встреча'} />
                            <Typography variant="caption" color="text.secondary">
                              {i.happened_at ? format(parseISO(i.happened_at), 'dd.MM.yyyy HH:mm') : ''}
                            </Typography>
                            {i.created_by_name && (
                              <Typography variant="caption" color="text.secondary">— {i.created_by_name}</Typography>
                            )}
                          </Stack>
                          {i.summary && <Typography variant="body2" sx={{ mt: 0.5 }}>{i.summary}</Typography>}
                        </Card>
                      ))
                    )}
                  </Stack>
                )}
                <Typography variant="caption" display="block" sx={{ mb: 0.5 }}>Добавить взаимодействие</Typography>
                <Stack spacing={1}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Тип</InputLabel>
                    <Select
                      value={interactionForm.type}
                      label="Тип"
                      onChange={(e) => setInteractionForm((f) => ({ ...f, type: e.target.value }))}
                    >
                      <MenuItem value="call">Звонок</MenuItem>
                      <MenuItem value="letter">Письмо</MenuItem>
                      <MenuItem value="meeting">Встреча</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    size="small"
                    label="Дата и время"
                    type="datetime-local"
                    value={interactionForm.happened_at}
                    onChange={(e) => setInteractionForm((f) => ({ ...f, happened_at: e.target.value }))}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    size="small"
                    label="Итог / комментарий"
                    value={interactionForm.summary}
                    onChange={(e) => setInteractionForm((f) => ({ ...f, summary: e.target.value }))}
                    fullWidth
                    multiline
                    minRows={2}
                  />
                  <TextField
                    size="small"
                    label="Следующий шаг (опционально)"
                    value={interactionForm.next_step}
                    onChange={(e) => setInteractionForm((f) => ({ ...f, next_step: e.target.value }))}
                    fullWidth
                    placeholder="Обновит поле «Следующий шаг» в карточке"
                  />
                  <TextField
                    size="small"
                    label="Дата следующего шага (опционально)"
                    type="date"
                    value={interactionForm.next_step_date}
                    onChange={(e) => setInteractionForm((f) => ({ ...f, next_step_date: e.target.value }))}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                  <Button
                    size="small"
                    variant="contained"
                    disabled={addInteractionLoading || !interactionForm.happened_at}
                    onClick={() => void handleAddInteraction()}
                  >
                    {addInteractionLoading ? 'Добавление…' : 'Добавить'}
                  </Button>
                </Stack>
              </Box>
            )}

            {editingSchool && (
              <Box id="card-section-leads">
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2">Лиды</Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={transferLeadsLoading || schoolLeads.length === 0}
                    onClick={() => void handleTransferLeads()}
                  >
                    {transferLeadsLoading ? 'Отправка…' : 'Передать в обработку'}
                  </Button>
                </Stack>
                {loadingLeads ? (
                  <Typography variant="caption" color="text.secondary">Загрузка…</Typography>
                ) : schoolLeads.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">Нет лидов по этой школе</Typography>
                ) : (
                  <Stack spacing={0.5}>
                    {schoolLeads.map((lead) => (
                      <Card key={lead.id} variant="outlined" sx={{ p: 1 }}>
                        <Typography variant="body2" fontWeight="medium">{lead.contact_name}</Typography>
                        <Typography variant="caption" display="block" color="text.secondary">{lead.phone}</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap">
                          <Chip size="small" label={lead.status} />
                          {lead.source_event && (
                            <Typography variant="caption" color="text.secondary">Мероприятие: {lead.source_event}</Typography>
                          )}
                          {lead.source && !lead.source_event && (
                            <Typography variant="caption" color="text.secondary">Источник: {lead.source}</Typography>
                          )}
                          {lead.source && lead.source_event && (
                            <Typography variant="caption" color="text.secondary"> | {lead.source}</Typography>
                          )}
                        </Stack>
                      </Card>
                    ))}
                  </Stack>
                )}
              </Box>
            )}

            {editingSchool && (
              <Box id="card-section-contacts">
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2">Контакты</Typography>
                  <Stack direction="row" spacing={0.5}>
                    {(!editingSchool.contacts || editingSchool.contacts.length === 0) && (
                      <Tooltip title={editingSchool.manager_id ? '' : 'Назначьте ответственного школе, чтобы поставить задачу'}>
                        <span>
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={!editingSchool.manager_id || creatingFindContactsTask}
                            onClick={() => void handleCreateFindContactsTask()}
                          >
                            {creatingFindContactsTask ? 'Создание…' : 'Поставить задачу найти контакты'}
                          </Button>
                        </span>
                      </Tooltip>
                    )}
                    <Button size="small" startIcon={<Add />} onClick={openAddContact}>
                      Добавить контакт
                    </Button>
                  </Stack>
                </Stack>
                <Stack spacing={1}>
                  {(editingSchool.contacts ?? []).map((c) => (
                    <Card key={c.id} variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box>
                          <Typography variant="body2" fontWeight="medium">{c.full_name}</Typography>
                          <Typography variant="caption" color="text.secondary">{c.position || '—'}</Typography>
                          <Typography variant="caption" display="block">{c.phone}</Typography>
                          {c.phone_extra && (
                            <Typography variant="caption" display="block" color="text.secondary">Доп. тел.: {c.phone_extra}</Typography>
                          )}
                        </Box>
                        <Stack direction="row" spacing={0.25}>
                          <IconButton size="small" onClick={() => openEditContact(c)} aria-label="Редактировать контакт">
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleDeleteContact(c)} aria-label="Удалить контакт" color="error">
                            <Delete fontSize="small" />
                          </IconButton>
                        </Stack>
                      </Stack>
                    </Card>
                  ))}
                  {(!editingSchool.contacts || editingSchool.contacts.length === 0) && (
                    <Typography variant="caption" color="text.secondary">Нет контактов</Typography>
                  )}
                </Stack>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
          {editingSchool && (
            <Button color="error" onClick={() => handleDelete(editingSchool)}>
              Удалить
            </Button>
          )}
          <Button variant="contained" onClick={() => void handleSave()}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={contactDialogOpen} onClose={() => setContactDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingContact ? 'Редактировать контакт' : 'Добавить контакт'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="ФИО"
              value={contactForm.full_name}
              onChange={(e) => setContactForm((f) => ({ ...f, full_name: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Должность"
              value={contactForm.position}
              onChange={(e) => setContactForm((f) => ({ ...f, position: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Номер телефона"
              value={contactForm.phone}
              onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Доп. номер телефона"
              value={contactForm.phone_extra}
              onChange={(e) => setContactForm((f) => ({ ...f, phone_extra: e.target.value }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setContactDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleSaveContact()} disabled={!contactForm.full_name.trim() || !contactForm.phone.trim()}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={eventDialogOpen} onClose={() => setEventDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Добавить мероприятие</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Формат</InputLabel>
              <Select
                value={eventForm.format}
                label="Формат"
                onChange={(e) => setEventForm((f) => ({ ...f, format: e.target.value }))}
              >
                <MenuItem value="offline">Офлайн</MenuItem>
                <MenuItem value="online">Онлайн</MenuItem>
                <MenuItem value="hybrid">Гибрид</MenuItem>
              </Select>
            </FormControl>
            {eventForm.format === 'online' && (
              <FormControl fullWidth size="small">
                <InputLabel>Тип онлайн-мероприятия</InputLabel>
                <Select
                  value={eventForm.online_type}
                  label="Тип онлайн-мероприятия"
                  onChange={(e) => setEventForm((f) => ({ ...f, online_type: e.target.value }))}
                >
                  <MenuItem value="">—</MenuItem>
                  <MenuItem value="webinar">Вебинар</MenuItem>
                  <MenuItem value="olympiad">Олимпиада</MenuItem>
                  <MenuItem value="open_doors">День открытых дверей</MenuItem>
                </Select>
              </FormControl>
            )}
            <TextField
              size="small"
              label="Даты (через запятую)"
              value={eventForm.datesText}
              onChange={(e) => setEventForm((f) => ({ ...f, datesText: e.target.value }))}
              fullWidth
              placeholder="2025-03-01, 2025-03-15"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEventDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void handleAddEvent()} disabled={addEventLoading}>
            {addEventLoading ? 'Добавление…' : 'Добавить'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={projectDialogOpen} onClose={() => setProjectDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Создать проект B2B</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Название проекта"
              value={projectForm.name}
              onChange={(e) => setProjectForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Локация (при необходимости)"
              value={projectForm.location}
              onChange={(e) => setProjectForm((f) => ({ ...f, location: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Город (основной)"
              value={projectForm.main_city}
              onChange={(e) => setProjectForm((f) => ({ ...f, main_city: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Какие города включить в проект"
              helperText="Перечислите через запятую (например: Иркутск, Ангарск)"
              value={projectForm.citiesText}
              onChange={(e) => setProjectForm((f) => ({ ...f, citiesText: e.target.value }))}
              fullWidth
              multiline
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProjectDialogOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            onClick={() => void handleSaveProject()}
            disabled={!projectForm.name.trim()}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

const B2BSchoolsPage: React.FC = () => (
  <Layout>
    <B2BSchoolsContent />
  </Layout>
);

export default B2BSchoolsPage;
