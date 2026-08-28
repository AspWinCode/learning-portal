// ТехноЛаб рендерит лекции/описания задач через react-markdown (без rehype-raw,
// то есть чистый Markdown, HTML-теги не интерпретируются). Rich-text редактор
// (NotesEditor, Tiptap) работает с HTML — эти хелперы конвертируют туда и обратно
// на границе с API ТехноЛаб.
import { marked } from 'marked';
import TurndownService from 'turndown';
// @ts-ignore — turndown-plugin-gfm не публикует типы
import { gfm } from 'turndown-plugin-gfm';

marked.setOptions({ breaks: true, gfm: true });

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
});
turndown.use(gfm);

export function markdownToHtml(md: string): string {
  if (!md) return '';
  return marked.parse(md, { async: false }) as string;
}

export function htmlToMarkdown(html: string): string {
  if (!html || html === '<p></p>') return '';
  return turndown.turndown(html).trim();
}
