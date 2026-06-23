import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { ExpandLess, ExpandMore, Refresh } from '@mui/icons-material';
import { programsApi } from '../services/api';
import type { Program } from '../types';
import { MobileShell, mobileCardSx } from '../components/mobile/MobileShell';

const MobileProgramsPage: React.FC = () => {
  const [expanded, setExpanded] = React.useState<number | null>(null);

  const programsQuery = useQuery({
    queryKey: ['mobile-programs'],
    queryFn: () => programsApi.getAll(),
  });

  const programs = (programsQuery.data ?? []).filter((p: Program) => !(p as any).archived);

  return (
    <MobileShell
      title="Программы"
      subtitle={`${programs.length} программ`}
      actions={(
        <IconButton onClick={() => programsQuery.refetch()} aria-label="Обновить">
          <Refresh />
        </IconButton>
      )}
    >
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
                <Paper key={p.id} variant="outlined" sx={{ ...mobileCardSx, overflow: 'hidden' }}>
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
    </MobileShell>
  );
};

export default MobileProgramsPage;
