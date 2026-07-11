import React, { useEffect, useState, useCallback } from 'react';
import {
  Alert, Box, Button, CircularProgress, Chip, IconButton,
  List, ListItemButton, ListItemText, Paper, Stack,
  Tab, Tabs, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import Layout from '../../components/Layout';
import { cmsApi } from '../../services/api';
import { extractApiError } from '../../utils/extractApiError';

// ─── Default content per page ──────────────────────────────────────────────

const DEFAULTS: Record<string, unknown> = {
  home: {
    hero: {
      badge: 'Набор открыт · Пробный урок бесплатно',
      h1: 'От хобби —',
      h1_accent: 'к вершинам IT',
      subtitle: 'Три мира программирования для детей 10–18 лет. Не курсы — путешествие: от первой игры до олимпиад и поступления в лучшие вузы.',
      bullets: ['Онлайн, в удобное время', 'Менторы-практики из IT', 'Результаты уже через 3 месяца'],
      cta_primary: 'Оставить заявку',
      cta_secondary: 'Узнать о треках',
    },
    stats: [
      { value: '2 БВИ', label: 'без вступительных испытаний в вузы', highlight: true },
      { value: '19/21', label: 'ОГЭ с нуля за 6 месяцев', highlight: false },
      { value: '98', label: 'баллов ЕГЭ — лучший результат', highlight: false },
      { value: 'ICPC', label: 'полуфинал международной олимпиады', highlight: true },
    ],
    reviews: [
      { name: 'Мария К.', role: 'Мама Димы, 14 лет', text: 'Сын в восторге от занятий. За 8 месяцев написал три игры!', initials: 'МК' },
      { name: 'Алексей П.', role: 'Папа Кирилла, 16 лет', text: 'ЕГЭ по информатике написал на 93 балла. Очень доволен.', initials: 'АП' },
      { name: 'Светлана В.', role: 'Мама Ани, 17 лет', text: 'Аня стала призёром Всероссийской олимпиады и получила БВИ.', initials: 'СВ' },
    ],
  },
  faq: {
    sections: [
      {
        title: 'О школе и формате',
        items: [
          { q: 'Что такое TirSkix Academy?', a: 'TirSkix Academy — онлайн-школа программирования для детей и подростков 10–18 лет.' },
        ],
      },
    ],
  },
  'o-nas': {
    hero: {
      h1: 'Мы учим детей',
      h1_accent: 'думать как разработчики',
      subtitle: 'TirSkix Academy — онлайн-школа программирования для детей и подростков 10–18 лет. С 2020 года помогаем ребятам найти свой путь в IT.',
    },
    story: {
      heading: 'Как мы начинали',
      paragraphs: [
        'В 2020 году Кирилл Тирских провёл первый урок программирования для детей соседей.',
        'Он попробовал иначе: дал ребятам задачу — написать детективную программу.',
        'Сегодня в TirSkix Academy три трека, команда менторов-практиков и сотни учеников.',
      ],
    },
    values: [
      { emoji: '🔍', title: 'Любопытство', desc: 'Мы культивируем вопрос «А что будет, если...».' },
      { emoji: '💪', title: 'Упорство', desc: 'Баги — это нормально. Не сдаться — это навык.' },
      { emoji: '🎨', title: 'Творчество', desc: 'Программирование — это ремесло и искусство одновременно.' },
    ],
    team: [
      { name: 'Кирилл Тирских', role: 'Основатель и директор', initials: 'КТ', bio: 'Разработчик с 10-летним опытом.', specialization: 'Python, алгоритмы, архитектура' },
    ],
    stats: [
      { value: '4 года', label: 'средний срок обучения' },
      { value: '2 БВИ', label: 'без вступительных в вузы' },
      { value: '98 б.', label: 'ЕГЭ по информатике' },
      { value: 'ICPC', label: 'полуфинал олимпиады' },
    ],
  },
  kontakty: {
    hero: { heading: 'Контакты', subtitle: 'Напишите нам — ответим в течение часа.' },
    extra_text: '',
  },
};

const PAGES = [
  { slug: 'home', label: 'Главная' },
  { slug: 'faq', label: 'FAQ' },
  { slug: 'o-nas', label: 'О нас' },
  { slug: 'kontakty', label: 'Контакты' },
];

// ─── Small helpers ────────────────────────────────────────────────────────────

function TF({ label, value, onChange, multiline = false, rows = 1 }: {
  label: string; value: string; onChange: (v: string) => void;
  multiline?: boolean; rows?: number;
}) {
  return (
    <TextField
      label={label} value={value || ''} fullWidth size="small"
      multiline={multiline} minRows={multiline ? rows : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ─── Home editor ──────────────────────────────────────────────────────────────

function HomeEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const hero = content.hero || {};
  const stats: any[] = content.stats || [];
  const reviews: any[] = content.reviews || [];
  const [tab, setTab] = useState(0);

  const setHero = (k: string, v: string) => onChange({ ...content, hero: { ...hero, [k]: v } });

  const setBullet = (i: number, v: string) => {
    const b = [...(hero.bullets || [])]; b[i] = v;
    onChange({ ...content, hero: { ...hero, bullets: b } });
  };
  const addBullet = () => onChange({ ...content, hero: { ...hero, bullets: [...(hero.bullets || []), ''] } });
  const removeBullet = (i: number) => onChange({ ...content, hero: { ...hero, bullets: (hero.bullets || []).filter((_: string, idx: number) => idx !== i) } });

  const setStat = (i: number, k: string, v: string | boolean) =>
    onChange({ ...content, stats: stats.map((s, idx) => idx === i ? { ...s, [k]: v } : s) });
  const addStat = () => onChange({ ...content, stats: [...stats, { value: '', label: '', highlight: false }] });
  const removeStat = (i: number) => onChange({ ...content, stats: stats.filter((_, idx) => idx !== i) });

  const setReview = (i: number, k: string, v: string) =>
    onChange({ ...content, reviews: reviews.map((r, idx) => idx === i ? { ...r, [k]: v } : r) });
  const addReview = () => onChange({ ...content, reviews: [...reviews, { name: '', role: '', text: '', initials: '' }] });
  const removeReview = (i: number) => onChange({ ...content, reviews: reviews.filter((_, idx) => idx !== i) });

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Герой" />
        <Tab label={`Статистика (${stats.length})`} />
        <Tab label={`Отзывы (${reviews.length})`} />
      </Tabs>

      {tab === 0 && (
        <Stack spacing={2}>
          <TF label="Бейдж" value={hero.badge} onChange={(v) => setHero('badge', v)} />
          <Stack direction="row" spacing={2}>
            <TF label="Заголовок H1" value={hero.h1} onChange={(v) => setHero('h1', v)} />
            <TF label="H1 акцент (цветной)" value={hero.h1_accent} onChange={(v) => setHero('h1_accent', v)} />
          </Stack>
          <TF label="Подзаголовок" value={hero.subtitle} onChange={(v) => setHero('subtitle', v)} multiline rows={2} />
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Буллеты (✓ список)</Typography>
            <Stack spacing={1}>
              {(hero.bullets || []).map((b: string, i: number) => (
                <Stack direction="row" spacing={1} key={i} alignItems="center">
                  <DragIndicatorIcon fontSize="small" sx={{ color: 'text.disabled' }} />
                  <TextField size="small" fullWidth value={b} onChange={(e) => setBullet(i, e.target.value)} />
                  <IconButton size="small" onClick={() => removeBullet(i)}><DeleteIcon fontSize="small" /></IconButton>
                </Stack>
              ))}
              <Button size="small" startIcon={<AddIcon />} onClick={addBullet} sx={{ alignSelf: 'flex-start' }}>Добавить</Button>
            </Stack>
          </Box>
          <Stack direction="row" spacing={2}>
            <TF label="Кнопка (основная)" value={hero.cta_primary} onChange={(v) => setHero('cta_primary', v)} />
            <TF label="Кнопка (вторичная)" value={hero.cta_secondary} onChange={(v) => setHero('cta_secondary', v)} />
          </Stack>
        </Stack>
      )}

      {tab === 1 && (
        <Stack spacing={2}>
          {stats.map((stat, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Значение" value={stat.value} onChange={(v) => setStat(i, 'value', v)} />
                  <TF label="Подпись" value={stat.label} onChange={(v) => setStat(i, 'label', v)} />
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption">Выделенная (фиолетовый фон):</Typography>
                  <Chip size="small" label={stat.highlight ? 'Да' : 'Нет'} color={stat.highlight ? 'primary' : 'default'}
                    onClick={() => setStat(i, 'highlight', !stat.highlight)} sx={{ cursor: 'pointer' }} />
                  <Box flex={1} />
                  <IconButton size="small" onClick={() => removeStat(i)}><DeleteIcon fontSize="small" /></IconButton>
                </Stack>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={addStat} variant="outlined" size="small">Добавить статистику</Button>
        </Stack>
      )}

      {tab === 2 && (
        <Stack spacing={2}>
          {reviews.map((r, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Имя" value={r.name} onChange={(v) => setReview(i, 'name', v)} />
                  <TF label="Роль" value={r.role} onChange={(v) => setReview(i, 'role', v)} />
                  <TF label="Инициалы" value={r.initials} onChange={(v) => setReview(i, 'initials', v)} />
                </Stack>
                <TF label="Текст отзыва" value={r.text} onChange={(v) => setReview(i, 'text', v)} multiline rows={3} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => removeReview(i)}><DeleteIcon fontSize="small" /></IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={addReview} variant="outlined" size="small">Добавить отзыв</Button>
        </Stack>
      )}
    </Box>
  );
}

// ─── FAQ editor ───────────────────────────────────────────────────────────────

function FaqEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const sections: any[] = content.sections || [];

  const setSection = (i: number, k: string, v: any) =>
    onChange({ ...content, sections: sections.map((s, idx) => idx === i ? { ...s, [k]: v } : s) });
  const addSection = () => onChange({ ...content, sections: [...sections, { title: 'Новый раздел', items: [] }] });
  const removeSection = (i: number) => onChange({ ...content, sections: sections.filter((_, idx) => idx !== i) });

  const setItem = (si: number, ii: number, k: string, v: string) => {
    const items = sections[si].items.map((item: any, idx: number) => idx === ii ? { ...item, [k]: v } : item);
    setSection(si, 'items', items);
  };
  const addItem = (si: number) => setSection(si, 'items', [...(sections[si].items || []), { q: '', a: '' }]);
  const removeItem = (si: number, ii: number) =>
    setSection(si, 'items', sections[si].items.filter((_: any, idx: number) => idx !== ii));

  return (
    <Stack spacing={3}>
      {sections.map((sec, si) => (
        <Paper key={si} variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center" mb={2}>
            <TextField label="Название раздела" size="small" fullWidth value={sec.title || ''}
              onChange={(e) => setSection(si, 'title', e.target.value)} />
            <IconButton onClick={() => removeSection(si)} color="error"><DeleteIcon /></IconButton>
          </Stack>
          <Stack spacing={2} sx={{ pl: 1 }}>
            {(sec.items || []).map((item: any, ii: number) => (
              <Paper key={ii} variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                <Stack spacing={1.5}>
                  <TextField label="Вопрос" size="small" fullWidth value={item.q || ''}
                    onChange={(e) => setItem(si, ii, 'q', e.target.value)} />
                  <TextField label="Ответ" size="small" fullWidth multiline minRows={2} value={item.a || ''}
                    onChange={(e) => setItem(si, ii, 'a', e.target.value)} />
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <IconButton size="small" onClick={() => removeItem(si, ii)}><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                </Stack>
              </Paper>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={() => addItem(si)}>Добавить вопрос</Button>
          </Stack>
        </Paper>
      ))}
      <Button startIcon={<AddIcon />} onClick={addSection} variant="outlined">Добавить раздел</Button>
    </Stack>
  );
}

// ─── About editor ─────────────────────────────────────────────────────────────

function AboutEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const hero = content.hero || {};
  const story = content.story || {};
  const values: any[] = content.values || [];
  const team: any[] = content.team || [];
  const stats: any[] = content.stats || [];
  const [tab, setTab] = useState(0);

  const patchSection = (section: string, k: string, v: any) =>
    onChange({ ...content, [section]: { ...(content[section] || {}), [k]: v } });

  const setPara = (i: number, v: string) => {
    const p = [...(story.paragraphs || [])]; p[i] = v;
    onChange({ ...content, story: { ...story, paragraphs: p } });
  };
  const addPara = () => onChange({ ...content, story: { ...story, paragraphs: [...(story.paragraphs || []), ''] } });
  const removePara = (i: number) => onChange({ ...content, story: { ...story, paragraphs: (story.paragraphs || []).filter((_: string, idx: number) => idx !== i) } });

  const setVal = (i: number, k: string, v: string) =>
    onChange({ ...content, values: values.map((x, idx) => idx === i ? { ...x, [k]: v } : x) });
  const addVal = () => onChange({ ...content, values: [...values, { emoji: '⭐', title: '', desc: '' }] });
  const removeVal = (i: number) => onChange({ ...content, values: values.filter((_, idx) => idx !== i) });

  const setMember = (i: number, k: string, v: string) =>
    onChange({ ...content, team: team.map((x, idx) => idx === i ? { ...x, [k]: v } : x) });
  const addMember = () => onChange({ ...content, team: [...team, { name: '', role: '', initials: '', bio: '', specialization: '' }] });
  const removeMember = (i: number) => onChange({ ...content, team: team.filter((_, idx) => idx !== i) });

  const setStat = (i: number, k: string, v: string) =>
    onChange({ ...content, stats: stats.map((x, idx) => idx === i ? { ...x, [k]: v } : x) });
  const addStat = () => onChange({ ...content, stats: [...stats, { value: '', label: '' }] });
  const removeStat = (i: number) => onChange({ ...content, stats: stats.filter((_, idx) => idx !== i) });

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Герой" />
        <Tab label="История" />
        <Tab label={`Ценности (${values.length})`} />
        <Tab label={`Команда (${team.length})`} />
        <Tab label={`Статистика (${stats.length})`} />
      </Tabs>

      {tab === 0 && (
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <TF label="H1 (первая часть)" value={hero.h1} onChange={(v) => patchSection('hero', 'h1', v)} />
            <TF label="H1 акцент (цветной)" value={hero.h1_accent} onChange={(v) => patchSection('hero', 'h1_accent', v)} />
          </Stack>
          <TF label="Подзаголовок" value={hero.subtitle} onChange={(v) => patchSection('hero', 'subtitle', v)} multiline rows={2} />
        </Stack>
      )}

      {tab === 1 && (
        <Stack spacing={2}>
          <TF label="Заголовок" value={story.heading} onChange={(v) => patchSection('story', 'heading', v)} />
          <Typography variant="caption" color="text.secondary">Абзацы:</Typography>
          {(story.paragraphs || []).map((p: string, i: number) => (
            <Stack direction="row" spacing={1} key={i} alignItems="flex-start">
              <TextField size="small" fullWidth multiline minRows={2} value={p} onChange={(e) => setPara(i, e.target.value)} />
              <IconButton size="small" onClick={() => removePara(i)}><DeleteIcon fontSize="small" /></IconButton>
            </Stack>
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={addPara} sx={{ alignSelf: 'flex-start' }}>Добавить абзац</Button>
        </Stack>
      )}

      {tab === 2 && (
        <Stack spacing={2}>
          {values.map((v, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Эмодзи" value={v.emoji} onChange={(val) => setVal(i, 'emoji', val)} />
                  <TF label="Заголовок" value={v.title} onChange={(val) => setVal(i, 'title', val)} />
                </Stack>
                <TF label="Описание" value={v.desc} onChange={(val) => setVal(i, 'desc', val)} multiline rows={2} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => removeVal(i)}><DeleteIcon fontSize="small" /></IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={addVal} variant="outlined" size="small">Добавить ценность</Button>
        </Stack>
      )}

      {tab === 3 && (
        <Stack spacing={2}>
          {team.map((m, i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={2}>
                  <TF label="Имя" value={m.name} onChange={(v) => setMember(i, 'name', v)} />
                  <TF label="Должность" value={m.role} onChange={(v) => setMember(i, 'role', v)} />
                  <TF label="Инициалы" value={m.initials} onChange={(v) => setMember(i, 'initials', v)} />
                </Stack>
                <TF label="Биография" value={m.bio} onChange={(v) => setMember(i, 'bio', v)} multiline rows={2} />
                <TF label="Специализация" value={m.specialization} onChange={(v) => setMember(i, 'specialization', v)} />
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => removeMember(i)}><DeleteIcon fontSize="small" /></IconButton>
                </Box>
              </Stack>
            </Paper>
          ))}
          <Button startIcon={<AddIcon />} onClick={addMember} variant="outlined" size="small">Добавить члена команды</Button>
        </Stack>
      )}

      {tab === 4 && (
        <Stack spacing={2}>
          {stats.map((s, i) => (
            <Stack key={i} direction="row" spacing={2} alignItems="center">
              <TF label="Значение" value={s.value} onChange={(v) => setStat(i, 'value', v)} />
              <TF label="Подпись" value={s.label} onChange={(v) => setStat(i, 'label', v)} />
              <IconButton onClick={() => removeStat(i)}><DeleteIcon /></IconButton>
            </Stack>
          ))}
          <Button startIcon={<AddIcon />} onClick={addStat} variant="outlined" size="small">Добавить</Button>
        </Stack>
      )}
    </Box>
  );
}

// ─── Contacts editor ──────────────────────────────────────────────────────────

function ContactsEditor({ content, onChange }: { content: any; onChange: (c: any) => void }) {
  const hero = content.hero || {};
  return (
    <Stack spacing={2}>
      <Alert severity="info">Телефон, email и соцсети — в «Настройки сайта». Здесь — тексты самой страницы.</Alert>
      <TF label="Заголовок страницы" value={hero.heading} onChange={(v) => onChange({ ...content, hero: { ...hero, heading: v } })} />
      <TF label="Подзаголовок" value={hero.subtitle} onChange={(v) => onChange({ ...content, hero: { ...hero, subtitle: v } })} multiline rows={2} />
      <TF label="Дополнительный текст (опционально)" value={content.extra_text || ''} onChange={(v) => onChange({ ...content, extra_text: v })} multiline rows={3} />
    </Stack>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const CmsEditorPage: React.FC = () => {
  const [selectedSlug, setSelectedSlug] = useState('home');
  const [content, setContent] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (slug: string) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const data = await cmsApi.getPage(slug);
      const c = data.content && typeof data.content === 'object' && Object.keys(data.content as object).length > 0
        ? data.content
        : DEFAULTS[slug] || {};
      setContent(c);
    } catch {
      setContent(DEFAULTS[slug] || {});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPage(selectedSlug); }, [selectedSlug, loadPage]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await cmsApi.savePage(selectedSlug, content);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      setError(extractApiError(e, 'Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  };

  const selectedPage = PAGES.find((p) => p.slug === selectedSlug)!;

  return (
    <Layout>
      <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
        {/* Sidebar */}
        <Box sx={{ width: 200, borderRight: 1, borderColor: 'divider', flexShrink: 0, overflow: 'auto' }}>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: 11 }}>
              Страницы
            </Typography>
          </Box>
          <List dense disablePadding>
            {PAGES.map((page) => (
              <ListItemButton key={page.slug} selected={selectedSlug === page.slug} onClick={() => setSelectedSlug(page.slug)}>
                <ListItemText primary={page.label} primaryTypographyProps={{ fontSize: 14 }} />
              </ListItemButton>
            ))}
          </List>
        </Box>

        {/* Editor area */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Box>
              <Typography variant="h6" fontWeight={700}>{selectedPage?.label}</Typography>
              <Typography variant="caption" color="text.secondary">
                tirskix-academy.com/{selectedSlug === 'home' ? '' : selectedSlug + '/'}
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
              disabled={saving || loading}
              onClick={handleSave}
            >
              Сохранить
            </Button>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Сохранено. Изменения появятся на лендинге в течение 1 часа (ISR кэш).
            </Alert>
          )}

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Paper sx={{ p: 3 }}>
              {selectedSlug === 'home' && <HomeEditor content={content} onChange={setContent} />}
              {selectedSlug === 'faq' && <FaqEditor content={content} onChange={setContent} />}
              {selectedSlug === 'o-nas' && <AboutEditor content={content} onChange={setContent} />}
              {selectedSlug === 'kontakty' && <ContactsEditor content={content} onChange={setContent} />}
            </Paper>
          )}
        </Box>
      </Box>
    </Layout>
  );
};

export default CmsEditorPage;
