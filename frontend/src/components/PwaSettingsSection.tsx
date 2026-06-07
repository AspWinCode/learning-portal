import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { settingsApi } from '../services/api';
import { PwaModule, PwaRoleKey, PwaRoleSettings } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { getEffectiveRole } from '../utils/permissions';
import { extractApiError } from '../utils/extractApiError';

const ROLE_LABELS: Record<PwaRoleKey, string> = {
  owner: 'Owner',
  admin: 'Admin',
  sales: 'Sales',
  trainer: 'Trainer',
  parent: 'Parent',
  guest: 'Guest',
};

const ROLE_ORDER: PwaRoleKey[] = ['owner', 'admin', 'sales', 'trainer', 'parent', 'guest'];

const hasModule = (modules: string[] | undefined, key: string) => (modules || []).includes(key);

const toggleModule = (modules: string[] | undefined, key: string) => {
  const current = modules || [];
  return current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
};

const PwaSettingsSection: React.FC = () => {
  const { user } = useAuth();
  const effectiveRole = getEffectiveRole(user);
  const [settings, setSettings] = React.useState<PwaRoleSettings | null>(null);
  const [roleModulesDraft, setRoleModulesDraft] = React.useState<PwaRoleSettings['role_modules'] | null>(null);
  const [ownerEnabledDraft, setOwnerEnabledDraft] = React.useState<string[] | null>(null);
  const [ownerAvailableModules, setOwnerAvailableModules] = React.useState<PwaModule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingRoles, setSavingRoles] = React.useState(false);
  const [savingOwner, setSavingOwner] = React.useState(false);
  const [error, setError] = React.useState('');
  const [savedMessage, setSavedMessage] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [roleSettings, mySettings] = await Promise.all([
        settingsApi.getPwaRoleSettings(),
        settingsApi.getMyPwaSettings(),
      ]);
      setSettings(roleSettings);
      setRoleModulesDraft(roleSettings.role_modules);
      setOwnerAvailableModules(mySettings.modules);
      setOwnerEnabledDraft(mySettings.enabled_modules);
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось загрузить настройки PWA'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const moduleByKey = React.useMemo(() => {
    const map = new Map<string, PwaModule>();
    (settings?.modules || []).forEach((module) => map.set(module.key, module));
    return map;
  }, [settings]);

  const saveRoleSettings = async () => {
    if (!roleModulesDraft) return;
    setSavingRoles(true);
    setError('');
    setSavedMessage('');
    try {
      const saved = await settingsApi.setPwaRoleSettings({ role_modules: roleModulesDraft });
      setSettings(saved);
      setRoleModulesDraft(saved.role_modules);
      setSavedMessage('PWA-доступ по ролям сохранен.');
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить PWA-доступ по ролям'));
    } finally {
      setSavingRoles(false);
    }
  };

  const saveOwnerSettings = async () => {
    if (!ownerEnabledDraft) return;
    setSavingOwner(true);
    setError('');
    setSavedMessage('');
    try {
      const saved = await settingsApi.setMyPwaSettings(ownerEnabledDraft);
      setOwnerEnabledDraft(saved.enabled_modules);
      setOwnerAvailableModules(saved.modules);
      setSavedMessage('Личные PWA-настройки owner сохранены.');
    } catch (err: any) {
      setError(extractApiError(err, 'Не удалось сохранить личные PWA-настройки'));
    } finally {
      setSavingOwner(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!settings || !roleModulesDraft) {
    return <Alert severity="error">{error || 'Настройки PWA недоступны.'}</Alert>;
  }

  return (
    <Stack spacing={2}>
      {error ? <Alert severity="error" onClose={() => setError('')}>{error}</Alert> : null}
      {savedMessage ? <Alert severity="success" onClose={() => setSavedMessage('')}>{savedMessage}</Alert> : null}

      <Box>
        <Typography variant="h6">PWA-доступ по ролям</Typography>
        <Typography variant="body2" color="text.secondary">
          Эти переключатели управляют только тем, что видно в PWA. Обычные права портала не изменяются.
        </Typography>
      </Box>

      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 240 }}>Модуль</TableCell>
              {ROLE_ORDER.map((role) => (
                <TableCell key={role} align="center" sx={{ minWidth: 110 }}>
                  {ROLE_LABELS[role]}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {settings.modules.map((module) => (
              <TableRow key={module.key}>
                <TableCell>
                  <Typography variant="body2" fontWeight={700}>{module.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{module.description}</Typography>
                  {module.required_permission ? (
                    <Box sx={{ mt: 0.5 }}>
                      <Chip size="small" label={module.required_permission} />
                    </Box>
                  ) : null}
                </TableCell>
                {ROLE_ORDER.map((role) => (
                  <TableCell key={role} align="center">
                    <Switch
                      checked={hasModule(roleModulesDraft[role], module.key)}
                      onChange={() =>
                        setRoleModulesDraft((prev) => ({
                          ...prev!,
                          [role]: toggleModule(prev![role], module.key),
                        }))
                      }
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      <Box>
        <Button variant="contained" onClick={saveRoleSettings} disabled={savingRoles}>
          {savingRoles ? 'Сохранение...' : 'Сохранить PWA-доступ по ролям'}
        </Button>
      </Box>

      {effectiveRole === 'owner' && ownerEnabledDraft ? (
        <>
          <Divider />
          <Box>
            <Typography variant="h6">Мой PWA owner</Typography>
            <Typography variant="body2" color="text.secondary">
              Здесь owner может включить или скрыть модули в своем PWA в пределах доступных системных прав.
            </Typography>
          </Box>
          <Stack spacing={1}>
            {ownerAvailableModules.map((module) => (
              <FormControlLabel
                key={module.key}
                control={
                  <Switch
                    checked={hasModule(ownerEnabledDraft, module.key)}
                    onChange={() => setOwnerEnabledDraft((prev) => toggleModule(prev || [], module.key))}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" fontWeight={700}>
                      {moduleByKey.get(module.key)?.label || module.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {moduleByKey.get(module.key)?.description || module.description}
                    </Typography>
                  </Box>
                }
              />
            ))}
          </Stack>
          <Box>
            <Button variant="outlined" onClick={saveOwnerSettings} disabled={savingOwner}>
              {savingOwner ? 'Сохранение...' : 'Сохранить мой PWA'}
            </Button>
          </Box>
        </>
      ) : null}
    </Stack>
  );
};

export default PwaSettingsSection;
