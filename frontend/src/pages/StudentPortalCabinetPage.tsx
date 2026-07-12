import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  CardMedia,
  Button,
  CircularProgress,
  Alert,
  Stack,
  LinearProgress,
  Chip,
  Divider,
  Paper,
} from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { studentPortalApi, StudentPortalProfile, UpcomingLesson } from '../services/studentPortalApi';
import { CourseCatalogItemOut } from '../types';

const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_NAMES = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (d.getTime() === today.getTime()) return 'Сегодня';
  if (d.getTime() === tomorrow.getTime()) return 'Завтра';
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

function formatTime(t: string): string {
  return t.slice(0, 5);
}

const StudentPortalCabinetPage: React.FC = () => {
  const [profile, setProfile] = useState<StudentPortalProfile | null>(null);
  const [courses, setCourses] = useState<CourseCatalogItemOut[]>([]);
  const [schedule, setSchedule] = useState<UpcomingLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [launchingId, setLaunchingId] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!studentPortalApi.getToken()) {
      navigate('/student-portal/login', { replace: true });
      return;
    }
    setLoading(true);
    Promise.all([
      studentPortalApi.me(),
      studentPortalApi.listCourses(),
      studentPortalApi.getSchedule(),
    ])
      .then(([me, courseList, lessonList]) => {
        setProfile(me);
        setCourses(courseList);
        setSchedule(lessonList);
      })
      .catch((err: any) => setError(err.response?.data?.detail || err.message || 'Не удалось загрузить кабинет'))
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleLaunch = async (itemId: number) => {
    setLaunchingId(itemId);
    setError(null);
    try {
      const { redirect_url } = await studentPortalApi.launchCourse(itemId);
      window.location.href = redirect_url;
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Не удалось открыть курс');
      setLaunchingId(null);
    }
  };

  const handleLogout = () => {
    studentPortalApi.logout();
    navigate('/student-portal/login', { replace: true });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Группируем уроки по дате
  const scheduleByDate: Record<string, UpcomingLesson[]> = {};
  for (const lesson of schedule) {
    if (!scheduleByDate[lesson.lesson_date]) scheduleByDate[lesson.lesson_date] = [];
    scheduleByDate[lesson.lesson_date].push(lesson);
  }
  const scheduleDates = Object.keys(scheduleByDate).sort();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FAFAF8', p: { xs: 2, sm: 4 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5">Привет, {profile?.full_name}!</Typography>
          <Typography variant="body2" color="text.secondary">Личный кабинет</Typography>
        </Box>
        <Button variant="text" onClick={handleLogout}>Выйти</Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Расписание */}
      <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
        Расписание
      </Typography>

      {scheduleDates.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 2, mb: 4 }}>
          <Typography variant="body2" color="text.secondary">
            Ближайших занятий нет.
          </Typography>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ mb: 4, overflow: 'hidden' }}>
          {scheduleDates.map((dateStr, di) => (
            <Box key={dateStr}>
              {di > 0 && <Divider />}
              <Box sx={{ px: 2, py: 1.5 }}>
                <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
                  <CalendarTodayIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="subtitle2" fontWeight={700}>
                    {formatDate(dateStr)}
                  </Typography>
                </Stack>
                <Stack spacing={1}>
                  {scheduleByDate[dateStr].map((lesson, li) => (
                    <Stack key={li} direction="row" alignItems="center" gap={1.5} sx={{ pl: 0.5 }}>
                      <Stack direction="row" alignItems="center" gap={0.5} sx={{ minWidth: 100 }}>
                        <AccessTimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary">
                          {formatTime(lesson.start_time)}
                          {lesson.end_time ? `–${formatTime(lesson.end_time)}` : ''}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ flexGrow: 1 }}>
                        {lesson.group_name ?? 'Доп. занятие'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {lesson.trainer_name}
                      </Typography>
                      {lesson.kind === 'custom' && (
                        <Chip label="Отработка" size="small" variant="outlined" color="info" />
                      )}
                    </Stack>
                  ))}
                </Stack>
              </Box>
            </Box>
          ))}
        </Paper>
      )}

      {/* Курсы */}
      <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
        Мои курсы
      </Typography>

      {courses.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Пока нет доступных курсов. Обратитесь к тренеру.
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(280px, 1fr))' }, gap: 2 }}>
          {courses.map((course) => {
            const p = course.progress;
            const pct = p && p.cases_total > 0 ? Math.round((p.cases_solved / p.cases_total) * 100) : null;

            return (
              <Card key={course.id} variant="outlined" sx={{ display: 'flex', flexDirection: 'column' }}>
                {course.cover_image_url && (
                  <CardMedia
                    component="img"
                    height={140}
                    image={course.cover_image_url}
                    alt={course.name}
                    sx={{ objectFit: 'cover' }}
                  />
                )}
                <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                  <Typography variant="h6" gutterBottom>{course.name}</Typography>

                  {course.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                      {course.description}
                    </Typography>
                  )}

                  {p && (
                    <Box sx={{ mt: 1.5 }}>
                      {pct !== null && (
                        <Box sx={{ mb: 1 }}>
                          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">Прогресс</Typography>
                            <Typography variant="caption" fontWeight={600}>
                              {p.cases_solved} / {p.cases_total} задач ({pct}%)
                            </Typography>
                          </Stack>
                          <LinearProgress variant="determinate" value={pct} sx={{ height: 8, borderRadius: 4 }} />
                        </Box>
                      )}
                      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1, gap: 0.5 }}>
                        {p.rank_name && (
                          <Chip icon={<MilitaryTechIcon fontSize="small" />} label={p.rank_name} size="small" color="primary" variant="outlined" />
                        )}
                        {p.badges_count > 0 && (
                          <Chip
                            icon={<EmojiEventsIcon fontSize="small" />}
                            label={p.last_badge_name ?? `${p.badges_count} бейдж${p.badges_count === 1 ? '' : 'ей'}`}
                            size="small" color="warning" variant="outlined"
                          />
                        )}
                      </Stack>
                    </Box>
                  )}
                </CardContent>

                <CardActions sx={{ px: 2, pb: 2 }}>
                  <Button
                    variant="contained"
                    fullWidth
                    disabled={launchingId === course.id}
                    onClick={() => handleLaunch(course.id)}
                  >
                    {launchingId === course.id ? 'Открываем…' : 'Открыть курс'}
                  </Button>
                </CardActions>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default StudentPortalCabinetPage;
