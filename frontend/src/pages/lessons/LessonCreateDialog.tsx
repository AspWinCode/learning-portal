/**
 * Диалог создания нового занятия.
 * Шаг 1 — выбор типа: групповое или ручное.
 * Шаг 2 — форма создания.
 */
import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stack, TextField, Select, MenuItem, FormControl,
  InputLabel, Alert, CircularProgress, Typography, Divider,
  ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import EditNoteIcon from '@mui/icons-material/EditNote';
import type { LessonInstance, User, Student } from '../../types';
import { lessonsApi } from '../../services/api';

interface Group {
  id: number;
  name: string;
}

interface Props {
  open: boolean;
  defaultDate: string;
  onClose: () => void;
  onCreated: (lesson: LessonInstance) => void;
  trainers: User[];
  groups: Group[];
  allStudents: Student[];
}

export function LessonCreateDialog({
  open,
  defaultDate,
  onClose,
  onCreated,
  trainers,
  groups,
  allStudents,
}: Props) {
  const [lessonKind, setLessonKind] = useState<'group' | 'manual'>('group');

  // Групповое
  const [groupId, setGroupId] = useState<number | ''>('');
  const [groupDate, setGroupDate] = useState('');
  const [groupStart, setGroupStart] = useState('');
  const [groupEnd, setGroupEnd] = useState('');
  const [groupComment, setGroupComment] = useState('');

  // Ручное
  const [manualTitle, setManualTitle] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualStart, setManualStart] = useState('');
  const [manualEnd, setManualEnd] = useState('');
  const [manualTrainerId, setManualTrainerId] = useState<number | ''>('');
  const [manualType, setManualType] = useState<string>('manual');
  const [manualComment, setManualComment] = useState('');
  const [manualStudentIds, setManualStudentIds] = useState<number[]>([]);
  const [studentSearch, setStudentSearch] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setGroupDate(defaultDate);
      setManualDate(defaultDate);
      setGroupId('');
      setGroupStart('');
      setGroupEnd('');
      setGroupComment('');
      setManualTitle('');
      setManualStart('');
      setManualEnd('');
      setManualTrainerId('');
      setManualType('manual');
      setManualComment('');
      setManualStudentIds([]);
      setStudentSearch('');
      setError(null);
    }
  }, [open, defaultDate]);

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      let created: LessonInstance;
      if (lessonKind === 'group') {
        if (!groupId || !groupDate || !groupStart) {
          setError('Заполните группу, дату и время начала');
          return;
        }
        created = await lessonsApi.createGroup({
          group_id: groupId as number,
          lesson_date: groupDate,
          start_time: groupStart,
          end_time: groupEnd || undefined,
          comment: groupComment || undefined,
        });
      } else {
        if (!manualTitle || !manualDate || !manualStart || !manualTrainerId) {
          setError('Заполните название, дату, время и тренера');
          return;
        }
        created = await lessonsApi.createManual({
          title: manualTitle,
          lesson_date: manualDate,
          start_time: manualStart,
          end_time: manualEnd || undefined,
          trainer_id: manualTrainerId as number,
          lesson_type: manualType,
          comment: manualComment || undefined,
          students: manualStudentIds.map(id => ({ student_id: id })),
        });
      }
      onCreated(created);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Ошибка создания занятия');
    } finally {
      setSaving(false);
    }
  };

  const toggleStudent = (id: number) => {
    setManualStudentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const filteredStudents = allStudents.filter(s =>
    s.full_name.toLowerCase().includes(studentSearch.toLowerCase())
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Новое занятие</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* Тип занятия */}
          <Stack spacing={1}>
            <Typography variant="subtitle2" color="text.secondary">Тип занятия</Typography>
            <ToggleButtonGroup
              value={lessonKind}
              exclusive
              onChange={(_, v) => v && setLessonKind(v)}
              size="small"
            >
              <ToggleButton value="group">
                <GroupIcon sx={{ mr: 1 }} fontSize="small" />
                Групповое (по группе)
              </ToggleButton>
              <ToggleButton value="manual">
                <EditNoteIcon sx={{ mr: 1 }} fontSize="small" />
                Ручное (без группы)
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <Divider />

          {/* Форма группового */}
          {lessonKind === 'group' && (
            <Stack spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>Группа *</InputLabel>
                <Select
                  value={groupId}
                  label="Группа *"
                  onChange={e => setGroupId(e.target.value as number)}
                >
                  <MenuItem value="">— выберите —</MenuItem>
                  {groups.map(g => (
                    <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Дата *"
                type="date"
                value={groupDate}
                onChange={e => setGroupDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                fullWidth
              />
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Начало *"
                  type="time"
                  value={groupStart}
                  onChange={e => setGroupStart(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  fullWidth
                />
                <TextField
                  label="Конец"
                  type="time"
                  value={groupEnd}
                  onChange={e => setGroupEnd(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  fullWidth
                />
              </Stack>
              <TextField
                label="Комментарий"
                value={groupComment}
                onChange={e => setGroupComment(e.target.value)}
                size="small"
                fullWidth
                multiline
                rows={2}
              />
            </Stack>
          )}

          {/* Форма ручного */}
          {lessonKind === 'manual' && (
            <Stack spacing={2}>
              <TextField
                label="Название *"
                value={manualTitle}
                onChange={e => setManualTitle(e.target.value)}
                size="small"
                fullWidth
              />
              <TextField
                label="Дата *"
                type="date"
                value={manualDate}
                onChange={e => setManualDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                fullWidth
              />
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Начало *"
                  type="time"
                  value={manualStart}
                  onChange={e => setManualStart(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  fullWidth
                />
                <TextField
                  label="Конец"
                  type="time"
                  value={manualEnd}
                  onChange={e => setManualEnd(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  fullWidth
                />
              </Stack>
              <FormControl size="small" fullWidth>
                <InputLabel>Тренер *</InputLabel>
                <Select
                  value={manualTrainerId}
                  label="Тренер *"
                  onChange={e => setManualTrainerId(e.target.value as number)}
                >
                  <MenuItem value="">— выберите —</MenuItem>
                  {trainers.map(t => (
                    <MenuItem key={t.id} value={t.id}>{t.full_name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel>Вид занятия</InputLabel>
                <Select
                  value={manualType}
                  label="Вид занятия"
                  onChange={e => setManualType(e.target.value)}
                >
                  <MenuItem value="manual">Ручное</MenuItem>
                  <MenuItem value="makeup">Отработка</MenuItem>
                  <MenuItem value="paid_extra">Доп. платное</MenuItem>
                  <MenuItem value="free_trial">Пробное</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Комментарий"
                value={manualComment}
                onChange={e => setManualComment(e.target.value)}
                size="small"
                fullWidth
                multiline
                rows={2}
              />

              {/* Выбор учеников */}
              <Stack spacing={1}>
                <Typography variant="subtitle2" color="text.secondary">Ученики</Typography>
                <TextField
                  size="small"
                  placeholder="Поиск ученика..."
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  fullWidth
                />
                <Stack
                  spacing={0.5}
                  sx={{
                    maxHeight: 200,
                    overflowY: 'auto',
                    border: '1px solid #e0e0e0',
                    borderRadius: 1,
                    p: 1,
                  }}
                >
                  {filteredStudents.slice(0, 30).map(s => (
                    <Button
                      key={s.id}
                      size="small"
                      variant={manualStudentIds.includes(s.id) ? 'contained' : 'text'}
                      onClick={() => toggleStudent(s.id)}
                      sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
                    >
                      {s.full_name}
                    </Button>
                  ))}
                  {filteredStudents.length === 0 && (
                    <Typography variant="caption" color="text.secondary" textAlign="center">
                      Ничего не найдено
                    </Typography>
                  )}
                </Stack>
                {manualStudentIds.length > 0 && (
                  <Typography variant="caption">
                    Выбрано: {manualStudentIds.length} уч.
                  </Typography>
                )}
              </Stack>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Отмена</Button>
        <Button variant="contained" onClick={handleCreate} disabled={saving}>
          {saving ? <CircularProgress size={20} /> : 'Создать'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
