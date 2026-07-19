import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Stack,
  LinearProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SchoolIcon from '@mui/icons-material/School';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import StarIcon from '@mui/icons-material/Star';
import { studentPortalApi, StudentPortalProfile, UpcomingLesson, StudentGrade } from '../services/studentPortalApi';
import { CourseCatalogItemOut } from '../types';

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_NAMES = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (d.getTime() === today.getTime()) return 'Сегодня';
  if (d.getTime() === tomorrow.getTime()) return 'Завтра';
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function formatTime(t: string): string { return t.slice(0, 5); }

// ── grade color ──────────────────────────────────────────────────────────────
function gradeColor(g: number) {
  if (g >= 5) return { bg: '#22C55E', text: '#fff' };
  if (g >= 4) return { bg: '#84CC16', text: '#fff' };
  if (g >= 3) return { bg: '#F59E0B', text: '#fff' };
  return { bg: '#EF4444', text: '#fff' };
}

const StudentPortalCabinetPage: React.FC = () => {
  const [profile, setProfile] = useState<StudentPortalProfile | null>(null);
  const [courses, setCourses] = useState<CourseCatalogItemOut[]>([]);
  const [schedule, setSchedule] = useState<UpcomingLesson[]>([]);
  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [abonement, setAbonement] = useState<{ name: string; training_start_date: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<number | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!studentPortalApi.getToken()) { navigate('/student-portal/login', { replace: true }); return; }
    setLoading(true);
    Promise.all([
      studentPortalApi.me(),
      studentPortalApi.listCourses(),
      studentPortalApi.getSchedule(),
      studentPortalApi.getGrades(),
      studentPortalApi.getAbonement(),
    ])
      .then(([me, courseList, lessonList, gradeList, abon]) => {
        setProfile(me); setCourses(courseList); setSchedule(lessonList);
        setGrades(gradeList); setAbonement(abon);
      })
      .catch((err: any) => setError(err.response?.data?.detail || err.message || 'Не удалось загрузить кабинет'))
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleLaunch = async (itemId: number) => {
    setLaunchingId(itemId); setError(null);
    try { const { redirect_url } = await studentPortalApi.launchCourse(itemId); window.location.href = redirect_url; }
    catch (err: any) { setError(err.response?.data?.detail || err.message || 'Не удалось открыть курс'); setLaunchingId(null); }
  };

  const handleLogout = () => { studentPortalApi.logout(); navigate('/student-portal/login', { replace: true }); };
  const handlePwOpen = () => { setPwOpen(true); setPwError(null); setPwSuccess(false); setPwCurrent(''); setPwNew(''); setPwConfirm(''); };
  const handlePwClose = () => { if (!pwLoading) setPwOpen(false); };
  const handlePwSubmit = async () => {
    setPwError(null);
    if (pwNew.length < 6) { setPwError('Новый пароль — минимум 6 символов'); return; }
    if (pwNew !== pwConfirm) { setPwError('Пароли не совпадают'); return; }
    setPwLoading(true);
    try { await studentPortalApi.changePassword(pwCurrent, pwNew); setPwSuccess(true); setTimeout(() => setPwOpen(false), 1500); }
    catch (err: any) { setPwError(err.response?.data?.detail || 'Ошибка смены пароля'); }
    finally { setPwLoading(false); }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', gap: 2, bgcolor: '#0F0A1E' }}>
        <Box sx={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#7F23CC,#AB67E5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <SchoolIcon sx={{ color: '#fff', fontSize: 24 }} />
        </Box>
        <CircularProgress sx={{ color: '#AB67E5' }} size={28} />
      </Box>
    );
  }

  const scheduleByDate: Record<string, UpcomingLesson[]> = {};
  for (const lesson of schedule) {
    if (!scheduleByDate[lesson.lesson_date]) scheduleByDate[lesson.lesson_date] = [];
    scheduleByDate[lesson.lesson_date].push(lesson);
  }
  const scheduleDates = Object.keys(scheduleByDate).sort();

  const totalTasks = courses.reduce((s, c) => s + (c.progress?.cases_total ?? 0), 0);
  const solvedTasks = courses.reduce((s, c) => s + (c.progress?.cases_solved ?? 0), 0);
  const totalBadges = courses.reduce((s, c) => s + (c.progress?.badges_count ?? 0), 0);
  const overallPct = totalTasks > 0 ? Math.round((solvedTasks / totalTasks) * 100) : 0;
  const firstName = profile?.full_name?.split(' ')[0] ?? profile?.full_name ?? '';
  const initials = profile?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?';

  return (
    <Box sx={{
      minHeight: '100vh',
      bgcolor: '#0F0A1E',
      backgroundImage: 'radial-gradient(ellipse 60% 50% at 80% -10%, rgba(127,35,204,0.35) 0%, transparent 70%), radial-gradient(ellipse 50% 40% at -10% 80%, rgba(171,103,229,0.2) 0%, transparent 70%)',
      fontFamily: '"Nunito", "Rubik", sans-serif',
    }}>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <Box sx={{
        px: { xs: 2.5, sm: 4, md: 6 },
        pt: { xs: 3, sm: 4 },
        pb: { xs: 3, sm: 4 },
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative blobs */}
        <Box sx={{ position: 'absolute', top: -60, right: -40, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(127,35,204,0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: -40, left: '30%', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(171,103,229,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ position: 'relative', zIndex: 1 }}>
          {/* Avatar + greeting */}
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={{ xs: 2, sm: 3 }} alignItems={{ xs: 'flex-start', sm: 'center' }}>
            {/* Avatar */}
            <Box sx={{
              width: { xs: 64, sm: 80 },
              height: { xs: 64, sm: 80 },
              borderRadius: '20px',
              background: 'linear-gradient(135deg, #7F23CC 0%, #AB67E5 100%)',
              boxShadow: '0 8px 32px rgba(127,35,204,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: { xs: 24, sm: 32 },
              fontWeight: 900,
              color: '#fff',
              flexShrink: 0,
              letterSpacing: '-0.5px',
            }}>
              {initials}
            </Box>
            <Box>
              <Typography sx={{
                fontSize: { xs: '1.6rem', sm: '2.2rem' },
                fontWeight: 900,
                color: '#fff',
                lineHeight: 1.15,
                letterSpacing: '-0.5px',
              }}>
                Привет, {firstName}! 👋
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.95rem', mt: 0.5 }}>
                {abonement ? abonement.name : 'Личный кабинет ученика'}
              </Typography>
            </Box>
          </Stack>

          {/* Actions */}
          <Stack direction="row" gap={1} sx={{ flexShrink: 0 }}>
            <IconButton
              onClick={handlePwOpen}
              size="small"
              sx={{ color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', '&:hover': { color: '#fff', borderColor: 'rgba(255,255,255,0.3)', bgcolor: 'rgba(255,255,255,0.08)' } }}
              title="Сменить пароль"
            >
              <LockOutlinedIcon fontSize="small" />
            </IconButton>
            <IconButton
              onClick={handleLogout}
              size="small"
              sx={{ color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', '&:hover': { color: '#FF6B6B', borderColor: 'rgba(255,107,107,0.3)', bgcolor: 'rgba(255,107,107,0.08)' } }}
              title="Выйти"
            >
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>

        {/* Stats bar */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
          gap: 1.5,
          mt: 3,
          position: 'relative',
          zIndex: 1,
        }}>
          {[
            { icon: <SchoolIcon sx={{ fontSize: 20, color: '#AB67E5' }} />, label: 'Курсов', value: courses.length },
            { icon: <TaskAltIcon sx={{ fontSize: 20, color: '#22C55E' }} />, label: 'Задач решено', value: solvedTasks },
            { icon: <EmojiEventsIcon sx={{ fontSize: 20, color: '#F59E0B' }} />, label: 'Значков', value: totalBadges },
            { icon: <StarIcon sx={{ fontSize: 20, color: '#60A5FA' }} />, label: 'Прогресс', value: `${overallPct}%` },
          ].map(stat => (
            <Box key={stat.label} sx={{
              bgcolor: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '14px',
              p: { xs: 1.5, sm: 2 },
              backdropFilter: 'blur(8px)',
              transition: 'all 0.2s',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.14)' },
            }}>
              <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
                {stat.icon}
                <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {stat.label}
                </Typography>
              </Stack>
              <Typography sx={{ color: '#fff', fontSize: { xs: '1.5rem', sm: '1.8rem' }, fontWeight: 900, lineHeight: 1 }}>
                {stat.value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <Box sx={{ px: { xs: 2.5, sm: 4, md: 6 }, pb: 6 }}>
        {error && <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setError(null)}>{error}</Alert>}

        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1fr 360px' },
          gap: 2.5,
          alignItems: 'start',
        }}>
          {/* ── Left column ──────────────────────────────────────────────── */}
          <Stack gap={2.5}>

            {/* Schedule */}
            <Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', mb: 1.5 }}>
                📅 Расписание занятий
              </Typography>
              {scheduleDates.length === 0 ? (
                <EmptyCard>
                  <CalendarTodayIcon sx={{ fontSize: 32, color: 'rgba(255,255,255,0.15)', mb: 1 }} />
                  <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.9rem' }}>Ближайших занятий нет</Typography>
                </EmptyCard>
              ) : (
                <Stack gap={1.5}>
                  {scheduleDates.map((dateStr) => {
                    const isToday = formatDate(dateStr) === 'Сегодня';
                    const isTomorrow = formatDate(dateStr) === 'Завтра';
                    return (
                      <Box key={dateStr} sx={{
                        bgcolor: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${isToday ? 'rgba(127,35,204,0.5)' : 'rgba(255,255,255,0.07)'}`,
                        borderRadius: '16px',
                        overflow: 'hidden',
                        boxShadow: isToday ? '0 0 0 1px rgba(127,35,204,0.2), 0 8px 24px rgba(127,35,204,0.12)' : 'none',
                      }}>
                        {/* Date header */}
                        <Box sx={{
                          px: 2.5, py: 1.5,
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                          background: isToday ? 'linear-gradient(90deg, rgba(127,35,204,0.2) 0%, transparent 100%)' : 'transparent',
                          display: 'flex', alignItems: 'center', gap: 1.5,
                        }}>
                          <Box sx={{
                            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                            bgcolor: isToday ? '#AB67E5' : isTomorrow ? '#60A5FA' : 'rgba(255,255,255,0.2)',
                            boxShadow: isToday ? '0 0 8px #AB67E5' : 'none',
                          }} />
                          <Typography sx={{
                            color: isToday ? '#AB67E5' : 'rgba(255,255,255,0.7)',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            letterSpacing: 0.3,
                          }}>
                            {formatDate(dateStr)}
                          </Typography>
                          {isToday && (
                            <Box sx={{ ml: 'auto', bgcolor: 'rgba(127,35,204,0.3)', border: '1px solid rgba(171,103,229,0.4)', borderRadius: 2, px: 1, py: 0.25 }}>
                              <Typography sx={{ color: '#AB67E5', fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>сегодня</Typography>
                            </Box>
                          )}
                        </Box>
                        {/* Lessons */}
                        {scheduleByDate[dateStr].map((lesson, li) => (
                          <Box key={li} sx={{
                            px: 2.5, py: 1.5,
                            display: 'flex', alignItems: 'center', gap: 2,
                            borderBottom: li < scheduleByDate[dateStr].length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                          }}>
                            <Box sx={{
                              display: 'flex', alignItems: 'center', gap: 0.75,
                              minWidth: 90, flexShrink: 0,
                            }}>
                              <AccessTimeIcon sx={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }} />
                              <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                {formatTime(lesson.start_time)}{lesson.end_time ? `–${formatTime(lesson.end_time)}` : ''}
                              </Typography>
                            </Box>
                            <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.9rem', fontWeight: 600, flexGrow: 1 }}>
                              {lesson.group_name ?? 'Доп. занятие'}
                            </Typography>
                            {lesson.trainer_name && (
                              <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.78rem', flexShrink: 0 }}>
                                {lesson.trainer_name}
                              </Typography>
                            )}
                            {lesson.kind === 'custom' && (
                              <Box sx={{ bgcolor: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 1.5, px: 1, py: 0.25 }}>
                                <Typography sx={{ color: '#60A5FA', fontSize: '0.65rem', fontWeight: 700 }}>отработка</Typography>
                              </Box>
                            )}
                            {lesson.online_url && (
                              <Box
                                component="a"
                                href={lesson.online_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                sx={{
                                  display: 'flex', alignItems: 'center', gap: 0.5,
                                  bgcolor: 'rgba(139,92,246,0.15)',
                                  border: '1px solid rgba(139,92,246,0.4)',
                                  borderRadius: 1.5, px: 1, py: 0.25,
                                  textDecoration: 'none',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s',
                                  '&:hover': { bgcolor: 'rgba(139,92,246,0.3)', borderColor: 'rgba(139,92,246,0.7)' },
                                }}
                              >
                                <Typography sx={{ color: '#A78BFA', fontSize: '0.65rem', fontWeight: 700 }}>▶ войти</Typography>
                              </Box>
                            )}
                          </Box>
                        ))}
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </Box>

            {/* Courses */}
            <Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', mb: 1.5 }}>
                🚀 Мои курсы
              </Typography>
              {courses.length === 0 ? (
                <EmptyCard>
                  <SchoolIcon sx={{ fontSize: 32, color: 'rgba(255,255,255,0.15)', mb: 1 }} />
                  <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.9rem' }}>Пока нет доступных курсов</Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.8rem', mt: 0.5 }}>Обратитесь к тренеру</Typography>
                </EmptyCard>
              ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(300px, 1fr))' }, gap: 2 }}>
                  {courses.map((course) => {
                    const p = course.progress;
                    const pct = p && p.cases_total > 0 ? Math.round((p.cases_solved / p.cases_total) * 100) : 0;
                    return (
                      <Box key={course.id} sx={{
                        bgcolor: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '20px',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'all 0.25s',
                        '&:hover': { border: '1px solid rgba(127,35,204,0.4)', boxShadow: '0 8px 32px rgba(127,35,204,0.2)', transform: 'translateY(-2px)' },
                      }}>
                        {course.cover_image_url ? (
                          <Box sx={{ position: 'relative', height: 160, overflow: 'hidden' }}>
                            <Box
                              component="img"
                              src={course.cover_image_url}
                              alt={course.name}
                              sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                            <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(15,10,30,0.85) 100%)' }} />
                            <Typography sx={{ position: 'absolute', bottom: 12, left: 16, right: 16, color: '#fff', fontWeight: 800, fontSize: '1.1rem', lineHeight: 1.2 }}>
                              {course.name}
                            </Typography>
                          </Box>
                        ) : (
                          <Box sx={{ height: 80, background: 'linear-gradient(135deg, rgba(127,35,204,0.3) 0%, rgba(171,103,229,0.1) 100%)', display: 'flex', alignItems: 'center', px: 2.5 }}>
                            <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '1.15rem' }}>{course.name}</Typography>
                          </Box>
                        )}

                        <Box sx={{ p: 2.5, flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {course.description && !course.cover_image_url && (
                            <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                              {course.description}
                            </Typography>
                          )}

                          {p && (
                            <Box>
                              {/* Progress bar */}
                              <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                                <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Прогресс</Typography>
                                <Typography sx={{ color: pct >= 80 ? '#22C55E' : pct >= 40 ? '#AB67E5' : 'rgba(255,255,255,0.5)', fontSize: '0.8rem', fontWeight: 700 }}>
                                  {p.cases_solved}/{p.cases_total} задач · {pct}%
                                </Typography>
                              </Stack>
                              <Box sx={{ height: 6, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                <Box sx={{
                                  height: '100%',
                                  width: `${pct}%`,
                                  borderRadius: 999,
                                  background: pct >= 80
                                    ? 'linear-gradient(90deg, #16A34A, #22C55E)'
                                    : 'linear-gradient(90deg, #7F23CC, #AB67E5)',
                                  boxShadow: pct > 0 ? '0 0 8px rgba(171,103,229,0.6)' : 'none',
                                  transition: 'width 0.8s ease',
                                }} />
                              </Box>

                              {/* Badges/rank */}
                              <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1.5 }}>
                                {p.rank_name && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: 'rgba(127,35,204,0.2)', border: '1px solid rgba(171,103,229,0.3)', borderRadius: 2, px: 1, py: 0.4 }}>
                                    <MilitaryTechIcon sx={{ fontSize: 13, color: '#AB67E5' }} />
                                    <Typography sx={{ color: '#AB67E5', fontSize: '0.75rem', fontWeight: 700 }}>{p.rank_name}</Typography>
                                  </Box>
                                )}
                                {p.badges_count > 0 && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 2, px: 1, py: 0.4 }}>
                                    <EmojiEventsIcon sx={{ fontSize: 13, color: '#F59E0B' }} />
                                    <Typography sx={{ color: '#F59E0B', fontSize: '0.75rem', fontWeight: 700 }}>
                                      {p.last_badge_name ?? `${p.badges_count} значк${p.badges_count === 1 ? '' : p.badges_count < 5 ? 'а' : 'ов'}`}
                                    </Typography>
                                  </Box>
                                )}
                              </Stack>
                            </Box>
                          )}

                          <Button
                            variant="contained"
                            fullWidth
                            disabled={launchingId === course.id}
                            onClick={() => handleLaunch(course.id)}
                            sx={{
                              mt: 'auto',
                              background: 'linear-gradient(135deg, #7F23CC, #AB67E5)',
                              borderRadius: '12px',
                              py: 1.25,
                              fontWeight: 800,
                              fontSize: '0.9rem',
                              letterSpacing: 0.3,
                              boxShadow: '0 4px 16px rgba(127,35,204,0.4)',
                              '&:hover': { boxShadow: '0 6px 24px rgba(127,35,204,0.6)', transform: 'translateY(-1px)' },
                              '&:disabled': { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' },
                            }}
                          >
                            {launchingId === course.id ? 'Открываем…' : 'Открыть курс →'}
                          </Button>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>
          </Stack>

          {/* ── Right column: Grades ──────────────────────────────────────── */}
          <Box>
            <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', mb: 1.5 }}>
              ⭐ Последние оценки
            </Typography>
            {grades.length === 0 ? (
              <EmptyCard>
                <StarIcon sx={{ fontSize: 32, color: 'rgba(255,255,255,0.15)', mb: 1 }} />
                <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.9rem' }}>Оценок пока нет</Typography>
              </EmptyCard>
            ) : (
              <Stack gap={1}>
                {grades.map((g) => {
                  const c = gradeColor(g.grade);
                  const d = new Date(g.date);
                  const dateStr = `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
                  return (
                    <Box key={g.id} sx={{
                      bgcolor: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '14px',
                      p: 2,
                      display: 'flex',
                      gap: 2,
                      alignItems: 'flex-start',
                      transition: 'all 0.2s',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.12)' },
                    }}>
                      {/* Grade badge */}
                      <Box sx={{
                        width: 44,
                        height: 44,
                        borderRadius: '12px',
                        bgcolor: c.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: '1.2rem',
                        color: c.text,
                        flexShrink: 0,
                        boxShadow: `0 4px 12px ${c.bg}60`,
                      }}>
                        {Number.isInteger(g.grade) ? g.grade : g.grade.toFixed(1)}
                      </Box>

                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.88rem', fontWeight: 600, lineHeight: 1.3, mb: 0.25 }}>
                          {g.topic_name}
                        </Typography>
                        <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>
                          {g.module_name}
                        </Typography>
                        {g.comment && (
                          <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.78rem', mt: 0.75, fontStyle: 'italic' }}>
                            «{g.comment}»
                          </Typography>
                        )}
                      </Box>

                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.73rem' }}>{dateStr}</Typography>
                        <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.7rem', mt: 0.25 }}>{g.trainer_name}</Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Box>
        </Box>
      </Box>

      {/* ── Change password dialog ────────────────────────────────────────── */}
      <Dialog open={pwOpen} onClose={handlePwClose} maxWidth="xs" fullWidth
        PaperProps={{ sx: { bgcolor: '#1A1130', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, backgroundImage: 'none' } }}
      >
        <DialogTitle sx={{ color: '#fff', fontWeight: 800 }}>Сменить пароль</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {pwSuccess ? (
              <Alert severity="success" sx={{ borderRadius: 2 }}>Пароль успешно изменён!</Alert>
            ) : (
              <>
                {pwError && <Alert severity="error" sx={{ borderRadius: 2 }}>{pwError}</Alert>}
                {[
                  { label: 'Текущий пароль', value: pwCurrent, onChange: setPwCurrent },
                  { label: 'Новый пароль', value: pwNew, onChange: setPwNew, helper: 'Минимум 6 символов' },
                  { label: 'Повторите новый пароль', value: pwConfirm, onChange: setPwConfirm },
                ].map(f => (
                  <TextField
                    key={f.label}
                    label={f.label}
                    type="password"
                    size="small"
                    fullWidth
                    value={f.value}
                    onChange={(e) => f.onChange(e.target.value)}
                    disabled={pwLoading}
                    helperText={f.helper}
                    sx={{
                      '& .MuiOutlinedInput-root': { borderRadius: 2, color: '#fff', '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' }, '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' } },
                      '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
                      '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.3)' },
                    }}
                  />
                ))}
              </>
            )}
          </Stack>
        </DialogContent>
        {!pwSuccess && (
          <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
            <Button onClick={handlePwClose} disabled={pwLoading} sx={{ color: 'rgba(255,255,255,0.5)', borderRadius: 2 }}>Отмена</Button>
            <Button
              variant="contained"
              onClick={handlePwSubmit}
              disabled={pwLoading || !pwCurrent || !pwNew || !pwConfirm}
              sx={{ background: 'linear-gradient(135deg,#7F23CC,#AB67E5)', borderRadius: 2, fontWeight: 700, boxShadow: '0 4px 12px rgba(127,35,204,0.4)' }}
            >
              {pwLoading ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </Box>
  );
};

// ── helper ───────────────────────────────────────────────────────────────────
const EmptyCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box sx={{
    bgcolor: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '16px',
    p: 4,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  }}>
    {children}
  </Box>
);

export default StudentPortalCabinetPage;
