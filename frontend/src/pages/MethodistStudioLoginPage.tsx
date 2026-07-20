import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import axios from 'axios';
import { METHODIST_STUDIO_TOKEN_KEY } from '../services/methodistStudioClient';

const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

const VOID = '#05070a';
const NEON = '#00ffab';
const CYAN = '#35c7ff';
const SURFACE = '#0c0f14';
const BORDER = '#1a2030';

export default function MethodistStudioLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/methodist-studio/login`, { email, password });
      localStorage.setItem(METHODIST_STUDIO_TOKEN_KEY, res.data.access_token);
      navigate('/methodist-studio', { replace: true });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: VOID,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      }}
    >
      {/* Background grid */}
      <Box
        sx={{
          position: 'fixed',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(0,255,171,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,171,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          pointerEvents: 'none',
        }}
      />

      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          position: 'relative',
          zIndex: 1,
          width: 400,
          bgcolor: SURFACE,
          border: `1px solid ${BORDER}`,
          borderRadius: 2,
          p: 4,
          boxShadow: `0 0 40px rgba(0,255,171,0.06)`,
        }}
      >
        {/* Logo / title */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Typography
            variant="h4"
            sx={{
              fontFamily: 'inherit',
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: NEON,
              textShadow: `0 0 20px ${NEON}60`,
            }}
          >
            KODEX
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: CYAN,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              fontFamily: 'inherit',
            }}
          >
            Methodist Studio
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2, bgcolor: 'rgba(211,47,47,0.1)', color: '#f44336' }}>
            {error}
          </Alert>
        )}

        <TextField
          fullWidth
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
          sx={{ mb: 2, ...fieldSx }}
        />
        <TextField
          fullWidth
          label="Пароль"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
          sx={{ mb: 3, ...fieldSx }}
        />

        <Button
          type="submit"
          fullWidth
          variant="contained"
          disabled={loading || !email || !password}
          sx={{
            bgcolor: NEON,
            color: VOID,
            fontFamily: 'inherit',
            fontWeight: 700,
            letterSpacing: '0.1em',
            py: 1.5,
            '&:hover': { bgcolor: `${NEON}cc` },
            '&:disabled': { bgcolor: `${NEON}33`, color: `${NEON}66` },
          }}
        >
          {loading ? <CircularProgress size={20} sx={{ color: VOID }} /> : 'ВОЙТИ'}
        </Button>
      </Box>
    </Box>
  );
}

const fieldSx = {
  '& .MuiInputLabel-root': { color: '#4a5568', fontFamily: 'inherit' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#00ffab' },
  '& .MuiOutlinedInput-root': {
    color: '#c9d1d9',
    fontFamily: 'inherit',
    '& fieldset': { borderColor: '#1a2030' },
    '&:hover fieldset': { borderColor: '#2a3550' },
    '&.Mui-focused fieldset': { borderColor: '#00ffab' },
  },
};
