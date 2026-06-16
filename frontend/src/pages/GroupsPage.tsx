import React, { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import {
  Typography,
  Box,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Stack,
  Tabs,
  Tab,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, People as PeopleIcon } from '@mui/icons-material';
import { groupsApi, usersApi, studentsApi } from '../services/api';
import { Group, User, Student } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getEffectiveRole, hasPermission } from '../utils/permissions';
import { ConfirmDialog, DataTable, EmptyState, FormDialog, StatusChip } from '../components/ui';

const GroupsPage: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [trainers, setTrainers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Group | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupDetails, setGroupDetails] = useState<Group | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentToAddId, setStudentToAddId] = useState('');
  const [newSchedule, setNewSchedule] = useState({ day_of_week: 1, start_time: '09:00', end_time: '11:00' });
  const [error, setError] = useState('');
  const [newGroup, setNewGroup] = useState({
    name: '',
    trainer_id: '',
    direction: '',
    units_per_session: 1,
    extra_rate_per_unit: '' as number | '',
    start_date: '' as string,
    lesson_format: 'group' as 'group' | 'individual',
  });
  const [formSchedules, setFormSchedules] = useState<Array<{ day_of_week: number; start_time: string; end_time: string }>>([]);
  const [groupsTab, setGroupsTab] = useState<'active' | 'archive'>('active');
  const { user } = useAuth();
  const effectiveRole = getEffectiveRole(user);
  const canManageGroups = hasPermission(user, 'groups.manage');
  const canViewMembers = canManageGroups || effectiveRole === 'trainer';

  const displayedGroups = groups.filter((g) => (groupsTab === 'active' ? g.status === 'active' : g.status === 'archived'));
  const WEEKDAY_OPTIONS = [
    { value: 0, label: 'Понедельник' },
    { value: 1, label: 'Вторник' },
    { value: 2, label: 'Среда' },
    { value: 3, label: 'Четверг' },
    { value: 4, label: 'Пятница' },
    { value: 5, label: 'Суббота' },
    { value: 6, label: 'Воскресенье' },
  ];
  const DIRECTION_OPTIONS = [
    { value: '', label: 'Не выбрано' },
    { value: 'individual', label: 'Индивидуальное' },
    { value: 'first_step', label: 'Первый Шаг' },
    { value: 'specialist', label: 'Специалист' },
    { value: 'expert', label: 'Эксперт' },
    { value: 'backend', label: 'Backend' },
    { value: 'frontend', label: 'Frontend' },
    { value: 'oge', label: 'ОГЭ' },
    { value: 'ege', label: 'ЕГЭ' },
  ];
  const loadGroups = useCallback(async () => {
    try {
      const data = await groupsApi.getAll();
      // Для тренера подтягиваем полные данные группы (включая учеников), чтобы показать счётчик и состав
      if (effectiveRole === 'trainer') {
        const fullGroups = await Promise.all(
          data.map(async (g) => {
            try {
              return await groupsApi.getById(g.id);
            } catch {
              return g;
            }
          })
        );
        setGroups(fullGroups);
      } else {
        setGroups(data);
      }
    } catch (err) {
      console.error('Ошибка загрузки групп', err);
    }
  }, [effectiveRole]);

  const loadTrainers = useCallback(async () => {
    try {
      const data = await usersApi.getAll('trainer');
      setTrainers(data.filter(t => t.is_active));
    } catch (err) {
      console.error('Ошибка загрузки тренеров', err);
    }
  }, []);

  const loadStudents = useCallback(async () => {
    try {
      const data = await studentsApi.getAll({ status: 'active' });
      setStudents(data);
    } catch (err) {
      console.error('Ошибка загрузки учеников', err);
    }
  }, []);

  useEffect(() => {
    loadGroups();
    if (canManageGroups) {
      loadTrainers();
      loadStudents();
    }
  }, [canManageGroups, loadGroups, loadStudents, loadTrainers, user]);

  const openEditDialog = async (group: Group) => {
    setSelectedGroup(group);
    setError('');
    try {
      const full = await groupsApi.getById(group.id);
      setNewGroup({
        name: full.name,
        trainer_id: full.trainer_id?.toString?.() || '',
        direction: full.direction ?? '',
        units_per_session: full.units_per_session ?? 1,
        extra_rate_per_unit: full.extra_rate_per_unit != null ? full.extra_rate_per_unit : '',
        start_date: full.start_date ? full.start_date.slice(0, 10) : '',
        lesson_format: (full.lesson_format === 'individual' ? 'individual' : 'group'),
      });
      setFormSchedules(
        (full.schedules || []).map((s) => ({
          day_of_week: s.day_of_week,
          start_time: typeof s.start_time === 'string' ? s.start_time.slice(0, 5) : '09:00',
          end_time: typeof s.end_time === 'string' ? s.end_time.slice(0, 5) : '11:00',
        }))
      );
      setEditOpen(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось загрузить группу');
    }
  };

  const openMembersDialog = async (group: Group) => {
    setSelectedGroup(group);
    setStudentToAddId('');
    try {
      const fullGroup = await groupsApi.getById(group.id);
      setGroupDetails(fullGroup);
      setMembersOpen(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка загрузки группы');
    }
  };

  const normalizeTime = (t: string) => (t.length === 5 ? t + ':00' : t);

  const handleCreate = async () => {
    if (!newGroup.name.trim()) {
      setError('Заполните название группы');
      return;
    }
    if (!newGroup.trainer_id) {
      setError('Выберите тренера');
      return;
    }

    try {
      await groupsApi.create({
        name: newGroup.name.trim(),
        trainer_id: parseInt(newGroup.trainer_id),
        direction: newGroup.direction || undefined,
        units_per_session: Number(newGroup.units_per_session) || 1,
        extra_rate_per_unit: newGroup.extra_rate_per_unit === '' ? undefined : Number(newGroup.extra_rate_per_unit) || undefined,
        start_date: newGroup.start_date || undefined,
        lesson_format: newGroup.lesson_format,
        schedules: formSchedules.map((s) => ({
          day_of_week: s.day_of_week,
          start_time: normalizeTime(s.start_time),
          end_time: normalizeTime(s.end_time),
        })),
      });
      setOpen(false);
      setNewGroup({ name: '', trainer_id: '', direction: '', units_per_session: 1, extra_rate_per_unit: '', start_date: '', lesson_format: 'group' });
      setFormSchedules([]);
      setError('');
      loadGroups();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка создания группы');
    }
  };

  const handleUpdate = async () => {
    if (!selectedGroup) return;
    if (!newGroup.name.trim()) {
      setError('Заполните название группы');
      return;
    }
    if (!newGroup.trainer_id) {
      setError('Выберите тренера');
      return;
    }

    try {
      await groupsApi.update(selectedGroup.id, {
        name: newGroup.name.trim(),
        trainer_id: parseInt(newGroup.trainer_id),
        direction: newGroup.direction || undefined,
        units_per_session: Number(newGroup.units_per_session) || 1,
        extra_rate_per_unit: newGroup.extra_rate_per_unit === '' ? null : Number(newGroup.extra_rate_per_unit) || null,
        start_date: newGroup.start_date || null,
        lesson_format: newGroup.lesson_format,
        schedules: formSchedules.map((s) => ({
          day_of_week: s.day_of_week,
          start_time: normalizeTime(s.start_time),
          end_time: normalizeTime(s.end_time),
        })),
      });
      setEditOpen(false);
      setSelectedGroup(null);
      setNewGroup({ name: '', trainer_id: '', direction: '', units_per_session: 1, extra_rate_per_unit: '', start_date: '', lesson_format: 'group' });
      setFormSchedules([]);
      setError('');
      loadGroups();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка обновления группы');
    }
  };

  const handleArchiveToggle = async (group: Group) => {
    try {
      const nextStatus = group.status === 'active' ? 'archived' : 'active';
      await groupsApi.update(group.id, { status: nextStatus } as any);
      loadGroups();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка изменения статуса группы');
    }
  };

  const handleAddStudentToGroup = async () => {
    if (!selectedGroup || !studentToAddId) return;
    try {
      await groupsApi.addStudent(selectedGroup.id, parseInt(studentToAddId));
      const fullGroup = await groupsApi.getById(selectedGroup.id);
      setGroupDetails(fullGroup);
      setStudentToAddId('');
      loadGroups();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка добавления ученика в группу');
    }
  };

  const handleRemoveStudentFromGroup = async (studentId: number) => {
    if (!selectedGroup) return;
    try {
      await groupsApi.removeStudent(selectedGroup.id, studentId);
      const fullGroup = await groupsApi.getById(selectedGroup.id);
      setGroupDetails(fullGroup);
      loadGroups();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка удаления ученика из группы');
    }
  };

  const groupColumns = [
    { key: 'name', header: 'Название', render: (group: Group) => group.name },
    {
      key: 'direction',
      header: 'Направление',
      render: (group: Group) => DIRECTION_OPTIONS.find((o) => o.value === group.direction)?.label ?? group.direction ?? '-',
    },
    { key: 'trainer', header: 'Тренер', render: (group: Group) => group.trainer?.full_name || '-' },
    {
      key: 'units',
      header: 'Юниты',
      render: (group: Group) =>
        group.lesson_format === 'individual'
          ? '—'
          : `${group.units_per_session ?? 1}${group.extra_rate_per_unit != null ? ` · ${group.extra_rate_per_unit} ₽/доп` : ''}`,
    },
    { key: 'students', header: 'Ученики', render: (group: Group) => group.students?.length ?? '-' },
    {
      key: 'status',
      header: 'Статус',
      render: (group: Group) => (
        <StatusChip status={group.status} label={group.status === 'active' ? 'Активна' : 'В архиве'} />
      ),
    },
    ...(canViewMembers
      ? [
          {
            key: 'actions',
            header: 'Действия',
            render: (group: Group) => (
              <>
                <Button size="small" startIcon={<PeopleIcon />} onClick={() => openMembersDialog(group)} sx={{ mr: 1 }}>
                  Состав
                </Button>
                {canManageGroups && (
                  <>
                    <Button size="small" startIcon={<EditIcon />} onClick={() => openEditDialog(group)} sx={{ mr: 1 }}>
                      Редактировать
                    </Button>
                    <Button
                      size="small"
                      color={group.status === 'active' ? 'warning' : 'success'}
                      onClick={() => setArchiveTarget(group)}
                    >
                      {group.status === 'active' ? 'В архив' : 'Разархивировать'}
                    </Button>
                  </>
                )}
              </>
            ),
          },
        ]
      : []),
  ];

  return (
    <Layout>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={groupsTab} onChange={(_, v: 'active' | 'archive') => setGroupsTab(v)}>
          <Tab label="Активные" value="active" />
          <Tab label="Архив" value="archive" />
        </Tabs>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
        <Typography variant="h4">Группы</Typography>
        {canManageGroups && groupsTab === 'active' && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setOpen(true);
              setNewGroup({ name: '', trainer_id: '', direction: '', units_per_session: 1, extra_rate_per_unit: '', start_date: '', lesson_format: 'group' });
              setFormSchedules([]);
            }}
          >
            Создать группу
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <DataTable
        columns={groupColumns}
        rows={displayedGroups}
        getRowKey={(group) => group.id}
        emptyState={
          <EmptyState
            title="Группы не найдены"
            description={groupsTab === 'active' ? 'В активном разделе пока нет групп.' : 'В архиве пока нет групп.'}
          />
        }
      />
      {false && (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Название</TableCell>
              <TableCell>Направление</TableCell>
              <TableCell>Тренер</TableCell>
              <TableCell>Юниты</TableCell>
              <TableCell>Ученики</TableCell>
              <TableCell>Статус</TableCell>
              {canViewMembers && <TableCell>Действия</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {displayedGroups.map((group) => (
              <TableRow key={group.id}>
                <TableCell>{group.name}</TableCell>
                <TableCell>{DIRECTION_OPTIONS.find((o) => o.value === group.direction)?.label ?? group.direction ?? '-'}</TableCell>
                <TableCell>{group.trainer?.full_name || '-'}</TableCell>
                <TableCell>{(group.lesson_format === 'individual') ? '—' : (group.units_per_session ?? 1) + (group.extra_rate_per_unit != null ? ` · ${group.extra_rate_per_unit} ₽/доп` : '')}</TableCell>
                <TableCell>{group.students?.length ?? '-'}</TableCell>
                <TableCell>{group.status === 'active' ? 'Активна' : 'В архиве'}</TableCell>
                {canViewMembers && (
                  <TableCell>
                    <Button
                      size="small"
                      startIcon={<PeopleIcon />}
                      onClick={() => openMembersDialog(group)}
                      sx={{ mr: 1 }}
                    >
                      Состав
                    </Button>
                    {canManageGroups && (
                      <>
                        <Button
                          size="small"
                          startIcon={<EditIcon />}
                          onClick={() => openEditDialog(group)}
                          sx={{ mr: 1 }}
                        >
                          Редактировать
                        </Button>
                        <Button
                          size="small"
                          color={group.status === 'active' ? 'warning' : 'success'}
                          onClick={() => handleArchiveToggle(group)}
                        >
                          {group.status === 'active' ? 'В архив' : 'Разархивировать'}
                        </Button>
                      </>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Диалог создания группы */}
      {canManageGroups && (
        <FormDialog open={open} title="Создать группу" onClose={() => setOpen(false)} onSubmit={handleCreate} submitLabel="Создать" maxWidth="sm">
          <DialogTitle>Создать группу</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label="Название группы *"
              value={newGroup.name}
              onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
              sx={{ mt: 2 }}
              required
            />
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Направление</InputLabel>
              <Select
                value={newGroup.direction}
                label="Направление"
                onChange={(e) => setNewGroup({ ...newGroup, direction: e.target.value })}
              >
                {DIRECTION_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || 'none'} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Тренер *</InputLabel>
              <Select
                value={newGroup.trainer_id}
                label="Тренер"
                onChange={(e) => setNewGroup({ ...newGroup, trainer_id: e.target.value })}
                required
              >
                <MenuItem value="">
                  <em>Не выбран</em>
                </MenuItem>
                {trainers.map((trainer) => (
                  <MenuItem key={trainer.id} value={trainer.id.toString()}>
                    {trainer.full_name} ({trainer.email})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              fullWidth
              label="Начало группы"
              type="date"
              value={newGroup.start_date}
              onChange={(e) => setNewGroup({ ...newGroup, start_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={{ mt: 2 }}
              helperText="С какой даты группа считается работающей; уроки нельзя создавать раньше"
            />
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Формат</InputLabel>
              <Select
                value={newGroup.lesson_format}
                label="Формат"
                onChange={(e) => setNewGroup({ ...newGroup, lesson_format: e.target.value as 'group' | 'individual' })}
              >
                <MenuItem value="group">Групповой формат</MenuItem>
                <MenuItem value="individual">Индивидуальный формат</MenuItem>
              </Select>
            </FormControl>
            {newGroup.lesson_format !== 'individual' && (
              <>
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
              8 занятий (юниты)
            </Typography>
            <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
              <TextField
                type="number"
                label="Юнитов за занятие"
                value={newGroup.units_per_session}
                onChange={(e) => setNewGroup({ ...newGroup, units_per_session: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                inputProps={{ min: 1, max: 10 }}
                sx={{ width: 160 }}
                helperText="Обычно 1 или 2"
              />
              <TextField
                type="number"
                label="Ставка за доп. юнит, ₽"
                value={newGroup.extra_rate_per_unit}
                onChange={(e) => setNewGroup({ ...newGroup, extra_rate_per_unit: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 })}
                inputProps={{ min: 0, step: 0.01 }}
                sx={{ width: 180 }}
                placeholder="Не задано"
                helperText="Сверх лимита; пусто — как базовая"
              />
            </Stack>
            </>
            )}
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
              Расписание
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} useFlexGap flexWrap="wrap">
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>День</InputLabel>
                <Select
                  value={newSchedule.day_of_week}
                  label="День"
                  onChange={(e) => setNewSchedule({ ...newSchedule, day_of_week: Number(e.target.value) })}
                >
                  {WEEKDAY_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Начало"
                type="time"
                InputLabelProps={{ shrink: true }}
                value={newSchedule.start_time}
                onChange={(e) => setNewSchedule({ ...newSchedule, start_time: e.target.value })}
                sx={{ width: 120 }}
              />
              <TextField
                size="small"
                label="Конец"
                type="time"
                InputLabelProps={{ shrink: true }}
                value={newSchedule.end_time}
                onChange={(e) => setNewSchedule({ ...newSchedule, end_time: e.target.value })}
                sx={{ width: 120 }}
              />
              <Button
                variant="outlined"
                onClick={() => {
                  setFormSchedules((prev) => [
                    ...prev,
                    {
                      day_of_week: newSchedule.day_of_week,
                      start_time: newSchedule.start_time,
                      end_time: newSchedule.end_time,
                    },
                  ]);
                }}
              >
                Добавить слот
              </Button>
            </Stack>
            {formSchedules.length > 0 && (
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {formSchedules.map((s, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      p: 1,
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2">
                      {WEEKDAY_OPTIONS.find((o) => o.value === s.day_of_week)?.label ?? s.day_of_week} — {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}
                    </Typography>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => setFormSchedules((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      Удалить
                    </Button>
                  </Box>
                ))}
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} variant="contained">
              Создать
            </Button>
          </DialogActions>
        </FormDialog>
      )}

      {/* Диалог редактирования группы */}
      {canManageGroups && (
        <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Редактировать группу</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label="Название группы *"
              value={newGroup.name}
              onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
              sx={{ mt: 2 }}
              required
            />
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Направление</InputLabel>
              <Select
                value={newGroup.direction}
                label="Направление"
                onChange={(e) => setNewGroup({ ...newGroup, direction: e.target.value })}
              >
                {DIRECTION_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value || 'none'} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Тренер *</InputLabel>
              <Select
                value={newGroup.trainer_id}
                label="Тренер"
                onChange={(e) => setNewGroup({ ...newGroup, trainer_id: e.target.value })}
                required
              >
                <MenuItem value="">
                  <em>Не выбран</em>
                </MenuItem>
                {trainers.map((trainer) => (
                  <MenuItem key={trainer.id} value={trainer.id.toString()}>
                    {trainer.full_name} ({trainer.email})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              fullWidth
              label="Начало группы"
              type="date"
              value={newGroup.start_date}
              onChange={(e) => setNewGroup({ ...newGroup, start_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={{ mt: 2 }}
              helperText="С какой даты группа считается работающей; уроки нельзя создавать раньше"
            />
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Формат</InputLabel>
              <Select
                value={newGroup.lesson_format}
                label="Формат"
                onChange={(e) => setNewGroup({ ...newGroup, lesson_format: e.target.value as 'group' | 'individual' })}
              >
                <MenuItem value="group">Групповой формат</MenuItem>
                <MenuItem value="individual">Индивидуальный формат</MenuItem>
              </Select>
            </FormControl>
            {newGroup.lesson_format !== 'individual' && (
              <>
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
              8 занятий (юниты)
            </Typography>
            <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
              <TextField
                type="number"
                label="Юнитов за занятие"
                value={newGroup.units_per_session}
                onChange={(e) => setNewGroup({ ...newGroup, units_per_session: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                inputProps={{ min: 1, max: 10 }}
                sx={{ width: 160 }}
                helperText="Обычно 1 или 2"
              />
              <TextField
                type="number"
                label="Ставка за доп. юнит, ₽"
                value={newGroup.extra_rate_per_unit}
                onChange={(e) => setNewGroup({ ...newGroup, extra_rate_per_unit: e.target.value === '' ? '' : parseFloat(e.target.value) || 0 })}
                inputProps={{ min: 0, step: 0.01 }}
                sx={{ width: 180 }}
                placeholder="Не задано"
                helperText="Сверх лимита; пусто — как базовая"
              />
            </Stack>
            </>
            )}
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
              Расписание
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }} useFlexGap flexWrap="wrap">
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>День</InputLabel>
                <Select
                  value={newSchedule.day_of_week}
                  label="День"
                  onChange={(e) => setNewSchedule({ ...newSchedule, day_of_week: Number(e.target.value) })}
                >
                  {WEEKDAY_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Начало"
                type="time"
                InputLabelProps={{ shrink: true }}
                value={newSchedule.start_time}
                onChange={(e) => setNewSchedule({ ...newSchedule, start_time: e.target.value })}
                sx={{ width: 120 }}
              />
              <TextField
                size="small"
                label="Конец"
                type="time"
                InputLabelProps={{ shrink: true }}
                value={newSchedule.end_time}
                onChange={(e) => setNewSchedule({ ...newSchedule, end_time: e.target.value })}
                sx={{ width: 120 }}
              />
              <Button
                variant="outlined"
                onClick={() => {
                  setFormSchedules((prev) => [
                    ...prev,
                    {
                      day_of_week: newSchedule.day_of_week,
                      start_time: newSchedule.start_time,
                      end_time: newSchedule.end_time,
                    },
                  ]);
                }}
              >
                Добавить слот
              </Button>
            </Stack>
            {formSchedules.length > 0 && (
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {formSchedules.map((s, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      p: 1,
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2">
                      {WEEKDAY_OPTIONS.find((o) => o.value === s.day_of_week)?.label ?? s.day_of_week} — {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}
                    </Typography>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => setFormSchedules((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      Удалить
                    </Button>
                  </Box>
                ))}
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditOpen(false)}>Отмена</Button>
            <Button onClick={handleUpdate} variant="contained">
              Сохранить
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Диалог состава группы */}
      {canViewMembers && (
        <Dialog open={membersOpen} onClose={() => setMembersOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Состав группы: {groupDetails?.name || selectedGroup?.name}</DialogTitle>
          <DialogContent>
            {canManageGroups && (
              <>
                <FormControl fullWidth sx={{ mt: 2 }}>
                  <InputLabel>Добавить ученика</InputLabel>
                  <Select
                    value={studentToAddId}
                    label="Добавить ученика"
                    onChange={(e) => setStudentToAddId(e.target.value)}
                  >
                    <MenuItem value="">
                      <em>Не выбран</em>
                    </MenuItem>
                    {students
                      .filter((s) => !(groupDetails?.students || []).some((gs) => gs.id === s.id))
                      .map((s) => (
                        <MenuItem key={s.id} value={s.id.toString()}>
                          {s.full_name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
                <Button
                  variant="outlined"
                  sx={{ mt: 2 }}
                  disabled={!studentToAddId}
                  onClick={handleAddStudentToGroup}
                >
                  Добавить в группу
                </Button>
              </>
            )}

            <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>
              Ученики в группе
            </Typography>
            {(groupDetails?.students || []).length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                В группе пока нет учеников.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {(groupDetails?.students || []).map((s) => (
                  <Box
                    key={s.id}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      p: 1,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Box>
                      <Typography variant="body2">{s.full_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {s.status === 'active' ? 'Активен' : 'В архиве'}
                      </Typography>
                    </Box>
                    {canManageGroups && (
                      <Button
                        size="small"
                        color="error"
                        onClick={() => handleRemoveStudentFromGroup(s.id)}
                      >
                        Удалить
                      </Button>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setMembersOpen(false)}>Закрыть</Button>
          </DialogActions>
        </Dialog>
      )}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title={archiveTarget?.status === 'active' ? 'РћС‚РїСЂР°РІРёС‚СЊ РіСЂСѓРїРїСѓ РІ Р°СЂС…РёРІ?' : 'Р’РµСЂРЅСѓС‚СЊ РіСЂСѓРїРїСѓ РёР· Р°СЂС…РёРІР°?'}
        description={archiveTarget ? `Р“СЂСѓРїРїР°: ${archiveTarget.name}` : undefined}
        confirmLabel={archiveTarget?.status === 'active' ? 'Р’ Р°СЂС…РёРІ' : 'Р Р°Р·Р°СЂС…РёРІРёСЂРѕРІР°С‚СЊ'}
        destructive={archiveTarget?.status === 'active'}
        onClose={() => setArchiveTarget(null)}
        onConfirm={async () => {
          if (!archiveTarget) return;
          await handleArchiveToggle(archiveTarget);
          setArchiveTarget(null);
        }}
      />

    </Layout>
  );
};

export default GroupsPage;
