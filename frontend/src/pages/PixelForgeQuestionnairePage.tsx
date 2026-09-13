import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

const PixelForgeQuestionnairePage: React.FC = () => {
  const [form, setForm] = useState({
    // Обучающийся
    child_full_name: '',
    birth_date: '',
    child_phone: '',
    student_email: '',
    gender: '',
    city: '',
    school_name: '',
    school_class: '',
    // Родитель
    parent_full_name: '',
    parent_phone: '',
    parent_phone_2: '',
    parent_email: '',
    has_max: '',
    comment: '',
    source: '',
  });
  const [cities, setCities] = useState<string[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    salesApi.listPublicCities().then(setCities).catch(() => setCities([]));
    salesApi.listPublicClasses().then(setClasses).catch(() => setClasses([]));
    salesApi.listPublicLeadSources().then(setSources).catch(() => setSources([]));
  }, []);

  const handleChange =
    (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleSelectChange = (field: keyof typeof form) => (e: any) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const childName = form.child_full_name.trim();
    const birthDate = form.birth_date.trim();
    const childPhone = form.child_phone.trim();
    const studentEmail = form.student_email.trim();
    const city = form.city.trim();
    const schoolName = form.school_name.trim();
    const schoolClass = form.school_class.trim();
    const parentName = form.parent_full_name.trim();
    const parentPhone = form.parent_phone.trim();
    const parentEmail = form.parent_email.trim();

    if (
      !childName ||
      !birthDate ||
      !childPhone ||
      !studentEmail ||
      !city ||
      !schoolName ||
      !schoolClass ||
      !parentName ||
      !parentPhone ||
      !parentEmail
    ) {
      setError('Пожалуйста, заполните все обязательные поля.');
      return;
    }

    setSubmitting(true);
    try {
      await salesApi.submitPixelForgeQuestionnaire({
        child_full_name: childName,
        birth_date: birthDate,
        child_phone: childPhone,
        student_email: studentEmail,
        gender: form.gender.trim() || undefined,
        city,
        school_name: schoolName,
        school_class: schoolClass,
        parent_full_name: parentName,
        parent_phone: parentPhone,
        parent_phone_2: form.parent_phone_2.trim() || undefined,
        parent_email: parentEmail,
        has_max: form.has_max === '' ? undefined : form.has_max === 'yes',
        comment: form.comment.trim() || undefined,
        source: form.source.trim() || undefined,
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
            о направлении PixelForge и подобрать формат обучения.
          </Typography>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm">
      <Box sx={{ py: 6 }}>
        <Typography variant="h4" gutterBottom>
          Анкета — направление «PixelForge»
        </Typography>
        <Typography variant="body1" sx={{ mb: 3 }}>
          Заполните, пожалуйста, анкету. Это поможет нам связаться с вами и подобрать подходящий
          формат обучения по направлению PixelForge.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2}>
            <Typography variant="h6">Обучающийся</Typography>
            <TextField
              label="ФИО ученика"
              value={form.child_full_name}
              onChange={handleChange('child_full_name')}
              required
              fullWidth
            />
            <TextField
              label="Дата рождения"
              type="date"
              value={form.birth_date}
              onChange={handleChange('birth_date')}
              required
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Телефон ученика"
              value={form.child_phone}
              onChange={handleChange('child_phone')}
              required
              fullWidth
            />
            <TextField
              label="Email ученика"
              type="email"
              value={form.student_email}
              onChange={handleChange('student_email')}
              required
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel id="gender-label">Пол</InputLabel>
              <Select
                labelId="gender-label"
                label="Пол"
                value={form.gender}
                onChange={handleSelectChange('gender')}
              >
                <MenuItem value="">
                  <em>Не выбрано</em>
                </MenuItem>
                <MenuItem value="Мужской">Мужской</MenuItem>
                <MenuItem value="Женский">Женский</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth required>
              <InputLabel id="city-label">Город</InputLabel>
              <Select
                labelId="city-label"
                label="Город"
                value={form.city}
                onChange={handleSelectChange('city')}
              >
                {cities.map((city) => (
                  <MenuItem key={city} value={city}>
                    {city}
                  </MenuItem>
                ))}
              </Select>
              {cities.length === 0 && (
                <FormHelperText>Список городов не настроен — обратитесь к менеджеру</FormHelperText>
              )}
            </FormControl>
            <TextField
              label="Образовательное учреждение"
              value={form.school_name}
              onChange={handleChange('school_name')}
              required
              fullWidth
            />
            <FormControl fullWidth required>
              <InputLabel id="school-class-label">Класс</InputLabel>
              <Select
                labelId="school-class-label"
                label="Класс"
                value={form.school_class}
                onChange={handleSelectChange('school_class')}
              >
                {classes.map((cls) => (
                  <MenuItem key={cls} value={cls}>
                    {cls}
                  </MenuItem>
                ))}
              </Select>
              {classes.length === 0 && (
                <FormHelperText>Список классов не настроен — обратитесь к менеджеру</FormHelperText>
              )}
            </FormControl>

            <Typography variant="h6" sx={{ mt: 2 }}>
              Родитель
            </Typography>
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
              label="Второй телефон"
              value={form.parent_phone_2}
              onChange={handleChange('parent_phone_2')}
              fullWidth
            />
            <TextField
              label="Email родителя"
              type="email"
              value={form.parent_email}
              onChange={handleChange('parent_email')}
              required
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel id="has-max-label">Есть MAX?</InputLabel>
              <Select
                labelId="has-max-label"
                label="Есть MAX?"
                value={form.has_max}
                onChange={handleSelectChange('has_max')}
              >
                <MenuItem value="">
                  <em>Не выбрано</em>
                </MenuItem>
                <MenuItem value="yes">Да</MenuItem>
                <MenuItem value="no">Нет</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Комментарий (цели обучения, уровень, удобное время и т.п.)"
              value={form.comment}
              onChange={handleChange('comment')}
              fullWidth
              multiline
              minRows={3}
            />
            <FormControl fullWidth>
              <InputLabel id="source-label">Откуда о нас узнали</InputLabel>
              <Select
                labelId="source-label"
                label="Откуда о нас узнали"
                value={form.source}
                onChange={handleSelectChange('source')}
              >
                <MenuItem value="">
                  <em>Не выбрано</em>
                </MenuItem>
                {sources.map((source) => (
                  <MenuItem key={source} value={source}>
                    {source}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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

export default PixelForgeQuestionnairePage;
