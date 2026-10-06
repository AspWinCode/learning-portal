import { describe, expect, it } from 'vitest';
import { buildPasteMatrix, parseClipboardText, toPasteCells, toTsv, totalCells } from './clipboard';

describe('parseClipboardText', () => {
  it('parses a single cell', () => {
    expect(parseClipboardText('Hello')).toEqual([['Hello']]);
  });

  it('parses a 2x3 TSV block', () => {
    const text = 'Иван\t15\tМосква\nПётр\t20\tИркутск';
    expect(parseClipboardText(text)).toEqual([
      ['Иван', '15', 'Москва'],
      ['Пётр', '20', 'Иркутск'],
    ]);
  });

  it('handles \\r\\n line endings', () => {
    const text = 'a\tb\r\nc\td';
    expect(parseClipboardText(text)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('drops a single trailing newline without adding a fake row', () => {
    const text = 'a\tb\n';
    expect(parseClipboardText(text)).toEqual([['a', 'b']]);
  });

  it('preserves internal empty rows', () => {
    const text = 'a\n\nb';
    expect(parseClipboardText(text)).toEqual([['a'], [''], ['b']]);
  });

  it('preserves an empty middle cell', () => {
    expect(parseClipboardText('a\t\tb')).toEqual([['a', '', 'b']]);
  });
});

describe('buildPasteMatrix', () => {
  it('tiles a single clipboard value to fill a larger selection', () => {
    const result = buildPasteMatrix([['Hello']], { rows: 2, cols: 3 });
    expect(result).toEqual([
      ['Hello', 'Hello', 'Hello'],
      ['Hello', 'Hello', 'Hello'],
    ]);
  });

  it('anchors a multi-cell clipboard at top-left without cropping or tiling', () => {
    const clipboard = [['a', 'b'], ['c', 'd']];
    expect(buildPasteMatrix(clipboard, { rows: 1, cols: 1 })).toEqual(clipboard);
    expect(buildPasteMatrix(clipboard, { rows: 5, cols: 5 })).toEqual(clipboard);
  });

  it('leaves a single clipboard value alone when selection is also a single cell', () => {
    expect(buildPasteMatrix([['x']], { rows: 1, cols: 1 })).toEqual([['x']]);
  });
});

describe('toPasteCells', () => {
  it('maps a formula cell to {formula}', () => {
    expect(toPasteCells([['=A1+B1']])).toEqual([[{ formula: '=A1+B1' }]]);
  });

  it('maps an empty cell to an explicit null value', () => {
    expect(toPasteCells([['']])).toEqual([[{ value: null }]]);
  });

  it('maps a plain cell to a raw string value (backend handles coercion)', () => {
    expect(toPasteCells([['42'], ['true']])).toEqual([[{ value: '42' }], [{ value: 'true' }]]);
  });

  it('a lone "=" is not treated as a formula', () => {
    expect(toPasteCells([['=']])).toEqual([[{ value: '=' }]]);
  });
});

describe('toTsv / totalCells', () => {
  it('round-trips a matrix to TSV', () => {
    expect(toTsv([['a', 'b'], ['c', null]])).toBe('a\tb\nc\t');
  });

  it('counts total cells across ragged rows', () => {
    expect(totalCells([['a', 'b', 'c'], ['d']])).toBe(4);
  });
});
