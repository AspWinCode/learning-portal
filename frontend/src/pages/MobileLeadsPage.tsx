import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { ArrowBack, Phone, Refresh, Search, Sms } from '@mui/icons-material';
import { salesApi } from '../services/api';
import type { Lead, LeadStatus } from '../types';

const STATUS_TABS: { value: LeadStatus | ''; label: string }[] = [
  { value: '', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'contacted', label: 'В работе' },
  { value: 'trial_scheduled', label: 'Пробный' },
];

const statusLabel: Record<string, string> = {
  new: 'Новый',
  in_progress: 'В работе',
  post_visit: 'После пробного',
  agreed: 'Договорились',
  thinking: 'Думает',
  declined: 'Отказ',
  lost: 'Потерян',
};

const statusColor = (s: string): 'default' | 'primary' | 'success' | 'error' | 'warning' =>
  s === 'new' ? 'primary'
  : s === 'agreed' ? 'success'
  : s === 'declined' || s === 'lost' ? 'error'
  : s === 'post_visit' ? 'warning'
  : 'default';

const MobileLeadsPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<LeadStatus | ''>('');
  const [search, setSearch] = useState('');

  const leadsQuery = useQuery({
    queryKey: ['mobile-leads', tab],
    queryFn: () => salesApi.listLeads(tab ? { status_filter: tab } : {}),
  });

  const leads = (leadsQuery.data ?? []).filter((l: Lead) =>
    !search.trim() ||
    l.contact_name.toLowerCase().includes(search.toLowerCase()) ||
    (l.phone ?? '').includes(search) ||
    (l.child_full_name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f6f8fb', pb: 'calc(24px + env(safe-area-inset-bottom))' }}>
      <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
        <Toolbar>
          <IconButton edge="start" onClick={() => navigate('/mobile')} aria-label="Назад">
            <ArrowBack />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0, ml: 1 }}>
            <Typography variant="subtitle1" fontWeight={900} noWrap>Лиды</Typography>
            <Typography variant="caption" color="text.secondary">{leads.length} лидов</Typography>
          </Box>
          <IconButton onClick={() => leadsQuery.refetch()} aria-label="Обновить"><Refresh /></IconButton>
        </Toolbar>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons={false}
          sx={{ borderTop: '1px solid rgba(15,23,42,0.06)', minHeight: 40 }}
        >
          {STATUS_TABS.map((t) => (
            <Tab key={t.value} label={t.label} value={t.value} sx={{ minHeight: 40, fontSize: '0.8rem', minWidth: 72 }} />
          ))}
        </Tabs>
      </AppBar>

      <Container maxWidth="sm" sx={{ pt: 2, px: { xs: 1.5, sm: 3 } }}>
        <Stack spacing={1.25}>
          <TextField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или телефону"
            size="small"
            fullWidth
            InputProps={{
              startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>,
            }}
          />

          {leadsQuery.isLoading ? (
            <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>
          ) : leadsQuery.isError ? (
            <Alert severity="error">Не удалось загрузить лиды</Alert>
          ) : leads.length === 0 ? (
            <Alert severity="info">Лидов нет</Alert>
          ) : (
            leads.map((lead: Lead) => (
              <Paper key={lead.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 0.75 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} noWrap>{lead.contact_name}</Typography>
                    {lead.child_full_name && (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        Ученик: {lead.child_full_name}
                      </Typography>
                    )}
                  </Box>
                  <Chip
                    size="small"
                    label={statusLabel[lead.status] ?? lead.status}
                    color={statusColor(lead.status)}
                    variant="outlined"
                    sx={{ flexShrink: 0 }}
                  />
                </Stack>

                {lead.next_contact_at && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                    Следующий контакт: {new Date(lead.next_contact_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </Typography>
                )}

                <Stack direction="row" spacing={1}>
                  <Button
                    component="a"
                    href={`tel:${lead.phone}`}
                    variant="contained"
                    size="small"
                    startIcon={<Phone />}
                    sx={{ flex: 1 }}
                  >
                    Позвонить
                  </Button>
                  <IconButton
                    component="a"
                    href={`sms:${lead.phone}`}
                    size="small"
                    color="primary"
                    aria-label="SMS"
                  >
                    <Sms />
                  </IconButton>
                </Stack>
              </Paper>
            ))
          )}
        </Stack>
      </Container>
    </Box>
  );
};

export default MobileLeadsPage;
