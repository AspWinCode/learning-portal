import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import Layout from '../components/Layout';
import { CampaignsTab } from './CampaignsTab';
import BroadcastsTab from './BroadcastsTab';
import { b2bApi, searchApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import type { B2BDocument, B2BSchool, B2BSchoolCustomField, PersonSearchItem } from '../types';

const TAB_LIST = 'list';
const TAB_SCHOOLS = 'schools';
const TAB_BROADCASTS = 'broadcasts';

const schoolStatusOptions = [
  { value: 'unknown', label: 'Не знаем друг друга', color: '#9ca3af' },
  { value: 'friends', label: 'Дружим', color: '#16a34a' },
  { value: 'enemies', label: 'Отказ от сотрудничества', color: '#dc2626' },
  { value: 'indirect', label: 'Есть косвенный контакт', color: '#64748b' },
] as const;

const fieldTypeOptions = [
  { value: 'text', label: 'Текст' },
  { value: 'number', label: 'Число' },
  { value: 'date', label: 'Дата' },
  { value: 'checkbox', label: 'Да/нет' },
] as const;

const documentLabels: Record<string, string> = {
  agreement_template: 'Шаблон соглашения',
  signed_agreement: 'Подписанное соглашение',
  agreement: 'Подписанное соглашение',
  logo: 'Логотип школы',
  support_letter: 'Письмо поддержки',
  other: 'Другой файл',
};

const statusMeta = (school: B2BSchool) => {
  return schoolStatusOptions.find((item) => item.value === school.friendship_degree) ?? schoolStatusOptions[0];
};

const hasSignedAgreement = (docs?: B2BDocument[]) =>
  Boolean(docs?.some((doc) => doc.type === 'signed_agreement' || doc.type === 'agreement'));

const latestDoc = (docs: B2BDocument[], type: string) => docs.find((doc) => doc.type === type);

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('ru-RU') : '');

type SchoolForm = {
  name: string;
  city: string;
  director: string;
  email: string;
  address: string;
  phone_school: string;
  friendship_degree: string;
  comment: string;
  custom_fields: B2BSchoolCustomField[];
};

const formFromSchool = (school: B2BSchool): SchoolForm => ({
  name: school.name ?? '',
  city: school.city ?? '',
  director: school.director ?? '',
  email: school.email ?? '',
  address: school.address ?? '',
  phone_school: school.phone_school ?? '',
  friendship_degree: school.friendship_degree ?? 'unknown',
  comment: school.comment ?? '',
  custom_fields: school.custom_fields ?? [],
});

type SchoolCardDialogProps = {
  school: B2BSchool | null;
  open: boolean;
  onClose: () => void;
  onSaved: (school: B2BSchool) => void;
};

