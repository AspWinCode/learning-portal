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
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await studentPortalApi.loginByPhone(phone);
      studentPortalApi.saveToken(result.access_token);
      navigate('/student-portal', { replace: true });
    } catch (err: any) {
      const fallback = err.response?.status === 429
        ? 'Слишком много попыток. Подождите минуту'
        : 'Ошибка входа. Проверьте, что сервер доступен.';
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
          Введите номер телефона, который указан в вашей карточке
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}

        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            required
            fullWidth
            label="Номер телефона"
            type="tel"
            placeholder="+7 900 123-45-67"
            autoComplete="tel"
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <Button type="submit" fullWidth variant="contained" size="large" disabled={loading} sx={{ mt: 3 }}>
            {loading ? 'Входим...' : 'Войти'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default StudentPortalLoginPage;
