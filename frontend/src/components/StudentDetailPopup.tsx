import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
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
  Tabs,
  Tab,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HistoryIcon from '@mui/icons-material/History';
import SchoolIcon from '@mui/icons-material/School';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import PaymentsIcon from '@mui/icons-material/Payments';
import StarIcon from '@mui/icons-material/Star';
import DescriptionIcon from '@mui/icons-material/Description';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { studentsApi, salesApi, studentCardsApi, studentAccountsApi, abonementsApi, financeApi } from '../services/api';
import { Student, Abonement, AbsenceFollowUp, AbsenceFollowUpStage, StudentAccount, StudentAccountTransaction, StudentCard, StudentTimelineEvent } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getEffectiveRole, hasPermission } from '../utils/permissions';

const ABSENCE_STAGES: { value: AbsenceFollowUpStage | 'link_sent'; label: string }[] = [
  { value: 'missed', label: 'Пропустил' },
  { value: 'assigned', label: 'Назначили отработку' },
  { value: 'link_sent', label: 'Отправили ссылку' },
  { value: 'made_up', label: 'Отработал' },
  { value: 'missed_makeup', label: 'Пропустил отработку' },
];

const STUDENT_TIMELINE_TYPE_LABELS: Record<string, string> = {
  enrolled: 'Зачисление',
  group_joined: 'Добавление в группу',
  group_left: 'Выход из группы',
  lesson_attended: 'Посещение',
  lesson_missed: 'Пропуск',
  grade_added: 'Оценка',
  characteristic_published: 'Характеристика',
  payment_received: 'Оплата',
  payment_overdue: 'Просрочка оплаты',
  freeze_set: 'Заморозка',
  makeup_scheduled: 'Отработка назначена',
  makeup_done: 'Отработка проведена',
};

type FinanceAccountOption = { id: number; code: string; name: string; owner_scope: string; is_active: boolean };

const getLocalDateInputValue = (value = new Date()) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTimelineIcon = (type: string) => {
  switch (type) {
    case 'enrolled':
    case 'group_joined':
      return <SchoolIcon fontSize="small" color="primary" />;
    case 'lesson_attended':
    case 'makeup_done':
      return <EventAvailableIcon fontSize="small" color="success" />;
    case 'lesson_missed':
    case 'payment_overdue':
      return <EventBusyIcon fontSize="small" color="error" />;
    case 'payment_received':
      return <PaymentsIcon fontSize="small" color="success" />;
    case 'grade_added':
      return <StarIcon fontSize="small" color="warning" />;
    case 'characteristic_published':
      return <DescriptionIcon fontSize="small" color="info" />;
    default:
      return <HistoryIcon fontSize="small" color="action" />;
  }
};

interface StudentDetailPopupProps {
  open: boolean;
  onClose: () => void;
  studentId: number | null;
}

