import type { PasteCell } from '../../types/smartTables';

// Чистые функции разбора/сборки clipboard-матрицы для paste/copy в Grid —
// вынесены отдельно от Grid.tsx, чтобы покрыть unit-тестами без рендера.

export const MAX_PASTE_CELLS = 5000;

/** Разбивает TSV-текст из clipboard на матрицу строк: строки по \r\n|\r|\n, колонки по \t.
 * Один конечный перевод строки (как часто копирует Excel) не создаёт лишнюю пустую строку;
 * внутренние пустые строки сохраняются. */
export function parseClipboardText(text: string): string[][] {
  const hadTrailingNewline = /\r\n|\r|\n$/.test(text);
  const lines = text.split(/\r\n|\r|\n/);
  if (hadTrailingNewline && lines.length > 1 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.map((line) => line.split('\t'));
}

/** Если clipboard — одна ячейка, а выделение больше, размножает значение на всё выделение.
 * Иначе возвращает matrix как есть (вставка всегда идёт от top-left выделения, без обрезки
 * и без repeat-tiling многоячеечного clipboard). */
export function buildPasteMatrix(
  clipboard: string[][],
  selection: { rows: number; cols: number },
): string[][] {
  const isSingleCell = clipboard.length === 1 && clipboard[0]?.length === 1;
  if (isSingleCell && selection.rows * selection.cols > 1) {
    const value = clipboard[0][0];
    return Array.from({ length: selection.rows }, () => Array.from({ length: selection.cols }, () => value));
  }
  return clipboard;
}

/** Текст -> {value}/{formula}: '=...' распознаётся как формула, '' -> явный null (очистка),
 * иначе сырая строка — её типизацией (число/bool/дата) занимается backend-коэрсия,
 * как и при обычном ручном вводе. */
export function toPasteCells(matrix: string[][]): PasteCell[][] {
  return matrix.map((row) =>
    row.map((text): PasteCell => {
      if (text.startsWith('=') && text.length > 1) return { formula: text };
      if (text === '') return { value: null };
      return { value: text };
    }));
}

/** Для Ctrl+C: собирает TSV из матрицы отображаемых строк (формульные ячейки — по
 * исходному тексту формулы, если он передан, иначе по вычисленному значению). */
export function toTsv(matrix: (string | null)[][]): string {
  return matrix.map((row) => row.map((cell) => cell ?? '').join('\t')).join('\n');
}

export function totalCells(matrix: unknown[][]): number {
  return matrix.reduce((sum, row) => sum + row.length, 0);
}
