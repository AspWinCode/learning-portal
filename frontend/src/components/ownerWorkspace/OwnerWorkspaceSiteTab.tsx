import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Slider,
  Snackbar,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import LaptopIcon from '@mui/icons-material/Laptop';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import TabletIcon from '@mui/icons-material/Tablet';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditNoteIcon from '@mui/icons-material/EditNote';
import LayersIcon from '@mui/icons-material/Layers';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PublishIcon from '@mui/icons-material/Publish';
import SaveIcon from '@mui/icons-material/Save';

import { cmsApi, type CmsPageFull, type CmsPageMeta } from '../../services/api';
import { MediaPickerDialog } from './MediaPickerDialog';

// ── Types (mirror landing types) ─────────────────────────────────────────────

type HoverEffect = 'none' | 'scale' | 'lift' | 'glow';
type EntrancePreset = 'none' | 'fade-up' | 'fade-in' | 'zoom-in' | 'slide-left' | 'slide-right';

interface LayerDef {
  id: string;
  section: string;
  src: string;
  x: number;
  y: number;
  w: number;
  opacity: number;
  zIndex: number;
  hoverEffect?: HoverEffect;
}

interface AnimationPreset {
  sectionId: string;
  entrance: EntrancePreset;
}

const SECTION_LABELS: Record<string, string> = {
  hero: 'Герой',
  advantages: 'Преимущества',
  tracks: 'Треки',
  path: 'Путь',
  lms: 'LMS',
  cta_final: 'Финальный CTA',
};

const ENTRANCE_OPTIONS: { value: EntrancePreset; label: string }[] = [
  { value: 'none',       label: 'Без анимации' },
  { value: 'fade-up',    label: 'Появление снизу' },
  { value: 'fade-in',    label: 'Плавное появление' },
  { value: 'zoom-in',    label: 'Масштабирование' },
  { value: 'slide-left', label: 'Слайд слева' },
  { value: 'slide-right',label: 'Слайд справа' },
];

const HOVER_OPTIONS: { value: HoverEffect; label: string }[] = [
  { value: 'none',  label: 'Нет' },
  { value: 'scale', label: 'Увеличение' },
  { value: 'lift',  label: 'Подъём' },
  { value: 'glow',  label: 'Свечение' },
];

// ── Page groups for the sidebar ──────────────────────────────────────────────

const PAGE_GROUPS: Array<{ label: string; slugs: string[] }> = [
  {
    label: 'Основные',
    slugs: ['home', 'o-nas', 'kontakty', 'faq'],
  },
  {
    label: 'Треки',
    slugs: ['game-studio', 'kodeks', 'technolab'],
  },
  {
    label: 'Услуги',
    slugs: [
      'besplatnyj-probnyj-urok',
      'individualnye-zanyatiya',
      'podgotovka-k-oge-po-informatike',
      'podgotovka-k-ege-po-informatike',
    ],
  },
  {
    label: 'Контент',
    slugs: [
      'dostizheniya-uchenikov',
      'aktivnosti',
      'igrovye-dzhemy',
      'blog',
    ],
  },
  {
    label: 'Направления',
    slugs: [
      'programmirovanie-dlya-detej',
      'python-dlya-detej',
      'razrabotka-igr-na-python',
      'backend-razrabotka',
      'frontend-razrabotka',
      'napravleniya-razrabotki',
    ],
  },
  {
    label: 'Служебные',
    slugs: ['header', 'footer', 'branding', 'announcement'],
  },
  {
    label: 'Юридические',
    slugs: ['legal-oferta', 'legal-privacy', 'legal-terms'],
  },
];

// ── postMessage protocol ─────────────────────────────────────────────────────

type OutboundMsg =
  | { type: 'INIT'; content: unknown; mode: 'edit' | 'preview' }
  | { type: 'SET_CONTENT'; content: unknown }
  | { type: 'HIGHLIGHT_SLOT'; slotId: string }
  | { type: 'ADD_LAYER'; layer: LayerDef }
  | { type: 'REMOVE_LAYER'; id: string };

