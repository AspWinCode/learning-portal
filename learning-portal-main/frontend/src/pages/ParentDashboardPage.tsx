import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import {
  Typography,
  Box,
  Paper,
  LinearProgress,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  Rating,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { gradesApi, studentsApi, programsApi, characteristicsApi, reportsApi } from '../services/api';
import { Student, Program, Characteristic, CharacteristicTemplate } from '../types';

type ComparisonResponse = {
  current: any | null;
  previous: any | null;
  before_previous: any | null;
};

type GradeDynamicsResponse = {
  student_id: number;
  dynamics: Array<{ month: string; average_grade: number }>;
};

const ParentDashboardPage: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [progress, setProgress] = useState<any>({});
  const [programsById, setProgramsById] = useState<Record<number, Program>>({});
  const [comparisons, setComparisons] = useState<Record<number, ComparisonResponse>>({});
  const [gradeDynamics, setGradeDynamics] = useState<Record<number, GradeDynamicsResponse>>({});
  const [publishedChars, setPublishedChars] = useState<Record<number, Characteristic[]>>({});
  const [templates, setTemplates] = useState<CharacteristicTemplate[]>([]);
  const [rangeSelection, setRangeSelection] = useState<
    Record<number, { startId?: number; endId?: number }>
  >({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const programs = await programsApi.getAll();
      setProgramsById(
        programs.reduce((acc: any, p: Program) => {
          acc[p.id] = p;
          return acc;
        }, {})
      );

      const studentsData = await studentsApi.getAll();
      setStudents(studentsData);

      try {
        const tpls = await characteristicsApi.getTemplates();
        setTemplates(tpls.filter((t) => t.is_active));
      } catch (err) {
        console.error('Ошибка загрузки шаблонов характеристик', err);
      }

      // Загружаем данные для каждого ученика (параллельно)
      await Promise.all(
        studentsData.map(async (student) => {
          try {
            const progressData = await gradesApi.getStudentProgress(student.id);
            setProgress((prev: any) => ({ ...prev, [student.id]: progressData }));
          } catch (err) {
            console.error(`Ошибка загрузки прогресса для ученика ${student.id}`, err);
          }

          try {
            const comp = await characteristicsApi.getComparison(student.id);
            setComparisons((prev) => ({ ...prev, [student.id]: comp }));
          } catch (err) {
            console.error(`Ошибка загрузки сравнения характеристик для ученика ${student.id}`, err);
          }

          try {
            const list = await characteristicsApi.getPublishedForStudent(student.id);
            setPublishedChars((prev) => ({ ...prev, [student.id]: list }));
            if (list.length) {
              setRangeSelection((prev) => ({
                ...prev,
                [student.id]: {
                  startId: prev[student.id]?.startId ?? list[0].id,
                  endId: prev[student.id]?.endId ?? list[list.length - 1].id,
                },
              }));
            }
          } catch (err) {
            console.error(`Ошибка загрузки опубликованных характеристик для ученика ${student.id}`, err);
          }

          try {
            const dyn = await reportsApi.getGradeDynamics(student.id);
            setGradeDynamics((prev) => ({ ...prev, [student.id]: dyn }));
          } catch (err) {
            console.error(`Ошибка загрузки динамики оценок для ученика ${student.id}`, err);
          }
        })
      );
    } catch (err) {
      console.error('Ошибка загрузки данных', err);
    }
  };

  const formatMonth = (raw: string) => {
    // backend возвращает str(month) где month = date_trunc('month', ...)
    // обычно это "2026-01-01 00:00:00+00:00" или ISO
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'short' });
  };

  const formatPeriod = (c: any) => {
    if (!c) return '—';
    if (c.month && c.year) return `${c.month}/${c.year}`;
    if (c.published_at) return new Date(c.published_at).toLocaleDateString('ru-RU');
    return '—';
  };

  const prettifyKey = (k: string) => {
    // fallback, если нет шаблона
    return k
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^\w/, (m) => m.toUpperCase());
  };

  const getAllKeys = (comp?: ComparisonResponse) => {
    const keys = new Set<string>();
    const add = (obj: any) => {
      if (!obj?.data) return;
      Object.keys(obj.data).forEach((k) => keys.add(k));
    };
    add(comp?.current);
    add(comp?.previous);
    add(comp?.before_previous);
    const arr = Array.from(keys);
    // сортируем по русским лейблам (если есть), иначе по ключу
    return arr.sort((a, b) => {
      const la = fieldLabelByName[a] || prettifyKey(a);
      const lb = fieldLabelByName[b] || prettifyKey(b);
      return la.localeCompare(lb, 'ru');
    });
  };

  const renderValue = (v: any) => {
    if (v === undefined || v === null || v === '') return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  const activeTemplate = templates[0];
  const fieldLabelByName: Record<string, string> = (activeTemplate?.fields || []).reduce((acc: any, f: any) => {
    acc[f.name] = f.label;
    return acc;
  }, {});

  const extractRatingMetrics = (data: Record<string, any> | undefined) => {
    if (!data) return [] as Array<{ key: string; label: string; value: number }>;
    const out: Array<{ key: string; label: string; value: number }> = [];
    for (const [k, v] of Object.entries(data)) {
      if (!k.endsWith('_rating')) continue;
      const num = typeof v === 'number' ? v : parseFloat(String(v));
      if (Number.isNaN(num)) continue;
      out.push({ key: k, label: fieldLabelByName[k] || k, value: num });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  };

  const getCharById = (studentId: number, id?: number) => {
    const list = publishedChars[studentId] || [];
    return list.find((c) => c.id === id);
  };

  return (
    <Layout>
      <Typography variant="h4" gutterBottom>
        Дашборд родителя
      </Typography>
      <Grid container spacing={3}>
        {students.map((student) => (
          <Grid item xs={12} md={6} key={student.id}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                {student.full_name}
              </Typography>
              {progress[student.id]?.program_id && (
                <Typography variant="body2" color="text.secondary">
                  Программа: {programsById[progress[student.id].program_id]?.name || '—'} (v
                  {programsById[progress[student.id].program_id]?.version || '—'})
                </Typography>
              )}
              {progress[student.id] && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" gutterBottom>
                    Прогресс: {progress[student.id].progress_percent}%
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={progress[student.id].progress_percent}
                    sx={{ mt: 1 }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Оценено тем: {progress[student.id].graded_topics} из {progress[student.id].total_topics}
                  </Typography>
                </Box>
              )}

              {/* Сравнение характеристик */}
              <Accordion sx={{ mt: 2 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Сравнение характеристик</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {(() => {
                    const comp = comparisons[student.id];
                    if (!comp || (!comp.current && !comp.previous && !comp.before_previous)) {
                      return (
                        <Typography variant="body2" color="text.secondary">
                          Пока нет опубликованных характеристик для сравнения.
                        </Typography>
                      );
                    }
                    const keys = getAllKeys(comp);
                    return (
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Текущая: {formatPeriod(comp.current)} • Предыдущая: {formatPeriod(comp.previous)} •
                          Позапрошлая: {formatPeriod(comp.before_previous)}
                        </Typography>
                        <TableContainer sx={{ mt: 1, maxWidth: '100%', overflowX: 'auto' }}>
                          <Table size="small" sx={{ minWidth: 680 }}>
                            <TableHead>
                              <TableRow>
                                <TableCell>Показатель</TableCell>
                                <TableCell>Текущая</TableCell>
                                <TableCell>Предыдущая</TableCell>
                                <TableCell>Позапрошлая</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {keys.map((k) => (
                                <TableRow key={k}>
                                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                    {fieldLabelByName[k] || prettifyKey(k)}
                                  </TableCell>
                                  <TableCell>{renderValue(comp.current?.data?.[k])}</TableCell>
                                  <TableCell>{renderValue(comp.previous?.data?.[k])}</TableCell>
                                  <TableCell>{renderValue(comp.before_previous?.data?.[k])}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Box>
                    );
                  })()}
                </AccordionDetails>
              </Accordion>

              {/* Инфографика: последняя характеристика + сравнение периода */}
              <Accordion sx={{ mt: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Характеристика (инфографика)</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {(() => {
                    const list = publishedChars[student.id] || [];
                    if (!list.length) {
                      return (
                        <Typography variant="body2" color="text.secondary">
                          Пока нет опубликованных характеристик.
                        </Typography>
                      );
                    }

                    const latest = list[list.length - 1];
                    const latestRatings = extractRatingMetrics(latest.data);

                    const sel = rangeSelection[student.id] || {};
                    const start = getCharById(student.id, sel.startId) || list[0];
                    const end = getCharById(student.id, sel.endId) || latest;

                    const startRatings = extractRatingMetrics(start.data);
                    const endRatings = extractRatingMetrics(end.data);
                    const byKeyStart = new Map(startRatings.map((r) => [r.key, r]));
                    const byKeyEnd = new Map(endRatings.map((r) => [r.key, r]));
                    const keys = Array.from(
                      new Set([
                        ...Array.from(byKeyStart.keys()),
                        ...Array.from(byKeyEnd.keys()),
                      ])
                    );
                    const deltaData = keys
                      .map((k) => {
                        const a = byKeyStart.get(k)?.value ?? 0;
                        const b = byKeyEnd.get(k)?.value ?? 0;
                        return {
                          label: fieldLabelByName[k] || k,
                          delta: Number((b - a).toFixed(2)),
                        };
                      })
                      .sort((a, b) => a.label.localeCompare(b.label, 'ru'));

                    return (
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                          Последняя характеристика: {formatPeriod(latest)}
                        </Typography>

                        {latestRatings.length > 0 && (
                          <Grid container spacing={1.5} sx={{ mt: 1 }}>
                            {latestRatings.map((m) => (
                              <Grid item xs={12} sm={6} key={m.key}>
                                <Paper sx={{ p: 1.5 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 650 }}>
                                    {m.label}
                                  </Typography>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                    <Rating value={m.value} readOnly precision={0.5} />
                                    <Chip size="small" label={m.value} />
                                  </Box>
                                </Paper>
                              </Grid>
                            ))}
                          </Grid>
                        )}

                        <Divider sx={{ my: 2 }} />

                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                          Сравнение периода
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Выберите “от” и “до”, чтобы увидеть, как изменились оценки по критериям.
                        </Typography>

                        <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
                          <FormControl size="small" sx={{ minWidth: 220 }}>
                            <InputLabel>От</InputLabel>
                            <Select
                              label="От"
                              value={sel.startId ?? list[0].id}
                              onChange={(e) =>
                                setRangeSelection((prev) => ({
                                  ...prev,
                                  [student.id]: { ...prev[student.id], startId: Number(e.target.value) },
                                }))
                              }
                            >
                              {list.map((c) => (
                                <MenuItem key={c.id} value={c.id}>
                                  {formatPeriod(c)}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>

                          <FormControl size="small" sx={{ minWidth: 220 }}>
                            <InputLabel>До</InputLabel>
                            <Select
                              label="До"
                              value={sel.endId ?? latest.id}
                              onChange={(e) =>
                                setRangeSelection((prev) => ({
                                  ...prev,
                                  [student.id]: { ...prev[student.id], endId: Number(e.target.value) },
                                }))
                              }
                            >
                              {list.map((c) => (
                                <MenuItem key={c.id} value={c.id}>
                                  {formatPeriod(c)}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Box>

                        {deltaData.length > 0 ? (
                          <Box sx={{ height: 260, mt: 2 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={deltaData} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="label" hide />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="delta" fill="#7C3AED" radius={[6, 6, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                            <Typography variant="caption" color="text.secondary">
                              Положительное значение = рост, отрицательное = снижение (по шкале 1–5).
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                            Для сравнения нет числовых шкал (полей вида *_rating).
                          </Typography>
                        )}
                      </Box>
                    );
                  })()}
                </AccordionDetails>
              </Accordion>

              {/* Динамика средней оценки */}
              <Accordion sx={{ mt: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Динамика средней оценки</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {(() => {
                    const dyn = gradeDynamics[student.id];
                    const points = dyn?.dynamics || [];
                    if (!points.length) {
                      return (
                        <Typography variant="body2" color="text.secondary">
                          Пока недостаточно данных для графика.
                        </Typography>
                      );
                    }
                    const chartData = points.map((p) => ({
                      month: formatMonth(p.month),
                      average: p.average_grade,
                    }));
                    return (
                      <Box sx={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis domain={[0, 5]} />
                            <Tooltip />
                            <Line type="monotone" dataKey="average" stroke="#2563EB" strokeWidth={2} dot />
                          </LineChart>
                        </ResponsiveContainer>
                      </Box>
                    );
                  })()}
                </AccordionDetails>
              </Accordion>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Layout>
  );
};

export default ParentDashboardPage;

