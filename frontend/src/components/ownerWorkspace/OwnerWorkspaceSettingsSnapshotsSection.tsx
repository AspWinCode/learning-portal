import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import type {
  OwnerWorkspaceSettingsBundle,
  OwnerWorkspaceSettingsBundleEnvelope,
  OwnerWorkspaceSettingsBundleSummary,
  OwnerWorkspaceSettingsSnapshot,
} from '../../types';

type SettingsSectionDiffItem = {
  key: string;
  label: string;
  changed: boolean;
};

type OwnerWorkspaceSettingsSnapshotsSectionProps = {
  workspaceSettingsBundle: OwnerWorkspaceSettingsBundle | null;
  workspaceSettingsBundleSummary: OwnerWorkspaceSettingsBundleSummary | null;
  settingsBundleLastExportMeta: OwnerWorkspaceSettingsBundleEnvelope['meta'] | null;
  settingsSnapshots: OwnerWorkspaceSettingsSnapshot[];
  filteredSettingsSnapshots: OwnerWorkspaceSettingsSnapshot[];
  settingsSnapshotsChangedCount: number;
  settingsSnapshotSearch: string;
  settingsSnapshotSort: 'newest' | 'oldest' | 'name';
  settingsSnapshotOnlyChanged: boolean;
  settingsSnapshotsLoading: boolean;
  settingsSnapshotDiffMap: Map<string, SettingsSectionDiffItem[]>;
  settingsSnapshotDuplicatingId: string | null;
  settingsSnapshotApplyingId: string | null;
  settingsSnapshotDeletingId: string | null;
  onExportWorkspaceSettingsBundle: () => void;
  onCopyWorkspaceSettingsBundle: () => void | Promise<void>;
  onOpenImportDialog: () => void;
  onSettingsSnapshotSearchChange: (value: string) => void;
  onSettingsSnapshotSortChange: (value: 'newest' | 'oldest' | 'name') => void;
  onSettingsSnapshotOnlyChangedChange: (value: boolean) => void;
  onLoadSettingsSnapshots: () => void | Promise<void>;
  onOpenCreateSnapshot: () => void;
  onOpenEditSnapshot: (snapshot: OwnerWorkspaceSettingsSnapshot) => void;
  onDuplicateSettingsSnapshot: (snapshot: OwnerWorkspaceSettingsSnapshot) => void | Promise<void>;
  onPreviewSettingsSnapshot: (snapshot: OwnerWorkspaceSettingsSnapshot) => void;
  onCopySettingsSnapshot: (snapshot: OwnerWorkspaceSettingsSnapshot) => void | Promise<void>;
  onExportSettingsSnapshot: (snapshot: OwnerWorkspaceSettingsSnapshot) => void;
  onReviewAndApplySnapshot: (snapshot: OwnerWorkspaceSettingsSnapshot) => void;
  onConfirmDeleteSnapshot: (snapshot: OwnerWorkspaceSettingsSnapshot) => void;
};

