import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
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
import { Lead, LeadInfoTemplate } from '../types';
import { S } from './SalesAgreedPage.strings';

const defaultFollowUpAt = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
};

export const SalesAgreedPageContent: React.FC = () => {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [templates, setTemplates] = useState<LeadInfoTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  const [sendOpen, setSendOpen] = useState(false);
  const [sendLead, setSendLead] = useState<Lead | null>(null);
  const [sendForm, setSendForm] = useState({
    template_id: '' as number | '',
    channel: 'messenger',
    message: '',
    pause_reason: '',
    follow_up_at: defaultFollowUpAt(),
  });

  const loadLeads = useCallback(async () => {
    try {
      const [inv, decided] = await Promise.all([
        salesApi.listLeads({ status_filter: 'invoice_sent', questionnaire_filled: false, limit: 1000 }),
        salesApi.listLeads({ status_filter: 'decided_immediately', questionnaire_filled: false, limit: 1000 }),
      ]);
      setLeads([...inv.items, ...decided.items]);
      setError(null);
    } catch (err: any) {
      setError(extractApiError(err, S.loadError));
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await salesApi.listLeadInfoTemplates(true);
      setTemplates(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadLeads();
    loadTemplates();
  }, [loadLeads, loadTemplates]);

  const questionnaireTemplate = templates.find(
    (t) => (t.name || '').toLowerCase().includes(S.questionnaireKey)
  );
  const defaultTemplateId = questionnaireTemplate?.id ?? templates[0]?.id;

  const openSendDialog = (lead: Lead) => {
    setSendLead(lead);
    const tplId = defaultTemplateId !== undefined ? defaultTemplateId : '';
    const tpl = typeof tplId === 'number' ? templates.find((t) => t.id === tplId) : null;
    setSendForm({
      template_id: tplId,
      channel: 'messenger',
      message: tpl?.body ?? '',
      pause_reason: '',
      follow_up_at: defaultFollowUpAt(),
    });
    setSendOpen(true);
  };

  const handleTemplateChange = (templateId: string) => {
    const id = templateId ? Number(templateId) : '';
    const tpl = templates.find((t) => t.id === id);
    setSendForm((prev) => ({
      ...prev,
      template_id: id,
      message: tpl?.body ?? prev.message,
    }));
  };

  const handleSendQuestionnaire = async () => {
    if (!sendLead) return;
    if (!sendForm.message.trim()) {
      setError(S.enterMessage);
      return;
    }
    if (!sendForm.follow_up_at) {
      setError(S.enterFollowUp);
      return;
    }
    setActionLoadingId(sendLead.id);
    setError(null);
    try {
      await salesApi.sendLeadInfo(sendLead.id, {
        template_id: sendForm.template_id || undefined,
        channel: sendForm.channel,
        message: sendForm.message.trim(),
        follow_up_at: new Date(sendForm.follow_up_at).toISOString(),
        pause_reason: sendForm.pause_reason || undefined,
      });
      setSendOpen(false);
      setSendLead(null);
      await loadLeads();
    } catch (err: any) {
      setError(extractApiError(err, S.sendError));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMarkQuestionnaireFilled = async (lead: Lead) => {
    setActionLoadingId(lead.id);
    setError(null);
    try {
      await salesApi.updateLead(lead.id, { questionnaire_filled: true });
      await loadLeads();
      navigate('/sales/invoices');
    } catch (err: any) {
      setError(extractApiError(err, S.markError));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleChangedMind = async (lead: Lead) => {
    setActionLoadingId(lead.id);
    setError(null);
    try {
      await salesApi.updateLead(lead.id, { status: 'thinking', questionnaire_filled: false });
      await loadLeads();
    } catch (err: any) {
      setError(extractApiError(err, S.changedMindError));
    } finally {
      setActionLoadingId(null);
    }
  };

  const leadDisplayName = (l: Lead) =>
    [l.parent_full_name || l.contact_name, l.child_full_name].filter(Boolean).join(' / ') || l.phone || `${S.leadId}${l.id}`;
  const leadPhone = (l: Lead) => l.parent_phone || l.phone || S.dash;

  return (
    <>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h4">{S.title}</Typography>
        <Button variant="outlined" onClick={() => loadLeads()}>
          {S.refresh}
        </Button>
      </Stack>

      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {S.description}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{S.colLead}</TableCell>
            <TableCell>{S.colPhone}</TableCell>
            <TableCell>{S.colUpdated}</TableCell>
            <TableCell align="right">{S.colActions}</TableCell>
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
                  : S.dash}
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap">
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    disabled={actionLoadingId === lead.id}
                    onClick={() => openSendDialog(lead)}
                  >
                    {S.btnSend}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="success"
                    disabled={actionLoadingId === lead.id}
                    onClick={() => handleMarkQuestionnaireFilled(lead)}
                  >
                    {S.btnFilled}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={actionLoadingId === lead.id}
                    onClick={() => handleChangedMind(lead)}
                  >
                    {S.btnChangedMind}
                  </Button>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
          {leads.length === 0 && (
            <TableRow>
              <TableCell colSpan={4}>
                <Typography color="text.secondary">
                  {S.emptyText}
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={sendOpen} onClose={() => setSendOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{S.dialogTitle}</DialogTitle>
        <DialogContent>
          {sendLead && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {leadDisplayName(sendLead)} {S.dash} {leadPhone(sendLead)}
            </Typography>
          )}
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel id="questionnaire-template-label">{S.labelTemplate}</InputLabel>
            <Select
              labelId="questionnaire-template-label"
              label={S.labelTemplate}
              value={sendForm.template_id}
              onChange={(e) => handleTemplateChange(String(e.target.value))}
            >
              <MenuItem value="">
                <em>{S.noTemplate}</em>
              </MenuItem>
              {templates.map((tpl) => (
                <MenuItem key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel id="questionnaire-channel-label">{S.labelChannel}</InputLabel>
            <Select
              labelId="questionnaire-channel-label"
              label={S.labelChannel}
              value={sendForm.channel}
              onChange={(e) => setSendForm((s) => ({ ...s, channel: String(e.target.value) }))}
            >
              <MenuItem value="messenger">messenger</MenuItem>
              <MenuItem value="email">email</MenuItem>
              <MenuItem value="call">call</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            multiline
            minRows={4}
            label={S.labelMessage}
            sx={{ mt: 2 }}
            value={sendForm.message}
            onChange={(e) => setSendForm((s) => ({ ...s, message: e.target.value }))}
          />
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel id="questionnaire-pause-label">{S.labelPause}</InputLabel>
            <Select
              labelId="questionnaire-pause-label"
              label={S.labelPause}
              value={sendForm.pause_reason}
              onChange={(e) => setSendForm((s) => ({ ...s, pause_reason: String(e.target.value) }))}
            >
              <MenuItem value="">
                <em>{S.noPause}</em>
              </MenuItem>
              <MenuItem value={S.pauseWait}>{S.pauseWait}</MenuItem>
              <MenuItem value={S.pauseThink}>{S.pauseThink}</MenuItem>
              <MenuItem value={S.pauseNoTime}>{S.pauseNoTime}</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            type="datetime-local"
            label={S.labelFollowUp}
            InputLabelProps={{ shrink: true }}
            sx={{ mt: 2 }}
            value={sendForm.follow_up_at}
            onChange={(e) => setSendForm((s) => ({ ...s, follow_up_at: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSendOpen(false)}>{S.btnCancel}</Button>
          <Button variant="contained" onClick={() => void handleSendQuestionnaire()}>
            {S.btnSendShort}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

const SalesAgreedPage: React.FC = () => (
  <Layout>
    <SalesAgreedPageContent />
  </Layout>
);

export default SalesAgreedPage;
