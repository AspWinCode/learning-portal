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
    { value: 0, label: '╨Я╨╛╨╜╨╡╨┤╨╡╨╗╤М╨╜╨╕╨║' },
    { value: 1, label: '╨Т╤В╨╛╤А╨╜╨╕╨║' },
    { value: 2, label: '╨б╤А╨╡╨┤╨░' },
    { value: 3, label: '╨з╨╡╤В╨▓╨╡╤А╨│' },
    { value: 4, label: '╨Я╤П╤В╨╜╨╕╤Ж╨░' },
    { value: 5, label: '╨б╤Г╨▒╨▒╨╛╤В╨░' },
    { value: 6, label: '╨Т╨╛╤Б╨║╤А╨╡╤Б╨╡╨╜╤М╨╡' },
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
      // ╨Ф╨╗╤П ╤В╤А╨╡╨╜╨╡╤А╨░ ╨┐╨╛╨┤╤В╤П╨│╨╕╨▓╨░╨╡╨╝ ╨┐╨╛╨╗╨╜╤Л╨╡ ╨┤╨░╨╜╨╜╤Л╨╡ ╨│╤А╤Г╨┐╨┐╤Л (╨▓╨║╨╗╤О╤З╨░╤П ╤Г╤З╨╡╨╜╨╕╨║╨╛╨▓), ╤З╤В╨╛╨▒╤Л ╨┐╨╛╨║╨░╨╖╨░╤В╤М ╤Б╤З╨╡╤В╤З╨╕╨║ ╨╕ ╤Б╨╛╤Б╤В╨░╨▓
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
      console.error('╨Ю╤И╨╕╨▒╨║╨░ ╨╖╨░╨│╤А╤Г╨╖╨║╨╕ ╨│╤А╤Г╨┐╨┐', err);
    }
  };

  const loadTrainers = async () => {
    try {
      const data = await usersApi.getAll('trainer');
      setTrainers(data.filter(t => t.is_active));
    } catch (err) {
      console.error('╨Ю╤И╨╕╨▒╨║╨░ ╨╖╨░╨│╤А╤Г╨╖╨║╨╕ ╤В╤А╨╡╨╜╨╡╤А╨╛╨▓', err);
    }
  };

  const loadStudents = async () => {
    try {
      const data = await studentsApi.getAll({ status: 'active' });
      setStudents(data);
    } catch (err) {
      console.error('╨Ю╤И╨╕╨▒╨║╨░ ╨╖╨░╨│╤А╤Г╨╖╨║╨╕ ╤Г╤З╨╡╨╜╨╕╨║╨╛╨▓', err);
    }
  };

  const loadPrograms = async () => {
    try {
      const data = await programsApi.getAll();
      setPrograms(data.filter((p) => p.status === 'active'));
    } catch (err) {
      console.error('╨Ю╤И╨╕╨▒╨║╨░ ╨╖╨░╨│╤А╤Г╨╖╨║╨╕ ╨┐╤А╨╛╨│╤А╨░╨╝╨╝', err);
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
      setError('╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨╖╨░╨│╤А╤Г╨╖╨╕╤В╤М ╤А╨░╤Б╨┐╨╕╤Б╨░╨╜╨╕╨╡');
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
      setError('╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨┤╨╛╨▒╨░╨▓╨╕╤В╤М ╤Б╨╗╨╛╤В ╤А╨░╤Б╨┐╨╕╤Б╨░╨╜╨╕╤П');
    }
  };

  const handleRemoveSchedule = async (scheduleId: number) => {
    if (!selectedGroup) return;
    setError('');
    try {
      await groupsApi.removeSchedule(selectedGroup.id, scheduleId);
      setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
    } catch (err) {
      setError('╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╤Г╨┤╨░╨╗╨╕╤В╤М ╤Б╨╗╨╛╤В');
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
      setError(err.response?.data?.detail || '╨Ю╤И╨╕╨▒╨║╨░ ╨╖╨░╨│╤А╤Г╨╖╨║╨╕ ╨│╤А╤Г╨┐╨┐╤Л');
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
      setError(err.response?.data?.detail || '╨Ю╤И╨╕╨▒╨║╨░ ╨╖╨░╨│╤А╤Г╨╖╨║╨╕ ╨│╤А╤Г╨┐╨┐╤Л');
    }
  };

  const handleCreate = async () => {
    if (!newGroup.name.trim()) {
      setError('╨Ч╨░╨┐╨╛╨╗╨╜╨╕╤В╨╡ ╨╜╨░╨╖╨▓╨░╨╜╨╕╨╡ ╨│╤А╤Г╨┐╨┐╤Л');
      return;
    }
    if (!newGroup.trainer_id) {
      setError('╨Т╤Л╨▒╨╡╤А╨╕╤В╨╡ ╤В╤А╨╡╨╜╨╡╤А╨░');
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
      setError(err.response?.data?.detail || '╨Ю╤И╨╕╨▒╨║╨░ ╤Б╨╛╨╖╨┤╨░╨╜╨╕╤П ╨│╤А╤Г╨┐╨┐╤Л');
    }
  };

  const handleUpdate = async () => {
    if (!selectedGroup) return;
    if (!newGroup.name.trim()) {
      setError('╨Ч╨░╨┐╨╛╨╗╨╜╨╕╤В╨╡ ╨╜╨░╨╖╨▓╨░╨╜╨╕╨╡ ╨│╤А╤Г╨┐╨┐╤Л');
      return;
    }
    if (!newGroup.trainer_id) {
      setError('╨Т╤Л╨▒╨╡╤А╨╕╤В╨╡ ╤В╤А╨╡╨╜╨╡╤А╨░');
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
      setError(err.response?.data?.detail || '╨Ю╤И╨╕╨▒╨║╨░ ╨╛╨▒╨╜╨╛╨▓╨╗╨╡╨╜╨╕╤П ╨│╤А╤Г╨┐╨┐╤Л');
    }
  };

  const handleArchiveToggle = async (group: Group) => {
    try {
      const nextStatus = group.status === 'active' ? 'archived' : 'active';
      await groupsApi.update(group.id, { status: nextStatus } as any);
      loadGroups();
    } catch (err: any) {
      setError(err.response?.data?.detail || '╨Ю╤И╨╕╨▒╨║╨░ ╨╕╨╖╨╝╨╡╨╜╨╡╨╜╨╕╤П ╤Б╤В╨░╤В╤Г╤Б╨░ ╨│╤А╤Г╨┐╨┐╤Л');
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
      setError(err.response?.data?.detail || '╨Ю╤И╨╕╨▒╨║╨░ ╨┤╨╛╨▒╨░╨▓╨╗╨╡╨╜╨╕╤П ╤Г╤З╨╡╨╜╨╕╨║╨░ ╨▓ ╨│╤А╤Г╨┐╨┐╤Г');
    }
  };

  const handleRemoveStudentFromGroup = async (studentId: number) => {
    if (!selectedGroup) return;
    try {
      await groupsApi.removeStudent(selectedGroup.id, studentId);
      const fullGroup = await groupsApi.getById(selectedGroup.id);
      setGroupDetails(fullGroup);
    } catch (err: any) {
      setError(err.response?.data?.detail || '╨Ю╤И╨╕╨▒╨║╨░ ╤Г╨┤╨░╨╗╨╡╨╜╨╕╤П ╤Г╤З╨╡╨╜╨╕╨║╨░ ╨╕╨╖ ╨│╤А╤Г╨┐╨┐╤Л');
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
      setError(err.response?.data?.detail || '╨Ю╤И╨╕╨▒╨║╨░ ╨╜╨░╨╖╨╜╨░╤З╨╡╨╜╨╕╤П ╨┐╤А╨╛╨│╤А╨░╨╝╨╝╤Л ╨│╤А╤Г╨┐╨┐╨╡');
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
        <Typography variant="h4">╨У╤А╤Г╨┐╨┐╤Л</Typography>
        {isAdminLike && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setOpen(true);
              setNewGroup({ name: '', trainer_id: '' });
            }}
          >
            ╨б╨╛╨╖╨┤╨░╤В╤М ╨│╤А╤Г╨┐╨┐╤Г
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
              <TableCell>╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡</TableCell>
              <TableCell>╨в╤А╨╡╨╜╨╡╤А</TableCell>
              <TableCell>╨г╤З╨╡╨╜╨╕╨║╨╕</TableCell>
              <TableCell>╨Я╤А╨╛╨│╤А╨░╨╝╨╝╨░</TableCell>
              <TableCell>╨б╤В╨░╤В╤Г╤Б</TableCell>
              {(isAdminLike || user?.role === 'trainer') && <TableCell>╨Ф╨╡╨╣╤Б╤В╨▓╨╕╤П</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.map((group) => (
              <TableRow key={group.id}>
                <TableCell>{group.name}</TableCell>
                <TableCell>{group.trainer?.full_name || '-'}</TableCell>
                <TableCell>{group.students?.length ?? '-'}</TableCell>
                <TableCell>{renderPrograms(group)}</TableCell>
                <TableCell>{group.status === 'active' ? '╨Р╨║╤В╨╕╨▓╨╜╨░' : '╨Р╤А╤Е╨╕╨▓╨╕╤А╨╛╨▓╨░╨╜╨░'}</TableCell>
                {(isAdminLike || user?.role === 'trainer') && (
                  <TableCell>
                    <Button
                      size="small"
                      startIcon={<PeopleIcon />}
                      onClick={() => openMembersDialog(group)}
                      sx={{ mr: 1 }}
                    >
                      ╨б╨╛╤Б╤В╨░╨▓
                    </Button>
                    {isAdminLike && (
                      <Button
                        size="small"
                        startIcon={<ScheduleIcon />}
                        onClick={() => openScheduleDialog(group)}
                        sx={{ mr: 1 }}
                      >
                        ╨а╨░╤Б╨┐╨╕╤Б╨░╨╜╨╕╨╡
                      </Button>
                    )}
                    {isAdminLike && (
                      <Button
                        size="small"
                        startIcon={<BookIcon />}
                        onClick={() => openProgramDialog(group)}
                        sx={{ mr: 1 }}
                      >
                        ╨Я╤А╨╛╨│╤А╨░╨╝╨╝╨░
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
                          ╨а╨╡╨┤╨░╨║╤В╨╕╤А╨╛╨▓╨░╤В╤М
                        </Button>
                        <Button
                          size="small"
                          color={group.status === 'active' ? 'warning' : 'success'}
                          onClick={() => handleArchiveToggle(group)}
                        >
                          {group.status === 'active' ? '╨Р╤А╤Е╨╕╨▓╨╕╤А╨╛╨▓╨░╤В╤М' : '╨а╨░╨╖╨░╤А╤Е╨╕╨▓╨╕╤А╨╛╨▓╨░╤В╤М'}
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

      {/* ╨Ф╨╕╨░╨╗╨╛╨│ ╤Б╨╛╨╖╨┤╨░╨╜╨╕╤П ╨│╤А╤Г╨┐╨┐╤Л */}
      {isAdminLike && (
        <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>╨б╨╛╨╖╨┤╨░╤В╤М ╨│╤А╤Г╨┐╨┐╤Г</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label="╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡ ╨│╤А╤Г╨┐╨┐╤Л *"
              value={newGroup.name}
              onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
              sx={{ mt: 2 }}
              required
            />
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>╨в╤А╨╡╨╜╨╡╤А *</InputLabel>
              <Select
                value={newGroup.trainer_id}
                label="╨в╤А╨╡╨╜╨╡╤А"
                onChange={(e) => setNewGroup({ ...newGroup, trainer_id: e.target.value })}
                required
              >
                <MenuItem value="">
                  <em>╨Э╨╡ ╨▓╤Л╨▒╤А╨░╨╜</em>
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
            <Button onClick={() => setOpen(false)}>╨Ю╤В╨╝╨╡╨╜╨░</Button>
            <Button onClick={handleCreate} variant="contained">
              ╨б╨╛╨╖╨┤╨░╤В╤М
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* ╨Ф╨╕╨░╨╗╨╛╨│ ╤А╨╡╨┤╨░╨║╤В╨╕╤А╨╛╨▓╨░╨╜╨╕╤П ╨│╤А╤Г╨┐╨┐╤Л */}
      {isAdminLike && (
        <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>╨а╨╡╨┤╨░╨║╤В╨╕╤А╨╛╨▓╨░╤В╤М ╨│╤А╤Г╨┐╨┐╤Г</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label="╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡ ╨│╤А╤Г╨┐╨┐╤Л *"
              value={newGroup.name}
              onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
              sx={{ mt: 2 }}
              required
            />
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>╨в╤А╨╡╨╜╨╡╤А *</InputLabel>
              <Select
                value={newGroup.trainer_id}
                label="╨в╤А╨╡╨╜╨╡╤А"
                onChange={(e) => setNewGroup({ ...newGroup, trainer_id: e.target.value })}
                required
              >
                <MenuItem value="">
                  <em>╨Э╨╡ ╨▓╤Л╨▒╤А╨░╨╜</em>
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
            <Button onClick={() => setEditOpen(false)}>╨Ю╤В╨╝╨╡╨╜╨░</Button>
            <Button onClick={handleUpdate} variant="contained">
              ╨б╨╛╤Е╤А╨░╨╜╨╕╤В╤М
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* ╨Ф╨╕╨░╨╗╨╛╨│ ╤Б╨╛╤Б╤В╨░╨▓╨░ ╨│╤А╤Г╨┐╨┐╤Л */}
      {(isAdminLike || user?.role === 'trainer') && (
        <Dialog open={membersOpen} onClose={() => setMembersOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>╨б╨╛╤Б╤В╨░╨▓ ╨│╤А╤Г╨┐╨┐╤Л: {groupDetails?.name || selectedGroup?.name}</DialogTitle>
          <DialogContent>
            {isAdminLike && (
              <>
                <FormControl fullWidth sx={{ mt: 2 }}>
                  <InputLabel>╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М ╤Г╤З╨╡╨╜╨╕╨║╨░</InputLabel>
                  <Select
                    value={studentToAddId}
                    label="╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М ╤Г╤З╨╡╨╜╨╕╨║╨░"
                    onChange={(e) => setStudentToAddId(e.target.value)}
                  >
                    <MenuItem value="">
                      <em>╨Э╨╡ ╨▓╤Л╨▒╤А╨░╨╜</em>
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
                  ╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М ╨▓ ╨│╤А╤Г╨┐╨┐╤Г
                </Button>
              </>
            )}

            <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>
              ╨г╤З╨╡╨╜╨╕╨║╨╕ ╨▓ ╨│╤А╤Г╨┐╨┐╨╡
            </Typography>
            {(groupDetails?.students || []).length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                ╨Т ╨│╤А╤Г╨┐╨┐╨╡ ╨┐╨╛╨║╨░ ╨╜╨╡╤В ╤Г╤З╨╡╨╜╨╕╨║╨╛╨▓.
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
                        {s.status === 'active' ? '╨Р╨║╤В╨╕╨▓╨╡╨╜' : '╨Р╤А╤Е╨╕╨▓╨╕╤А╨╛╨▓╨░╨╜'}
                      </Typography>
                    </Box>
                    {isAdminLike && (
                      <Button
                        size="small"
                        color="error"
                        onClick={() => handleRemoveStudentFromGroup(s.id)}
                      >
                        ╨г╨┤╨░╨╗╨╕╤В╤М
                      </Button>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setMembersOpen(false)}>╨Ч╨░╨║╤А╤Л╤В╤М</Button>
          </DialogActions>
        </Dialog>
      )}

      {/* ╨Ф╨╕╨░╨╗╨╛╨│ ╤А╨░╤Б╨┐╨╕╤Б╨░╨╜╨╕╤П ╨│╤А╤Г╨┐╨┐╤Л тАФ ╤В╨╛╨╗╤М╨║╨╛ ╨░╨┤╨╝╨╕╨╜/owner ╨╝╨╛╨│╤Г╤В ╨┤╨╛╨▒╨░╨▓╨╗╤П╤В╤М ╨╕ ╤Г╨┤╨░╨╗╤П╤В╤М ╤Б╨╗╨╛╤В╤Л */}
      {isAdminLike && (
        <Dialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>╨а╨░╤Б╨┐╨╕╤Б╨░╨╜╨╕╨╡: {selectedGroup?.name}</DialogTitle>
          <DialogContent>
            {error && (
              <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError('')}>
                {error}
              </Alert>
            )}
            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              ╨б╨╗╨╛╤В╤Л ╤А╨░╤Б╨┐╨╕╤Б╨░╨╜╨╕╤П (╨┤╨╡╨╜╤М ╨╜╨╡╨┤╨╡╨╗╨╕ ╨╕ ╨▓╤А╨╡╨╝╤П). ╨Ч╨░╨╜╤П╤В╨╕╤П ╨┐╨╛╤П╨▓╤П╤В╤Б╤П ╨▓╨╛ ╨▓╨║╨╗╨░╨┤╨║╨╡ ┬л╨г╤А╨╛╨║╨╕┬╗ ╤Г ╤В╤А╨╡╨╜╨╡╤А╨░.
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }} useFlexGap flexWrap="wrap">
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>╨Ф╨╡╨╜╤М</InputLabel>
                <Select
                  value={newSchedule.day_of_week}
                  label="╨Ф╨╡╨╜╤М"
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
                label="╨Э╨░╤З╨░╨╗╨╛"
                type="time"
                InputLabelProps={{ shrink: true }}
                value={newSchedule.start_time}
                onChange={(e) => setNewSchedule({ ...newSchedule, start_time: e.target.value })}
                sx={{ width: 120 }}
              />
              <TextField
                size="small"
                label="╨Ъ╨╛╨╜╨╡╤Ж"
                type="time"
                InputLabelProps={{ shrink: true }}
                value={newSchedule.end_time}
                onChange={(e) => setNewSchedule({ ...newSchedule, end_time: e.target.value })}
                sx={{ width: 120 }}
              />
              <Button variant="outlined" onClick={handleAddSchedule}>
                ╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М
              </Button>
            </Stack>
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
              ╨в╨╡╨║╤Г╤Й╨╕╨╡ ╤Б╨╗╨╛╤В╤Л
            </Typography>
            {schedules.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                ╨Э╨╡╤В ╤Б╨╗╨╛╤В╨╛╨▓. ╨Ф╨╛╨▒╨░╨▓╤М╤В╨╡ ╤Б╨╗╨╛╤В ╨▓╤Л╤И╨╡.
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
                      ╨г╨┤╨░╨╗╨╕╤В╤М
                    </Button>
                  </Box>
                ))}
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setScheduleOpen(false)}>╨Ч╨░╨║╤А╤Л╤В╤М</Button>
          </DialogActions>
        </Dialog>
      )}

      {/* ╨Ф╨╕╨░╨╗╨╛╨│ ╨╜╨░╨╖╨╜╨░╤З╨╡╨╜╨╕╤П ╨┐╤А╨╛╨│╤А╨░╨╝╨╝╤Л ╨│╤А╤Г╨┐╨┐╨╡ */}
      {isAdminLike && (
        <Dialog open={programOpen} onClose={() => setProgramOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>╨Я╤А╨╛╨│╤А╨░╨╝╨╝╨░ ╨┤╨╗╤П ╨│╤А╤Г╨┐╨┐╤Л: {groupDetails?.name || selectedGroup?.name}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              ╨Э╨░╨╖╨╜╨░╤З╨╡╨╜╨╜╤Л╨╡ ╨┐╤А╨╛╨│╤А╨░╨╝╨╝╤Л:
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {(groupDetails?.programs || []).length
                ? (groupDetails?.programs || [])
                    .map((p) => `${p.name} (v${p.version})`)
                    .join(', ')
                : 'тАФ'}
            </Typography>

            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>╨Э╨░╨╖╨╜╨░╤З╨╕╤В╤М ╨┐╤А╨╛╨│╤А╨░╨╝╨╝╤Г</InputLabel>
              <Select
                value={programToAssignId}
                label="╨Э╨░╨╖╨╜╨░╤З╨╕╤В╤М ╨┐╤А╨╛╨│╤А╨░╨╝╨╝╤Г"
                onChange={(e) => setProgramToAssignId(e.target.value)}
              >
                <MenuItem value="">
                  <em>╨Э╨╡ ╨▓╤Л╨▒╤А╨░╨╜╨░</em>
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
            <Button onClick={() => setProgramOpen(false)}>╨Ю╤В╨╝╨╡╨╜╨░</Button>
            <Button variant="contained" disabled={!programToAssignId} onClick={handleAssignProgramToGroup}>
              ╨Э╨░╨╖╨╜╨░╤З╨╕╤В╤М
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Layout>
  );
};

export default GroupsPage;

