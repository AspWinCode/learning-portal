import React, { useState } from 'react';
import { Alert, Box, Button, Container, Stack, TextField, Typography } from '@mui/material';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { applyPhoneMask, isValidPhone, phoneToApiValue } from '../utils/phoneMask';

const EgeTrialQuestionnairePage: React.FC = () => {
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    school_name: '',
    city: '',
    source: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange =
    (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, phone: applyPhoneMask(e.target.value) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const fullName = form.full_name.trim();
    const city = form.city.trim();
    const schoolName = form.school_name.trim();
    const source = form.source.trim();

    if (!fullName || !city || !form.phone || !schoolName || !source) {
      setError('Пожалуйста, заполните все обязательные поля.');
      return;
    }

    if (!isValidPhone(form.phone)) {
      setError('Проверьте номер телефона — введите его полностью.');
      return;
    }

    setSubmitting(true);
    try {
      await salesApi.submitEgeTrialQuestionnaire({
        full_name: fullName,
        phone: phoneToApiValue(form.phone),
        city,
        school_name: schoolName,
        source,
      });
      setSuccess(true);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось отправить анкету. Попробуйте ещё раз.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <Container maxWidth="sm">
        <Box sx={{ py: 6 }}>
          <Typography variant="h4" gutterBottom>
            Спасибо!
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Анкета успешно отправлена. Менеджер свяжется с вами в ближайшее время, чтобы
            договориться о пробном занятии по ЕГЭ.
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm">
      <Box sx={{ py: 6 }}>
        <Typography variant="h4" gutterBottom>
          Анкета на пробное занятие по ЕГЭ
        </Typography>
        <Typography variant="body1" sx={{ mb: 3 }}>
          Заполните, пожалуйста, анкету. Это поможет нам связаться с вами и подобрать удобное
          время для пробного занятия.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2}>
            <TextField
              label="ФИО"
              value={form.full_name}
              onChange={handleChange('full_name')}
              required
              fullWidth
            />
            <TextField
              label="Телефон"
              value={form.phone}
              onChange={handlePhoneChange}
              placeholder="+7(___) ___-__-__"
              required
              fullWidth
            />
            <TextField
              label="Образовательное учреждение"
              value={form.school_name}
              onChange={handleChange('school_name')}
              required
              fullWidth
            />
            <TextField
              label="Город"
              value={form.city}
              onChange={handleChange('city')}
              required
              fullWidth
            />
            <TextField
              label="Откуда о нас узнали"
              value={form.source}
              onChange={handleChange('source')}
              required
              fullWidth
            />
          </Stack>

          <Button
            type="submit"
            variant="contained"
            color="primary"
            sx={{ mt: 3 }}
            disabled={submitting}
          >
            Отправить анкету
          </Button>
        </Box>
      </Box>
    </Container>
  );
};

export default EgeTrialQuestionnairePage;
