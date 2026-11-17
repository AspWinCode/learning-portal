import React from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Collapse, Stack, Typography } from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import LinkOffIcon from '@mui/icons-material/LinkOff';

import { ownerWorkspaceApi } from '../../services/api';
import type { GoogleContactsSyncStatus } from '../../types';
import { extractApiError } from '../../utils/extractApiError';

type GoogleContactsSyncPanelProps = {
  isFullAccess: boolean;
};

export const GoogleContactsSyncPanel: React.FC<GoogleContactsSyncPanelProps> = ({ isFullAccess }) => {
  const [status, setStatus] = React.useState<GoogleContactsSyncStatus | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ownerWorkspaceApi.getGoogleContactsSyncStatus();
      setStatus(data);
    } catch (e) {
      setError(extractApiError(e, 'Не удалось выполнить операцию'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!isFullAccess) return;
    void load();
    const params = new URLSearchParams(window.location.search);
    const result = params.get('google_sync');
    if (result === 'connected') {
      setNotice('Google-аккаунт подключён, синхронизация запустится в течение 15 минут.');
    } else if (result === 'error') {
      setError('Не удалось подключить Google-аккаунт. Попробуйте ещё раз.');
    }
    if (result) {
      params.delete('google_sync');
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', next);
    }
  }, [isFullAccess, load]);

  if (!isFullAccess) return null;

  const handleConnect = async () => {
    setError(null);
    try {
      const { auth_url } = await ownerWorkspaceApi.connectGoogleContactsSync();
      window.location.href = auth_url;
    } catch (e) {
      setError(extractApiError(e, 'Не удалось выполнить операцию'));
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setError(null);
    try {
      await ownerWorkspaceApi.disconnectGoogleContactsSync();
      await load();
    } catch (e) {
      setError(extractApiError(e, 'Не удалось выполнить операцию'));
    } finally {
      setLoading(false);
    }
  };

  const handleRunNow = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ownerWorkspaceApi.runGoogleContactsSync();
      setStatus(data);
    } catch (e) {
      setError(extractApiError(e, 'Не удалось выполнить операцию'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
      <Collapse in={!!notice}>
        <Alert severity="success" onClose={() => setNotice(null)} sx={{ mb: 1 }}>
          {notice}
        </Alert>
      </Collapse>
      <Collapse in={!!error}>
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
          {error}
        </Alert>
      </Collapse>
      {status?.last_sync_error && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          Последняя синхронизация с Google завершилась ошибкой: {status.last_sync_error}
        </Alert>
      )}
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
        <Typography variant="body2" color="text.secondary">
          Google Контакты ({status?.group_name ? `группа «${status.group_name}»` : 'все контакты'}):
        </Typography>
        {loading && !status ? (
          <CircularProgress size={16} />
        ) : status?.connected ? (
          <Chip size="small" color="success" label="Подключено" />
        ) : (
          <Chip size="small" color="default" label="Не подключено" />
        )}
        {status?.connected && status?.last_sync_at && (
          <Typography variant="caption" color="text.secondary">
            последняя синхронизация: {new Date(status.last_sync_at).toLocaleString('ru-RU')}
          </Typography>
        )}
        {!status?.configured && (
          <Typography variant="caption" color="text.secondary">
            не настроено на сервере (GOOGLE_CONTACTS_CLIENT_ID)
          </Typography>
        )}
        {status?.connected ? (
          <>
            <Button size="small" startIcon={<SyncIcon />} onClick={handleRunNow} disabled={loading}>
              Синхронизировать сейчас
            </Button>
            <Button size="small" color="inherit" startIcon={<LinkOffIcon />} onClick={handleDisconnect} disabled={loading}>
              Отключить
            </Button>
          </>
        ) : (
          <Button size="small" variant="outlined" onClick={handleConnect} disabled={loading || !status?.configured}>
            Подключить Google-аккаунт
          </Button>
        )}
      </Stack>
    </Box>
  );
};

export default GoogleContactsSyncPanel;
