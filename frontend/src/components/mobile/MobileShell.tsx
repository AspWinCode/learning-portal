import React from 'react';
import {
  AppBar,
  Box,
  Container,
  IconButton,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';

type MobileShellProps = {
  title: string;
  subtitle?: React.ReactNode;
  backTo?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md';
};

export const mobilePageSx = {
  minHeight: '100vh',
  bgcolor: '#F4F7FB',
  background:
    'linear-gradient(180deg, rgba(244,247,251,1) 0%, rgba(248,250,252,1) 42%, rgba(255,255,255,1) 100%)',
  color: '#0f172a',
  pb: 'calc(92px + env(safe-area-inset-bottom))',
};

export const mobileCardSx = {
  borderRadius: 2,
  borderColor: 'rgba(15, 23, 42, 0.08)',
  boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)',
  bgcolor: '#fff',
};

export function MobileShell({
  title,
  subtitle,
  backTo = '/mobile',
  onBack,
  actions,
  children,
  maxWidth = 'sm',
}: MobileShellProps) {
  const navigate = useNavigate();

  return (
    <Box sx={mobilePageSx}>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          bgcolor: 'rgba(255,255,255,0.92)',
          color: 'text.primary',
          borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <Toolbar sx={{ minHeight: 62, px: { xs: 1.25, sm: 2 } }}>
          <IconButton
            edge="start"
            onClick={onBack || (() => navigate(backTo))}
            aria-label="Назад"
            sx={{ mr: 0.75 }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={900} noWrap sx={{ letterSpacing: 0 }}>
              {title}
            </Typography>
            {subtitle ? (
              <Typography variant="caption" color="text.secondary" noWrap component="div">
                {subtitle}
              </Typography>
            ) : null}
          </Box>
          {actions ? (
            <Stack direction="row" spacing={0.25} alignItems="center" sx={{ ml: 1, flexShrink: 0 }}>
              {actions}
            </Stack>
          ) : null}
        </Toolbar>
      </AppBar>

      <Container maxWidth={maxWidth} sx={{ pt: 2, px: { xs: 1.25, sm: 2.5 } }}>
        {children}
      </Container>
    </Box>
  );
}
