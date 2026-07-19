import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import SendIcon from '@mui/icons-material/Send';
import { emailTemplatesApi, type EmailTemplate } from '../services/api';
import { extractApiError } from '../utils/extractApiError';

// ─── Personalization tokens ───────────────────────────────────────────────────

const TOKENS = [
  { token: '{{school_name}}', label: 'Название школы', example: 'ГБОУ Школа №57' },
  { token: '{{director_name}}', label: 'Директор', example: 'Иванов Иван Иванович' },
];

const TokenHelper: React.FC<{ onInsert: (token: string) => void }> = ({ onInsert }) => (
  <Paper variant="outlined" sx={{ p: 1.5 }}>
    <Typography variant="caption" color="text.secondary" display="block" mb={1}>
      Токены персонализации — вставляются автоматически при отправке
    </Typography>
    <Stack direction="row" flexWrap="wrap" gap={1}>
      {TOKENS.map(t => (
        <Tooltip key={t.token} title={`Пример: ${t.example}`} arrow>
          <Chip
            label={t.token}
            size="small"
            variant="outlined"
            color="primary"
            onClick={() => onInsert(t.token)}
            icon={<ContentCopyIcon sx={{ fontSize: '14px !important' }} />}
            sx={{ fontFamily: 'monospace', cursor: 'pointer' }}
          />
        </Tooltip>
      ))}
    </Stack>
    <Typography variant="caption" color="text.secondary" display="block" mt={1}>
      Кликните на токен, чтобы вставить его в редактор. При тест-отправке подставляются примеры.
    </Typography>
  </Paper>
);

// ─── Template editor dialog ───────────────────────────────────────────────────

type EditorDialogProps = {
  open: boolean;
  existing: EmailTemplate | null;
  onClose: () => void;
  onSaved: (t: EmailTemplate) => void;
};

