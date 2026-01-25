import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import {
  Typography,
  Box,
  Paper,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Alert,
} from '@mui/material';
import { reportsApi, studentsApi, usersApi } from '../services/api';
import { Student, User } from '../types';

const ReportsPage: React.FC = () => {
  const [tab, setTab] = useState<'students' | 'trainers' | 'logs' | 'export'>('trainers');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [studentsReport, setStudentsReport] = useState<{ total: number; students: any[] } | null>(null);
  const [studentsSkip, setStudentsSkip] = useState(0);
  const studentsLimit = 50;
  const [trainers, setTrainers] = useState<any[]>([]);
  const [actionLogs, setActionLogs] = useState<{ total: number; logs: any[] } | null>(null);
  const [logsSkip, setLogsSkip] = useState(0);
  const logsLimit = 50;

  // Export filters
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [allTrainers, setAllTrainers] = useState<User[]>([]);
  const [exportStudentIds, setExportStudentIds] = useState<string[]>([]);
  const [exportTrainerIds, setExportTrainerIds] = useState<string[]>([]);
  const [exportStartDate, setExportStartDate] = useState<string>('');
  const [exportEndDate, setExportEndDate] = useState<string>('');
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');

  useEffect(() => {
    // default: load trainers report
    loadTrainersReport();
  }, []);

  useEffect(() => {
    // lazy-load per tab
    if (tab === 'students' && !studentsReport) loadStudentsReport(true);
    if (tab === 'logs' && !actionLogs) loadActionLogs(true);
    if (tab === 'export' && allStudents.length === 0) {
      loadExportLookups();
    }
  }, [tab]);

  const loadStudentsReport = async (reset = false) => {
    try {
      const nextSkip = reset ? 0 : studentsSkip;
      const data = await reportsApi.getStudents({ skip: nextSkip, limit: studentsLimit });
      setStudentsReport((prev) => {
        if (reset || !prev) return data;
        return {
          total: data.total,
          students: [...(prev.students || []), ...(data.students || [])],
        };
      });
      setStudentsSkip(nextSkip + (data.students?.length || 0));
    } catch (err) {
      console.error('Ошибка загрузки отчета по ученикам', err);
      setError('Ошибка загрузки отчета по ученикам');
    }
  };

  const loadTrainersReport = async () => {
    try {
      const data = await reportsApi.getTrainers();
      setTrainers(data);
    } catch (err) {
      console.error('Ошибка загрузки отчета', err);
      setError('Ошибка загрузки отчета по тренерам');
    }
  };

  const loadActionLogs = async (reset = false) => {
    try {
      const nextSkip = reset ? 0 : logsSkip;
      const data = await reportsApi.getActionLogs({ skip: nextSkip, limit: logsLimit });
      setActionLogs((prev) => {
        if (reset || !prev) return data;
        return {
          total: data.total,
          logs: [...(prev.logs || []), ...(data.logs || [])],
        };
      });
      setLogsSkip(nextSkip + (data.logs?.length || 0));
    } catch (err) {
      console.error('Ошибка загрузки журнала действий', err);
      setError('Ошибка загрузки журнала действий');
    }
  };

  const loadExportLookups = async () => {
    try {
      const [students, trainers] = await Promise.all([
        studentsApi.getAll({ status: 'active' }),
        usersApi.getAll('trainer'),
      ]);
      setAllStudents(students);
      setAllTrainers(trainers);
    } catch (err) {
      console.error('Ошибка загрузки справочников для экспорта', err);
      setError('Ошибка загрузки справочников для экспорта');
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    setError('');
    setInfo('');

    try {
      const params: any = {
        format: exportFormat,
      };

      if (exportStudentIds.length) {
        params.student_ids = exportStudentIds.map((x) => parseInt(x));
      }
      if (exportTrainerIds.length) {
        params.trainer_ids = exportTrainerIds.map((x) => parseInt(x));
      }
      if (exportStartDate) {
        params.start_date = new Date(`${exportStartDate}T00:00:00`).toISOString();
      }
      if (exportEndDate) {
        params.end_date = new Date(`${exportEndDate}T23:59:59`).toISOString();
      }

      const blob = await reportsApi.exportReport(params);
      downloadBlob(blob, exportFormat === 'csv' ? 'grades_report.csv' : 'grades_report.xlsx');
      setInfo('Файл отчёта скачан');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка экспорта');
    }
  };

  return (
    <Layout>
      <Typography variant="h4" gutterBottom>
        Отчетность
      </Typography>

      {(error || info) && (
        <Box sx={{ mb: 2 }}>
          {error && (
            <Alert severity="error" onClose={() => setError('')}>
              {error}
            </Alert>
          )}
          {info && (
            <Alert severity="success" sx={{ mt: error ? 1 : 0 }} onClose={() => setInfo('')}>
              {info}
            </Alert>
          )}
        </Box>
      )}

      <Paper sx={{ mt: 2 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab value="students" label="Ученики" />
          <Tab value="trainers" label="Тренеры" />
          <Tab value="logs" label="Журнал действий" />
          <Tab value="export" label="Экспорт" />
        </Tabs>
      </Paper>

      {tab === 'students' && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Отчет по ученикам</Typography>
            <Button
              variant="outlined"
              onClick={() => {
                setStudentsSkip(0);
                loadStudentsReport(true);
              }}
            >
              Обновить
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary">
            Показано: {studentsReport?.students?.length ?? 0} из {studentsReport?.total ?? '—'}
          </Typography>
          <TableContainer sx={{ mt: 1 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>ФИО</TableCell>
                  <TableCell>Родитель</TableCell>
                  <TableCell>Статус</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(studentsReport?.students || []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.id}</TableCell>
                    <TableCell>{s.full_name}</TableCell>
                    <TableCell>{s.parent?.full_name || '—'}</TableCell>
                    <TableCell>{s.status === 'active' ? 'Активен' : 'Архивирован'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {studentsReport && (studentsReport.students?.length || 0) < (studentsReport.total || 0) && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button variant="contained" onClick={() => loadStudentsReport(false)}>
                Загрузить ещё
              </Button>
            </Box>
          )}
        </Paper>
      )}

      {tab === 'trainers' && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Отчет по тренерам</Typography>
            <Button variant="outlined" onClick={loadTrainersReport}>
              Обновить
            </Button>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Тренер</TableCell>
                  <TableCell>Количество групп</TableCell>
                  <TableCell>Количество оценок</TableCell>
                  <TableCell>Средняя оценка</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {trainers.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{item.trainer.full_name}</TableCell>
                    <TableCell>{item.groups_count}</TableCell>
                    <TableCell>{item.grades_count}</TableCell>
                    <TableCell>{item.average_grade}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {tab === 'logs' && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Журнал действий</Typography>
            <Button
              variant="outlined"
              onClick={() => {
                setLogsSkip(0);
                loadActionLogs(true);
              }}
            >
              Обновить
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary">
            Показано: {actionLogs?.logs?.length ?? 0} из {actionLogs?.total ?? '—'}
          </Typography>
          <TableContainer sx={{ mt: 1 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Дата</TableCell>
                  <TableCell>User ID</TableCell>
                  <TableCell>Действие</TableCell>
                  <TableCell>Сущность</TableCell>
                  <TableCell>Entity ID</TableCell>
                  <TableCell>Детали</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(actionLogs?.logs || []).map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      {l.created_at ? new Date(l.created_at).toLocaleString('ru-RU') : '—'}
                    </TableCell>
                    <TableCell>{l.user_id ?? '—'}</TableCell>
                    <TableCell>{l.action_type}</TableCell>
                    <TableCell>{l.entity_type}</TableCell>
                    <TableCell>{l.entity_id ?? '—'}</TableCell>
                    <TableCell>
                      <code style={{ whiteSpace: 'pre-wrap' }}>
                        {l.details ? JSON.stringify(l.details) : '—'}
                      </code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {actionLogs && (actionLogs.logs?.length || 0) < (actionLogs.total || 0) && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button variant="contained" onClick={() => loadActionLogs(false)}>
                Загрузить ещё
              </Button>
            </Box>
          )}
        </Paper>
      )}

      {tab === 'export' && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Typography variant="h6" gutterBottom>
            Экспорт оценок (CSV/XLSX)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Экспортирует таблицу оценок с фильтрами по ученикам/тренерам и диапазону дат.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 2 }}>
            <TextField
              label="Дата с"
              type="date"
              size="small"
              value={exportStartDate}
              onChange={(e) => setExportStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 180 }}
            />
            <TextField
              label="Дата по"
              type="date"
              size="small"
              value={exportEndDate}
              onChange={(e) => setExportEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 180 }}
            />

            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel>Ученики</InputLabel>
              <Select
                multiple
                value={exportStudentIds}
                label="Ученики"
                onChange={(e) => setExportStudentIds(e.target.value as string[])}
              >
                {allStudents.map((s) => (
                  <MenuItem key={s.id} value={s.id.toString()}>
                    {s.full_name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel>Тренеры</InputLabel>
              <Select
                multiple
                value={exportTrainerIds}
                label="Тренеры"
                onChange={(e) => setExportTrainerIds(e.target.value as string[])}
              >
                {allTrainers.map((t) => (
                  <MenuItem key={t.id} value={t.id.toString()}>
                    {t.full_name} ({t.email})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ width: 160 }}>
              <InputLabel>Формат</InputLabel>
              <Select
                value={exportFormat}
                label="Формат"
                onChange={(e) => setExportFormat(e.target.value as any)}
              >
                <MenuItem value="xlsx">XLSX</MenuItem>
                <MenuItem value="csv">CSV</MenuItem>
              </Select>
            </FormControl>

            <Button variant="contained" onClick={handleExport}>
              Скачать
            </Button>
          </Box>
        </Paper>
      )}
    </Layout>
  );
};

export default ReportsPage;

