import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services/api';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetInfo, setResetInfo] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const { login, loginAsGuest } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((x: any) => x?.msg || x).join(', ') : null;
      const fallback = err.response?.status === 401 ? 'Неверный email или пароль' : err.message || 'Ошибка входа. Проверьте, что сервер доступен.';
      setError(msg || fallback);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await loginAsGuest();
      navigate('/programs');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось войти как гость');
    } finally {
      setLoading(false);
    }
  };

  const openReset = () => {
    setResetStep(1);
    setResetEmail(email || '');
    setResetCode('');
    setResetNewPassword('');
    setResetInfo('');
    setResetError('');
    setResetOpen(true);
  };

  const handleResetRequest = async () => {
    setResetError('');
    setResetInfo('');
    setResetLoading(true);
    try {
      const resp = await authApi.passwordResetRequest(resetEmail);
      setResetInfo(resp.message || 'Если email существует, код отправлен');
      setResetStep(2);
    } catch (err: any) {
      setResetError(err.response?.data?.detail || 'Ошибка запроса кода');
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetConfirm = async () => {
    setResetError('');
    setResetInfo('');
    setResetLoading(true);
    try {
      const resp = await authApi.passwordResetConfirm(resetEmail, resetCode, resetNewPassword);
      setResetInfo(resp.message || 'Пароль изменён');
      // закрываем через небольшую паузу, чтобы пользователь увидел сообщение
      setTimeout(() => setResetOpen(false), 800);
    } catch (err: any) {
      setResetError(err.response?.data?.detail || 'Ошибка смены пароля');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography component="h1" variant="h5" align="center" gutterBottom>
            Вход в систему
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Пароль"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading}
            >
              {loading ? 'Вход...' : 'Войти'}
            </Button>
            <Button fullWidth variant="outlined" onClick={handleGuestLogin} disabled={loading} sx={{ mb: 1 }}>
              Войти как гость
            </Button>
            <Button
              fullWidth
              variant="text"
              onClick={openReset}
              disabled={loading}
              sx={{ mt: 0 }}
            >
              Забыли пароль?
            </Button>
          </Box>
        </Paper>
      </Box>

      <Dialog open={resetOpen} onClose={() => setResetOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Восстановление пароля</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mt: 2 }}>
            Код для сброса пароля придёт в Telegram, если он привязан к аккаунту (меню пользователя → Telegram: привязать).
          </Alert>
          {resetError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {resetError}
            </Alert>
          )}
          {resetInfo && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {resetInfo}
            </Alert>
          )}

          {resetStep === 1 && (
            <TextField
              margin="normal"
              fullWidth
              label="Email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
            />
          )}

          {resetStep === 2 && (
            <>
              <TextField
                margin="normal"
                fullWidth
                label="Email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
              <TextField
                margin="normal"
                fullWidth
                label="Код"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
              />
              <TextField
                margin="normal"
                fullWidth
                label="Новый пароль"
                type="password"
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetOpen(false)} disabled={resetLoading}>
            Отмена
          </Button>
          {resetStep === 1 ? (
            <Button onClick={handleResetRequest} variant="contained" disabled={resetLoading || !resetEmail}>
              {resetLoading ? 'Отправка...' : 'Получить код'}
            </Button>
          ) : (
            <Button
              onClick={handleResetConfirm}
              variant="contained"
              disabled={resetLoading || !resetEmail || !resetCode || !resetNewPassword}
            >
              {resetLoading ? 'Сохранение...' : 'Сменить пароль'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default LoginPage;

