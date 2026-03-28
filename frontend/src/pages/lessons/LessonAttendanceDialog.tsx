/**
 * Диалог посещаемости для конкретного экземпляра занятия.
 * Поддерживает: быстрые действия "все присутствовали/отсутствовали",
 * защиту от потери несохранённых изменений, смену тренера.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  TextField,
  Chip,
  Alert,
  Divider,
  IconButton,
  Tooltip,
  CircularProgress,
  Box,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import type { LessonInstance, User, Student } from '../../types';
import { lessonsApi } from '../../services/api';
import { useLessonAttendanceDraft, type AttendanceDraftItem } from './useLessonAttendanceDraft';

const ABSENCE_REASONS = [
  { value: 'sick', label: 'Болеет' },
  { value: 'olympiad', label: 'Олимпиада' },
  { value: 'event', label: 'Мероприятие' },
  { value: 'other', label: 'Другое' },
];

interface Props {
  open: boolean;
  lesson: LessonInstance | null;
  onClose: () => void;
  onSaved: (updated: LessonInstance) => void;
  trainers: User[];
  allStudents: Student[];
  canChangeTrainer: boolean;
  canAddStudent: boolean;
  canRemoveStudent: boolean;
}

export function LessonAttendanceDialog({
  open,
  lesson,
  onClose,
  onSaved,
  trainers,
  allStudents,
  canChangeTrainer,
  canAddStudent,
  canRemoveStudent,
}: Props) {
  const {
    draft,
    isDirty,
    initDraft,
    setAttended,
    setLate,
    setAbsenceReason,
    setAbsenceComment,
    markAllPresent,
    markAllAbsent,
    getItems,
    resetDirty,
  } = useLessonAttendanceDraft();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Смена тренера
  const [selectedTrainerId, setSelectedTrainerId] = useState<number | ''>('');
  const [trainerSaving, setTrainerSaving] = useState(false);

  // Добавление ученика
  const [addStudentId, setAddStudentId] = useState<number | ''>('');
  const [addStudentSearch, setAddStudentSearch] = useState('');

  useEffect(() => {
    if (lesson && open) {
      const visible = lesson.students.filter(s => s.participation_status !== 'removed');
      initDraft(visible);
      setSelectedTrainerId(lesson.trainer_id ?? '');
      setError(null);
      setAddStudentId('');
      setAddStudentSearch('');
    }
  }, [lesson, open, initDraft]);

  const handleClose = useCallback(() => {
    if (isDirty) {
      if (!window.confirm('Есть несохранённые изменения. Закрыть без сохранения?')) {
        return;
      }
    }
    onClose();
  }, [isDirty, onClose]);

  const handleSave = useCallback(async () => {
    if (!lesson) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await lessonsApi.saveAttendance(lesson.id, getItems());
      resetDirty();
      onSaved(updated);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка сохранения посещаемости');
    } finally {
      setSaving(false);
    }
  }, [lesson, getItems, resetDirty, onSaved, onClose]);

  const handleSetTrainer = useCallback(async () => {
    if (!lesson || !selectedTrainerId) return;
    setTrainerSaving(true);
    try {
      const updated = await lessonsApi.setTrainer(lesson.id, selectedTrainerId as number);
      onSaved(updated);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка смены тренера');
    } finally {
      setTrainerSaving(false);
    }
  }, [lesson, selectedTrainerId, onSaved]);

  const handleAddStudent = useCallback(async () => {
    if (!lesson || !addStudentId) return;
    try {
      const updated = await lessonsApi.addStudent(lesson.id, { student_id: addStudentId as number });
      onSaved(updated);
      // Обновляем draft
      const visible = updated.students.filter(s => s.participation_status !== 'removed');
      initDraft(visible);
      setAddStudentId('');
      setAddStudentSearch('');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка добавления ученика');
    }
  }, [lesson, addStudentId, onSaved, initDraft]);

  const handleRemoveStudent = useCallback(async (studentId: number) => {
    if (!lesson) return;
    if (!window.confirm('Убрать ученика из этого урока?')) return;
    try {
      const updated = await lessonsApi.removeStudent(lesson.id, studentId);
      onSaved(updated);
      const visible = updated.students.filter(s => s.participation_status !== 'removed');
      initDraft(visible);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка удаления ученика');
    }
  }, [lesson, onSaved, initDraft]);

  if (!lesson) return null;

  const draftItems: AttendanceDraftItem[] = Object.values(draft) as AttendanceDraftItem[];
  const presentCount = draftItems.filter((d: AttendanceDraftItem) => d.attended === true).length;
  const absentCount = draftItems.filter((d: AttendanceDraftItem) => d.attended === false).length;
  const unmarkedCount = draftItems.filter((d: AttendanceDraftItem) => d.attended === null).length;

  const filteredStudents = allStudents.filter(s =>
    s.full_name.toLowerCase().includes(addStudentSearch.toLowerCase()) &&
    !draftItems.some((d: AttendanceDraftItem) => d.student_id === s.id)
  );

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Stack>
            <Typography variant="h6">
              {lesson.group_name ?? lesson.title ?? 'Занятие'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {lesson.lesson_date} · {lesson.start_time}{lesson.end_time ? ` – ${lesson.end_time}` : ''}
            </Typography>
          </Stack>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

          {/* Смена тренера */}
          {canChangeTrainer && (
            <Stack spacing={1}>
              <Typography variant="subtitle2" color="text.secondary">Тренер</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <FormControl size="small" sx={{ flex: 1 }}>
                  <Select
                    value={selectedTrainerId}
                    onChange={e => setSelectedTrainerId(e.target.value as number)}
                  >
                    <MenuItem value="">— не выбран —</MenuItem>
                    {trainers.map(t => (
                      <MenuItem key={t.id} value={t.id}>{t.full_name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {selectedTrainerId !== lesson.trainer_id && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleSetTrainer}
                    disabled={trainerSaving}
                  >
                    {trainerSaving ? <CircularProgress size={16} /> : 'Сменить'}
                  </Button>
                )}
              </Stack>
            </Stack>
          )}

          <Divider />

          {/* Быстрые действия посещаемости */}
          <Stack spacing={1}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2">
                Посещаемость
                {isDirty && (
                  <Chip label="Не сохранено" size="small" color="warning" sx={{ ml: 1 }} />
                )}
              </Typography>
              <Stack direction="row" spacing={1}>
                <Typography variant="caption" color="text.secondary">
                  ✅ {presentCount} &nbsp; ❌ {absentCount} &nbsp; ⏳ {unmarkedCount}
                </Typography>
              </Stack>
            </Stack>

            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                color="success"
                startIcon={<CheckCircleIcon />}
                onClick={markAllPresent}
              >
                Все пришли
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<CancelIcon />}
                onClick={markAllAbsent}
              >
                Все отсутствуют
              </Button>
            </Stack>
          </Stack>

          {/* Список учеников */}
          <Stack spacing={1.5}>
            {draftItems.map((item: AttendanceDraftItem) => (
              <Box
                key={item.lesson_student_id}
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: item.attended === true
                    ? 'success.light'
                    : item.attended === false
                    ? 'error.light'
                    : 'grey.300',
                  backgroundColor: item.attended === true
                    ? '#f1fff4'
                    : item.attended === false
                    ? '#fff5f5'
                    : '#fafafa',
                }}
              >
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                  <Stack spacing={0.5} flex={1}>
                    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                      <Typography variant="body2" fontWeight={500}>
                        {item.student_name}
                      </Typography>
                      {item.participation_status === 'added_manual' && (
                        <Chip label="доб. вручную" size="small" color="info" variant="outlined" />
                      )}
                      {item.freeze_badge && (
                        <Chip label={item.freeze_badge} size="small" color="warning" variant="outlined" />
                      )}
                    </Stack>

                    {/* Статус посещаемости */}
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={item.attended === true}
                            indeterminate={item.attended === null}
                            onChange={e => setAttended(item.lesson_student_id, e.target.checked)}
                            size="small"
                            color="success"
                          />
                        }
                        label="Был"
                        sx={{ mr: 0 }}
                      />

                      {item.attended !== true && (
                        <FormControl size="small" sx={{ minWidth: 130 }}>
                          <InputLabel>Причина</InputLabel>
                          <Select
                            value={item.absence_reason ?? ''}
                            label="Причина"
                            onChange={e => setAbsenceReason(item.lesson_student_id, e.target.value || null)}
                          >
                            <MenuItem value="">—</MenuItem>
                            {ABSENCE_REASONS.map(r => (
                              <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}

                      {item.attended !== true && (
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={item.late}
                              onChange={e => setLate(item.lesson_student_id, e.target.checked)}
                              size="small"
                            />
                          }
                          label="Опоздает"
                          sx={{ mr: 0 }}
                        />
                      )}
                    </Stack>

                    {/* Комментарий — только если причина "Другое" */}
                    {item.absence_reason === 'other' && (
                      <TextField
                        size="small"
                        placeholder="Комментарий"
                        value={item.absence_comment ?? ''}
                        onChange={e => setAbsenceComment(item.lesson_student_id, e.target.value)}
                        multiline
                        maxRows={2}
                        fullWidth
                      />
                    )}
                  </Stack>

                  {/* Удалить из урока */}
                  {canRemoveStudent && (
                    <Tooltip title="Убрать из этого урока">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleRemoveStudent(item.student_id)}
                        sx={{ ml: 1 }}
                      >
                        <PersonRemoveIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              </Box>
            ))}

            {draftItems.length === 0 && (
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Нет учеников в этом занятии
              </Typography>
            )}
          </Stack>

          {/* Добавление ученика */}
          {canAddStudent && (
            <>
              <Divider />
              <Stack spacing={1}>
                <Typography variant="subtitle2" color="text.secondary">
                  Добавить ученика в этот урок
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    size="small"
                    placeholder="Поиск ученика..."
                    value={addStudentSearch}
                    onChange={e => { setAddStudentSearch(e.target.value); setAddStudentId(''); }}
                    sx={{ flex: 1 }}
                  />
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <Select
                      value={addStudentId}
                      onChange={e => setAddStudentId(e.target.value as number)}
                      displayEmpty
                    >
                      <MenuItem value="">— выберите —</MenuItem>
                      {filteredStudents.slice(0, 20).map(s => (
                        <MenuItem key={s.id} value={s.id}>{s.full_name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<PersonAddIcon />}
                    onClick={handleAddStudent}
                    disabled={!addStudentId}
                  >
                    Добавить
                  </Button>
                </Stack>
              </Stack>
            </>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          {isDirty ? '⚠ Есть несохранённые изменения' : ''}
        </Typography>
        <Button onClick={handleClose} disabled={saving}>
          Отмена
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !isDirty}
        >
          {saving ? <CircularProgress size={20} /> : 'Сохранить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
