import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';

import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { usersApi } from '../services/api';
import type { User } from '../types';
import { extractApiError } from '../utils/extractApiError';
import { hasPermission } from '../utils/permissions';

const roleLabel = (value?: string | null): string => {
  if (!value) return 'n/a';
  if (value === 'owner') return 'Владелец';
  if (value === 'admin') return 'Администратор';
  if (value === 'sales') return 'Продажи';
  if (value === 'trainer') return 'Тренер';
  if (value === 'parent') return 'Родитель';
  if (value === 'guest') return 'Гость';
  return value;
};

const fieldValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return String(value);
};

const UserDetailsPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [targetUser, setTargetUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const parsedId = Number(userId);
    if (!Number.isFinite(parsedId)) {
      setError('Некорректный идентификатор пользователя.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await usersApi.getById(parsedId);
        if (!cancelled) {
          setTargetUser(response);
          setError('');
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setTargetUser(null);
          setError(extractApiError(err, 'Не удалось загрузить профиль пользователя.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const canManageUsers = hasPermission(currentUser, 'users.manage');

  return (
    <Layout>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={3}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
            <Box>
              <Typography variant="h4">Профиль пользователя</Typography>
              <Typography variant="body2" color="text.secondary">
                Связанная карточка пользователя для реестра Person и управления доступом.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => navigate('/admin/settings?tab=persons')}>
                К реестру Person
              </Button>
              <Button variant="outlined" onClick={() => navigate('/roles')}>
                К ролям
              </Button>
            </Stack>
          </Stack>

          {loading ? (
            <Paper sx={{ p: 4 }}>
              <Stack direction="row" spacing={2} alignItems="center">
                <CircularProgress size={24} />
                <Typography>Загрузка карточки пользователя...</Typography>
              </Stack>
            </Paper>
          ) : null}

          {!loading && error ? <Alert severity="error">{error}</Alert> : null}

          {!loading && targetUser ? (
            <Stack spacing={3}>
              <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
                    <Box>
                      <Typography variant="h5">{targetUser.full_name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {targetUser.email}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      <Chip label={`User #${targetUser.id}`} />
                      <Chip
                        label={targetUser.is_active ? 'Активен' : 'Архивирован'}
                        color={targetUser.is_active ? 'success' : 'default'}
                      />
                      <Chip label={`Базовая роль: ${roleLabel(targetUser.role)}`} variant="outlined" />
                      {targetUser.effective_role ? (
                        <Chip
                          label={`Эффективная роль: ${roleLabel(targetUser.effective_role)}`}
                          variant="outlined"
                        />
                      ) : null}
                    </Stack>
                  </Stack>

                  <Divider />

                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={4}>
                    <Stack spacing={1} sx={{ minWidth: 280 }}>
                      <Typography variant="subtitle2">Доступ</Typography>
                      <Typography variant="body2">
                        Кастомная роль: {fieldValue(targetUser.custom_role_name)}
                      </Typography>
                      <Typography variant="body2">Person ID: {fieldValue(targetUser.person_id)}</Typography>
                      <Typography variant="body2">Создан: {fieldValue(targetUser.created_at)}</Typography>
                    </Stack>
                    <Stack spacing={1} sx={{ minWidth: 280 }}>
                      <Typography variant="subtitle2">Контакты</Typography>
                      <Typography variant="body2">Phone: {fieldValue(targetUser.phone)}</Typography>
                      <Typography variant="body2">Доп. телефон: {fieldValue(targetUser.phone_extra)}</Typography>
                      <Typography variant="body2">Telegram: {fieldValue(targetUser.trainer_telegram)}</Typography>
                      <Typography variant="body2">City: {fieldValue(targetUser.city)}</Typography>
                    </Stack>
                  </Stack>

                  {targetUser.role_permissions?.length ? (
                    <>
                      <Divider />
                      <Box>
                        <Typography variant="subtitle2" gutterBottom>
                          Разрешения
                        </Typography>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                          {targetUser.role_permissions.map((permission) => (
                            <Chip key={permission} size="small" label={permission} variant="outlined" />
                          ))}
                        </Stack>
                      </Box>
                    </>
                  ) : null}
                </Stack>
              </Paper>

              {targetUser.effective_role === 'trainer' ? (
                <Paper sx={{ p: 3 }}>
                  <Stack spacing={1.5}>
                    <Typography variant="h6">Профиль тренера</Typography>
                    <Typography variant="body2">
                      Формат занятий: {fieldValue(targetUser.trainer_lesson_formats)}
                    </Typography>
                    <Typography variant="body2">Банки: {fieldValue(targetUser.trainer_banks)}</Typography>
                    <Typography variant="body2">
                      Самозанятый: {fieldValue(targetUser.is_self_employed)}
                    </Typography>
                    <Typography variant="body2">IP: {fieldValue(targetUser.is_ip)}</Typography>
                    <Typography variant="body2">График: {fieldValue(targetUser.work_schedule)}</Typography>
                    <Typography variant="body2">
                      Квалификация: {fieldValue(targetUser.qualification)}
                    </Typography>
                    <Typography variant="body2">
                      Комментарий: {fieldValue(targetUser.trainer_comment)}
                    </Typography>
                  </Stack>
                </Paper>
              ) : null}

              <Paper sx={{ p: 3 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <Button variant="contained" onClick={() => navigate(`/roles?userId=${targetUser.id}`)}>
                    Открыть в ролях
                  </Button>
                  {targetUser.person_id ? (
                    <Button variant="outlined" onClick={() => navigate(`/admin/settings?tab=persons&personId=${targetUser.person_id}`)}>
                      Открыть Person
                    </Button>
                  ) : null}
                  {canManageUsers ? (
                    <Button variant="outlined" onClick={() => navigate('/roles')}>
                      Управлять доступом
                    </Button>
                  ) : null}
                </Stack>
              </Paper>
            </Stack>
          ) : null}
        </Stack>
      </Box>
    </Layout>
  );
};

export default UserDetailsPage;
