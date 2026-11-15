import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import InstallMobileIcon from '@mui/icons-material/InstallMobile';
import { usePwaInstall } from '../hooks/usePwaInstall';

/** Persistent install CTA for the student portal. It is intentionally visible
 * until the browser reports that the PWA has been installed. */
const PwaInstallButton: React.FC = () => {
  const { canInstall, promptInstall, isInstalled, isIos } = usePwaInstall();
  const [helpOpen, setHelpOpen] = useState(false);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (canInstall) {
      await promptInstall();
      return;
    }
    setHelpOpen(true);
  };

  return (
    <>
      <Box
        sx={{
          position: 'fixed',
          zIndex: 1200,
          left: { xs: 12, sm: 'auto' },
          right: { xs: 12, sm: 24 },
          bottom: { xs: 12, sm: 24 },
          width: { xs: 'auto', sm: 310 },
        }}
      >
        <Button
          fullWidth
          variant="contained"
          size="large"
          startIcon={<InstallMobileIcon />}
          onClick={handleClick}
          sx={{
            minHeight: 54,
            px: 2.5,
            borderRadius: 3,
            color: '#fff',
            fontWeight: 900,
            fontSize: { xs: '0.88rem', sm: '0.95rem' },
            textTransform: 'none',
            background: 'linear-gradient(135deg, #7F23CC 0%, #AB67E5 100%)',
            boxShadow: '0 8px 28px rgba(127,35,204,0.5), 0 0 0 4px rgba(171,103,229,0.16)',
            animation: 'studentPortalInstallPulse 2.4s ease-in-out infinite',
            '&:hover': {
              background: 'linear-gradient(135deg, #6D1DB1 0%, #9852D4 100%)',
              boxShadow: '0 10px 32px rgba(127,35,204,0.62), 0 0 0 5px rgba(171,103,229,0.2)',
            },
            '@keyframes studentPortalInstallPulse': {
              '0%, 100%': { transform: 'translateY(0)', boxShadow: '0 8px 28px rgba(127,35,204,0.5), 0 0 0 4px rgba(171,103,229,0.16)' },
              '50%': { transform: 'translateY(-3px)', boxShadow: '0 12px 34px rgba(127,35,204,0.62), 0 0 0 7px rgba(171,103,229,0.08)' },
            },
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          Установить приложение на компьютер
        </Button>
      </Box>

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Установить приложение</DialogTitle>
        <DialogContent>
          {isIos ? (
            <Typography>Откройте меню «Поделиться» в Safari и выберите «На экран “Домой”».</Typography>
          ) : (
            <>
              <Typography sx={{ mb: 1.5 }}>
                В адресной строке браузера нажмите значок установки приложения (монитор со стрелкой) или откройте меню браузера.
              </Typography>
              <Alert severity="info">В Chrome: меню ⋮ → «Установить приложение».</Alert>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHelpOpen(false)}>Понятно</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default PwaInstallButton;
