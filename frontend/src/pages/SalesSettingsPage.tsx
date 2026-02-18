import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { salesApi } from '../services/api';
import { extractApiError } from '../utils/extractApiError';
import { LeadInfoTemplate, LeadSource, LeadStatus, LeadStatusOption, LeadTaskStatusOption, LeadTaskTemplate, SalesCity, SalesSchool } from '../types';

const leadStatusLabels: Record<LeadStatus, string> = {
  new: 'Новый',
  contacted: 'Связались',
  no_answer: 'Недозвон',
  demo: 'Демо',
  invoice_sent: 'Инвойс отправлен',
  won: 'Успешно',
  lost: '╨Ч╨░╨║╤А╤Л╤В',
  thinking: 'Подумают',
  refused: 'Отказали',
  trial_scheduled: 'Записали на пробное',
  event_registered: '╨Ч╨░╨┐╨╕╤Б╨░╨╗╤Б╤П ╨╜╨░ ╨╝╨╡╤А╨╛╨┐╤А╨╕╤П╤В╨╕╨╡',
  decided_immediately: '╨а╨╡╤И╨╕╨╗ ╨╖╨░╨╜╨╕╨╝╨░╤В╤М╤Б╤П ╤Б╤А╨░╨╖╤Г',
};

const SalesSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [templates, setTemplates] = useState<LeadTaskTemplate[]>([]);
  const [statuses, setStatuses] = useState<LeadTaskStatusOption[]>([]);
  const [leadStatuses, setLeadStatuses] = useState<LeadStatusOption[]>([]);
  const [infoTemplates, setInfoTemplates] = useState<LeadInfoTemplate[]>([]);
  const [newSource, setNewSource] = useState('');
  const [newTemplate, setNewTemplate] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [newStatusClosed, setNewStatusClosed] = useState(false);
  const [newLeadStatus, setNewLeadStatus] = useState('');
  const [newLeadStatusBase, setNewLeadStatusBase] = useState<LeadStatus>('new');
  const [newInfoTemplateName, setNewInfoTemplateName] = useState('');
  const [newInfoTemplateBody, setNewInfoTemplateBody] = useState('');
  const [cities, setCities] = useState<SalesCity[]>([]);
  const [newCity, setNewCity] = useState('');
  const [schools, setSchools] = useState<SalesSchool[]>([]);
  const [newSchool, setNewSchool] = useState('');

  const loadData = async () => {
    try {
      const [info, src, tpl, st, leadSt, citiesList, schoolsList] = await Promise.all([
        salesApi.listLeadInfoTemplates(false),
        salesApi.listLeadSources(false),
        salesApi.listLeadTaskTemplates(false),
        salesApi.listLeadTaskStatuses(false),
        salesApi.listLeadStatuses(false),
        salesApi.listSalesCities(false),
        salesApi.listSalesSchools(false),
      ]);
      setInfoTemplates(info);
      setSources(src);
      setTemplates(tpl);
      setStatuses(st);
      setLeadStatuses(leadSt);
      setCities(citiesList);
      setSchools(schoolsList);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить настройки'));
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const safeAction = async (fn: () => Promise<any>) => {
    try {
      await fn();
      setError('');
      await loadData();
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка сохранения'));
    }
  };

  return (
    <Layout>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <Typography variant="h4">Настройки Sales</Typography>
        {(user?.role === 'admin' || user?.role === 'owner') && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/sales-managers')}
          >
            ╨б╨╛╨╖╨┤╨░╤В╤М sales ╨╝╨╡╨╜╨╡╨┤╨╢╨╡╤А╨░
          </Button>
        )}
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Stack spacing={2}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" mb={1}>╨У╨╛╤А╨╛╨┤╨░</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small"
              label="╨Э╨╛╨▓╤Л╨╣ ╨│╨╛╤А╨╛╨┤"
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
            />
            <Button
              variant="contained"
              onClick={() => safeAction(async () => {
                if (!newCity.trim()) return;
                await salesApi.createSalesCity(newCity.trim());
                setNewCity('');
              })}
            >
              ╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡</TableCell>
                <TableCell>╨Р╨║╤В╨╕╨▓╨╡╨╜</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cities.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>
                    <Switch
                      checked={c.is_active}
                      onChange={(e) => safeAction(() => salesApi.updateSalesCity(c.id, { is_active: e.target.checked }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" mb={1}>╨и╨║╨╛╨╗╤Л</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small"
              label="╨Э╨╛╨▓╨░╤П ╤И╨║╨╛╨╗╨░"
              value={newSchool}
              onChange={(e) => setNewSchool(e.target.value)}
            />
            <Button
              variant="contained"
              onClick={() => safeAction(async () => {
                if (!newSchool.trim()) return;
                await salesApi.createSalesSchool(newSchool.trim());
                setNewSchool('');
              })}
            >
              ╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡</TableCell>
                <TableCell>╨Р╨║╤В╨╕╨▓╨╜╨░</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {schools.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>
                    <Switch
                      checked={s.is_active}
                      onChange={(e) => safeAction(() => salesApi.updateSalesSchool(s.id, { is_active: e.target.checked }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" mb={1}>╨Ш╤Б╤В╨╛╤З╨╜╨╕╨║╨╕ ╨╗╨╕╨┤╨░</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small"
              label="╨Э╨╛╨▓╤Л╨╣ ╨╕╤Б╤В╨╛╤З╨╜╨╕╨║"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
            />
            <Button
              variant="contained"
              onClick={() => safeAction(async () => {
                if (!newSource.trim()) return;
                await salesApi.createLeadSource(newSource.trim());
                setNewSource('');
              })}
            >
              ╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡</TableCell>
                <TableCell>╨Р╨║╤В╨╕╨▓╨╡╨╜</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sources.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>
                    <Switch
                      checked={s.is_active}
                      onChange={(e) => safeAction(() => salesApi.updateLeadSource(s.id, { is_active: e.target.checked }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" mb={1}>╨б╨┐╨╕╤Б╨╛╨║ ╨╖╨░╨┤╨░╤З</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small"
              label="╨Э╨╛╨▓╨░╤П ╨╖╨░╨┤╨░╤З╨░"
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value)}
            />
            <Button
              variant="contained"
              onClick={() => safeAction(async () => {
                if (!newTemplate.trim()) return;
                await salesApi.createLeadTaskTemplate(newTemplate.trim());
                setNewTemplate('');
              })}
            >
              ╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡</TableCell>
                <TableCell>╨Р╨║╤В╨╕╨▓╨╜╨░</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>
                    <Switch
                      checked={t.is_active}
                      onChange={(e) => safeAction(() => salesApi.updateLeadTaskTemplate(t.id, { is_active: e.target.checked }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" mb={1}>╨б╨┐╨╕╤Б╨╛╨║ ╤Б╤В╨░╤В╤Г╤Б╨╛╨▓ ╨╖╨░╨┤╨░╤З</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="╨Э╨╛╨▓╤Л╨╣ ╤Б╤В╨░╤В╤Г╤Б"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
            />
            <FormControlLabel
              control={<Switch checked={newStatusClosed} onChange={(e) => setNewStatusClosed(e.target.checked)} />}
              label="╨Ч╨░╨║╤А╤Л╨▓╨░╤О╤Й╨╕╨╣"
            />
            <Button
              variant="contained"
              onClick={() => safeAction(async () => {
                if (!newStatus.trim()) return;
                await salesApi.createLeadTaskStatus({ name: newStatus.trim(), is_closed: newStatusClosed });
                setNewStatus('');
                setNewStatusClosed(false);
              })}
            >
              ╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡</TableCell>
                <TableCell>╨Ч╨░╨║╤А╤Л╨▓╨░╤О╤Й╨╕╨╣</TableCell>
                <TableCell>╨Р╨║╤В╨╕╨▓╨╡╨╜</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {statuses.map((st) => (
                <TableRow key={st.id}>
                  <TableCell>{st.name}</TableCell>
                  <TableCell>{st.is_closed ? '╨Ф╨░' : '╨Э╨╡╤В'}</TableCell>
                  <TableCell>
                    <Switch
                      checked={st.is_active}
                      onChange={(e) => safeAction(() => salesApi.updateLeadTaskStatus(st.id, { is_active: e.target.checked }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" mb={1}>╨б╤В╨░╤В╤Г╤Б╤Л ╨╗╨╕╨┤╨░</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="╨Э╨╛╨▓╤Л╨╣ ╤Б╤В╨░╤В╤Г╤Б ╨╗╨╕╨┤╨░"
              value={newLeadStatus}
              onChange={(e) => setNewLeadStatus(e.target.value)}
            />
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="new-lead-status-base-label">╨С╨░╨╖╨╛╨▓╨░╤П ╤Б╤В╨░╨┤╨╕╤П</InputLabel>
              <Select
                labelId="new-lead-status-base-label"
                label="╨С╨░╨╖╨╛╨▓╨░╤П ╤Б╤В╨░╨┤╨╕╤П"
                value={newLeadStatusBase}
                onChange={(e) => setNewLeadStatusBase(e.target.value as LeadStatus)}
              >
                {(Object.keys(leadStatusLabels) as LeadStatus[]).map((status) => (
                  <MenuItem key={status} value={status}>
                    {leadStatusLabels[status]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              onClick={() => safeAction(async () => {
                if (!newLeadStatus.trim()) return;
                await salesApi.createLeadStatus({ name: newLeadStatus.trim(), base_status: newLeadStatusBase });
                setNewLeadStatus('');
                setNewLeadStatusBase('new');
              })}
            >
              ╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡</TableCell>
                <TableCell>╨С╨░╨╖╨╛╨▓╨░╤П ╤Б╤В╨░╨┤╨╕╤П</TableCell>
                <TableCell>╨Р╨║╤В╨╕╨▓╨╡╨╜</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {leadStatuses.map((st) => (
                <TableRow key={st.id}>
                  <TableCell>{st.name}</TableCell>
                  <TableCell>{leadStatusLabels[st.base_status]}</TableCell>
                  <TableCell>
                    <Switch
                      checked={st.is_active}
                      onChange={(e) => safeAction(() => salesApi.updateLeadStatus(st.id, { is_active: e.target.checked }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" mb={1}>╨и╨░╨▒╨╗╨╛╨╜╤Л ╨╛╤В╨┐╤А╨░╨▓╨║╨╕ ╨╕╨╜╤Д╨╛</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡ ╤И╨░╨▒╨╗╨╛╨╜╨░"
              value={newInfoTemplateName}
              onChange={(e) => setNewInfoTemplateName(e.target.value)}
            />
            <TextField
              size="small"
              label="╨в╨╡╨║╤Б╤В ╤И╨░╨▒╨╗╨╛╨╜╨░"
              value={newInfoTemplateBody}
              onChange={(e) => setNewInfoTemplateBody(e.target.value)}
              sx={{ minWidth: 420 }}
            />
            <Button
              variant="contained"
              onClick={() => safeAction(async () => {
                if (!newInfoTemplateName.trim() || !newInfoTemplateBody.trim()) return;
                await salesApi.createLeadInfoTemplate({
                  name: newInfoTemplateName.trim(),
                  body: newInfoTemplateBody.trim(),
                });
                setNewInfoTemplateName('');
                setNewInfoTemplateBody('');
              })}
            >
              ╨Ф╨╛╨▒╨░╨▓╨╕╤В╤М
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>╨Э╨░╨╖╨▓╨░╨╜╨╕╨╡</TableCell>
                <TableCell>╨в╨╡╨║╤Б╤В</TableCell>
                <TableCell>╨Р╨║╤В╨╕╨▓╨╡╨╜</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {infoTemplates.map((tpl) => (
                <TableRow key={tpl.id}>
                  <TableCell>{tpl.name}</TableCell>
                  <TableCell>{tpl.body}</TableCell>
                  <TableCell>
                    <Switch
                      checked={tpl.is_active}
                      onChange={(e) => safeAction(() => salesApi.updateLeadInfoTemplate(tpl.id, { is_active: e.target.checked }))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Stack>
    </Layout>
  );
};

export default SalesSettingsPage;
