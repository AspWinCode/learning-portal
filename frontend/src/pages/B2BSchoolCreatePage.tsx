import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import Add from '@mui/icons-material/Add';
import Layout from '../components/Layout';
import { b2bApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { B2BSchool, B2BSchoolPipelineStage } from '../types';

const PIPELINE_STAGES: { value: B2BSchoolPipelineStage; label: string }[] = [
  { value: 'new', label: '╨Э╨╛╨▓╤Л╨╡' },
  { value: 'contact_found', label: '╨Ъ╨╛╨╜╤В╨░╨║╤В ╨╜╨░╨╣╨┤╨╡╨╜' },
  { value: 'letter_sent', label: '╨Я╨╕╤Б╤М╨╝╨╛ ╨╛╤В╨┐╤А╨░╨▓╨╗╨╡╨╜╨╛' },
  { value: 'meeting_scheduled', label: '╨Э╨░╨╖╨╜╨░╤З╨╡╨╜╨░ ╨▓╤Б╤В╤А╨╡╤З╨░' },
  { value: 'meeting_held', label: '╨Т╤Б╤В╤А╨╡╤З╨░ ╨┐╤А╨╛╨▓╨╡╨┤╨╡╨╜╨░' },
  { value: 'permission_received', label: '╨а╨░╨╖╤А╨╡╤И╨╡╨╜╨╕╨╡ ╨┐╨╛╨╗╤Г╤З╨╡╨╜╨╛' },
  { value: 'walkthrough_scheduled', label: '╨Э╨░╨╖╨╜╨░╤З╨╡╨╜╨░ ╨┤╨░╤В╨░ ╨╛╨▒╤Е╨╛╨┤╨░' },
  { value: 'walkthrough_done', label: '╨Ю╨▒╤Е╨╛╨┤ ╨┐╤А╨╛╨▓╨╡╨┤╤С╨╜' },
  { value: 'leads_received', label: '╨Ы╨╕╨┤╤Л ╨┐╨╛╨╗╤Г╤З╨╡╨╜╤Л' },
];

const B2BSchoolCreatePage: React.FC = () => {
  const [form, setForm] = useState({
    name: '',
    director: '',
    city: '',
    address: '',
    student_count: '' as number | '',
    friendship_degree: '',
    pipeline_stage: 'new' as B2BSchoolPipelineStage,
    event_dates: '',
  });
  const [schools, setSchools] = useState<B2BSchool[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterCity, setFilterCity] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadSchools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await b2bApi.listSchools();
      setSchools(data);
    } catch (err: any) {
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨╖╨░╨│╤А╤Г╨╖╨╕╤В╤М ╤Б╨┐╨╕╤Б╨╛╨║ ╤И╨║╨╛╨╗'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  const uniqueCities = useMemo(() => {
    const cities = Array.from(new Set(schools.map((s) => s.city).filter((c): c is string => !!c)));
    return cities.sort((a, b) => a.localeCompare(b));
  }, [schools]);

  const filteredSchools = useMemo(() => {
    if (!filterCity) return schools;
    return schools.filter((s) => s.city === filterCity);
  }, [schools, filterCity]);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    if (!form.name.trim()) {
      setError('╨г╨║╨░╨╢╨╕╤В╨╡ ╨╜╨░╨╕╨╝╨╡╨╜╨╛╨▓╨░╨╜╨╕╨╡ ╤И╨║╨╛╨╗╤Л');
      return;
    }
    setSaving(true);
    try {
      const eventDates = form.event_dates
        ? form.event_dates.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
        : undefined;
      await b2bApi.createSchool({
        name: form.name.trim(),
        director: form.director.trim() || undefined,
        city: form.city.trim() || undefined,
        address: form.address.trim() || undefined,
        student_count: form.student_count === '' ? undefined : Number(form.student_count),
        friendship_degree: form.friendship_degree || undefined,
        pipeline_stage: form.pipeline_stage,
        event_dates: eventDates,
      });
      setSuccess('╨и╨║╨╛╨╗╨░ ╤Г╤Б╨┐╨╡╤И╨╜╨╛ ╤Б╨╛╨╖╨┤╨░╨╜╨░');
      setForm({
        name: '',
        director: '',
        city: '',
        address: '',
        student_count: '',
        friendship_degree: '',
        pipeline_stage: 'new',
        event_dates: '',
      });
      await loadSchools();
    } catch (err: any) {
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╤Б╨╛╨╖╨┤╨░╤В╤М ╤И╨║╨╛╨╗╤Г'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h4">╨б╨╛╨╖╨┤╨░╤В╤М ╤И╨║╨╛╨╗╤Г (B2B)</Typography>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <Box maxWidth={520}>
          <Stack spacing={2}>
            <TextField
              label="╨Э╨░╨╕╨╝╨╡╨╜╨╛╨▓╨░╨╜╨╕╨╡ ╤И╨║╨╛╨╗╤Л"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="╨Ф╨╕╤А╨╡╨║╤В╨╛╤А ╤И╨║╨╛╨╗╤Л"
              value={form.director}
              onChange={(e) => setForm((f) => ({ ...f, director: e.target.value }))}
              fullWidth
            />
            <TextField
              label="╨У╨╛╤А╨╛╨┤"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              fullWidth
            />
            <TextField
              label="╨Р╨┤╤А╨╡╤Б"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              fullWidth
            />
            <TextField
              label="╨Ъ╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛ ╨┤╨╡╤В╨╡╨╣ ╨▓ ╤И╨║╨╛╨╗╨╡"
              type="number"
              value={form.student_count}
              onChange={(e) =>
                setForm((f) => ({ ...f, student_count: e.target.value === '' ? '' : Number(e.target.value) }))
              }
              fullWidth
              InputProps={{ inputProps: { min: 0 } }}
            />
            <FormControl fullWidth>
              <InputLabel>╨б╤В╨╡╨┐╨╡╨╜╤М ╨┤╤А╤Г╨╢╨▒╤Л</InputLabel>
              <Select
                value={form.friendship_degree}
                label="╨б╤В╨╡╨┐╨╡╨╜╤М ╨┤╤А╤Г╨╢╨▒╤Л"
                onChange={(e) => setForm((f) => ({ ...f, friendship_degree: e.target.value }))}
              >
                <MenuItem value="">
                  <em>╨Э╨╡ ╨▓╤Л╨▒╤А╨░╨╜╨╛</em>
                </MenuItem>
                <MenuItem value="unknown">╨Э╨╡ ╨╖╨╜╨░╨╡╨╝ ╨┤╤А╤Г╨│ ╨┤╤А╤Г╨│╨░</MenuItem>
                <MenuItem value="indirect">╨Ч╨╜╨░╨╡╨╝ ╨║╨╛╤Б╨▓╨╡╨╜╨╜╨╛</MenuItem>
                <MenuItem value="friends">╨Ф╤А╤Г╨╢╨╕╨╝</MenuItem>
                <MenuItem value="enemies">╨Т╤А╨░╨│╨╕</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="╨Ф╨░╤В╤Л ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╣ (╤З╨╡╤А╨╡╨╖ ╨╖╨░╨┐╤П╤В╤Г╤О)"
              value={form.event_dates}
              onChange={(e) => setForm((f) => ({ ...f, event_dates: e.target.value }))}
              fullWidth
              placeholder="2025-03-01, 2025-03-15"
            />
            <FormControl fullWidth>
              <InputLabel>╨б╤В╨░╨┤╨╕╤П ╨▓╨╛╤А╨╛╨╜╨║╨╕</InputLabel>
              <Select
                value={form.pipeline_stage}
                label="╨б╤В╨░╨┤╨╕╤П ╨▓╨╛╤А╨╛╨╜╨║╨╕"
                onChange={(e) =>
                  setForm((f) => ({ ...f, pipeline_stage: e.target.value as B2BSchoolPipelineStage }))
                }
              >
                {PIPELINE_STAGES.map((s) => (
                  <MenuItem key={s.value} value={s.value}>
                    {s.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => void handleSave()}
                disabled={saving}
              >
                ╨б╨╛╨╖╨┤╨░╤В╤М ╤И╨║╨╛╨╗╤Г
              </Button>
            </Box>
          </Stack>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <Typography variant="h6">╨б╨╛╨╖╨┤╨░╨╜╨╜╤Л╨╡ ╤И╨║╨╛╨╗╤Л</Typography>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>╨д╨╕╨╗╤М╤В╤А ╨┐╨╛ ╨│╨╛╤А╨╛╨┤╤Г</InputLabel>
              <Select
                label="╨д╨╕╨╗╤М╤В╤А ╨┐╨╛ ╨│╨╛╤А╨╛╨┤╤Г"
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
              >
                <MenuItem value="">
                  <em>╨Т╤Б╨╡ ╨│╨╛╤А╨╛╨┤╨░</em>
                </MenuItem>
                {uniqueCities.map((city) => (
                  <MenuItem key={city} value={city}>
                    {city}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>

          {loading ? (
            <Typography color="text.secondary">╨Ч╨░╨│╤А╤Г╨╖╨║╨░тАж</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡</TableCell>
                    <TableCell>╨Ф╨╕╤А╨╡╨║╤В╨╛╤А</TableCell>
                    <TableCell>╨У╨╛╤А╨╛╨┤</TableCell>
                    <TableCell>╨Р╨┤╤А╨╡╤Б</TableCell>
                    <TableCell align="right">╨г╤З╨╡╨╜╨╕╨║╨╛╨▓</TableCell>
                    <TableCell>╨б╤В╨░╨┤╨╕╤П</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSchools.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 3 }} color="text.secondary">
                        {schools.length === 0 ? '╨Э╨╡╤В ╤Б╨╛╨╖╨┤╨░╨╜╨╜╤Л╤Е ╤И╨║╨╛╨╗' : '╨Э╨╡╤В ╤И╨║╨╛╨╗ ╨▓ ╨▓╤Л╨▒╤А╨░╨╜╨╜╨╛╨╝ ╨│╨╛╤А╨╛╨┤╨╡'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredSchools.map((school) => (
                      <TableRow key={school.id}>
                        <TableCell>{school.name}</TableCell>
                        <TableCell>{school.director || 'тАФ'}</TableCell>
                        <TableCell>{school.city || 'тАФ'}</TableCell>
                        <TableCell sx={{ maxWidth: 200 }} title={school.address || ''}>
                          <Typography variant="body2" noWrap>
                            {school.address || 'тАФ'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{school.student_count ?? 'тАФ'}</TableCell>
                        <TableCell>
                          {PIPELINE_STAGES.find((s) => s.value === school.pipeline_stage)?.label ?? school.pipeline_stage}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Box>
    </Layout>
  );
};

export default B2BSchoolCreatePage;

