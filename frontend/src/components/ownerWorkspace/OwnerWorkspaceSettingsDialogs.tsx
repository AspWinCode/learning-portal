import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import type {
  OwnerWorkspaceSettingsBundle,
  OwnerWorkspaceSettingsBundleSummary,
  OwnerWorkspaceSettingsSnapshot,
} from '../../types';

type ParsedSettingsBundleInput = {
  raw: unknown;
  bundle: OwnerWorkspaceSettingsBundle | null;
  error: string;
};

type SnapshotDiffItem = {
  key: string;
  label: string;
  changed: boolean;
};

type OwnerWorkspaceSettingsDialogsProps = {
  settingsBundleDialogOpen: boolean;
  settingsBundleImporting: boolean;
  settingsBundleImportText: string;
  parsedSettingsBundleInput: ParsedSettingsBundleInput;
  settingsSnapshotCreateOpen: boolean;
  settingsSnapshotEditOpen: boolean;
  settingsSnapshotCreating: boolean;
  settingsSnapshotName: string;
  settingsSnapshotNote: string;
  settingsSnapshotPreview: OwnerWorkspaceSettingsSnapshot | null;
  settingsSnapshotDeleteConfirm: OwnerWorkspaceSettingsSnapshot | null;
  settingsSnapshotDeletingId: string | null;
  settingsSnapshotReview: OwnerWorkspaceSettingsSnapshot | null;
  settingsSnapshotApplyingId: string | null;
  settingsSnapshotCompareBaseId: string;
  settingsSnapshots: OwnerWorkspaceSettingsSnapshot[];
  settingsSnapshotCompareBaseSnapshot: OwnerWorkspaceSettingsSnapshot | null;
  settingsSnapshotCompareBaseSummary: OwnerWorkspaceSettingsBundleSummary | null;
  reviewedSnapshotDiff: SnapshotDiffItem[];
  settingsSnapshotCreateSafetyBeforeApply: boolean;
  onSettingsBundleDialogClose: () => void;
  onSettingsBundleImportTextChange: (value: string) => void;
  onImportWorkspaceSettingsBundle: () => void;
  onSettingsSnapshotCreateClose: () => void;
  onSettingsSnapshotNameChange: (value: string) => void;
  onSettingsSnapshotNoteChange: (value: string) => void;
  onCreateSettingsSnapshot: () => void;
  onSettingsSnapshotEditClose: () => void;
  onUpdateSettingsSnapshot: () => void;
  onSettingsSnapshotPreviewClose: () => void;
  onCopySettingsSnapshot: (snapshot: OwnerWorkspaceSettingsSnapshot) => void;
  onExportSettingsSnapshot: (snapshot: OwnerWorkspaceSettingsSnapshot) => void;
  onSettingsSnapshotDeleteConfirmClose: () => void;
  onDeleteSettingsSnapshot: (snapshot: OwnerWorkspaceSettingsSnapshot) => void;
  onSettingsSnapshotReviewClose: () => void;
  onSettingsSnapshotCompareBaseIdChange: (value: string) => void;
  onSettingsSnapshotCreateSafetyBeforeApplyChange: (value: boolean) => void;
  onApplySettingsSnapshot: (snapshot: OwnerWorkspaceSettingsSnapshot) => void;
  summarizeWorkspaceSettingsBundle: (bundle: OwnerWorkspaceSettingsBundle) => OwnerWorkspaceSettingsBundleSummary;
};

