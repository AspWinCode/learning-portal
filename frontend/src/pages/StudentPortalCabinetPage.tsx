import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  CircularProgress,
  Alert,
  Stack,
} from '@mui/material';
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
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(260px, 1fr))' }, gap: 2 }}>
          {courses.map((course) => (
            <Card key={course.id} variant="outlined">
              <CardContent>
                <Typography variant="h6">{course.name}</Typography>
                {course.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {course.description}
                  </Typography>
                )}
              </CardContent>
              <CardActions>
                <Button
                  variant="contained"
                  fullWidth
                  disabled={launchingId === course.id}
                  onClick={() => handleLaunch(course.id)}
                >
                  {launchingId === course.id ? 'Открываем…' : 'Открыть'}
                </Button>
              </CardActions>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default StudentPortalCabinetPage;
