import React, { useCallback, useEffect, useState } from 'react';
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
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Book as BookIcon, People as PeopleIcon } from '@mui/icons-material';
import { format, addDays, subDays, startOfDay, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { trainerLessonsApi, studentsApi, usersApi, groupsApi, salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { TrainerLessonSlot, AbsenceReason, Group, Student } from '../types';
import type { AbsenceFollowUp } from '../types';

const WEEKDAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const ABSENCE_REASONS: { value: AbsenceReason; label: string }[] = [
  { value: 'was', label: 'Был' },
  { value: 'not_was', label: 'Не был' },
  { value: 'sick', label: 'Болел' },
  { value: 'olympiad', label: 'Олимпиада' },
  { value: 'event', label: 'Мероприятие' },
  { value: 'other', label: 'Другое' },
];

const MANUAL_LESSON_TYPES = [
  { value: 'makeup', label: 'Отработка' },
  { value: 'paid_extra', label: 'Дополнительное платное' },
  { value: 'free_trial', label: 'Бесплатное / пробное' },
] as const;

const REASON_LABELS: Record<string, string> = {
  was: 'Был',
  not_was: 'Не был',
  sick: 'Болел',
  olympiad: 'Олимпиада',
  event: 'Мероприятие',
  other: 'Другое',
};

const TrainerLessonsPage: React.FC = () => {
  const { user } = useAuth();
  const canMoveLessons = user?.role === 'admin' || user?.role === 'owner' || user?.role === 'sales';
  const canAddStudentToLesson = user?.role === 'admin' || user?.role === 'owner' || user?.role === 'sales' || user?.role === 'trainer';
  const [searchParams] = useSearchParams();
  const [viewDate, setViewDate] = useState(() => format(startOfDay(new Date()), 'yyyy-MM-dd'));
  const [slots, setSlots] = useState<TrainerLessonSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TrainerLessonSlot | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<Record<number, boolean>>({});
  const [lateDraft, setLateDraft] = useState<Record<number, boolean>>({});
  const [absenceReasonDraft, setAbsenceReasonDraft] = useState<Record<number, AbsenceReason>>({});
  const [absenceCommentDraft, setAbsenceCommentDraft] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveSlot, setMoveSlot] = useState<TrainerLessonSlot | null>(null);
  const [moveToDate, setMoveToDate] = useState('');
  const [moveToStartTime, setMoveToStartTime] = useState('');
  const [moveToEndTime, setMoveToEndTime] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelSlot, setCancelSlot] = useState<TrainerLessonSlot | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [addStudentToLessonId, setAddStudentToLessonId] = useState('');
  const [allStudents, setAllStudents] = useState<Array<{ id: number; full_name: string }>>([]);
  const [addingToLesson, setAddingToLesson] = useState(false);
  const [trainers, setTrainers] = useState<Array<{ id: number; full_name: string }>>([]);
  const [lessonTrainerId, setLessonTrainerId] = useState<number | ''>('');
  const [settingTrainer, setSettingTrainer] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createGroupId, setCreateGroupId] = useState<number | ''>('');
  const [createDate, setCreateDate] = useState('');
  const [createStartTime, setCreateStartTime] = useState('');
  const [createEndTime, setCreateEndTime] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [customLessons, setCustomLessons] = useState<any[]>([]);
  const [customLessonsLoading, setCustomLessonsLoading] = useState(false);
  const [customAttendanceLesson, setCustomAttendanceLesson] = useState<any | null>(null);
  const [customAttendanceDraft, setCustomAttendanceDraft] = useState<Record<number, { attended: boolean; reason: string; comment: string }>>({});
  const [customAttendanceSaving, setCustomAttendanceSaving] = useState(false);

  const canCreateManualLesson = user?.role === 'admin' || user?.role === 'owner' || user?.role === 'sales';
  const [addLessonChoiceOpen, setAddLessonChoiceOpen] = useState(false);
  const [manualLessonDialogOpen, setManualLessonDialogOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualStartTime, setManualStartTime] = useState('15:00');
  const [manualEndTime, setManualEndTime] = useState('');
  const [manualTrainerId, setManualTrainerId] = useState<string>('');
  const [manualLessonType, setManualLessonType] = useState<string>('makeup');
  const [manualComment, setManualComment] = useState('');
  const [manualStudentQuery, setManualStudentQuery] = useState('');
  const [manualStudentOptions, setManualStudentOptions] = useState<Student[]>([]);
  const [manualSelectedStudents, setManualSelectedStudents] = useState<Student[]>([]);
  const [manualPlannedAbsenceByStudentId, setManualPlannedAbsenceByStudentId] = useState<Record<number, number | null>>({});
  const [manualOpenAbsencesByStudentId, setManualOpenAbsencesByStudentId] = useState<Record<number, AbsenceFollowUp[]>>({});
  const [manualCreateLoading, setManualCreateLoading] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [trainerOptions, setTrainerOptions] = useState<Array<{ id: number; full_name: string }>>([]);

  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      setViewDate(dateParam);
    }
  }, [searchParams]);

  const loadSlots = useCallback(async (): Promise<TrainerLessonSlot[]> => {
    setLoading(true);
    setError(null);
    try {
      const data = await trainerLessonsApi.getForDate(viewDate);
      setSlots(data);
      return data;
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить занятия'));
      setSlots([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [viewDate]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  useEffect(() => {
    if (!user) return;
    if (!(canMoveLessons || user.role === 'trainer')) return;
    groupsApi
      .getAll()
      .then((data) => setGroups(data))
      .catch(() => {});
  }, [user, canMoveLessons]);

  useEffect(() => {
    if (user?.role !== 'trainer') return;
    const from = format(subDays(new Date(viewDate), 3), 'yyyy-MM-dd');
    const to = format(addDays(new Date(viewDate), 3), 'yyyy-MM-dd');
    setCustomLessonsLoading(true);
    trainerLessonsApi
      .getCustomLessons({ date_from: from, date_to: to })
      .then((data) => setCustomLessons(data))
      .catch(() => setCustomLessons([]))
      .finally(() => setCustomLessonsLoading(false));
  }, [viewDate, user?.role]);

  const handlePrevDay = () => setViewDate((d) => format(subDays(new Date(d), 1), 'yyyy-MM-dd'));
  const handleNextDay = () => setViewDate((d) => format(addDays(new Date(d), 1), 'yyyy-MM-dd'));
  const handleToday = () => setViewDate(format(startOfDay(new Date()), 'yyyy-MM-dd'));

  const openCreateLessonDialog = () => {
    setCreateGroupId('');
    setCreateDate(viewDate);
    setCreateStartTime('15:00');
    setCreateEndTime('17:00');
    setCreateError(null);
    setCreateDialogOpen(true);
  };

  const openAddLessonChoice = () => {
    if (canCreateManualLesson) {
      setAddLessonChoiceOpen(true);
    } else {
      openCreateLessonDialog();
    }
  };

  const openManualLessonDialog = () => {
    setAddLessonChoiceOpen(false);
    setManualTitle('');
    setManualDate(viewDate);
    setManualStartTime('15:00');
    setManualEndTime('');
    setManualTrainerId('');
    setManualLessonType('makeup');
    setManualComment('');
    setManualStudentQuery('');
    setManualStudentOptions([]);
    setManualSelectedStudents([]);
    setManualPlannedAbsenceByStudentId({});
    setManualOpenAbsencesByStudentId({});
    setManualError(null);
    setManualLessonDialogOpen(true);
    usersApi.getAll('trainer').then((list) => setTrainerOptions(list.map((u) => ({ id: u.id, full_name: u.full_name || '' })))).catch(() => setTrainerOptions([]));
  };

  useEffect(() => {
    if (!manualLessonDialogOpen || !manualStudentQuery.trim()) {
      setManualStudentOptions([]);
      return;
    }
    const t = setTimeout(() => {
      studentsApi.getAll({ q: manualStudentQuery.trim(), limit: 20 }).then(setManualStudentOptions).catch(() => setManualStudentOptions([]));
    }, 300);
    return () => clearTimeout(t);
  }, [manualLessonDialogOpen, manualStudentQuery]);

  useEffect(() => {
    if (manualLessonType !== 'makeup' || manualSelectedStudents.length === 0) {
      setManualOpenAbsencesByStudentId({});
      return;
    }
    const load = async () => {
      const byId: Record<number, AbsenceFollowUp[]> = {};
      await Promise.all(
        manualSelectedStudents.map(async (s) => {
          const list = await salesApi.getAbsences({ student_id: s.id }).catch(() => []);
          const open = (list as AbsenceFollowUp[]).filter((a) => a.stage === 'missed' || a.stage === 'missed_makeup');
          byId[s.id] = open.sort((a, b) => new Date(a.lesson_date).getTime() - new Date(b.lesson_date).getTime());
        })
      );
      setManualOpenAbsencesByStudentId((prev) => ({ ...prev, ...byId }));
    };
    void load();
  }, [manualLessonType, manualSelectedStudents]);

  const handleCreateManualLesson = async () => {
    if (!manualTitle.trim() || !manualDate || !manualStartTime || !manualTrainerId || manualSelectedStudents.length === 0) {
      setManualError('Заполните название, дату, время, тренера и выберите учеников');
      return;
    }
    setManualCreateLoading(true);
    setManualError(null);
    try {
      await salesApi.createCustomLesson({
        title: manualTitle.trim(),
        lesson_date: manualDate,
        start_time: manualStartTime,
        end_time: manualEndTime || null,
        trainer_id: parseInt(manualTrainerId, 10),
        lesson_type: manualLessonType,
        comment: manualComment || null,
        students: manualSelectedStudents.map((s) => ({ student_id: s.id, planned_absence_id: manualPlannedAbsenceByStudentId[s.id] ?? null })),
      });
      setManualLessonDialogOpen(false);
      if (user?.role === 'trainer') {
        const from = format(subDays(new Date(viewDate), 3), 'yyyy-MM-dd');
        const to = format(addDays(new Date(viewDate), 3), 'yyyy-MM-dd');
        const data = await trainerLessonsApi.getCustomLessons({ date_from: from, date_to: to });
        setCustomLessons(data);
      }
    } catch (err: any) {
      setManualError(extractApiError(err, 'Не удалось создать урок'));
    } finally {
      setManualCreateLoading(false);
    }
  };

  const handleCreateLesson = async () => {
    if (!createGroupId || !createDate || !createStartTime || !createEndTime) {
      setCreateError('Заполните группу, дату и время');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      await trainerLessonsApi.createLessonSlot({
        group_id: Number(createGroupId),
        lesson_date: createDate,
        start_time: createStartTime,
        end_time: createEndTime,
      });
      setCreateDialogOpen(false);
      await loadSlots();
    } catch (err: any) {
      setCreateError(extractApiError(err, 'Не удалось создать урок'));
    } finally {
      setCreating(false);
    }
  };

  const openMoveDialog = (e: React.MouseEvent, slot: TrainerLessonSlot) => {
    e.stopPropagation();
    setMoveSlot(slot);
    setMoveToDate(format(addDays(new Date(slot.lesson_date || viewDate), 1), 'yyyy-MM-dd'));
    const start = (slot.start_time || '').toString().slice(0, 5);
    const end = (slot.end_time || '').toString().slice(0, 5);
    setMoveToStartTime(start || '15:00');
    setMoveToEndTime(end || '17:00');
    setMoveError(null);
    setMoveDialogOpen(true);
  };

  const handleMoveLesson = async () => {
    if (!moveSlot || !moveToDate) return;
    const fromDate = moveSlot.lesson_date || viewDate;
    if (moveToDate === fromDate) {
      setMoveError('Выберите другую дату');
      return;
    }
    setMoving(true);
    setMoveError(null);
    const fromStart = (moveSlot.start_time || '').toString().slice(0, 5);
    const fromEnd = (moveSlot.end_time || '').toString().slice(0, 5);
    try {
      await trainerLessonsApi.moveLesson({
        group_id: moveSlot.group_id,
        from_date: fromDate,
        to_date: moveToDate,
        ...(fromStart && fromEnd ? { from_start_time: fromStart, from_end_time: fromEnd } : {}),
        ...(moveToStartTime && moveToEndTime
          ? { to_start_time: moveToStartTime, to_end_time: moveToEndTime }
          : {}),
      });
      setMoveDialogOpen(false);
      setMoveSlot(null);
      loadSlots();
    } catch (err: any) {
      setMoveError(extractApiError(err, 'Не удалось перенести занятие'));
    } finally {
      setMoving(false);
    }
  };

  const openCancelDialog = (e: React.MouseEvent, slot: TrainerLessonSlot) => {
    e.stopPropagation();
    setCancelSlot(slot);
    setCancelDialogOpen(true);
  };

  const handleCancelLesson = async () => {
    if (!cancelSlot) return;
    const slotStart = (cancelSlot.start_time || '').toString().slice(0, 5);
    const slotEnd = (cancelSlot.end_time || '').toString().slice(0, 5);
    setCancelling(true);
    try {
      await trainerLessonsApi.cancelLesson({
        group_id: cancelSlot.group_id,
        lesson_date: cancelSlot.lesson_date || viewDate,
        start_time: slotStart,
        end_time: slotEnd,
      });
      setCancelDialogOpen(false);
      setCancelSlot(null);
      loadSlots();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось отменить занятие'));
    } finally {
      setCancelling(false);
    }
  };

  const openPopup = (slot: TrainerLessonSlot) => {
    setSelectedSlot(slot);
    setAddStudentToLessonId('');
    setLessonTrainerId(slot.trainer_id ?? '');
    const draft: Record<number, boolean> = {};
    const late: Record<number, boolean> = {};
    const reasonDraft: Record<number, AbsenceReason> = {};
    const commentDraft: Record<number, string> = {};
    slot.students.forEach((s) => {
      const attended = s.attended ?? true;
      draft[s.id] = attended;
      late[s.id] = !!s.late;
      reasonDraft[s.id] = (s.absence_reason as AbsenceReason) || (attended ? 'was' : 'not_was');
      commentDraft[s.id] = s.absence_comment || '';
    });
    setAttendanceDraft(draft);
    setLateDraft(late);
    setAbsenceReasonDraft(reasonDraft);
    setAbsenceCommentDraft(commentDraft);
    setPopupOpen(true);
  };

  useEffect(() => {
    if (popupOpen && selectedSlot && allStudents.length === 0) {
      studentsApi.getAll({ status: 'active' }).then((data) => setAllStudents(data)).catch(() => {});
    }
  }, [popupOpen, selectedSlot, allStudents.length]);

  useEffect(() => {
    if (popupOpen && canAddStudentToLesson && trainers.length === 0) {
      usersApi.getAll('trainer').then((data) => setTrainers(data)).catch(() => {});
    }
  }, [popupOpen, canAddStudentToLesson, trainers.length]);

  const handleSetLessonTrainer = async () => {
    if (!selectedSlot || lessonTrainerId === '' || Number(lessonTrainerId) === selectedSlot.trainer_id) return;
    const slotStart = (selectedSlot.start_time || '').toString().slice(0, 5);
    const slotEnd = (selectedSlot.end_time || '').toString().slice(0, 5);
    if (!slotStart || !slotEnd) return;
    setSettingTrainer(true);
    setError(null);
    try {
      await trainerLessonsApi.setLessonTrainer({
        group_id: selectedSlot.group_id,
        lesson_date: selectedSlot.lesson_date || viewDate,
        start_time: slotStart,
        end_time: slotEnd,
        trainer_id: Number(lessonTrainerId),
      });
      const newSlots = await loadSlots();
      const updated = newSlots.find(
        (s) =>
          s.group_id === selectedSlot.group_id &&
          (s.start_time || '').toString().slice(0, 5) === slotStart &&
          (s.end_time || '').toString().slice(0, 5) === slotEnd
      );
      if (updated) setSelectedSlot(updated);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сменить преподавателя'));
    } finally {
      setSettingTrainer(false);
    }
  };

  const handleAddStudentToLesson = async () => {
    if (!selectedSlot || !addStudentToLessonId) return;
    setAddingToLesson(true);
    setError(null);
    try {
      const slotStart = (selectedSlot.start_time || '').toString().slice(0, 5);
      const slotEnd = (selectedSlot.end_time || '').toString().slice(0, 5);
      await trainerLessonsApi.addStudentToLesson({
        group_id: selectedSlot.group_id,
        lesson_date: selectedSlot.lesson_date || viewDate,
        student_id: parseInt(addStudentToLessonId, 10),
        ...(slotStart && slotEnd ? { start_time: slotStart, end_time: slotEnd } : {}),
      });
      setAddStudentToLessonId('');
      const newSlots = await loadSlots();
      const updated = newSlots.find(
        (s) =>
          s.group_id === selectedSlot.group_id &&
          (s.start_time || '').toString().slice(0, 5) === slotStart &&
          (s.end_time || '').toString().slice(0, 5) === slotEnd
      );
      if (updated) {
        setSelectedSlot(updated);
        const draft: Record<number, boolean> = {};
        const late: Record<number, boolean> = {};
        const reasonDraft: Record<number, AbsenceReason> = {};
        const commentDraft: Record<number, string> = {};
        updated.students.forEach((s) => {
          const attended = s.attended ?? true;
          draft[s.id] = attended;
          late[s.id] = !!s.late;
          reasonDraft[s.id] = (s.absence_reason as AbsenceReason) || (attended ? 'was' : 'not_was');
          commentDraft[s.id] = s.absence_comment || '';
        });
        setAttendanceDraft(draft);
        setLateDraft(late);
        setAbsenceReasonDraft(reasonDraft);
        setAbsenceCommentDraft(commentDraft);
      }
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось добавить ученика на урок'));
    } finally {
      setAddingToLesson(false);
    }
  };

  const handleSaveAttendance = async () => {
    if (!selectedSlot) return;
    setSaving(true);
    setError(null);
    try {
      const reason = absenceReasonDraft;
      await trainerLessonsApi.saveAttendance({
        group_id: selectedSlot.group_id,
        lesson_date: selectedSlot.lesson_date,
        attendances: selectedSlot.students.map((s) => {
          const r = reason[s.id] ?? 'was';
          const attended = r === 'was';
          return {
            student_id: s.id,
            attended,
            late: lateDraft[s.id] ?? false,
            absence_reason: r,
            absence_comment: r === 'other' ? (absenceCommentDraft[s.id] || undefined) : undefined,
          };
        }),
      });
      setPopupOpen(false);
      setSelectedSlot(null);
      loadSlots();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить посещаемость'));
    } finally {
      setSaving(false);
    }
  };

  const displayDate = viewDate ? (() => {
    const d = new Date(viewDate + 'T12:00:00');
    return format(d, 'd MMMM yyyy г.', { locale: ru });
  })() : '';
  const displayWeekday = viewDate ? WEEKDAY_NAMES[(new Date(viewDate + 'T12:00:00').getDay() + 6) % 7] : '';

  return (
    <Layout>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
          <Typography variant="h4">Уроки</Typography>
          <Typography component="span" variant="caption" sx={{ color: 'text.secondary', alignSelf: 'flex-end', pb: 0.5 }}>
            (обновлено 19.02.2026)
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
          <Button size="small" onClick={handlePrevDay}>{'<'}</Button>
          <Button size="small" onClick={handleToday}>Сегодня</Button>
          <Button size="small" onClick={handleNextDay}>{'>'}</Button>
          <Typography variant="h6">{displayDate} ({displayWeekday})</Typography>
          {(canMoveLessons || user?.role === 'trainer') && (
            <Button size="small" variant="outlined" onClick={openAddLessonChoice}>
              Добавить урок
            </Button>
          )}
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        {loading ? (
          <Typography color="text.secondary">Загрузка...</Typography>
        ) : slots.length === 0 ? (
          <Typography color="text.secondary">
            На эту дату нет занятий по расписанию. Добавьте расписание в карточке группы (Группы → группа → расписание)
            или создайте разовое занятие через кнопку «Добавить урок».
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {slots.map((slot) => (
              <Card
                key={`${slot.group_id}-${slot.start_time}`}
                variant="outlined"
                sx={{
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                  borderLeft: '4px solid',
                  borderLeftColor: 'primary.main',
                }}
                onClick={() => openPopup(slot)}
              >
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    <Typography variant="subtitle2" color="primary">
                      {(slot.start_time || '').slice(0, 5)} – {(slot.end_time || '').slice(0, 5)}
                    </Typography>
                    {slot.program_name && (
                      <>
                        <BookIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                          {slot.program_name}
                        </Typography>
                      </>
                    )}
                  </Stack>
                  <Typography variant="subtitle1" sx={{ mt: 0.5 }}>
                    {slot.group_name}
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap">
                    <PeopleIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">
                      {slot.students.map((s) => (s.freeze_badge ? `${s.full_name} (${s.freeze_badge})` : s.full_name)).join(', ')}
                    </Typography>
                  </Stack>
                  {slot.students.some((s) => s.attended !== null && s.attended !== undefined) && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      Отмечено: {slot.students.filter((s) => s.attended === true).length}/{slot.students.length}
                    </Typography>
                  )}
                  {canMoveLessons && (
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={(e) => openMoveDialog(e, slot)}
                      >
                        Перенести на другой день
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={(e) => openCancelDialog(e, slot)}
                      >
                        Отменить занятие
                      </Button>
                    </Stack>
                  )}
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Stack>

      <Dialog open={popupOpen} onClose={() => setPopupOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          Занятие: {selectedSlot?.group_name} — {selectedSlot?.lesson_date && format(new Date(selectedSlot.lesson_date + 'T12:00:00'), 'd.MM.yyyy')}
        </DialogTitle>
        <DialogContent>
          {canAddStudentToLesson && (
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
              <Typography variant="body2" fontWeight={500}>Преподаватель:</Typography>
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <Select
                  value={lessonTrainerId ?? selectedSlot?.trainer_id ?? ''}
                  onChange={(e) => setLessonTrainerId(e.target.value === '' ? '' : Number(e.target.value))}
                  displayEmpty
                  renderValue={(v: number | string) => {
                    if (v == null || v === '') return selectedSlot?.trainer_name || '—';
                    const t = trainers.find((x) => x.id === Number(v));
                    return t?.full_name ?? selectedSlot?.trainer_name ?? '—';
                  }}
                >
                  {trainers.map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.full_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="outlined"
                size="small"
                disabled={settingTrainer || lessonTrainerId === '' || lessonTrainerId === selectedSlot?.trainer_id}
                onClick={handleSetLessonTrainer}
              >
                {settingTrainer ? 'Сохранение...' : 'Сменить'}
              </Button>
            </Stack>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Статус каждого ученика: Был / причина отсутствия (ТЗ п.3.1)
          </Typography>
          <Stack spacing={1.5}>
            {canAddStudentToLesson && (
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <InputLabel>Добавить ученика на урок</InputLabel>
                  <Select
                    value={addStudentToLessonId}
                    label="Добавить ученика на урок"
                    onChange={(e) => setAddStudentToLessonId(e.target.value)}
                  >
                    <MenuItem value="">
                      <em>Выберите ученика</em>
                    </MenuItem>
                    {allStudents
                      .filter((s) => !selectedSlot?.students.some((ss) => ss.id === s.id))
                      .map((s) => (
                        <MenuItem key={s.id} value={s.id.toString()}>
                          {s.full_name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={!addStudentToLessonId || addingToLesson}
                  onClick={handleAddStudentToLesson}
                >
                  {addingToLesson ? 'Добавление...' : 'Добавить'}
                </Button>
              </Stack>
            )}
            {selectedSlot?.students.map((student) => {
              const reason = absenceReasonDraft[student.id] ?? 'was';
              const isPresent = reason === 'was';
              return (
                <Stack key={student.id} spacing={0.5}>
                  <Stack direction="row" alignItems="center" flexWrap="wrap" spacing={1}>
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <InputLabel>Статус</InputLabel>
                      <Select
                        value={reason}
                        label="Статус"
                        onChange={(e) => {
                          const v = e.target.value as AbsenceReason;
                          setAbsenceReasonDraft((p) => ({ ...p, [student.id]: v }));
                          setAttendanceDraft((p) => ({ ...p, [student.id]: v === 'was' }));
                        }}
                      >
                        {ABSENCE_REASONS.map((r) => (
                          <MenuItem key={r.value} value={r.value}>
                            {r.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Typography variant="body2">{student.full_name}</Typography>
                    {student.freeze_badge && (
                      <Typography variant="caption" color="info.main">
                        {student.freeze_badge}
                      </Typography>
                    )}
                  </Stack>
                  {!isPresent && (
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={lateDraft[student.id] ?? false}
                            onChange={(e) =>
                              setLateDraft((prev) => ({ ...prev, [student.id]: e.target.checked }))
                            }
                          />
                        }
                        label="Опоздает / в пути"
                      />
                      {reason === 'other' && (
                        <TextField
                          size="small"
                          placeholder="Комментарий"
                          value={absenceCommentDraft[student.id] ?? ''}
                          onChange={(e) =>
                            setAbsenceCommentDraft((p) => ({ ...p, [student.id]: e.target.value }))
                          }
                          sx={{ minWidth: 200 }}
                        />
                      )}
                    </Stack>
                  )}
                </Stack>
              );
            })}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPopupOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleSaveAttendance} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={moveDialogOpen} onClose={() => !moving && setMoveDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Перенести занятие на другой день</DialogTitle>
        <DialogContent>
          {moveSlot && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Группа «{moveSlot.group_name}», текущая дата: {format(new Date((moveSlot.lesson_date || viewDate) + 'T12:00:00'), 'd.MM.yyyy')}
            </Typography>
          )}
          <TextField
            label="Перенести на дату"
            type="date"
            value={moveToDate}
            onChange={(e) => setMoveToDate(e.target.value)}
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 1 }}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
            <TextField
              label="Время начала"
              type="time"
              value={moveToStartTime}
              onChange={(e) => setMoveToStartTime(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Время окончания"
              type="time"
              value={moveToEndTime}
              onChange={(e) => setMoveToEndTime(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
              sx={{ flex: 1 }}
            />
          </Stack>
          {moveError && (
            <Alert severity="error" sx={{ mt: 1 }}>{moveError}</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveDialogOpen(false)} disabled={moving}>Отмена</Button>
          <Button variant="contained" onClick={handleMoveLesson} disabled={moving || !moveToDate}>
            {moving ? 'Перенос...' : 'Перенести'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cancelDialogOpen} onClose={() => !cancelling && setCancelDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Отменить занятие</DialogTitle>
        <DialogContent>
          {cancelSlot && (
            <Typography>
              Отменить занятие «{cancelSlot.group_name}» на {format(new Date((cancelSlot.lesson_date || viewDate) + 'T12:00:00'), 'd.MM.yyyy')} ({(cancelSlot.start_time || '').toString().slice(0, 5)} – {(cancelSlot.end_time || '').toString().slice(0, 5)})? Слот исчезнет из расписания.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelDialogOpen(false)} disabled={cancelling}>Нет</Button>
          <Button variant="contained" color="error" onClick={handleCancelLesson} disabled={cancelling}>
            {cancelling ? 'Отмена...' : 'Да, отменить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={createDialogOpen} onClose={() => !creating && setCreateDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Добавить урок</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel>Группа</InputLabel>
            <Select
              value={createGroupId === '' ? '' : createGroupId}
              label="Группа"
              onChange={(e) => setCreateGroupId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <MenuItem value="">
                <em>Выберите группу</em>
              </MenuItem>
              {groups.map((g) => (
                <MenuItem key={g.id} value={g.id}>
                  {g.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Дата"
            type="date"
            value={createDate}
            onChange={(e) => setCreateDate(e.target.value)}
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 2 }}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <TextField
              label="Время начала"
              type="time"
              value={createStartTime}
              onChange={(e) => setCreateStartTime(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Время окончания"
              type="time"
              value={createEndTime}
              onChange={(e) => setCreateEndTime(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
              inputProps={{ step: 300 }}
              sx={{ flex: 1 }}
            />
          </Stack>
          {createError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {createError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Дополнительный слот появится на странице «Уроки» для выбранной группы и даты. По умолчанию все ученики
            считаются присутствующими — скорректируйте статусы в карточке урока при необходимости.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={creating}>
            Отмена
          </Button>
          <Button variant="contained" onClick={handleCreateLesson} disabled={creating}>
            {creating ? 'Создание...' : 'Создать'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={addLessonChoiceOpen} onClose={() => setAddLessonChoiceOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Добавить урок</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Создать групповой урок по расписанию или ручной урок без группы?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddLessonChoiceOpen(false)}>Отмена</Button>
          <Button variant="outlined" onClick={() => { setAddLessonChoiceOpen(false); openCreateLessonDialog(); }}>
            Групповой (по группе)
          </Button>
          <Button variant="contained" onClick={openManualLessonDialog}>
            Ручной (без группы)
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={manualLessonDialogOpen} onClose={() => !manualCreateLoading && setManualLessonDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Создать ручной урок</DialogTitle>
        <DialogContent>
          <TextField
            label="Название урока *"
            fullWidth
            sx={{ mt: 1 }}
            value={manualTitle}
            onChange={(e) => setManualTitle(e.target.value)}
          />
          <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
            <TextField
              type="date"
              label="Дата *"
              size="small"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              type="time"
              label="Время начала *"
              size="small"
              value={manualStartTime}
              onChange={(e) => setManualStartTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              type="time"
              label="Время окончания"
              size="small"
              value={manualEndTime}
              onChange={(e) => setManualEndTime(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Тренер *</InputLabel>
              <Select
                label="Тренер *"
                value={manualTrainerId}
                onChange={(e) => setManualTrainerId(e.target.value)}
              >
                <MenuItem value="">
                  <em>Выберите тренера</em>
                </MenuItem>
                {trainerOptions.map((t) => (
                  <MenuItem key={t.id} value={String(t.id)}>
                    {t.full_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Тип урока</InputLabel>
              <Select
                label="Тип урока"
                value={manualLessonType}
                onChange={(e) => setManualLessonType(e.target.value)}
              >
                {MANUAL_LESSON_TYPES.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <TextField
            label="Комментарий"
            fullWidth
            multiline
            minRows={2}
            sx={{ mt: 2 }}
            value={manualComment}
            onChange={(e) => setManualComment(e.target.value)}
          />
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Ученики *
            </Typography>
            <TextField
              label="Поиск ученика по ФИО"
              fullWidth
              size="small"
              value={manualStudentQuery}
              onChange={(e) => setManualStudentQuery(e.target.value)}
            />
            {manualStudentOptions.length > 0 && (
              <Box sx={{ maxHeight: 200, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1, mt: 1 }}>
                {manualStudentOptions.map((s) => (
                  <Typography
                    key={s.id}
                    variant="body2"
                    sx={{
                      py: 0.5,
                      px: 1,
                      borderRadius: 1,
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: 'action.hover' },
                    }}
                    onClick={() => {
                      if (!manualSelectedStudents.find((x) => x.id === s.id)) {
                        setManualSelectedStudents((prev) => [...prev, s]);
                      }
                    }}
                  >
                    {s.full_name || s.id}
                  </Typography>
                ))}
              </Box>
            )}
            {manualSelectedStudents.length > 0 && (
              <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {manualSelectedStudents.map((s) => (
                  <Chip
                    key={s.id}
                    label={s.full_name || s.id}
                    onDelete={() => {
                      setManualSelectedStudents((prev) => prev.filter((x) => x.id !== s.id));
                      setManualPlannedAbsenceByStudentId((prev) => {
                        const next = { ...prev };
                        delete next[s.id];
                        return next;
                      });
                    }}
                  />
                ))}
              </Box>
            )}
            {manualLessonType === 'makeup' && manualSelectedStudents.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  Какой пропуск закрыть (по умолчанию — самый ранний)
                </Typography>
                {manualSelectedStudents.map((s) => {
                  const openList = manualOpenAbsencesByStudentId[s.id] || [];
                  const raw = manualPlannedAbsenceByStudentId[s.id];
                  const value = raw == null ? 'earliest' : raw;
                  const formatAbsenceDate = (d: string | null | undefined) => {
                    if (!d) return '—';
                    try {
                      return format(parseISO(d), 'd MMM yyyy', { locale: ru });
                    } catch {
                      return d;
                    }
                  };
                  return (
                    <Box key={s.id} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="body2" sx={{ minWidth: 120 }}>
                        {s.full_name || s.id}
                      </Typography>
                      <FormControl size="small" sx={{ minWidth: 260 }}>
                        <Select
                          value={value}
                          onChange={(e) => {
                            const v = e.target.value;
                            setManualPlannedAbsenceByStudentId((prev) => ({
                              ...prev,
                              [s.id]: v === 'earliest' ? null : Number(v),
                            }));
                          }}
                          displayEmpty
                        >
                          <MenuItem value="earliest">Самый ранний</MenuItem>
                          {openList.map((a) => (
                            <MenuItem key={a.id} value={a.id}>
                              {formatAbsenceDate(a.lesson_date)} ({REASON_LABELS[a.absence_reason || ''] || a.absence_reason || '—'})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
          {manualError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {manualError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManualLessonDialogOpen(false)} disabled={manualCreateLoading}>
            Отмена
          </Button>
          <Button variant="contained" onClick={() => void handleCreateManualLesson()} disabled={manualCreateLoading}>
            {manualCreateLoading ? 'Создание...' : 'Создать'}
          </Button>
        </DialogActions>
      </Dialog>

      {user?.role === 'trainer' && (
        <>
          <Card variant="outlined" sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                Ручные уроки (без группы)
              </Typography>
              {customLessonsLoading ? (
                <Typography variant="body2" color="text.secondary">Загрузка…</Typography>
              ) : customLessons.length === 0 ? (
                <Typography variant="body2" color="text.secondary">Нет ручных уроков на эту неделю.</Typography>
              ) : (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {customLessons.map((lesson) => (
                    <Stack key={lesson.id} direction="row" alignItems="center" spacing={2} flexWrap="wrap">
                      <Typography variant="body2">
                        {format(new Date(lesson.lesson_date + 'T12:00:00'), 'd MMM', { locale: ru })} {lesson.start_time}
                        {lesson.end_time ? `–${lesson.end_time}` : ''} · {lesson.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {lesson.students?.length || 0} уч.
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          setCustomAttendanceLesson(lesson);
                          const draft: Record<number, { attended: boolean; reason: string; comment: string }> = {};
                          (lesson.students || []).forEach((s: any) => {
                            draft[s.id] = {
                              attended: s.attended ?? false,
                              reason: s.absence_reason || 'not_was',
                              comment: s.absence_comment || '',
                            };
                          });
                          setCustomAttendanceDraft(draft);
                        }}
                      >
                        Посещаемость
                      </Button>
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>

          <Dialog open={!!customAttendanceLesson} onClose={() => setCustomAttendanceLesson(null)} maxWidth="sm" fullWidth>
            <DialogTitle>{customAttendanceLesson?.title} — посещаемость</DialogTitle>
            <DialogContent>
              {customAttendanceLesson?.students?.map((s: any) => (
                <Box key={s.id} sx={{ mb: 2 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={customAttendanceDraft[s.id]?.attended ?? false}
                        onChange={(e) =>
                          setCustomAttendanceDraft((prev) => ({
                            ...prev,
                            [s.id]: { ...prev[s.id], attended: e.target.checked },
                          }))
                        }
                      />
                    }
                    label={`Был: ${s.student_name || s.student_id}`}
                  />
                  {!(customAttendanceDraft[s.id]?.attended ?? false) && (
                    <Stack direction="row" spacing={1} sx={{ ml: 4, mt: 0.5 }} flexWrap="wrap">
                      <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel>Причина</InputLabel>
                        <Select
                          value={customAttendanceDraft[s.id]?.reason || 'not_was'}
                          label="Причина"
                          onChange={(e) =>
                            setCustomAttendanceDraft((prev) => ({
                              ...prev,
                              [s.id]: { ...prev[s.id], reason: e.target.value },
                            }))
                          }
                        >
                          {ABSENCE_REASONS.filter((r) => r.value !== 'was').map((r) => (
                            <MenuItem key={r.value} value={r.value}>
                              {r.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField
                        size="small"
                        placeholder="Комментарий"
                        value={customAttendanceDraft[s.id]?.comment || ''}
                        onChange={(e) =>
                          setCustomAttendanceDraft((prev) => ({
                            ...prev,
                            [s.id]: { ...prev[s.id], comment: e.target.value },
                          }))
                        }
                        sx={{ minWidth: 160 }}
                      />
                    </Stack>
                  )}
                </Box>
              ))}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCustomAttendanceLesson(null)}>Отмена</Button>
              <Button
                variant="contained"
                disabled={customAttendanceSaving || !customAttendanceLesson}
                onClick={async () => {
                  if (!customAttendanceLesson) return;
                  setCustomAttendanceSaving(true);
                  setError(null);
                  try {
                    await trainerLessonsApi.saveCustomLessonAttendance({
                      lesson_id: customAttendanceLesson.id,
                      items: (customAttendanceLesson.students || []).map((s: any) => ({
                        lesson_student_id: s.id,
                        attended: customAttendanceDraft[s.id]?.attended ?? false,
                        absence_reason: customAttendanceDraft[s.id]?.attended ? undefined : (customAttendanceDraft[s.id]?.reason || undefined),
                        absence_comment: customAttendanceDraft[s.id]?.attended ? undefined : (customAttendanceDraft[s.id]?.comment || undefined),
                      })),
                    });
                    setCustomAttendanceLesson(null);
                    const from = format(subDays(new Date(viewDate), 3), 'yyyy-MM-dd');
                    const to = format(addDays(new Date(viewDate), 3), 'yyyy-MM-dd');
                    const data = await trainerLessonsApi.getCustomLessons({ date_from: from, date_to: to });
                    setCustomLessons(data);
                  } catch (err: any) {
                    setError(extractApiError(err, 'Не удалось сохранить посещаемость'));
                  } finally {
                    setCustomAttendanceSaving(false);
                  }
                }}
              >
                {customAttendanceSaving ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Layout>
  );
};

export default TrainerLessonsPage;
