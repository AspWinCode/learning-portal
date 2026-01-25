import React, { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import {
  Box,
  Typography,
  Grid,
  Paper,
  TextField,
  Stack,
  Chip,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  Skeleton,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { programsApi } from '../services/api';
import { Program } from '../types';

const countTopics = (p: Program) => (p.modules || []).reduce((acc, m) => acc + (m.topics?.length || 0), 0);

const GuestProgramsPage: React.FC = () => {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Program | null>(null);
  const [loadingProgram, setLoadingProgram] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadingList(true);
      try {
        const data = await programsApi.getAll();
        setPrograms(data);
        // авто-выбор первой программы (после группировки)
      } catch (e) {
        setPrograms([]);
      } finally {
        setLoadingList(false);
      }
    })();
  }, []);

  const latestPrograms = useMemo(() => {
    const byId = new Map<number, Program>();
    programs.forEach((p) => byId.set(p.id, p));

    const rootIdOf = (p: Program): number => {
      const seen = new Set<number>();
      let cur: Program = p;
      while (cur.parent_program_id) {
        if (seen.has(cur.id)) break;
        seen.add(cur.id);
        const parent = byId.get(cur.parent_program_id);
        if (!parent) break;
        cur = parent;
      }
      return cur.id;
    };

    const families = new Map<number, Program[]>();
    programs.forEach((p) => {
      const root = rootIdOf(p);
      const arr = families.get(root) || [];
      arr.push(p);
      families.set(root, arr);
    });

    const latest = Array.from(families.values()).map((vers) =>
      vers.slice().sort((a, b) => (a.version || 0) - (b.version || 0))[vers.length - 1]
    );
    return latest.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [programs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return latestPrograms;
    return latestPrograms.filter((p) => p.name.toLowerCase().includes(q));
  }, [latestPrograms, search]);

  useEffect(() => {
    if (!selectedId && filtered.length) {
      setSelectedId(filtered[0].id);
      setSelected(filtered[0]);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const fromList = programs.find((p) => p.id === selectedId) || null;
    if (fromList) setSelected(fromList);

    (async () => {
      setLoadingProgram(true);
      try {
        const p = await programsApi.getById(selectedId);
        setSelected(p);
      } catch {
        // ignore
      } finally {
        setLoadingProgram(false);
      }
    })();
  }, [selectedId, programs]);

  return (
    <Layout>
      <Box sx={{ px: 2, py: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: -0.2 }}>
          Программы обучения
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Гостевой режим: просмотр программ (только чтение)
        </Typography>

        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={4}>
            <Paper
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 3,
                border: '1px solid rgba(15, 23, 42, 0.08)',
                background:
                  'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(248,250,252,1) 100%)',
              }}
            >
              <TextField
                fullWidth
                label="Поиск программы"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Divider sx={{ my: 2 }} />

              <Stack spacing={1}>
                {loadingList ? (
                  <>
                    <Skeleton variant="rounded" height={74} />
                    <Skeleton variant="rounded" height={74} />
                    <Skeleton variant="rounded" height={74} />
                  </>
                ) : filtered.length ? (
                  filtered.map((p) => {
                    const isSelected = p.id === selectedId;
                    const modulesCount = (p.modules || []).length;
                    const topicsCount = countTopics(p);
                    return (
                      <Paper
                        key={p.id}
                        elevation={0}
                        onClick={() => setSelectedId(p.id)}
                        sx={{
                          p: 1.5,
                          cursor: 'pointer',
                          borderRadius: 2.5,
                          border: isSelected
                            ? '1px solid rgba(37, 99, 235, 0.55)'
                            : '1px solid rgba(15, 23, 42, 0.08)',
                          background: isSelected
                            ? 'linear-gradient(135deg, rgba(37,99,235,0.10) 0%, rgba(124,58,237,0.08) 100%)'
                            : '#fff',
                        }}
                      >
                        <Typography sx={{ fontWeight: 700, lineHeight: 1.2 }}>{p.name}</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                          <Chip size="small" label={`v${p.version || 1}`} />
                          <Chip size="small" variant="outlined" label={`${modulesCount} мод.`} />
                          <Chip size="small" variant="outlined" label={`${topicsCount} тем`} />
                        </Stack>
                      </Paper>
                    );
                  })
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Ничего не найдено
                  </Typography>
                )}
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} md={8}>
            {!selected ? (
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  borderRadius: 3,
                  border: '1px solid rgba(15, 23, 42, 0.08)',
                  backgroundColor: '#fff',
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  Выберите программу слева
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Здесь появится структура: модули, темы и результаты изучения.
                </Typography>
              </Paper>
            ) : (
              <Box>
                <Paper
                  elevation={0}
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    border: '1px solid rgba(15, 23, 42, 0.08)',
                    color: '#0f172a',
                    background:
                      'linear-gradient(135deg, rgba(37,99,235,0.10) 0%, rgba(124,58,237,0.08) 100%)',
                  }}
                >
                  <Typography variant="h5" sx={{ fontWeight: 900, letterSpacing: -0.2 }}>
                    {selected.name}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                    <Chip label={`Версия v${selected.version || 1}`} />
                    <Chip variant="outlined" label={`${(selected.modules || []).length} модулей`} />
                    <Chip variant="outlined" label={`${countTopics(selected)} тем`} />
                    {loadingProgram && <Chip color="info" label="обновление..." />}
                  </Stack>
                </Paper>

                <Box sx={{ mt: 2 }}>
                  {(selected.modules || [])
                    .slice()
                    .sort((a, b) => (a.order || 0) - (b.order || 0))
                    .map((m, idx) => (
                      <Accordion
                        key={m.id}
                        defaultExpanded={idx === 0}
                        disableGutters
                        elevation={0}
                        sx={{
                          borderRadius: 2,
                          mb: 1.5,
                          border: '1px solid rgba(15, 23, 42, 0.08)',
                          '&:before': { display: 'none' },
                        }}
                      >
                        <AccordionSummary expandIcon={<ExpandMore />}>
                          <Box>
                            <Typography sx={{ fontWeight: 800 }}>
                              {idx + 1}. {m.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Тем: {(m.topics || []).length}
                            </Typography>
                          </Box>
                        </AccordionSummary>
                        <AccordionDetails>
                          <List dense disablePadding>
                            {(m.topics || [])
                              .slice()
                              .sort((a, b) => (a.order || 0) - (b.order || 0))
                              .map((t, tIdx) => (
                                <ListItem
                                  key={t.id}
                                  sx={{
                                    px: 0,
                                    py: 1,
                                    borderBottom: '1px dashed rgba(15, 23, 42, 0.10)',
                                    '&:last-child': { borderBottom: 'none' },
                                  }}
                                >
                                  <ListItemText
                                    primary={
                                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                        <Typography sx={{ fontWeight: 700 }}>
                                          {idx + 1}.{tIdx + 1} {t.name}
                                        </Typography>
                                        {t.final_result && (
                                          <Chip size="small" variant="outlined" label="Результат" />
                                        )}
                                      </Stack>
                                    }
                                    secondary={
                                      <Box sx={{ mt: 0.75 }}>
                                        {t.description && (
                                          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                                            {t.description}
                                          </Typography>
                                        )}
                                        {t.final_result && (
                                          <Typography
                                            variant="body2"
                                            sx={{
                                              mt: 0.75,
                                              p: 1,
                                              borderRadius: 2,
                                              backgroundColor: 'rgba(255,255,255,0.7)',
                                              border: '1px solid rgba(15, 23, 42, 0.06)',
                                              whiteSpace: 'pre-wrap',
                                            }}
                                          >
                                            <strong>Результат:</strong> {t.final_result}
                                          </Typography>
                                        )}
                                      </Box>
                                    }
                                  />
                                </ListItem>
                              ))}
                          </List>
                        </AccordionDetails>
                      </Accordion>
                    ))}
                </Box>
              </Box>
            )}
          </Grid>
        </Grid>
      </Box>
    </Layout>
  );
};

export default GuestProgramsPage;


