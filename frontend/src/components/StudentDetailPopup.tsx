import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Stack,
  TextField,
  Button,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { studentsApi, salesApi } from '../services/api';
import { Student, AbsenceFollowUp, AbsenceFollowUpStage, StudentAccount } from '../types';
import { useAuth } from '../contexts/AuthContext';

const ABSENCE_STAGES: { value: AbsenceFollowUpStage; label: string }[] = [
  { value: 'missed', label: 'Пропустил' },
  { value: 'assigned', label: 'Назначили отработку' },
  { value: 'made_up', label: 'Отработал' },
  { value: 'missed_makeup', label: 'Пропустил отработку' },
];

interface StudentDetailPopupProps {
  open: boolean;
  onClose: () => void;
  studentId: number | null;
}

const StudentDetailPopup: React.FC<StudentDetailPopupProps> = ({ open, onClose, studentId }) => {
  const { user } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [attendances, setAttendances] = useState<Array<{ lesson_date: string; group_name: string; attended: boolean }>>([]);
  const [absences, setAbsences] = useState<AbsenceFollowUp[]>([]);
  const [accounts, setAccounts] = useState<StudentAccount[]>([]);
  const [newAccountName, setNewAccountName] = useState('');
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSeeAbsences = user?.role === 'admin' || user?.role === 'owner' || user?.role === 'sales';
  const canManageAccounts = user?.role === 'admin' || user?.role === 'owner' || user?.role === 'trainer' || user?.role === 'parent';

  useEffect(() => {
    if (!open || !studentId) return;
    setError(null);
    setLoading(true);
    setStudent(null);
    setAttendances([]);
    setAbsences([]);
    setAccounts([]);
    setNewAccountName('');
    Promise.all([
      studentsApi.getById(studentId),
      studentsApi.getAttendances(studentId),
      canSeeAbsences ? salesApi.getAbsences({ student_id: studentId }) : Promise.resolve([]),
      canManageAccounts ? studentsApi.getAccounts(studentId) : Promise.resolve([]),
    ])
      .then(([s, att, abs, acc]) => {
        setStudent(s);
        setAttendances(att);
        setAbsences(abs as AbsenceFollowUp[]);
        setAccounts((acc || []) as StudentAccount[]);
      })
      .catch((err: any) => setError(err.response?.data?.detail || err.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [open, studentId, canSeeAbsences, canManageAccounts]);

  const loadAccounts = async () => {
    if (!studentId) return;
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const list = await studentsApi.getAccounts(studentId);
      setAccounts(list);
    } catch (err: any) {
      setAccountsError(err.response?.data?.detail || 'Не удалось загрузить счета');
    } finally {
      setAccountsLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!studentId || !newAccountName.trim()) return;
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const created = await studentsApi.createAccount(studentId, { name: newAccountName.trim() });
      setAccounts((prev) => [...prev, created]);
      setNewAccountName('');
    } catch (err: any) {
      setAccountsError(err.response?.data?.detail || 'Не удалось создать счет');
    } finally {
      setAccountsLoading(false);
    }
  };

  const handleAbsenceStageChange = async (absenceId: number, stage: string) => {
    try {
      const updated = await salesApi.updateAbsenceStage(absenceId, stage);
      setAbsences((prev) => prev.map((a) => (a.id === absenceId ? updated : a)));
    } catch (_) {}
  };

  const formatDate = (d: string) => {
    try {
      return format(parseISO(d), 'd MMM yyyy', { locale: ru });
    } catch {
      return d;
    }
  };

  if (!studentId) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      fullScreen
      PaperProps={{ sx: { maxWidth: '100%', m: 0 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
        <Typography variant="h6">Карточка ученика</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 3 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {!loading && student && (
          <Stack spacing={3}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Данные ученика
              </Typography>
              <Typography variant="h6">{student.full_name}</Typography>
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2">
                  Родитель: {student.parent?.full_name || '—'}
                  {student.parent?.email && ` (${student.parent.email})`}
                </Typography>
                <Typography variant="body2">Статус: {student.status === 'active' ? 'Активен' : 'В архиве'}</Typography>
                {(student.programs || []).filter((p) => p.status === 'active').length > 0 && (
                  <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {(student.programs || []).filter((p) => p.status === 'active').map((p) => (
                      <Chip key={p.id} size="small" label={`${p.name} (v${p.version})`} />
                    ))}
                  </Box>
                )}
              </Box>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Посещение занятий
              </Typography>
              {attendances.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Нет записей о посещениях.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Дата</TableCell>
                      <TableCell>Группа</TableCell>
                      <TableCell>Статус</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {attendances.map((a, i) => (
                      <TableRow key={i}>
                        <TableCell>{formatDate(a.lesson_date)}</TableCell>
                        <TableCell>{a.group_name}</TableCell>
                        <TableCell>{a.attended ? 'Был' : 'Не был'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Paper>

            {canSeeAbsences && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Пропуски и отработки
                </Typography>
                {absences.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Нет пропусков по этому ученику.
                  </Typography>
                ) : (
                  <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                    {ABSENCE_STAGES.map(({ value, label }) => {
                      const items = absences.filter((a) => a.stage === value);
                      if (items.length === 0) return null;
                      return (
                        <Card key={value} variant="outlined" sx={{ minWidth: 220, bgcolor: 'grey.50' }}>
                          <CardContent>
                            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                              {label}
                            </Typography>
                            <Stack spacing={1}>
                              {items.map((a) => (
                                <Box key={a.id} sx={{ p: 1, bgcolor: 'background.paper', borderRadius: 1 }}>
                                  <Typography variant="body2">
                                    {a.group_name || `Группа #${a.group_id}`} · {formatDate(a.lesson_date)}
                                  </Typography>
                                  <FormControl size="small" fullWidth sx={{ mt: 0.5 }}>
                                    <Select
                                      value={a.stage}
                                      onChange={(e) => handleAbsenceStageChange(a.id, e.target.value)}
                                      displayEmpty
                                    >
                                      {ABSENCE_STAGES.map((s) => (
                                        <MenuItem key={s.value} value={s.value}>
                                          {s.label}
                                        </MenuItem>
                                      ))}
                                    </Select>
                                  </FormControl>
                                </Box>
                              ))}
                            </Stack>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Stack>
                )}
              </Paper>
            )}

            {canManageAccounts && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Счета
                </Typography>
                {accountsError && (
                  <Alert severity="error" sx={{ mb: 1 }} onClose={() => setAccountsError(null)}>
                    {accountsError}
                  </Alert>
                )}
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap">
                  <TextField
                    size="small"
                    label="Название счета"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    placeholder="Например: Основной"
                    sx={{ minWidth: 180 }}
                  />
                  <Button
                    variant="contained"
                    onClick={handleCreateAccount}
                    disabled={!newAccountName.trim() || accountsLoading}
                  >
                    Создать счет
                  </Button>
                </Stack>
                {accountsLoading && !accounts.length ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : accounts.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Нет счетов. Создайте счёт выше.
                  </Typography>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Название</TableCell>
                        <TableCell align="right">Баланс</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {accounts.map((acc) => (
                        <TableRow key={acc.id}>
                          <TableCell>{acc.name}</TableCell>
                          <TableCell align="right">{acc.balance ?? 0} ₽</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Paper>
            )}
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StudentDetailPopup;
