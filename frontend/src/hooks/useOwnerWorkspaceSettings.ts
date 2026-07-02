/**
 * Self-contained hook for Owner Workspace settings state & handlers.
 * Used by both OwnerWorkspacePage (legacy) and OwnerWorkspaceSettingsPage.
 */
import { useCallback, useEffect, useState } from 'react';
import { legacyOwnerWorkspaceApi, ownerWorkspaceApi, settingsApi } from '../services/api';
import type {
  OwnerWorkspaceNotificationConfig,
  OwnerWorkspaceNotificationDeliveryStats,
  OwnerWorkspaceProjectConfig,
  OwnerWorkspaceTagDictionary,
  OwnerWorkspaceTaskConfig,
  OwnerWorkspacePermissionPolicy,
  OwnerWorkspaceSettingsBundle,
  OwnerWorkspaceSettingsBundleEnvelope,
  OwnerWorkspaceSettingsSnapshot,
  OwnerWorkspaceWebPushStatus,
} from '../types';
import { extractApiError } from '../utils/extractApiError';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(normalized);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return window.btoa(binary);
}

const DEFAULT_OWNER_WS_PERMISSION_POLICY: OwnerWorkspacePermissionPolicy = {
  manager_can_manage_team: true,
  manager_can_change_roles: false,
  manager_can_assign_manager: false,
  manager_can_assign_observer: false,
  manager_can_remove_manager: false,
  manager_can_edit_project_meta: false,
  manager_can_archive_project: false,
  limited_can_create_projects: false,
  limited_can_create_contacts: false,
  limited_can_create_tasks: false,
  limited_can_edit_contacts: false,
  limited_can_edit_tasks: false,
  limited_can_manage_project_contacts: false,
  limited_can_complete_tasks: false,
  limited_can_bulk_update_tasks: false,
  limited_can_link_messages: false,
  limited_can_send_messages: false,
  limited_can_comment_tasks: false,
};

