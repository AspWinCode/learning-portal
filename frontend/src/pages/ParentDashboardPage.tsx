import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import NpsSurveyPrompt from '../components/NpsSurveyPrompt';
import {
  Alert, Avatar, Box, Button, Chip, Divider, FormControl, Grid, InputLabel,
  LinearProgress, MenuItem, Paper, Select, Skeleton, Stack, Typography,
} from '@mui/material';
import {
  AccountBalanceWallet, ArrowForward, AssignmentTurnedIn, CalendarMonth,
  CheckCircle, ChevronRight, EventBusy, Groups, Insights, NotificationsActive,
  Payment, School, Star, TrendingUp, WarningAmber,
} from '@mui/icons-material';
import {
  CartesianGrid, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { characteristicsApi, gradesApi, parentDashboardApi, reportsApi, studentsApi } from '../services/api';
import { getStudentCodelabProgress, CodelabStudentProgress } from '../services/codelabApi';
import { ParentDashboardSummary } from '../types';
import { extractApiError } from '../utils/extractApiError';

interface ParentDashboardPageProps { previewParentId?: number; }
type DashboardStudent = { id: number; full_name: string };
type CharacteristicComparison = { current: any | null; previous: any | null; before_previous: any | null };
type AttendanceSummary = { total: number; attended: number; missed: number };

const purple = '#8738C9';
const surface = { border: '1px solid', borderColor: 'rgba(24,24,27,.09)', borderRadius: 3, boxShadow: '0 8px 24px rgba(24,24,27,.04)' };
const money = (value: number) => `${Math.abs(value).toLocaleString('ru-RU')} ₽`;
const dateOnly = (value?: string | null) => value ? new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '—';
const shortDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—';
const timeOnly = (value?: string | null) => value ? value.slice(0, 5) : '—';
const percent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function Card({ children, sx = {} }: { children: React.ReactNode; sx?: any }) {
  return <Paper sx={{ ...surface, p: { xs: 2, sm: 2.5 }, ...sx }}>{children}</Paper>;
}

function CardTitle({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 2 }}>
    <Stack direction="row" spacing={1} alignItems="center"><Box sx={{ color: purple, display: 'flex' }}>{icon}</Box><Typography fontWeight={800}>{title}</Typography></Stack>
    {action}
  </Stack>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <Box sx={{ py: 2, color: 'text.secondary' }}><Typography variant="body2">{children}</Typography></Box>;
}

