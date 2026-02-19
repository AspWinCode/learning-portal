import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import {
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Stack,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, People as PeopleIcon, Book as BookIcon, Schedule as ScheduleIcon } from '@mui/icons-material';
import { groupsApi, usersApi, studentsApi, programsApi } from '../services/api';
import { Group, User, Student, Program, GroupSchedule } from '../types';
import { useAuth } from '../contexts/AuthContext';

const GroupsPage: React.FC = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [trainers, setTrainers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [groupDetails, setGroupDetails] = useState<Group | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentToAddId, setStudentToAddId] = useState('');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programOpen, setProgramOpen] = useState(false);
  const [programToAssignId, setProgramToAssignId] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedules, setSchedules] = useState<GroupSchedule[]>([]);
  const [newSchedule, setNewSchedule] = useState({ day_of_week: 1, start_time: '09:00', end_time: '11:00' });
  const [error, setError] = useState('');
  const [newGroup, setNewGroup] = useState({
    name: '',
    trainer_id: '',
  });
  const { user } = useAuth();
  const WEEKDAY_OPTIONS = [
    { value: 0, label: 'Понедельник' },
    { value: 1, label: 'Вторник' },
    { value: 2, label: 'Среда' },
    { value: 3, label: 'Четверг' },
    { value: 4, label: 'Пятница' },
    { value: 5, label: 'Суббота' },
    { value: 6, label: 'Воскресенье' },
  ];
  const isAdminLike = user?.role === 'admin' || user?.role === 'owner';

  useEffect(() => {
    loadGroups();
    if (isAdminLike) {
      loadTrainers();
      loadStudents();
      loadPrograms();
    }
  }, [user]);

  const loadGroups = async () => {
    try {
      const data = await groupsApi.getAll();
      // Для тренера подтягиваем полные данные группы (включая учеников), чтобы показать счётчик и состав
      if (user?.role === 'trainer') {
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
  };

  const loadTrainers = async () => {
    try {
      const data = await usersApi.getAll('trainer');
      setTrainers(data.filter(t => t.is_active));
    } catch (err) {
      console.error('Ошибка загрузки ╤В╤Атренеров', err);
    }
  };

  const loadStudents = async () => {
    try {
      const data = await studentsApi.getAll({ status: 'active' });
      setStudents(data);
    } catch (err) {
      console.error('Ошибка загрузки учеников', err);
    }
  };

  const loadPrograms = async () => {
    try {
      const data = await programsApi.getAll();
      setPrograms(data.filter((p) => p.status === 'active'));
    } catch (err) {
      console.error('Ошибка загрузки программ', err);
    }
  };

  const openEditDialog = (group: Group) => {
    setSelectedGroup(group);
    setNewGroup({
      name: group.name,
      trainer_id: group.trainer_id?.toString?.() || '',
    });
    setEditOpen(true);
  };

  const openScheduleDialog = async (group: Group) => {
    setSelectedGroup(group);
    setScheduleOpen(true);
    setError('');
    try {
      const data = await groupsApi.getSchedules(group.id);
      setSchedules(data);
    } catch (err) {
      setError('Не удалось загрузить расписание');
      setSchedules([]);
    }
  };

  const handleAddSchedule = async () => {
    if (!selectedGroup) return;
    setError('');
    try {
      await groupsApi.addSchedule(selectedGroup.id, {
        day_of_week: newSchedule.day_of_week,
        start_time: newSchedule.start_time.length === 5 ? newSchedule.start_time + ':00' : newSchedule.start_time,
        end_time: newSchedule.end_time.length === 5 ? newSchedule.end_time + ':00' : newSchedule.end_time,
      });
      const data = await groupsApi.getSchedules(selectedGroup.id);
      setSchedules(data);
      setNewSchedule({ day_of_week: 1, start_time: '09:00', end_time: '11:00' });
    } catch (err) {
      setError('Не удалось добавить слот расписания');
    }
  };

  const handleRemoveSchedule = async (scheduleId: number) => {
    if (!selectedGroup) return;
    setError('');
    try {
      await groupsApi.removeSchedule(selectedGroup.id, scheduleId);
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
    } catch (err) {
      setError('Не удалось удалить слот');
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

  const openProgramDialog = async (group: Group) => {
    setSelectedGroup(group);
    setProgramToAssignId('');
    try {
      const fullGroup = await groupsApi.getById(group.id);
      setGroupDetails(fullGroup);
      setProgramOpen(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка загрузки группы');
    }
  };

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
      });
      setOpen(false);
      setNewGroup({ name: '', trainer_id: '' });
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
      });
      setEditOpen(false);
      setSelectedGroup(null);
      setNewGroup({ name: '', trainer_id: '' });
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
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка удаления ученика из группы');
    }
  };

  const handleAssignProgramToGroup = async () => {
    if (!selectedGroup || !programToAssignId) return;
    try {
      await programsApi.assignToGroup(parseInt(programToAssignId), selectedGroup.id);
      const fullGroup = await groupsApi.getById(selectedGroup.id);
      setGroupDetails(fullGroup);
      setProgramToAssignId('');
      setProgramOpen(false);
      loadGroups();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка назначения программы группы');
    }
  };

  const renderPrograms = (g: Group) => {
    const list = (g.programs || []).filter((p) => p.status === 'active');
    if (!list.length) return '-';
    if (list.length === 1) return `${list[0].name} (v${list[0].version})`;
    return `${list[0].name} (v${list[0].version}) +${list.length - 1}`;
  };

  return (
    <Layout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
        <Typography variant="h4">Группы</Typography>
        {isAdminLike && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setOpen(true);
              setNewGroup({ name: '', trainer_id: '' });
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

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Название</TableCell>
              <TableCell>Тренер</TableCell>
              <TableCell>Ученики</TableCell>
              <TableCell>Программа</TableCell>
              <TableCell>Статус</TableCell>
              {(isAdminLike || user?.role === 'trainer') && <TableCell>Действия</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.map((group) => (
              <TableRow key={group.id}>
                <TableCell>{group.name}</TableCell>
                <TableCell>{group.trainer?.full_name || '-'}</TableCell>
                <TableCell>{group.students?.length ?? '-'}</TableCell>
                <TableCell>{renderPrograms(group)}</TableCell>
                <TableCell>{group.status === 'active' ? 'Активна' : 'В архиве'}</TableCell>
                {(isAdminLike || user?.role === 'trainer') && (
                  <TableCell>
                    <Button
                      size="small"
                      startIcon={<PeopleIcon />}
                      onClick={() => openMembersDialog(group)}
                      sx={{ mr: 1 }}
                    >
                      Состав
                    </Button>
                    {isAdminLike && (
                      <Button
                        size="small"
                        startIcon={<ScheduleIcon />}
                        onClick={() => openScheduleDialog(group)}
                        sx={{ mr: 1 }}
                      >
                        Расписание
                      </Button>
                    )}
                    {isAdminLike && (
                      <Button
                        size="small"
                        startIcon={<BookIcon />}
                        onClick={() => openProgramDialog(group)}
                        sx={{ mr: 1 }}
                      >
                        Программа
                      </Button>
                    )}
                    {isAdminLike && (
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
      </TableContainer>

      {/* Диалог создания группы */}
      {isAdminLike && (
        <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
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
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} variant="contained">
              Создать
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Диалог редактирования группы */}
      {isAdminLike && (
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
      {(isAdminLike || user?.role === 'trainer') && (
        <Dialog open={membersOpen} onClose={() => setMembersOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Состав группы: {groupDetails?.name || selectedGroup?.name}</DialogTitle>
          <DialogContent>
            {isAdminLike && (
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
                    {isAdminLike && (
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

      {/* Диалог расписания группы — только админ/owner могут добавлять и удалять слоты */}
      {isAdminLike && (
        <Dialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Расписание: {selectedGroup?.name}</DialogTitle>
          <DialogContent>
            {error && (
              <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>
                {error}
              </Alert>
            )}
            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              Слоты расписания (день недели и время). Нажимая «Добавить» — добавляете слот у тренера.
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }} useFlexGap flexWrap="wrap">
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
              <Button variant="outlined" onClick={handleAddSchedule}>
                Добавить
              </Button>
            </Stack>
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
              Текущие слоты
            </Typography>
            {schedules.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Нет слотов. Добавьте слот выше.
              </Typography>
            ) : (
              <Stack spacing={0.5}>
                {schedules.map((s) => (
                  <Box
                    key={s.id}
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
                      {WEEKDAY_OPTIONS.find((o) => o.value === s.day_of_week)?.label ?? s.day_of_week} тАФ {s.start_time?.slice(0, 5)}тАУ{s.end_time?.slice(0, 5)}
                    </Typography>
                    <Button size="small" color="error" onClick={() => handleRemoveSchedule(s.id)}>
                      Удалить
                    </Button>
                  </Box>
                ))}
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setScheduleOpen(false)}>Закрыть</Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Диалог назначения программы группе */}
      {isAdminLike && (
        <Dialog open={programOpen} onClose={() => setProgramOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Программа для группы: {groupDetails?.name || selectedGroup?.name}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Назначенные программы:
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {(groupDetails?.programs || []).length
                ? (groupDetails?.programs || [])
                    .map((p) => `${p.name} (v${p.version})`)
                    .join(', ')
                : 'тАФ'}
            </Typography>

            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Назначить программу</InputLabel>
              <Select
                value={programToAssignId}
                label="Назначить программу"
                onChange={(e) => setProgramToAssignId(e.target.value)}
              >
                <MenuItem value="">
                  <em>Не выбрана</em>
                </MenuItem>
                {programs.map((p) => (
                  <MenuItem key={p.id} value={p.id.toString()}>
                    {p.name} (v{p.version})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setProgramOpen(false)}>Отмена</Button>
            <Button variant="contained" disabled={!programToAssignId} onClick={handleAssignProgramToGroup}>
              Назначить
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Layout>
  );
};

export default GroupsPage;

