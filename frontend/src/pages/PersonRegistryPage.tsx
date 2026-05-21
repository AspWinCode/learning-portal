import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';

import Layout from '../components/Layout';
import { searchApi } from '../services/api';
import type { PersonSearchItem, PersonSearchResponse, PhoneSearchResponse } from '../types';
import { extractApiError } from '../utils/extractApiError';

const entityTypeLabel = (entityType: string): string => {
  if (entityType === 'user') return 'Пользователь';
  if (entityType === 'lead') return 'Лид';
  if (entityType === 'student_card') return 'Анкета';
  return entityType;
};

const PersonRegistryPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [personQuery, setPersonQuery] = useState('');
  const [phoneQuery, setPhoneQuery] = useState('');
  const [personsLoading, setPersonsLoading] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [attachLoadingKey, setAttachLoadingKey] = useState<string | null>(null);
  const [personsResult, setPersonsResult] = useState<PersonSearchResponse | null>(null);
  const [phoneResult, setPhoneResult] = useState<PhoneSearchResponse | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sourcePersonId, setSourcePersonId] = useState<number | null>(null);
  const [targetPersonId, setTargetPersonId] = useState<number | null>(null);
  const [attachPersonId, setAttachPersonId] = useState('');

  const totalPhoneMatches = useMemo(() => {
    if (!phoneResult) return 0;
    return phoneResult.users.length + phoneResult.leads.length + phoneResult.student_cards.length;
  }, [phoneResult]);

  const handlePersonsSearch = async () => {
    const query = personQuery.trim();
    if (!query) {
      setError('Введите имя, email или телефон для поиска.');
      return;
    }
    setPersonsLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await searchApi.searchPersons(query);
      setPersonsResult(response);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось выполнить поиск по реестру Person.'));
    } finally {
      setPersonsLoading(false);
    }
  };

  const handlePhoneSearch = async () => {
    const query = phoneQuery.trim();
    if (!query) {
      setError('Введите телефон для проверки дублей.');
      return;
    }
    setPhoneLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await searchApi.searchByPhone(query);
      setPhoneResult(response);
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось выполнить поиск по телефону.'));
    } finally {
      setPhoneLoading(false);
    }
  };

  const refreshCurrentResults = async () => {
    if (personQuery.trim()) {
      const personResponse = await searchApi.searchPersons(personQuery.trim());
      setPersonsResult(personResponse);
    }
    if (phoneQuery.trim()) {
      const phoneResponse = await searchApi.searchByPhone(phoneQuery.trim());
      setPhoneResult(phoneResponse);
    }
  };

  const handleMergePersons = async () => {
    if (!sourcePersonId || !targetPersonId || sourcePersonId === targetPersonId) {
      setError('Выберите разные source и target Person для объединения.');
      return;
    }
    setMergeLoading(true);
    setError('');
    setSuccess('');
    try {
      await searchApi.mergePersons({
        source_person_id: sourcePersonId,
        target_person_id: targetPersonId,
      });
      setSuccess(`Person #${sourcePersonId} объединён в Person #${targetPersonId}.`);
      setSourcePersonId(null);
      await refreshCurrentResults();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось объединить Person.'));
    } finally {
      setMergeLoading(false);
    }
  };

  const handleAttachRecord = async (
    entityType: 'user' | 'lead' | 'student_card',
    entityId: number
  ) => {
    const personId = Number(attachPersonId);
    if (!personId) {
      setError('Укажите person_id, к которому нужно привязать запись.');
      return;
    }
    const loadingKey = `${entityType}-${entityId}`;
    setAttachLoadingKey(loadingKey);
    setError('');
    setSuccess('');
    try {
      await searchApi.attachRecordToPerson({
        person_id: personId,
        entity_type: entityType,
        entity_id: entityId,
      });
      setSuccess(`Запись ${entityType} #${entityId} привязана к Person #${personId}.`);
      await refreshCurrentResults();
    } catch (err: unknown) {
      setError(extractApiError(err, 'Не удалось привязать запись к Person.'));
    } finally {
      setAttachLoadingKey(null);
    }
  };

  const renderPersonCard = (item: PersonSearchItem) => (
    <Paper key={item.id} variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography variant="h6">{item.full_name || `Person #${item.id}`}</Typography>
          <Chip size="small" label={`Person #${item.id}`} />
          {item.role_hint ? <Chip size="small" color="primary" variant="outlined" label={item.role_hint} /> : null}
          <Button size="small" onClick={() => setSourcePersonId(item.id)}>
            В source
          </Button>
          <Button size="small" onClick={() => setTargetPersonId(item.id)}>
            В target
          </Button>
        </Stack>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Email: {item.email || '—'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Телефон: {item.phone_normalized || '—'}
          </Typography>
        </Stack>
        <Divider />
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Связанные записи
          </Typography>
          {item.linked_records.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Связанных записей пока нет.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {item.linked_records.map((record) => (
                <Stack
                  key={`${record.entity_type}-${record.entity_id}`}
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={1}
                  alignItems={{ xs: 'flex-start', md: 'center' }}
                >
                  <Chip
                    variant="outlined"
                    label={`${entityTypeLabel(record.entity_type)} #${record.entity_id}: ${record.label}`}
                  />
                  {record.entity_type === 'lead' ? (
                    <Button size="small" onClick={() => navigate(`/sales/leads/${record.entity_id}`)}>
                      Открыть лид
                    </Button>
                  ) : null}
                  {record.entity_type === 'student_card' ? (
                    <Button size="small" onClick={() => navigate(`/students?tab=ankety&cardId=${record.entity_id}`)}>
                      Открыть анкету
                    </Button>
                  ) : null}
                  {record.entity_type === 'user' ? (
                    <Button size="small" onClick={() => navigate(`/roles?userId=${record.entity_id}`)}>
                      Открыть пользователя
                    </Button>
                  ) : null}
                </Stack>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </Paper>
  );

  return (
    <Layout>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4" gutterBottom>
              Реестр Person
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Поиск по объединённым персонам, ручное объединение дублей и привязка записей из users, leads и student cards.
            </Typography>
          </Box>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {success ? <Alert severity="success">{success}</Alert> : null}

          <Paper variant="outlined" sx={{ borderRadius: 3 }}>
            <Tabs value={tab} onChange={(_, nextValue) => setTab(nextValue)} variant="fullWidth">
              <Tab label="Реестр Person" />
              <Tab label="Поиск по телефону" />
            </Tabs>
            <Divider />

            <Box sx={{ p: 3 }}>
              {tab === 0 ? (
                <Stack spacing={3}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField
                      fullWidth
                      label="Имя, email или телефон"
                      value={personQuery}
                      onChange={(event) => setPersonQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void handlePersonsSearch();
                        }
                      }}
                    />
                    <Button variant="contained" onClick={() => void handlePersonsSearch()} disabled={personsLoading} sx={{ minWidth: 180 }}>
                      {personsLoading ? <CircularProgress size={22} color="inherit" /> : 'Найти'}
                    </Button>
                  </Stack>

                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                    <Stack spacing={2}>
                      <Typography variant="subtitle1">Ручное объединение дублей</Typography>
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                        <TextField
                          label="Source Person ID"
                          value={sourcePersonId ?? ''}
                          onChange={(event) => setSourcePersonId(event.target.value ? Number(event.target.value) : null)}
                          fullWidth
                        />
                        <TextField
                          label="Target Person ID"
                          value={targetPersonId ?? ''}
                          onChange={(event) => setTargetPersonId(event.target.value ? Number(event.target.value) : null)}
                          fullWidth
                        />
                        <Button variant="contained" color="warning" onClick={() => void handleMergePersons()} disabled={mergeLoading}>
                          {mergeLoading ? <CircularProgress size={22} color="inherit" /> : 'Объединить'}
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>

                  {personsResult ? (
                    <Stack spacing={2}>
                      <Typography variant="body2" color="text.secondary">
                        Найдено: {personsResult.items.length}
                      </Typography>
                      {personsResult.items.length === 0 ? (
                        <Alert severity="info">По этому запросу ничего не найдено.</Alert>
                      ) : (
                        personsResult.items.map(renderPersonCard)
                      )}
                    </Stack>
                  ) : (
                    <Alert severity="info">Введите запрос, чтобы проверить реестр Person.</Alert>
                  )}
                </Stack>
              ) : (
                <Stack spacing={3}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField
                      fullWidth
                      label="Телефон"
                      value={phoneQuery}
                      onChange={(event) => setPhoneQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void handlePhoneSearch();
                        }
                      }}
                    />
                    <Button variant="contained" onClick={() => void handlePhoneSearch()} disabled={phoneLoading} sx={{ minWidth: 180 }}>
                      {phoneLoading ? <CircularProgress size={22} color="inherit" /> : 'Проверить'}
                    </Button>
                  </Stack>

                  {phoneResult ? (
                    <Stack spacing={2.5}>
                      <Typography variant="body2" color="text.secondary">
                        Нормализованный телефон: {phoneResult.normalized_phone || '—'} · Совпадений: {totalPhoneMatches}
                      </Typography>

                      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                          <TextField
                            fullWidth
                            label="К какому person_id привязать запись"
                            value={attachPersonId}
                            onChange={(event) => setAttachPersonId(event.target.value)}
                          />
                          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
                            Используйте найденный Person ID из вкладки реестра.
                          </Typography>
                        </Stack>
                      </Paper>

                      <Paper variant="outlined" sx={{ borderRadius: 3 }}>
                        <Box sx={{ p: 2 }}>
                          <Typography variant="subtitle1" gutterBottom>
                            Пользователи
                          </Typography>
                          {phoneResult.users.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              Совпадений нет.
                            </Typography>
                          ) : (
                            <List dense disablePadding>
                              {phoneResult.users.map((item) => (
                                <ListItem key={`user-${item.id}`} disableGutters secondaryAction={
                                  <Stack direction="row" spacing={1}>
                                    <Button
                                      size="small"
                                      onClick={() => navigate(`/roles?userId=${item.id}`)}
                                    >
                                      Открыть
                                    </Button>
                                    <Button
                                      size="small"
                                      onClick={() => void handleAttachRecord('user', item.id)}
                                      disabled={attachLoadingKey === `user-${item.id}`}
                                    >
                                      Привязать
                                    </Button>
                                  </Stack>
                                }>
                                  <ListItemText
                                    primary={`${item.full_name} · ${item.email}`}
                                    secondary={`#${item.id} · роль: ${item.role}${item.person_id ? ` · person_id: ${item.person_id}` : ''}`}
                                  />
                                </ListItem>
                              ))}
                            </List>
                          )}
                        </Box>
                      </Paper>

                      <Paper variant="outlined" sx={{ borderRadius: 3 }}>
                        <Box sx={{ p: 2 }}>
                          <Typography variant="subtitle1" gutterBottom>
                            Лиды
                          </Typography>
                          {phoneResult.leads.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              Совпадений нет.
                            </Typography>
                          ) : (
                            <List dense disablePadding>
                              {phoneResult.leads.map((item) => (
                                <ListItem key={`lead-${item.id}`} disableGutters secondaryAction={
                                  <Stack direction="row" spacing={1}>
                                    <Button size="small" onClick={() => navigate(`/sales/leads/${item.id}`)}>
                                      Открыть
                                    </Button>
                                    <Button
                                      size="small"
                                      onClick={() => void handleAttachRecord('lead', item.id)}
                                      disabled={attachLoadingKey === `lead-${item.id}`}
                                    >
                                      Привязать
                                    </Button>
                                  </Stack>
                                }>
                                  <ListItemText
                                    primary={`${item.contact_name} · ${item.phone}`}
                                    secondary={[
                                      `#${item.id}`,
                                      item.parent_full_name ? `родитель: ${item.parent_full_name}` : null,
                                      item.child_full_name ? `ребёнок: ${item.child_full_name}` : null,
                                      item.student_card_id ? `анкета: ${item.student_card_id}` : null,
                                      item.converted_to_student_id ? `ученик: ${item.converted_to_student_id}` : null,
                                      item.person_id ? `person_id: ${item.person_id}` : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  />
                                </ListItem>
                              ))}
                            </List>
                          )}
                        </Box>
                      </Paper>

                      <Paper variant="outlined" sx={{ borderRadius: 3 }}>
                        <Box sx={{ p: 2 }}>
                          <Typography variant="subtitle1" gutterBottom>
                            Анкеты
                          </Typography>
                          {phoneResult.student_cards.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              Совпадений нет.
                            </Typography>
                          ) : (
                            <List dense disablePadding>
                              {phoneResult.student_cards.map((item) => (
                                <ListItem key={`card-${item.id}`} disableGutters secondaryAction={
                                  <Stack direction="row" spacing={1}>
                                    <Button size="small" onClick={() => navigate(`/students?tab=ankety&cardId=${item.id}`)}>
                                      Открыть
                                    </Button>
                                    <Button
                                      size="small"
                                      onClick={() => void handleAttachRecord('student_card', item.id)}
                                      disabled={attachLoadingKey === `student_card-${item.id}`}
                                    >
                                      Привязать
                                    </Button>
                                  </Stack>
                                }>
                                  <ListItemText
                                    primary={`${item.student_full_name} · анкета #${item.id}`}
                                    secondary={[
                                      item.parent_full_name ? `родитель: ${item.parent_full_name}` : null,
                                      item.parent_phone ? `тел. родителя: ${item.parent_phone}` : null,
                                      item.student_phone ? `тел. ученика: ${item.student_phone}` : null,
                                      item.student_id ? `ученик: ${item.student_id}` : null,
                                      item.person_id ? `person_id: ${item.person_id}` : null,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  />
                                </ListItem>
                              ))}
                            </List>
                          )}
                        </Box>
                      </Paper>
                    </Stack>
                  ) : (
                    <Alert severity="info">Введите телефон, чтобы проверить дубли между users, leads и student cards.</Alert>
                  )}
                </Stack>
              )}
            </Box>
          </Paper>
        </Stack>
      </Box>
    </Layout>
  );
};

export default PersonRegistryPage;
