import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import {
  Typography,
  Box,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { usersApi, groupsApi } from '../services/api';
import { User, Group } from '../types';

const TrainersPage: React.FC = () => {
  const [trainers, setTrainers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [newTrainer, setNewTrainer] = useState({
    full_name: '',
    email: '',
    password: '',
  });

  const loadTrainers = async () => {
    try {
      const data = await usersApi.getAll('trainer');
      setTrainers(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка загрузки тренеров');
    }
  };

  const loadGroups = async () => {
    try {
      const data = await groupsApi.getAll();
      setGroups(data);
    } catch (err) {
      // best-effort
    }
  };

  useEffect(() => {
    loadTrainers();
    loadGroups();
  }, []);

  const handleCreate = async () => {
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
      setOpen(false);
      setNewTrainer({ full_name: '', email: '', password: '' });
      setError('');
      loadTrainers();
      loadGroups();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка создания тренера');
    }
  };

  return (
    <Layout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
        <Typography variant="h4">Тренеры</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setOpen(true);
            setNewTrainer({ full_name: '', email: '', password: '' });
          }}
        >
          Создать тренера
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Paper>
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
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
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
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button onClick={handleCreate} variant="contained">
            Создать
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default TrainersPage;