export function OwnerWorkspaceSettingsSnapshotsSection({
  workspaceSettingsBundle,
  workspaceSettingsBundleSummary,
  settingsBundleLastExportMeta,
  settingsSnapshots,
  filteredSettingsSnapshots,
  settingsSnapshotsChangedCount,
  settingsSnapshotSearch,
  settingsSnapshotSort,
  settingsSnapshotOnlyChanged,
  settingsSnapshotsLoading,
  settingsSnapshotDiffMap,
  settingsSnapshotDuplicatingId,
  settingsSnapshotApplyingId,
  settingsSnapshotDeletingId,
  onExportWorkspaceSettingsBundle,
  onCopyWorkspaceSettingsBundle,
  onOpenImportDialog,
  onSettingsSnapshotSearchChange,
  onSettingsSnapshotSortChange,
  onSettingsSnapshotOnlyChangedChange,
  onLoadSettingsSnapshots,
  onOpenCreateSnapshot,
  onOpenEditSnapshot,
  onDuplicateSettingsSnapshot,
  onPreviewSettingsSnapshot,
  onCopySettingsSnapshot,
  onExportSettingsSnapshot,
  onReviewAndApplySnapshot,
  onConfirmDeleteSnapshot,
}: OwnerWorkspaceSettingsSnapshotsSectionProps) {
  if (!workspaceSettingsBundle) {
    return null;
  }

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6" gutterBottom>
          Bundle системных настроек
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Экспортируйте или импортируйте весь owner-workspace admin bundle одним JSON-файлом: словари, policy, статусы,
          приоритеты и конфигурацию уведомлений.
        </Typography>
      </Box>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="subtitle2">Portable admin bundle</Typography>
            <Typography variant="body2" color="text.secondary">
              Экспорт использует текущее сохранённое состояние на сервере. Импорт нормализует значения по тем же
              правилам, что и обычные admin-формы owner-workspace.
            </Typography>
            {workspaceSettingsBundleSummary && (
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip size="small" label={`Статусы задач: ${workspaceSettingsBundleSummary.task_statuses}`} />
                <Chip size="small" label={`Приоритеты: ${workspaceSettingsBundleSummary.task_priorities}`} />
                <Chip size="small" label={`Статусы проектов: ${workspaceSettingsBundleSummary.project_statuses}`} />
                <Chip size="small" label={`Типы уведомлений: ${workspaceSettingsBundleSummary.notification_types}`} />
                <Chip size="small" label={`Теги задач: ${workspaceSettingsBundleSummary.task_tags}`} />
                <Chip size="small" label={`Теги контактов: ${workspaceSettingsBundleSummary.contact_tags}`} />
                <Chip size="small" label={`Источники: ${workspaceSettingsBundleSummary.contact_sources}`} />
              </Stack>
            )}
            {settingsBundleLastExportMeta && (
              <Alert severity="info">
                Последний export/import bundle: v{settingsBundleLastExportMeta.version}
                {settingsBundleLastExportMeta.exported_by_name ? ` · ${settingsBundleLastExportMeta.exported_by_name}` : ''}
                {settingsBundleLastExportMeta.exported_at
                  ? ` · ${new Date(settingsBundleLastExportMeta.exported_at).toLocaleString('ru-RU')}`
                  : ''}
              </Alert>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button variant="contained" onClick={onExportWorkspaceSettingsBundle}>
                Экспорт JSON
              </Button>
              <Button variant="outlined" onClick={() => void onCopyWorkspaceSettingsBundle()}>
                Копировать JSON
              </Button>
              <Button variant="outlined" onClick={onOpenImportDialog}>
                Импорт JSON
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.5}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
            >
              <Box>
                <Typography variant="subtitle2">Snapshots системных настроек</Typography>
                <Typography variant="body2" color="text.secondary">
                  Именованные снимки для быстрого отката и повторного применения admin-конфигурации owner-workspace.
                </Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  size="small"
                  label="Поиск snapshot"
                  value={settingsSnapshotSearch}
                  onChange={(e) => onSettingsSnapshotSearchChange(e.target.value)}
                  sx={{ minWidth: 220 }}
                />
                <TextField
                  size="small"
                  select
                  label="Сортировка"
                  value={settingsSnapshotSort}
                  onChange={(e) => onSettingsSnapshotSortChange(e.target.value as 'newest' | 'oldest' | 'name')}
                  sx={{ minWidth: 180 }}
                >
                  <MenuItem value="newest">Сначала новые</MenuItem>
                  <MenuItem value="oldest">Сначала старые</MenuItem>
                  <MenuItem value="name">По названию</MenuItem>
                </TextField>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={settingsSnapshotOnlyChanged}
                      onChange={(e) => onSettingsSnapshotOnlyChangedChange(e.target.checked)}
                    />
                  }
                  label="Только отличающиеся"
                />
                <Button variant="outlined" onClick={() => void onLoadSettingsSnapshots()} disabled={settingsSnapshotsLoading}>
                  {settingsSnapshotsLoading ? 'Обновление...' : 'Обновить'}
                </Button>
                <Button variant="contained" onClick={onOpenCreateSnapshot}>
                  Создать snapshot
                </Button>
              </Stack>
            </Stack>
            {settingsSnapshots.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Снимков пока нет.
              </Typography>
            ) : (
              <Stack spacing={1.25}>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip size="small" label={`Всего: ${settingsSnapshots.length}`} />
                  <Chip size="small" label={`Видимо: ${filteredSettingsSnapshots.length}`} />
                  <Chip size="small" label={`Отличаются: ${settingsSnapshotsChangedCount}`} />
                  <Chip
                    size="small"
                    label={`Совпадают: ${Math.max(settingsSnapshots.length - settingsSnapshotsChangedCount, 0)}`}
                  />
                </Stack>
                {filteredSettingsSnapshots.map((snapshot) => {
                  const snapshotDiff = settingsSnapshotDiffMap.get(snapshot.id) || [];
                  const changedSections = snapshotDiff.filter((item) => item.changed);

                  return (
                    <Box key={snapshot.id} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                      <Stack spacing={1}>
                        <Stack
                          direction={{ xs: 'column', md: 'row' }}
                          spacing={1}
                          justifyContent="space-between"
                          alignItems={{ xs: 'flex-start', md: 'center' }}
                        >
                          <Box>
                            <Typography variant="body2">
                              <strong>{snapshot.name}</strong>
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(snapshot.created_at).toLocaleString('ru-RU')}
                              {snapshot.created_by_name ? ` · ${snapshot.created_by_name}` : ''}
                            </Typography>
                            {snapshot.note && (
                              <Typography variant="body2" color="text.secondary">
                                {snapshot.note}
                              </Typography>
                            )}
                          </Box>
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <Button size="small" variant="outlined" onClick={() => onOpenEditSnapshot(snapshot)}>
                              Редактировать
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={settingsSnapshotDuplicatingId === snapshot.id}
                              onClick={() => void onDuplicateSettingsSnapshot(snapshot)}
                            >
                              {settingsSnapshotDuplicatingId === snapshot.id ? 'Дублируем...' : 'Дублировать'}
                            </Button>
                            <Button size="small" variant="outlined" onClick={() => onPreviewSettingsSnapshot(snapshot)}>
                              JSON
                            </Button>
                            <Button size="small" variant="outlined" onClick={() => void onCopySettingsSnapshot(snapshot)}>
                              Копировать
                            </Button>
                            <Button size="small" variant="outlined" onClick={() => onExportSettingsSnapshot(snapshot)}>
                              Экспорт
                            </Button>
                            <Button
                              size="small"
                              variant="contained"
                              disabled={settingsSnapshotApplyingId === snapshot.id}
                              onClick={() => onReviewAndApplySnapshot(snapshot)}
                            >
                              {settingsSnapshotApplyingId === snapshot.id ? 'Применяем...' : 'Проверить и применить'}
                            </Button>
                            <Button
                              size="small"
                              color="error"
                              variant="outlined"
                              disabled={settingsSnapshotDeletingId === snapshot.id}
                              onClick={() => onConfirmDeleteSnapshot(snapshot)}
                            >
                              {settingsSnapshotDeletingId === snapshot.id ? 'Удаляем...' : 'Удалить'}
                            </Button>
                          </Stack>
                        </Stack>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                          {changedSections.length > 0 ? (
                            <>
                              <Chip size="small" color="warning" label={`Изменений: ${changedSections.length}`} />
                              {changedSections.slice(0, 3).map((item) => (
                                <Chip
                                  key={`${snapshot.id}-${item.key}`}
                                  size="small"
                                  color="warning"
                                  variant="outlined"
                                  label={item.label}
                                />
                              ))}
                              {changedSections.length > 3 && (
                                <Chip size="small" variant="outlined" label={`+${changedSections.length - 3}`} />
                              )}
                            </>
                          ) : (
                            <Chip size="small" color="success" label="Совпадает с текущим" />
                          )}
                          <Chip size="small" label={`v${snapshot.bundle.meta.version}`} />
                          {Object.entries(snapshot.bundle.meta.summary).map(([key, value]) => (
                            <Chip key={key} size="small" variant="outlined" label={`${key}: ${value}`} />
                          ))}
                        </Stack>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
