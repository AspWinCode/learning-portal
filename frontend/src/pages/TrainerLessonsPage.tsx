import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
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
import { format, addDays, subDays, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { trainerLessonsApi, studentsApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { TrainerLessonSlot, AbsenceReason } from '../types';

const WEEKDAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const ABSENCE_REASONS: { value: AbsenceReason; label: string }[] = [
  { value: 'was', label: 'Был' },
  { value: 'not_was', label: 'Не был' },
  { value: 'sick', label: 'Болел' },
  { value: 'olympiad', label: 'Олимпиада' },
  { value: 'event', label: 'Мероприятие' },
  { value: 'other', label: 'Другое' },
];

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

  const handlePrevDay = () => setViewDate((d) => format(subDays(new Date(d), 1), 'yyyy-MM-dd'));
  const handleNextDay = () => setViewDate((d) => format(addDays(new Date(d), 1), 'yyyy-MM-dd'));
  const handleToday = () => setViewDate(format(startOfDay(new Date()), 'yyyy-MM-dd'));

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
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        {loading ? (
          <Typography color="text.secondary">Загрузка...</Typography>
        ) : slots.length === 0 ? (
          <Typography color="text.secondary">
            На эту дату нет занятий по расписанию. Добавьте расписание в карточке группы (Группы → группа → расписание).
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
    </Layout>
  );
};

export default TrainerLessonsPage;
