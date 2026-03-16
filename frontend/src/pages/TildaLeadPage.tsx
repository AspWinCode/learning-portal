import React, { useState } from 'react';
import { Alert, Box, Button, FormHelperText, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

const COUNTRY_OPTIONS = [
  { value: '7', label: 'Россия', prefix: '+7', placeholder: '+7 (900) 123-45-67' },
  { value: '375', label: 'Беларусь', prefix: '+375', placeholder: '+375 (29) 123-45-67' },
  { value: 'other', label: 'Другая страна', prefix: '+', placeholder: '+код и номер (минимум 10 цифр)' },
];

function formatPhoneByCountry(value: string, country: string): string {
  const digits = value.replace(/\D/g, '');
  if (country === '7') {
    if (digits.length <= 1) return digits ? `+7 (${digits}` : '+7';
    if (digits.length <= 4) return `+7 (${digits.slice(1)}`;
    if (digits.length <= 7) return `+7 (${digits.slice(1, 4)}) ${digits.slice(4)}`;
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  if (country === '375') {
    if (digits.length <= 3) return digits ? `+${digits}` : '+375';
    if (digits.length <= 5) return `+375 (${digits.slice(3)}`;
    if (digits.length <= 8) return `+375 (${digits.slice(3, 5)}) ${digits.slice(5)}`;
    return `+375 (${digits.slice(3, 5)}) ${digits.slice(5, 8)}-${digits.slice(8, 10)}-${digits.slice(10, 12)}`;
  }
  if (digits.length === 0) return '';
  return `+${digits}`;
}

function getRawDigits(displayValue: string): string {
  return displayValue.replace(/\D/g, '');
}

const TildaLeadPage: React.FC = () => {
  const [parentFullName, setParentFullName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [childFullName, setChildFullName] = useState('');
  const [country, setCountry] = useState('7');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ parent_full_name?: string; parent_phone?: string; child_full_name?: string }>({});

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (country === '7') {
      const limited = raw.startsWith('8') ? '7' + raw.slice(1, 11) : raw.startsWith('7') ? raw.slice(0, 11) : raw.slice(0, 11);
      setParentPhone(formatPhoneByCountry(limited, '7'));
    } else if (country === '375') {
      const limited = raw.startsWith('375') ? raw.slice(0, 12) : raw.startsWith('80') ? '375' + raw.slice(2, 11) : raw.slice(0, 12);
      setParentPhone(formatPhoneByCountry(limited, '375'));
    } else {
      setParentPhone(raw ? '+' + raw.slice(0, 15) : '');
    }
  };

  const handleCountryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCountry = e.target.value;
    setCountry(newCountry);
    setParentPhone('');
    setFieldErrors((prev) => ({ ...prev, parent_phone: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    const errors: typeof fieldErrors = {};

    const parentName = parentFullName.trim();
    const childName = childFullName.trim();
    const phoneRaw = getRawDigits(parentPhone);

    if (!parentName) errors.parent_full_name = 'Введите ФИО родителя';
    if (!childName) errors.child_full_name = 'Введите ФИО ученика';
    if (!parentPhone.trim()) errors.parent_phone = 'Введите номер телефона';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      await salesApi.submitTildaLead({
        parent_full_name: parentName,
        parent_phone: parentPhone.trim().startsWith('+') ? parentPhone.trim() : (phoneRaw ? `+${phoneRaw}` : ''),
        child_full_name: childName,
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

  const countryConfig = COUNTRY_OPTIONS.find((c) => c.value === country);

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
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              mb: 3,
            }}
          >
            Зарегистрироваться
            <br /> на ближайший
            <br /> бесплатный GameJam!
          </Typography>
          <Typography
            sx={{
              fontSize: { xs: 13, md: 15 },
              color: 'rgba(255,255,255,0.85)',
              maxWidth: 420,
              mb: 2,
            }}
          >
            Не упустите шанс дать ребёнку фору в мире технологий. Это не просто игра — это первый бесплатный шаг в IT-карьере!
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
              select
              label="Страна"
              value={country}
              onChange={handleCountryChange}
              variant="filled"
              fullWidth
              size="small"
              sx={{
                mb: 1,
                '& .MuiFilledInput-root': {
                  borderRadius: 2,
                  backgroundColor: 'rgba(10, 5, 40, 0.9)',
                  color: '#fff',
                },
              }}
              InputProps={{ disableUnderline: true }}
            >
              {COUNTRY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Контактный телефон родителя"
              value={parentPhone}
              onChange={handlePhoneChange}
              fullWidth
              required
              error={!!fieldErrors.parent_phone}
              placeholder={countryConfig?.placeholder}
              variant="filled"
              InputProps={{ disableUnderline: true }}
              inputProps={{
                inputMode: 'tel',
                maxLength: country === 'other' ? 20 : 18,
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

          <TextField
            label="Класс"
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
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)' }}>
              Выбор слота
            </Typography>
            <TextField
              select
              variant="filled"
              fullWidth
              defaultValue="10:00"
              InputProps={{ disableUnderline: true }}
              sx={{
                mt: 0.5,
                '& .MuiFilledInput-root': {
                  borderRadius: 2,
                  backgroundColor: 'rgba(10, 5, 40, 0.9)',
                  color: '#fff',
                },
              }}
            >
              <MenuItem value="10:00">10:00</MenuItem>
              <MenuItem value="12:00">12:00</MenuItem>
              <MenuItem value="14:00">14:00</MenuItem>
            </TextField>
          </Box>

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
            {submitting ? 'Отправка…' : 'Получить'}
          </Button>

          <Typography
            variant="caption"
            sx={{
              mt: 1,
              color: 'rgba(255,255,255,0.6)',
              lineHeight: 1.4,
            }}
          >
            Нажимая на кнопку, я соглашаюсь на обработку персональных данных.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default TildaLeadPage;
