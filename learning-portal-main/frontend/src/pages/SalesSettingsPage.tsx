import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  Paper,
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
import { LeadInfoTemplate, LeadSource, LeadTaskStatusOption, LeadTaskTemplate } from '../types';

const SalesSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [templates, setTemplates] = useState<LeadTaskTemplate[]>([]);
  const [statuses, setStatuses] = useState<LeadTaskStatusOption[]>([]);
  const [infoTemplates, setInfoTemplates] = useState<LeadInfoTemplate[]>([]);
  const [newSource, setNewSource] = useState('');
  const [newTemplate, setNewTemplate] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [newStatusClosed, setNewStatusClosed] = useState(false);
  const [newInfoTemplateName, setNewInfoTemplateName] = useState('');
  const [newInfoTemplateBody, setNewInfoTemplateBody] = useState('');

  const loadData = async () => {
    try {
      const [info, src, tpl, st] = await Promise.all([
        salesApi.listLeadInfoTemplates(false),
        salesApi.listLeadSources(false),
        salesApi.listLeadTaskTemplates(false),
        salesApi.listLeadTaskStatuses(false),
      ]);
      setInfoTemplates(info);
      setSources(src);
      setTemplates(tpl);
      setStatuses(st);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить справочники'));
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
        <Typography variant="h4">Справочники Sales</Typography>
        {(user?.role === 'admin' || user?.role === 'owner') && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/sales-managers')}
          >
            Создать sales менеджера
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
          <Typography variant="h6" mb={1}>Источники лида</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small"
              label="Новый источник"
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
              Добавить
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Активен</TableCell>
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
          <Typography variant="h6" mb={1}>Список задач</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
            <TextField
              size="small"
              label="Новая задача"
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
              Добавить
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Активна</TableCell>
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
          <Typography variant="h6" mb={1}>Список статусов задач</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Новый статус"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
            />
            <FormControlLabel
              control={<Switch checked={newStatusClosed} onChange={(e) => setNewStatusClosed(e.target.checked)} />}
              label="Закрывающий"
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
              Добавить
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Закрывающий</TableCell>
                <TableCell>Активен</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {statuses.map((st) => (
                <TableRow key={st.id}>
                  <TableCell>{st.name}</TableCell>
                  <TableCell>{st.is_closed ? 'Да' : 'Нет'}</TableCell>
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
          <Typography variant="h6" mb={1}>Шаблоны отправки инфо</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Название шаблона"
              value={newInfoTemplateName}
              onChange={(e) => setNewInfoTemplateName(e.target.value)}
            />
            <TextField
              size="small"
              label="Текст шаблона"
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
              Добавить
            </Button>
          </Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Текст</TableCell>
                <TableCell>Активен</TableCell>
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
