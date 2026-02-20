import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import {
  Typography,
  Box,
  Paper,
  Button,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Stack,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { projectsApi } from '../services/api';
import { Project, ProjectStage, ProjectCard } from '../types';

interface StageWithCards extends ProjectStage {
  cards: ProjectCard[];
}

const ProjectKanbanPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<StageWithCards[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draggedCard, setDraggedCard] = useState<{ cardId: number; stageId: number } | null>(null);
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [editStageOpen, setEditStageOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<StageWithCards | null>(null);
  const [editStageName, setEditStageName] = useState('');

  const id = projectId ? parseInt(projectId, 10) : NaN;

  useEffect(() => {
    if (!id || isNaN(id)) return;
    load();
  }, [id]);

  const load = async () => {
    if (!id || isNaN(id)) return;
    setLoading(true);
    setError('');
    try {
      const data = await projectsApi.getBoard(id);
      setProject(data.project);
      setStages(data.stages || []);
    } catch (err: any) {
      const res = err.response;
      const data = res?.data;
      const detail = data?.detail;
      let msg: string;
      if (typeof detail === 'string') msg = detail;
      else if (Array.isArray(detail)) msg = detail.map((x: any) => x?.msg || JSON.stringify(x)).join(', ');
      else if (detail && typeof detail === 'object' && detail.message) msg = detail.message;
      else if (typeof data === 'string') msg = data.slice(0, 500);
      else if (err.message) msg = err.message;
      else msg = 'Ошибка загрузки доски';
      if (res?.status) msg = `[${res.status}] ${msg}`;
      else if (!err.response) msg = `Сеть: ${msg}`;
      if (res?.status === 500 && data && typeof data === 'object' && typeof data.detail !== 'string') {
        try {
          msg += ' Ответ: ' + JSON.stringify(data).slice(0, 400);
        } catch (_) {}
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStage = async () => {
    if (!newStageName.trim() || !id) return;
    try {
      await projectsApi.createStage(id, { name: newStageName.trim() });
      setAddStageOpen(false);
      setNewStageName('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка добавления этапа');
    }
  };

  const handleEditStageOpen = (s: StageWithCards) => {
    setEditingStage(s);
    setEditStageName(s.name);
    setEditStageOpen(true);
  };

  const handleEditStage = async () => {
    if (!editingStage || !id) return;
    try {
      await projectsApi.updateStage(id, editingStage.id, { name: editStageName.trim() });
      setEditStageOpen(false);
      setEditingStage(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка сохранения этапа');
    }
  };

  const handleDeleteStage = async (s: StageWithCards) => {
    if (!id) return;
    if (s.cards && s.cards.length > 0) {
      setError('Переместите карточки в другие этапы перед удалением');
      return;
    }
    try {
      await projectsApi.deleteStage(id, s.id);
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка удаления этапа');
    }
  };

  const handleDragStart = (e: React.DragEvent, card: ProjectCard, stageId: number) => {
    setDraggedCard({ cardId: card.id, stageId });
    e.dataTransfer.setData('text/plain', `${card.id}`);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetStageId: number) => {
    e.preventDefault();
    if (!draggedCard || !id || draggedCard.stageId === targetStageId) {
      setDraggedCard(null);
      return;
    }
    try {
      await projectsApi.moveCard(id, draggedCard.cardId, { stage_id: targetStageId });
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка перемещения');
    }
    setDraggedCard(null);
  };

  if (!id || isNaN(id)) {
    return (
      <Layout>
        <Typography color="error">Неверный ID проекта</Typography>
      </Layout>
    );
  }

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <IconButton onClick={() => navigate('/projects')} size="small">
          <BackIcon />
        </IconButton>
        <Typography variant="h4" sx={{ flex: 1 }}>
          {project?.name || 'Канбан'}
        </Typography>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setAddStageOpen(true)}>
          Добавить этап
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Typography>Загрузка...</Typography>
      ) : (
        <Box
          sx={{
            display: 'flex',
            gap: 2,
            overflowX: 'auto',
            pb: 2,
            minHeight: 400,
          }}
        >
          {stages.map((stage) => (
            <Paper
              key={stage.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage.id)}
              sx={{
                minWidth: 280,
                maxWidth: 280,
                p: 2,
                bgcolor: 'grey.50',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {stage.name}
                </Typography>
                <Box>
                  <IconButton size="small" onClick={() => handleEditStageOpen(stage)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteStage(stage)}
                    disabled={(stage.cards?.length ?? 0) > 0}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
              <Stack spacing={1} sx={{ flex: 1, minHeight: 80 }}>
                {(stage.cards || []).map((card) => (
                  <Paper
                    key={card.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card, stage.id)}
                    sx={{
                      p: 1.5,
                      cursor: 'grab',
                      '&:active': { cursor: 'grabbing' },
                      opacity: draggedCard?.cardId === card.id ? 0.6 : 1,
                    }}
                    elevation={1}
                  >
                    <Typography variant="body2">
                      {card.display_name || `#${card.entity_id}`}
                    </Typography>
                  </Paper>
                ))}
              </Stack>
            </Paper>
          ))}
        </Box>
      )}

      <Dialog open={addStageOpen} onClose={() => setAddStageOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Новый этап</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Название этапа"
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddStageOpen(false)}>Отмена</Button>
          <Button onClick={handleAddStage} variant="contained" disabled={!newStageName.trim()}>
            Добавить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editStageOpen} onClose={() => setEditStageOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Редактировать этап</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Название этапа"
            value={editStageName}
            onChange={(e) => setEditStageName(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditStageOpen(false)}>Отмена</Button>
          <Button onClick={handleEditStage} variant="contained" disabled={!editStageName.trim()}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default ProjectKanbanPage;
