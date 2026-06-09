import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
  IconButton,
  Divider,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services/api';

const BRAND_FEATURES = [
  { icon: '👩‍🎓', text: 'Управление учениками и группами' },
  { icon: '📊', text: 'Финансы, отчёты и аналитика' },
  { icon: '🤝', text: 'CRM для отдела продаж' },
  { icon: '📱', text: 'Telegram-уведомления и родительский кабинет' },
];

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const msg =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
          ? detail.map((x: any) => x?.msg || x).join(', ')
          : null;
      const fallback =
        err.response?.status === 401
          ? 'Неверный email или пароль'
          : err.message || 'Ошибка входа. Проверьте, что сервер доступен.';
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
      setTimeout(() => setResetOpen(false), 800);
    } catch (err: any) {
      setResetError(err.response?.data?.detail || 'Ошибка смены пароля');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#0F172A' }}>
      {/* ── Left brand panel ──────────────────────────────────────── */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '45%',
          flexShrink: 0,
          p: 6,
          background: 'linear-gradient(145deg, #1E1B4B 0%, #312E81 45%, #4C1D95 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* декоративные круги */}
        <Box sx={{
          position: 'absolute', top: -80, right: -80,
          width: 320, height: 320, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(165,180,252,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <Box sx={{
          position: 'absolute', bottom: -60, left: -60,
          width: 280, height: 280, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(167,139,250,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Логотип */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, position: 'relative' }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: 2,
            background: 'linear-gradient(135deg, #818CF8 0%, #A78BFA 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20,
          }}>
            🎓
          </Box>
          <Typography sx={{ color: '#E0E7FF', fontWeight: 800, fontSize: '1.1rem', letterSpacing: -0.3 }}>
            Learning Portal
          </Typography>
        </Box>

        {/* Заголовок */}
        <Box sx={{ position: 'relative' }}>
          <Typography
            sx={{
              color: '#FFFFFF',
              fontWeight: 800,
              fontSize: '2rem',
              lineHeight: 1.2,
              letterSpacing: -0.8,
              mb: 1.5,
            }}
          >
            Управляйте школой<br />в одном месте
          </Typography>
          <Typography sx={{ color: alpha('#E0E7FF', 0.65), fontSize: '0.95rem', mb: 4 }}>
            Ученики, тренеры, финансы, CRM и аналитика — всё что нужно для роста образовательного центра.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {BRAND_FEATURES.map((f) => (
              <Box key={f.text} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{
                  width: 32, height: 32, borderRadius: 1.5,
                  bgcolor: 'rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, flexShrink: 0,
                }}>
                  {f.icon}
                </Box>
                <Typography sx={{ color: alpha('#E0E7FF', 0.80), fontSize: '0.875rem', fontWeight: 500 }}>
                  {f.text}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        <Typography sx={{ color: alpha('#E0E7FF', 0.30), fontSize: '0.75rem', position: 'relative' }}>
          © {new Date().getFullYear()} Learning Portal
        </Typography>
      </Box>

      {/* ── Right form panel ──────────────────────────────────────── */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#FFFFFF',
          p: { xs: 3, sm: 6 },
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 400 }}>
          {/* Mobile logo */}
          <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1.5, mb: 4 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: 2,
              background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            }}>
              🎓
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#0F172A' }}>
              Learning Portal
            </Typography>
          </Box>

          <Typography variant="h5" sx={{ mb: 0.5, color: '#0F172A' }}>
            Вход в систему
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3.5 }}>
            Введите данные вашего аккаунта
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2.5 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                required
                fullWidth
                label="Email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <TextField
                required
                fullWidth
                label="Пароль"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1, mb: 2.5 }}>
              <Button
                variant="text"
                size="small"
                onClick={openReset}
                disabled={loading}
                sx={{ color: '#4F46E5', fontWeight: 600, p: 0, minWidth: 0, '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' } }}
              >
                Забыли пароль?
              </Button>
            </Box>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mb: 1.5 }}
            >
              {loading ? 'Входим...' : 'Войти'}
            </Button>

            <Divider sx={{ my: 2 }}>
              <Typography variant="caption" color="text.secondary">или</Typography>
            </Divider>

            <Button
              fullWidth
              variant="outlined"
              onClick={handleGuestLogin}
              disabled={loading}
              sx={{ color: 'text.secondary', borderColor: alpha('#0F172A', 0.15) }}
            >
              Войти как гость
            </Button>
          </Box>
        </Box>
      </Box>

      {/* ── Reset password dialog ─────────────────────────────────── */}
      <Dialog open={resetOpen} onClose={() => setResetOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Восстановление пароля</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mt: 1, mb: 2 }}>
            Код придёт в Telegram, если он привязан к аккаунту.
          </Alert>
          {resetError && <Alert severity="error" sx={{ mb: 2 }}>{resetError}</Alert>}
          {resetInfo  && <Alert severity="success" sx={{ mb: 2 }}>{resetInfo}</Alert>}

          {resetStep === 1 && (
            <TextField
              margin="dense"
              fullWidth
              label="Email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
            />
          )}
          {resetStep === 2 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <TextField
                margin="dense"
                fullWidth
                label="Email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
              />
              <TextField
                fullWidth
                label="Код из Telegram"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
              />
              <TextField
                fullWidth
                label="Новый пароль"
                type="password"
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetOpen(false)} disabled={resetLoading}>
            Отмена
          </Button>
          {resetStep === 1 ? (
            <Button
              variant="contained"
              onClick={handleResetRequest}
              disabled={resetLoading || !resetEmail}
            >
              {resetLoading ? 'Отправка...' : 'Получить код'}
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleResetConfirm}
              disabled={resetLoading || !resetEmail || !resetCode || !resetNewPassword}
            >
              {resetLoading ? 'Сохранение...' : 'Сменить пароль'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LoginPage;
