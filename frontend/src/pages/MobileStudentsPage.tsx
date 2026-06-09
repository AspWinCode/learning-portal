import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  AppBar,
  Box,
  Chip,
  CircularProgress,
  Container,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { ArrowBack, Person, Refresh, Search } from '@mui/icons-material';
import { studentsApi } from '../services/api';
import type { Student } from '../types';
import { extractApiError } from '../utils/extractApiError';

const MobileStudentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { studentId } = useParams<{ studentId?: string }>();
  const [students, setStudents] = useState<Student[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { archived: 'false' };
      if (search.trim()) params.search = search.trim();
      const data = await studentsApi.getAll(params);
      setStudents(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить учеников'));
    } finally {
      setLoading(false);
    }
  }, [search]);

  const loadStudent = useCallback(async () => {
    if (!studentId) return;
    const id = Number(studentId);
    if (!Number.isFinite(id)) { navigate('/mobile/students', { replace: true }); return; }
    setLoading(true);
    setError('');
    try {
      const data = await studentsApi.getById(id);
      setStudent(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить ученика'));
    } finally {
      setLoading(false);
    }
  }, [studentId, navigate]);

  useEffect(() => {
    if (studentId) { void loadStudent(); return; }
    const t = window.setTimeout(() => void loadStudents(), 250);
    return () => window.clearTimeout(t);
  }, [studentId, loadStudent, loadStudents]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f6f8fb', pb: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => navigate(studentId ? '/mobile/students' : '/mobile')} aria-label="Назад">
            <ArrowBack />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0, ml: 1 }}>
            <Typography variant="subtitle1" fontWeight={900} noWrap>
              {studentId ? (student?.full_name ?? 'Ученик') : 'Ученики'}
            </Typography>
            {!studentId && (
              <Typography variant="caption" color="text.secondary">{students.length} в списке</Typography>
            )}
          </Box>
          <IconButton onClick={() => studentId ? loadStudent() : loadStudents()} aria-label="Обновить">
            <Refresh />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="sm" sx={{ pt: 2, px: { xs: 1.5, sm: 3 } }}>
        <Stack spacing={1.5}>
          {error && <Alert severity="error">{error}</Alert>}

          {!studentId && (
            <TextField
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени"
              size="small"
              fullWidth
              InputProps={{
                startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>,
              }}
            />
          )}

          {loading ? (
            <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
          ) : studentId ? (
            student ? (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Stack spacing={2}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{
                      width: 48, height: 48, borderRadius: 1.5, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: 'primary.50', color: 'primary.main',
                    }}>
                      <Person />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="h6" fontWeight={900}>{student.full_name}</Typography>
                      <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                        {student.status === "archived" && <Chip size="small" label="В архиве" color="default" />}
                        {student.abonement && <Chip size="small" label={student.abonement.name} color="primary" variant="outlined" />}
                      </Stack>
                    </Box>
                  </Stack>

                  <Divider />

                  <Stack spacing={1.25}>
                    {student.programs?.length ? (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Программы</Typography>
                        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                          {student.programs.map((p) => (
                            <Chip key={p.id} size="small" label={p.name} variant="outlined" />
                          ))}
                        </Stack>
                      </Box>
                    ) : null}

                    {student.abonement && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Абонемент</Typography>
                        <Typography variant="body2">{student.abonement.name}</Typography>
                      </Box>
                    )}

                    <Box>
                      <Typography variant="caption" color="text.secondary">Статус</Typography>
                      <Typography variant="body2">
                        {student.status === 'active' ? 'Активный' : 'В архиве'}
                      </Typography>
                    </Box>
                  </Stack>
                </Stack>
              </Paper>
            ) : (
              <Alert severity="info">Ученик не найден</Alert>
            )
          ) : students.length ? (
            <Stack spacing={1}>
              {students.map((s) => (
                <Paper
                  key={s.id}
                  variant="outlined"
                  sx={{ p: 1.5, borderRadius: 2, cursor: 'pointer', '&:active': { opacity: 0.7 } }}
                  onClick={() => navigate(`/mobile/students/${s.id}`)}
                >
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{
                      width: 38, height: 38, borderRadius: 1.5, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      bgcolor: 'primary.50', color: 'primary.main',
                    }}>
                      <Person fontSize="small" />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" fontWeight={700} noWrap>{s.full_name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {s.programs?.map((p) => p.name).join(', ') || 'Без программы'}
                      </Typography>
                    </Box>
                    {s.abonement && (
                      <Chip size="small" label={s.abonement.name} variant="outlined" sx={{ flexShrink: 0 }} />
                    )}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          ) : (
            <Alert severity="info">Ученики не найдены</Alert>
          )}
        </Stack>
      </Container>
    </Box>
  );
};

export default MobileStudentsPage;
