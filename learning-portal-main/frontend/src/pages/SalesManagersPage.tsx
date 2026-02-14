import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import Layout from '../components/Layout';
import { usersApi } from '../services/api';
import { User } from '../types';
import { extractApiError } from '../utils/extractApiError';
import { useAuth } from '../contexts/AuthContext';

const SalesManagersPage: React.FC = () => {
  const [salesManagers, setSalesManagers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [newSales, setNewSales] = useState({
    full_name: '',
    email: '',
    password: '',
  });
  const { user } = useAuth();
  const isAdminLike = user?.role === 'admin' || user?.role === 'owner';

  const loadSalesManagers = async () => {
    try {
      const data = await usersApi.getAll('sales');
      setSalesManagers(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка загрузки sales-менеджеров'));
    }
  };

  useEffect(() => {
    loadSalesManagers();
  }, []);

  const handleCreate = async () => {
    if (!newSales.full_name.trim() || !newSales.email.trim() || !newSales.password.trim()) {
      setError('Заполните все поля');
      return;
    }
    if (newSales.password.length < 6) {
      setError('Пароль должен быть минимум 6 символов');
      return;
    }
    try {
      await usersApi.create({
        full_name: newSales.full_name.trim(),
        email: newSales.email.trim(),
        password: newSales.password,
        role: 'sales',
      });
      setOpen(false);
      setNewSales({ full_name: '', email: '', password: '' });
      setError('');
      await loadSalesManagers();
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка создания sales-менеджера'));
    }
  };

  const handleArchiveSales = async (managerId: number, isActive: boolean) => {
    try {
      await usersApi.update(managerId, { is_active: !isActive });
      setError('');
      await loadSalesManagers();
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка архивации'));
    }
  };

  return (
    <Layout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
        <Typography variant="h4">Sales менеджеры</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setOpen(true);
            setNewSales({ full_name: '', email: '', password: '' });
          }}
        >
          Создать менеджера
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
              {isAdminLike && <TableCell>Действия</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {salesManagers.map((manager) => (
              <TableRow key={manager.id}>
                <TableCell>{manager.full_name}</TableCell>
                <TableCell>{manager.email}</TableCell>
                <TableCell>{manager.is_active ? 'Активен' : 'Неактивен'}</TableCell>
                {isAdminLike && (
                  <TableCell>
                    <Button
                      size="small"
                      color={manager.is_active ? 'secondary' : 'primary'}
                      onClick={() => handleArchiveSales(manager.id, manager.is_active)}
                    >
                      {manager.is_active ? 'Архивировать' : 'Разархивировать'}
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {salesManagers.length === 0 && (
              <TableRow>
                <TableCell colSpan={isAdminLike ? 4 : 3}>
                  <Typography color="text.secondary">Список пуст</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Создать sales-менеджера</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="ФИО *"
            value={newSales.full_name}
            onChange={(e) => setNewSales({ ...newSales, full_name: e.target.value })}
            sx={{ mt: 2 }}
            required
          />
          <TextField
            fullWidth
            label="Email *"
            type="email"
            value={newSales.email}
            onChange={(e) => setNewSales({ ...newSales, email: e.target.value })}
            sx={{ mt: 2 }}
            required
          />
          <TextField
            fullWidth
            label="Пароль *"
            type="password"
            value={newSales.password}
            onChange={(e) => setNewSales({ ...newSales, password: e.target.value })}
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

export default SalesManagersPage;