const StudentDetailPopup: React.FC<StudentDetailPopupProps> = ({ open, onClose, studentId }) => {
  const { user } = useAuth();
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
  const [paymentLinkCopied, setPaymentLinkCopied] = useState(false);
  const [tab, setTab] = useState<'overview' | 'history' | 'accounts'>('overview');
  const [paymentDialog, setPaymentDialog] = useState<{ account: StudentAccount; type: 'payment' | 'deduct' } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentDate, setPaymentDate] = useState(getLocalDateInputValue());
  const [paymentFinanceAccountId, setPaymentFinanceAccountId] = useState<number | ''>('');
  const [paymentDiscountType, setPaymentDiscountType] = useState<'none' | 'amount' | 'percent'>('none');
  const [paymentDiscountValue, setPaymentDiscountValue] = useState('');
  const [paymentApplyPersonalDiscount, setPaymentApplyPersonalDiscount] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccountOption[]>([]);
  const [transactions, setTransactions] = useState<StudentAccountTransaction[]>([]);
  const [transactionsAccountId, setTransactionsAccountId] = useState<number | null>(null);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<StudentTimelineEvent[]>([]);
  const [timelineType, setTimelineType] = useState<string>('all');
  const [timelineDateFrom, setTimelineDateFrom] = useState('');
  const [timelineDateTo, setTimelineDateTo] = useState('');

  const effectiveRole = getEffectiveRole(user);
  const canSeeAbsences = hasPermission(user, 'sales.access');
  const canAccessAccounts = hasPermission(user, 'student_accounts.access');
  const canManageAccounts = hasPermission(user, 'student_accounts.manage');
  const canRecordPayments = hasPermission(user, 'student_accounts.payment');
  const canInviteParent = hasPermission(user, 'students.manage') && !!student?.parent_id;
  const isOwner = effectiveRole === 'owner';
  const [freezes, setFreezes] = useState<Array<{ id: number; freeze_start: string; freeze_end: string }>>([]);
  const [freezeStart, setFreezeStart] = useState('');
  const [freezeEnd, setFreezeEnd] = useState('');
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [closeByFactPreview, setCloseByFactPreview] = useState<{ lessons_attended_in_period: number; amount: number } | null>(null);
  const [closeByFactLoading, setCloseByFactLoading] = useState(false);
  const [abonements, setAbonements] = useState<Abonement[]>([]);
  const [tochkaPayerEdit, setTochkaPayerEdit] = useState(false);
  const [tochkaPayerValue, setTochkaPayerValue] = useState('');
  const [tochkaPayerSaving, setTochkaPayerSaving] = useState(false);
  const [tochkaPayerError, setTochkaPayerError] = useState<string | null>(null);

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
    setTimelineEvents([]);
    setTab('overview');
    setTransactions([]);
    setTransactionsAccountId(null);
    setPaymentDialog(null);
    setPaymentAmount('');
    setPaymentNote('');
    setPaymentDate(getLocalDateInputValue());
    setPaymentFinanceAccountId('');
    setPaymentDiscountType('none');
    setPaymentDiscountValue('');
    setPaymentApplyPersonalDiscount(false);
    setFinanceAccounts([]);
    const promises: Promise<any>[] = [
      studentsApi.getById(studentId),
      studentsApi.getAttendances(studentId),
      studentsApi.getTimeline(studentId, { limit: 50 }),
      canSeeAbsences ? salesApi.getAbsences({ student_id: studentId }) : Promise.resolve([]),
      canAccessAccounts ? studentsApi.getAccounts(studentId) : Promise.resolve([]),
      canSeeAbsences ? studentCardsApi.list({ student_id: studentId }).then((cards) => (cards && cards[0]) || null) : Promise.resolve(null),
      abonementsApi.getAll().catch(() => []),
      canRecordPayments ? financeApi.listAccounts().catch(() => []) : Promise.resolve([]),
    ];
    if (isOwner) promises.push(salesApi.getStudentFreezes(studentId));
    Promise.all(promises)
      .then((results) => {
        const s = results[0];
        const att = results[1];
        const timeline = results[2];
        const abs = results[3];
        const acc = results[4];
        const card = results[5] as StudentCard | null;
        const abons = results[6] as Abonement[];
        const finAccounts = results[7] as FinanceAccountOption[];
        const frz = results[8];
        setStudent(s);
        setAttendances(att);
        setTimelineEvents((timeline || []) as StudentTimelineEvent[]);
        setAbsences(abs as AbsenceFollowUp[]);
        setAccounts((acc || []) as StudentAccount[]);
        setStudentCard(card ?? null);
        setAbonements(Array.isArray(abons) ? abons : []);
        setFinanceAccounts(Array.isArray(finAccounts) ? finAccounts : []);
        setTochkaPayerEdit(false);
        setTochkaPayerValue(card?.tochka_payer_name || '');
        if (isOwner && Array.isArray(frz)) setFreezes(frz.map((f: any) => ({ id: f.id, freeze_start: f.freeze_start, freeze_end: f.freeze_end })));
      })
      .catch((err: any) => setError(err.response?.data?.detail || err.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [open, studentId, canSeeAbsences, canAccessAccounts, canRecordPayments, isOwner]);

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
  void loadAccounts;

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

  const formatMoney = (value: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value || 0);

  const getPaymentAbonement = (): Abonement | undefined => {
    const abonementId = studentCard?.abonement_id ?? student?.abonement_id;
    return studentCard?.abonement || student?.abonement || abonements.find((a) => a.id === abonementId);
  };

  const getCurrentPaymentDiscount = () => {
    const type = paymentDiscountType;
    const value = Number(paymentDiscountValue.replace(',', '.')) || 0;
    return { type, value: type === 'none' ? 0 : value };
  };

  const getPaymentAmountFromAbonement = () => {
    const abonement = getPaymentAbonement();
    if (!abonement) return null;
    const base = Number(abonement.price || 0);
    const { type, value } = getCurrentPaymentDiscount();
    const discount = type === 'percent' ? (base * Math.min(value, 100)) / 100 : type === 'amount' ? value : 0;
    return Math.max(0, Math.round((base - discount) * 100) / 100);
  };

  const getDefaultPaymentDiscount = () => {
    const source = studentCard || student;
    return {
      type: (source?.discount_type || 'none') as 'none' | 'amount' | 'percent',
      value: source?.discount_value ? String(source.discount_value) : '',
    };
  };

  const openPaymentDialog = (account: StudentAccount, type: 'payment' | 'deduct') => {
    const defaultDiscount = getDefaultPaymentDiscount();
    setPaymentDialog({ account, type });
    setPaymentAmount('');
    setPaymentNote('');
    setPaymentDate(getLocalDateInputValue());
    setPaymentError(null);
    setPaymentFinanceAccountId(type === 'payment' ? financeAccounts[0]?.id || '' : '');
    setPaymentDiscountType(type === 'payment' ? defaultDiscount.type : 'none');
    setPaymentDiscountValue(type === 'payment' ? defaultDiscount.value : '');
    setPaymentApplyPersonalDiscount(type === 'payment' && defaultDiscount.type !== 'none');
  };

  const loadTimeline = async () => {
    if (!studentId) return;
    const data = await studentsApi.getTimeline(studentId, {
      limit: 100,
      event_type: timelineType === 'all' ? undefined : timelineType,
      date_from: timelineDateFrom || undefined,
      date_to: timelineDateTo || undefined,
    });
    setTimelineEvents(data);
  };

  const openTransactions = async (acc: StudentAccount) => {
    if (transactionsAccountId === acc.id) {
      setTransactionsAccountId(null);
      setTransactions([]);
      return;
    }
    setTransactionsAccountId(acc.id);
    setTransactionsLoading(true);
    try {
      const list = await studentAccountsApi.getTransactions(acc.id);
      setTransactions(list);
    } catch {
      setTransactions([]);
    } finally {
      setTransactionsLoading(false);
    }
  };

  const handlePaymentOrDeduct = async () => {
    if (!paymentDialog || !studentId) return;
    const amount = parseFloat(paymentAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      setPaymentError('Введите положительную сумму');
      return;
    }
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      if (paymentDialog.type === 'payment') {
        const discountValue = Number(paymentDiscountValue.replace(',', '.')) || 0;
        await studentAccountsApi.addPayment(paymentDialog.account.id, {
          amount,
          payment_date: paymentDate || undefined,
          finance_account_id: paymentFinanceAccountId === '' ? null : Number(paymentFinanceAccountId),
          discount_type: paymentDiscountType,
          discount_value: paymentDiscountType === 'none' ? 0 : discountValue,
          apply_personal_discount: paymentApplyPersonalDiscount,
          note: paymentNote.trim() || undefined,
        });
        if (paymentApplyPersonalDiscount) {
          const [freshStudent, freshCards] = await Promise.all([
            studentsApi.getById(studentId),
            canSeeAbsences ? studentCardsApi.list({ student_id: studentId }).catch(() => []) : Promise.resolve([]),
          ]);
          setStudent(freshStudent);
          setStudentCard(Array.isArray(freshCards) && freshCards.length > 0 ? freshCards[0] : studentCard);
        }
      } else {
        await studentAccountsApi.deduct(paymentDialog.account.id, { amount, note: paymentNote.trim() || undefined });
      }
      const updated = await studentsApi.getAccounts(studentId);
      setAccounts(updated);
      if (transactionsAccountId === paymentDialog.account.id) {
        const txs = await studentAccountsApi.getTransactions(paymentDialog.account.id);
        setTransactions(txs);
      }
      setPaymentDialog(null);
      setPaymentAmount('');
      setPaymentNote('');
      setPaymentDate(getLocalDateInputValue());
      setPaymentFinanceAccountId('');
      setPaymentDiscountType('none');
      setPaymentDiscountValue('');
      setPaymentApplyPersonalDiscount(false);
    } catch (err: any) {
      setPaymentError(err.response?.data?.detail || 'Ошибка операции');
    } finally {
      setPaymentLoading(false);
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
            <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tab value="overview" label="Обзор" />
              <Tab value="history" label="История" />
              {canAccessAccounts && <Tab value="accounts" label="Счёт" />}
            </Tabs>
            {tab === 'overview' && (
              <>
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
                {studentCard?.payment_link && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" fontWeight={500} sx={{ mb: 0.5 }}>
                      Ссылка для оплаты:
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField
                        size="small"
                        fullWidth
                        value={studentCard.payment_link}
                        InputProps={{ readOnly: true }}
                      />
                      <Button
                        size="small"
                        onClick={async () => {
                          if (!studentCard?.payment_link) return;
                          try {
                            await navigator.clipboard.writeText(studentCard.payment_link);
                            setPaymentLinkCopied(true);
                            setTimeout(() => setPaymentLinkCopied(false), 1500);
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        {paymentLinkCopied ? 'Скопировано' : 'Копировать'}
                      </Button>
                    </Stack>
                  </Box>
                )}
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
                  {studentCard.birth_date && (() => {
                    const birth = parseISO(studentCard.birth_date.slice(0, 10));
                    const today = new Date();
                    let years = today.getFullYear() - birth.getFullYear();
                    let months = today.getMonth() - birth.getMonth();
                    if (months < 0) { years -= 1; months += 12; }
                    return (
                      <Typography variant="body2"><strong>Возраст:</strong> {years} {years === 1 ? 'год' : years < 5 ? 'года' : 'лет'} {months} {months === 1 ? 'месяц' : months < 5 ? 'месяца' : 'месяцев'}</Typography>
                    );
                  })()}
                  <Typography variant="body2"><strong>Родитель:</strong> {studentCard.parent_full_name || '—'}</Typography>
                  <Typography variant="body2"><strong>Телефон:</strong> {studentCard.parent_phone || studentCard.student_phone || '—'}</Typography>
                  <Typography variant="body2"><strong>Email:</strong> {studentCard.parent_email || '—'}</Typography>
                  <Typography variant="body2"><strong>Город:</strong> {studentCard.city || '—'}</Typography>
                  <Typography variant="body2"><strong>Откуда пришел:</strong> {studentCard.source || '—'}</Typography>
                  <Typography variant="body2"><strong>Формат:</strong> {studentCard.format_type === 'group' ? 'Группа' : studentCard.format_type === 'individual' ? 'Индивидуальное' : '—'}</Typography>
                </Box>
                {studentCard.comment && <Typography variant="body2" sx={{ mb: 1 }}><strong>Комментарий:</strong> {studentCard.comment}</Typography>}
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

              </>
            )}
            {tab === 'accounts' && canAccessAccounts && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary">Счета ученика</Typography>
                  {canManageAccounts && (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField
                        size="small"
                        label="Новый счёт"
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                        placeholder="Основной"
                        sx={{ width: 150 }}
                      />
                      <Button size="small" variant="outlined" onClick={handleCreateAccount} disabled={!newAccountName.trim() || accountsLoading}>
                        Создать
                      </Button>
                    </Stack>
                  )}
                </Stack>
                {accountsError && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setAccountsError(null)}>{accountsError}</Alert>}
                {accountsLoading && !accounts.length ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={24} /></Box>
                ) : accounts.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">Нет счетов.</Typography>
                ) : (
                  <Stack spacing={2}>
                    {accounts.map((acc) => (
                      <Card key={acc.id} variant="outlined">
                        <CardContent sx={{ pb: '12px !important' }}>
                          <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" spacing={1}>
                            <Box>
                              <Typography variant="subtitle2">{acc.name}</Typography>
                              <Typography variant="h6" color={acc.balance < 0 ? 'error' : 'text.primary'}>
                                {acc.balance ?? 0} ₽
                              </Typography>
                            </Box>
                            {canManageAccounts && (
                              <Stack direction="row" spacing={1}>
                                <Button size="small" variant="contained" color="success"
                                  onClick={() => openPaymentDialog(acc, 'payment')}>
                                  Пополнить
                                </Button>
                                <Button size="small" variant="outlined" color="warning"
                                  onClick={() => openPaymentDialog(acc, 'deduct')}>
                                  Списать
                                </Button>
                                <Button size="small" variant="text"
                                  onClick={() => openTransactions(acc)}>
                                  {transactionsAccountId === acc.id ? 'Скрыть' : 'История'}
                                </Button>
                              </Stack>
                            )}
                            {!canManageAccounts && (
                              <Button size="small" variant="text" onClick={() => openTransactions(acc)}>
                                {transactionsAccountId === acc.id ? 'Скрыть' : 'История'}
                              </Button>
                            )}
                          </Stack>
                          {transactionsAccountId === acc.id && (
                            <Box sx={{ mt: 1.5 }}>
                              {transactionsLoading ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}><CircularProgress size={20} /></Box>
                              ) : transactions.length === 0 ? (
                                <Typography variant="body2" color="text.secondary">Нет операций.</Typography>
                              ) : (
                                <Table size="small">
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>Дата</TableCell>
                                      <TableCell>Тип</TableCell>
                                      <TableCell align="right">Сумма</TableCell>
                                      <TableCell>Примечание</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {transactions.map((tx) => (
                                      <TableRow key={tx.id}>
                                        <TableCell>{formatDate(tx.created_at)}</TableCell>
                                        <TableCell>
                                          <Chip size="small"
                                            label={tx.kind === 'payment' ? 'Оплата' : 'Списание'}
                                            color={tx.kind === 'payment' ? 'success' : 'default'}
                                          />
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: tx.kind === 'payment' ? 'success.main' : 'text.secondary', fontWeight: 500 }}>
                                          {tx.kind === 'payment' ? '+' : '-'}{Math.abs(tx.amount)} ₽
                                        </TableCell>
                                        <TableCell sx={{ maxWidth: 260 }}>
                                          <Typography variant="body2" noWrap title={tx.note || ''}>
                                            {tx.note || '—'}
                                          </Typography>
                                          {tx.kind === 'payment' && tx.finance_account_id ? (
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>
                                              Счёт поступления: {financeAccounts.find((acc) => acc.id === tx.finance_account_id)?.name || `#${tx.finance_account_id}`}
                                            </Typography>
                                          ) : null}
                                          {tx.kind === 'payment' && tx.discount_type && tx.discount_type !== 'none' ? (
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                              Скидка: {tx.discount_type === 'percent' ? `${tx.discount_value || 0}%` : formatMoney(tx.discount_value || 0)}
                                            </Typography>
                                          ) : null}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </Box>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                )}

                {canManageAccounts && studentCard && (
                  <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Автосопоставление (Точка банк)
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      ФИО плательщика точно как в выписке — используется при автоимпорте вместо ФИО родителя.
                    </Typography>
                    {tochkaPayerEdit ? (
                      <Stack spacing={1}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <TextField
                            size="small"
                            fullWidth
                            label="ФИО в выписке банка"
                            value={tochkaPayerValue}
                            onChange={(e) => { setTochkaPayerValue(e.target.value); setTochkaPayerError(null); }}
                            placeholder="Иванова Анна Петровна"
                            autoFocus
                            error={!!tochkaPayerError}
                          />
                          <Button size="small" variant="contained" disabled={tochkaPayerSaving}
                            onClick={async () => {
                              if (!studentCard?.id) return;
                              setTochkaPayerSaving(true);
                              setTochkaPayerError(null);
                              try {
                                const updated = await studentCardsApi.update(studentCard.id, {
                                  tochka_payer_name: tochkaPayerValue.trim() || null,
                                });
                                setStudentCard(updated);
                                setTochkaPayerValue(updated.tochka_payer_name || '');
                                setTochkaPayerEdit(false);
                              } catch (e: any) {
                                setTochkaPayerError(e?.response?.data?.detail || e?.message || 'Ошибка сохранения');
                              } finally {
                                setTochkaPayerSaving(false);
                              }
                            }}>
                            {tochkaPayerSaving ? 'Сохранение…' : 'Сохранить'}
                          </Button>
                          <Button size="small" variant="text" onClick={() => { setTochkaPayerEdit(false); setTochkaPayerError(null); setTochkaPayerValue(studentCard?.tochka_payer_name || ''); }}>
                            Отмена
                          </Button>
                        </Stack>
                        {tochkaPayerError && <Alert severity="error" sx={{ py: 0 }}>{tochkaPayerError}</Alert>}
                      </Stack>
                    ) : (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" sx={{ flex: 1 }}>
                          {studentCard.tochka_payer_name
                            ? <><strong>Точное ФИО:</strong> {studentCard.tochka_payer_name}</>
                            : <span style={{ color: '#9e9e9e' }}>Не задано — используется ФИО родителя ({studentCard.parent_full_name || '—'})</span>
                          }
                        </Typography>
                        <Button size="small" variant="outlined"
                          onClick={() => { setTochkaPayerValue(studentCard.tochka_payer_name || ''); setTochkaPayerEdit(true); }}>
                          Изменить
                        </Button>
                      </Stack>
                    )}
                  </Box>
                )}
              </Paper>
            )}

            {tab === 'history' && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 2 }}>
                  <FormControl size="small" sx={{ minWidth: 220 }}>
                    <InputLabel>Тип события</InputLabel>
                    <Select value={timelineType} label="Тип события" onChange={(e) => setTimelineType(e.target.value)}>
                      <MenuItem value="all">Все события</MenuItem>
                      {Object.entries(STUDENT_TIMELINE_TYPE_LABELS).map(([key, label]) => (
                        <MenuItem key={key} value={key}>{label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField size="small" type="date" label="С" value={timelineDateFrom} onChange={(e) => setTimelineDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
                  <TextField size="small" type="date" label="По" value={timelineDateTo} onChange={(e) => setTimelineDateTo(e.target.value)} InputLabelProps={{ shrink: true }} />
                  <Button variant="outlined" onClick={loadTimeline}>Применить</Button>
                </Stack>
                {timelineEvents.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">Событий пока нет.</Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {timelineEvents.map((event) => (
                      <Box key={event.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
                        <Box sx={{ mt: 0.25 }}>{getTimelineIcon(event.type)}</Box>
                        <Box sx={{ flex: 1 }}>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography variant="body2" fontWeight={600}>{event.title}</Typography>
                            <Chip size="small" label={STUDENT_TIMELINE_TYPE_LABELS[event.type] || event.type} />
                          </Stack>
                          {event.description && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                              {event.description}
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            {formatDate(event.created_at)}{event.creator_name ? ` · ${event.creator_name}` : ''}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Paper>
            )}
          </Stack>
        )}
      </DialogContent>

      <Dialog open={false && !!paymentDialog} onClose={() => setPaymentDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{paymentDialog?.type === 'payment' ? 'Пополнение счёта' : 'Списание со счёта'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {paymentError && <Alert severity="error" onClose={() => setPaymentError(null)}>{paymentError}</Alert>}
            <Typography variant="body2" color="text.secondary">
              Счёт: <strong>{paymentDialog?.account.name}</strong> · Баланс: {paymentDialog?.account.balance ?? 0} ₽
            </Typography>
            <Stack spacing={1}>
              <TextField
                label="Сумма, ₽"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                type="number"
                inputProps={{ min: 0, step: 1 }}
                autoFocus
                fullWidth
              />
              {paymentDialog?.type === 'payment' && (() => {
                const abonPrice = studentCard?.abonement?.price
                  ?? abonements.find(a => a.id === studentCard?.abonement_id)?.price;
                if (abonPrice == null) return null;
                return (
                  <Button
                    size="small"
                    variant="outlined"
                    sx={{ alignSelf: 'flex-start' }}
                    onClick={() => setPaymentAmount(String(abonPrice))}
                  >
                    Цена абонемента: {abonPrice} ₽
                  </Button>
                );
              })()}
            </Stack>
            <TextField
              label="Примечание (необязательно)"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              fullWidth
              size="small"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentDialog(null)}>Отмена</Button>
          <Button
            variant="contained"
            color={paymentDialog?.type === 'payment' ? 'success' : 'warning'}
            onClick={handlePaymentOrDeduct}
            disabled={!paymentAmount || paymentLoading}
          >
            {paymentLoading ? 'Сохранение…' : paymentDialog?.type === 'payment' ? 'Пополнить' : 'Списать'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!paymentDialog} onClose={() => setPaymentDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{paymentDialog?.type === 'payment' ? 'Пополнение счёта' : 'Списание со счёта'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {paymentError && <Alert severity="error" onClose={() => setPaymentError(null)}>{paymentError}</Alert>}
            <Typography variant="body2" color="text.secondary">
              Счёт ученика: <strong>{paymentDialog?.account.name}</strong> · Баланс: {formatMoney(paymentDialog?.account.balance ?? 0)}
            </Typography>
            {paymentDialog?.type === 'payment' && (
              <FormControl fullWidth size="small">
                <InputLabel>Куда поступили деньги</InputLabel>
                <Select
                  value={paymentFinanceAccountId}
                  label="Куда поступили деньги"
                  onChange={(e) => setPaymentFinanceAccountId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <MenuItem value="">Не указывать</MenuItem>
                  {financeAccounts.map((account) => (
                    <MenuItem key={account.id} value={account.id}>
                      {account.name}{account.code ? ` (${account.code})` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {paymentDialog?.type === 'payment' && (
              <TextField
                label="Дата пополнения"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                type="date"
                size="small"
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            )}
            <Stack spacing={1}>
              <TextField
                label="Сумма, ₽"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                type="number"
                inputProps={{ min: 0, step: 1 }}
                autoFocus
                fullWidth
              />
              {paymentDialog?.type === 'payment' && (() => {
                const abonement = getPaymentAbonement();
                const finalAmount = getPaymentAmountFromAbonement();
                if (!abonement || finalAmount == null) return null;
                return (
                  <Stack spacing={1}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '160px 1fr' }, gap: 1 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Скидка</InputLabel>
                        <Select
                          value={paymentDiscountType}
                          label="Скидка"
                          onChange={(e) => {
                            const next = e.target.value as 'none' | 'amount' | 'percent';
                            setPaymentDiscountType(next);
                            if (next === 'none') {
                              setPaymentDiscountValue('');
                              setPaymentApplyPersonalDiscount(false);
                            } else {
                              setPaymentApplyPersonalDiscount(true);
                            }
                          }}
                        >
                          <MenuItem value="none">Нет</MenuItem>
                          <MenuItem value="amount">Сумма</MenuItem>
                          <MenuItem value="percent">Процент</MenuItem>
                        </Select>
                      </FormControl>
                      <TextField
                        label={paymentDiscountType === 'percent' ? 'Размер скидки, %' : 'Размер скидки, ₽'}
                        value={paymentDiscountValue}
                        onChange={(e) => setPaymentDiscountValue(e.target.value)}
                        disabled={paymentDiscountType === 'none'}
                        type="number"
                        size="small"
                        inputProps={{ min: 0, max: paymentDiscountType === 'percent' ? 100 : undefined, step: 1 }}
                        fullWidth
                      />
                    </Box>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={paymentApplyPersonalDiscount}
                          onChange={(e) => setPaymentApplyPersonalDiscount(e.target.checked)}
                          disabled={paymentDiscountType === 'none'}
                        />
                      }
                      label="Применить скидку к ученику и пересчитать стоимость уроков в текущем периоде"
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      sx={{ alignSelf: 'flex-start' }}
                      onClick={() => setPaymentAmount(String(finalAmount))}
                    >
                      Подставить сумму абонемента: {formatMoney(abonement.price)} → {formatMoney(finalAmount)}
                    </Button>
                  </Stack>
                );
              })()}
            </Stack>
            <TextField
              label="Примечание (необязательно)"
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              fullWidth
              size="small"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentDialog(null)}>Отмена</Button>
          <Button
            variant="contained"
            color={paymentDialog?.type === 'payment' ? 'success' : 'warning'}
            onClick={handlePaymentOrDeduct}
            disabled={!paymentAmount || paymentLoading}
          >
            {paymentLoading ? 'Сохранение…' : paymentDialog?.type === 'payment' ? 'Пополнить' : 'Списать'}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export default StudentDetailPopup;
