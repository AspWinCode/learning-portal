import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import FolderIcon from '@mui/icons-material/Folder';
import LinkIcon from '@mui/icons-material/Link';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SearchIcon from '@mui/icons-material/Search';
import Layout from '../components/Layout';
import { ownerUsefulLinksApi } from '../services/api';
import type { OwnerUsefulLink, OwnerUsefulLinkFolder } from '../types';
import { extractApiError } from '../utils/extractApiError';

type FolderForm = {
  parent_id: number | '';
  name: string;
  description: string;
};

type LinkForm = {
  folder_id: number | '';
  title: string;
  description: string;
  url: string;
  tags: string[];
};

type FolderNode = OwnerUsefulLinkFolder & { children: FolderNode[] };

const emptyFolderForm: FolderForm = { parent_id: '', name: '', description: '' };
const emptyLinkForm: LinkForm = { folder_id: '', title: '', description: '', url: '', tags: [] };

function buildFolderTree(folders: OwnerUsefulLinkFolder[]): FolderNode[] {
  const nodes = new Map<number, FolderNode>();
  folders.forEach((folder) => nodes.set(folder.id, { ...folder, children: [] }));
  const roots: FolderNode[] = [];
  nodes.forEach((node) => {
    if (node.parent_id && nodes.has(node.parent_id)) {
      nodes.get(node.parent_id)?.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const sort = (items: FolderNode[]) => {
    items.sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name, 'ru'));
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

function folderDepthMap(folders: OwnerUsefulLinkFolder[]): Map<number, number> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const depthById = new Map<number, number>();
  const getDepth = (folder: OwnerUsefulLinkFolder): number => {
    if (depthById.has(folder.id)) return depthById.get(folder.id) || 0;
    const parent = folder.parent_id ? byId.get(folder.parent_id) : null;
    const depth = parent ? getDepth(parent) + 1 : 0;
    depthById.set(folder.id, depth);
    return depth;
  };
  folders.forEach(getDepth);
  return depthById;
}

function collectDescendantIds(folders: OwnerUsefulLinkFolder[], folderId: number): Set<number> {
  const result = new Set<number>([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    folders.forEach((folder) => {
      if (folder.parent_id && result.has(folder.parent_id) && !result.has(folder.id)) {
        result.add(folder.id);
        changed = true;
      }
    });
  }
  return result;
}

const OwnerUsefulLinksPage: React.FC = () => {
  const [folders, setFolders] = useState<OwnerUsefulLinkFolder[]>([]);
  const [links, setLinks] = useState<OwnerUsefulLink[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | 'all' | 'none'>('all');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<OwnerUsefulLinkFolder | null>(null);
  const [folderForm, setFolderForm] = useState<FolderForm>(emptyFolderForm);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<OwnerUsefulLink | null>(null);
  const [linkForm, setLinkForm] = useState<LinkForm>(emptyLinkForm);

  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);
  const depths = useMemo(() => folderDepthMap(folders), [folders]);
  const allTags = useMemo(
    () => Array.from(new Set(links.flatMap((link) => link.tags || []))).sort((a, b) => a.localeCompare(b, 'ru')),
    [links]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ownerUsefulLinksApi.list({ q: search || undefined, tag: tagFilter || undefined });
      setFolders(data.folders);
      setLinks(data.links);
    } catch (err) {
      setError(extractApiError(err, 'Не удалось загрузить полезные ссылки'));
    } finally {
      setLoading(false);
    }
  }, [search, tagFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const visibleLinks = useMemo(() => {
    if (selectedFolderId === 'all') return links;
    if (selectedFolderId === 'none') return links.filter((link) => !link.folder_id);
    const ids = collectDescendantIds(folders, selectedFolderId);
    return links.filter((link) => link.folder_id && ids.has(link.folder_id));
  }, [folders, links, selectedFolderId]);

  const openCreateFolder = (parentId?: number | null) => {
    setEditingFolder(null);
    setFolderForm({ ...emptyFolderForm, parent_id: parentId || '' });
    setFolderDialogOpen(true);
  };

  const openEditFolder = (folder: OwnerUsefulLinkFolder) => {
    setEditingFolder(folder);
    setFolderForm({
      parent_id: folder.parent_id || '',
      name: folder.name,
      description: folder.description || '',
    });
    setFolderDialogOpen(true);
  };

  const openCreateLink = () => {
    setEditingLink(null);
    setLinkForm({
      ...emptyLinkForm,
      folder_id: typeof selectedFolderId === 'number' ? selectedFolderId : '',
    });
    setLinkDialogOpen(true);
  };

  const openEditLink = (link: OwnerUsefulLink) => {
    setEditingLink(link);
    setLinkForm({
      folder_id: link.folder_id || '',
      title: link.title,
      description: link.description || '',
      url: link.url,
      tags: link.tags || [],
    });
    setLinkDialogOpen(true);
  };

  const saveFolder = async () => {
    if (!folderForm.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        parent_id: folderForm.parent_id === '' ? null : Number(folderForm.parent_id),
        name: folderForm.name.trim(),
        description: folderForm.description.trim() || null,
      };
      if (editingFolder) {
        await ownerUsefulLinksApi.updateFolder(editingFolder.id, payload);
        setMessage('Папка обновлена');
      } else {
        await ownerUsefulLinksApi.createFolder(payload);
        setMessage('Папка создана');
      }
      setFolderDialogOpen(false);
      await loadData();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось сохранить папку'));
    } finally {
      setSaving(false);
    }
  };

  const saveLink = async () => {
    if (!linkForm.title.trim() || !linkForm.url.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        folder_id: linkForm.folder_id === '' ? null : Number(linkForm.folder_id),
        title: linkForm.title.trim(),
        description: linkForm.description.trim() || null,
        url: linkForm.url.trim(),
        tags: linkForm.tags,
      };
      if (editingLink) {
        await ownerUsefulLinksApi.updateLink(editingLink.id, payload);
        setMessage('Ссылка обновлена');
      } else {
        await ownerUsefulLinksApi.createLink(payload);
        setMessage('Ссылка добавлена');
      }
      setLinkDialogOpen(false);
      await loadData();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось сохранить ссылку'));
    } finally {
      setSaving(false);
    }
  };

  const deleteFolder = async (folder: OwnerUsefulLinkFolder) => {
    if (!window.confirm(`Удалить папку "${folder.name}" и ее подпапки? Ссылки останутся без папки.`)) return;
    setSaving(true);
    try {
      await ownerUsefulLinksApi.deleteFolder(folder.id);
      if (selectedFolderId === folder.id) setSelectedFolderId('all');
      setMessage('Папка удалена');
      await loadData();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось удалить папку'));
    } finally {
      setSaving(false);
    }
  };

  const deleteLink = async (link: OwnerUsefulLink) => {
    if (!window.confirm(`Удалить ссылку "${link.title}"?`)) return;
    setSaving(true);
    try {
      await ownerUsefulLinksApi.deleteLink(link.id);
      setMessage('Ссылка удалена');
      await loadData();
    } catch (err) {
      setError(extractApiError(err, 'Не удалось удалить ссылку'));
    } finally {
      setSaving(false);
    }
  };

  const folderMenuItems = folders
    .slice()
    .sort((a, b) => (depths.get(a.id) || 0) - (depths.get(b.id) || 0) || a.name.localeCompare(b.name, 'ru'));

  const renderFolderNode = (node: FolderNode) => {
    const active = selectedFolderId === node.id;
    const linkCount = links.filter((link) => link.folder_id === node.id).length;
    return (
      <Box key={node.id}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{
            py: 0.75,
            pl: 1 + (depths.get(node.id) || 0) * 2,
            pr: 1,
            borderRadius: 1,
            bgcolor: active ? 'primary.50' : 'transparent',
            cursor: 'pointer',
            '&:hover': { bgcolor: active ? 'primary.50' : 'action.hover' },
          }}
          onClick={() => setSelectedFolderId(node.id)}
        >
          <FolderIcon color={active ? 'primary' : 'action'} fontSize="small" />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: active ? 700 : 500 }} noWrap>
              {node.name}
            </Typography>
            {node.description && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {node.description}
              </Typography>
            )}
          </Box>
          <Chip size="small" label={linkCount} />
          <Tooltip title="Подпапка">
            <IconButton size="small" onClick={(event) => { event.stopPropagation(); openCreateFolder(node.id); }}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Редактировать">
            <IconButton size="small" onClick={(event) => { event.stopPropagation(); openEditFolder(node); }}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Удалить">
            <IconButton size="small" color="error" onClick={(event) => { event.stopPropagation(); deleteFolder(node); }}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        {node.children.map(renderFolderNode)}
      </Box>
    );
  };

  return (
    <Layout>
      <Box sx={{ p: { xs: 1.5, md: 3 } }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                Полезные ссылки
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Папки, теги и быстрые виджеты с превью сайтов для owner.
              </Typography>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button startIcon={<AddIcon />} variant="outlined" onClick={() => openCreateFolder(null)}>
                Папка
              </Button>
              <Button startIcon={<LinkIcon />} variant="contained" onClick={openCreateLink}>
                Ссылка
              </Button>
            </Stack>
          </Stack>

          {loading && <LinearProgress />}
          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
          {message && <Alert severity="success" onClose={() => setMessage(null)}>{message}</Alert>}

          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
              <TextField
                size="small"
                label="Поиск"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> }}
                fullWidth
              />
              <Autocomplete
                size="small"
                options={allTags}
                value={tagFilter || null}
                onChange={(_, value) => setTagFilter(value || '')}
                sx={{ minWidth: { xs: '100%', md: 240 } }}
                renderInput={(params) => <TextField {...params} label="Тег" />}
              />
            </Stack>
          </Paper>

          <Grid container spacing={2}>
            <Grid item xs={12} md={3.5}>
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                <Stack spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                      Папки
                    </Typography>
                    <Tooltip title="Добавить папку">
                      <IconButton size="small" onClick={() => openCreateFolder(null)}>
                        <AddIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <Divider />
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{
                      py: 0.75,
                      px: 1,
                      borderRadius: 1,
                      bgcolor: selectedFolderId === 'all' ? 'primary.50' : 'transparent',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                    onClick={() => setSelectedFolderId('all')}
                  >
                    <LinkIcon color={selectedFolderId === 'all' ? 'primary' : 'action'} fontSize="small" />
                    <Typography variant="body2" sx={{ flex: 1, fontWeight: selectedFolderId === 'all' ? 700 : 500 }}>
                      Все ссылки
                    </Typography>
                    <Chip size="small" label={links.length} />
                  </Stack>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{
                      py: 0.75,
                      px: 1,
                      borderRadius: 1,
                      bgcolor: selectedFolderId === 'none' ? 'primary.50' : 'transparent',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                    onClick={() => setSelectedFolderId('none')}
                  >
                    <FolderIcon color={selectedFolderId === 'none' ? 'primary' : 'action'} fontSize="small" />
                    <Typography variant="body2" sx={{ flex: 1, fontWeight: selectedFolderId === 'none' ? 700 : 500 }}>
                      Без папки
                    </Typography>
                    <Chip size="small" label={links.filter((link) => !link.folder_id).length} />
                  </Stack>
                  {folderTree.map(renderFolderNode)}
                </Stack>
              </Paper>
            </Grid>

            <Grid item xs={12} md={8.5}>
              <Grid container spacing={2}>
                {visibleLinks.map((link) => (
                  <Grid item xs={12} lg={6} key={link.id}>
                    <Card variant="outlined" sx={{ height: '100%', borderRadius: 1, overflow: 'hidden' }}>
                      <Box sx={{ height: 180, bgcolor: 'grey.100', borderBottom: 1, borderColor: 'divider', position: 'relative' }}>
                        <iframe
                          title={link.title}
                          src={link.url}
                          loading="lazy"
                          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                          style={{ width: '100%', height: '100%', border: 0, pointerEvents: 'none', background: '#fff' }}
                        />
                        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: 'inset 0 -24px 40px rgba(0,0,0,0.06)' }} />
                      </Box>
                      <CardContent>
                        <Stack spacing={1.25}>
                          <Stack direction="row" spacing={1} alignItems="flex-start">
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 800 }} noWrap>
                                {link.title}
                              </Typography>
                              <Typography
                                component="a"
                                href={link.url}
                                target="_blank"
                                rel="noreferrer"
                                variant="body2"
                                sx={{ color: 'primary.main', textDecoration: 'none', overflowWrap: 'anywhere' }}
                              >
                                {link.url}
                              </Typography>
                            </Box>
                            <Tooltip title="Открыть">
                              <IconButton component="a" href={link.url} target="_blank" rel="noreferrer" size="small">
                                <OpenInNewIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Редактировать">
                              <IconButton size="small" onClick={() => openEditLink(link)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Удалить">
                              <IconButton size="small" color="error" onClick={() => deleteLink(link)}>
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                          {link.description && (
                            <Typography variant="body2" color="text.secondary">
                              {link.description}
                            </Typography>
                          )}
                          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                            {(link.tags || []).map((tag) => (
                              <Chip key={tag} size="small" label={tag} onClick={() => setTagFilter(tag)} />
                            ))}
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}

                {!loading && visibleLinks.length === 0 && (
                  <Grid item xs={12}>
                    <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderRadius: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        Ссылок пока нет
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Добавьте первую ссылку или выберите другую папку.
                      </Typography>
                      <Button startIcon={<LinkIcon />} variant="contained" onClick={openCreateLink}>
                        Добавить ссылку
                      </Button>
                    </Paper>
                  </Grid>
                )}
              </Grid>
            </Grid>
          </Grid>
        </Stack>
      </Box>

      <Dialog open={folderDialogOpen} onClose={() => setFolderDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingFolder ? 'Редактировать папку' : 'Новая папка'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Название" value={folderForm.name} onChange={(event) => setFolderForm((prev) => ({ ...prev, name: event.target.value }))} fullWidth />
            <FormControl fullWidth>
              <InputLabel>Родительская папка</InputLabel>
              <Select
                label="Родительская папка"
                value={folderForm.parent_id}
                onChange={(event) => setFolderForm((prev) => ({ ...prev, parent_id: event.target.value === '' ? '' : Number(event.target.value) }))}
              >
                <MenuItem value="">Нет</MenuItem>
                {folderMenuItems
                  .filter((folder) => !editingFolder || !collectDescendantIds(folders, editingFolder.id).has(folder.id))
                  .map((folder) => (
                    <MenuItem key={folder.id} value={folder.id}>
                      {'—'.repeat(depths.get(folder.id) || 0)} {folder.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            <TextField
              label="Описание"
              value={folderForm.description}
              onChange={(event) => setFolderForm((prev) => ({ ...prev, description: event.target.value }))}
              multiline
              minRows={3}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFolderDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveFolder} disabled={saving || !folderForm.name.trim()}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingLink ? 'Редактировать ссылку' : 'Новая ссылка'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Название" value={linkForm.title} onChange={(event) => setLinkForm((prev) => ({ ...prev, title: event.target.value }))} fullWidth />
            <TextField label="Ссылка" value={linkForm.url} onChange={(event) => setLinkForm((prev) => ({ ...prev, url: event.target.value }))} fullWidth />
            <FormControl fullWidth>
              <InputLabel>Папка</InputLabel>
              <Select
                label="Папка"
                value={linkForm.folder_id}
                onChange={(event) => setLinkForm((prev) => ({ ...prev, folder_id: event.target.value === '' ? '' : Number(event.target.value) }))}
              >
                <MenuItem value="">Без папки</MenuItem>
                {folderMenuItems.map((folder) => (
                  <MenuItem key={folder.id} value={folder.id}>
                    {'—'.repeat(depths.get(folder.id) || 0)} {folder.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Описание"
              value={linkForm.description}
              onChange={(event) => setLinkForm((prev) => ({ ...prev, description: event.target.value }))}
              multiline
              minRows={3}
              fullWidth
            />
            <Autocomplete
              multiple
              freeSolo
              options={allTags}
              value={linkForm.tags}
              onChange={(_, value) => setLinkForm((prev) => ({ ...prev, tags: value.map((item) => String(item).trim()).filter(Boolean) }))}
              renderTags={(value, getTagProps) => value.map((option, index) => <Chip label={option} size="small" {...getTagProps({ index })} />)}
              renderInput={(params) => <TextField {...params} label="Теги" placeholder="Введите тег" />}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialogOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveLink} disabled={saving || !linkForm.title.trim() || !linkForm.url.trim()}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};

export default OwnerUsefulLinksPage;
