import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  AppBar,
  Box,
  Chip,
  CircularProgress,
  Container,
  Collapse,
  IconButton,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { ArrowBack, ExpandLess, ExpandMore, Refresh } from '@mui/icons-material';
import { programsApi } from '../services/api';
import type { Program } from '../types';

const MobileProgramsPage: React.FC = () => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = React.useState<number | null>(null);

  const programsQuery = useQuery({
    queryKey: ['mobile-programs'],
    queryFn: () => programsApi.getAll(),
  });

  const programs = (programsQuery.data ?? []).filter((p: Program) => !(p as any).archived);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f6f8fb', pb: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => navigate('/mobile')} aria-label="Назад">
            <ArrowBack />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0, ml: 1 }}>
            <Typography variant="subtitle1" fontWeight={900} noWrap>Программы</Typography>
            <Typography variant="caption" color="text.secondary">{programs.length} программ</Typography>
          </Box>
          <IconButton onClick={() => programsQuery.refetch()} aria-label="Обновить">
            <Refresh />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="sm" sx={{ pt: 2, px: { xs: 1.5, sm: 3 } }}>
        {programsQuery.isLoading ? (
          <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
        ) : programsQuery.isError ? (
          <Alert severity="error">Не удалось загрузить программы</Alert>
        ) : programs.length === 0 ? (
          <Alert severity="info">Программ нет</Alert>
        ) : (
          <Stack spacing={1.25}>
            {programs.map((p: Program) => {
              const isOpen = expanded === p.id;
              const modules = (p as any).modules ?? [];
              const totalTopics = modules.reduce((acc: number, m: any) => acc + (m.topics?.length ?? 0), 0);
              return (
                <Paper key={p.id} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                  <Box
                    sx={{
                      p: 1.5, cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      '&:active': { opacity: 0.7 },
                    }}
                    onClick={() => setExpanded(isOpen ? null : p.id)}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={700} noWrap>{p.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {modules.length} модулей • {totalTopics} тем
                      </Typography>
                    </Box>
                    {isOpen ? <ExpandLess /> : <ExpandMore />}
                  </Box>
                  <Collapse in={isOpen}>
                    <Box sx={{ borderTop: '1px solid', borderColor: 'divider', px: 1.5, py: 1 }}>
                      <Stack spacing={1}>
                        {modules.map((m: any, mi: number) => (
                          <Box key={m.id ?? mi}>
                            <Typography variant="caption" fontWeight={700} color="text.secondary">
                              {mi + 1}. {m.name}
                            </Typography>
                            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                              {(m.topics ?? []).map((t: any, ti: number) => (
                                <Chip
                                  key={t.id ?? ti}
                                  size="small"
                                  label={t.name}
                                  variant="outlined"
                                  sx={{ fontSize: '0.7rem' }}
                                />
                              ))}
                            </Stack>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  </Collapse>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Container>
    </Box>
  );
};

export default MobileProgramsPage;
