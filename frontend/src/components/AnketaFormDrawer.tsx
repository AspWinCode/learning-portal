import React, { useEffect, useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  Stack,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
} from '@mui/material';
import { studentCardsApi, abonementsApi, salesApi } from '../services/api';
import { StudentCard as StudentCardType, Abonement } from '../types';

export type AnketaFormMode = 'create' | 'edit' | 'addStudent';

interface AnketaFormDrawerProps {
  open: boolean;
  onClose: () => void;
  mode: AnketaFormMode;
  cardId: number | null;
  isOwner: boolean;
  abonements: Abonement[];
  onSuccess: (studentId?: number) => void;
  onConvertConflict?: (cardId: number, conflict: any) => void;
  onError?: (message: string) => void;
}

const AnketaFormDrawer: React.FC<AnketaFormDrawerProps> = ({
  open,
  onClose,
  mode,
  cardId,
  isOwner,
  abonements,
  onSuccess,
  onConvertConflict,
  onError,
}) => {
  const [saving, setSaving] = useState(false);
  const [studentsForCards, setStudentsForCards] = useState<{ id: number; full_name: string }[]>([]);
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
  const [studentId, setStudentId] = useState<number | ''>('');
  const [editingId, setEditingId] = useState<number | null>(null);

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

  const loadCard = (id: number) => {
    studentCardsApi.get(id)
      .then((card: StudentCardType) => {
        setEditingId(card.id);
        setStudentId(card.student_id ?? '');
        setStudentFullName(card.student_full_name || '');
        setAnketaStatus(card.anketa_status || '');
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
      })
      .catch(() => onError?.('Анкета не найдена'));
  };

  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && cardId) {
      loadCard(cardId);
    } else {
      resetForm();
    }
    salesApi.getStudentsForCards().then(setStudentsForCards).catch(() => setStudentsForCards([]));
  }, [open, mode, cardId]);

  const handleSave = async () => {
    const name = studentFullName.trim();
    if (!name) {
      onError?.('ФИО ученика обязательно');
      return;
    }
    setSaving(true);
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
    try {
      if (editingId) {
        if (anketaStatus) payload.anketa_status = anketaStatus;
        await studentCardsApi.update(editingId, payload);
        onSuccess();
        onClose();
        return;
      }
      const created = await studentCardsApi.create(payload);
      if (mode === 'addStudent') {
        try {
          const res = await studentCardsApi.convert(created.id);
          onSuccess(res.student_id);
          onClose();
        } catch (err: any) {
          const detail = err.response?.data?.detail;
          if (err.response?.status === 409 && detail && (detail.code === 'existing_parent' || detail.code === 'existing_student')) {
            onConvertConflict?.(created.id, detail);
            onClose();
          } else {
            onError?.(typeof detail === 'string' ? detail : detail?.message || 'Ошибка конверсии');
          }
        }
      } else {
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      onError?.(err.response?.data?.detail || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  const title = mode === 'addStudent' ? 'Добавить ученика' : editingId ? 'Редактировать анкету' : 'Новая анкета';

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 420 } } }}>
      <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
        <Typography variant="h6" sx={{ mb: 2 }}>{title}</Typography>
        <Stack spacing={2}>
          <Typography variant="subtitle2" color="primary">Обучающийся</Typography>
          {editingId ? (
            <FormControl fullWidth size="small">
              <InputLabel>Ученик (привязка)</InputLabel>
              <Select value={studentId === '' ? '' : studentId} label="Ученик (привязка)" onChange={(e) => setStudentId(e.target.value === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">— не привязана</MenuItem>
                {studentsForCards.map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.full_name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : null}
          <TextField size="small" label="ФИО ученика" value={studentFullName} onChange={(e) => setStudentFullName(e.target.value)} fullWidth required />
          <TextField size="small" label="Дата рождения" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
          <TextField size="small" label="Телефон ученика" value={studentPhone} onChange={(e) => setStudentPhone(e.target.value)} fullWidth />
          <TextField size="small" label="Телеграм" value={telegram} onChange={(e) => setTelegram(e.target.value)} fullWidth />
          <FormControl fullWidth size="small">
            <InputLabel>Пол</InputLabel>
            <Select value={gender} label="Пол" onChange={(e) => setGender(e.target.value)}>
              <MenuItem value="">—</MenuItem>
              <MenuItem value="m">М</MenuItem>
              <MenuItem value="f">Ж</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel control={<Switch checked={onGrant} onChange={(e) => setOnGrant(e.target.checked)} />} label="На гранте" />
          <FormControl fullWidth size="small">
            <InputLabel>Формат</InputLabel>
            <Select value={formatType} label="Формат" onChange={(e) => setFormatType(e.target.value)}>
              <MenuItem value="">—</MenuItem>
              <MenuItem value="group">Группа</MenuItem>
              <MenuItem value="individual">Индивидуальное</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" label="Город" value={city} onChange={(e) => setCity(e.target.value)} fullWidth />
          <TextField size="small" label="ОУ" value={school} onChange={(e) => setSchool(e.target.value)} fullWidth />
          <TextField size="small" label="Класс" value={grade} onChange={(e) => setGrade(e.target.value)} fullWidth />

          <Typography variant="subtitle2" color="primary">Родитель</Typography>
          <TextField size="small" label="ФИО родителя" value={parentFullName} onChange={(e) => setParentFullName(e.target.value)} fullWidth />
          <TextField size="small" label="Телефон родителя" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} fullWidth />
          <TextField size="small" label="Второй телефон" value={parentPhone2} onChange={(e) => setParentPhone2(e.target.value)} fullWidth />
          <TextField size="small" label="Телеграм родителя" value={parentTelegram} onChange={(e) => setParentTelegram(e.target.value)} fullWidth />
          <TextField size="small" label="Email родителя" type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} fullWidth />
          <TextField size="small" label="Email ученика" type="email" value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)} fullWidth />
          <FormControl fullWidth size="small">
            <InputLabel>Мессенджер</InputLabel>
            <Select value={preferredMessenger} label="Мессенджер" onChange={(e) => setPreferredMessenger(e.target.value)}>
              <MenuItem value="">—</MenuItem>
              <MenuItem value="max">MAX</MenuItem>
              <MenuItem value="telegram">Telegram</MenuItem>
              <MenuItem value="sms">SMS</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" label="Комментарий" value={comment} onChange={(e) => setComment(e.target.value)} fullWidth multiline minRows={2} />
          <TextField size="small" label="Откуда пришел" value={source} onChange={(e) => setSource(e.target.value)} fullWidth />

          {editingId && (
            <FormControl fullWidth size="small">
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
              <FormControl fullWidth size="small">
                <InputLabel>Абонемент</InputLabel>
                <Select value={abonementId} label="Абонемент" onChange={(e) => setAbonementId(e.target.value === '' ? '' : Number(e.target.value))}>
                  <MenuItem value="">—</MenuItem>
                  {abonements.map((a) => (
                    <MenuItem key={a.id} value={a.id}>{a.name} — {a.price} ₽</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Скидка</InputLabel>
                <Select value={discountType} label="Скидка" onChange={(e) => setDiscountType(e.target.value as 'none' | 'amount' | 'percent')}>
                  <MenuItem value="none">Нет</MenuItem>
                  <MenuItem value="percent">%</MenuItem>
                  <MenuItem value="amount">Сумма</MenuItem>
                </Select>
              </FormControl>
              <TextField size="small" label="Значение скидки" type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} fullWidth />
            </>
          )}
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {mode === 'addStudent' ? 'Создать ученика' : editingId ? 'Сохранить' : 'Создать'}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
};

export default AnketaFormDrawer;
