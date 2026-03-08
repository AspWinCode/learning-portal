import React, { useState, useEffect } from 'react';
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
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Alert,
  Chip,
  Checkbox,
} from '@mui/material';
import { reportsApi, studentsApi, usersApi } from '../services/api';
import { Student, User } from '../types';
import Layout from '../components/Layout';

export const ReportsPageContent: React.FC = () => {
  const [tab, setTab] = useState<'students' | 'trainers' | 'logs' | 'export' | 'characteristics'>('trainers');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [studentsReport, setStudentsReport] = useState<{ total: number; students: any[] } | null>(null);
  const [studentsSkip, setStudentsSkip] = useState(0);
  const studentsLimit = 50;
  const [trainers, setTrainers] = useState<any[]>([]);
  const [trainersIncludeArchived, setTrainersIncludeArchived] = useState(false);
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

  // Characteristics compliance (admin)
  const now = new Date();
  const [ccMonth, setCcMonth] = useState<number>(now.getMonth() + 1);
  const [ccYear, setCcYear] = useState<number>(now.getFullYear());
  const [ccData, setCcData] = useState<any | null>(null);

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
    if (tab === 'characteristics' && !ccData) {
      loadCharacteristicsCompliance(true);
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
      const data = await reportsApi.getTrainers({ include_archived: trainersIncludeArchived });
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

  const loadCharacteristicsCompliance = async (reset = false) => {
    try {
      if (reset) setCcData(null);
      const data = await reportsApi.getCharacteristicsCompliance(ccMonth, ccYear);
      setCcData(data);
    } catch (err: any) {
      console.error('Ошибка загрузки контроля характеристик', err);
      setError(err.response?.data?.detail || 'Ошибка загрузки контроля характеристик');
    }
  };

  return (
    <Box>
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
          <Tab value="characteristics" label="Контроль характеристик" />
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
                  <TableCell>Статус</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(studentsReport?.students || []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.id}</TableCell>
                    <TableCell>{s.full_name}</TableCell>
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="h6">Отчет по тренерам</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={trainersIncludeArchived}
                    onChange={async (e) => {
                      const checked = e.target.checked;
                      setTrainersIncludeArchived(checked);
                      try {
                        const data = await reportsApi.getTrainers({ include_archived: checked });
                        setTrainers(data);
                      } catch (err) {
                        setError('Ошибка загрузки отчета по тренерам');
                      }
                    }}
                  />
                }
                label="Показывать архивных"
              />
              <Button variant="outlined" onClick={loadTrainersReport}>
                Обновить
              </Button>
            </Box>
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

      {tab === 'characteristics' && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="h6">Контроль сдачи характеристик</Typography>
              <Typography variant="body2" color="text.secondary">
                Зелёный: характеристика опубликована (approved) с 1 по 6 число выбранного месяца. Красный: нет или позже.
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Месяц</InputLabel>
                <Select value={ccMonth} label="Месяц" onChange={(e) => setCcMonth(Number(e.target.value))}>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <MenuItem key={i + 1} value={i + 1}>
                      {i + 1}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="Год"
                type="number"
                value={ccYear}
                onChange={(e) => setCcYear(Number(e.target.value))}
                sx={{ width: 120 }}
              />
              <Button variant="outlined" onClick={() => loadCharacteristicsCompliance(true)}>
                Обновить
              </Button>
            </Box>
          </Box>

          <Typography variant="caption" color="text.secondary" display="block">
            Окно сдачи: {ccData?.window_start ? new Date(ccData.window_start).toLocaleDateString('ru-RU') : '—'} —{' '}
            {ccData?.window_end ? new Date(ccData.window_end).toLocaleDateString('ru-RU') : '—'}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Период характеристик: {ccMonth === 1 ? 'Декабрь' : ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь'][ccMonth - 2]} {ccMonth === 1 ? ccYear - 1 : ccYear}
          </Typography>
          {ccData?.rows?.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Показано: {(ccData.rows as any[]).length} строк (один ответственный тренер на ученика за месяц)
            </Typography>
          )}

          <TableContainer sx={{ mt: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width={48}>№</TableCell>
                  <TableCell>Тренер</TableCell>
                  <TableCell>Ученик</TableCell>
                  <TableCell>Статус</TableCell>
                  <TableCell>Опубликовано</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(ccData?.rows || []).map((r: any, idx: number) => {
                  const ok = !!r.ok;
                  const bg = ok ? 'rgba(46, 125, 50, 0.10)' : 'rgba(211, 47, 47, 0.10)';
                  const reason = r.reason as string | undefined;
                  const statusLabel =
                    reason === 'submitted_on_time'
                      ? 'В срок'
                      : reason === 'missing'
                        ? 'Нет характеристики'
                        : reason === 'not_approved'
                          ? 'Не согласовано'
                          : reason === 'published_late'
                            ? 'Опубликована позже срока'
                            : reason === 'student_not_assigned_on_report_last'
                              ? 'Не закреплён на конец месяца'
                              : reason === 'trainer_conflict_on_report_last'
                                ? 'Конфликт по тренерам'
                                : r.characteristic?.status === 'not_in_group' || reason
                                  ? (reason || r.characteristic?.status || 'missing')
                                  : r.characteristic?.status || 'missing';
                  const publishedAt =
                    r.published_at_aggregate != null && r.published_at_aggregate !== ''
                      ? r.published_at_aggregate
                      : r.characteristic?.published_at
                        ? new Date(r.characteristic.published_at).toLocaleString('ru-RU')
                        : '—';
                  return (
                    <TableRow key={`${r.student?.id ?? 't'}-${r.trainer?.id ?? ''}-${idx}`} sx={{ backgroundColor: bg }}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>{r.trainer?.full_name || '—'}</TableCell>
                      <TableCell>{r.student?.full_name || '—'}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={ok ? 'В срок' : 'Не в срок'}
                          color={ok ? 'success' : 'error'}
                          sx={{ mr: 1 }}
                        />
                        <Typography component="span" variant="caption" color="text.secondary">
                          ({statusLabel})
                        </Typography>
                      </TableCell>
                      <TableCell>{publishedAt}</TableCell>
                    </TableRow>
                  );
                })}
                {ccData && (ccData.rows || []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Typography variant="body2" color="text.secondary">
                        Нет данных (нет пар тренер–ученик за выбранный период).
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
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
    </Box>
  );
};

const ReportsPage: React.FC = () => (
  <Layout>
    <ReportsPageContent />
  </Layout>
);

export default ReportsPage;

