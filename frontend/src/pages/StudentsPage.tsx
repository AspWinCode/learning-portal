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
  Chip,
  Stack,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';
import { studentsApi, usersApi, groupsApi, programsApi, abonementsApi } from '../services/api';
import { Student, User, Group, Program, Abonement } from '../types';
import { useAuth } from '../contexts/AuthContext';

const StudentsPage: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [error, setError] = useState('');
  const [newStudent, setNewStudent] = useState({
    full_name: '',
    parent_id: '',
    trainer_id: '',
    group_id: '',
    program_id: '',
    abonement_id: '',
  });
  const [newParent, setNewParent] = useState({
    full_name: '',
    email: '',
    password: '',
  });
  const [newTrainer, setNewTrainer] = useState({
    full_name: '',
    email: '',
    password: '',
  });
  const [parents, setParents] = useState<User[]>([]);
  const [trainers, setTrainers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [abonements, setAbonements] = useState<Abonement[]>([]);
  const { user } = useAuth();
  const isAdminLike = user?.role === 'admin' || user?.role === 'owner';
  const isOwner = user?.role === 'owner';

  useEffect(() => {
    loadStudents();
    if (isAdminLike) {
      loadParents();
      if (!isOwner) {
        loadTrainers();
      }
      loadGroups();
      loadPrograms();
      if (isOwner) {
        loadAbonements();
      }
    }
  }, [user, statusFilter]);

  const loadStudents = async () => {
    try {
      const params = statusFilter === 'all' ? undefined : { status: statusFilter };
      const data = await studentsApi.getAll(params);
      setStudents(data);
    } catch (err) {
      setError('Ошибка загрузки данных');
    }
  };

  const loadParents = async () => {
    try {
      const data = await usersApi.getAll('parent');
      setParents(data);
    } catch (err) {
      console.error('Ошибка загрузки родителей', err);
    }
  };

  const loadTrainers = async () => {
    try {
      const data = await usersApi.getAll('trainer');
      setTrainers(data);
    } catch (err) {
      console.error('Ошибка загрузки тренеров', err);
    }
  };

  const loadGroups = async () => {
    try {
      const data = await groupsApi.getAll();
      // Загружаем полную информацию о каждой группе, включая учеников
      const groupsWithStudents = await Promise.all(
        data
          .filter(g => g.status === 'active')
          .map(async (group) => {
            try {
              const fullGroup = await groupsApi.getById(group.id);
              return fullGroup;
            } catch (err) {
              return group;
            }
          })
      );
      setGroups(groupsWithStudents);
    } catch (err) {
      console.error('Ошибка загрузки групп', err);
    }
  };

  const loadPrograms = async () => {
    try {
      const data = await programsApi.getAll();
      // показываем только активные программы
      setPrograms(data.filter((p) => p.status === 'active'));
    } catch (err) {
      console.error('Ошибка загрузки программ', err);
    }
  };

  const loadAbonements = async () => {
    try {
      const data = await abonementsApi.getAll();
      setAbonements(data);
    } catch (err) {
      console.error('Ошибка загрузки абонементов', err);
    }
  };

  const handleCreate = async () => {
    if (!newStudent.full_name.trim()) {
      setError('Заполните ФИО ученика');
      return;
    }

    try {
      const studentData: any = {
        full_name: newStudent.full_name.trim(),
      };

      // Добавляем parent_id только если он выбран (не пустая строка)
      if (newStudent.parent_id && newStudent.parent_id.trim() !== '') {
        const parentId = parseInt(newStudent.parent_id);
        if (!isNaN(parentId)) {
          studentData.parent_id = parentId;
        }
      }

      if (isOwner && newStudent.abonement_id && newStudent.abonement_id.trim() !== '') {
        const abonementId = parseInt(newStudent.abonement_id);
        if (!isNaN(abonementId)) {
          studentData.abonement_id = abonementId;
        }
      }

      console.log('Отправка данных:', studentData); // Для отладки

      const createdStudent = await studentsApi.create(studentData);

      // Назначаем программу, если выбрана
      if (newStudent.program_id && newStudent.program_id.trim() !== '') {
        try {
          const programId = parseInt(newStudent.program_id);
          if (!isNaN(programId)) {
            await programsApi.assignToStudent(programId, createdStudent.id);
          }
        } catch (err: any) {
          console.error('Ошибка назначения программы', err);
          setError(
            `Ученик создан, но не удалось назначить программу: ${
              err.response?.data?.detail || 'ошибка'
            }`
          );
        }
      }

      // Добавляем в группу, если выбрана
      if (newStudent.group_id && newStudent.group_id.trim() !== '') {
        try {
          const groupId = parseInt(newStudent.group_id);
          if (!isNaN(groupId)) {
            await groupsApi.addStudent(groupId, createdStudent.id);
          }
        } catch (err: any) {
          console.error('Ошибка добавления в группу', err);
          // Не блокируем создание, если не удалось добавить в группу
        }
      }

      setOpen(false);
      setNewStudent({ full_name: '', parent_id: '', trainer_id: '', group_id: '', program_id: '', abonement_id: '' });
      loadStudents();
      loadGroups(); // Перезагружаем группы для обновления списка
    } catch (err: any) {
      console.error('Ошибка создания ученика:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Ошибка создания ученика';
      setError(errorMessage);
    }
  };

  const handleEdit = async (student: Student) => {
    setEditingStudent(student);
    // Находим группу ученика из уже загруженных групп
    const studentGroup = getStudentGroup(student);
    setNewStudent({
      full_name: student.full_name,
      parent_id: student.parent_id?.toString() || '',
      trainer_id: '',
      group_id: studentGroup?.id?.toString() || '',
      program_id: '',
      abonement_id: student.abonement_id?.toString() || '',
    });
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingStudent || !newStudent.full_name) {
      setError('Заполните ФИО ученика');
      return;
    }

    try {
      const updateData: any = {
        full_name: newStudent.full_name,
      };

      if (newStudent.parent_id) {
        updateData.parent_id = parseInt(newStudent.parent_id);
      } else {
        updateData.parent_id = null;
      }

      if (isOwner) {
        if (newStudent.abonement_id) {
          updateData.abonement_id = parseInt(newStudent.abonement_id);
        } else {
          updateData.abonement_id = null;
        }
      }

      await studentsApi.update(editingStudent.id, updateData);

      // Обновление группы
      // Сначала удаляем из всех групп
      const studentGroups = groups.filter(g => 
        g.students?.some(s => s.id === editingStudent.id)
      );
      for (const group of studentGroups) {
        try {
          await groupsApi.removeStudent(group.id, editingStudent.id);
        } catch (err) {
          // Игнорируем ошибки, если ученик не в группе
        }
      }
      
      // Добавляем в новую группу, если выбрана
      if (newStudent.group_id) {
        try {
          await groupsApi.addStudent(parseInt(newStudent.group_id), editingStudent.id);
        } catch (err) {
          console.error('Ошибка добавления в группу', err);
        }
      }
      
      // Перезагружаем группы для обновления списка
      loadGroups();

      setEditOpen(false);
      setEditingStudent(null);
      setNewStudent({ full_name: '', parent_id: '', trainer_id: '', group_id: '', program_id: '', abonement_id: '' });
      loadStudents();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка обновления');
    }
  };

  const getStudentGroup = (student: Student): Group | undefined => {
    if (!student || !groups.length) return undefined;
    return groups.find(g => g.students?.some(s => s.id === student.id));
  };

  const getStudentProgramLabel = (student: Student): string => {
    const direct = (student.programs || []).filter((p) => p.status === 'active');
    if (direct.length) {
      return direct.map((p) => `${p.name} (v${p.version})`).join(', ');
    }
    const g = getStudentGroup(student);
    const gp = (g?.programs || []).filter((p) => p.status === 'active');
    if (gp.length) {
      return gp.map((p) => `${p.name} (v${p.version})`).join(', ') + ' (из группы)';
    }
    return '—';
  };

  const handleAddProgramToStudent = async (studentId: number, programId: number) => {
    try {
      await programsApi.assignToStudent(programId, studentId);
      loadStudents();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка назначения программы');
    }
  };

  const handleRemoveProgramFromStudent = async (studentId: number, programId: number) => {
    try {
      await studentsApi.removeProgram(studentId, programId);
      loadStudents();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка снятия программы');
    }
  };

  const getAbonementForStudent = (student: Student): Abonement | undefined =>
    student.abonement || (student.abonement_id ? abonements.find((a) => a.id === student.abonement_id) : undefined);

  const getDiscountLabel = (ab: Abonement): string => {
    if (ab.discount_type === 'none') return '—';
    if (ab.discount_type === 'percent') return `${ab.discount_value}%`;
    return `${ab.discount_value} ₽`;
  };

  const getPriceWithDiscount = (ab: Abonement): number => {
    if (ab.discount_type === 'none') return ab.price;
    if (ab.discount_type === 'percent') return Math.round(ab.price * (1 - ab.discount_value / 100) * 100) / 100;
    return Math.max(0, ab.price - ab.discount_value);
  };

  const handleAbonementAssign = async (studentId: number, abonementId: string) => {
    try {
      await studentsApi.update(studentId, {
        abonement_id: abonementId ? parseInt(abonementId) : null,
      });
      loadStudents();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка назначения абонемента');
    }
  };

  if (!isAdminLike) {
    return (
      <Layout>
        <Typography variant="h4" gutterBottom>
          Ученики
        </Typography>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ФИО</TableCell>
                <TableCell>Программа</TableCell>
                <TableCell>Статус</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell>{student.full_name}</TableCell>
                  <TableCell>{getStudentProgramLabel(student)}</TableCell>
                  <TableCell>{student.status === 'active' ? 'Активен' : 'Архивирован'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Layout>
    );
  }

  return (
    <Layout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
        <Typography variant="h4">Ученики</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Статус учеников</InputLabel>
            <Select
              value={statusFilter}
              label="Статус учеников"
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <MenuItem value="all">Все</MenuItem>
              <MenuItem value="active">Активные</MenuItem>
              <MenuItem value="archived">Архивированные</MenuItem>
            </Select>
          </FormControl>
          {!isOwner && (
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => {
                setTrainerOpen(true);
                setNewTrainer({ full_name: '', email: '', password: '' });
              }}
            >
              Создать тренера
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => {
              setParentOpen(true);
              setNewParent({ full_name: '', email: '', password: '' });
            }}
          >
            Создать родителя
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setOpen(true);
              setNewStudent({ full_name: '', parent_id: '', trainer_id: '', group_id: '', program_id: '', abonement_id: '' });
            }}
          >
            Добавить ученика
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Typography variant="h5" sx={{ mt: 3, mb: 2 }}>
        Ученики
      </Typography>
      <TableContainer component={Paper} sx={{ mb: 4 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ФИО</TableCell>
              <TableCell>Родитель</TableCell>
              <TableCell>Группа</TableCell>
              <TableCell>Программа</TableCell>
              {isOwner && <TableCell>Абонемент</TableCell>}
              {isOwner && <TableCell>Скидка</TableCell>}
              {isOwner && <TableCell>Итого со скидкой</TableCell>}
              <TableCell>Статус</TableCell>
              <TableCell>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {students.map((student) => {
              const studentGroup = getStudentGroup(student);
              const abonement = getAbonementForStudent(student);
              return (
                <TableRow key={student.id}>
                  <TableCell>{student.full_name}</TableCell>
                  <TableCell>{student.parent?.full_name || '-'}</TableCell>
                  <TableCell>{studentGroup?.name || '-'}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                      {(student.programs || []).filter((p) => p.status === 'active').map((p) => (
                        <Chip
                          key={p.id}
                          size="small"
                          label={`${p.name} (v${p.version})`}
                          onDelete={() => handleRemoveProgramFromStudent(student.id, p.id)}
                        />
                      ))}
                      {(student.programs || []).filter((p) => p.status === 'active').length === 0 && (() => {
                        const g = getStudentGroup(student);
                        const gp = (g?.programs || []).filter((p) => p.status === 'active');
                        if (gp.length) {
                          return (
                            <Typography variant="body2" color="text.secondary">
                              {gp.map((p) => `${p.name} (v${p.version})`).join(', ')} (из группы)
                            </Typography>
                          );
                        }
                        return <Typography variant="body2" color="text.secondary">—</Typography>;
                      })()}
                      <FormControl size="small" sx={{ minWidth: 140 }}>
                        <Select
                          displayEmpty
                          value=""
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v !== '') {
                              handleAddProgramToStudent(student.id, parseInt(v as string));
                            }
                          }}
                          renderValue={() => 'Добавить программу'}
                        >
                          <MenuItem value="">
                            <em>Добавить программу</em>
                          </MenuItem>
                          {programs
                            .filter((p) => p.status === 'active' && !(student.programs || []).some((sp) => sp.id === p.id))
                            .map((p) => (
                              <MenuItem key={p.id} value={p.id.toString()}>
                                {p.name} (версия {p.version})
                              </MenuItem>
                            ))}
                        </Select>
                      </FormControl>
                    </Stack>
                  </TableCell>
                  {isOwner && (
                    <TableCell>
                      <FormControl size="small" fullWidth>
                        <InputLabel>Абонемент</InputLabel>
                        <Select
                          label="Абонемент"
                          value={student.abonement_id?.toString() || ''}
                          onChange={(e) => handleAbonementAssign(student.id, e.target.value)}
                        >
                          <MenuItem value="">
                            <em>Не выбран</em>
                          </MenuItem>
                          {abonements
                            .filter((a) => a.status === 'active')
                            .map((a) => (
                              <MenuItem key={a.id} value={a.id.toString()}>
                                {a.name}
                              </MenuItem>
                            ))}
                        </Select>
                      </FormControl>
                    </TableCell>
                  )}
                  {isOwner && (
                    <TableCell>{abonement ? getDiscountLabel(abonement) : '—'}</TableCell>
                  )}
                  {isOwner && (
                    <TableCell>
                      {abonement ? `${getPriceWithDiscount(abonement).toFixed(2)} ₽` : '—'}
                    </TableCell>
                  )}
                  <TableCell>{student.status === 'active' ? 'Активен' : 'Архивирован'}</TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      startIcon={<EditIcon />}
                      onClick={() => handleEdit(student)}
                      sx={{ mr: 1 }}
                    >
                      Редактировать
                    </Button>
                    {student.status === 'active' ? (
                      <Button
                        size="small"
                        color="warning"
                        onClick={async () => {
                          await studentsApi.archive(student.id);
                          loadStudents();
                        }}
                      >
                        Архивировать
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        color="success"
                        onClick={async () => {
                          await studentsApi.update(student.id, { status: 'active' });
                          loadStudents();
                        }}
                      >
                        Разархивировать
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="h5" sx={{ mt: 3, mb: 2 }}>
        Родители
      </Typography>
      <TableContainer component={Paper} sx={{ mb: 4 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ФИО</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Количество учеников</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {parents.map((parent) => {
              const studentsCount = students.filter(s => s.parent_id === parent.id).length;
              return (
                <TableRow key={parent.id}>
                  <TableCell>{parent.full_name}</TableCell>
                  <TableCell>{parent.email}</TableCell>
                  <TableCell>{parent.is_active ? 'Активен' : 'Неактивен'}</TableCell>
                  <TableCell>{studentsCount}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {!isOwner && (
        <>
          <Typography variant="h5" sx={{ mt: 3, mb: 2 }}>
            Тренеры
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ФИО</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell>Количество групп</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {trainers.map((trainer) => {
                  const groupsCount = groups.filter(g => g.trainer_id === trainer.id).length;
                  return (
                    <TableRow key={trainer.id}>
                      <TableCell>{trainer.full_name}</TableCell>
                      <TableCell>{trainer.email}</TableCell>
                      <TableCell>{trainer.is_active ? 'Активен' : 'Неактивен'}</TableCell>
                      <TableCell>{groupsCount}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Диалог добавления */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Добавить ученика</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="ФИО ученика *"
            value={newStudent.full_name}
            onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })}
            sx={{ mt: 2 }}
            required
          />
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Родитель</InputLabel>
            <Select
              value={newStudent.parent_id}
              label="Родитель"
              onChange={(e) => setNewStudent({ ...newStudent, parent_id: e.target.value })}
            >
              <MenuItem value="">
                <em>Не выбран</em>
              </MenuItem>
              {parents.map((parent) => (
                <MenuItem key={parent.id} value={parent.id.toString()}>
                  {parent.full_name} ({parent.email})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Группа</InputLabel>
            <Select
              value={newStudent.group_id}
              label="Группа"
              onChange={(e) => setNewStudent({ ...newStudent, group_id: e.target.value })}
            >
              <MenuItem value="">
                <em>Не выбрана</em>
              </MenuItem>
              {groups.map((group) => (
                <MenuItem key={group.id} value={group.id.toString()}>
                  {group.name} (Тренер: {group.trainer?.full_name || '-'})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Программа</InputLabel>
            <Select
              value={newStudent.program_id}
              label="Программа"
              onChange={(e) => setNewStudent({ ...newStudent, program_id: e.target.value })}
            >
              <MenuItem value="">
                <em>Не выбрана</em>
              </MenuItem>
              {programs.map((program) => (
                <MenuItem key={program.id} value={program.id.toString()}>
                  {program.name} (версия {program.version})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {isOwner && (
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Абонемент</InputLabel>
              <Select
                value={newStudent.abonement_id}
                label="Абонемент"
                onChange={(e) => setNewStudent({ ...newStudent, abonement_id: e.target.value })}
              >
                <MenuItem value="">
                  <em>Не выбран</em>
                </MenuItem>
                {abonements
                  .filter((a) => a.status === 'active')
                  .map((a) => (
                    <MenuItem key={a.id} value={a.id.toString()}>
                      {a.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={handleCreate} variant="contained">
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог редактирования */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Редактировать ученика</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="ФИО ученика *"
            value={newStudent.full_name}
            onChange={(e) => setNewStudent({ ...newStudent, full_name: e.target.value })}
            sx={{ mt: 2 }}
            required
          />
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Родитель</InputLabel>
            <Select
              value={newStudent.parent_id}
              label="Родитель"
              onChange={(e) => setNewStudent({ ...newStudent, parent_id: e.target.value })}
            >
              <MenuItem value="">
                <em>Не выбран</em>
              </MenuItem>
              {parents.map((parent) => (
                <MenuItem key={parent.id} value={parent.id.toString()}>
                  {parent.full_name} ({parent.email})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Группа</InputLabel>
            <Select
              value={newStudent.group_id || getStudentGroup(editingStudent!)?.id?.toString() || ''}
              label="Группа"
              onChange={(e) => setNewStudent({ ...newStudent, group_id: e.target.value })}
            >
              <MenuItem value="">
                <em>Не выбрана</em>
              </MenuItem>
              {groups.map((group) => (
                <MenuItem key={group.id} value={group.id.toString()}>
                  {group.name} (Тренер: {group.trainer?.full_name || '-'})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Программы ученика</Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            {((students.find((s) => s.id === editingStudent?.id) || editingStudent)?.programs || [])
              .filter((p) => p.status === 'active')
              .map((p) => (
                <Chip
                  key={p.id}
                  size="small"
                  label={`${p.name} (v${p.version})`}
                  onDelete={() => {
                    if (editingStudent) {
                      handleRemoveProgramFromStudent(editingStudent.id, p.id);
                    }
                  }}
                />
              ))}
          </Stack>
          <FormControl size="small" fullWidth sx={{ mt: 0 }}>
            <InputLabel>Добавить программу</InputLabel>
            <Select
              value=""
              label="Добавить программу"
              onChange={(e) => {
                const v = e.target.value;
                if (v !== '' && editingStudent) {
                  handleAddProgramToStudent(editingStudent.id, parseInt(v as string));
                }
              }}
            >
              <MenuItem value="">
                <em>Выберите программу</em>
              </MenuItem>
              {programs
                .filter(
                  (p) =>
                    p.status === 'active' &&
                    !((students.find((s) => s.id === editingStudent?.id) || editingStudent)?.programs || []).some(
                      (sp) => sp.id === p.id
                    )
                )
                .map((p) => (
                  <MenuItem key={p.id} value={p.id.toString()}>
                    {p.name} (версия {p.version})
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
          {isOwner && (
            <FormControl fullWidth sx={{ mt: 2 }}>
              <InputLabel>Абонемент</InputLabel>
              <Select
                value={newStudent.abonement_id}
                label="Абонемент"
                onChange={(e) => setNewStudent({ ...newStudent, abonement_id: e.target.value })}
              >
                <MenuItem value="">
                  <em>Не выбран</em>
                </MenuItem>
                {abonements
                  .filter((a) => a.status === 'active')
                  .map((a) => (
                    <MenuItem key={a.id} value={a.id.toString()}>
                      {a.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Отмена</Button>
          <Button onClick={handleUpdate} variant="contained">
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог создания родителя */}
      <Dialog open={parentOpen} onClose={() => setParentOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Создать родителя</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="ФИО родителя *"
            value={newParent.full_name}
            onChange={(e) => setNewParent({ ...newParent, full_name: e.target.value })}
            sx={{ mt: 2 }}
            required
          />
          <TextField
            fullWidth
            label="Email *"
            type="email"
            value={newParent.email}
            onChange={(e) => setNewParent({ ...newParent, email: e.target.value })}
            sx={{ mt: 2 }}
            required
          />
          <TextField
            fullWidth
            label="Пароль *"
            type="password"
            value={newParent.password}
            onChange={(e) => setNewParent({ ...newParent, password: e.target.value })}
            sx={{ mt: 2 }}
            required
            helperText="Минимум 6 символов"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setParentOpen(false)}>Отмена</Button>
          <Button
            onClick={async () => {
              if (!newParent.full_name.trim() || !newParent.email.trim() || !newParent.password.trim()) {
                setError('Заполните все поля');
                return;
              }
              if (newParent.password.length < 6) {
                setError('Пароль должен быть минимум 6 символов');
                return;
              }
              try {
                await usersApi.create({
                  full_name: newParent.full_name.trim(),
                  email: newParent.email.trim(),
                  password: newParent.password,
                  role: 'parent',
                });
                setParentOpen(false);
                setNewParent({ full_name: '', email: '', password: '' });
                setError('');
                loadParents(); // Обновляем список родителей
              } catch (err: any) {
                setError(err.response?.data?.detail || 'Ошибка создания родителя');
              }
            }}
            variant="contained"
          >
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      {!isOwner && (
        <Dialog open={trainerOpen} onClose={() => setTrainerOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Создать тренера</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label="ФИО тренера *"
              value={newTrainer.full_name}
              onChange={(e) => setNewTrainer({ ...newTrainer, full_name: e.target.value })}
              sx={{ mt: 2 }}
              required
            />
            <TextField
              fullWidth
              label="Email *"
              type="email"
              value={newTrainer.email}
              onChange={(e) => setNewTrainer({ ...newTrainer, email: e.target.value })}
              sx={{ mt: 2 }}
              required
            />
            <TextField
              fullWidth
              label="Пароль *"
              type="password"
              value={newTrainer.password}
              onChange={(e) => setNewTrainer({ ...newTrainer, password: e.target.value })}
              sx={{ mt: 2 }}
              required
              helperText="Минимум 6 символов"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTrainerOpen(false)}>Отмена</Button>
            <Button
              onClick={async () => {
                if (!newTrainer.full_name.trim() || !newTrainer.email.trim() || !newTrainer.password.trim()) {
                  setError('Заполните все поля');
                  return;
                }
                if (newTrainer.password.length < 6) {
                  setError('Пароль должен быть минимум 6 символов');
                  return;
                }
                try {
                  await usersApi.create({
                    full_name: newTrainer.full_name.trim(),
                    email: newTrainer.email.trim(),
                    password: newTrainer.password,
                    role: 'trainer',
                  });
                  setTrainerOpen(false);
                  setNewTrainer({ full_name: '', email: '', password: '' });
                  setError('');
                  loadTrainers(); // Обновляем список тренеров
                  loadGroups(); // Обновляем группы, так как там может быть новый тренер
                } catch (err: any) {
                  setError(err.response?.data?.detail || 'Ошибка создания тренера');
                }
              }}
              variant="contained"
            >
              Создать
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Layout>
  );
};

export default StudentsPage;
