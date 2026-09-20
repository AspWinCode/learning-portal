import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, FormControlLabel, InputLabel, List, ListItem, ListItemText, MenuItem,
  Select, TextField, Typography,
} from '@mui/material';
import { studentPortalAdminApi } from '../services/api';
import { BulkGrantCourseAccessResponse, CourseCatalogItemOut } from '../types';

interface Props {
  open: boolean;
  groupId: number;
  groupName: string;
  onClose: () => void;
}

/** MGR-001/002/005: назначение курса из витрины всей группе одним действием —
 * сначала предпросмотр затрагиваемых учеников, затем подтверждение и итоговый
 * отчёт (кто получил доступ, кто уже был активен, у кого ошибка). */
export default function AssignCourseToGroupDialog({ open, groupId, groupName, onClose }: Props) {
  const [catalog, setCatalog] = useState<CourseCatalogItemOut[]>([]);
  const [catalogItemId, setCatalogItemId] = useState('');
  const [deadlineAt, setDeadlineAt] = useState('');
  const [resetProgress, setResetProgress] = useState(false);
  const [preview, setPreview] = useState<BulkGrantCourseAccessResponse | null>(null);
  const [report, setReport] = useState<BulkGrantCourseAccessResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      studentPortalAdminApi.listCatalog().then(setCatalog).catch(() => {});
      setCatalogItemId('');
      setDeadlineAt('');
      setResetProgress(false);
      setPreview(null);
      setReport(null);
      setError('');
    }
  }, [open]);

  const loadPreview = async () => {
    if (!catalogItemId) return;
    setLoading(true);
    setError('');
    try {
      const res = await studentPortalAdminApi.bulkGrantAccess({
        catalog_item_id: Number(catalogItemId),
        group_id: groupId,
        deadline_at: deadlineAt || undefined,
        reset_progress: resetProgress,
        dry_run: true,
      });
      setPreview(res);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Не удалось получить предпросмотр');
    } finally {
      setLoading(false);
    }
  };

  const confirmAssign = async () => {
    if (!catalogItemId) return;
    setLoading(true);
    setError('');
    try {
      const res = await studentPortalAdminApi.bulkGrantAccess({
        catalog_item_id: Number(catalogItemId),
        group_id: groupId,
        deadline_at: deadlineAt || undefined,
        reset_progress: resetProgress,
        dry_run: false,
      });
      setReport(res);
      setPreview(null);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Не удалось назначить курс');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Назначить курс группе «{groupName}»</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!report && (
          <>
            <FormControl fullWidth sx={{ mt: 1 }}>
              <InputLabel>Курс</InputLabel>
              <Select
                value={catalogItemId}
                label="Курс"
                onChange={(e) => { setCatalogItemId(e.target.value); setPreview(null); }}
              >
                {catalog.map((c) => (
                  <MenuItem key={c.id} value={c.id.toString()}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              fullWidth type="datetime-local" label="Дедлайн (необязательно)" InputLabelProps={{ shrink: true }}
              value={deadlineAt} onChange={(e) => { setDeadlineAt(e.target.value); setPreview(null); }} sx={{ mt: 2 }}
            />
            <FormControlLabel
              control={<Checkbox checked={resetProgress} onChange={(e) => { setResetProgress(e.target.checked); setPreview(null); }} />}
              label="Начать заново, если доступ уже был отозван (сбросить сохранённый прогресс)"
              sx={{ mt: 1 }}
            />

            {!preview ? (
              <Button sx={{ mt: 2 }} variant="outlined" disabled={!catalogItemId || loading} onClick={loadPreview}>
                Показать, кого затронет
              </Button>
            ) : (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2">Будет затронуто учеников: {preview.affected.length}</Typography>
                <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
                  {preview.affected.map((a) => (
                    <ListItem key={a.student_id}>
                      <ListItemText primary={a.full_name} secondary={a.already_active ? 'уже есть активный доступ' : 'получит доступ впервые'} />
                    </ListItem>
                  ))}
                  {preview.affected.length === 0 && (
                    <ListItem><ListItemText primary="В группе нет активных учеников" /></ListItem>
                  )}
                </List>
              </Box>
            )}
          </>
        )}

        {report && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Итог</Typography>
            <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
              {report.results.map((r) => (
                <ListItem key={r.student_id}>
                  <ListItemText
                    primary={r.full_name}
                    secondary={
                      r.outcome === 'granted' ? 'Доступ выдан' :
                      r.outcome === 'reactivated' ? 'Доступ восстановлен' :
                      r.outcome === 'already_active' ? 'Уже был активен' :
                      `Ошибка: ${r.detail}`
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{report ? 'Готово' : 'Отмена'}</Button>
        {!report && preview && preview.affected.length > 0 && (
          <Button variant="contained" disabled={loading} onClick={confirmAssign}>
            Назначить {preview.affected.length} ученикам
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
