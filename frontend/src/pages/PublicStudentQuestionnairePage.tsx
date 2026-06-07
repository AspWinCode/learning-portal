import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { publicStudentQuestionnairesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { StudentQuestionnaireField, StudentQuestionnaireTemplate } from '../types';

function initialValue(field: StudentQuestionnaireField) {
  if (field.type === 'checkbox') return false;
  if (field.type === 'multiselect') return [];
  return '';
}

const PublicStudentQuestionnairePage: React.FC = () => {
  const { questionnaireId } = useParams();
  const [template, setTemplate] = useState<StudentQuestionnaireTemplate | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!questionnaireId) return;
    setLoading(true);
    publicStudentQuestionnairesApi
      .get(questionnaireId)
      .then((data) => {
        setTemplate(data);
        setAnswers(Object.fromEntries(data.fields.map((field) => [field.key, initialValue(field)])));
        setError('');
      })
      .catch((err) => setError(extractApiError(err, 'Анкета не найдена или отключена')))
      .finally(() => setLoading(false));
  }, [questionnaireId]);

  const requiredMissing = useMemo(() => {
    if (!template) return [];
    return template.fields.filter((field) => {
      if (!field.required) return false;
      const value = answers[field.key];
      if (Array.isArray(value)) return value.length === 0;
      return value === null || value === undefined || value === '';
    });
  }, [answers, template]);

  const submit = async () => {
    if (!questionnaireId || !template) return;
    if (requiredMissing.length > 0) {
      setError('Заполните обязательные поля.');
      return;
    }
    setSubmitting(true);
    try {
      await publicStudentQuestionnairesApi.submit(questionnaireId, answers);
      setSubmitted(true);
      setError('');
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail && typeof detail === 'object' && Array.isArray(detail.errors)) {
        setError(detail.errors.join(' · '));
      } else {
        setError(extractApiError(err, 'Не удалось отправить анкету'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const setAnswer = (key: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const renderField = (field: StudentQuestionnaireField) => {
    const commonProps = {
      fullWidth: true,
      label: field.label,
      required: field.required,
      value: (answers[field.key] as string | number | undefined) ?? '',
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => setAnswer(field.key, event.target.value),
      helperText: field.help_text || undefined,
    };

    if (field.type === 'textarea') {
      return <TextField {...commonProps} multiline minRows={4} placeholder={field.placeholder || undefined} />;
    }
    if (field.type === 'number') {
      return <TextField {...commonProps} type="number" inputProps={{ min: field.validation.min ?? undefined, max: field.validation.max ?? undefined }} />;
    }
    if (field.type === 'date') {
      return <TextField {...commonProps} type="date" InputLabelProps={{ shrink: true }} />;
    }
    if (field.type === 'phone') {
      return <TextField {...commonProps} type="tel" placeholder={field.placeholder || '+7'} />;
    }
    if (field.type === 'email') {
      return <TextField {...commonProps} type="email" placeholder={field.placeholder || 'name@example.com'} />;
    }
    if (field.type === 'select') {
      return (
        <FormControl fullWidth required={field.required}>
          <InputLabel id={`public-questionnaire-${field.id}`}>{field.label}</InputLabel>
          <Select
            labelId={`public-questionnaire-${field.id}`}
            label={field.label}
            value={(answers[field.key] as string | undefined) ?? ''}
            onChange={(event) => setAnswer(field.key, event.target.value)}
          >
            {field.options.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      );
    }
    if (field.type === 'multiselect') {
      return (
        <FormControl fullWidth required={field.required}>
          <InputLabel id={`public-questionnaire-${field.id}`}>{field.label}</InputLabel>
          <Select
            multiple
            labelId={`public-questionnaire-${field.id}`}
            label={field.label}
            value={(answers[field.key] as string[] | undefined) ?? []}
            onChange={(event) => setAnswer(field.key, event.target.value)}
            renderValue={(selected) => (selected as string[]).join(', ')}
          >
            {field.options.map((option) => (
              <MenuItem key={option} value={option}>
                <Checkbox checked={((answers[field.key] as string[] | undefined) ?? []).includes(option)} />
                {option}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      );
    }
    if (field.type === 'checkbox') {
      return (
        <FormControlLabel
          control={<Checkbox checked={Boolean(answers[field.key])} onChange={(event) => setAnswer(field.key, event.target.checked)} />}
          label={field.label}
        />
      );
    }
    return <TextField {...commonProps} placeholder={field.placeholder || undefined} />;
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: { xs: 2, md: 5 }, px: 2 }}>
      <Paper sx={{ maxWidth: 840, mx: 'auto', p: { xs: 2, md: 4 } }}>
        {loading ? (
          <Box sx={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        ) : submitted ? (
          <Alert severity="success">Анкета отправлена. Менеджер свяжется с вами после обработки.</Alert>
        ) : template ? (
          <Stack spacing={3}>
            <Box>
              <Typography variant="h4" sx={{ fontSize: { xs: 26, md: 34 } }}>
                {template.name}
              </Typography>
              {template.event_name && (
                <Typography variant="subtitle1" color="text.secondary">
                  {template.event_name}
                </Typography>
              )}
              {template.description && (
                <Typography variant="body1" sx={{ mt: 1 }}>
                  {template.description}
                </Typography>
              )}
            </Box>
            {error && (
              <Alert severity="error" onClose={() => setError('')}>
                {error}
              </Alert>
            )}
            <Stack spacing={2}>
              {template.fields.map((field) => (
                <Box key={field.id}>{renderField(field)}</Box>
              ))}
            </Stack>
            <Button variant="contained" size="large" disabled={submitting} onClick={() => void submit()}>
              {submitting ? 'Отправка...' : 'Отправить анкету'}
            </Button>
          </Stack>
        ) : (
          <Alert severity="error">{error || 'Анкета не найдена.'}</Alert>
        )}
      </Paper>
    </Box>
  );
};

export default PublicStudentQuestionnairePage;
