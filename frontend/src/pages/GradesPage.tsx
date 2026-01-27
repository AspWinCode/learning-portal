import React, { useMemo, useState, useEffect } from 'react';
import Layout from '../components/Layout';
import {
  Typography,
  Box,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { gradesApi, studentsApi, programsApi } from '../services/api';
import { Grade, Student, Program } from '../types';
import { useAuth } from '../contexts/AuthContext';

type TopicOption = {
  id: number;
  label: string;
  status: string;
};

type GroupedGrades = Array<{
  moduleName: string;
  grades: Grade[];
}>;

const gradeColor = (g?: number) => {
  if (g === undefined || g === null || Number.isNaN(g)) return { bg: 'rgba(148,163,184,0.18)', fg: '#334155' };
  if (g >= 4.5) return { bg: 'rgba(34,197,94,0.22)', fg: '#14532d' };
  if (g >= 3.5) return { bg: 'rgba(132,204,22,0.22)', fg: '#365314' };
  if (g >= 2.5) return { bg: 'rgba(245,158,11,0.22)', fg: '#7c2d12' };
  return { bg: 'rgba(239,68,68,0.22)', fg: '#7f1d1d' };
};

const GradeSquare: React.FC<{ value?: number; title?: string }> = ({ value, title }) => {
  const { bg, fg } = gradeColor(value);
  return (
    <Box
      title={title}
      sx={{
        width: 28,
        height: 28,
        borderRadius: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
        color: fg,
        border: '1px solid rgba(15, 23, 42, 0.08)',
        fontWeight: 800,
        fontSize: 13,
        flex: '0 0 auto',
      }}
    >
      {typeof value === 'number' && Number.isFinite(value) ? value : '-'}
    </Box>
  );
};

const GradesPage: React.FC = () => {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState<string>('');
  const [topicId, setTopicId] = useState<string>('');
  const [availableTopics, setAvailableTopics] = useState<TopicOption[]>([]);
  const [gradeValue, setGradeValue] = useState<string>('5');
  const [comment, setComment] = useState<string>('');
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [error, setError] = useState<string>('');
  const [info, setInfo] = useState<string>('');
  const [historyStudentId, setHistoryStudentId] = useState<string>('');
  const [historyProgram, setHistoryProgram] = useState<Program | null>(null);
  const [groupedHistory, setGroupedHistory] = useState<GroupedGrades>([]);
  const [historyProgress, setHistoryProgress] = useState<any>(null);
  const { user } = useAuth();
  const isAdminLike = user?.role === 'admin' || user?.role === 'owner';

  useEffect(() => {
    loadGrades();
    if (user?.role === 'trainer' || user?.role === 'parent' || isAdminLike) {
      loadStudents();
    }
  }, []);

  const loadGrades = async (params?: any) => {
    try {
      const data = await gradesApi.getAll(params);
      setGrades(data);
    } catch (err) {
      console.error('Ошибка загрузки оценок', err);
    }
  };

  const loadStudents = async () => {
    try {
      // для тренера/родителя backend вернет ограниченный список по правам
      // для админа — всех (по умолчанию)
      const data = await studentsApi.getAll(isAdminLike ? { status: 'active' } : undefined);
      setStudents(data.filter((s) => s.status === 'active'));
    } catch (err) {
      console.error('Ошибка загрузки учеников', err);
    }
  };

  const buildTopicOptions = (program: Program, gradedTopicIds: Set<number>): TopicOption[] => {
    const options: TopicOption[] = [];
    for (const module of program.modules) {
      for (const topic of module.topics) {
        const topicStatus = topic.status;
        // Тренеру для выставления показываем только активные темы, которые еще не оценены
        if (topicStatus === 'active' && !gradedTopicIds.has(topic.id)) {
          options.push({
            id: topic.id,
            status: topicStatus,
            label: `${module.name} — ${topic.name}`,
          });
        }
      }
    }
    return options;
  };

  const handleStudentSelect = async (newStudentId: string) => {
    setStudentId(newStudentId);
    setTopicId('');
    setAvailableTopics([]);
    setError('');
    setInfo('');

    if (!newStudentId) return;

    try {
      const sid = parseInt(newStudentId);
      // Уже выставленные оценки по ученику (чтобы убрать темы из списка)
      const studentGrades = await gradesApi.getAll({ student_id: sid });
      const gradedTopicIds = new Set<number>(studentGrades.map((g) => g.topic_id));

      // Узнаем назначенную программу через прогресс-эндпоинт
      const progress = await gradesApi.getStudentProgress(sid);
      const programId = progress?.program_id;
      if (!programId) {
        setInfo('Ученику не назначена программа — сначала назначьте программу.');
        return;
      }

      const program = await programsApi.getById(programId);
      const options = buildTopicOptions(program, gradedTopicIds);
      setAvailableTopics(options);

      if (options.length === 0) {
        setInfo('Нет доступных тем для оценки (все темы оценены или неактивны).');
      }
    } catch (err: any) {
      console.error('Ошибка загрузки тем для оценки:', err);
      // Частый кейс: нет программы у ученика
      const detail = err.response?.data?.detail;
      const status = err.response?.status;
      
      if (detail === 'No program assigned to student') {
        setInfo('Ученику не назначена программа — сначала назначьте программу.');
        return;
      }
      
      if (status === 403 && detail === 'Not enough permissions') {
        setError('Нет доступа к программе. Обратитесь к администратору.');
        return;
      }
      
      if (detail === 'Program is archived. Please contact administrator.') {
        setError('Программа архивирована. Обратитесь к администратору.');
        return;
      }
      
      if (status === 404) {
        setError('Программа не найдена. Обратитесь к администратору.');
        return;
      }
      
      setError(detail || 'Ошибка загрузки тем для оценки');
    }
  };

  const handleCreateGrade = async () => {
    setError('');
    setInfo('');

    if (!studentId) {
      setError('Выберите ученика');
      return;
    }
    if (!topicId) {
      setError('Выберите тему');
      return;
    }
    const g = parseFloat(gradeValue);
    if (Number.isNaN(g) || g < 0 || g > 5) {
      setError('Оценка должна быть числом от 0 до 5');
      return;
    }
    if (!date) {
      setError('Укажите дату');
      return;
    }

    try {
      await gradesApi.create({
        student_id: parseInt(studentId),
        topic_id: parseInt(topicId),
        grade: g,
        comment: comment.trim() || undefined,
        date: new Date(`${date}T00:00:00`).toISOString(),
      } as any);

      setInfo('Оценка сохранена');
      setTopicId('');
      setComment('');
      await loadGrades();
      // обновить доступные темы
      await handleStudentSelect(studentId);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка сохранения оценки');
    }
  };

  const buildGroupedHistory = (program: Program | null, historyGrades: Grade[]): GroupedGrades => {
    if (!program) {
      return [{ moduleName: 'Все оценки', grades: historyGrades }];
    }

    const topicToModule = new Map<number, string>();
    const topicOrder = new Map<number, number>();
    const moduleOrder = new Map<string, number>();

    program.modules.forEach((m, mi) => {
      moduleOrder.set(m.name, mi);
      m.topics.forEach((t) => {
        topicToModule.set(t.id, m.name);
        topicOrder.set(t.id, t.order ?? 0);
      });
    });

    const buckets = new Map<string, Grade[]>();
    for (const g of historyGrades) {
      const m = topicToModule.get(g.topic_id) || 'Другое';
      if (!buckets.has(m)) buckets.set(m, []);
      buckets.get(m)!.push(g);
    }

    const grouped: GroupedGrades = Array.from(buckets.entries()).map(([moduleName, gs]) => {
      const sorted = [...gs].sort((a, b) => {
        const ao = topicOrder.get(a.topic_id) ?? 9999;
        const bo = topicOrder.get(b.topic_id) ?? 9999;
        if (ao !== bo) return ao - bo;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
      return { moduleName, grades: sorted };
    });

    grouped.sort((a, b) => (moduleOrder.get(a.moduleName) ?? 9999) - (moduleOrder.get(b.moduleName) ?? 9999));
    return grouped;
  };

  const handleHistoryStudentChange = async (newId: string) => {
    setHistoryStudentId(newId);
    setHistoryProgram(null);
    setGroupedHistory([]);
    setHistoryProgress(null);
    setError('');
    setInfo('');

    // Админ может выбрать "Все"
    if (!newId) {
      await loadGrades();
      return;
    }

    const sid = parseInt(newId);
    try {
      const historyGrades = await gradesApi.getAll({ student_id: sid });
      setGrades(historyGrades);

      if (historyGrades.length === 0) {
        setInfo('По выбранному ученику пока нет оценок.');
      }

      // Программа ученика (если назначена) — для группировки по модулям/темам
      try {
        const progress = await gradesApi.getStudentProgress(sid);
        setHistoryProgress(progress);
        const programId = progress?.program_id;
        if (programId) {
          const program = await programsApi.getById(programId);
          setHistoryProgram(program);
          setGroupedHistory(buildGroupedHistory(program, historyGrades));
          return;
        }
      } catch {
        // игнор — покажем плоско
      }

      setGroupedHistory(buildGroupedHistory(null, historyGrades));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка загрузки истории оценок');
    }
  };

  const moduleRowTable = useMemo(() => {
    if (!historyStudentId || !historyProgram) return null;
    if (!grades || grades.length === 0) return null;

    // берем последнюю оценку по теме (если вдруг их несколько)
    const latestByTopic = new Map<number, Grade>();
    for (const g of grades) {
      const prev = latestByTopic.get(g.topic_id);
      if (!prev) {
        latestByTopic.set(g.topic_id, g);
        continue;
      }
      if (new Date(g.date).getTime() >= new Date(prev.date).getTime()) {
        latestByTopic.set(g.topic_id, g);
      }
    }

    const modules = (historyProgram.modules || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const rows = modules.map((m) => {
      const topics = (m.topics || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const gradesList = topics.map((t) => latestByTopic.get(t.id)?.grade);
      const graded = gradesList.filter((x) => typeof x === 'number' && Number.isFinite(x)) as number[];
      const avg = graded.length ? graded.reduce((a, c) => a + c, 0) / graded.length : null;
      return { moduleName: m.name, topics, gradesList, avg };
    });

    const all = Array.from(latestByTopic.values())
      .map((g) => Number(g.grade))
      .filter((x) => Number.isFinite(x)) as number[];
    const totalAvg = all.length ? all.reduce((a, c) => a + c, 0) / all.length : null;

    return { rows, totalAvg };
  }, [grades, historyProgram, historyStudentId]);

  return (
    <Layout>
      <Typography variant="h4" gutterBottom>
        Оценки
      </Typography>

      {(error || info) && (
        <Box sx={{ mb: 2 }}>
          {error && (
            <Alert severity="error" onClose={() => setError('')}>
              {error}
            </Alert>
          )}
          {info && (
            <Alert severity="info" onClose={() => setInfo('')} sx={{ mt: error ? 1 : 0 }}>
              {info}
            </Alert>
          )}
        </Box>
      )}

      {user?.role === 'trainer' && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Поставить оценку
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel>Ученик</InputLabel>
              <Select
                value={studentId}
                label="Ученик"
                onChange={(e) => handleStudentSelect(e.target.value)}
              >
                <MenuItem value="">
                  <em>Не выбран</em>
                </MenuItem>
                {students.map((s) => (
                  <MenuItem key={s.id} value={s.id.toString()}>
                    {s.full_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 320 }}>
              <InputLabel>Тема</InputLabel>
              <Select
                value={topicId}
                label="Тема"
                onChange={(e) => setTopicId(e.target.value)}
                disabled={!studentId || availableTopics.length === 0}
              >
                <MenuItem value="">
                  <em>Не выбрана</em>
                </MenuItem>
                {availableTopics.map((t) => (
                  <MenuItem key={t.id} value={t.id.toString()}>
                    {t.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              size="small"
              label="Оценка (0–5)"
              value={gradeValue}
              onChange={(e) => setGradeValue(e.target.value)}
              sx={{ width: 140 }}
            />

            <TextField
              size="small"
              label="Дата"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              sx={{ width: 180 }}
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              size="small"
              label="Комментарий"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              sx={{ flex: '1 1 320px' }}
            />

            <Button
              variant="contained"
              onClick={handleCreateGrade}
              disabled={!studentId || !topicId}
            >
              Сохранить
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Для выставления доступны только активные темы, по которым ещё нет оценки.
          </Typography>
        </Paper>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          История оценок
        </Typography>

        {(isAdminLike || user?.role === 'trainer' || user?.role === 'parent') && (
          <FormControl size="small" sx={{ minWidth: 320, mb: 2 }}>
            <InputLabel>Ученик</InputLabel>
            <Select
              value={historyStudentId}
              label="Ученик"
              onChange={(e) => handleHistoryStudentChange(e.target.value)}
            >
              {isAdminLike && (
                <MenuItem value="">
                  <em>Все ученики</em>
                </MenuItem>
              )}
              {students.map((s) => (
                <MenuItem key={s.id} value={s.id.toString()}>
                  {s.full_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {historyStudentId && historyProgress && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" gutterBottom>
              Прогресс: {historyProgress.progress_percent}% ({historyProgress.graded_topics} из{' '}
              {historyProgress.total_topics} тем)
            </Typography>
            <LinearProgress variant="determinate" value={historyProgress.progress_percent} />
          </Box>
        )}

        {moduleRowTable && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
              Оценки по модулям
            </Typography>
            <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 720 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 220 }}>Модуль</TableCell>
                    <TableCell>Оценки</TableCell>
                    <TableCell align="right" sx={{ width: 120 }}>
                      Средняя
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {moduleRowTable.rows.map((r) => (
                    <TableRow key={r.moduleName}>
                      <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{r.moduleName}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'nowrap', overflowX: 'auto', py: 0.25 }}>
                          {r.topics.map((t, idx) => (
                            <GradeSquare
                              key={t.id}
                              value={r.gradesList[idx]}
                              title={`${t.name}${r.gradesList[idx] ? ` — ${r.gradesList[idx]}` : ''}`}
                            />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>
                        {r.avg === null ? '-' : r.avg.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell sx={{ fontWeight: 900 }}>Итого</TableCell>
                    <TableCell />
                    <TableCell align="right" sx={{ fontWeight: 900 }}>
                      {moduleRowTable.totalAvg === null ? '-' : moduleRowTable.totalAvg.toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
              В строке модуля показаны оценки по темам (по порядку тем в программе). Если по теме нет оценки — “-”.
            </Typography>
          </Box>
        )}

        {groupedHistory.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Выберите ученика, чтобы увидеть историю (или оставьте “Все ученики”, если вы админ).
          </Typography>
        ) : (
          <Box>
            {groupedHistory.map((block) => (
              <Accordion key={block.moduleName} defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>
                    {block.moduleName}
                    {historyProgram ? '' : ' '}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <TableContainer component={Paper}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Тема</TableCell>
                          <TableCell>Оценка</TableCell>
                          <TableCell>Комментарий</TableCell>
                          <TableCell>Дата</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {block.grades.map((g) => (
                          <TableRow key={g.id}>
                            <TableCell>{g.topic?.name || `#${g.topic_id}`}</TableCell>
                            <TableCell>{g.grade}</TableCell>
                            <TableCell>{g.comment || '-'}</TableCell>
                            <TableCell>{new Date(g.date).toLocaleDateString('ru-RU')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        )}
      </Paper>
    </Layout>
  );
};

export default GradesPage;

