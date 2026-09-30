/*
 * THE TWO PIECES OF THE TABLE FURNITURE THAT HAVE A RIGHT ANSWER.
 *
 * Column pinning and the page strip are both mostly layout, and layout is
 * not worth asserting in jsdom - nothing there has a width, so a frozen
 * column has no offset to be parked at and a resize has nothing to measure.
 * What IS worth holding still is the arithmetic underneath both, because
 * getting either wrong is silent:
 *
 *   A PINNED COLUMN THAT IS NOT MOVED TO THE EDGE draws on top of its
 *   neighbours and leaves a gap where it used to be. `position: sticky`
 *   parks a cell at the edge of the scroller but keeps its slot, so the
 *   reorder is not tidiness - it is the thing that makes freezing work.
 *
 *   A PAGE WINDOW OF THE WRONG WIDTH looks completely fine on page 1 of 3,
 *   which is the state a table is usually in while somebody is working on it.
 */
import { orderColumns } from '../components/common/DataTable';
import { pageWindow, PAGE_SIZES } from '../components/common/Pagination';

const COLUMNS = [
  { key: 'a' },
  { key: 'b' },
  { key: 'c' },
  { key: 'd' },
  { key: 'e' }
];

function keysOf(list) {
  return list.map((column) => column.key);
}

function pin(key, side) {
  return COLUMNS.map((column) => (column.key === key ? { ...column, pin: side } : column));
}

/* ------------------------------------------------------------- pinning */

test('an unpinned table keeps the order it was declared in', () => {
  const layout = orderColumns(COLUMNS);

  expect(keysOf(layout.list)).toEqual(['a', 'b', 'c', 'd', 'e']);
  expect(layout.left).toEqual([]);
  expect(layout.right).toEqual([]);
});

test('a pinned column is pulled to its edge, wherever it was declared', () => {
  /*
   * THE CASE THAT BREAKS IF THE REORDER IS SKIPPED. Pinning the THIRD column
   * left has to move it in front of the first two; leaving it in place would
   * stick it over them and open a hole in the middle of every row.
   */
  const left = orderColumns(pin('c', 'left'));
  expect(keysOf(left.list)).toEqual(['c', 'a', 'b', 'd', 'e']);
  expect(keysOf(left.left)).toEqual(['c']);

  const right = orderColumns(pin('b', 'right'));
  expect(keysOf(right.list)).toEqual(['a', 'c', 'd', 'e', 'b']);
  expect(keysOf(right.right)).toEqual(['b']);
});

test('two per side freeze, and a third is drawn as an ordinary column', () => {
  const columns = [
    { key: 'a', pin: 'left' },
    { key: 'b', pin: 'left' },
    { key: 'c', pin: 'left' },
    { key: 'd' },
    { key: 'e', pin: 'right' },
    { key: 'f', pin: 'right' },
    { key: 'g', pin: 'right' }
  ];

  const layout = orderColumns(columns);

  /* The first two on the left, the LAST two on the right. */
  expect(keysOf(layout.left)).toEqual(['a', 'b']);
  expect(keysOf(layout.right)).toEqual(['f', 'g']);

  /*
   * The ones over the cap are not dropped and not refused - they scroll with
   * everything else, in the order they were declared. A table that froze
   * half of itself would have no room left to scroll, and throwing over a
   * column somebody pinned by accident would take a working screen down.
   */
  expect(keysOf(layout.list)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
});

test('pinning survives a nonsense column list', () => {
  expect(orderColumns(null).list).toEqual([]);
  expect(keysOf(orderColumns([{ key: 'a' }, null, undefined, { key: 'b' }]).list))
    .toEqual(['a', 'b']);
});

/* ------------------------------------------------------------ the strip */

test('the page strip shows ONE neighbour either side', () => {
  /*
   * The complaint that started this: on page 8 the strip drew 6 7 8 9 10.
   * Three buttons is what "one neighbour" means, and the two ends are added
   * around them by the component.
   */
  expect(pageWindow(8, 20)).toEqual([7, 8, 9]);
});

test('the window is the same width at both ends of the list', () => {
  /*
   * Clamping the start without pushing the end out - or the other way round -
   * gives a strip that shrinks to two buttons on page 1 and jumps back to
   * three on page 2, which reads as the control moving under the pointer.
   */
  expect(pageWindow(1, 20)).toEqual([1, 2, 3]);
  expect(pageWindow(2, 20)).toEqual([1, 2, 3]);
  expect(pageWindow(20, 20)).toEqual([18, 19, 20]);
  expect(pageWindow(19, 20)).toEqual([18, 19, 20]);
});

test('a short list is not padded with pages that do not exist', () => {
  expect(pageWindow(1, 2)).toEqual([1, 2]);
  expect(pageWindow(2, 2)).toEqual([1, 2]);
  expect(pageWindow(1, 1)).toEqual([1]);
});

test('more neighbours can be asked for, and the width follows', () => {
  expect(pageWindow(8, 20, 2)).toEqual([6, 7, 8, 9, 10]);
  expect(pageWindow(8, 20, 0)).toEqual([8]);
});

test('the rows-per-page choices start at the smallest', () => {
  /*
   * Pagination hides the select when one page holds everything, EXCEPT when
   * the total is larger than the smallest choice - otherwise a reader who
   * picked 100 and got one page has no way back to 10. That rule reads
   * PAGE_SIZES[0], so the list has to be sorted.
   */
  expect(PAGE_SIZES.length).toBeGreaterThan(1);
  expect(PAGE_SIZES.slice().sort((a, b) => a - b)).toEqual(PAGE_SIZES);
});
