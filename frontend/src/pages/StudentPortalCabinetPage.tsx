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
} from '@mui/material';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech';
import { studentPortalApi, StudentPortalProfile } from '../services/studentPortalApi';
import { CourseCatalogItemOut } from '../types';

const StudentPortalCabinetPage: React.FC = () => {
  const [profile, setProfile] = useState<StudentPortalProfile | null>(null);
  const [courses, setCourses] = useState<CourseCatalogItemOut[]>([]);
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
    Promise.all([studentPortalApi.me(), studentPortalApi.listCourses()])
      .then(([me, courseList]) => {
        setProfile(me);
        setCourses(courseList);
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

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FAFAF8', p: { xs: 2, sm: 4 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5">Привет, {profile?.full_name}!</Typography>
          <Typography variant="body2" color="text.secondary">Твои курсы</Typography>
        </Box>
        <Button variant="text" onClick={handleLogout}>Выйти</Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

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
                            <Typography variant="caption" color="text.secondary">
                              Прогресс
                            </Typography>
                            <Typography variant="caption" fontWeight={600}>
                              {p.cases_solved} / {p.cases_total} задач ({pct}%)
                            </Typography>
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={pct}
                            sx={{ height: 8, borderRadius: 4 }}
                          />
                        </Box>
                      )}

                      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1, gap: 0.5 }}>
                        {p.rank_name && (
                          <Chip
                            icon={<MilitaryTechIcon fontSize="small" />}
                            label={p.rank_name}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        )}
                        {p.badges_count > 0 && (
                          <Chip
                            icon={<EmojiEventsIcon fontSize="small" />}
                            label={p.last_badge_name ? p.last_badge_name : `${p.badges_count} бейдж${p.badges_count === 1 ? '' : 'ей'}`}
                            size="small"
                            color="warning"
                            variant="outlined"
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
