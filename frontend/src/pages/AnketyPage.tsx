import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import { studentCardsApi, abonementsApi, salesApi } from '../services/api';
import { StudentCard as StudentCardType, Abonement, AnketaConvertConflict } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getEffectiveRole } from '../utils/permissions';

const ANKETA_STATUS_LABELS: Record<string, string> = {
  draft: 'Новая / В работе',
  filled: 'Заполнена',
  converted: 'Конвертирована',
  cancelled: 'Отменена / Дубль',
};

type StatusTab = 'all' | 'draft' | 'filled' | 'converted' | 'cancelled';

const AnketyPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const addStudentMode = searchParams.get('addStudent') === '1';
  const cardIdFromUrl = searchParams.get('cardId');
  const isOwner = getEffectiveRole(user) === 'owner';

  const [items, setItems] = useState<StudentCardType[]>([]);
  const [abonements, setAbonements] = useState<Abonement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [convertLoading, setConvertLoading] = useState<number | null>(null);
  const [convertCardId, setConvertCardId] = useState<number | null>(null);
  const [convertConflict, setConvertConflict] = useState<AnketaConvertConflict | null>(null);
  const [conflictChoice, setConflictChoice] = useState<'existing_parent' | 'existing_student' | 'new_student' | null>(null);
  const [selectedExistingStudentId, setSelectedExistingStudentId] = useState<number | ''>('');

  const [studentFullName, setStudentFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [gender, setGender] = useState('');
  const [onGrant, setOnGrant] = useState(false);
  const [formatType, setFormatType] = useState('');
  const [city, setCity] = useState('');
  const [school, setSchool] = useState('');
  const [grade, setGrade] = useState('');
  const [parentFullName, setParentFullName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentPhone2, setParentPhone2] = useState('');
  const [parentTelegram, setParentTelegram] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [preferredMessenger, setPreferredMessenger] = useState('');
  const [comment, setComment] = useState('');
  const [source, setSource] = useState('');
  const [abonementId, setAbonementId] = useState<number | ''>('');
  const [discountType, setDiscountType] = useState<'none' | 'amount' | 'percent'>('none');
  const [discountValue, setDiscountValue] = useState('');
  const [anketaStatus, setAnketaStatus] = useState('');
  const [studentsForCards, setStudentsForCards] = useState<{ id: number; full_name: string }[]>([]);
  const [studentId, setStudentId] = useState<number | ''>('');

  const resetForm = () => {
    setEditingId(null);
    setStudentFullName('');
    setBirthDate('');
    setStudentPhone('');
    setTelegram('');
    setGender('');
    setOnGrant(false);
    setFormatType('');
    setCity('');
    setSchool('');
    setGrade('');
    setParentFullName('');
    setParentPhone('');
    setParentPhone2('');
    setParentTelegram('');
    setParentEmail('');
    setStudentEmail('');
    setPreferredMessenger('');
    setComment('');
    setSource('');
    setAbonementId('');
    setDiscountType('none');
    setDiscountValue('');
    setAnketaStatus('');
    setStudentId('');
  };

  const loadAnkety = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { archived?: boolean; anketa_status?: string[] } = { archived: false };
      if (statusTab !== 'all') params.anketa_status = [statusTab];
      const data = await studentCardsApi.list(params);
      setItems(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось загрузить анкеты');
    } finally {
      setLoading(false);
    }
  };

  const loadAbonements = async () => {
    if (!isOwner) return;
    try {
      const data = await abonementsApi.getAll({ status_filter: 'active' });
      setAbonements(data);
    } catch {}
  };

  useEffect(() => {
    void loadAnkety();
  }, [statusTab]);

  useEffect(() => {
    void loadAbonements();
  }, [isOwner]);

  const [addStudentDialogOpened, setAddStudentDialogOpened] = useState(false);
  useEffect(() => {
    if (addStudentMode && !addStudentDialogOpened) {
      setAddStudentDialogOpened(true);
      resetForm();
      setDialogOpen(true);
      salesApi.getStudentsForCards().then(setStudentsForCards).catch(() => setStudentsForCards([]));
    }
  }, [addStudentMode, addStudentDialogOpened]);

  useEffect(() => {
    if (!cardIdFromUrl) return;
    const id = parseInt(cardIdFromUrl, 10);
    if (Number.isNaN(id)) return;
    studentCardsApi.get(id)
      .then((card) => {
        setEditingId(card.id);
        setStudentId(card.student_id ?? '');
        setStudentFullName(card.student_full_name || '');
        setAnketaStatus(card.anketa_status || '');
        salesApi.getStudentsForCards().then(setStudentsForCards).catch(() => setStudentsForCards([]));
        setBirthDate(card.birth_date ? card.birth_date.slice(0, 10) : '');
        setStudentPhone(card.student_phone || '');
        setTelegram(card.telegram || '');
        setGender(card.gender || '');
        setOnGrant(card.on_grant || false);
        setFormatType(card.format_type || '');
        setCity(card.city || '');
        setSchool(card.school || '');
        setGrade(card.grade || '');
        setParentFullName(card.parent_full_name || '');
        setParentPhone(card.parent_phone || '');
        setParentPhone2(card.parent_phone_2 || '');
        setParentTelegram(card.parent_telegram || '');
        setParentEmail(card.parent_email || '');
        setStudentEmail(card.student_email || '');
        setPreferredMessenger(card.preferred_messenger || '');
        setComment(card.comment || '');
        setSource(card.source || '');
        setAbonementId(card.abonement_id ?? '');
        setDiscountType(card.discount_type || 'none');
        setDiscountValue(String(card.discount_value ?? ''));
        setDialogOpen(true);
      })
      .catch(() => setError('Анкета не найдена'));
  }, [cardIdFromUrl]);

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
    salesApi.getStudentsForCards().then(setStudentsForCards).catch(() => setStudentsForCards([]));
  };

  const openEdit = (card: StudentCardType) => {
    setEditingId(card.id);
    setStudentId(card.student_id ?? '');
    setStudentFullName(card.student_full_name || '');
    setAnketaStatus(card.anketa_status || '');
    salesApi.getStudentsForCards().then(setStudentsForCards).catch(() => setStudentsForCards([]));
    setBirthDate(card.birth_date ? card.birth_date.slice(0, 10) : '');
    setStudentPhone(card.student_phone || '');
    setTelegram(card.telegram || '');
    setGender(card.gender || '');
    setOnGrant(card.on_grant || false);
    setFormatType(card.format_type || '');
    setCity(card.city || '');
    setSchool(card.school || '');
    setGrade(card.grade || '');
    setParentFullName(card.parent_full_name || '');
    setParentPhone(card.parent_phone || '');
    setParentPhone2(card.parent_phone_2 || '');
    setParentTelegram(card.parent_telegram || '');
    setParentEmail(card.parent_email || '');
    setStudentEmail(card.student_email || '');
    setPreferredMessenger(card.preferred_messenger || '');
    setComment(card.comment || '');
    setSource(card.source || '');
    setAbonementId(card.abonement_id ?? '');
    setDiscountType(card.discount_type || 'none');
    setDiscountValue(String(card.discount_value ?? ''));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const name = studentFullName.trim();
    if (!name) {
      setError('ФИО ученика обязательно');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        student_id: studentId ? Number(studentId) : null,
        student_full_name: name,
        birth_date: birthDate || null,
        student_phone: studentPhone.trim() || null,
        telegram: telegram.trim() || null,
        gender: gender.trim() || null,
        on_grant: onGrant,
        format_type: formatType.trim() || null,
        city: city.trim() || null,
        school: school.trim() || null,
        grade: grade.trim() || null,
        parent_full_name: parentFullName.trim() || null,
        parent_phone: parentPhone.trim() || null,
        parent_phone_2: parentPhone2.trim() || null,
        parent_telegram: parentTelegram.trim() || null,
        parent_email: parentEmail.trim() || null,
        student_email: studentEmail.trim() || null,
        preferred_messenger: preferredMessenger.trim() || null,
        comment: comment.trim() || null,
        source: source.trim() || null,
        abonement_id: isOwner && abonementId ? Number(abonementId) : null,
        discount_type: isOwner ? discountType : 'none',
        discount_value: isOwner ? parseFloat(discountValue) || 0 : 0,
      };
      if (editingId) {
        if (anketaStatus) payload.anketa_status = anketaStatus;
        await studentCardsApi.update(editingId, payload);
      } else {
        const created = await studentCardsApi.create(payload);
        if (addStudentMode) {
          try {
            const res = await studentCardsApi.convert(created.id);
            setDialogOpen(false);
            resetForm();
            navigate(`/students?detail=${res.student_id}`);
            await loadAnkety();
            return;
          } catch (err: any) {
            const detail = err.response?.data?.detail;
            if (err.response?.status === 409 && detail && (detail.code === 'existing_parent' || detail.code === 'existing_student')) {
              setConvertCardId(created.id);
              setConvertConflict(detail as AnketaConvertConflict);
              setDialogOpen(false);
            } else {
              setError(typeof detail === 'string' ? detail : detail?.message || 'Ошибка конверсии');
            }
            return;
          }
        }
      }
      setDialogOpen(false);
      resetForm();
      await loadAnkety();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось сохранить анкету');
    } finally {
      setSaving(false);
    }
  };

  const handleConvert = async (card: StudentCardType, body?: { use_existing_parent_id?: number; use_existing_student_id?: number }) => {
    setConvertLoading(card.id);
    setError(null);
    setConvertConflict(null);
    setConvertCardId(card.id);
    setConflictChoice(null);
    setSelectedExistingStudentId('');
    try {
      const res = await studentCardsApi.convert(card.id, body);
      setConvertCardId(null);
      await loadAnkety();
      if (res.student_id) {
        navigate(`/students?detail=${res.student_id}`);
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (err.response?.status === 409 && detail && (detail.code === 'existing_parent' || detail.code === 'existing_student')) {
        setConvertConflict(detail as AnketaConvertConflict);
      } else {
        setError(typeof detail === 'string' ? detail : detail?.message || 'Ошибка конверсии');
      }
    } finally {
      setConvertLoading(null);
    }
  };

  const handleConflictResolve = async () => {
    if (!convertCardId || !convertConflict) return;
    if (convertConflict.code === 'existing_parent' && conflictChoice === 'existing_parent' && convertConflict.existing_parent_id) {
      await handleConvert({ id: convertCardId } as StudentCardType, { use_existing_parent_id: convertConflict.existing_parent_id });
      setConvertConflict(null);
      setConvertCardId(null);
      return;
    }
    if (convertConflict.code === 'existing_student') {
      if (conflictChoice === 'existing_student' && (convertConflict.existing_student_id || selectedExistingStudentId)) {
        const sid = Number(selectedExistingStudentId || convertConflict.existing_student_id);
        await handleConvert({ id: convertCardId } as StudentCardType, { use_existing_student_id: sid });
        setConvertConflict(null);
        setConvertCardId(null);
        setSelectedExistingStudentId('');
        return;
      }
      if (conflictChoice === 'new_student' && convertConflict.existing_parent_id) {
        await handleConvert({ id: convertCardId } as StudentCardType, { use_existing_parent_id: convertConflict.existing_parent_id });
        setConvertConflict(null);
        setConvertCardId(null);
        return;
      }
    }
    setError('Выберите вариант');
  };

  const openStudent = (studentId: number) => {
    navigate(`/students?detail=${studentId}`);
  };

  return (
    <Layout>
      <Box sx={{ p: 2 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Анкеты
        </Typography>

        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
          <Tabs value={statusTab} onChange={(_, v) => setStatusTab(v)}>
            <Tab label="Все" value="all" />
            <Tab label="Новая / В работе" value="draft" />
            <Tab label="Заполнена" value="filled" />
            <Tab label="Конвертирована" value="converted" />
            <Tab label="Отменена" value="cancelled" />
          </Tabs>
          <Button variant="outlined" onClick={() => navigate('/sales/student-cards')}>
            Карточки учеников
          </Button>
          <Button variant="contained" onClick={openCreate}>
            Создать анкету
          </Button>
        </Stack>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : items.length === 0 ? (
          <Typography color="textSecondary">Нет анкет по выбранному фильтру.</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ФИО ученика</TableCell>
                <TableCell>Родитель</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((card) => (
                <TableRow key={card.id}>
                  <TableCell>{card.student_full_name}</TableCell>
                  <TableCell>{card.parent_full_name || '—'}</TableCell>
                  <TableCell>{card.parent_email || '—'}</TableCell>
                  <TableCell>{ANKETA_STATUS_LABELS[card.anketa_status || ''] || card.anketa_status || '—'}</TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => openEdit(card)}>
                      Редактировать
                    </Button>
                    {(card.anketa_status === 'draft' || card.anketa_status === 'filled') && !card.student_id && (
                      <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        disabled={convertLoading !== null}
                        onClick={() => handleConvert(card)}
                      >
                        {convertLoading === card.id ? '...' : 'Анкета заполнена'}
                      </Button>
                    )}
                    {card.anketa_status === 'converted' && card.student_id && (
                      <Button size="small" variant="outlined" onClick={() => openStudent(card.student_id!)}>
                        Открыть ученика
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editingId ? 'Редактировать анкету' : 'Новая анкета'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography variant="subtitle2" color="primary">Обучающийся</Typography>
              {editingId ? (
                <FormControl fullWidth>
                  <InputLabel>Ученик (привязка)</InputLabel>
                  <Select value={studentId === '' ? '' : studentId} label="Ученик (привязка)" onChange={(e) => setStudentId(e.target.value === '' ? '' : Number(e.target.value))}>
                    <MenuItem value="">— не привязана</MenuItem>
                    {studentsForCards.map((s) => (
                      <MenuItem key={s.id} value={s.id}>{s.full_name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : null}
              <TextField label="ФИО ученика" value={studentFullName} onChange={(e) => setStudentFullName(e.target.value)} fullWidth required />
              <TextField label="Дата рождения" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
              <TextField label="Телефон ученика" value={studentPhone} onChange={(e) => setStudentPhone(e.target.value)} fullWidth />
              <TextField label="Телеграм" value={telegram} onChange={(e) => setTelegram(e.target.value)} fullWidth />
              <FormControl fullWidth>
                <InputLabel>Пол</InputLabel>
                <Select value={gender} label="Пол" onChange={(e) => setGender(e.target.value)}>
                  <MenuItem value="">—</MenuItem>
                  <MenuItem value="m">М</MenuItem>
                  <MenuItem value="f">Ж</MenuItem>
                </Select>
              </FormControl>
              <FormControlLabel control={<Switch checked={onGrant} onChange={(e) => setOnGrant(e.target.checked)} />} label="На гранте" />
              <FormControl fullWidth>
                <InputLabel>Формат</InputLabel>
                <Select value={formatType} label="Формат" onChange={(e) => setFormatType(e.target.value)}>
                  <MenuItem value="">—</MenuItem>
                  <MenuItem value="group">Группа</MenuItem>
                  <MenuItem value="individual">Индивидуальное</MenuItem>
                </Select>
              </FormControl>
              <TextField label="Город" value={city} onChange={(e) => setCity(e.target.value)} fullWidth />
              <TextField label="ОУ" value={school} onChange={(e) => setSchool(e.target.value)} fullWidth />
              <TextField label="Класс" value={grade} onChange={(e) => setGrade(e.target.value)} fullWidth />

              <Typography variant="subtitle2" color="primary">Родитель</Typography>
              <TextField label="ФИО родителя" value={parentFullName} onChange={(e) => setParentFullName(e.target.value)} fullWidth />
              <TextField label="Телефон родителя" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} fullWidth />
              <TextField label="Второй телефон" value={parentPhone2} onChange={(e) => setParentPhone2(e.target.value)} fullWidth />
              <TextField label="Телеграм родителя" value={parentTelegram} onChange={(e) => setParentTelegram(e.target.value)} fullWidth />
              <TextField label="Email родителя" type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} fullWidth />
              <TextField label="Email ученика" type="email" value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} fullWidth />
              <FormControl fullWidth>
                <InputLabel>Мессенджер</InputLabel>
                <Select value={preferredMessenger} label="Мессенджер" onChange={(e) => setPreferredMessenger(e.target.value)}>
                  <MenuItem value="">—</MenuItem>
                  <MenuItem value="max">MAX</MenuItem>
                  <MenuItem value="telegram">Telegram</MenuItem>
                  <MenuItem value="sms">SMS</MenuItem>
                </Select>
              </FormControl>
              <TextField label="Комментарий" value={comment} onChange={(e) => setComment(e.target.value)} fullWidth multiline minRows={2} />
              <TextField label="Откуда пришел" value={source} onChange={(e) => setSource(e.target.value)} fullWidth />

              {editingId && (
                <FormControl fullWidth>
                  <InputLabel>Статус анкеты</InputLabel>
                  <Select value={anketaStatus} label="Статус анкеты" onChange={(e) => setAnketaStatus(e.target.value)}>
                    <MenuItem value="draft">Новая / В работе</MenuItem>
                    <MenuItem value="filled">Заполнена</MenuItem>
                    <MenuItem value="cancelled">Отменена / Дубль</MenuItem>
                  </Select>
                </FormControl>
              )}

              {isOwner && (
                <>
                  <Typography variant="subtitle2" color="primary">Владелец</Typography>
                  <FormControl fullWidth>
                    <InputLabel>Абонемент</InputLabel>
                    <Select value={abonementId} label="Абонемент" onChange={(e) => setAbonementId(e.target.value === '' ? '' : Number(e.target.value))}>
                      <MenuItem value="">—</MenuItem>
                      {abonements.map((a) => (
                        <MenuItem key={a.id} value={a.id}>{a.name} — {a.price} ₽</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl fullWidth>
                    <InputLabel>Скидка</InputLabel>
                    <Select value={discountType} label="Скидка" onChange={(e) => setDiscountType(e.target.value as 'none' | 'amount' | 'percent')}>
                      <MenuItem value="none">Нет</MenuItem>
                      <MenuItem value="percent">%</MenuItem>
                      <MenuItem value="amount">Сумма</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField label="Значение скидки" type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} fullWidth />
                </>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}>{editingId ? 'Сохранить' : 'Создать'}</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={!!convertConflict} onClose={() => { setConvertConflict(null); setConvertCardId(null); setConflictChoice(null); }} maxWidth="sm" fullWidth>
          <DialogTitle>Есть совпадение</DialogTitle>
          <DialogContent>
            {convertConflict && (
              <Stack spacing={2} sx={{ pt: 1 }}>
                <Typography>{convertConflict.message}</Typography>
                {convertConflict.code === 'existing_parent' && (
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Button variant={conflictChoice === 'existing_parent' ? 'contained' : 'outlined'} size="small" onClick={() => setConflictChoice('existing_parent')}>
                      Привязать к существующему родителю
                    </Button>
                  </Stack>
                )}
                {convertConflict.code === 'existing_student' && (
                  <Stack spacing={1}>
                    <Button variant={conflictChoice === 'existing_student' ? 'contained' : 'outlined'} size="small" onClick={() => setConflictChoice('existing_student')}>
                      Привязать к существующему ученику
                    </Button>
                    {convertConflict.existing_students && convertConflict.existing_students.length > 1 && (
                      <FormControl fullWidth size="small">
                        <InputLabel>Ученик</InputLabel>
                        <Select
                          value={selectedExistingStudentId}
                          label="Ученик"
                          onChange={(e) => setSelectedExistingStudentId(e.target.value === '' ? '' : Number(e.target.value))}
                        >
                          {convertConflict.existing_students.map((s) => (
                            <MenuItem key={s.id} value={s.id}>{s.full_name}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                    <Button variant={conflictChoice === 'new_student' ? 'contained' : 'outlined'} size="small" onClick={() => setConflictChoice('new_student')}>
                      Создать нового ученика
                    </Button>
                  </Stack>
                )}
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setConvertConflict(null); setConvertCardId(null); setConflictChoice(null); setError(null); }}>Отмена</Button>
            <Button variant="contained" onClick={handleConflictResolve}>Применить</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  );
};

export default AnketyPage;
