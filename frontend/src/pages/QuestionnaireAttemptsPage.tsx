import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import Layout from '../components/Layout';
import { salesApi } from '../services/api';
import { QuestionnaireAttempt } from '../types';

const ANKETA_TYPE_LABELS: Record<string, string> = {
  specialist: 'Специалист',
  'ege-trial': 'Пробное ЕГЭ',
  individual: 'Индивидуальные занятия',
  novichok: 'Новичок',
  programmist: 'Программист',
};

const REASON_LABELS: Record<string, string> = {
  validation_failed: 'Не заполнены обязательные поля',
  invalid_phone: 'Некорректный телефон',
  submit_error: 'Ошибка при отправке',
};

const FIELD_LABELS: Record<string, string> = {
  child_full_name: 'ФИО ученика',
  full_name: 'ФИО',
  birth_date: 'Дата рождения',
  child_phone: 'Телефон ученика',
  phone: 'Телефон',
  student_email: 'Email ученика',
  gender: 'Пол',
  city: 'Город',
  school_name: 'Образовательное учреждение',
  school_class: 'Класс',
  parent_full_name: 'ФИО родителя',
  parent_phone: 'Телефон родителя',
  parent_phone_2: 'Второй телефон',
  parent_email: 'Email родителя',
  has_max: 'Есть MAX?',
  comment: 'Комментарий',
  source: 'Откуда узнали',
};

const QuestionnaireAttemptsPage: React.FC = () => {
  const [attempts, setAttempts] = useState<QuestionnaireAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await salesApi.listQuestionnaireAttempts();
      setAttempts(data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось загрузить список');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleDismiss = async (id: number) => {
    setBusyId(id);
    try {
      await salesApi.dismissQuestionnaireAttempt(id);
      setAttempts((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось скрыть запись');
    } finally {
      setBusyId(null);
    }
  };

  const renderContact = (attempt: QuestionnaireAttempt) => {
    const p = attempt.payload || {};
    const name = (p.parent_full_name || p.child_full_name || p.full_name || '—') as string;
    const phone = (p.parent_phone || p.child_phone || p.phone || '') as string;
    return (
      <Box>
        <Typography variant="body2">{name}</Typography>
        {phone && (
          <Typography variant="caption" color="text.secondary">
            {phone}
          </Typography>
        )}
      </Box>
    );
  };

  return (
    <Layout>
      <Box sx={{ p: 2 }}>
        <Typography variant="h5" sx={{ mb: 1 }}>
          Незавершённые анкеты
        </Typography>
        <Alert severity="info" sx={{ mb: 2 }}>
          Попытки заполнить публичную анкету, которые не дошли до создания лида (не прошли
          валидацию на форме или запрос завершился ошибкой). Свяжитесь с человеком вручную, а
          затем скройте запись.
        </Alert>

        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : attempts.length === 0 ? (
          <Paper sx={{ p: 3 }}>
            <Typography color="text.secondary">Незавершённых попыток нет.</Typography>
          </Paper>
        ) : (
          <Paper>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Дата</TableCell>
                  <TableCell>Анкета</TableCell>
                  <TableCell>Причина</TableCell>
                  <TableCell>Контакт</TableCell>
                  <TableCell>Введённые данные</TableCell>
                  <TableCell align="right" width={120} />
                </TableRow>
              </TableHead>
              <TableBody>
                {attempts.map((attempt) => (
                  <TableRow key={attempt.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {new Date(attempt.created_at).toLocaleString('ru-RU')}
                    </TableCell>
                    <TableCell>
                      {ANKETA_TYPE_LABELS[attempt.anketa_type] || attempt.anketa_type}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={REASON_LABELS[attempt.reason || ''] || attempt.reason || '—'}
                        color={attempt.reason === 'submit_error' ? 'error' : 'warning'}
                      />
                    </TableCell>
                    <TableCell>{renderContact(attempt)}</TableCell>
                    <TableCell>
                      <Stack spacing={0.25} sx={{ maxWidth: 420 }}>
                        {Object.entries(attempt.payload || {})
                          .filter(([, value]) => value !== '' && value !== null && value !== undefined)
                          .map(([key, value]) => (
                            <Typography key={key} variant="caption" color="text.secondary">
                              <strong>{FIELD_LABELS[key] || key}:</strong> {String(value)}
                            </Typography>
                          ))}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        disabled={busyId === attempt.id}
                        onClick={() => handleDismiss(attempt.id)}
                      >
                        Скрыть
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>
    </Layout>
  );
};

export default QuestionnaireAttemptsPage;
