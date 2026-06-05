import React from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import type {
  OwnerWorkspaceAuditLog,
  OwnerWorkspaceHistoryStats,
  User,
} from '../../types';

type HistoryFilterChip = {
  key: string;
  label: string;
};

type OwnerWorkspaceHistoryTabProps = {
  historyEntityFilter: string;
  historyActionFilter: string;
  historyEntityIdFilter: number | '';
  historyAuthorFilter: number | '';
  historyCreatedFrom: string;
  historyCreatedTo: string;
  historyLimit: number;
  historySortOrder: 'asc' | 'desc';
  historyActionOptions: string[];
  userOptions: User[];
  historyLogs: OwnerWorkspaceAuditLog[];
  historyStats: OwnerWorkspaceHistoryStats | null;
  historyStatsLoading: boolean;
  historyStatsLoadedAt: string;
  historyVisibleSummary: {
    rows: number;
    authors: number;
    actions: number;
  };
  historyExpandedIds: number[];
  historyDayMax: number;
  historyActiveFilterChips: HistoryFilterChip[];
  onHistoryEntityFilterChange: (value: string) => void;
  onHistoryActionFilterChange: (value: string) => void;
  onHistoryEntityIdFilterChange: (value: number | '') => void;
  onHistoryAuthorFilterChange: (value: number | '') => void;
  onHistoryCreatedFromChange: (value: string) => void;
  onHistoryCreatedToChange: (value: string) => void;
  onHistoryLimitChange: (value: number) => void;
  onHistorySortOrderChange: (value: 'asc' | 'desc') => void;
  onApplyHistoryPreset: (hours: number) => void;
  onResetHistoryFilters: () => void;
  onRefreshHistoryView: () => void;
  onExpandAllVisibleHistoryEntries: () => void;
  onCollapseAllVisibleHistoryEntries: () => void;
  onCopyHistoryLink: () => void | Promise<void>;
  onOpenHistoryLinkInNewTab: () => void;
  onCopyHistoryStatsSummary: () => void | Promise<void>;
  onCopyHistoryStatsJson: () => void | Promise<void>;
  onExportHistoryCsv: () => void;
  onExportHistoryJson: () => void;
  onExportHistoryStatsJson: () => void;
  onExportHistoryStatsCsv: () => void;
  onApplyHistoryEntityQuickFilter: (key: string) => void;
  onApplyHistoryActionQuickFilter: (key: string) => void;
  onApplyHistoryAuthorQuickFilter: (authorId: number) => void;
  onApplyHistoryDayQuickFilter: (day: string) => void;
  onClearHistoryFilterChip: (key: string) => void;
  onOpenHistoryEntity: (entry: OwnerWorkspaceAuditLog) => void | Promise<void>;
  onApplyHistoryExactEntityQuickFilter: (entityType: string, entityId: number) => void;
  onToggleExpandedHistoryEntry: (id: number) => void;
  ownerWsHistoryPrimaryLabel: (entry: OwnerWorkspaceAuditLog) => string;
  ownerWsHistoryChangedFields: (entry: OwnerWorkspaceAuditLog) => string[];
  ownerWsHistoryPayloadText: (value: Record<string, unknown> | null | undefined) => string;
  userName: (userId?: number | null) => string;
  historyStatsPercentLabel: (count: number) => string;
  historyEntityLabels: Record<string, string>;
  historyActionLabels: Record<string, string>;
  historyLoading: boolean;
};