export function useOwnerWorkspaceSettings() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // ── Task view preferences ─────────────────────────────────────────────────
  const [taskViewMode, setTaskViewMode] = useState<'list' | 'kanban' | 'calendar' | 'gantt'>('list');
  const [taskListRowsPerPage, setTaskListRowsPerPage] = useState(25);
  const [digestDueHours, setDigestDueHours] = useState(48);
  const [digestScope, setDigestScope] = useState<'all' | 'mine'>('all');

  // ── Notification preferences ──────────────────────────────────────────────
  const [notifyEmailEnabled, setNotifyEmailEnabled] = useState(false);
  const [notifyWebPushEnabled, setNotifyWebPushEnabled] = useState(false);
  const [notifyTaskOverdue, setNotifyTaskOverdue] = useState(true);
  const [notifyTaskDueSoon, setNotifyTaskDueSoon] = useState(true);
  const [notifyTaskAssigned, setNotifyTaskAssigned] = useState(true);
  const [notifyTaskComment, setNotifyTaskComment] = useState(true);
  const [notifyTaskUpdated, setNotifyTaskUpdated] = useState(false);
  const [notifyContactIncomingMessage, setNotifyContactIncomingMessage] = useState(true);
  const [notifyTaskMention, setNotifyTaskMention] = useState(true);
  const [webPushStatus, setWebPushStatus] = useState<OwnerWorkspaceWebPushStatus | null>(null);
  const [webPushBrowserSupported, setWebPushBrowserSupported] = useState(false);
  const [webPushPermission, setWebPushPermission] = useState<string>('default');
  const [webPushConnected, setWebPushConnected] = useState(false);
  const [webPushBusy, setWebPushBusy] = useState(false);
  const [notificationLabels] = useState<Record<string, string>>({});
  const [notificationConfigMap] = useState<Record<string, { enabled: boolean; label: string }>>({});

  // ── Admin configs ─────────────────────────────────────────────────────────
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [taskConfig, setTaskConfig] = useState<OwnerWorkspaceTaskConfig | null>(null);
  const [taskConfigDraft, setTaskConfigDraft] = useState<OwnerWorkspaceTaskConfig | null>(null);
  const [taskConfigSaving, setTaskConfigSaving] = useState(false);
  const [projectConfig, setProjectConfig] = useState<OwnerWorkspaceProjectConfig | null>(null);
  const [projectConfigDraft, setProjectConfigDraft] = useState<OwnerWorkspaceProjectConfig | null>(null);
  const [projectConfigSaving, setProjectConfigSaving] = useState(false);
  const [notificationConfig, setNotificationConfig] = useState<OwnerWorkspaceNotificationConfig | null>(null);
  const [notificationConfigDraft, setNotificationConfigDraft] = useState<OwnerWorkspaceNotificationConfig | null>(null);
  const [notificationConfigSaving, setNotificationConfigSaving] = useState(false);
  const [notificationDeliveryStats, setNotificationDeliveryStats] = useState<OwnerWorkspaceNotificationDeliveryStats | null>(null);
  const [notificationDeliveryStatsLoading, setNotificationDeliveryStatsLoading] = useState(false);
  const [notificationDeliveryRetrying] = useState<number | 'all' | null>(null);
  const [permissionPolicy, setPermissionPolicy] = useState<OwnerWorkspacePermissionPolicy>(DEFAULT_OWNER_WS_PERMISSION_POLICY);
  const [permissionPolicyDraft, setPermissionPolicyDraft] = useState<OwnerWorkspacePermissionPolicy>(DEFAULT_OWNER_WS_PERMISSION_POLICY);

  // ── Tag dictionaries ──────────────────────────────────────────────────────
  const [taskTagDictionary, setTaskTagDictionary] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [taskTagDictionaryDraft, setTaskTagDictionaryDraft] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [taskTagDictionarySaving, setTaskTagDictionarySaving] = useState(false);
  const [contactTagDictionary, setContactTagDictionary] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [contactTagDictionaryDraft, setContactTagDictionaryDraft] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [contactTagDictionarySaving, setContactTagDictionarySaving] = useState(false);
  const [contactSourceDictionary, setContactSourceDictionary] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [contactSourceDictionaryDraft, setContactSourceDictionaryDraft] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [contactSourceDictionarySaving, setContactSourceDictionarySaving] = useState(false);
  const [counterpartyRoleDictionary, setCounterpartyRoleDictionary] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [counterpartyRoleDictionaryDraft, setCounterpartyRoleDictionaryDraft] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [counterpartyRoleDictionarySaving, setCounterpartyRoleDictionarySaving] = useState(false);
  const [counterpartyIndustryDictionary, setCounterpartyIndustryDictionary] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [counterpartyIndustryDictionaryDraft, setCounterpartyIndustryDictionaryDraft] = useState<OwnerWorkspaceTagDictionary>({ items: [] });
  const [counterpartyIndustryDictionarySaving, setCounterpartyIndustryDictionarySaving] = useState(false);

  // ── Snapshots ─────────────────────────────────────────────────────────────
  const [settingsBundleDialogOpen, setSettingsBundleDialogOpen] = useState(false);
  const [settingsBundleImportText, setSettingsBundleImportText] = useState('');
  const [settingsBundleImporting, setSettingsBundleImporting] = useState(false);
  const [settingsBundleLastExportMeta, setSettingsBundleLastExportMeta] = useState<OwnerWorkspaceSettingsBundleEnvelope['meta'] | null>(null);
  const [settingsSnapshots, setSettingsSnapshots] = useState<OwnerWorkspaceSettingsSnapshot[]>([]);
  const [settingsSnapshotSearch, setSettingsSnapshotSearch] = useState('');
  const [settingsSnapshotSort, setSettingsSnapshotSort] = useState<'name' | 'created_at' | 'updated_at'>('created_at');
  const [settingsSnapshotOnlyChanged, setSettingsSnapshotOnlyChanged] = useState(false);
  const [settingsSnapshotsLoading, setSettingsSnapshotsLoading] = useState(false);
  const [settingsSnapshotDiffMap, setSettingsSnapshotDiffMap] = useState<Record<string, string>>({});
  const [settingsSnapshotDuplicatingId, setSettingsSnapshotDuplicatingId] = useState<string | null>(null);
  const [settingsSnapshotApplyingId, setSettingsSnapshotApplyingId] = useState<string | null>(null);
  const [settingsSnapshotDeletingId, setSettingsSnapshotDeletingId] = useState<string | null>(null);
  const [settingsSnapshotEditingId, setSettingsSnapshotEditingId] = useState<string | null>(null);
  const [settingsSnapshotDeleteConfirm, setSettingsSnapshotDeleteConfirm] = useState<OwnerWorkspaceSettingsSnapshot | null>(null);
  const [settingsSnapshotReview, setSettingsSnapshotReview] = useState<OwnerWorkspaceSettingsSnapshot | null>(null);
  const [settingsSnapshotCompareBaseId, setSettingsSnapshotCompareBaseId] = useState<number | null>(null);
  const [settingsSnapshotCreateSafetyBeforeApply, setSettingsSnapshotCreateSafetyBeforeApply] = useState(true);
  const [workspaceSettingsBundle, setWorkspaceSettingsBundle] = useState<OwnerWorkspaceSettingsBundle | null>(null);

  // ── Apply bundle ──────────────────────────────────────────────────────────
  const applyWorkspaceSettingsBundle = useCallback((bundle: OwnerWorkspaceSettingsBundle) => {
    setTaskConfig(bundle.task_config);
    setTaskConfigDraft(bundle.task_config);
    setProjectConfig(bundle.project_config);
    setProjectConfigDraft(bundle.project_config);
    setNotificationConfig(bundle.notification_config);
    setNotificationConfigDraft(bundle.notification_config);
    setTaskTagDictionary(bundle.task_tags);
    setTaskTagDictionaryDraft(bundle.task_tags);
    setContactTagDictionary(bundle.contact_tags);
    setContactTagDictionaryDraft(bundle.contact_tags);
    setContactSourceDictionary(bundle.contact_sources);
    setContactSourceDictionaryDraft(bundle.contact_sources);
    if (bundle.counterparty_roles) {
      setCounterpartyRoleDictionary(bundle.counterparty_roles);
      setCounterpartyRoleDictionaryDraft(bundle.counterparty_roles);
    }
    if (bundle.counterparty_industries) {
      setCounterpartyIndustryDictionary(bundle.counterparty_industries);
      setCounterpartyIndustryDictionaryDraft(bundle.counterparty_industries);
    }
    setPermissionPolicy(bundle.permission_policy);
    setPermissionPolicyDraft(bundle.permission_policy);
  }, []);

  // ── Load all settings ─────────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cfg, projectCfg, permissionCfg, notificationCfg,
        taskTagsCfg, contactTagsCfg, contactSourcesCfg,
        cpRolesCfg, cpIndustriesCfg, prefs] = await Promise.all([
        settingsApi.getOwnerWorkspaceTaskConfig(),
        settingsApi.getOwnerWorkspaceProjectConfig(),
        settingsApi.getOwnerWorkspacePermissionPolicy(),
        settingsApi.getOwnerWorkspaceNotificationConfig(),
        settingsApi.getOwnerWorkspaceTaskTags(),
        settingsApi.getOwnerWorkspaceContactTags(),
        settingsApi.getOwnerWorkspaceContactSources(),
        settingsApi.getOwnerWorkspaceCounterpartyRoles(),
        settingsApi.getOwnerWorkspaceCounterpartyIndustries(),
        legacyOwnerWorkspaceApi.getMyPreferences().catch(() => null),
      ]);
      if (prefs) {
        setTaskViewMode(prefs.default_task_view);
        setTaskListRowsPerPage(prefs.task_list_rows_per_page);
        setDigestDueHours(prefs.digest_due_within_hours);
        setDigestScope(prefs.digest_scope);
        setNotifyEmailEnabled(prefs.notify_email_enabled);
        setNotifyWebPushEnabled(prefs.notify_web_push_enabled);
        setNotifyTaskOverdue(prefs.notify_task_overdue);
        setNotifyTaskDueSoon(prefs.notify_task_due_soon);
        setNotifyTaskAssigned(prefs.notify_task_assigned);
        setNotifyTaskComment(prefs.notify_task_comment);
        setNotifyTaskUpdated(prefs.notify_task_updated);
        setNotifyContactIncomingMessage(prefs.notify_contact_incoming_message);
        setNotifyTaskMention(prefs.notify_task_mention);
      }
      applyWorkspaceSettingsBundle({
        task_config: cfg,
        project_config: projectCfg,
        permission_policy: permissionCfg,
        notification_config: notificationCfg,
        task_tags: taskTagsCfg,
        contact_tags: contactTagsCfg,
        contact_sources: contactSourcesCfg,
        counterparty_roles: cpRolesCfg,
        counterparty_industries: cpIndustriesCfg,
      });
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось загрузить настройки'));
    } finally {
      setLoading(false);
    }
  }, [applyWorkspaceSettingsBundle]);

  const loadSettingsSnapshots = useCallback(async () => {
    setSettingsSnapshotsLoading(true);
    try {
      const items = await settingsApi.getOwnerWorkspaceSettingsSnapshots();
      setSettingsSnapshots(items);
    } catch { /* ignore */ }
    finally { setSettingsSnapshotsLoading(false); }
  }, []);

  useEffect(() => { void loadSettings(); void loadSettingsSnapshots(); }, [loadSettings, loadSettingsSnapshots]);

  // ── Web push ───────────────────────────────────────────────────────────────
  const refreshWebPushState = useCallback(async () => {
    const supported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      typeof Notification !== 'undefined';
    setWebPushBrowserSupported(supported);
    setWebPushPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default');
    try {
      const status = await ownerWorkspaceApi.getMyWebPushStatus();
      setWebPushStatus(status);
    } catch {
      setWebPushStatus(null);
    }
    if (!supported) {
      setWebPushConnected(false);
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.getSubscription();
      setWebPushConnected(Boolean(subscription));
    } catch {
      setWebPushConnected(false);
    }
  }, []);

  useEffect(() => { void refreshWebPushState(); }, [refreshWebPushState]);

  const connectWebPush = useCallback(async () => {
    if (webPushBusy) return;
    if (!webPushStatus?.configured || !webPushStatus.public_key) {
      setError('Web push не настроен на сервере: отсутствует публичный VAPID ключ.');
      return;
    }
    if (!webPushBrowserSupported || typeof Notification === 'undefined') {
      setError('Этот браузер не поддерживает web push.');
      return;
    }
    setWebPushBusy(true);
    try {
      let permission = Notification.permission;
      if (permission !== 'granted') {
        permission = await Notification.requestPermission();
      }
      setWebPushPermission(permission);
      if (permission !== 'granted') {
        setError('Браузер не выдал разрешение на push-уведомления.');
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(webPushStatus.public_key),
        });
      }
      await ownerWorkspaceApi.upsertMyWebPushSubscription({
        endpoint: subscription.endpoint,
        p256dh: arrayBufferToBase64(subscription.getKey('p256dh')),
        auth: arrayBufferToBase64(subscription.getKey('auth')),
        user_agent: navigator.userAgent,
      });
      setError('');
      await refreshWebPushState();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось подключить web push.'));
    } finally {
      setWebPushBusy(false);
    }
  }, [refreshWebPushState, webPushBrowserSupported, webPushBusy, webPushStatus]);

  const disconnectWebPush = useCallback(async () => {
    if (webPushBusy || !webPushBrowserSupported) return;
    setWebPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint || '';
      if (subscription) {
        await subscription.unsubscribe();
      }
      if (endpoint) {
        await ownerWorkspaceApi.removeMyWebPushSubscription(endpoint);
      }
      setError('');
      await refreshWebPushState();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Не удалось отключить web push.'));
    } finally {
      setWebPushBusy(false);
    }
  }, [refreshWebPushState, webPushBrowserSupported, webPushBusy]);

  // ── Notification delivery stats ───────────────────────────────────────────
  const loadNotificationDeliveryStats = useCallback(async () => {
    setNotificationDeliveryStatsLoading(true);
    try {
      const stats = await settingsApi.getOwnerWorkspaceNotificationDeliveryStats();
      setNotificationDeliveryStats(stats);
    } catch { /* ignore */ }
    finally { setNotificationDeliveryStatsLoading(false); }
  }, []);

  // ── Save handlers ─────────────────────────────────────────────────────────
  const saveWorkspaceSettings = useCallback(async () => {
    setSettingsSaving(true);
    try {
      await legacyOwnerWorkspaceApi.patchMyPreferences({
        default_task_view: taskViewMode,
        task_list_rows_per_page: taskListRowsPerPage,
        digest_due_within_hours: digestDueHours,
        digest_scope: digestScope,
        notify_email_enabled: notifyEmailEnabled,
        notify_web_push_enabled: notifyWebPushEnabled,
        notify_task_overdue: notifyTaskOverdue,
        notify_task_due_soon: notifyTaskDueSoon,
        notify_task_assigned: notifyTaskAssigned,
        notify_task_comment: notifyTaskComment,
        notify_task_updated: notifyTaskUpdated,
        notify_contact_incoming_message: notifyContactIncomingMessage,
        notify_task_mention: notifyTaskMention,
      });
    } catch { /* ignore */ }
    finally { setSettingsSaving(false); }
  }, [taskViewMode, taskListRowsPerPage, digestDueHours, digestScope,
    notifyEmailEnabled, notifyWebPushEnabled, notifyTaskOverdue, notifyTaskDueSoon,
    notifyTaskAssigned, notifyTaskComment, notifyTaskUpdated, notifyContactIncomingMessage, notifyTaskMention]);

  const saveWorkspaceTaskConfig = useCallback(async () => {
    if (!taskConfigDraft) return;
    setTaskConfigSaving(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceTaskConfig(taskConfigDraft);
      setTaskConfig(saved);
      setTaskConfigDraft(saved);
    } catch (e: unknown) { setError(extractApiError(e, 'Не удалось сохранить')); }
    finally { setTaskConfigSaving(false); }
  }, [taskConfigDraft]);

  const saveWorkspaceProjectConfig = useCallback(async () => {
    if (!projectConfigDraft) return;
    setProjectConfigSaving(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceProjectConfig(projectConfigDraft);
      setProjectConfig(saved);
      setProjectConfigDraft(saved);
    } catch (e: unknown) { setError(extractApiError(e, 'Не удалось сохранить')); }
    finally { setProjectConfigSaving(false); }
  }, [projectConfigDraft]);

  const saveWorkspacePermissionPolicy = useCallback(async () => {
    // permission policy is handled inline
  }, []);

  const saveWorkspaceNotificationConfig = useCallback(async () => {
    if (!notificationConfigDraft) return;
    setNotificationConfigSaving(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceNotificationConfig(notificationConfigDraft);
      setNotificationConfig(saved);
      setNotificationConfigDraft(saved);
    } catch (e: unknown) { setError(extractApiError(e, 'Не удалось сохранить')); }
    finally { setNotificationConfigSaving(false); }
  }, [notificationConfigDraft]);

  const saveWorkspaceTaskTagDictionary = useCallback(async () => {
    setTaskTagDictionarySaving(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceTaskTags(taskTagDictionaryDraft);
      setTaskTagDictionary(saved);
      setTaskTagDictionaryDraft(saved);
    } catch (e: unknown) { setError(extractApiError(e, 'Не удалось сохранить')); }
    finally { setTaskTagDictionarySaving(false); }
  }, [taskTagDictionaryDraft]);

  const saveWorkspaceContactTagDictionary = useCallback(async () => {
    setContactTagDictionarySaving(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceContactTags(contactTagDictionaryDraft);
      setContactTagDictionary(saved);
      setContactTagDictionaryDraft(saved);
    } catch (e: unknown) { setError(extractApiError(e, 'Не удалось сохранить')); }
    finally { setContactTagDictionarySaving(false); }
  }, [contactTagDictionaryDraft]);

  const saveWorkspaceContactSourceDictionary = useCallback(async () => {
    setContactSourceDictionarySaving(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceContactSources(contactSourceDictionaryDraft);
      setContactSourceDictionary(saved);
      setContactSourceDictionaryDraft(saved);
    } catch (e: unknown) { setError(extractApiError(e, 'Не удалось сохранить')); }
    finally { setContactSourceDictionarySaving(false); }
  }, [contactSourceDictionaryDraft]);

  const saveCounterpartyRoleDictionary = useCallback(async () => {
    setCounterpartyRoleDictionarySaving(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceCounterpartyRoles(counterpartyRoleDictionaryDraft);
      setCounterpartyRoleDictionary(saved);
      setCounterpartyRoleDictionaryDraft(saved);
    } catch (e: unknown) { setError(extractApiError(e, 'Не удалось сохранить')); }
    finally { setCounterpartyRoleDictionarySaving(false); }
  }, [counterpartyRoleDictionaryDraft]);

  const saveCounterpartyIndustryDictionary = useCallback(async () => {
    setCounterpartyIndustryDictionarySaving(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceCounterpartyIndustries(counterpartyIndustryDictionaryDraft);
      setCounterpartyIndustryDictionary(saved);
      setCounterpartyIndustryDictionaryDraft(saved);
    } catch (e: unknown) { setError(extractApiError(e, 'Не удалось сохранить')); }
    finally { setCounterpartyIndustryDictionarySaving(false); }
  }, [counterpartyIndustryDictionaryDraft]);

  // ── Bundle import/export ──────────────────────────────────────────────────
  const parsedSettingsBundleInput = (() => {
    try { return settingsBundleImportText.trim() ? JSON.parse(settingsBundleImportText) as OwnerWorkspaceSettingsBundleEnvelope : null; }
    catch { return null; }
  })();

  const exportWorkspaceSettingsBundle = useCallback(() => {
    if (!workspaceSettingsBundle) return;
    const blob = new Blob([JSON.stringify(workspaceSettingsBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ow_settings_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [workspaceSettingsBundle]);

  const copyWorkspaceSettingsBundle = useCallback(async () => {
    if (!workspaceSettingsBundle) return;
    await navigator.clipboard.writeText(JSON.stringify(workspaceSettingsBundle, null, 2));
  }, [workspaceSettingsBundle]);

  const importWorkspaceSettingsBundle = useCallback(async () => {
    if (!parsedSettingsBundleInput) return;
    setSettingsBundleImporting(true);
    try {
      const saved = await settingsApi.setOwnerWorkspaceSettingsBundle(parsedSettingsBundleInput);
      applyWorkspaceSettingsBundle(saved.data);
      setSettingsBundleDialogOpen(false);
    } catch (e: unknown) { setError(extractApiError(e, 'Не удалось импортировать')); }
    finally { setSettingsBundleImporting(false); }
  }, [parsedSettingsBundleInput, applyWorkspaceSettingsBundle]);

  // ── Snapshot handlers ─────────────────────────────────────────────────────
  const createSettingsSnapshot = useCallback(async () => {
    try {
      await settingsApi.createOwnerWorkspaceSettingsSnapshot({ name: `Снимок ${new Date().toLocaleString('ru-RU')}`, note: '' });
      await loadSettingsSnapshots();
    } catch { /* ignore */ }
  }, [loadSettingsSnapshots]);

  const applySettingsSnapshot = useCallback(async (snapshot: OwnerWorkspaceSettingsSnapshot) => {
    setSettingsSnapshotApplyingId(snapshot.id);
    try {
      const saved = await settingsApi.applyOwnerWorkspaceSettingsSnapshot(snapshot.id);
      applyWorkspaceSettingsBundle(saved.data);
    } catch { /* ignore */ }
    finally { setSettingsSnapshotApplyingId(null); }
  }, [applyWorkspaceSettingsBundle]);

  const deleteSettingsSnapshot = useCallback(async (snapshot: OwnerWorkspaceSettingsSnapshot) => {
    setSettingsSnapshotDeletingId(snapshot.id);
    try {
      const items = await settingsApi.deleteOwnerWorkspaceSettingsSnapshot(snapshot.id);
      setSettingsSnapshots(items);
    } catch { /* ignore */ }
    finally { setSettingsSnapshotDeletingId(null); }
  }, []);

  const duplicateSettingsSnapshot = useCallback(async (snapshot: OwnerWorkspaceSettingsSnapshot) => {
    setSettingsSnapshotDuplicatingId(snapshot.id);
    try {
      await settingsApi.duplicateOwnerWorkspaceSettingsSnapshot(snapshot.id);
      await loadSettingsSnapshots();
    } catch { /* ignore */ }
    finally { setSettingsSnapshotDuplicatingId(null); }
  }, [loadSettingsSnapshots]);

  const summarizeWorkspaceSettingsBundle = useCallback((bundle: OwnerWorkspaceSettingsBundle) => {
    return {
      task_statuses: bundle.task_config?.statuses?.length ?? 0,
      task_priorities: bundle.task_config?.priorities?.length ?? 0,
      project_statuses: bundle.project_config?.statuses?.length ?? 0,
      notification_types: bundle.notification_config?.items?.length ?? 0,
      task_tags: bundle.task_tags?.items?.length ?? 0,
      contact_tags: bundle.contact_tags?.items?.length ?? 0,
      contact_sources: bundle.contact_sources?.items?.length ?? 0,
    };
  }, []);

  const permissionMatrixRows = [] as unknown[];

  return {
    error, loading,
    taskViewMode, setTaskViewMode,
    taskListRowsPerPage, setTaskListRowsPerPage,
    digestDueHours, setDigestDueHours,
    digestScope, setDigestScope,
    notifyEmailEnabled, setNotifyEmailEnabled,
    notifyWebPushEnabled, setNotifyWebPushEnabled,
    notifyTaskOverdue, setNotifyTaskOverdue,
    notifyTaskDueSoon, setNotifyTaskDueSoon,
    notifyTaskAssigned, setNotifyTaskAssigned,
    notifyTaskComment, setNotifyTaskComment,
    notifyTaskUpdated, setNotifyTaskUpdated,
    notifyContactIncomingMessage, setNotifyContactIncomingMessage,
    notifyTaskMention, setNotifyTaskMention,
    webPushStatus, webPushBrowserSupported, webPushPermission, webPushConnected, webPushBusy,
    connectWebPush, disconnectWebPush,
    notificationLabels, notificationConfigMap,
    settingsSaving,
    taskConfig, taskConfigDraft, setTaskConfigDraft, taskConfigSaving,
    projectConfig, projectConfigDraft, setProjectConfigDraft, projectConfigSaving,
    notificationConfig, notificationConfigDraft, setNotificationConfigDraft, notificationConfigSaving,
    notificationDeliveryStats, notificationDeliveryStatsLoading, notificationDeliveryRetrying,
    taskTagDictionary, taskTagDictionaryDraft, setTaskTagDictionaryDraft, taskTagDictionarySaving,
    contactTagDictionary, contactTagDictionaryDraft, setContactTagDictionaryDraft, contactTagDictionarySaving,
    contactSourceDictionary, contactSourceDictionaryDraft, setContactSourceDictionaryDraft, contactSourceDictionarySaving,
    counterpartyRoleDictionary, counterpartyRoleDictionaryDraft, setCounterpartyRoleDictionaryDraft, counterpartyRoleDictionarySaving,
    counterpartyIndustryDictionary, counterpartyIndustryDictionaryDraft, setCounterpartyIndustryDictionaryDraft, counterpartyIndustryDictionarySaving,
    permissionMatrixRows,
    permissionPolicyDraft, setPermissionPolicyDraft,
    settingsBundleDialogOpen, setSettingsBundleDialogOpen,
    settingsBundleImportText, setSettingsBundleImportText,
    settingsBundleImporting,
    settingsBundleLastExportMeta,
    settingsSnapshots,
    settingsSnapshotSearch, setSettingsSnapshotSearch,
    settingsSnapshotSort, setSettingsSnapshotSort,
    settingsSnapshotOnlyChanged, setSettingsSnapshotOnlyChanged,
    settingsSnapshotsLoading,
    settingsSnapshotDiffMap,
    settingsSnapshotDuplicatingId,
    settingsSnapshotApplyingId,
    settingsSnapshotDeletingId,
    settingsSnapshotEditingId, setSettingsSnapshotEditingId,
    settingsSnapshotDeleteConfirm, setSettingsSnapshotDeleteConfirm,
    settingsSnapshotReview, setSettingsSnapshotReview,
    settingsSnapshotCompareBaseId, setSettingsSnapshotCompareBaseId,
    settingsSnapshotCreateSafetyBeforeApply, setSettingsSnapshotCreateSafetyBeforeApply,
    workspaceSettingsBundle,
    parsedSettingsBundleInput,
    saveWorkspaceSettings, saveWorkspaceTaskConfig, saveWorkspaceProjectConfig,
    saveWorkspacePermissionPolicy, saveWorkspaceNotificationConfig,
    saveWorkspaceTaskTagDictionary, saveWorkspaceContactTagDictionary, saveWorkspaceContactSourceDictionary,
    saveCounterpartyRoleDictionary, saveCounterpartyIndustryDictionary,
    exportWorkspaceSettingsBundle, copyWorkspaceSettingsBundle, importWorkspaceSettingsBundle,
    createSettingsSnapshot, applySettingsSnapshot, deleteSettingsSnapshot,
    duplicateSettingsSnapshot, summarizeWorkspaceSettingsBundle,
    loadNotificationDeliveryStats,
    retryNotificationDelivery: async () => {},
  };
}