type InboundMsg =
  | { type: 'READY' }
  | { type: 'CONTENT_CHANGED'; content: unknown }
  | { type: 'SLOT_SELECTED'; slotId: string };

// ── Status chip ──────────────────────────────────────────────────────────────

type PageStatus = 'published' | 'draft' | 'unchanged';

function statusChip(status: PageStatus) {
  if (status === 'published')
    return <Chip size="small" color="success" icon={<CheckCircleOutlineIcon />} label="Опубликовано" />;
  if (status === 'draft')
    return <Chip size="small" color="warning" icon={<EditNoteIcon />} label="Есть черновик" />;
  return <Chip size="small" variant="outlined" label="Без изменений" />;
}

function resolvePageStatus(page: CmsPageFull | null): PageStatus {
  if (!page) return 'unchanged';
  if (page.draft_version && !page.published_version) return 'draft';
  if (page.draft_version && page.published_version) {
    return page.draft_version.created_at > page.published_version.created_at ? 'draft' : 'published';
  }
  if (page.published_version) return 'published';
  return 'unchanged';
}

// ── Landing URL ──────────────────────────────────────────────────────────────

const LANDING_BASE = import.meta.env.VITE_LANDING_URL ?? 'https://tirskix-academy.com';
const LANDING_ORIGIN = new URL(LANDING_BASE).origin;

function landingEditUrl(slug: string) {
  const path = slug === 'home' ? '/' : `/${slug}`;
  return `${LANDING_BASE}${path}?edit=1`;
}

// ── Component ────────────────────────────────────────────────────────────────

