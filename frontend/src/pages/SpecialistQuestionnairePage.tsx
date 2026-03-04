import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

const SpecialistQuestionnairePage: React.FC = () => {
  const [form, setForm] = useState({
    parent_full_name: '',
    parent_phone: '',
    child_full_name: '',
    city: '',
    email: '',
    school_name: '',
    school_class: '',
    comment: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange =
    (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parentName = form.parent_full_name.trim();
    const parentPhone = form.parent_phone.trim();
    const childName = form.child_full_name.trim();
    const city = form.city.trim();

    if (!parentName || !parentPhone || !childName || !city) {
      setError('Пожалуйста, заполните все обязательные поля.');
      return;
    }

    setSubmitting(true);
    try {
      await salesApi.submitSpecialistQuestionnaire({
        parent_full_name: parentName,
        parent_phone: parentPhone,
        child_full_name: childName,
        city,
        email: form.email.trim() || undefined,
        school_name: form.school_name.trim() || undefined,
        school_class: form.school_class.trim() || undefined,
        comment: form.comment.trim() || undefined,
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
            Анкета успешно отправлена. Менеджер свяжется с вами в ближайшее время, чтобы рассказать
            о программе «Специалист» и подобрать формат обучения.
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm">
      <Box sx={{ py: 6 }}>
        <Typography variant="h4" gutterBottom>
          Анкета ученика — направление «Специалист»
        </Typography>
        <Typography variant="body1" sx={{ mb: 3 }}>
          Заполните, пожалуйста, анкету. Это поможет нам связаться с вами и предложить подходящий
          формат обучения по направлению «Специалист».
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2}>
            <TextField
              label="ФИО родителя"
              value={form.parent_full_name}
              onChange={handleChange('parent_full_name')}
              required
              fullWidth
            />
            <TextField
              label="Телефон родителя"
              value={form.parent_phone}
              onChange={handleChange('parent_phone')}
              required
              fullWidth
            />
            <TextField
              label="ФИО ученика"
              value={form.child_full_name}
              onChange={handleChange('child_full_name')}
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
              label="Школа"
              value={form.school_name}
              onChange={handleChange('school_name')}
              fullWidth
            />
            <TextField
              label="Класс"
              value={form.school_class}
              onChange={handleChange('school_class')}
              fullWidth
            />
            <TextField
              label="Email (для отправки информации)"
              type="email"
              value={form.email}
              onChange={handleChange('email')}
              fullWidth
            />
            <TextField
              label="Комментарий (цели обучения, уровень, удобное время и т.п.)"
              value={form.comment}
              onChange={handleChange('comment')}
              fullWidth
              multiline
              minRows={3}
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

export default SpecialistQuestionnairePage;

