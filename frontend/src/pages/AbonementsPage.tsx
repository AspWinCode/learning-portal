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
import { Abonement } from '../types';

const emptyForm = { name: '', discount_type: 'none', discount_value: 0 };

const AbonementsPage: React.FC = () => {
  const [abonements, setAbonements] = useState<Abonement[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Abonement | null>(null);
  const [form, setForm] = useState({
    name: '',
    discount_type: 'none',
    discount_value: 0,
  });

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
        discount_type: form.discount_type as Abonement['discount_type'],
        discount_value: Number(form.discount_value) || 0,
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
        discount_type: form.discount_type as Abonement['discount_type'],
        discount_value: Number(form.discount_value) || 0,
      });
      setEditOpen(false);
      setEditing(null);
      setForm(emptyForm);
      loadAbonements();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка обновления абонемента');
    }
  };

  const renderDiscount = (abonement: Abonement) => {
    if (abonement.discount_type === 'none') return '—';
    if (abonement.discount_type === 'amount') return `${abonement.discount_value} ₽`;
    return `${abonement.discount_value}%`;
  };

  return (
    <Layout>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
        <Typography variant="h4">Абонементы</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setForm(emptyForm);
            setOpen(true);
          }}
        >
          Создать абонемент
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
              <TableCell>Название</TableCell>
              <TableCell>Тип скидки</TableCell>
              <TableCell>Скидка</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {abonements.map((abonement) => (
              <TableRow key={abonement.id}>
                <TableCell>{abonement.name}</TableCell>
                <TableCell>{abonement.discount_type}</TableCell>
                <TableCell>{renderDiscount(abonement)}</TableCell>
                <TableCell>{abonement.status === 'active' ? 'Активен' : 'Архивирован'}</TableCell>
                <TableCell>
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => {
                      setEditing(abonement);
                      setForm({
                        name: abonement.name,
                        discount_type: abonement.discount_type,
                        discount_value: abonement.discount_value,
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
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Тип скидки</InputLabel>
            <Select
              value={form.discount_type}
              label="Тип скидки"
              onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
            >
              <MenuItem value="none">Нет скидки</MenuItem>
              <MenuItem value="amount">Скидка в рублях</MenuItem>
              <MenuItem value="percent">Скидка в процентах</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            type="number"
            label="Размер скидки"
            value={form.discount_value}
            onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })}
            sx={{ mt: 2 }}
            helperText={form.discount_type === 'percent' ? 'Укажите процент' : 'Укажите сумму'}
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
        <DialogTitle>Редактировать абонемент</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Название *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            sx={{ mt: 2 }}
          />
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Тип скидки</InputLabel>
            <Select
              value={form.discount_type}
              label="Тип скидки"
              onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
            >
              <MenuItem value="none">Нет скидки</MenuItem>
              <MenuItem value="amount">Скидка в рублях</MenuItem>
              <MenuItem value="percent">Скидка в процентах</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            type="number"
            label="Размер скидки"
            value={form.discount_value}
            onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })}
            sx={{ mt: 2 }}
            helperText={form.discount_type === 'percent' ? 'Укажите процент' : 'Укажите сумму'}
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

