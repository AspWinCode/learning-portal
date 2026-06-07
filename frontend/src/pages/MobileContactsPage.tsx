import React from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  ArrowBack,
  Business,
  Email,
  Person,
  Phone,
  Refresh,
  Search,
  Sms,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { ownerWorkspaceApi } from '../services/api/ownerWorkspace';
import { OwnerWorkspaceContact } from '../types';
import { extractApiError } from '../utils/extractApiError';
import { phoneFromApi } from '../utils/phoneMask';

function phoneHref(phone?: string | null): string | null {
  const raw = String(phone || '').trim();
  if (!raw) return null;
  const normalized = raw.startsWith('+') ? `+${raw.slice(1).replace(/\D/g, '')}` : raw.replace(/\D/g, '');
  return normalized ? `tel:${normalized}` : null;
}

function smsHref(phone?: string | null): string | null {
  const href = phoneHref(phone);
  return href ? href.replace(/^tel:/, 'sms:') : null;
}

function displayPhone(phone?: string | null): string {
  const formatted = phoneFromApi(phone);
  return formatted || phone || '';
}

const MobileContactsPage: React.FC = () => {
  const navigate = useNavigate();
  const { contactId } = useParams();
  const [contacts, setContacts] = React.useState<OwnerWorkspaceContact[]>([]);
  const [contact, setContact] = React.useState<OwnerWorkspaceContact | null>(null);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    try {
      sessionStorage.setItem('pwa_mode', '1');
    } catch {
      // ignore storage errors
    }
  }, []);

  const loadContacts = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await ownerWorkspaceApi.listContacts(search.trim() ? { search: search.trim() } : {});
      setContacts(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить контакты'));
    } finally {
      setLoading(false);
    }
  }, [search]);

  const loadContact = React.useCallback(async () => {
    if (!contactId) return;
    const id = Number(contactId);
    if (!Number.isFinite(id)) {
      navigate('/mobile/contacts', { replace: true });
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await ownerWorkspaceApi.getContact(id);
      setContact(data);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить контакт'));
    } finally {
      setLoading(false);
    }
  }, [contactId, navigate]);

  React.useEffect(() => {
    if (contactId) {
      void loadContact();
      return;
    }
    const timer = window.setTimeout(() => {
      void loadContacts();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [contactId, loadContact, loadContacts]);

  const headerTitle = contactId ? 'Контакт' : 'Контакты';
  const headerSubtitle = contactId ? contact?.full_name : `${contacts.length} в списке`;

  const renderContactActions = (row: OwnerWorkspaceContact) => {
    const tel = phoneHref(row.phone);
    const sms = smsHref(row.phone);
    return (
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button
          component="a"
          href={tel || undefined}
          disabled={!tel}
          variant="contained"
          size="small"
          startIcon={<Phone />}
          sx={{ flex: 1 }}
        >
          Звонок
        </Button>
        <IconButton component="a" href={sms || undefined} disabled={!sms} aria-label="SMS" color="primary">
          <Sms />
        </IconButton>
        <IconButton
          component="a"
          href={row.email ? `mailto:${row.email}` : undefined}
          disabled={!row.email}
          aria-label="Email"
          color="primary"
        >
          <Email />
        </IconButton>
      </Stack>
    );
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f6f8fb', pb: 3 }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid rgba(15, 23, 42, 0.08)' }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => navigate(contactId ? '/mobile/contacts' : '/mobile')} aria-label="Назад">
            <ArrowBack />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0, ml: 1 }}>
            <Typography variant="subtitle1" fontWeight={900} noWrap>
              {headerTitle}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {headerSubtitle || 'PWA'}
            </Typography>
          </Box>
          <IconButton onClick={() => (contactId ? loadContact() : loadContacts())} aria-label="Обновить">
            <Refresh />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="sm" sx={{ pt: 2 }}>
        <Stack spacing={1.5}>
          {error ? <Alert severity="error">{error}</Alert> : null}

          {!contactId ? (
            <TextField
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по имени, телефону, компании"
              size="small"
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          ) : null}

          {loading ? (
            <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : contactId ? (
            contact ? (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                <Stack spacing={1.5}>
                  <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: 'primary.50',
                        color: 'primary.main',
                        flexShrink: 0,
                      }}
                    >
                      {contact.company ? <Business /> : <Person />}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="h6" fontWeight={900}>
                        {contact.full_name}
                      </Typography>
                      {contact.position || contact.company ? (
                        <Typography variant="body2" color="text.secondary">
                          {[contact.position, contact.company].filter(Boolean).join(', ')}
                        </Typography>
                      ) : null}
                    </Box>
                  </Box>

                  {renderContactActions(contact)}

                  <Divider />

                  <Stack spacing={1}>
                    {contact.phone ? (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Телефон</Typography>
                        <Typography variant="body1">{displayPhone(contact.phone)}</Typography>
                      </Box>
                    ) : null}
                    {contact.email ? (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Email</Typography>
                        <Typography variant="body1">{contact.email}</Typography>
                      </Box>
                    ) : null}
                    {contact.source ? (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Источник</Typography>
                        <Typography variant="body1">{contact.source}</Typography>
                      </Box>
                    ) : null}
                    <Box>
                      <Typography variant="caption" color="text.secondary">Активные задачи</Typography>
                      <Typography variant="body1">{contact.active_tasks_count || 0}</Typography>
                    </Box>
                  </Stack>

                  {contact.tags?.length ? (
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                      {contact.tags.map((tag) => (
                        <Chip key={tag} size="small" label={tag} />
                      ))}
                    </Stack>
                  ) : null}

                  {contact.comment ? (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Комментарий</Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {contact.comment}
                      </Typography>
                    </Box>
                  ) : null}
                </Stack>
              </Paper>
            ) : (
              <Alert severity="info">Контакт не найден.</Alert>
            )
          ) : contacts.length ? (
            <Stack spacing={1}>
              {contacts.map((row) => (
                <Paper key={row.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                  <Box onClick={() => navigate(`/mobile/contacts/${row.id}`)} sx={{ cursor: 'pointer' }}>
                    <Typography variant="body1" fontWeight={900}>
                      {row.full_name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {[row.position, row.company].filter(Boolean).join(', ') || displayPhone(row.phone) || 'Без компании'}
                    </Typography>
                    {row.phone ? (
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {displayPhone(row.phone)}
                      </Typography>
                    ) : null}
                  </Box>
                  {row.tags?.length ? (
                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                      {row.tags.slice(0, 3).map((tag) => (
                        <Chip key={tag} size="small" label={tag} />
                      ))}
                    </Stack>
                  ) : null}
                  {renderContactActions(row)}
                </Paper>
              ))}
            </Stack>
          ) : (
            <Alert severity="info">Контакты не найдены.</Alert>
          )}
        </Stack>
      </Container>
    </Box>
  );
};

export default MobileContactsPage;