export function OwnerWorkspaceHistoryTab({
  historyEntityFilter,
  historyActionFilter,
  historyEntityIdFilter,
  historyAuthorFilter,
  historyCreatedFrom,
  historyCreatedTo,
  historyLimit,
  historySortOrder,
  historyActionOptions,
  userOptions,
  historyLogs,
  historyStats,
  historyStatsLoading,
  historyStatsLoadedAt,
  historyVisibleSummary,
  historyExpandedIds,
  historyDayMax,
  historyActiveFilterChips,
  onHistoryEntityFilterChange,
  onHistoryActionFilterChange,
  onHistoryEntityIdFilterChange,
  onHistoryAuthorFilterChange,
  onHistoryCreatedFromChange,
  onHistoryCreatedToChange,
  onHistoryLimitChange,
  onHistorySortOrderChange,
  onApplyHistoryPreset,
  onResetHistoryFilters,
  onRefreshHistoryView,
  onExpandAllVisibleHistoryEntries,
  onCollapseAllVisibleHistoryEntries,
  onCopyHistoryLink,
  onOpenHistoryLinkInNewTab,
  onCopyHistoryStatsSummary,
  onCopyHistoryStatsJson,
  onExportHistoryCsv,
  onExportHistoryJson,
  onExportHistoryStatsJson,
  onExportHistoryStatsCsv,
  onApplyHistoryEntityQuickFilter,
  onApplyHistoryActionQuickFilter,
  onApplyHistoryAuthorQuickFilter,
  onApplyHistoryDayQuickFilter,
  onClearHistoryFilterChip,
  onOpenHistoryEntity,
  onApplyHistoryExactEntityQuickFilter,
  onToggleExpandedHistoryEntry,
  ownerWsHistoryPrimaryLabel,
  ownerWsHistoryChangedFields,
  ownerWsHistoryPayloadText,
  userName,
  historyStatsPercentLabel,
  historyEntityLabels,
  historyActionLabels,
  historyLoading,
}: OwnerWorkspaceHistoryTabProps) {
  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle2" gutterBottom>
          История действий (аудит)
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
          <TextField
            select
            label="Сущность"
            value={historyEntityFilter}
            onChange={(e) => onHistoryEntityFilterChange(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Все сущности</MenuItem>
            {Object.entries(historyEntityLabels).map(([key, label]) => (
              <MenuItem key={key} value={key}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Действие"
            value={historyActionFilter}
            onChange={(e) => onHistoryActionFilterChange(e.target.value)}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">Все действия</MenuItem>
            {historyActionOptions.map((key) => (
              <MenuItem key={key} value={key}>
                {historyActionLabels[key] || key}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="ID сущности"
            type="number"
            value={historyEntityIdFilter}
            onChange={(e) => {
              const raw = e.target.value;
              onHistoryEntityIdFilterChange(raw ? Number(raw) : '');
            }}
            inputProps={{ min: 1 }}
            sx={{ minWidth: 160 }}
          />
          <TextField
            select
            label="Автор"
            value={historyAuthorFilter}
            onChange={(e) => onHistoryAuthorFilterChange(e.target.value ? Number(e.target.value) : '')}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">Все авторы</MenuItem>
            {userOptions.map((u) => (
              <MenuItem key={u.id} value={u.id}>
                {u.full_name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="С"
            type="datetime-local"
            value={historyCreatedFrom}
            onChange={(e) => onHistoryCreatedFromChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 220 }}
          />
          <TextField
            label="По"
            type="datetime-local"
            value={historyCreatedTo}
            onChange={(e) => onHistoryCreatedToChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 220 }}
          />
          <TextField
            select
            label="Лимит"
            value={historyLimit}
            onChange={(e) => onHistoryLimitChange(Number(e.target.value) || 300)}
            sx={{ minWidth: 120 }}
          >
            {[100, 200, 300, 500, 1000].map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Порядок"
            value={historySortOrder}
            onChange={(e) => onHistorySortOrderChange(e.target.value as 'asc' | 'desc')}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="desc">Сначала новые</MenuItem>
            <MenuItem value="asc">Сначала старые</MenuItem>
          </TextField>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
          <Button size="small" variant="outlined" onClick={() => onApplyHistoryPreset(12)}>
            Сегодня
          </Button>
          <Button size="small" variant="outlined" onClick={() => onApplyHistoryPreset(24)}>
            Последние 24ч
          </Button>
          <Button size="small" variant="outlined" onClick={() => onApplyHistoryPreset(24 * 7)}>
            Последние 7 дней
          </Button>
          <Button size="small" variant="outlined" onClick={() => onApplyHistoryPreset(24 * 30)}>
            Последние 30 дней
          </Button>
          <Button size="small" color="secondary" onClick={onResetHistoryFilters}>
            Сбросить фильтры
          </Button>
          <Button size="small" variant="text" onClick={onRefreshHistoryView}>
            Обновить
          </Button>
          <Button size="small" variant="text" onClick={onExpandAllVisibleHistoryEntries} disabled={historyLogs.length === 0}>
            Раскрыть детали
          </Button>
          <Button size="small" variant="text" onClick={onCollapseAllVisibleHistoryEntries} disabled={historyExpandedIds.length === 0}>
            Свернуть детали
          </Button>
          <Button size="small" variant="text" onClick={() => void onCopyHistoryLink()}>
            Копировать ссылку
          </Button>
          <Button size="small" variant="text" onClick={onOpenHistoryLinkInNewTab}>
            Открыть в новой вкладке
          </Button>
          <Button size="small" variant="text" onClick={() => void onCopyHistoryStatsSummary()}>
            Копировать сводку
          </Button>
          <Button size="small" variant="text" onClick={() => void onCopyHistoryStatsJson()} disabled={!historyStats}>
            Копировать stats JSON
          </Button>
          <Button size="small" variant="contained" disabled={historyLogs.length === 0} onClick={onExportHistoryCsv}>
            Экспорт CSV
          </Button>
          <Button size="small" variant="outlined" disabled={historyLogs.length === 0} onClick={onExportHistoryJson}>
            Экспорт JSON
          </Button>
          <Button size="small" variant="outlined" disabled={!historyStats} onClick={onExportHistoryStatsJson}>
            Экспорт stats JSON
          </Button>
          <Button size="small" variant="outlined" disabled={!historyStats} onClick={onExportHistoryStatsCsv}>
            Экспорт stats CSV
          </Button>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
          <Chip size="small" color="primary" variant="outlined" label={`Записей в выборке: ${historyStats?.total_rows ?? historyVisibleSummary.rows}`} />
          <Chip size="small" variant="outlined" label={`Авторов: ${historyStats?.unique_authors ?? historyVisibleSummary.authors}`} />
          <Chip size="small" variant="outlined" label={`Действий: ${historyStats?.unique_actions ?? historyVisibleSummary.actions}`} />
          <Chip size="small" variant="outlined" label={`Видимых строк: ${historyLogs.length}`} />
        </Stack>
        {Boolean(historyStats && historyStats.total_rows > historyLogs.length) && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              Текущий лимит показывает {historyLogs.length} из {historyStats!.total_rows} записей. Увеличьте лимит или сузьте фильтры.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
              <Button size="small" variant="outlined" onClick={() => onHistoryLimitChange(500)}>
                Лимит 500
              </Button>
              <Button size="small" variant="outlined" onClick={() => onHistoryLimitChange(1000)}>
                Лимит 1000
              </Button>
            </Stack>
          </Box>
        )}
        {historyStatsLoading && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            Обновляем сводку истории...
          </Typography>
        )}
        {historyStats?.first_created_at && historyStats?.last_created_at && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            Период выборки: {new Date(historyStats.first_created_at).toLocaleString('ru-RU')} - {new Date(historyStats.last_created_at).toLocaleString('ru-RU')}
          </Typography>
        )}
        {historyStatsLoadedAt && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            Сводка обновлена: {new Date(historyStatsLoadedAt).toLocaleString('ru-RU')}
          </Typography>
        )}
        {Boolean(historyStats?.entity_type_counts.length) && (
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
            {historyStats!.entity_type_counts.map(({ key, count }) => (
              <Chip
                key={key}
                size="small"
                variant={historyEntityFilter === key ? 'filled' : 'outlined'}
                label={`${historyEntityLabels[key] || key}: ${historyStatsPercentLabel(count)}`}
                onClick={() => onApplyHistoryEntityQuickFilter(key)}
              />
            ))}
          </Stack>
        )}
        {Boolean(historyStats?.action_counts.length) && (
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
            {historyStats!.action_counts.map(({ key, count }) => (
              <Chip
                key={key}
                size="small"
                variant={historyActionFilter === key ? 'filled' : 'outlined'}
                label={`${historyActionLabels[key] || key}: ${historyStatsPercentLabel(count)}`}
                onClick={() => onApplyHistoryActionQuickFilter(key)}
              />
            ))}
          </Stack>
        )}
        {Boolean(historyStats?.author_counts.length) && (
          <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
            {historyStats!.author_counts.map(({ author_id, count }) => (
              <Chip
                key={author_id}
                size="small"
                variant={historyAuthorFilter === author_id ? 'filled' : 'outlined'}
                label={`${userName(author_id)}: ${historyStatsPercentLabel(count)}`}
                onClick={() => onApplyHistoryAuthorQuickFilter(author_id)}
              />
            ))}
          </Stack>
        )}
        {Boolean(historyStats?.day_counts.length) && (
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="subtitle2" gutterBottom>
                Активность по дням
              </Typography>
              <Stack spacing={1}>
                {historyStats!.day_counts.map((item) => (
                  <Box key={item.day} sx={{ cursor: 'pointer' }} onClick={() => onApplyHistoryDayQuickFilter(item.day)}>
                    <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary">
                        {new Date(item.day).toLocaleDateString('ru-RU')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.count}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {historyStatsPercentLabel(item.count)}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={Math.max(4, Math.round((item.count / historyDayMax) * 100))}
                      sx={{ height: 8, borderRadius: 999 }}
                    />
                  </Box>
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Нажмите на день, чтобы отфильтровать историю по этой дате.
              </Typography>
            </CardContent>
          </Card>
        )}
        {historyActiveFilterChips.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
            {historyActiveFilterChips.map((chip) => (
              <Chip key={chip.key} size="small" label={chip.label} onDelete={() => onClearHistoryFilterChip(chip.key)} />
            ))}
          </Stack>
        )}
        <Stack spacing={1} sx={{ maxHeight: 560, overflow: 'auto' }}>
          {historyLoading && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">
                Загружаем историю...
              </Typography>
            </Stack>
          )}
          {historyLogs.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Нет записей или ещё не загружено.
            </Typography>
          )}
          {historyLogs.map((h) => (
            <Box
              key={h.id}
              sx={{
                p: 1,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                cursor: ['project', 'contact', 'task'].includes(h.entity_type) ? 'pointer' : 'default',
              }}
              onClick={() => {
                if (['project', 'contact', 'task'].includes(h.entity_type)) void onOpenHistoryEntity(h);
              }}
            >
              <Typography variant="caption" color="text.secondary" display="block">
                {h.created_at ? new Date(h.created_at).toLocaleString('ru-RU') : ''} · {userName(h.author_id)}
              </Typography>
              <Typography variant="body2">{ownerWsHistoryPrimaryLabel(h)}</Typography>
              {ownerWsHistoryChangedFields(h).length > 0 && (
                <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
                  {ownerWsHistoryChangedFields(h)
                    .slice(0, 4)
                    .map((key) => (
                      <Chip key={key} size="small" variant="outlined" label={key} />
                    ))}
                  {ownerWsHistoryChangedFields(h).length > 4 && (
                    <Chip size="small" variant="outlined" label={`+${ownerWsHistoryChangedFields(h).length - 4}`} />
                  )}
                </Stack>
              )}
              <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: 'wrap' }}>
                <Chip
                  size="small"
                  variant={historyEntityFilter === h.entity_type && historyEntityIdFilter === h.entity_id ? 'filled' : 'outlined'}
                  label={`${historyEntityLabels[h.entity_type] || h.entity_type} #${h.entity_id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onApplyHistoryExactEntityQuickFilter(h.entity_type, h.entity_id);
                  }}
                />
                <Chip
                  size="small"
                  variant={historyActionFilter === h.action_type ? 'filled' : 'outlined'}
                  label={historyActionLabels[h.action_type] || h.action_type}
                  onClick={(event) => {
                    event.stopPropagation();
                    onApplyHistoryActionQuickFilter(h.action_type);
                  }}
                />
                {h.author_id != null && (
                  <Chip
                    size="small"
                    variant={historyAuthorFilter === h.author_id ? 'filled' : 'outlined'}
                    label={userName(h.author_id)}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (h.author_id != null) onApplyHistoryAuthorQuickFilter(h.author_id);
                    }}
                  />
                )}
              </Stack>
              {(h.old_value || h.new_value) && (
                <Button
                  size="small"
                  variant="text"
                  sx={{ mt: 0.75, alignSelf: 'flex-start' }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleExpandedHistoryEntry(h.id);
                  }}
                >
                  {historyExpandedIds.includes(h.id) ? 'Скрыть детали' : 'Показать детали'}
                </Button>
              )}
              {historyExpandedIds.includes(h.id) && (
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {h.old_value && (
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        До
                      </Typography>
                      <Box
                        component="pre"
                        sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, fontFamily: 'monospace' }}
                      >
                        {ownerWsHistoryPayloadText(h.old_value)}
                      </Box>
                    </Box>
                  )}
                  {h.new_value && (
                    <Box sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        После
                      </Typography>
                      <Box
                        component="pre"
                        sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, fontFamily: 'monospace' }}
                      >
                        {ownerWsHistoryPayloadText(h.new_value)}
                      </Box>
                    </Box>
                  )}
                </Stack>
              )}
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
