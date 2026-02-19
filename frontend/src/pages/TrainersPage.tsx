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

const toNumber = (value: string) => {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

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
  const [trainerRates, setTrainerRates] = useState<Record<number, number>>({});
  const [trainerLessons, setTrainerLessons] = useState<Record<number, number>>({});

  const loadTrainers = async () => {
    try {
      const data = await usersApi.getAll('trainer');
      setTrainers(data);
      setTrainerRates(
        data.reduce<Record<number, number>>((acc, trainer) => {
          acc[trainer.id] = trainer.trainer_rate ?? 0;
          return acc;
        }, {})
      );
      setTrainerLessons(
        data.reduce<Record<number, number>>((acc, trainer) => {
          acc[trainer.id] = trainer.trainer_lessons ?? 0;
          return acc;
        }, {})
      );
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

  const handleSaveCompensation = async (trainerId: number) => {
    try {
      await usersApi.update(trainerId, {
        trainer_rate: trainerRates[trainerId] ?? 0,
        trainer_lessons: trainerLessons[trainerId] ?? 0,
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка сохранения ставки');
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
              <TableCell>Ставка тренера</TableCell>
              <TableCell>Количество занятий</TableCell>
              <TableCell>Оплата за месяц</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Количество групп</TableCell>
              <TableCell>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {trainers.map((trainer) => {
              const groupsCount = groups.filter(g => g.trainer_id === trainer.id).length;
              const rate = trainerRates[trainer.id] ?? 0;
              const lessons = trainerLessons[trainer.id] ?? 0;
              const payment = rate * lessons;
              return (
                <TableRow key={trainer.id}>
                  <TableCell>{trainer.full_name}</TableCell>
                  <TableCell>{trainer.email}</TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      value={rate}
                      onChange={(e) =>
                        setTrainerRates((prev) => ({
                          ...prev,
                          [trainer.id]: toNumber(e.target.value),
                        }))
                      }
                      onBlur={() => handleSaveCompensation(trainer.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      value={lessons}
                      onChange={(e) =>
                        setTrainerLessons((prev) => ({
                          ...prev,
                          [trainer.id]: toNumber(e.target.value),
                        }))
                      }
                      onBlur={() => handleSaveCompensation(trainer.id)}
                    />
                  </TableCell>
                  <TableCell>{payment.toFixed(2)}</TableCell>
                  <TableCell>{trainer.is_active ? 'Активен' : 'Неактивен'}</TableCell>
                  <TableCell>{groupsCount}</TableCell>
                  <TableCell>
                    {trainer.is_active ? (
                      <Button
                        size="small"
                        color="warning"
                        onClick={async () => {
                          try {
                            await usersApi.update(trainer.id, { is_active: false });
                            loadTrainers();
                          } catch (err: any) {
                            setError(err.response?.data?.detail || 'Ошибка архивации тренера');
                          }
                        }}
                      >
                        Архивировать
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        color="success"
                        onClick={async () => {
                          try {
                            await usersApi.update(trainer.id, { is_active: true });
                            loadTrainers();
                          } catch (err: any) {
                            setError(err.response?.data?.detail || 'Ошибка разархивации тренера');
                          }
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