export function OwnerWorkspaceSettingsDialogs({
  settingsBundleDialogOpen,
  settingsBundleImporting,
  settingsBundleImportText,
  parsedSettingsBundleInput,
  settingsSnapshotCreateOpen,
  settingsSnapshotEditOpen,
  settingsSnapshotCreating,
  settingsSnapshotName,
  settingsSnapshotNote,
  settingsSnapshotPreview,
  settingsSnapshotDeleteConfirm,
  settingsSnapshotDeletingId,
  settingsSnapshotReview,
  settingsSnapshotApplyingId,
  settingsSnapshotCompareBaseId,
  settingsSnapshots,
  settingsSnapshotCompareBaseSnapshot,
  settingsSnapshotCompareBaseSummary,
  reviewedSnapshotDiff,
  settingsSnapshotCreateSafetyBeforeApply,
  onSettingsBundleDialogClose,
  onSettingsBundleImportTextChange,
  onImportWorkspaceSettingsBundle,
  onSettingsSnapshotCreateClose,
  onSettingsSnapshotNameChange,
  onSettingsSnapshotNoteChange,
  onCreateSettingsSnapshot,
  onSettingsSnapshotEditClose,
  onUpdateSettingsSnapshot,
  onSettingsSnapshotPreviewClose,
  onCopySettingsSnapshot,
  onExportSettingsSnapshot,
  onSettingsSnapshotDeleteConfirmClose,
  onDeleteSettingsSnapshot,
  onSettingsSnapshotReviewClose,
  onSettingsSnapshotCompareBaseIdChange,
  onSettingsSnapshotCreateSafetyBeforeApplyChange,
  onApplySettingsSnapshot,
  summarizeWorkspaceSettingsBundle,
}: OwnerWorkspaceSettingsDialogsProps) {
  return (
    <>
      <Dialog open={settingsBundleDialogOpen} onClose={() => !settingsBundleImporting && onSettingsBundleDialogClose()} maxWidth="md" fullWidth>
        <DialogTitle>Импорт bundle системных настроек</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">
              Вставьте JSON bundle owner-workspace. Импорт перезапишет системные словари, policy, статусы, приоритеты и
              конфигурацию уведомлений.
            </Alert>
            {!!settingsBundleImportText.trim() && parsedSettingsBundleInput.error && (
              <Alert severity="warning">{parsedSettingsBundleInput.error}</Alert>
            )}
            {parsedSettingsBundleInput.bundle && (
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={1.5}>
                    <Typography variant="subtitle2">Предпросмотр bundle</Typography>
                    {'meta' in ((parsedSettingsBundleInput.raw as Record<string, unknown>) || {}) && (
                      <Typography variant="body2" color="text.secondary">
                        Версия: {(parsedSettingsBundleInput.raw as { meta?: { version?: number } }).meta?.version ?? 'n/a'}
                        {' · '}
                        Exported at:{' '}
                        {(parsedSettingsBundleInput.raw as { meta?: { exported_at?: string } }).meta?.exported_at
                          ? new Date(
                              (parsedSettingsBundleInput.raw as { meta?: { exported_at?: string } }).meta!.exported_at!
                            ).toLocaleString('ru-RU')
                          : 'n/a'}
                      </Typography>
                    )}
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      {Object.entries(summarizeWorkspaceSettingsBundle(parsedSettingsBundleInput.bundle)).map(([key, value]) => (
                        <Chip key={key} size="small" label={`${key}: ${value}`} />
                      ))}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            )}
            <TextField
              fullWidth
              multiline
              minRows={16}
              label="JSON bundle"
              value={settingsBundleImportText}
              onChange={(e) => onSettingsBundleImportTextChange(e.target.value)}
              placeholder='{"task_config": {...}, "project_config": {...}}'
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onSettingsBundleDialogClose} disabled={settingsBundleImporting}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={onImportWorkspaceSettingsBundle}
            disabled={settingsBundleImporting || !settingsBundleImportText.trim() || !!parsedSettingsBundleInput.error}
          >
            {settingsBundleImporting ? 'Импорт...' : 'Импортировать'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={settingsSnapshotCreateOpen}
        onClose={() => !settingsSnapshotCreating && onSettingsSnapshotCreateClose()}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Создать snapshot системных настроек</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              label="Название snapshot"
              value={settingsSnapshotName}
              onChange={(e) => onSettingsSnapshotNameChange(e.target.value)}
            />
            <TextField
              fullWidth
              multiline
              minRows={3}
              label="Комментарий"
              value={settingsSnapshotNote}
              onChange={(e) => onSettingsSnapshotNoteChange(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onSettingsSnapshotCreateClose} disabled={settingsSnapshotCreating}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={onCreateSettingsSnapshot}
            disabled={settingsSnapshotCreating || !settingsSnapshotName.trim()}
          >
            {settingsSnapshotCreating ? 'Создаём...' : 'Создать'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={settingsSnapshotEditOpen}
        onClose={() => !settingsSnapshotCreating && onSettingsSnapshotEditClose()}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Редактировать snapshot системных настроек</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              label="Название snapshot"
              value={settingsSnapshotName}
              onChange={(e) => onSettingsSnapshotNameChange(e.target.value)}
            />
            <TextField
              fullWidth
              multiline
              minRows={3}
              label="Комментарий"
              value={settingsSnapshotNote}
              onChange={(e) => onSettingsSnapshotNoteChange(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onSettingsSnapshotEditClose} disabled={settingsSnapshotCreating}>
            Отмена
          </Button>
          <Button
            variant="contained"
            onClick={onUpdateSettingsSnapshot}
            disabled={settingsSnapshotCreating || !settingsSnapshotName.trim()}
          >
            {settingsSnapshotCreating ? 'Сохраняем...' : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!settingsSnapshotPreview} onClose={onSettingsSnapshotPreviewClose} maxWidth="md" fullWidth>
        <DialogTitle>JSON snapshot системных настроек</DialogTitle>
        <DialogContent>
          {settingsSnapshotPreview && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip size="small" label={settingsSnapshotPreview.name} />
                <Chip size="small" variant="outlined" label={`Создан: ${new Date(settingsSnapshotPreview.created_at).toLocaleString('ru-RU')}`} />
              </Stack>
              <TextField
                fullWidth
                multiline
                minRows={18}
                value={JSON.stringify(settingsSnapshotPreview.bundle, null, 2)}
                InputProps={{ readOnly: true }}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onSettingsSnapshotPreviewClose}>Закрыть</Button>
          <Button
            variant="outlined"
            onClick={() => settingsSnapshotPreview && onCopySettingsSnapshot(settingsSnapshotPreview)}
          >
            Копировать JSON
          </Button>
          <Button
            variant="contained"
            onClick={() => settingsSnapshotPreview && onExportSettingsSnapshot(settingsSnapshotPreview)}
          >
            Экспорт
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!settingsSnapshotDeleteConfirm}
        onClose={() => !settingsSnapshotDeletingId && onSettingsSnapshotDeleteConfirmClose()}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Удалить snapshot</DialogTitle>
        <DialogContent>
          {settingsSnapshotDeleteConfirm && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert severity="warning">
                Snapshot будет удалён из списка rollback-точек. Bundle, уже применённый на сервере, это не изменит.
              </Alert>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip size="small" label={settingsSnapshotDeleteConfirm.name} />
                <Chip size="small" variant="outlined" label={`Создан: ${new Date(settingsSnapshotDeleteConfirm.created_at).toLocaleString('ru-RU')}`} />
                {settingsSnapshotDeleteConfirm.created_by_name && (
                  <Chip size="small" variant="outlined" label={`Автор: ${settingsSnapshotDeleteConfirm.created_by_name}`} />
                )}
              </Stack>
              {settingsSnapshotDeleteConfirm.note && (
                <Typography variant="body2" color="text.secondary">
                  {settingsSnapshotDeleteConfirm.note}
                </Typography>
              )}
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {Object.entries(settingsSnapshotDeleteConfirm.bundle.meta.summary).map(([key, value]) => (
                  <Chip key={key} size="small" variant="outlined" label={`${key}: ${value}`} />
                ))}
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onSettingsSnapshotDeleteConfirmClose} disabled={!!settingsSnapshotDeletingId}>
            Отмена
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={!settingsSnapshotDeleteConfirm || !!settingsSnapshotDeletingId}
            onClick={() => settingsSnapshotDeleteConfirm && onDeleteSettingsSnapshot(settingsSnapshotDeleteConfirm)}
          >
            {settingsSnapshotDeletingId === settingsSnapshotDeleteConfirm?.id ? 'Удаляем...' : 'Удалить snapshot'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!settingsSnapshotReview}
        onClose={() => !settingsSnapshotApplyingId && onSettingsSnapshotReviewClose()}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Проверить и применить snapshot</DialogTitle>
        <DialogContent>
          {settingsSnapshotReview && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert severity="warning">
                Snapshot заменит текущие системные настройки owner workspace. Перед применением можно автоматически
                сохранить safety snapshot.
              </Alert>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip size="small" label={settingsSnapshotReview.name} />
                <Chip size="small" variant="outlined" label={`Создан: ${new Date(settingsSnapshotReview.created_at).toLocaleString('ru-RU')}`} />
                {settingsSnapshotReview.created_by_name && (
                  <Chip size="small" variant="outlined" label={`Автор: ${settingsSnapshotReview.created_by_name}`} />
                )}
                <Chip size="small" variant="outlined" label={`v${settingsSnapshotReview.bundle.meta.version}`} />
              </Stack>
              {settingsSnapshotReview.note && (
                <Typography variant="body2" color="text.secondary">
                  {settingsSnapshotReview.note}
                </Typography>
              )}
              <TextField
                fullWidth
                select
                size="small"
                label="Сравнить с"
                value={settingsSnapshotCompareBaseId}
                onChange={(e) => onSettingsSnapshotCompareBaseIdChange(e.target.value)}
              >
                <MenuItem value="__current__">Текущее состояние</MenuItem>
                {settingsSnapshots
                  .filter((snapshot) => snapshot.id !== settingsSnapshotReview.id)
                  .map((snapshot) => (
                    <MenuItem key={snapshot.id} value={snapshot.id}>
                      {snapshot.name} · {new Date(snapshot.created_at).toLocaleString('ru-RU')}
                    </MenuItem>
                  ))}
              </TextField>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  {settingsSnapshotCompareBaseSnapshot ? 'Базовый snapshot' : 'Текущее состояние'}
                </Typography>
                {settingsSnapshotCompareBaseSnapshot && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {settingsSnapshotCompareBaseSnapshot.name}
                    {settingsSnapshotCompareBaseSnapshot.created_by_name ? ` · ${settingsSnapshotCompareBaseSnapshot.created_by_name}` : ''}
                  </Typography>
                )}
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {settingsSnapshotCompareBaseSummary ? (
                    Object.entries(settingsSnapshotCompareBaseSummary).map(([key, value]) => (
                      <Chip key={key} size="small" label={`${key}: ${value}`} />
                    ))
                  ) : (
                    <Chip size="small" label="Нет загруженного bundle" />
                  )}
                </Stack>
              </Box>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Snapshot
                </Typography>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {Object.entries(settingsSnapshotReview.bundle.meta.summary).map(([key, value]) => (
                    <Chip key={key} size="small" variant="outlined" label={`${key}: ${value}`} />
                  ))}
                </Stack>
              </Box>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Изменятся разделы
                </Typography>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {reviewedSnapshotDiff.filter((item) => item.changed).length > 0 ? (
                    reviewedSnapshotDiff
                      .filter((item) => item.changed)
                      .map((item) => (
                        <Chip key={item.key} color="warning" variant="outlined" size="small" label={item.label} />
                      ))
                  ) : (
                    <Chip size="small" color="success" label="Отличий не найдено" />
                  )}
                </Stack>
              </Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={settingsSnapshotCreateSafetyBeforeApply}
                    onChange={(e) => onSettingsSnapshotCreateSafetyBeforeApplyChange(e.target.checked)}
                  />
                }
                label="Автоматически создать safety snapshot перед применением"
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onSettingsSnapshotReviewClose} disabled={!!settingsSnapshotApplyingId}>
            Отмена
          </Button>
          <Button
            variant="contained"
            disabled={!settingsSnapshotReview || !!settingsSnapshotApplyingId}
            onClick={() => settingsSnapshotReview && onApplySettingsSnapshot(settingsSnapshotReview)}
          >
            {settingsSnapshotApplyingId === settingsSnapshotReview?.id ? 'Применяем...' : 'Применить snapshot'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
