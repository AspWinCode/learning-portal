import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  ToggleButton,
  ToggleButtonGroup,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, ViewKanban as KanbanIcon, Archive as ArchiveIcon } from '@mui/icons-material';
import { projectsApi, tasksApi } from '../services/api';
import { Project } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission } from '../utils/permissions';

const ENTITY_LABELS: Record<string, string> = {
  parent: 'Родители',
  student: 'Ученики',
};

const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [archivedFilter, setArchivedFilter] = useState<boolean>(false);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selected, setSelected] = useState<Project | null>(null);
  const [form, setForm] = useState({
    name: '',
    start_date: '',
    end_date: '',
    description: '',
    entity_type: 'parent' as 'parent' | 'student',
  });
  const [createTask, setCreateTask] = useState<boolean>(false);

  const canCreate = hasPermission(user, 'projects.manage');

  useEffect(() => {
    load();
  }, [archivedFilter]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await projectsApi.list({ archived: archivedFilter });
      setProjects(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка загрузки проектов');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOpen = () => {
    setForm({
      name: '',
      start_date: '',
      end_date: '',
      description: '',
      entity_type: 'parent',
    });
    setCreateTask(false);
    setOpen(true);
    setError('');
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setError('Введите название проекта');
      return;
    }
    try {
      const project = await projectsApi.create({
        name: form.name.trim(),
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        description: form.description || undefined,
        entity_type: form.entity_type,
      });
      if (createTask) {
        try {
          await tasksApi.createTask({
            title: `Необходимо отработать проект ${project.name}`,
            description: project.description || undefined,
          });
        } catch {
          // если задача не создалась — не блокируем создание проекта
        }
      }
      setOpen(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка создания проекта');
    }
  };

  const handleEditOpen = (p: Project) => {
    setSelected(p);
    setForm({
      name: p.name,
      start_date: p.start_date ? p.start_date.slice(0, 10) : '',
      end_date: p.end_date ? p.end_date.slice(0, 10) : '',
      description: p.description || '',
      entity_type: p.entity_type,
    });
    setEditOpen(true);
    setError('');
  };

  const handleEdit = async () => {
    if (!selected) return;
    if (!form.name.trim()) {
      setError('Введите название проекта');
      return;
    }
    try {
      await projectsApi.update(selected.id, {
        name: form.name.trim(),
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        description: form.description || undefined,
      });
      setEditOpen(false);
      setSelected(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка обновления проекта');
    }
  };

  const handleArchiveToggle = async (p: Project) => {
    try {
      await projectsApi.update(p.id, { archived: !p.archived });
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка изменения статуса');
    }
  };

  const openKanban = (p: Project) => {
    navigate(`/projects/${p.id}`);
  };

  return (
    <Layout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4">Проекты</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ToggleButtonGroup
            value={archivedFilter}
            exclusive
            onChange={(_, v) => v !== null && setArchivedFilter(v)}
            size="small"
          >
            <ToggleButton value={false}>Активные</ToggleButton>
            <ToggleButton value={true}>В архиве</ToggleButton>
          </ToggleButtonGroup>
          {canCreate && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateOpen}>
              Создать проект
            </Button>
          )}
        </Box>
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
              <TableCell>Тип</TableCell>
              <TableCell>Даты</TableCell>
              <TableCell>Карточек</TableCell>
              <TableCell>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5}>Загрузка...</TableCell>
              </TableRow>
            ) : projects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>Нет проектов</TableCell>
              </TableRow>
            ) : (
              projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{ENTITY_LABELS[p.entity_type] || p.entity_type}</TableCell>
                  <TableCell>
                    {p.start_date || p.end_date
                      ? `${p.start_date ? p.start_date.slice(0, 10) : '—'} — ${p.end_date ? p.end_date.slice(0, 10) : '—'}`
                      : '—'}
                  </TableCell>
                  <TableCell>{p.card_count ?? 0}</TableCell>
                  <TableCell>
                    <Button size="small" startIcon={<KanbanIcon />} onClick={() => openKanban(p)} sx={{ mr: 1 }}>
                      Канбан
                    </Button>
                    <Button size="small" startIcon={<EditIcon />} onClick={() => handleEditOpen(p)} sx={{ mr: 1 }}>
                      Редактировать
                    </Button>
                    <Button
                      size="small"
                      startIcon={<ArchiveIcon />}
                      color={p.archived ? 'success' : 'warning'}
                      onClick={() => handleArchiveToggle(p)}
                    >
                      {p.archived ? 'Разархивировать' : 'В архив'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Создать проект</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Название проекта *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            sx={{ mt: 2 }}
            required
          />
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Кого добавлять в первый этап</InputLabel>
            <Select
              value={form.entity_type}
              label="Кого добавлять в первый этап"
              onChange={(e) => setForm({ ...form, entity_type: e.target.value as 'parent' | 'student' })}
            >
              <MenuItem value="parent">Родители (все в этап «Новые»)</MenuItem>
              <MenuItem value="student">Ученики (все в этап «Новые»)</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Дата начала"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth
            label="Дата окончания"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth
            label="Описание"
            multiline
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            sx={{ mt: 2 }}
          />
          <FormControlLabel
            sx={{ mt: 1 }}
            control={(
              <Checkbox
                checked={createTask}
                onChange={(e) => setCreateTask(e.target.checked)}
              />
            )}
            label="Поставить в задачи"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={handleCreate} variant="contained">
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Редактировать проект</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Название проекта *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            sx={{ mt: 2 }}
            required
          />
          <TextField
            fullWidth
            label="Дата начала"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth
            label="Дата окончания"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth
            label="Описание"
            multiline
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Отмена</Button>
          <Button onClick={handleEdit} variant="contained">
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default ProjectsPage;