const ParentDashboardPage: React.FC<ParentDashboardPageProps> = ({ previewParentId }) => {
  const navigate = useNavigate();
  const [students, setStudents] = useState<DashboardStudent[]>([]);
  const [summary, setSummary] = useState<ParentDashboardSummary>({ students: [] });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [progress, setProgress] = useState<Record<number, any>>({});
  const [comparisons, setComparisons] = useState<Record<number, CharacteristicComparison>>({});
  const [dynamics, setDynamics] = useState<Record<number, Array<{ month: string; average_grade: number }>>>({});
  const [characteristics, setCharacteristics] = useState<Record<number, any[]>>({});
  const [codelab, setCodelab] = useState<Record<number, CodelabStudentProgress | null>>({});
  const [attendance, setAttendance] = useState<Record<number, AttendanceSummary>>({});
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailErrors, setDetailErrors] = useState<string[]>([]);

  const loadDetails = async (studentList: DashboardStudent[]) => {
    const nextErrors: string[] = [];
    await Promise.all(studentList.map(async (student) => {
      const requests = await Promise.allSettled([
        gradesApi.getStudentProgress(student.id),
        reportsApi.getGradeDynamics(student.id),
        characteristicsApi.getComparison(student.id),
        characteristicsApi.getPublishedForStudent(student.id),
        studentsApi.getAttendances(student.id, 80),
        getStudentCodelabProgress(student.id),
      ]);
      const [progressResult, dynamicsResult, comparisonResult, characteristicsResult, attendanceResult, codelabResult] = requests;
      if (progressResult.status === 'fulfilled') setProgress((v) => ({ ...v, [student.id]: progressResult.value }));
      else nextErrors.push(`${student.full_name}: не удалось загрузить прогресс`);
      if (dynamicsResult.status === 'fulfilled') setDynamics((v) => ({ ...v, [student.id]: dynamicsResult.value.dynamics || [] }));
      if (comparisonResult.status === 'fulfilled') setComparisons((v) => ({ ...v, [student.id]: comparisonResult.value }));
      if (characteristicsResult.status === 'fulfilled') setCharacteristics((v) => ({ ...v, [student.id]: characteristicsResult.value }));
      if (attendanceResult.status === 'fulfilled') {
        const rows = attendanceResult.value || [];
        const attended = rows.filter((row) => row.attended).length;
        setAttendance((v) => ({ ...v, [student.id]: { total: rows.length, attended, missed: rows.length - attended } }));
      }
      if (codelabResult.status === 'fulfilled') setCodelab((v) => ({ ...v, [student.id]: codelabResult.value.started ? codelabResult.value : null }));
    }));
    setDetailErrors(nextErrors);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError('');
      try {
        const preview = previewParentId ? await parentDashboardApi.getPreview(previewParentId) : null;
        const dashboard = preview?.summary || await parentDashboardApi.getSummary();
        if (!active) return;
        setSummary(dashboard);
        const list = dashboard.students.map((item) => ({ id: item.student_id, full_name: item.student_name }));
        setStudents(list);
        setSelectedId((current) => current && list.some((student) => student.id === current) ? current : list[0]?.id || null);
        try { setTemplates((await characteristicsApi.getTemplates()).filter((template) => template.is_active)); } catch { /* optional */ }
        await loadDetails(list);
      } catch (err) {
        if (active) setError(extractApiError(err, 'Не удалось загрузить кабинет родителя.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // Route is remounted when the preview parent changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewParentId]);

  const selected = students.find((student) => student.id === selectedId) || null;
  const selectedSummary = summary.students.find((item) => item.student_id === selectedId) || null;
  const selectedProgress = selectedId ? progress[selectedId] : null;
  const selectedAttendance = selectedId ? attendance[selectedId] : undefined;
  const selectedCodelab = selectedId ? codelab[selectedId] : null;
  const selectedComparison = selectedId ? comparisons[selectedId] : undefined;
  const selectedCharacteristics = selectedId ? characteristics[selectedId] || [] : [];
  const activeTemplate = templates[0];
  const ratingLabels = useMemo(() => (activeTemplate?.fields || []).reduce((acc: Record<string, string>, field: any) => {
    acc[field.name] = field.label; return acc;
  }, {}), [activeTemplate]);
  const ratingData = useMemo(() => {
    const current = selectedComparison?.current?.data || {};
    const previous = selectedComparison?.previous?.data || {};
    return Object.entries(current)
      .filter(([key, value]) => key.endsWith('_rating') && Number.isFinite(Number(value)))
      .map(([key, value]) => ({ subject: ratingLabels[key] || key.replace(/_rating$/, '').replace(/_/g, ' '), current: Number(value), previous: Number(previous[key] || 0) }))
      .slice(0, 8);
  }, [ratingLabels, selectedComparison]);
  const gradePoints = selectedId ? (dynamics[selectedId] || []).map((point) => ({ month: shortDate(point.month), average: Number(point.average_grade) })) : [];
  const averageGrade = selectedProgress && Number.isFinite(Number(selectedProgress.average_grade)) ? Number(selectedProgress.average_grade) : null;
  const progressValue = selectedProgress && Number.isFinite(Number(selectedProgress.progress_percent)) ? percent(Number(selectedProgress.progress_percent)) : null;
  const solved = selectedCodelab?.courses.reduce((sum, course) => sum + course.tasks_solved, 0) || 0;
  const tasksTotal = selectedCodelab?.courses.reduce((sum, course) => sum + course.tasks_total, 0) || 0;
  const codelabPercent = tasksTotal > 0 ? percent((solved / tasksTotal) * 100) : null;
  const balance = selectedSummary?.current_balance ?? null;
  const nearest = selectedSummary?.nearest_lesson;
  const attentionItems = [
    balance !== null && balance < 0 ? { icon: <Payment />, title: 'Нужно пополнить баланс', text: `Задолженность ${money(balance)}.`, action: selectedSummary?.payment_link ? <Button size="small" variant="contained" href={selectedSummary.payment_link} target="_blank" rel="noreferrer">Оплатить</Button> : null } : null,
    selectedAttendance?.missed ? { icon: <EventBusy />, title: 'Есть пропущенные занятия', text: `Пропущено занятий: ${selectedAttendance.missed}. Уточните варианты отработки у преподавателя.`, action: null } : null,
    selectedSummary?.ai_insight?.weak_zone ? { icon: <TrendingUp />, title: 'Рекомендация по обучению', text: selectedSummary.ai_insight.weak_zone.recommendation || selectedSummary.ai_insight.dropout_risk.recommended_action || `Обратите внимание на тему «${selectedSummary.ai_insight.weak_zone.topic_name}».`, action: null } : null,
  ].filter(Boolean) as Array<{ icon: React.ReactNode; title: string; text: string; action: React.ReactNode }>;

  if (loading) return <Layout><Box sx={{ maxWidth: 1440, mx: 'auto' }}><Skeleton width={220} height={48} /><Skeleton variant="rounded" height={110} sx={{ mt: 2 }} /><Grid container spacing={2} sx={{ mt: 1 }}>{[1, 2, 3, 4].map((item) => <Grid item xs={12} sm={6} lg={3} key={item}><Skeleton variant="rounded" height={170} /></Grid>)}</Grid><Skeleton variant="rounded" height={320} sx={{ mt: 2 }} /></Box></Layout>;

  return <Layout>
    {!previewParentId && <NpsSurveyPrompt />}
    <Box sx={{ maxWidth: 1440, mx: 'auto', pb: 4 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2} sx={{ mb: 2.5 }}>
        <Box><Typography variant="h4" sx={{ fontWeight: 850, letterSpacing: '-.03em' }}>Обзор</Typography><Typography color="text.secondary">Состояние обучения и ближайшие важные события</Typography></Box>
        {students.length > 1 && <FormControl size="small" sx={{ minWidth: 240 }}><InputLabel>Ребёнок</InputLabel><Select label="Ребёнок" value={selectedId || ''} onChange={(event) => setSelectedId(Number(event.target.value))}>{students.map((student) => <MenuItem key={student.id} value={student.id}>{student.full_name}</MenuItem>)}</Select></FormControl>}
      </Stack>
      {previewParentId && <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>Режим просмотра кабинета родителя. Ваша авторизация сотрудника не меняется, действия от имени родителя отключены.</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {detailErrors.length > 0 && <Alert severity="warning" sx={{ mb: 2 }}>Часть аналитики временно недоступна. Основная информация кабинета продолжает работать.</Alert>}
      {!selected ? <Card><Empty>У родителя пока нет активных детей.</Empty></Card> : <>
        <Card sx={{ mb: 2.5, background: 'linear-gradient(135deg, #fff 0%, #fbf7ff 100%)' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center"><Avatar sx={{ width: 56, height: 56, bgcolor: purple, fontWeight: 800 }}>{selected.full_name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</Avatar><Box><Typography variant="h5" fontWeight={850}>{selected.full_name}</Typography><Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: .5 }}><Chip size="small" icon={<School />} label={selectedProgress?.program_id ? 'Программа обучения' : 'Обучение'} variant="outlined" /><Chip size="small" icon={<Groups />} label={nearest?.group_name || 'Группа пока не указана'} variant="outlined" /></Stack></Box></Stack>
            <Stack direction="row" spacing={1} alignItems="center"><Chip color="success" variant="outlined" label="Обучение активно" />{nearest?.trainer_name && <Typography variant="body2" color="text.secondary">Преподаватель: {nearest.trainer_name}</Typography>}</Stack>
          </Stack>
        </Card>
        {attentionItems.length > 0 && <Card sx={{ mb: 2.5, borderColor: 'rgba(217,119,6,.28)' }}><CardTitle icon={<WarningAmber />} title="Требует внимания" /><Stack spacing={1}>{attentionItems.map((item) => <Stack key={item.title} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ p: 1.5, borderRadius: 2, bgcolor: '#fff8eb' }}><Box sx={{ color: '#D97706', display: 'flex' }}>{item.icon}</Box><Box sx={{ flex: 1 }}><Typography fontWeight={750}>{item.title}</Typography><Typography variant="body2" color="text.secondary">{item.text}</Typography></Box>{item.action}</Stack>)}</Stack></Card>}
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} lg={3}><Card sx={{ height: '100%' }}><CardTitle icon={<CalendarMonth />} title="Следующее занятие" action={<Button size="small" endIcon={<ChevronRight />} onClick={() => navigate('/parent-dashboard')}>Расписание</Button>} />{nearest ? <><Typography variant="h6" fontWeight={850}>{new Date(nearest.lesson_date).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' })}</Typography><Typography variant="h5" sx={{ color: purple, fontWeight: 850, mt: .5 }}>{timeOnly(nearest.start_time)}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{nearest.group_name}</Typography><Typography variant="body2" color="text.secondary">{nearest.trainer_name || 'Преподаватель не указан'}</Typography></> : <Empty>Ближайшие занятия пока не запланированы.</Empty>}</Card></Grid>
          <Grid item xs={12} sm={6} lg={3}><Card sx={{ height: '100%' }}><CardTitle icon={<AccountBalanceWallet />} title="Баланс обучения" action={<Payment />} />{balance === null ? <Empty>Данные о балансе пока недоступны.</Empty> : <><Typography variant="h5" fontWeight={850} color={balance < 0 ? 'error.main' : 'success.main'}>{balance < 0 ? `Задолженность ${money(balance)}` : `${balance.toLocaleString('ru-RU')} ₽`}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Следующая оплата: {dateOnly(selectedSummary?.next_payment_date)}</Typography>{selectedSummary?.payment_link && <Button fullWidth variant="contained" sx={{ mt: 2 }} href={selectedSummary.payment_link} target="_blank" rel="noreferrer">Перейти к оплате</Button>}</>}</Card></Grid>
          <Grid item xs={12} sm={6} lg={3}><Card sx={{ height: '100%' }}><CardTitle icon={<AssignmentTurnedIn />} title="Освоение программы" />{progressValue === null ? <Empty>Данные о прогрессе пока недоступны.</Empty> : <><Typography variant="h5" fontWeight={850}>{progressValue}%</Typography><LinearProgress variant="determinate" value={progressValue} sx={{ mt: 2, height: 9, borderRadius: 5 }} /><Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>{selectedProgress.graded_topics ? `Оценено тем: ${selectedProgress.graded_topics} из ${selectedProgress.total_topics || '—'}` : 'Оценки по темам пока не выставлены'}</Typography></>}</Card></Grid>
          <Grid item xs={12} sm={6} lg={3}><Card sx={{ height: '100%' }}><CardTitle icon={<Star />} title="Успеваемость" action={<Button size="small" endIcon={<ArrowForward />} onClick={() => navigate('/grades')}>Все оценки</Button>} />{averageGrade === null ? <Empty>Оценки пока не выставлены.</Empty> : <><Typography variant="h4" fontWeight={850}>{averageGrade.toLocaleString('ru-RU')}<Typography component="span" color="text.secondary" fontSize="1rem"> / 5</Typography></Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Средняя оценка · {selectedProgress.graded_topics || 0} оценок по темам</Typography></>}</Card></Grid>
        </Grid>
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid item xs={12} lg={7}><Card sx={{ height: '100%' }}><CardTitle icon={<Insights />} title="Динамика успеваемости" />{gradePoints.length < 2 ? <Empty>Недостаточно данных для графика динамики.</Empty> : <Box sx={{ height: 300, width: '100%' }}><ResponsiveContainer><LineChart data={gradePoints} margin={{ top: 12, right: 12, left: -18, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="month" tick={{ fontSize: 12 }} /><YAxis domain={[0, 5]} tick={{ fontSize: 12 }} /><Tooltip formatter={(value) => [`${value} из 5`, 'Средняя оценка']} /><Line type="monotone" dataKey="average" stroke={purple} strokeWidth={3} dot={{ r: 4 }} /></LineChart></ResponsiveContainer></Box>}</Card></Grid>
          <Grid item xs={12} lg={5}><Card sx={{ height: '100%' }}><CardTitle icon={<TrendingUp />} title="Развитие навыков" action={<Button size="small" onClick={() => navigate('/characteristics')}>Подробнее</Button>} />{ratingData.length === 0 ? <Empty>Опубликованных характеристик с числовыми оценками пока нет.</Empty> : <><Box sx={{ height: 275 }}><ResponsiveContainer><RadarChart data={ratingData} outerRadius="72%"><PolarGrid /><PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} /><PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 10 }} /><Radar name="Текущий период" dataKey="current" stroke={purple} fill={purple} fillOpacity={.25} /><Radar name="Предыдущий период" dataKey="previous" stroke="#94a3b8" fill="#94a3b8" fillOpacity={.08} /></RadarChart></ResponsiveContainer></Box><Stack direction="row" spacing={1}><Chip size="small" sx={{ bgcolor: '#f3e8ff', color: purple }} label="Текущий период" /><Chip size="small" variant="outlined" label="Предыдущий период" /></Stack></>}</Card></Grid>
        </Grid>
        <Grid container spacing={2} sx={{ mt: 0 }}>
          <Grid item xs={12} md={6}><Card sx={{ height: '100%' }}><CardTitle icon={<AssignmentTurnedIn />} title="Практика Codelab" />{!selectedCodelab ? <Empty>Данные Codelab пока недоступны.</Empty> : <><Stack direction="row" justifyContent="space-between"><Box><Typography variant="h5" fontWeight={850}>{selectedCodelab.points_total.toLocaleString('ru-RU')} баллов</Typography><Typography color="text.secondary">Заработано в практических заданиях</Typography></Box><Chip label={selectedCodelab.rank_name || 'В процессе'} variant="outlined" /></Stack>{codelabPercent === null ? <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Количество доступных задач пока не указано.</Typography> : <><LinearProgress variant="determinate" value={codelabPercent} sx={{ mt: 2, height: 9, borderRadius: 5 }} /><Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}><Typography variant="body2">Решено {solved} из {tasksTotal} задач</Typography><Typography variant="body2" fontWeight={750}>{codelabPercent}%</Typography></Stack></>}{selectedCodelab.recent_submissions?.length ? <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Последняя активность: {dateOnly(selectedCodelab.recent_submissions[0].created_at)}</Typography> : null}</>}</Card></Grid>
          <Grid item xs={12} md={6}><Card sx={{ height: '100%' }}><CardTitle icon={<CheckCircle />} title="Посещаемость" />{!selectedAttendance || selectedAttendance.total === 0 ? <Empty>История посещаемости пока недоступна.</Empty> : <><Stack direction="row" spacing={3} alignItems="center"><Typography variant="h4" fontWeight={850} color={selectedAttendance.missed ? 'warning.main' : 'success.main'}>{Math.round((selectedAttendance.attended / selectedAttendance.total) * 100)}%</Typography><Box><Typography fontWeight={750}>Посещаемость</Typography><Typography variant="body2" color="text.secondary">Проведено: {selectedAttendance.total} · Посещено: {selectedAttendance.attended} · Пропущено: {selectedAttendance.missed}</Typography></Box></Stack><LinearProgress variant="determinate" value={(selectedAttendance.attended / selectedAttendance.total) * 100} color={selectedAttendance.missed ? 'warning' : 'success'} sx={{ mt: 2, height: 9, borderRadius: 5 }} /></>}</Card></Grid>
        </Grid>
        <Card sx={{ mt: 2 }}><CardTitle icon={<NotificationsActive />} title="Последние характеристики" />{selectedCharacteristics.length === 0 ? <Empty>Преподаватель пока не оставил опубликованных характеристик.</Empty> : <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} divider={<Divider orientation="vertical" flexItem />}>{selectedCharacteristics.slice(-3).reverse().map((item: any) => <Box key={item.id} sx={{ flex: 1 }}><Typography fontWeight={750}>{item.month}/{item.year}</Typography><Typography variant="body2" color="text.secondary">Опубликованная характеристика ученика</Typography></Box>)}</Stack>}</Card>
      </>}
    </Box>
  </Layout>;
};

export default ParentDashboardPage;