export const OwnerWorkspaceSiteTab: React.FC = () => {
  const [pages, setPages] = useState<CmsPageMeta[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string>('home');
  const [pageData, setPageData] = useState<CmsPageFull | null>(null);
  const [pageLoading, setPageLoading] = useState(false);

  // local draft content (accumulated from iframe edits)
  const [draftContent, setDraftContent] = useState<unknown>(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);

  const [iframeReady, setIframeReady] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; severity: 'success' | 'error' } | null>(null);

  // ── Breakpoint mode ──────────────────────────────────────────────────────
  type BpMode = 'mobile' | 'tablet' | 'desktop';
  const [bpMode, setBpMode] = useState<BpMode>('desktop');
  const BP_IFRAME_WIDTH: Record<BpMode, string> = {
    mobile: '390px',
    tablet: '768px',
    desktop: '100%',
  };

  // ── Layer panel state ────────────────────────────────────────────────────
  const [layerFormOpen, setLayerFormOpen] = useState(false);
  const [newLayerSrc, setNewLayerSrc] = useState('');
  const [newLayerSection, setNewLayerSection] = useState('hero');
  const [newLayerW, setNewLayerW] = useState(0.3);
  const [newLayerOpacity, setNewLayerOpacity] = useState(1);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);

  // ── Load page list ──────────────────────────────────────────────────────

  useEffect(() => {
    cmsApi.listPages().then((list) => {
      setPages(list);
      setPagesLoading(false);
    });
  }, []);

  // ── Load selected page data ─────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setPageLoading(true);
    setIframeReady(false);
    setIframeLoading(true);
    setDraftContent(null);
    setHasUnsaved(false);

    cmsApi.getPage(selectedSlug).then((data) => {
      if (cancelled) return;
      setPageData(data);
      // start with draft content if available, otherwise published/legacy
      const initial = data.draft_version ? data.content : data.content;
      setDraftContent(initial);
      setPageLoading(false);
    });

    return () => { cancelled = true; };
  }, [selectedSlug]);

  // ── postMessage: send to iframe ─────────────────────────────────────────

  const sendToIframe = useCallback((msg: OutboundMsg) => {
    iframeRef.current?.contentWindow?.postMessage(msg, LANDING_ORIGIN);
  }, []);

  // ── postMessage: receive from iframe ───────────────────────────────────

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== LANDING_ORIGIN) return;
      const msg = event.data as InboundMsg;
      if (msg.type === 'READY') {
        setIframeReady(true);
        setIframeLoading(false);
      } else if (msg.type === 'CONTENT_CHANGED') {
        setDraftContent(msg.content);
        setHasUnsaved(true);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // ── Send INIT after iframe is ready ────────────────────────────────────

  useEffect(() => {
    if (!iframeReady || draftContent === null) return;
    sendToIframe({ type: 'INIT', content: draftContent, mode: 'edit' });
  }, [iframeReady, draftContent, sendToIframe]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleSaveDraft = async () => {
    if (!draftContent) return;
    setSaving(true);
    try {
      const updated = await cmsApi.savePage(selectedSlug, draftContent);
      setPageData(updated);
      setHasUnsaved(false);
      setSnack({ msg: 'Черновик сохранён', severity: 'success' });
    } catch {
      setSnack({ msg: 'Не удалось сохранить черновик', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = () => {
    if (draftContent !== null) {
      sendToIframe({ type: 'SET_CONTENT', content: draftContent });
    }
    const path = selectedSlug === 'home' ? '/' : `/${selectedSlug}`;
    window.open(`${LANDING_BASE}${path}?preview=1`, '_blank', 'noopener,noreferrer');
  };

  const handlePublish = async () => {
    if (hasUnsaved) {
      setSnack({ msg: 'Сначала сохраните черновик', severity: 'error' });
      return;
    }
    setPublishing(true);
    try {
      const updated = await cmsApi.publishPage(selectedSlug);
      setPageData(updated);
      setSnack({ msg: 'Страница опубликована', severity: 'success' });
    } catch {
      setSnack({ msg: 'Не удалось опубликовать', severity: 'error' });
    } finally {
      setPublishing(false);
    }
  };

  const handleSelectPage = (slug: string) => {
    if (slug === selectedSlug) return;
    setSelectedSlug(slug);
    setIframeReady(false);
    setIframeLoading(true);
  };

  // ── Layer helpers ────────────────────────────────────────────────────────

  function getLayers(): LayerDef[] {
    return ((draftContent as Record<string, unknown> | null)?._layers as LayerDef[] | undefined) ?? [];
  }

  const handleAddLayer = () => {
    if (!newLayerSrc.trim()) return;
    const layer: LayerDef = {
      id: crypto.randomUUID(),
      section: newLayerSection,
      src: newLayerSrc.trim(),
      x: 0.05,
      y: 0.05,
      w: newLayerW,
      opacity: newLayerOpacity,
      zIndex: 10 + getLayers().length,
    };
    const nextLayers = [...getLayers(), layer];
    const nextContent = { ...(draftContent as Record<string, unknown> ?? {}), _layers: nextLayers };
    setDraftContent(nextContent);
    setHasUnsaved(true);
    sendToIframe({ type: 'ADD_LAYER', layer });
    setNewLayerSrc('');
    setLayerFormOpen(false);
  };

  const handleDeleteLayer = (id: string) => {
    const nextLayers = getLayers().filter(l => l.id !== id);
    const nextContent = { ...(draftContent as Record<string, unknown> ?? {}), _layers: nextLayers };
    setDraftContent(nextContent);
    setHasUnsaved(true);
    sendToIframe({ type: 'REMOVE_LAYER', id });
  };

  const handleUpdateLayerEffect = (id: string, hoverEffect: HoverEffect) => {
    const nextLayers = getLayers().map(l => l.id === id ? { ...l, hoverEffect } : l);
    const nextContent = { ...(draftContent as Record<string, unknown> ?? {}), _layers: nextLayers };
    setDraftContent(nextContent);
    setHasUnsaved(true);
    // Re-send full content so iframe updates the layer hoverEffect
    sendToIframe({ type: 'SET_CONTENT', content: nextContent });
  };

  // ── Animation helpers ────────────────────────────────────────────────────

  function getAnimations(): AnimationPreset[] {
    return ((draftContent as Record<string, unknown> | null)?._animations as AnimationPreset[] | undefined) ?? [];
  }

  function getEntrancePreset(sectionId: string): EntrancePreset {
    return getAnimations().find(a => a.sectionId === sectionId)?.entrance ?? 'none';
  }

  const handleSetEntrance = (sectionId: string, entrance: EntrancePreset) => {
    const existing = getAnimations();
    const nextAnimations = existing.some(a => a.sectionId === sectionId)
      ? existing.map(a => a.sectionId === sectionId ? { ...a, entrance } : a)
      : [...existing, { sectionId, entrance }];
    const nextContent = { ...(draftContent as Record<string, unknown> ?? {}), _animations: nextAnimations };
    setDraftContent(nextContent);
    setHasUnsaved(true);
    sendToIframe({ type: 'SET_CONTENT', content: nextContent });
  };

  const pageStatus = resolvePageStatus(pageData);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 112px)', overflow: 'hidden' }}>

      {/* ── Left sidebar: page list ── */}
      <Box
        sx={{
          width: 256,
          flexShrink: 0,
          borderRight: '1px solid',
          borderColor: 'divider',
          overflowY: 'auto',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2" color="text.secondary">
            Страницы сайта
          </Typography>
        </Box>
        <Divider />
        {pagesLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          PAGE_GROUPS.map((group) => {
            const groupPages = pages.filter((p) => group.slugs.includes(p.slug));
            if (groupPages.length === 0) return null;
            return (
              <React.Fragment key={group.label}>
                <Typography
                  variant="caption"
                  sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'block', color: 'text.disabled', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}
                >
                  {group.label}
                </Typography>
                <List disablePadding dense>
                  {groupPages.map((p) => (
                    <ListItemButton
                      key={p.slug}
                      selected={p.slug === selectedSlug}
                      onClick={() => handleSelectPage(p.slug)}
                      sx={{ pl: 2, pr: 1, py: 0.75 }}
                    >
                      <ListItemText
                        primary={p.label}
                        primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </React.Fragment>
            );
          })
        )}
      </Box>

      {/* ── Center: iframe canvas ── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Toolbar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            flexShrink: 0,
          }}
        >
          {pageLoading ? (
            <CircularProgress size={16} />
          ) : (
            statusChip(pageStatus)
          )}

          {hasUnsaved && (
            <Chip size="small" color="info" label="Несохранённые правки" />
          )}

          <Box sx={{ flex: 1 }} />

          <ToggleButtonGroup
            size="small"
            exclusive
            value={bpMode}
            onChange={(_, v) => v && setBpMode(v as BpMode)}
            sx={{ mr: 0.5 }}
          >
            <ToggleButton value="mobile" title="Mobile (390px)">
              <PhoneAndroidIcon sx={{ fontSize: 16 }} />
            </ToggleButton>
            <ToggleButton value="tablet" title="Tablet (768px)">
              <TabletIcon sx={{ fontSize: 16 }} />
            </ToggleButton>
            <ToggleButton value="desktop" title="Desktop">
              <LaptopIcon sx={{ fontSize: 16 }} />
            </ToggleButton>
          </ToggleButtonGroup>

          <Box sx={{ width: 1, height: 24, bgcolor: 'divider' }} />

          <Tooltip title="Открыть черновик для предпросмотра в новой вкладке">
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={<OpenInNewIcon />}
                onClick={handlePreview}
                disabled={pageLoading}
              >
                Предпросмотр
              </Button>
            </span>
          </Tooltip>

          <Tooltip title={hasUnsaved ? 'Сохранить черновик (несохранённые правки)' : 'Нет несохранённых правок'}>
            <span>
              <Button
                size="small"
                variant="outlined"
                startIcon={saving ? <CircularProgress size={14} /> : <SaveIcon />}
                onClick={handleSaveDraft}
                disabled={saving || !hasUnsaved || pageLoading}
              >
                Сохранить
              </Button>
            </span>
          </Tooltip>

          <Tooltip title={hasUnsaved ? 'Сначала сохраните черновик' : 'Опубликовать черновик на сайт'}>
            <span>
              <Button
                size="small"
                variant="contained"
                color="success"
                startIcon={publishing ? <CircularProgress size={14} /> : <PublishIcon />}
                onClick={handlePublish}
                disabled={publishing || pageLoading || hasUnsaved || pageStatus === 'unchanged'}
              >
                Опубликовать
              </Button>
            </span>
          </Tooltip>
        </Box>

        {/* Canvas — centred, width constrained by bpMode */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            overflow: 'hidden',
            bgcolor: '#cbd5e1',
          }}
        >
          <Box
            sx={{
              width: BP_IFRAME_WIDTH[bpMode],
              maxWidth: '100%',
              height: '100%',
              position: 'relative',
              bgcolor: 'white',
              transition: 'width 0.3s cubic-bezier(.4,0,.2,1)',
              boxShadow: bpMode !== 'desktop' ? '0 0 0 1px #94a3b8, 0 4px 24px rgba(0,0,0,.15)' : 'none',
            }}
          >
            {(iframeLoading || pageLoading) && (
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1.5,
                  bgcolor: 'white',
                  zIndex: 2,
                }}
              >
                <CircularProgress size={32} />
                <Typography variant="body2" color="text.secondary">
                  Загрузка страницы…
                </Typography>
              </Box>
            )}
            <iframe
              ref={iframeRef}
              key={selectedSlug}
              src={landingEditUrl(selectedSlug)}
              title={`Редактор: ${selectedSlug}`}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                display: iframeLoading ? 'none' : 'block',
              }}
            />
          </Box>
        </Box>
      </Box>

      {/* ── Right panel: versions + layers ── */}
      <Box
        sx={{
          width: 280,
          flexShrink: 0,
          borderLeft: '1px solid',
          borderColor: 'divider',
          overflowY: 'auto',
          bgcolor: 'background.paper',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {/* Versions */}
        <Typography variant="subtitle2">Версии</Typography>
        {pageLoading ? (
          <CircularProgress size={20} />
        ) : (
          <Stack spacing={1.5}>
            {pageData?.draft_version && (
              <Box>
                <Typography variant="caption" color="text.secondary">Черновик</Typography>
                <Typography variant="body2">
                  {new Date(pageData.draft_version.created_at).toLocaleString('ru-RU', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Typography>
              </Box>
            )}
            {pageData?.published_version && (
              <Box>
                <Typography variant="caption" color="text.secondary">Опубликовано</Typography>
                <Typography variant="body2">
                  {new Date(pageData.published_version.published_at ?? pageData.published_version.created_at).toLocaleString('ru-RU', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Typography>
              </Box>
            )}
            {!pageData?.draft_version && !pageData?.published_version && (
              <Typography variant="body2" color="text.secondary">Не редактировалась</Typography>
            )}
          </Stack>
        )}

        <Divider />

        {/* Layers */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <LayersIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography variant="subtitle2">Слои изображений</Typography>
          </Box>
          <Tooltip title="Добавить слой">
            <IconButton size="small" onClick={() => setLayerFormOpen(v => !v)}>
              <AddPhotoAlternateIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Add layer form */}
        <Collapse in={layerFormOpen}>
          <Stack spacing={1.5} sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddPhotoAlternateIcon />}
              onClick={() => setMediaPickerOpen(true)}
              fullWidth
              sx={{
                justifyContent: 'flex-start',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                color: newLayerSrc ? 'text.primary' : 'text.secondary',
                borderStyle: 'dashed',
              }}
            >
              {newLayerSrc
                ? newLayerSrc.split('/').pop() ?? newLayerSrc
                : 'Выбрать из медиатеки…'}
            </Button>
            {newLayerSrc && (
              <Box
                component="img"
                src={newLayerSrc}
                alt=""
                sx={{ width: '100%', maxHeight: 80, objectFit: 'contain', borderRadius: 1, bgcolor: 'divider' }}
              />
            )}
            <Select
              size="small"
              value={newLayerSection}
              onChange={e => setNewLayerSection(e.target.value)}
              fullWidth
            >
              {Object.entries(SECTION_LABELS).map(([k, v]) => (
                <MenuItem key={k} value={k}>{v}</MenuItem>
              ))}
            </Select>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Ширина: {Math.round(newLayerW * 100)}%
              </Typography>
              <Slider
                size="small"
                min={0.05} max={1} step={0.05}
                value={newLayerW}
                onChange={(_, v) => setNewLayerW(v as number)}
              />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Прозрачность: {Math.round(newLayerOpacity * 100)}%
              </Typography>
              <Slider
                size="small"
                min={0.1} max={1} step={0.05}
                value={newLayerOpacity}
                onChange={(_, v) => setNewLayerOpacity(v as number)}
              />
            </Box>
            <Button
              size="small"
              variant="contained"
              onClick={handleAddLayer}
              disabled={!newLayerSrc || !iframeReady}
              startIcon={<AddPhotoAlternateIcon />}
            >
              Добавить
            </Button>
          </Stack>
        </Collapse>

        {/* Layer list */}
        {getLayers().length === 0 ? (
          <Typography variant="caption" color="text.disabled">
            Нет слоёв. Нажмите + чтобы добавить.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {getLayers().map(layer => (
              <Box
                key={layer.id}
                sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1 }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                  <Box
                    component="img"
                    src={layer.src}
                    alt=""
                    sx={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 0.5, flexShrink: 0, bgcolor: 'divider' }}
                    onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" display="block" noWrap>
                      {SECTION_LABELS[layer.section] ?? layer.section}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" display="block">
                      {Math.round(layer.w * 100)}% · {Math.round(layer.opacity * 100)}% op
                    </Typography>
                  </Box>
                  <Tooltip title="Удалить слой">
                    <IconButton size="small" onClick={() => handleDeleteLayer(layer.id)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    Hover:
                  </Typography>
                  <Select
                    size="small"
                    value={layer.hoverEffect ?? 'none'}
                    onChange={e => handleUpdateLayerEffect(layer.id, e.target.value as HoverEffect)}
                    sx={{ flex: 1, fontSize: 12 }}
                  >
                    {HOVER_OPTIONS.map(o => (
                      <MenuItem key={o.value} value={o.value} sx={{ fontSize: 12 }}>{o.label}</MenuItem>
                    ))}
                  </Select>
                </Box>
              </Box>
            ))}
          </Stack>
        )}

        <Divider />

        {/* Animation presets per section */}
        <Typography variant="subtitle2">Анимации секций</Typography>
        <Stack spacing={1}>
          {Object.entries(SECTION_LABELS).map(([sectionId, label]) => (
            <Box key={sectionId}>
              <Typography variant="caption" color="text.secondary" display="block" mb={0.25}>
                {label}
              </Typography>
              <Select
                size="small"
                fullWidth
                value={getEntrancePreset(sectionId)}
                onChange={e => handleSetEntrance(sectionId, e.target.value as EntrancePreset)}
                sx={{ fontSize: 12 }}
                disabled={!iframeReady}
              >
                {ENTRANCE_OPTIONS.map(o => (
                  <MenuItem key={o.value} value={o.value} sx={{ fontSize: 12 }}>{o.label}</MenuItem>
                ))}
              </Select>
            </Box>
          ))}
        </Stack>

        <Divider />

        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Кликайте по тексту в холсте, чтобы редактировать. Перетаскивайте слои прямо в iframe. Изменения не влияют на сайт до публикации.
        </Typography>
      </Box>

      {/* ── Media picker ── */}
      <MediaPickerDialog
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(url) => {
          setNewLayerSrc(url);
          setMediaPickerOpen(false);
        }}
      />

      {/* ── Snackbar ── */}
      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snack ? (
          <Alert severity={snack.severity} onClose={() => setSnack(null)} variant="filled">
            {snack.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
};
