import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
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
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
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

const SalesAgreedPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsFilled, setLeadsFilled] = useState<Lead[]>([]);
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
        salesApi.listLeads({ status_filter: 'invoice_sent', questionnaire_filled: false }),
        salesApi.listLeads({ status_filter: 'decided_immediately', questionnaire_filled: false }),
      ]);
      setLeads([...inv, ...decided]);
      setError(null);
    } catch (err: any) {
      setError(extractApiError(err, S.loadError));
    }
  }, []);

  const loadLeadsFilled = useCallback(async () => {
    try {
      const [inv, decided] = await Promise.all([
        salesApi.listLeads({ status_filter: 'invoice_sent', questionnaire_filled: true }),
        salesApi.listLeads({ status_filter: 'decided_immediately', questionnaire_filled: true }),
      ]);
      setLeadsFilled([...inv, ...decided]);
    } catch {
      setLeadsFilled([]);
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
    loadLeadsFilled();
    loadTemplates();
  }, [loadLeads, loadLeadsFilled, loadTemplates]);

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
      await Promise.all([loadLeads(), loadLeadsFilled()]);
      setTab(1);
    } catch (err: any) {
      setError(extractApiError(err, S.markError));
    } finally {
      setActionLoadingId(null);
    }
  };

  const leadDisplayName = (l: Lead) =>
    [l.parent_full_name || l.contact_name, l.child_full_name].filter(Boolean).join(' / ') || l.phone || `${S.leadId}${l.id}`;
  const leadPhone = (l: Lead) => l.parent_phone || l.phone || S.dash;

  return (
    <Layout>
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

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Нужно заполнить анкету" id="agreed-tab-0" aria-controls="agreed-panel-0" />
        <Tab label="Счета" id="agreed-tab-1" aria-controls="agreed-panel-1" />
      </Tabs>

      <Box role="tabpanel" id="agreed-panel-0" aria-labelledby="agreed-tab-0" hidden={tab !== 0}>
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
      </Box>

      <Box role="tabpanel" id="agreed-panel-1" aria-labelledby="agreed-tab-1" hidden={tab !== 1}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{S.colLead}</TableCell>
              <TableCell>{S.colPhone}</TableCell>
              <TableCell>{S.colUpdated}</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {leadsFilled.map((lead) => (
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
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => navigate('/sales/leads?open=' + lead.id)}
                  >
                    Открыть карточку лида
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {leadsFilled.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography color="text.secondary">
                    Нет лидов с заполненной анкетой. После нажатия «Анкета заполнена» лид появится здесь — откройте карточку, чтобы создать счёт.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>

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
    </Layout>
  );
};

export default SalesAgreedPage;
