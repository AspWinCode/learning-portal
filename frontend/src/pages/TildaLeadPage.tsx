import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  FormHelperText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
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
      <Container maxWidth="sm">
        <Box sx={{ py: 6 }}>
          <Typography variant="h4" gutterBottom>
            Спасибо!
          </Typography>
          <Typography variant="body1">
            Заявка принята. Мы свяжемся с вами в ближайшее время.
          </Typography>
        </Box>
      </Container>
    );
  }

  const countryConfig = COUNTRY_OPTIONS.find((c) => c.value === country);

  return (
    <Container maxWidth="sm">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>
          Заявка с сайта
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Оставьте контакты — мы перезвоним и ответим на вопросы.
        </Typography>

        {generalError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setGeneralError(null)}>
            {generalError}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Stack spacing={2.5}>
            <TextField
              label="ФИО родителя"
              value={parentFullName}
              onChange={(e) => {
                setParentFullName(e.target.value);
                setFieldErrors((prev) => ({ ...prev, parent_full_name: undefined }));
              }}
              fullWidth
              required
              error={!!fieldErrors.parent_full_name}
              helperText={fieldErrors.parent_full_name}
              placeholder="Иванова Анна Петровна"
            />

            <Box>
              <TextField
                select
                label="Страна"
                value={country}
                onChange={handleCountryChange}
                fullWidth
                size="small"
                sx={{ mb: 1, maxWidth: 200 }}
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
                inputProps={{
                  inputMode: 'tel',
                  maxLength: country === 'other' ? 20 : 18,
                }}
              />
              {fieldErrors.parent_phone && (
                <FormHelperText error>{fieldErrors.parent_phone}</FormHelperText>
              )}
            </Box>

            <TextField
              label="ФИО ученика"
              value={childFullName}
              onChange={(e) => {
                setChildFullName(e.target.value);
                setFieldErrors((prev) => ({ ...prev, child_full_name: undefined }));
              }}
              fullWidth
              required
              error={!!fieldErrors.child_full_name}
              helperText={fieldErrors.child_full_name}
              placeholder="Иванов Пётр"
            />

            <Button type="submit" variant="contained" size="large" disabled={submitting} fullWidth>
              {submitting ? 'Отправка…' : 'Отправить заявку'}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Container>
  );
};

export default TildaLeadPage;