const SchoolCardDialog: React.FC<SchoolCardDialogProps> = ({ school, open, onClose, onSaved }) => {
  const [form, setForm] = React.useState<SchoolForm | null>(null);
  const [contacts, setContacts] = React.useState<B2BSchool['contacts']>([]);
  const [documents, setDocuments] = React.useState<B2BDocument[]>([]);
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const [personQuery, setPersonQuery] = React.useState('');
  const [persons, setPersons] = React.useState<PersonSearchItem[]>([]);
  const [newContact, setNewContact] = React.useState({ full_name: '', position: '', phone: '', phone_extra: '' });
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const loadDocuments = React.useCallback(async (schoolId: number) => {
    const docs = await b2bApi.listDocuments(schoolId);
    setDocuments(docs);
    const logo = latestDoc(docs, 'logo');
    if (logo) {
      const blob = await b2bApi.downloadDocument(schoolId, logo.id);
      setLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } else {
      setLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
    return docs;
  }, []);

  const loadSchoolCard = React.useCallback(async () => {
    if (!school) return;
    setLoading(true);
    setError('');
    try {
      const full = await b2bApi.getSchool(school.id);
      setForm(formFromSchool(full));
      setContacts(full.contacts ?? []);
      await loadDocuments(full.id);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить карточку школы'));
    } finally {
      setLoading(false);
    }
  }, [loadDocuments, school]);

  React.useEffect(() => {
    if (open && school) void loadSchoolCard();
  }, [loadSchoolCard, open, school]);

  React.useEffect(() => {
    return () => {
      setLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  const saveSchool = async () => {
    if (!school || !form) return;
    setSaving(true);
    setError('');
    try {
      const updated = await b2bApi.updateSchool(school.id, {
        name: form.name.trim(),
        city: form.city.trim() || undefined,
        director: form.director.trim() || undefined,
        email: form.email.trim() || null,
        address: form.address.trim() || undefined,
        phone_school: form.phone_school.trim() || null,
        friendship_degree: form.friendship_degree,
        comment: form.comment,
        custom_fields: form.custom_fields,
      });
      onSaved(updated);
      setForm(formFromSchool(updated));
      onClose();
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить школу'));
    } finally {
      setSaving(false);
    }
  };

  const addContact = async () => {
    if (!school || !newContact.full_name.trim() || !newContact.phone.trim()) return;
    setError('');
    try {
      const created = await b2bApi.createContact(school.id, {
        full_name: newContact.full_name.trim(),
        position: newContact.position.trim() || undefined,
        phone: newContact.phone.trim(),
        phone_extra: newContact.phone_extra.trim() || undefined,
      });
      setContacts((prev) => [...(prev ?? []), created]);
      setNewContact({ full_name: '', position: '', phone: '', phone_extra: '' });
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось добавить контакт'));
    }
  };

  const searchPersons = async () => {
    if (!personQuery.trim()) return;
    setError('');
    try {
      const result = await searchApi.searchPersons(personQuery.trim());
      setPersons(result.items);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось найти контакт в адресной книге'));
    }
  };

  const addPersonContact = async (person: PersonSearchItem) => {
    if (!school) return;
    if (!person.phone_normalized) {
      setError('У выбранного контакта нет телефона.');
      return;
    }
    try {
      const created = await b2bApi.createContact(school.id, {
        full_name: person.full_name || `Person #${person.id}`,
        position: person.role_hint || undefined,
        phone: person.phone_normalized,
        phone_extra: person.email || undefined,
      });
      setContacts((prev) => [...(prev ?? []), created]);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось добавить контакт из адресной книги'));
    }
  };

  const uploadDocument = async (type: string, file?: File | null) => {
    if (!school || !file) return;
    setError('');
    try {
      await b2bApi.uploadDocument(school.id, type, file);
      const docs = await loadDocuments(school.id);
      const updated = await b2bApi.getSchool(school.id);
      onSaved(updated);
      if (type === 'signed_agreement' || type === 'agreement') {
        setDocuments(docs);
      }
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить файл'));
    }
  };

  const downloadDocument = async (doc: B2BDocument) => {
    if (!school) return;
    const blob = await b2bApi.downloadDocument(school.id, doc.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.file_name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const deleteDocument = async (doc: B2BDocument) => {
    if (!school) return;
    if (!window.confirm(`Удалить файл "${doc.file_name}"?`)) return;
    await b2bApi.deleteDocument(school.id, doc.id);
    await loadDocuments(school.id);
    onSaved(await b2bApi.getSchool(school.id));
  };

  const addCustomField = () => {
    setForm((prev) => prev ? ({
      ...prev,
      custom_fields: [...prev.custom_fields, { name: '', type: 'text', value: '' }],
    }) : prev);
  };

  const updateCustomField = (index: number, patch: Partial<B2BSchoolCustomField>) => {
    setForm((prev) => {
      if (!prev) return prev;
      const next = [...prev.custom_fields];
      next[index] = { ...next[index], ...patch };
      if (patch.type) {
        next[index].value = patch.type === 'checkbox' ? false : '';
      }
      return { ...prev, custom_fields: next };
    });
  };

  const removeCustomField = (index: number) => {
    setForm((prev) => prev ? ({
      ...prev,
      custom_fields: prev.custom_fields.filter((_, itemIndex) => itemIndex !== index),
    }) : prev);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Stack direction="row" justifyContent="space-between" gap={2} alignItems="center">
          <Box>
            <Typography variant="h5">{form?.name || school?.name || 'Школа'}</Typography>
            {school && (
              <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1 }}>
                <Chip size="small" label={statusMeta({ ...school, friendship_degree: form?.friendship_degree ?? school.friendship_degree }).label} />
                {hasSignedAgreement(documents) && <Chip size="small" color="success" label="Соглашение подписано" />}
              </Stack>
            )}
          </Box>
          {logoUrl && (
            <Box component="img" src={logoUrl} alt="Логотип школы" sx={{ width: 64, height: 64, objectFit: 'contain' }} />
          )}
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading || !form ? (
          <Typography color="text.secondary">Загрузка карточки...</Typography>
        ) : (
          <Stack spacing={3}>
            <Box>
              <Typography variant="h6" mb={1}>Основное</Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} gap={1} flexWrap="wrap">
                <TextField size="small" label="Название" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} sx={{ minWidth: 320, flex: 1 }} />
                <TextField size="small" label="Город" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                <TextField size="small" label="Директор/ИО" value={form.director} onChange={(e) => setForm({ ...form, director: e.target.value })} />
                <TextField size="small" label="Почта" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <TextField size="small" label="Телефон" value={form.phone_school} onChange={(e) => setForm({ ...form, phone_school: e.target.value })} />
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <InputLabel id="school-status-label">Статус со школой</InputLabel>
                  <Select
                    labelId="school-status-label"
                    label="Статус со школой"
                    value={form.friendship_degree}
                    onChange={(e) => setForm({ ...form, friendship_degree: e.target.value })}
                  >
                    {schoolStatusOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField size="small" label="Адрес" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} sx={{ minWidth: 320, flex: 1 }} />
              </Stack>
            </Box>

            <Divider />

            <Box>
              <Typography variant="h6" mb={1}>Контакты</Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} gap={1} sx={{ mb: 1 }}>
                <TextField size="small" label="ФИО" value={newContact.full_name} onChange={(e) => setNewContact({ ...newContact, full_name: e.target.value })} />
                <TextField size="small" label="Должность" value={newContact.position} onChange={(e) => setNewContact({ ...newContact, position: e.target.value })} />
                <TextField size="small" label="Телефон" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
                <TextField size="small" label="Доп. инфо" value={newContact.phone_extra} onChange={(e) => setNewContact({ ...newContact, phone_extra: e.target.value })} />
                <Button variant="outlined" onClick={addContact}>Добавить</Button>
              </Stack>
              <Stack direction={{ xs: 'column', md: 'row' }} gap={1} sx={{ mb: 1 }}>
                <TextField size="small" label="Поиск в адресной книге" value={personQuery} onChange={(e) => setPersonQuery(e.target.value)} sx={{ minWidth: 280 }} />
                <Button variant="outlined" onClick={searchPersons}>Найти контакт</Button>
              </Stack>
              {persons.length > 0 && (
                <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 1 }}>
                  {persons.map((person) => (
                    <Chip
                      key={person.id}
                      label={`${person.full_name || `Person #${person.id}`}${person.phone_normalized ? `, ${person.phone_normalized}` : ''}`}
                      onClick={() => addPersonContact(person)}
                    />
                  ))}
                </Stack>
              )}
              <Stack gap={1}>
                {(contacts ?? []).map((contact) => (
                  <Paper key={contact.id} variant="outlined" sx={{ p: 1 }}>
                    <Typography fontWeight={700}>{contact.full_name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {[contact.position, contact.phone, contact.phone_extra].filter(Boolean).join(' · ')}
                    </Typography>
                  </Paper>
                ))}
                {(contacts ?? []).length === 0 && <Typography color="text.secondary">Контакты еще не добавлены.</Typography>}
              </Stack>
            </Box>

            <Divider />

            <Box>
              <Typography variant="h6" mb={1}>Файлы школы</Typography>
              <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 1 }}>
                <Button variant="outlined" component="label">
                  Шаблон соглашения
                  <input hidden type="file" accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => uploadDocument('agreement_template', e.target.files?.[0])} />
                </Button>
                <Button variant="outlined" component="label">
                  Подписанное соглашение
                  <input hidden type="file" accept="application/pdf,.pdf" onChange={(e) => uploadDocument('signed_agreement', e.target.files?.[0])} />
                </Button>
                <Button variant="outlined" component="label">
                  Логотип школы
                  <input hidden type="file" accept="image/*" onChange={(e) => uploadDocument('logo', e.target.files?.[0])} />
                </Button>
              </Stack>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Тип</TableCell>
                    <TableCell>Файл</TableCell>
                    <TableCell>Дата</TableCell>
                    <TableCell align="right">Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>{documentLabels[doc.type] ?? doc.type}</TableCell>
                      <TableCell>{doc.file_name}</TableCell>
                      <TableCell>{formatDate(doc.created_at)}</TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => downloadDocument(doc)}>Скачать</Button>
                        <Button size="small" color="error" onClick={() => deleteDocument(doc)}>Удалить</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {documents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ color: 'text.secondary' }}>Файлы еще не загружены.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>

            <Divider />

            <Box>
              <Typography variant="h6" mb={1}>Доп информация</Typography>
              <TextField
                fullWidth
                minRows={4}
                multiline
                label="Комментарий по школе"
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
              />
            </Box>

            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="h6">Свои поля</Typography>
                <Button variant="outlined" onClick={addCustomField}>Добавить поле</Button>
              </Stack>
              <Stack gap={1}>
                {form.custom_fields.map((field, index) => (
                  <Stack key={index} direction={{ xs: 'column', md: 'row' }} gap={1} alignItems={{ md: 'center' }}>
                    <TextField size="small" label="Название поля" value={field.name} onChange={(e) => updateCustomField(index, { name: e.target.value })} />
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                      <InputLabel id={`field-type-${index}`}>Тип</InputLabel>
                      <Select
                        labelId={`field-type-${index}`}
                        label="Тип"
                        value={field.type}
                        onChange={(e) => updateCustomField(index, { type: e.target.value as B2BSchoolCustomField['type'] })}
                      >
                        {fieldTypeOptions.map((option) => (
                          <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    {field.type === 'checkbox' ? (
                      <Stack direction="row" alignItems="center" gap={1}>
                        <Switch checked={Boolean(field.value)} onChange={(e) => updateCustomField(index, { value: e.target.checked })} />
                        <Typography>Да/нет</Typography>
                      </Stack>
                    ) : (
                      <TextField
                        size="small"
                        label="Значение"
                        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                        value={field.value ?? ''}
                        onChange={(e) => updateCustomField(index, { value: field.type === 'number' ? Number(e.target.value) : e.target.value })}
                        InputLabelProps={field.type === 'date' ? { shrink: true } : undefined}
                        sx={{ flex: 1 }}
                      />
                    )}
                    <Button color="error" onClick={() => removeCustomField(index)}>Удалить</Button>
                  </Stack>
                ))}
                {form.custom_fields.length === 0 && <Typography color="text.secondary">Пользовательские поля еще не добавлены.</Typography>}
              </Stack>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
        <Button variant="contained" onClick={saveSchool} disabled={saving || !form}>
          {saving ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const B2BSchoolsDirectoryTab: React.FC = () => {
  const [schools, setSchools] = React.useState<B2BSchool[]>([]);
  const [signedAgreements, setSignedAgreements] = React.useState<Record<number, boolean>>({});
  const [selectedSchool, setSelectedSchool] = React.useState<B2BSchool | null>(null);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const loadSchools = React.useCallback(async () => {
    setLoading(true);
    try {
      const [data, statuses] = await Promise.all([
        b2bApi.listSchools({ search }),
        b2bApi.getSchoolsDocumentStatuses(),
      ]);
      setSchools(data);
      setSignedAgreements(statuses);
      setError('');
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить школы'));
    } finally {
      setLoading(false);
    }
  }, [search]);

  React.useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  const handleSaved = (updated: B2BSchool) => {
    setSchools((prev) => prev.map((school) => (school.id === updated.id ? { ...school, ...updated } : school)));
    setSelectedSchool((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5">Школы</Typography>
          <Typography variant="body2" color="text.secondary">
            Общий список школ из B2B. Нажмите на школу, чтобы открыть карточку и отредактировать данные.
          </Typography>
        </Box>
        <Stack direction="row" gap={1}>
          <TextField size="small" label="Поиск" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button variant="outlined" onClick={loadSchools} disabled={loading}>
            Обновить
          </Button>
        </Stack>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Школа</TableCell>
            <TableCell>Город</TableCell>
            <TableCell>Директор/ИО директора</TableCell>
            <TableCell>Почта</TableCell>
            <TableCell>Адрес</TableCell>
            <TableCell>Телефон</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {schools.map((school) => {
            const meta = statusMeta(school);
            return (
              <TableRow
                key={school.id}
                hover
                onClick={() => setSelectedSchool(school)}
                sx={{
                  cursor: 'pointer',
                  bgcolor: `${meta.color}12`,
                  '& > td': {
                    borderTop: `2px solid ${meta.color}`,
                    borderBottom: `2px solid ${meta.color}`,
                  },
                  '& > td:first-of-type': {
                    borderLeft: `6px solid ${meta.color}`,
                    borderTopLeftRadius: 8,
                    borderBottomLeftRadius: 8,
                  },
                  '& > td:last-of-type': {
                    borderRight: `2px solid ${meta.color}`,
                    borderTopRightRadius: 8,
                    borderBottomRightRadius: 8,
                  },
                }}
              >
                <TableCell>
                  <Box>
                    <Typography variant="body2" fontWeight={700}>{school.name}</Typography>
                    <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                      <Chip size="small" label={meta.label} />
                      {signedAgreements[school.id] && <Chip size="small" color="success" label="Соглашение подписано" />}
                    </Stack>
                  </Box>
                </TableCell>
                <TableCell>{school.city || '—'}</TableCell>
                <TableCell>{school.director || '—'}</TableCell>
                <TableCell>{school.email || '—'}</TableCell>
                <TableCell>{school.address || '—'}</TableCell>
                <TableCell>{school.phone_school || '—'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <SchoolCardDialog
        open={Boolean(selectedSchool)}
        school={selectedSchool}
        onClose={() => setSelectedSchool(null)}
        onSaved={handleSaved}
      />
    </Paper>
  );
};

const B2BSchoolsWorkPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const validTabs = [TAB_LIST, TAB_SCHOOLS, TAB_BROADCASTS];
  const tab = validTabs.includes(tabParam ?? '') ? tabParam! : TAB_LIST;

  const handleTabChange = (_: React.SyntheticEvent, value: string) => {
    setSearchParams(value === TAB_LIST ? {} : { tab: value });
  };

  return (
    <Layout>
      <Box sx={{ width: '100%' }}>
        <Tabs value={tab} onChange={handleTabChange} sx={{ mb: 2 }}>
          <Tab label="Работа со школами" value={TAB_LIST} />
          <Tab label="Школы" value={TAB_SCHOOLS} />
          <Tab label="Рассылки" value={TAB_BROADCASTS} />
        </Tabs>
        {tab === TAB_LIST && <CampaignsTab />}
        {tab === TAB_SCHOOLS && <B2BSchoolsDirectoryTab />}
        {tab === TAB_BROADCASTS && <BroadcastsTab />}
      </Box>
    </Layout>
  );
};

export default B2BSchoolsWorkPage;
