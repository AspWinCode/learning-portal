import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
} from '@mui/material';
import { authApi } from '../services/api';

const SetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!token) {
      setError('Ссылка приглашения недействительна (нет токена).');
      return;
    }
    if (password.length < 6) {
      setError('Пароль должен быть не менее 6 символов');
      return;
    }
    if (password !== confirm) {
      setError('Пароли не совпадают');
      return;
    }
    setLoading(true);
    try {
      await authApi.setPasswordByInvite(token, password);
      setSuccess(true);
      setTimeout(() => navigate('/login', { state: { message: 'Пароль установлен. Войдите в кабинет.' } }), 2000);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Не удалось установить пароль');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Container maxWidth="sm">
        <Box sx={{ py: 4 }}>
          <Paper sx={{ p: 3 }}>
            <Typography color="error">Ссылка приглашения недействительна или отсутствует. Обратитесь к администратору.</Typography>
            <Button sx={{ mt: 2 }} onClick={() => navigate('/login')}>На страницу входа</Button>
          </Paper>
        </Box>
      </Container>
    );
  }

  if (success) {
    return (
      <Container maxWidth="sm">
        <Box sx={{ py: 4 }}>
          <Paper sx={{ p: 3 }}>
            <Alert severity="success">Пароль установлен. Перенаправление на страницу входа...</Alert>
          </Paper>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm">
      <Box sx={{ py: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Установка пароля</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Вам отправлено приглашение в кабинет родителя. Задайте пароль для входа.
          </Typography>
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              type="password"
              label="Новый пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              sx={{ mb: 2 }}
              helperText="Минимум 6 символов"
            />
            <TextField
              fullWidth
              type="password"
              label="Повторите пароль"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              sx={{ mb: 2 }}
            />
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Button type="submit" variant="contained" fullWidth disabled={loading}>
              {loading ? 'Сохранение...' : 'Установить пароль'}
            </Button>
          </form>
          <Button size="small" sx={{ mt: 2 }} onClick={() => navigate('/login')}>На страницу входа</Button>
        </Paper>
      </Box>
    </Container>
  );
};

export default SetPasswordPage;
