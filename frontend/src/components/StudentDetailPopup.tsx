import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { studentsApi, salesApi, studentCardsApi } from '../services/api';
import { Student, AbsenceFollowUp, AbsenceFollowUpStage, StudentAccount, StudentCard } from '../types';
import { useAuth } from '../contexts/AuthContext';

const ABSENCE_STAGES: { value: AbsenceFollowUpStage | 'link_sent'; label: string }[] = [
  { value: 'missed', label: 'Пропустил' },
  { value: 'assigned', label: 'Назначили отработку' },
  { value: 'link_sent', label: 'Отправили ссылку' },
  { value: 'made_up', label: 'Отработал' },
  { value: 'missed_makeup', label: 'Пропустил отработку' },
];

interface StudentDetailPopupProps {
  open: boolean;
  onClose: () => void;
  studentId: number | null;
  onOpenAnketa?: (cardId: number) => void;
}

const StudentDetailPopup: React.FC<StudentDetailPopupProps> = ({ open, onClose, studentId, onOpenAnketa }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [student, setStudent] = useState<Student | null>(null);
  const [studentCard, setStudentCard] = useState<StudentCard | null>(null);
  const [attendances, setAttendances] = useState<Array<{ lesson_date: string; group_name: string; attended: boolean }>>([]);
  const [absences, setAbsences] = useState<AbsenceFollowUp[]>([]);
  const [accounts, setAccounts] = useState<StudentAccount[]>([]);
  const [newAccountName, setNewAccountName] = useState('');
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  const canSeeAbsences = user?.role === 'admin' || user?.role === 'owner' || user?.role === 'sales';
  const canManageAccounts = user?.role === 'admin' || user?.role === 'owner' || user?.role === 'parent' || user?.role === 'sales';
  const canInviteParent = (user?.role === 'admin' || user?.role === 'owner') && !!student?.parent_id;
  const isOwner = user?.role === 'owner';
  const [freezes, setFreezes] = useState<Array<{ id: number; freeze_start: string; freeze_end: string }>>([]);
  const [freezeStart, setFreezeStart] = useState('');
  const [freezeEnd, setFreezeEnd] = useState('');
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [closeByFactPreview, setCloseByFactPreview] = useState<{ lessons_attended_in_period: number; amount: number } | null>(null);
  const [closeByFactLoading, setCloseByFactLoading] = useState(false);

  useEffect(() => {
    if (!open || !studentId) return;
    setError(null);
    setInviteLink(null);
    setLoading(true);
    setStudent(null);
    setStudentCard(null);
    setAttendances([]);
    setAbsences([]);
    setAccounts([]);
    setNewAccountName('');
    setFreezes([]);
    setCloseByFactPreview(null);
    const promises: Promise<any>[] = [
      studentsApi.getById(studentId),
      studentsApi.getAttendances(studentId),
      canSeeAbsences ? salesApi.getAbsences({ student_id: studentId }) : Promise.resolve([]),
      canManageAccounts ? studentsApi.getAccounts(studentId) : Promise.resolve([]),
      canSeeAbsences ? studentCardsApi.list({ student_id: studentId }).then((cards) => (cards && cards[0]) || null) : Promise.resolve(null),
    ];
    if (isOwner) promises.push(salesApi.getStudentFreezes(studentId));
    Promise.all(promises)
      .then((results) => {
        const s = results[0];
        const att = results[1];
        const abs = results[2];
        const acc = results[3];
        const card = results[4] as StudentCard | null;
        const frz = results[5];
        setStudent(s);
        setAttendances(att);
        setAbsences(abs as AbsenceFollowUp[]);
        setAccounts((acc || []) as StudentAccount[]);
        setStudentCard(card ?? null);
        if (isOwner && Array.isArray(frz)) setFreezes(frz.map((f: any) => ({ id: f.id, freeze_start: f.freeze_start, freeze_end: f.freeze_end })));
      })
      .catch((err: any) => setError(err.response?.data?.detail || err.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [open, studentId, canSeeAbsences, canManageAccounts, isOwner]);

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
                {canInviteParent && (
                  <Box sx={{ mt: 1 }}>
                    {inviteLink ? (
                      <Alert severity="success" onClose={() => setInviteLink(null)}>
                        <Typography variant="body2" gutterBottom>Ссылка для входа (действует 7 дней). Отправьте её родителю:</Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <TextField size="small" fullWidth value={inviteLink} InputProps={{ readOnly: true }} sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
                          <Button size="small" onClick={() => { navigator.clipboard.writeText(inviteLink); }}>Копировать</Button>
                        </Stack>
                      </Alert>
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={inviteLoading}
                        onClick={async () => {
                          if (!studentId) return;
                          setInviteLoading(true);
                          setError(null);
                          try {
                            const res = await studentsApi.inviteParent(studentId);
                            setInviteLink(res.invite_link);
                          } catch (err: any) {
                            setError(err.response?.data?.detail || 'Не удалось создать приглашение');
                          } finally {
                            setInviteLoading(false);
                          }
                        }}
                      >
                        {inviteLoading ? 'Создание…' : 'Дать доступ родителю'}
                      </Button>
                    )}
                  </Box>
                )}
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

            {canSeeAbsences && studentCard && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Анкета
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1.5 }}>
                  <Typography variant="body2"><strong>ФИО:</strong> {studentCard.student_full_name || '—'}</Typography>
                  <Typography variant="body2"><strong>Дата рождения:</strong> {studentCard.birth_date ? studentCard.birth_date.slice(0, 10) : '—'}</Typography>
                  <Typography variant="body2"><strong>Родитель:</strong> {studentCard.parent_full_name || '—'}</Typography>
                  <Typography variant="body2"><strong>Телефон:</strong> {studentCard.parent_phone || studentCard.student_phone || '—'}</Typography>
                  <Typography variant="body2"><strong>Email:</strong> {studentCard.parent_email || '—'}</Typography>
                  <Typography variant="body2"><strong>Город:</strong> {studentCard.city || '—'}</Typography>
                  <Typography variant="body2"><strong>Откуда пришел:</strong> {studentCard.source || '—'}</Typography>
                  <Typography variant="body2"><strong>Формат:</strong> {studentCard.format_type === 'group' ? 'Группа' : studentCard.format_type === 'individual' ? 'Индивидуальное' : '—'}</Typography>
                </Box>
                {studentCard.comment && <Typography variant="body2" sx={{ mb: 1 }}><strong>Комментарий:</strong> {studentCard.comment}</Typography>}
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    if (onOpenAnketa) {
                      onOpenAnketa(studentCard.id);
                      onClose();
                    } else {
                      navigate(`/students?tab=ankety&cardId=${studentCard.id}`);
                    }
                  }}
                >
                  Открыть анкету
                </Button>
              </Paper>
            )}

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
                        <TableCell>
                          <Chip
                            size="small"
                            label={a.attended ? 'Был' : 'Пропуск'}
                            color={a.attended ? 'success' : 'error'}
                          />
                        </TableCell>
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
                        <Card
                          key={value}
                          variant="outlined"
                          sx={{
                            minWidth: 220,
                            bgcolor:
                              value === 'missed'
                                ? 'rgba(239,68,68,0.06)' // красный (пропуск)
                                : value === 'assigned'
                                ? 'rgba(234,179,8,0.08)' // жёлтый (отработка назначена)
                                : value === 'link_sent'
                                ? 'rgba(59,130,246,0.08)' // синий (ссылка отправлена)
                                : value === 'made_up'
                                ? 'rgba(34,197,94,0.08)' // зелёный (отработка выполнена)
                                : 'grey.50',
                            borderTop:
                              value === 'missed'
                                ? '3px solid #ef4444'
                                : value === 'assigned'
                                ? '3px solid #eab308'
                                : value === 'link_sent'
                                ? '3px solid #3b82f6'
                                : value === 'made_up'
                                ? '3px solid #22c55e'
                                : undefined,
                          }}
                        >
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
                                  {(a.stage === 'assigned' || a.stage === 'made_up') && (
                                    <Typography variant="caption" color="primary" display="block" sx={{ mt: 0.5 }}>
                                      {a.makeup_group_name && a.makeup_lesson_date
                                        ? `Отработка: ${a.makeup_group_name} · ${formatDate(a.makeup_lesson_date)}`
                                        : a.makeup_custom_lesson_title
                                          ? `Ручной урок: ${a.makeup_custom_lesson_title}`
                                          : 'Отработка назначена'}
                                    </Typography>
                                  )}
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

            {isOwner && student?.status === 'active' && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Только owner: заморозка и закрытие по факту
                </Typography>
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>Заморозка абонемента</Typography>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <TextField type="date" size="small" label="Начало" value={freezeStart} onChange={(e) => setFreezeStart(e.target.value)} InputLabelProps={{ shrink: true }} />
                      <TextField type="date" size="small" label="Конец" value={freezeEnd} onChange={(e) => setFreezeEnd(e.target.value)} InputLabelProps={{ shrink: true }} />
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={!freezeStart || !freezeEnd || freezeLoading || freezeStart >= freezeEnd}
                        onClick={async () => {
                          if (!studentId) return;
                          setFreezeLoading(true);
                          try {
                            await salesApi.createStudentFreeze(studentId, { freeze_start: freezeStart, freeze_end: freezeEnd });
                            const list = await salesApi.getStudentFreezes(studentId);
                            setFreezes(list.map((f: any) => ({ id: f.id, freeze_start: f.freeze_start, freeze_end: f.freeze_end })));
                            setFreezeStart('');
                            setFreezeEnd('');
                          } catch (err: any) {
                            setError(err.response?.data?.detail || 'Не удалось создать заморозку');
                          } finally {
                            setFreezeLoading(false);
                          }
                        }}
                      >
                        Поставить заморозку
                      </Button>
                    </Stack>
                    {freezes.length > 0 && (
                      <Stack spacing={0.5} sx={{ mt: 1 }}>
                        {freezes.map((f) => (
                          <Stack key={f.id} direction="row" alignItems="center" spacing={1}>
                            <Typography variant="body2">
                              {format(parseISO(f.freeze_start), 'd.MM.yyyy', { locale: ru })} – {format(parseISO(f.freeze_end), 'd.MM.yyyy', { locale: ru })}
                            </Typography>
                            <Button size="small" color="secondary" onClick={async () => {
                              if (!studentId) return;
                              try {
                                await salesApi.deleteStudentFreeze(studentId, f.id);
                                setFreezes((prev) => prev.filter((x) => x.id !== f.id));
                              } catch (err: any) {
                                setError(err.response?.data?.detail || 'Не удалось снять заморозку');
                              }
                            }}>Снять</Button>
                          </Stack>
                        ))}
                      </Stack>
                    )}
                  </Box>
                  <Box>
                    <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>Закрыть с оплатой по факту</Typography>
                    {closeByFactPreview === null && !closeByFactLoading && (
                      <Button size="small" variant="outlined" onClick={async () => {
                        if (!studentId) return;
                        setCloseByFactLoading(true);
                        try {
                          const p = await salesApi.getCloseByFactPreview(studentId);
                          setCloseByFactPreview(p);
                        } catch (err: any) {
                          setError(err.response?.data?.detail || 'Не удалось загрузить предпросмотр');
                        } finally {
                          setCloseByFactLoading(false);
                        }
                      }}>Показать расчёт</Button>
                    )}
                    {closeByFactLoading && <Typography variant="body2" color="text.secondary">Загрузка…</Typography>}
                    {closeByFactPreview && (
                      <Stack spacing={1}>
                        <Typography variant="body2">
                          Посещено занятий в периоде: {closeByFactPreview.lessons_attended_in_period}. К оплате: {closeByFactPreview.amount} ₽
                        </Typography>
                        <Button
                          size="small"
                          color="primary"
                          variant="contained"
                          onClick={async () => {
                            if (!studentId) return;
                            try {
                              await salesApi.closeByFact(studentId);
                              setCloseByFactPreview(null);
                              onClose();
                              window.location.reload();
                            } catch (err: any) {
                              setError(err.response?.data?.detail || 'Не удалось закрыть');
                            }
                          }}
                        >
                          Закрыть с оплатой по факту
                        </Button>
                        <Button size="small" onClick={() => setCloseByFactPreview(null)}>Отмена</Button>
                      </Stack>
                    )}
                  </Box>
                </Stack>
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
