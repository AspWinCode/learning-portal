import React, { useState } from 'react';
import { Alert, Box, Button, FormHelperText, Stack, TextField, Typography } from '@mui/material';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

export type TildaLeadKind = 'start' | 'base' | 'pro';

interface TildaLeadPageProps {
  kind?: TildaLeadKind;
}

const TildaLeadPage: React.FC<TildaLeadPageProps> = ({ kind = 'start' }) => {
  const [parentFullName, setParentFullName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [childFullName, setChildFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ parent_full_name?: string; parent_phone?: string; child_full_name?: string }>({});

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParentPhone(e.target.value);
    setFieldErrors((prev) => ({ ...prev, parent_phone: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    const errors: typeof fieldErrors = {};

    const parentName = parentFullName.trim();
    const childName = childFullName.trim();
    const phone = parentPhone.trim();

    if (!parentName) errors.parent_full_name = 'Введите ФИО родителя';
    if (!childName) errors.child_full_name = 'Введите ФИО ученика';
    if (!phone) errors.parent_phone = 'Введите номер телефона';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      await salesApi.submitTildaLead({
        parent_full_name: parentName,
        parent_phone: phone,
        child_full_name: childName,
        kind,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const msg = extractApiError(err, 'Не удалось отправить заявку.');
      setFieldErrors((prev) => ({ ...prev, parent_phone: msg }));
      setGeneralError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 2,
          py: 4,
          background: 'radial-gradient(circle at 0% 0%, #3b1dff 0, #1b1036 45%, #050014 100%)',
          color: '#fff',
        }}
      >
        <Box
          sx={{
            maxWidth: 960,
            width: '100%',
            borderRadius: 4,
            p: { xs: 3, md: 5 },
            bgcolor: 'rgba(7, 4, 40, 0.9)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.65)',
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            gap: { xs: 4, md: 6 },
          }}
        >
          <Box sx={{ flex: 1, pr: { md: 4 } }}>
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: 28, md: 40 },
                fontWeight: 800,
                lineHeight: 1.05,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                mb: 3,
              }}
            >
              Спасибо!
            </Typography>
            <Typography sx={{ fontSize: { xs: 14, md: 16 }, color: 'rgba(255,255,255,0.85)' }}>
              Заявка отправлена. Мы свяжемся с вами и поможем подобрать удобный слот и формат участия.
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  const title =
    kind === 'base'
      ? 'Просим заполнить информацию по направлению «Специалист»'
      : kind === 'pro'
        ? 'Просим заполнить информацию по направлению «Эксперт»'
        : 'Просим заполнить информацию по направлению «Первый шаг»';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        py: 4,
        background: 'radial-gradient(circle at 0% 0%, #3b1dff 0, #1b1036 45%, #050014 100%)',
        color: '#fff',
      }}
    >
      <Box
        sx={{
          maxWidth: 1120,
          width: '100%',
          borderRadius: 4,
          p: { xs: 3, md: 5 },
          bgcolor: 'rgba(7, 4, 40, 0.96)',
          boxShadow: '0 30px 90px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: { xs: 4, md: 6 },
        }}
      >
        <Box sx={{ flex: 1.1, pr: { md: 4 } }}>
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: 26, md: 40 },
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: 0.8,
              mb: 3,
            }}
            >
              {title}
            </Typography>
          <Typography
            sx={{
              fontSize: { xs: 13, md: 15 },
              color: 'rgba(255,255,255,0.85)',
              maxWidth: 420,
              mb: 2,
            }}
          >
              Далее мы свяжемся с Вами в течение дня и ответим на вопросы.
          </Typography>
        </Box>

        <Box
          component="form"
          onSubmit={handleSubmit}
          noValidate
          sx={{
            flex: 1,
            bgcolor: 'rgba(36, 14, 92, 0.95)',
            borderRadius: 3,
            p: { xs: 3, md: 4 },
            display: 'flex',
            flexDirection: 'column',
            gap: 2.2,
          }}
        >
          {generalError && (
            <Alert severity="error" sx={{ mb: 1 }} onClose={() => setGeneralError(null)}>
              {generalError}
            </Alert>
          )}

          <TextField
            label="Имя родителя"
            variant="filled"
            value={parentFullName}
            onChange={(e) => {
              setParentFullName(e.target.value);
              setFieldErrors((prev) => ({ ...prev, parent_full_name: undefined }));
            }}
            fullWidth
            required
            error={!!fieldErrors.parent_full_name}
            helperText={fieldErrors.parent_full_name}
            InputProps={{ disableUnderline: true }}
            sx={{
              '& .MuiFilledInput-root': {
                borderRadius: 2,
                backgroundColor: 'rgba(10, 5, 40, 0.9)',
                color: '#fff',
              },
            }}
          />

          <TextField
            label="E-mail"
            variant="filled"
            fullWidth
            InputProps={{ disableUnderline: true }}
            sx={{
              '& .MuiFilledInput-root': {
                borderRadius: 2,
                backgroundColor: 'rgba(10, 5, 40, 0.9)',
                color: '#fff',
              },
            }}
          />

          <Box>
            <TextField
              label="Контактный телефон родителя"
              value={parentPhone}
              onChange={handlePhoneChange}
              fullWidth
              required
              error={!!fieldErrors.parent_phone}
              placeholder="+7 900 123-45-67 или +375 29 123-45-67"
              variant="filled"
              InputProps={{ disableUnderline: true }}
              inputProps={{
                inputMode: 'tel',
                maxLength: 20,
              }}
              sx={{
                '& .MuiFilledInput-root': {
                  borderRadius: 2,
                  backgroundColor: 'rgba(10, 5, 40, 0.9)',
                  color: '#fff',
                },
              }}
            />
            {fieldErrors.parent_phone && <FormHelperText error>{fieldErrors.parent_phone}</FormHelperText>}
          </Box>

          <TextField
            label="Имя ребенка"
            variant="filled"
            value={childFullName}
            onChange={(e) => {
              setChildFullName(e.target.value);
              setFieldErrors((prev) => ({ ...prev, child_full_name: undefined }));
            }}
            fullWidth
            required
            error={!!fieldErrors.child_full_name}
            helperText={fieldErrors.child_full_name}
            InputProps={{ disableUnderline: true }}
            sx={{
              '& .MuiFilledInput-root': {
                borderRadius: 2,
                backgroundColor: 'rgba(10, 5, 40, 0.9)',
                color: '#fff',
              },
            }}
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={submitting}
            sx={{
              mt: 1,
              borderRadius: 999,
              py: 1.4,
              fontWeight: 700,
              fontSize: 15,
              textTransform: 'none',
              bgcolor: '#050014',
              '&:hover': { bgcolor: '#0b001f' },
            }}
            fullWidth
          >
            {submitting ? 'Отправка…' : 'Отправить'}
          </Button>

          <Typography
            variant="caption"
            sx={{
              mt: 1,
              color: 'rgba(255,255,255,0.6)',
              lineHeight: 1.4,
            }}
          >
            Нажимая на кнопку отправить, я соглашаюсь на обработку персональных данных.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default TildaLeadPage;
