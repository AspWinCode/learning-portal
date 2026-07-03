import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
} from '@mui/material';
import { studentPortalApi } from '../services/studentPortalApi';

const StudentPortalLoginPage: React.FC = () => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await studentPortalApi.login(login, password);
      studentPortalApi.saveToken(result.access_token);
      navigate('/student-portal', { replace: true });
    } catch (err: any) {
      const fallback = err.response?.status === 401 ? 'Неверный логин или пароль' : 'Ошибка входа. Проверьте, что сервер доступен.';
      setError(err.response?.data?.detail || fallback);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', bgcolor: '#FAFAF8', p: 2 }}>
      <Box sx={{ width: '100%', maxWidth: 380 }}>
        <Typography variant="h5" sx={{ mb: 0.5 }}>Кабинет ученика</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3.5 }}>
          Войдите под логином, который вам выдал тренер
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}

        <Box component="form" onSubmit={handleSubmit}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              required
              fullWidth
              label="Логин"
              autoFocus
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
            <TextField
              required
              fullWidth
              label="Пароль"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Box>

          <Button type="submit" fullWidth variant="contained" size="large" disabled={loading} sx={{ mt: 3 }}>
            {loading ? 'Входим...' : 'Войти'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default StudentPortalLoginPage;