const EditorDialog: React.FC<EditorDialogProps> = ({ open, existing, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? '');
      setSubject(existing?.subject ?? '');
      setHtml(existing?.html_body ?? '');
      setError('');
    }
  }, [open, existing]);

  const insertToken = (token: string) => {
    const el = editorRef.current;
    if (!el) {
      setHtml(prev => prev + token);
      return;
    }
    const start = el.selectionStart ?? html.length;
    const end = el.selectionEnd ?? html.length;
    const next = html.slice(0, start) + token + html.slice(end);
    setHtml(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };

  const previewHtml = html
    .replace(/\{\{school_name\}\}/g, '<span style="color:#7c3aed;font-weight:600">ГБОУ Школа №57</span>')
    .replace(/\{\{director_name\}\}/g, '<span style="color:#7c3aed;font-weight:600">Иванов И.И.</span>');

  const handleSave = async () => {
    if (!name.trim() || !subject.trim() || !html.trim()) {
      setError('Заполните все поля');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = existing
        ? await emailTemplatesApi.update(existing.id, { name, subject, html_body: html })
        : await emailTemplatesApi.create({ name, subject, html_body: html });
      onSaved(saved);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xl" PaperProps={{ sx: { height: '90vh' } }}>
      <DialogTitle sx={{ pb: 1 }}>
        {existing ? `Редактировать: ${existing.name}` : 'Новый шаблон'}
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2, overflow: 'hidden' }}>
        {error && <Alert severity="error" sx={{ flexShrink: 0 }}>{error}</Alert>}

        <Stack direction="row" spacing={2} sx={{ flexShrink: 0 }}>
          <TextField
            label="Название шаблона"
            value={name}
            onChange={e => setName(e.target.value)}
            size="small"
            sx={{ flex: 1 }}
          />
          <TextField
            label="Тема письма"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            size="small"
            sx={{ flex: 2 }}
            placeholder="Приглашение к сотрудничеству — {{school_name}}"
          />
        </Stack>

        <Box sx={{ flexShrink: 0 }}>
          <TokenHelper onInsert={insertToken} />
        </Box>

        {/* Split pane */}
        <Box sx={{ flex: 1, display: 'flex', gap: 2, overflow: 'hidden', minHeight: 0 }}>
          {/* Left: editor */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" mb={0.5}>
              HTML-редактор
            </Typography>
            <textarea
              ref={editorRef}
              value={html}
              onChange={e => setHtml(e.target.value)}
              style={{
                flex: 1,
                width: '100%',
                fontFamily: 'monospace',
                fontSize: 13,
                padding: '10px',
                border: '1px solid rgba(0,0,0,0.23)',
                borderRadius: 4,
                resize: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'inherit',
                boxSizing: 'border-box',
              }}
              placeholder={'<p>Уважаемый директор {{director_name}},</p>\n<p>Приглашаем школу {{school_name}} к сотрудничеству...</p>'}
            />
          </Box>

          <Divider orientation="vertical" flexItem />

          {/* Right: preview */}
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" mb={0.5}>
              Предпросмотр <Typography component="span" variant="caption" color="primary">(токены подсвечены)</Typography>
            </Typography>
            <Box
              sx={{
                flex: 1,
                border: '1px solid rgba(0,0,0,0.12)',
                borderRadius: 1,
                overflow: 'auto',
                bgcolor: '#fff',
                color: '#000',
                p: 2,
              }}
            >
              {html ? (
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : (
                <Typography color="text.disabled" variant="body2">
                  Введите HTML слева — здесь будет предпросмотр
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving}>Отмена</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {saving ? <CircularProgress size={18} /> : 'Сохранить шаблон'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Test send dialog ─────────────────────────────────────────────────────────

type TestSendDialogProps = {
  open: boolean;
  template: EmailTemplate | null;
  onClose: () => void;
};

const TestSendDialog: React.FC<TestSendDialogProps> = ({ open, template, onClose }) => {
  const [toEmail, setToEmail] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [directorName, setDirectorName] = useState('');
  const [sending, setSending] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setOk(false); setError(''); }
  }, [open]);

  const handleSend = async () => {
    if (!template || !toEmail.trim()) return;
    setSending(true);
    setError('');
    try {
      await emailTemplatesApi.testSend(template.id, {
        to_email: toEmail.trim(),
        school_name: schoolName.trim() || undefined,
        director_name: directorName.trim() || undefined,
      });
      setOk(true);
    } catch (err: any) {
      setError(extractApiError(err, 'Ошибка отправки'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Тестовая отправка: «{template?.name}»</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {ok && <Alert severity="success">Письмо отправлено! Проверьте почту.</Alert>}

          <TextField
            label="E-mail получателя"
            value={toEmail}
            onChange={e => { setToEmail(e.target.value); setOk(false); }}
            fullWidth
            size="small"
            type="email"
            required
          />

          <Divider>
            <Typography variant="caption" color="text.secondary">
              Данные для подстановки (необязательно)
            </Typography>
          </Divider>

          <TextField
            label="{{school_name}} — название школы"
            value={schoolName}
            onChange={e => setSchoolName(e.target.value)}
            fullWidth
            size="small"
            placeholder="ГБОУ Школа №57"
            helperText="Если не заполнено — подставится пример"
          />
          <TextField
            label="{{director_name}} — директор"
            value={directorName}
            onChange={e => setDirectorName(e.target.value)}
            fullWidth
            size="small"
            placeholder="Иванов Иван Иванович"
            helperText="Если не заполнено — подставится пример"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Закрыть</Button>
        <Button
          onClick={handleSend}
          variant="contained"
          disabled={!toEmail.trim() || sending}
          startIcon={sending ? <CircularProgress size={16} /> : <SendIcon />}
        >
          Отправить тест
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── TemplatesSubTab ──────────────────────────────────────────────────────────

const fmt = (dt: string | null) =>
  dt ? new Date(dt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const TemplatesSubTab: React.FC = () => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmailTemplate | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testTarget, setTestTarget] = useState<EmailTemplate | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTemplates(await emailTemplatesApi.list());
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить шаблоны'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const upsert = (t: EmailTemplate) =>
    setTemplates(prev => {
      const idx = prev.findIndex(x => x.id === t.id);
      return idx >= 0 ? prev.map(x => x.id === t.id ? t : x) : [t, ...prev];
    });

  const handleDelete = async (t: EmailTemplate) => {
    if (!window.confirm(`Удалить шаблон «${t.name}»?`)) return;
    setDeleting(t.id);
    try {
      await emailTemplatesApi.delete(t.id);
      setTemplates(prev => prev.filter(x => x.id !== t.id));
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось удалить'));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Шаблоны писем</Typography>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Обновить">
            <IconButton onClick={load} disabled={loading} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            size="small"
            onClick={() => { setEditTarget(null); setEditorOpen(true); }}
          >
            Новый шаблон
          </Button>
        </Stack>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Персонализация — справка */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'action.hover' }}>
        <Typography variant="subtitle2" gutterBottom>Как правильно делать персонализированные письма</Typography>
        <Typography variant="body2" color="text.secondary" component="div">
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>В HTML-шаблоне используйте токены: <code style={{ background: 'rgba(124,58,237,0.1)', padding: '1px 4px', borderRadius: 3 }}>{'{{school_name}}'}</code> и <code style={{ background: 'rgba(124,58,237,0.1)', padding: '1px 4px', borderRadius: 3 }}>{'{{director_name}}'}</code></li>
            <li>При отправке кампании каждая школа получит письмо со своими данными из базы</li>
            <li>Обращайтесь к директору по имени в начале: <em>«Уважаемый {'{{director_name}}'}»</em></li>
            <li>Упоминайте название школы — это повышает открываемость и отклик</li>
            <li>Отправьте тест себе перед рассылкой — укажите реальные данные школы для проверки</li>
          </ol>
        </Typography>
      </Paper>

      {loading && templates.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>
      ) : templates.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">Нет шаблонов. Создайте первый!</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Название</TableCell>
                <TableCell>Тема письма</TableCell>
                <TableCell>Автор</TableCell>
                <TableCell>Изменён</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map(t => (
                <TableRow key={t.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>{t.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 280 }}>
                      {t.subject}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">{t.created_by_name ?? '—'}</Typography>
                  </TableCell>
                  <TableCell>{fmt(t.updated_at)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="Тестовая отправка">
                        <IconButton size="small" color="info" onClick={() => { setTestTarget(t); setTestOpen(true); }}>
                          <SendIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Редактировать">
                        <IconButton size="small" onClick={() => { setEditTarget(t); setEditorOpen(true); }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Удалить">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(t)}
                          disabled={deleting === t.id}
                        >
                          {deleting === t.id ? <CircularProgress size={16} /> : <DeleteOutlineIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <EditorDialog
        open={editorOpen}
        existing={editTarget}
        onClose={() => { setEditorOpen(false); setEditTarget(null); }}
        onSaved={t => { upsert(t); setEditorOpen(false); setEditTarget(null); }}
      />
      <TestSendDialog
        open={testOpen}
        template={testTarget}
        onClose={() => { setTestOpen(false); setTestTarget(null); }}
      />
    </Box>
  );
};

export default TemplatesSubTab;
