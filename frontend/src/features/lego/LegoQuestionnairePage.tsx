import React, { useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, Container, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { LegoQuestionnaire, submitLegoQuestionnaire } from './legoApi';

const LegoQuestionnairePage: React.FC = () => {
  const [form, setForm] = useState<LegoQuestionnaire>({
    full_name: '', birth_date: '', parent_name: '', parent_phone: '', secondary_phone: '',
    school: '', experience: 'none', preferred_schedule: '', comment: '', consent: false,
  });
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const change = (key: keyof LegoQuestionnaire) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const today = new Date();
  const maxDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    setError('');
    const validPhone = (value: string) => /^(?:[78])?\d{10}$/.test(value.replace(/[^0-9]/g, ''));
    if (!form.full_name.trim() || !form.parent_name.trim()) {
      setError('Укажите ФИО ребёнка и родителя.');
      return;
    }
    if (!validPhone(form.parent_phone) || (form.secondary_phone && !validPhone(form.secondary_phone))) {
      setError('Проверьте телефоны: 10 цифр или 11 цифр с кодом 7/8.');
      return;
    }
    if (!form.consent) {
      setError('Необходимо согласие на обработку данных анкеты.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      await submitLegoQuestionnaire({ ...form, full_name: form.full_name.trim(), parent_name: form.parent_name.trim(), secondary_phone: form.secondary_phone?.trim() || undefined });
      setSuccess(true);
    } catch {
      setError('Не удалось отправить анкету. Проверьте данные и попробуйте ещё раз.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ py: { xs: 3, sm: 5 } }}>
        <Typography variant="h4" component="h1" sx={{ fontSize: { xs: 28, sm: 34 }, mb: 1 }}>LEGO — Ленинец</Typography>
        <Typography variant="h6" sx={{ mb: 3 }}>Анкета ребёнка</Typography>
        {success ? <Alert severity="success">Анкета отправлена. Мы свяжемся с вами, чтобы подобрать группу и время занятий.</Alert> : (
          <Box component="form" onSubmit={submit}>
            <Stack spacing={2}>
              {error && <Alert severity="error" role="alert">{error}</Alert>}
              <Box component="fieldset" disabled={busy} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
                <Stack spacing={2}>
                  <Typography variant="subtitle1" fontWeight={600}>Ребёнок</Typography>
                  <TextField label="ФИО ребёнка" required fullWidth value={form.full_name} onChange={change('full_name')} inputProps={{ maxLength: 256 }} />
                  <TextField label="Дата рождения" type="date" required fullWidth value={form.birth_date} onChange={change('birth_date')} InputLabelProps={{ shrink: true }} inputProps={{ min: '1900-01-01', max: maxDate }} />
                  <TextField label="Школа или детский сад" fullWidth value={form.school} onChange={change('school')} inputProps={{ maxLength: 256 }} />
                  <TextField label="Опыт занятий LEGO" select fullWidth value={form.experience} onChange={change('experience')}>
                    <MenuItem value="none">Нет опыта</MenuItem>
                    <MenuItem value="home">Собирает LEGO дома</MenuItem>
                    <MenuItem value="classes">Посещал занятия</MenuItem>
                  </TextField>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ pt: 1 }}>Родитель или законный представитель</Typography>
                  <TextField label="ФИО родителя" required fullWidth autoComplete="name" value={form.parent_name} onChange={change('parent_name')} inputProps={{ maxLength: 256 }} />
                  <TextField label="Телефон родителя" type="tel" required fullWidth autoComplete="tel" value={form.parent_phone} onChange={change('parent_phone')} inputProps={{ maxLength: 32 }} />
                  <TextField label="Дополнительный телефон" type="tel" fullWidth value={form.secondary_phone} onChange={change('secondary_phone')} inputProps={{ maxLength: 32 }} />
                  <Typography variant="subtitle1" fontWeight={600} sx={{ pt: 1 }}>Занятия</Typography>
                  <TextField label="Удобные дни и время" fullWidth value={form.preferred_schedule} onChange={change('preferred_schedule')} inputProps={{ maxLength: 500 }} />
                  <TextField label="Пожелания и комментарий" fullWidth multiline minRows={3} value={form.comment} onChange={change('comment')} inputProps={{ maxLength: 2000 }} />
                  <FormControlLabel sx={{ alignItems: 'flex-start', mx: 0 }} control={<Checkbox required checked={form.consent} onChange={(e) => setForm((prev) => ({ ...prev, consent: e.target.checked }))} />} label="Я являюсь законным представителем ребёнка и согласен на обработку указанных данных для связи со мной и организации занятий LEGO — Ленинец." />
                  <Button type="submit" variant="contained" disabled={busy}>{busy ? 'Отправка...' : 'Отправить анкету'}</Button>
                </Stack>
              </Box>
            </Stack>
          </Box>
        )}
      </Box>
    </Container>
  );
};

export default LegoQuestionnairePage;
