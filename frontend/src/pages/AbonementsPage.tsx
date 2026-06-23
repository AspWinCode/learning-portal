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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';
import { abonementsApi } from '../services/api';
import { Abonement, ABONEMENT_FORMAT_LABELS, AbonementFormat } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission } from '../utils/permissions';

const emptyForm = { name: '', price: '' as string | number, abonement_format: '' as '' | AbonementFormat };

const AbonementsPage: React.FC = () => {
  const { user } = useAuth();
  const [abonements, setAbonements] = useState<Abonement[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Abonement | null>(null);
  const [form, setForm] = useState({
    name: '',
    price: '' as string | number,
    abonement_format: '' as '' | AbonementFormat,
  });
  const canManageAbonements = hasPermission(user, 'abonements.manage');

  const loadAbonements = async () => {
    try {
      const data = await abonementsApi.getAll();
      setAbonements(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка загрузки абонементов');
    }
  };

  useEffect(() => {
    loadAbonements();
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setError('Введите название абонемента');
      return;
    }
    try {
      await abonementsApi.create({
        name: form.name.trim(),
        price: Number(form.price) || 0,
        abonement_format: form.abonement_format || undefined,
      });
      setOpen(false);
      setForm(emptyForm);
      loadAbonements();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка создания абонемента');
    }
  };

  const handleUpdate = async () => {
    if (!editing) return;
    if (!form.name.trim()) {
      setError('Введите название абонемента');
      return;
    }
    try {
      await abonementsApi.update(editing.id, {
        name: form.name.trim(),
        price: Number(form.price) || 0,
        abonement_format: form.abonement_format || undefined,
      });
      setEditOpen(false);
      setEditing(null);
      setForm(emptyForm);
      loadAbonements();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка обновления абонемента');
    }
  };

  return (
    <Layout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
        <Typography variant="h4">Абонементы</Typography>
        {canManageAbonements && <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setForm(emptyForm);
            setOpen(true);
          }}
        >
          Создать абонемент
        </Button>}
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
              <TableCell>Название</TableCell>
              <TableCell>Цена</TableCell>
              <TableCell>Формат</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {abonements.map((abonement) => (
              <TableRow key={abonement.id}>
                <TableCell>{abonement.name}</TableCell>
                <TableCell>{abonement.price} ₽</TableCell>
                <TableCell>
                  {abonement.abonement_format ? ABONEMENT_FORMAT_LABELS[abonement.abonement_format] : '—'}
                </TableCell>
                <TableCell>{abonement.status === 'active' ? 'Активен' : 'Архивирован'}</TableCell>
                <TableCell>
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => {
                      setEditing(abonement);
                      setForm({
                        name: abonement.name,
                        price: abonement.price,
                        abonement_format: abonement.abonement_format || '',
                      });
                      setEditOpen(true);
                    }}
                    sx={{ mr: 1 }}
                  >
                    Редактировать
                  </Button>
                  {abonement.status === 'active' ? (
                    <Button
                      size="small"
                      color="warning"
                      onClick={async () => {
                        await abonementsApi.archive(abonement.id);
                        loadAbonements();
                      }}
                      sx={{ mr: 1 }}
                    >
                      Архивировать
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      color="success"
                      onClick={async () => {
                        await abonementsApi.unarchive(abonement.id);
                        loadAbonements();
                      }}
                      sx={{ mr: 1 }}
                    >
                      Разархивировать
                    </Button>
                  )}
                  <Button
                    size="small"
                    color="error"
                    onClick={async () => {
                      await abonementsApi.remove(abonement.id);
                      loadAbonements();
                    }}
                  >
                    Удалить
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Создать абонемент</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Название *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth
            type="number"
            label="Стоимость абонемента"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            onFocus={(e) => e.target.select()}
            inputProps={{ min: 0 }}
            sx={{ mt: 2 }}
          />
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Формат абонемента</InputLabel>
            <Select
              value={form.abonement_format}
              label="Формат абонемента"
              onChange={(e) =>
                setForm({
                  ...form,
                  abonement_format: (e.target.value || '') as '' | AbonementFormat,
                })
              }
            >
              <MenuItem value="">Не указан</MenuItem>
              <MenuItem value="individual">{ABONEMENT_FORMAT_LABELS.individual}</MenuItem>
              <MenuItem value="package">{ABONEMENT_FORMAT_LABELS.package}</MenuItem>
              <MenuItem value="group">{ABONEMENT_FORMAT_LABELS.group}</MenuItem>
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

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Редактировать абонемент</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Название *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            sx={{ mt: 2 }}
          />
          <TextField
            fullWidth
            type="number"
            label="Стоимость абонемента"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            onFocus={(e) => e.target.select()}
            inputProps={{ min: 0 }}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Отмена</Button>
          <Button onClick={handleUpdate} variant="contained">
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default AbonementsPage;

