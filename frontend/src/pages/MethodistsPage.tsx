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
  Chip,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { usersApi, adminToolsApi } from '../services/api';
import { User } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission } from '../utils/permissions';

export default function MethodistsPage() {
  const { user: currentUser } = useAuth();
  const canManageUsers = hasPermission(currentUser, 'users.manage');

  const [methodists, setMethodists] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [resetPasswordInfo, setResetPasswordInfo] = useState<{ user: User; password: string } | null>(null);

  const [newMethodist, setNewMethodist] = useState({ full_name: '', email: '', password: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const all = await usersApi.getAll('methodist');
      setMethodists(all);
    } catch {
      setError('Не удалось загрузить список методистов');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newMethodist.full_name.trim() || !newMethodist.email.trim() || !newMethodist.password.trim()) {
      setCreateError('Заполните ФИО, email и пароль');
      return;
    }
    if (newMethodist.password.length < 6) {
      setCreateError('Пароль минимум 6 символов');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      await usersApi.create({ ...newMethodist, role: 'methodist' });
      setOpen(false);
      setNewMethodist({ full_name: '', email: '', password: '' });
      load();
    } catch (err: any) {
      setCreateError(err?.response?.data?.detail || 'Ошибка создания методиста');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (m: User) => {
    try {
      await usersApi.update(m.id, { is_active: !m.is_active });
      load();
    } catch {
      setError('Ошибка изменения статуса');
    }
  };

  const handleResetPassword = async (m: User) => {
    try {
      const res = await adminToolsApi.resetUserPassword(m.id);
      setResetPasswordInfo({ user: m, password: res.temporary_password });
    } catch {
      setError('Не удалось сбросить пароль');
    }
  };

  return (
    <Layout>
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h5">Методисты</Typography>
          {canManageUsers && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
              Добавить методиста
            </Button>
          )}
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Paper>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ФИО</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Статус</TableCell>
                {canManageUsers && <TableCell>Действия</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={canManageUsers ? 4 : 3} align="center">Загрузка...</TableCell>
                </TableRow>
              ) : methodists.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManageUsers ? 4 : 3} align="center">Нет методистов</TableCell>
                </TableRow>
              ) : methodists.map((m) => (
                <TableRow key={m.id} hover>
                  <TableCell>{m.full_name}</TableCell>
                  <TableCell>{m.email}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={m.is_active ? 'Активен' : 'Архив'}
                      color={m.is_active ? 'success' : 'default'}
                    />
                  </TableCell>
                  {canManageUsers && (
                    <TableCell>
                      <Button
                        size="small"
                        sx={{ mr: 1 }}
                        onClick={() => handleResetPassword(m)}
                      >
                        Сбросить пароль
                      </Button>
                      <Button
                        size="small"
                        color={m.is_active ? 'warning' : 'success'}
                        onClick={() => handleToggleActive(m)}
                      >
                        {m.is_active ? 'Архивировать' : 'Восстановить'}
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        {/* Create dialog */}
        <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Добавить методиста</DialogTitle>
          <DialogContent>
            {createError && <Alert severity="error" sx={{ mt: 1, mb: 1 }}>{createError}</Alert>}
            <TextField
              fullWidth label="ФИО *" value={newMethodist.full_name}
              onChange={(e) => setNewMethodist({ ...newMethodist, full_name: e.target.value })}
              sx={{ mt: 2 }}
            />
            <TextField
              fullWidth label="Email *" type="email" value={newMethodist.email}
              onChange={(e) => setNewMethodist({ ...newMethodist, email: e.target.value })}
              sx={{ mt: 2 }}
            />
            <TextField
              fullWidth label="Пароль *" type="password" value={newMethodist.password}
              onChange={(e) => setNewMethodist({ ...newMethodist, password: e.target.value })}
              sx={{ mt: 2 }}
              helperText="Минимум 6 символов"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Отмена</Button>
            <Button
              variant="contained"
              onClick={handleCreate}
              disabled={creating || !newMethodist.full_name || !newMethodist.email || !newMethodist.password}
            >
              {creating ? 'Создание...' : 'Создать'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Reset password result */}
        {resetPasswordInfo && (
          <Dialog open onClose={() => setResetPasswordInfo(null)} maxWidth="xs" fullWidth>
            <DialogTitle>Новый пароль</DialogTitle>
            <DialogContent>
              <Typography variant="body2" gutterBottom>
                Пользователь: <strong>{resetPasswordInfo.user.full_name}</strong>
              </Typography>
              <Typography variant="body1" sx={{ fontFamily: 'monospace', mt: 1 }}>
                {resetPasswordInfo.password}
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setResetPasswordInfo(null)}>Закрыть</Button>
            </DialogActions>
          </Dialog>
        )}
      </Box>
    </Layout>
  );
}
