import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControlLabel,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import { studentCardsApi, abonementsApi, salesApi } from '../services/api';
import { StudentCard as StudentCardType, Abonement } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getEffectiveRole } from '../utils/permissions';

type TabFilter = 'all' | 'active' | 'archived';

const ANKETA_STATUS_LABELS: Record<string, string> = {
  draft: 'Новая',
  filled: 'Заполнена',
  converted: 'Конвертирована',
  cancelled: 'Отменена',
};

const StudentCardsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const effectiveRole = getEffectiveRole(user);
  const isOwner = effectiveRole === 'owner';
  const isOwnerOrAdmin = effectiveRole === 'owner' || effectiveRole === 'admin';

  const [items, setItems] = useState<StudentCardType[]>([]);
  const [abonements, setAbonements] = useState<Abonement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabFilter>('active');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);

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
  const [paymentLink, setPaymentLink] = useState('');
  const [abonementId, setAbonementId] = useState<number | ''>('');
  const [discountType, setDiscountType] = useState<'none' | 'amount' | 'percent'>('none');
  const [discountValue, setDiscountValue] = useState('');
  const [studentId, setStudentId] = useState<number | ''>('');
  const [studentsForCards, setStudentsForCards] = useState<{ id: number; full_name: string }[]>([]);
  const [cabinetInviteLink, setCabinetInviteLink] = useState<string | null>(null);
  const [cabinetOpening, setCabinetOpening] = useState(false);

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
    setStudentId('');
    setPaymentLink('');
  };

  const loadCards = async () => {
    setLoading(true);
    setError(null);
    try {
      let params: { archived?: boolean } | undefined;
      if (tab === 'active') params = { archived: false };
      else if (tab === 'archived') params = { archived: true };
      const data = await studentCardsApi.list(params);
      setItems(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось загрузить карточки');
    } finally {
      setLoading(false);
    }
  };

  const loadAbonements = async () => {
    if (!isOwner) return;
    try {
      const data = await abonementsApi.getAll({ status_filter: 'active' });
      setAbonements(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void loadCards();
  }, [tab]);

  useEffect(() => {
    void loadAbonements();
  }, [isOwner]);

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
    salesApi.getStudentsForCards().then(setStudentsForCards).catch(() => setStudentsForCards([]));
  };

  const openEdit = (card: StudentCardType) => {
    setEditingId(card.id);
    setStudentId(card.student_id ?? '');
    setStudentFullName(card.student_full_name || '');
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
    setPaymentLink(card.payment_link || '');
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
      const payload = {
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
        payment_link: isOwnerOrAdmin ? paymentLink.trim() || null : null,
        abonement_id: isOwner && abonementId ? Number(abonementId) : null,
        discount_type: isOwner ? discountType : 'none',
        discount_value: isOwner ? parseFloat(discountValue) || 0 : 0,
      };
      if (editingId) {
        await studentCardsApi.update(editingId, payload);
      } else {
        await studentCardsApi.create(payload);
      }
      setDialogOpen(false);
      resetForm();
      await loadCards();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось сохранить карточку');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenParentCabinet = async (card: StudentCardType) => {
    const email = (card.parent_email || '').trim();
    if (!email) {
      setError('Укажите email родителя в карточке (поле «Email родителя»), затем нажмите «Открыть кабинет» снова.');
      return;
    }
    setError(null);
    setCabinetOpening(true);
    try {
      const res = await studentCardsApi.openParentCabinet(card.id);
      if (res.already_open) {
        setError(null);
        alert('Кабинет родителя уже открыт для этого ученика.');
      } else if (res.invite_link) {
        setCabinetInviteLink(res.invite_link);
      } else {
        setError(null);
        alert('Кабинет родителя открыт (родитель уже был в системе).');
      }
      await loadCards();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось открыть кабинет родителя');
    } finally {
      setCabinetOpening(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setError(null);
    try {
      const blob = await studentCardsApi.downloadImportTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'student_cards_import_template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось скачать шаблон');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setError('Поддерживается только формат .xlsx');
      return;
    }
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const result = await studentCardsApi.importXlsx(file);
      setImportResult(result);
      await loadCards();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка импорта');
    } finally {
      setImporting(false);
    }
  };

  const handleArchive = async (id: number, archived: boolean) => {
    setError(null);
    try {
      if (archived) await studentCardsApi.unarchive(id);
      else await studentCardsApi.archive(id);
      await loadCards();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка операции');
    }
  };

  return (
    <Layout>
      <Box sx={{ p: 2 }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Карточки учеников
        </Typography>

        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {importResult && (
          <Alert severity="info" onClose={() => setImportResult(null)} sx={{ mb: 2 }}>
            Импорт: создано {importResult.created}, пропущено {importResult.skipped}.
            {importResult.errors.length > 0 && (
              <Box component="span" display="block" sx={{ mt: 1 }}>
                Ошибки: {importResult.errors.join('; ')}
              </Box>
            )}
          </Alert>
        )}

        <Alert severity="info" sx={{ mb: 2 }}>
          Заявки и ввод данных: раздел «Анкеты». Создание ученика: Ученики → Добавить ученика (откроется форма анкеты). Здесь — все карточки, привязка к ученику и открытие кабинета родителя.
        </Alert>
        <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }} flexWrap="wrap">
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label="Активные" value="active" />
            <Tab label="В архиве" value="archived" />
            <Tab label="Все" value="all" />
          </Tabs>
          <Button variant="outlined" onClick={() => navigate('/sales/ankety')}>
            Анкеты
          </Button>
          <Button variant="contained" onClick={openCreate}>
            Новая карточка
          </Button>
          <Button variant="outlined" onClick={handleDownloadTemplate} disabled={importing}>
            Скачать шаблон Excel
          </Button>
          <Button variant="outlined" component="label" disabled={importing}>
            {importing ? 'Импорт...' : 'Импорт из Excel'}
            <input type="file" hidden accept=".xlsx" onChange={handleImportFile} />
          </Button>
        </Stack>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : items.length === 0 ? (
          <Card variant="outlined">
            <CardContent>
              <Typography color="textSecondary">
                {tab === 'active' && 'Нет активных карточек. Создайте первую.'}
                {tab === 'archived' && 'Нет архивных карточек.'}
                {tab === 'all' && 'Нет карточек.'}
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ФИО ученика</TableCell>
                <TableCell>Телефон</TableCell>
                <TableCell>Город</TableCell>
                <TableCell>Класс</TableCell>
                <TableCell>Формат</TableCell>
                <TableCell>На гранте</TableCell>
                <TableCell>Откуда пришел</TableCell>
                <TableCell>Статус анкеты</TableCell>
                <TableCell>Кабинет родителя</TableCell>
                {isOwner && <TableCell>Абонемент</TableCell>}
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((card) => (
                <TableRow key={card.id}>
                  <TableCell>{card.student_full_name}</TableCell>
                  <TableCell>{card.student_phone || card.parent_phone || '—'}</TableCell>
                  <TableCell>{card.city || '—'}</TableCell>
                  <TableCell>{card.grade || '—'}</TableCell>
                  <TableCell>{card.format_type === 'group' ? 'Группа' : card.format_type === 'individual' ? 'Индивидуальное' : '—'}</TableCell>
                  <TableCell>{card.on_grant ? 'Да' : 'Нет'}</TableCell>
                  <TableCell>{card.source || '—'}</TableCell>
                  <TableCell>{ANKETA_STATUS_LABELS[card.anketa_status || ''] || card.anketa_status || '—'}</TableCell>
                  <TableCell>
                    {card.parent_cabinet_open ? (
                      <Typography variant="body2" color="success.main">Открыт</Typography>
                    ) : (
                      <Button size="small" variant="outlined" disabled={cabinetOpening} onClick={() => handleOpenParentCabinet(card)}>
                        Открыть кабинет
                      </Button>
                    )}
                  </TableCell>
                  {isOwner && <TableCell>{card.abonement?.name ?? '—'}</TableCell>}
                  <TableCell align="right">
                    <Button size="small" onClick={() => navigate(`/sales/ankety?cardId=${card.id}`)}>Анкета</Button>
                    <Button size="small" onClick={() => openEdit(card)}>Редактировать</Button>
                    {card.student_id && (
                      <Button size="small" variant="outlined" onClick={() => navigate(`/students?detail=${card.student_id}`)}>
                        Ученик
                      </Button>
                    )}
                    {card.archived ? (
                      <Button size="small" color="primary" onClick={() => handleArchive(card.id, true)}>Разархивировать</Button>
                    ) : (
                      <Button size="small" color="secondary" onClick={() => handleArchive(card.id, false)}>В архив</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editingId ? 'Редактировать карточку' : 'Новая карточка'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography variant="subtitle2" color="primary">Обучающийся</Typography>
              <FormControl fullWidth>
                <InputLabel>Ученик (привязка карточки)</InputLabel>
                <Select value={studentId === '' ? '' : studentId} label="Ученик (привязка карточки)" onChange={(e) => setStudentId(e.target.value === '' ? '' : Number(e.target.value))}>
                  <MenuItem value="">— не привязана</MenuItem>
                  {studentsForCards.map((s) => (
                    <MenuItem key={s.id} value={s.id}>{s.full_name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField label="ФИО ученика" value={studentFullName} onChange={(e) => setStudentFullName(e.target.value)} fullWidth required />
              <TextField label="Дата рождения" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
              <TextField label="Мобильный телефон ученика" value={studentPhone} onChange={(e) => setStudentPhone(e.target.value)} fullWidth />
              <TextField label="Телеграмм ученика" value={telegram} onChange={(e) => setTelegram(e.target.value)} fullWidth />
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
              <TextField label="Образовательное учреждение" value={school} onChange={(e) => setSchool(e.target.value)} fullWidth />
              <TextField label="Класс" value={grade} onChange={(e) => setGrade(e.target.value)} fullWidth />

              <Typography variant="subtitle2" color="primary">Заказчик</Typography>
              <TextField label="ФИО родителя" value={parentFullName} onChange={(e) => setParentFullName(e.target.value)} fullWidth />
              <TextField label="Мобильный телефон родителя" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} fullWidth />
              <TextField label="Второй мобильный телефон родителя" value={parentPhone2} onChange={(e) => setParentPhone2(e.target.value)} fullWidth />
              <TextField label="Телеграм родителя" value={parentTelegram} onChange={(e) => setParentTelegram(e.target.value)} fullWidth />
              <TextField label="Email родителя" type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} fullWidth />
              <TextField label="Email ученика" type="email" value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} fullWidth />
              <FormControl fullWidth>
                <InputLabel>Удобный мессенджер для общения с родителем</InputLabel>
                <Select value={preferredMessenger} label="Удобный мессенджер для общения с родителем" onChange={(e) => setPreferredMessenger(e.target.value)}>
                  <MenuItem value="">—</MenuItem>
                  <MenuItem value="max">MAX</MenuItem>
                  <MenuItem value="telegram">Telegram</MenuItem>
                  <MenuItem value="sms">SMS</MenuItem>
                </Select>
              </FormControl>
              <TextField label="Комментарий" value={comment} onChange={(e) => setComment(e.target.value)} fullWidth multiline minRows={2} />
              <TextField label="Откуда пришел" value={source} onChange={(e) => setSource(e.target.value)} fullWidth placeholder="например: рекомендация, сайт, соцсети" />

              {isOwner && (
                <>
                  <Typography variant="subtitle2" color="primary">Только для владельца</Typography>
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
                    <InputLabel>Скидка (тип)</InputLabel>
                    <Select value={discountType} label="Скидка (тип)" onChange={(e) => setDiscountType(e.target.value as 'none' | 'amount' | 'percent')}>
                      <MenuItem value="none">Нет</MenuItem>
                      <MenuItem value="percent">Процент (%)</MenuItem>
                      <MenuItem value="amount">Денежная</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField label="Значение скидки" type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} fullWidth />
                </>
              )}
              {isOwnerOrAdmin && (
                <>
                  <Typography variant="subtitle2" color="primary">Оплата</Typography>
                  <TextField
                    label="Ссылка для оплаты"
                    value={paymentLink}
                    onChange={(e) => setPaymentLink(e.target.value)}
                    fullWidth
                    placeholder="https://..."
                  />
                </>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}>{editingId ? 'Сохранить' : 'Создать'}</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={!!cabinetInviteLink} onClose={() => { setCabinetInviteLink(null); loadCards(); }} maxWidth="sm" fullWidth>
          <DialogTitle>Ссылка для родителя</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Отправьте родителю эту ссылку — по ней он задаст пароль и получит доступ в кабинет (действует 7 дней):
            </Typography>
            {cabinetInviteLink && (
              <TextField
                fullWidth
                size="small"
                value={cabinetInviteLink}
                sx={{ mt: 1, mb: 1 }}
                InputProps={{ readOnly: true }}
              />
            )}
            <Button size="small" onClick={() => cabinetInviteLink && navigator.clipboard.writeText(cabinetInviteLink)}>
              Копировать ссылку
            </Button>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => { setCabinetInviteLink(null); loadCards(); }}>Готово</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Layout>
  );
};

export default StudentCardsPage;
