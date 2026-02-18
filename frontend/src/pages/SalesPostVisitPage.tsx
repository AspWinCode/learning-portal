import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { format, isValid, parseISO } from 'date-fns';
import Layout from '../components/Layout';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { Lead } from '../types';

const SalesPostVisitPage: React.FC = () => {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [thinkingLead, setThinkingLead] = useState<Lead | null>(null);
  const [thinkingFollowUpAt, setThinkingFollowUpAt] = useState('');

  const [declinedOpen, setDeclinedOpen] = useState(false);
  const [declinedLead, setDeclinedLead] = useState<Lead | null>(null);
  const [declinedReason, setDeclinedReason] = useState('');

  const loadLeads = useCallback(async () => {
    try {
      const data = await salesApi.listLeads({ status_filter: 'demo' });
      setLeads(data);
      setError(null);
    } catch (err: any) {
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╨╖╨░╨│╤А╤Г╨╖╨╕╤В╤М ╤Б╨┐╨╕╤Б╨╛╨║'));
    }
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const handleAgreed = async (lead: Lead) => {
    setActionLoadingId(lead.id);
    setError(null);
    try {
      await salesApi.postVisitOutcome(lead.id, { outcome: 'agreed' });
      await loadLeads();
    } catch (err: any) {
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╤Б╨╛╤Е╤А╨░╨╜╨╕╤В╤М ╨╕╤Б╤Е╨╛╨┤'));
    } finally {
      setActionLoadingId(null);
    }
  };

  const openThinking = (lead: Lead) => {
    setThinkingLead(lead);
    setThinkingFollowUpAt(
      lead.next_contact_at
        ? format(new Date(lead.next_contact_at), "yyyy-MM-dd'T'HH:mm")
        : ''
    );
    setThinkingOpen(true);
  };

  const handleConfirmThinking = async () => {
    if (!thinkingLead) return;
    if (!thinkingFollowUpAt.trim()) {
      setError('╨г╨║╨░╨╢╨╕╤В╨╡ ╨┤╨░╤В╤Г ╨┐╨╛╨▓╤В╨╛╤А╨╜╨╛╨│╨╛ ╨║╨╛╨╜╤В╨░╨║╤В╨░');
      return;
    }
    setActionLoadingId(thinkingLead.id);
    setThinkingOpen(false);
    setError(null);
    try {
      await salesApi.postVisitOutcome(thinkingLead.id, {
        outcome: 'thinking',
        follow_up_at: thinkingFollowUpAt,
      });
      await loadLeads();
    } catch (err: any) {
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╤Б╨╛╤Е╤А╨░╨╜╨╕╤В╤М ╨╕╤Б╤Е╨╛╨┤'));
    } finally {
      setActionLoadingId(null);
      setThinkingLead(null);
    }
  };

  const openDeclined = (lead: Lead) => {
    setDeclinedLead(lead);
    setDeclinedReason('');
    setDeclinedOpen(true);
  };

  const handleConfirmDeclined = async () => {
    if (!declinedLead) return;
    if (!declinedReason.trim()) {
      setError('╨г╨║╨░╨╢╨╕╤В╨╡ ╨┐╤А╨╕╤З╨╕╨╜╤Г ╨╛╤В╨║╨░╨╖╨░');
      return;
    }
    setActionLoadingId(declinedLead.id);
    setDeclinedOpen(false);
    setError(null);
    try {
      await salesApi.postVisitOutcome(declinedLead.id, {
        outcome: 'declined',
        lost_reason: declinedReason.trim(),
      });
      await loadLeads();
    } catch (err: any) {
      setError(extractApiError(err, '╨Э╨╡ ╤Г╨┤╨░╨╗╨╛╤Б╤М ╤Б╨╛╤Е╤А╨░╨╜╨╕╤В╤М ╨╕╤Б╤Е╨╛╨┤'));
    } finally {
      setActionLoadingId(null);
      setDeclinedLead(null);
      setDeclinedReason('');
    }
  };

  const leadDisplayName = (l: Lead) =>
    [l.parent_full_name || l.contact_name, l.child_full_name].filter(Boolean).join(' / ') || l.phone || `╨Ы╨╕╨┤ #${l.id}`;
  const leadPhone = (l: Lead) => l.parent_phone || l.phone || 'тАФ';

  return (
    <Layout>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">╨Я╨╛╤Б╨╗╨╡ ╨▓╨╕╨╖╨╕╤В╨░</Typography>
        <Button variant="outlined" onClick={() => loadLeads()}>
          ╨Ю╨▒╨╜╨╛╨▓╨╕╤В╤М
        </Button>
      </Stack>

      <Typography color="text.secondary" sx={{ mb: 2 }}>
        ╨Ы╨╕╨┤╤Л, ╨║╨╛╤В╨╛╤А╤Л╨╡ ╤Б╤Е╨╛╨┤╨╕╨╗╨╕ ╨╜╨░ ╨┐╤А╨╛╨▒╨╜╨╛╨╡ ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡. ╨Т ╤В╨╡╤З╨╡╨╜╨╕╨╡ 24 ╤З тАФ ╨╛╤В╨╖╤Л╨▓ ╨╕ ╨┐╤А╨╕╨│╨╗╨░╤И╨╡╨╜╨╕╨╡ ╨╜╨░ ╨╖╨░╨╜╤П╤В╨╕╤П. ╨Т╤Л╨▒╨╡╤А╨╕╤В╨╡ ╨╕╤Б╤Е╨╛╨┤ ╨┐╨╛ ╨║╨░╨╢╨┤╨╛╨╝╤Г.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>╨Ы╨╕╨┤</TableCell>
            <TableCell>╨в╨╡╨╗╨╡╤Д╨╛╨╜</TableCell>
            <TableCell>╨Ю╨▒╨╜╨╛╨▓╨╗╤С╨╜</TableCell>
            <TableCell align="right">╨Ш╤Б╤Е╨╛╨┤</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {leads.map((lead) => (
            <TableRow key={lead.id} hover>
              <TableCell>
                <Button
                  size="small"
                  variant="text"
                  sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
                  onClick={() => navigate('/sales/leads?open=' + lead.id)}
                >
                  {leadDisplayName(lead)}
                </Button>
              </TableCell>
              <TableCell>{leadPhone(lead)}</TableCell>
              <TableCell>
                {lead.updated_at
                  ? (() => {
                      const d = parseISO(lead.updated_at);
                      return isValid(d) ? format(d, 'dd.MM.yyyy HH:mm') : lead.updated_at;
                    })()
                  : 'тАФ'}
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap">
                  <Button
                    size="small"
                    color="success"
                    variant="contained"
                    disabled={actionLoadingId === lead.id}
                    onClick={() => handleAgreed(lead)}
                  >
                    ╨б╨╛╨│╨╗╨░╤Б╨╡╨╜ ╨╖╨░╨╜╨╕╨╝╨░╤В╤М╤Б╤П
                  </Button>
                  <Button
                    size="small"
                    color="info"
                    variant="outlined"
                    disabled={actionLoadingId === lead.id}
                    onClick={() => openThinking(lead)}
                  >
                    ╨Я╨╛╤И╤С╨╗ ╨┤╤Г╨╝╨░╤В╤М
                  </Button>
                  <Button
                    size="small"
                    color="warning"
                    variant="outlined"
                    disabled={actionLoadingId === lead.id}
                    onClick={() => openDeclined(lead)}
                  >
                    ╨Ю╤В╨║╨░╨╖╨░╨╗╤Б╤П
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
          {leads.length === 0 && (
            <TableRow>
              <TableCell colSpan={4}>
                <Typography color="text.secondary">
                  ╨Э╨╡╤В ╨╗╨╕╨┤╨╛╨▓ ╨▓ ╤Б╤В╨░╨┤╨╕╨╕ ┬л╨Я╨╛╤Б╨╗╨╡ ╨▓╨╕╨╖╨╕╤В╨░┬╗. ╨б╤О╨┤╨░ ╨┐╨╛╨┐╨░╨┤╨░╤О╤В ╤В╨╡, ╨║╨╛╨│╨╛ ╨╛╤В╨╝╨╡╤В╨╕╨╗╨╕ ┬л╨Я╤А╨╕╤И╨╡╨╗┬╗ ╨╜╨░ ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╕.
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={thinkingOpen} onClose={() => setThinkingOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>╨Я╨╛╤И╤С╨╗ ╨┤╤Г╨╝╨░╤В╤М</DialogTitle>
        <DialogContent>
          {thinkingLead && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {leadDisplayName(thinkingLead)}
            </Typography>
          )}
          <TextField
            label="╨Ф╨░╤В╨░ ╨┐╨╛╨▓╤В╨╛╤А╨╜╨╛╨│╨╛ ╨║╨╛╨╜╤В╨░╨║╤В╨░"
            type="datetime-local"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={thinkingFollowUpAt}
            onChange={(e) => setThinkingFollowUpAt(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setThinkingOpen(false)}>╨Ю╤В╨╝╨╡╨╜╨░</Button>
          <Button variant="contained" onClick={() => void handleConfirmThinking()}>
            ╨б╨╛╤Е╤А╨░╨╜╨╕╤В╤М
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={declinedOpen} onClose={() => setDeclinedOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>╨Ю╤В╨║╨░╨╖╨░╨╗╤Б╤П ╨┐╨╛╤Б╨╗╨╡ ╨▓╨╕╨╖╨╕╤В╨░</DialogTitle>
        <DialogContent>
          {declinedLead && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {leadDisplayName(declinedLead)}
            </Typography>
          )}
          <TextField
            label="╨Я╤А╨╕╤З╨╕╨╜╨░ ╨╛╤В╨║╨░╨╖╨░"
            fullWidth
            multiline
            minRows={3}
            value={declinedReason}
            onChange={(e) => setDeclinedReason(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeclinedOpen(false)}>╨Ю╤В╨╝╨╡╨╜╨░</Button>
          <Button variant="contained" color="warning" onClick={() => void handleConfirmDeclined()}>
            ╨б╨╛╤Е╤А╨░╨╜╨╕╤В╤М
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default SalesPostVisitPage;
