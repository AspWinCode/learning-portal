import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import LogoutIcon from '@mui/icons-material/Logout';
import { METHODIST_STUDIO_TOKEN_KEY } from '../services/methodistStudioClient';
import { methodistKodexApi } from '../services/methodistKodexApi';
import KodexStudioPage from './KodexStudioPage';

const VOID = '#05070a';
const NEON = '#00ffab';

export default function MethodistStudioPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(METHODIST_STUDIO_TOKEN_KEY);
    if (!token) {
      navigate('/methodist-studio/login', { replace: true });
    } else {
      setReady(true);
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem(METHODIST_STUDIO_TOKEN_KEY);
    navigate('/methodist-studio/login', { replace: true });
  };

  if (!ready) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: VOID, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: NEON }} />
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', minHeight: '100vh' }}>
      {/* Logout button — floating top-right */}
      <Box
        sx={{
          position: 'fixed',
          top: 12,
          right: 16,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: '#4a5568',
            fontFamily: '"JetBrains Mono", monospace',
            letterSpacing: '0.1em',
          }}
        >
          Methodist Studio
        </Typography>
        <Tooltip title="Выйти из студии">
          <IconButton onClick={handleLogout} size="small" sx={{ color: '#4a5568', '&:hover': { color: NEON } }}>
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <KodexStudioPage api={methodistKodexApi} />
    </Box>
  );
}
