/*
 * Does the console actually RENDER?
 *
 * `npm run build` proves every import resolves and every file parses.  It
 * proves nothing about what happens when React runs the component - an icon
 * that imported as undefined, a hook called in a loop, a prop shape a screen
 * expects and the component library no longer sends.  All three of those are
 * runtime failures behind a green build, and all three are exactly what a
 * component library swapped underneath thirty-six screens produces.
 *
 * So this mounts things, in jsdom, and fails on the first thrown error.  It
 * is deliberately shallow on assertions and broad on coverage: the question
 * is "does it come up", not "does it say the right words".
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { ChakraProvider } from '@chakra-ui/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { EditIcon } from '@chakra-ui/icons';

import theme from '../theme';
import { I18nProvider } from '../i18n';
import { ConfirmProvider } from '../components/ConfirmDialog';

import Card from '../components/Card';
import StatTile from '../components/StatTile';
import StatusBadge from '../components/StatusBadge';
import DataTable from '../components/DataTable';
import Pagination, { buildPageItems } from '../components/Pagination';
import FormModal from '../components/FormModal';
import SelectField from '../components/SelectField';
import DatePicker from '../components/DatePicker';
import SearchBar from '../components/SearchBar';
import AppName from '../components/AppName';
import SessionExpired from '../components/SessionExpired';
import ConfirmDialogBox from '../components/ConfirmDialog';
import CrudPage from '../components/CrudPage';
import PageJump from '../components/PageJump';
import NotificationsMenu from '../components/NotificationsMenu';
import Sidebar from '../layouts/Sidebar';

/*
 * The API is stubbed rather than reached: this is about rendering, and a
 * component that only fails when the network answers slowly is a different
 * test.  Every call resolves to an empty, correctly-shaped reply.
 */
/*
 * TinyMCE is stubbed out.
 *
 * It reaches for the real DOM in ways jsdom does not implement, and loading
 * the engine here would make every test in this file two seconds slower to
 * prove something it is not asking - that TinyMCE works.  What IS being
 * checked is that the rich text FIELD renders where a screen asks for one.
 */
jest.mock('../components/RichTextEditor', () => ({
  __esModule: true,
  default: function RichTextEditorStub(props) {
    return <div data-testid="richtext">{props.value}</div>;
  }
}));

jest.mock('../api', () => ({
  auth: { logout: () => Promise.resolve(), changePassword: () => Promise.resolve() },
  media: { upload: () => Promise.resolve({ data: { file_path: '/uploads/misc/x.png' } }) },
  search: { query: () => Promise.resolve({ data: { groups: [] } }) },
  notifications: { summary: () => Promise.resolve({ data: { total: 0, urgent: 0, groups: [] } }) }
}));

/** The rows the server sends for the menu, as the sidebar and palette read them. */
const PAGES = [
  { page_id: 1, parent_id: null, page_url: '/admin/service', page_name: 'Service operations', icon: 'MdBuild', is_menu: true, permission: 1 },
  { page_id: 2, parent_id: 1, page_url: '/admin/service/tickets', page_name: 'Repair tickets', icon: 'MdBuild', is_menu: true, permission: 2 },
  { page_id: 3, parent_id: 1, page_url: '/admin/service/parts', page_name: 'Parts catalogue', icon: 'MdWidgets', is_menu: true, permission: 1 },
  // An icon name this version of react-icons does not have, on purpose: the
  // menu must fall back rather than render `undefined` as a component.
  { page_id: 4, parent_id: null, page_url: '/admin/nowhere', page_name: 'Nowhere', icon: 'MdNoSuchIconAtAll', is_menu: true, permission: 1 }
];

const STATE = {
  auth: {
    admin: { name: 'Ada', username: 'admin', role_name: 'Administrator' },
    pages: PAGES,
    status: 'signedIn'
  }
};

/** A store is three functions; redux itself is not needed to render. */
const store = {
  getState: () => STATE,
  subscribe: () => () => {},
  dispatch: () => {}
};

function mount(node) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  ReactDOM.render(
    <ChakraProvider theme={theme}>
      <I18nProvider>
        <Provider store={store}>
          <MemoryRouter initialEntries={['/admin/service/tickets']}>
            <ConfirmProvider>{node}</ConfirmProvider>
          </MemoryRouter>
        </Provider>
      </I18nProvider>
    </ChakraProvider>,
    host
  );

  /*
   * The WHOLE body, not just the host.
   *
   * Chakra renders every dialog, menu and popover through a portal attached
   * to document.body - so a modal mounted here leaves its host empty and
   * reading that back would say "rendered nothing" about a dialog that is
   * plainly on screen.
   */
  const html = document.body.innerHTML;
  ReactDOM.unmountComponentAtNode(host);
  document.body.removeChild(host);
  return html;
}

/* ------------------------------------------------------------------ */
/*  the pieces                                                         */
/* ------------------------------------------------------------------ */

test('a card renders, with and without a heading', () => {
  expect(mount(<Card>body</Card>)).toContain('body');
  expect(mount(<Card title="Titled" subtitle="and explained">body</Card>)).toContain('Titled');
});

test('a stat tile renders a number, a trend and a sparkline', () => {
  expect(mount(<StatTile label="Open repairs" value="42" />)).toContain('42');

  // The trend arrow only appears when a real delta was handed in.
  expect(mount(<StatTile label="Backlog" value="9" delta={-3.1} higherIsBetter={false} />))
    .toContain('3.1');

  const series = Array.from({ length: 12 }, (ignored, i) => ({ value: i }));
  expect(mount(<StatTile label="Taken in" value="7" series={series} />)).toBeTruthy();
});

test('a status badge renders a code and a word', () => {
  expect(mount(<StatusBadge kind="ticket" value={4} label="Repairing" />)).toContain('Repairing');
  // A word-coded status is shown as it is stored; only the numeric ones
  // are given a label, because "4" is not a thing to show anybody.
  expect(mount(<StatusBadge value="ACTIVE" />)).toContain('ACTIVE');
});

describe('the table', () => {
  const columns = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'price', label: 'Price', isNumeric: true },
    { key: 'made', label: 'Made', render: (row) => <span>{row.name}!</span> }
  ];
  const rows = [
    { id: 1, name: 'C9 Pro', price: 1099 },
    { id: 2, name: 'C7', price: 599, is_deleted: true }
  ];

  test('draws rows, custom cells and a footer when it is given a total', () => {
    const html = mount(
      <DataTable
        columns={columns} rows={rows} page={1} limit={20} total={2}
        sort="name" dir="asc" onSort={() => {}}
        onPageChange={() => {}} onLimitChange={() => {}}
      />
    );
    expect(html).toContain('C9 Pro');
    expect(html).toContain('C9 Pro!');
  });

  /*
   * Ten screens in this console drive DataTable themselves and draw their own
   * Pagination underneath it.  A second footer inside the table would be
   * duplicated AND wrong, because it has no count to state.
   */
  test('draws no footer when it was given no total', () => {
    const html = mount(<DataTable columns={columns} rows={rows} />);
    expect(html).not.toContain('results');
  });

  test('renders row actions, including a screen that brings its own control', () => {
    const actions = [
      { key: 'edit', label: 'Edit', icon: EditIcon, onClick: () => {} },
      { key: 'gone', label: 'Hidden', onClick: () => {}, hidden: (row) => !row.is_deleted },
      { key: 'own', label: 'Custom', render: (row) => <button type="button">go {row.id}</button> }
    ];
    const html = mount(
      <DataTable columns={columns} rows={rows} actions={actions} actionsMode="buttons" />
    );
    expect(html).toContain('go 1');
  });

  test('expands a detail row', () => {
    const html = mount(
      <DataTable
        columns={columns} rows={rows}
        renderExpanded={(row) => <div>detail for {row.name}</div>}
      />
    );
    // Collapsed by default: the detail is not in the document until asked for.
    expect(html).not.toContain('detail for');
  });

  test('says so when there is nothing', () => {
    expect(mount(<DataTable columns={columns} rows={[]} />)).toContain('No records yet');
  });

  /*
   * TWO PINS PER EDGE, AND THE THIRD SCROLLS.
   *
   * The cap is what keeps a wide table readable - three frozen columns leave
   * a sliver to scroll between them - and it is invisible in a screenshot,
   * because the third column looks perfectly normal until you scroll.
   *
   * Counted through `data-pinned`, which is the attribute the sticky styling
   * and the row hover both key on. The style itself is an emotion class, so
   * there is no `position: sticky` in the markup to read back.
   */
  test('freezes at most two columns at each edge', () => {
    const many = [
      { key: 'a', label: 'A', pin: 'right' },
      { key: 'b', label: 'B', pin: 'right' },
      { key: 'c', label: 'C', pin: 'right' },
      { key: 'd', label: 'D' }
    ];

    const html = mount(<DataTable columns={many} rows={[{ id: 1, a: 1, b: 2, c: 3, d: 4 }]} />);

    /* One header cell and one body cell each, for two of the three. */
    expect((html.match(/data-pinned="right"/g) || []).length).toBe(4);
  });

  test('a column can opt out of being resizable', () => {
    const html = mount(
      <DataTable columns={[{ key: 'a', label: 'A', resizable: false }]} rows={[{ id: 1, a: 1 }]} />
    );
    expect(html).not.toContain('aria-orientation="vertical"');
  });
});

describe('pagination', () => {
  /*
   * Six screens were written against onPage/onLimit and the component library
   * arrived using onPageChange/onLimitChange.  Both have to work, or those
   * screens page silently into nothing.
   */
  test('accepts either name for its callbacks', () => {
    expect(mount(<Pagination page={2} limit={20} total={140} onPage={() => {}} onLimit={() => {}} />))
      .toContain('140');
    expect(mount(
      <Pagination page={2} limit={20} total={140} onPageChange={() => {}} onLimitChange={() => {}} />
    )).toContain('140');
  });

  /*
   * ONE NEIGHBOUR, which is the whole shape of the strip.
   *
   * On page 8 of 20 this is `1 … 7 8 9 … 20`. It was asserted by hand because
   * the numbers either side of the current page are the part people actually
   * navigate by, and widening it back to two is a one-character change that
   * nothing else would notice.
   */
  test('shows one page either side of the current one', () => {
    expect(buildPageItems(8, 20)).toEqual([1, 'gap-left', 7, 8, 9, 'gap-right', 20]);

    /* Near the ends the run is unbroken on that side rather than gapped. */
    expect(buildPageItems(1, 20)).toEqual([1, 2, 3, 'gap-right', 20]);
    expect(buildPageItems(20, 20)).toEqual([1, 'gap-left', 18, 19, 20]);

    /* Short enough to show whole: no ellipsis, no arithmetic. */
    expect(buildPageItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('the form', () => {
  const fields = [
    { name: 'name', label: 'Name', required: true },
    { name: 'group', label: 'Group', type: 'section' },
    { name: 'kind', label: 'Kind', type: 'select', options: [{ value: 'A', label: 'Ay' }] },
    { name: 'when', label: 'When', type: 'date' },
    { name: 'note', label: 'Note', type: 'textarea', span: 2 },
    { name: 'live', label: 'Live', type: 'switch' },
    { name: 'total', label: 'Total', compute: (values) => (values.name || '') + '!' }
  ];

  test('runs controlled, the way CrudPage drives it', () => {
    const html = mount(
      <FormModal
        isOpen title="Edit" fields={fields}
        values={{ name: 'C9' }} onChange={() => {}} onSubmit={() => {}}
        onClose={() => {}} saving={false}
      />
    );
    expect(html).toContain('Name');
    expect(html).toContain('C9!');       // the computed field
  });

  /*
   * Seven screens drive it uncontrolled with `initial` and read the values
   * back off onSubmit.  That mode has to keep working.
   */
  test('runs uncontrolled, the way seven screens drive it', () => {
    const html = mount(
      <FormModal
        isOpen title="Create" fields={fields}
        initial={{ name: 'C7' }} onSubmit={() => {}} onClose={() => {}} isLoading={false}
      />
    );
    expect(html).toContain('C7');
  });
});

describe('the field types the screens ask for', () => {
  /*
   * Ten fields across this console say `type: 'checkbox'`.  When the component
   * library was swapped in, FormModal had no case for it and every one of them
   * fell through to a raw <input type="checkbox"> driven by `value` - which
   * neither showed the stored state nor set it.  This is here so that cannot
   * happen again quietly.
   */
  test('a checkbox reflects the value it was given', () => {
    const html = mount(
      <FormModal
        isOpen title="Edit" onClose={() => {}} onSubmit={() => {}}
        fields={[{ name: 'is_featured', label: 'Featured', type: 'checkbox' }]}
        initial={{ is_featured: true }}
      />
    );
    expect(html).toContain('Featured');
    expect(html).toContain('data-checked');
  });

  test('a textarea honours the number of rows the screen asked for', () => {
    const html = mount(
      <FormModal
        isOpen title="Edit" onClose={() => {}} onSubmit={() => {}}
        fields={[{ name: 'summary', label: 'Summary', type: 'textarea', rows: 9 }]}
        initial={{}}
      />
    );
    expect(html).toContain('rows="9"');
  });

  test('an image field shows the stored path and its picture', () => {
    const html = mount(
      <FormModal
        isOpen title="Edit" onClose={() => {}} onSubmit={() => {}}
        fields={[{ name: 'cover_image', label: 'Cover', type: 'image', folder: 'articles' }]}
        initial={{ cover_image: '/uploads/articles/a.svg' }}
      />
    );
    expect(html).toContain('/uploads/articles/a.svg');
    expect(html).toContain('Upload');
  });

  test('a rich text field renders where a screen asks for one', () => {
    const html = mount(
      <FormModal
        isOpen title="Edit" onClose={() => {}} onSubmit={() => {}}
        fields={[{ name: 'content', label: 'Content', type: 'richtext' }]}
        initial={{ content: 'the body' }}
      />
    );
    expect(html).toContain('the body');
  });
});

describe('what the form sends', () => {
  const fields = [
    { name: 'name', label: 'Name', required: true },
    { name: 'sort_order', label: 'Order', type: 'number' },
    { name: 'is_featured', label: 'Featured', type: 'checkbox' },
    { name: 'note', label: 'Note' }
  ];

  /*
   * A number input hands back a STRING and a cleared box hands back ''.
   * Neither is what a numeric column or a nullable one wants, and settling
   * that in the form is what stops twenty-three screens each doing it.
   */
  test('coerces numbers, booleans and blanks before it submits', () => {
    let sent = null;

    const host = document.createElement('div');
    document.body.appendChild(host);
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <FormModal
            isOpen title="Edit" onClose={() => {}} fields={fields}
            initial={{ name: 'C9', sort_order: '30', is_featured: undefined, note: '' }}
            onSubmit={(payload) => { sent = payload; }}
          />
        </I18nProvider>
      </ChakraProvider>,
      host
    );

    const save = Array.from(document.body.querySelectorAll('button'))
      .filter((button) => button.textContent === 'Save')[0];
    save.click();

    ReactDOM.unmountComponentAtNode(host);
    document.body.removeChild(host);

    expect(sent).toEqual({
      name: 'C9',
      sort_order: 30,          // not '30'
      is_featured: false,      // not undefined
      note: null               // not ''
    });
  });

  test('refuses to submit while a required field is empty', () => {
    let called = false;

    const host = document.createElement('div');
    document.body.appendChild(host);
    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <FormModal
            isOpen title="Create" onClose={() => {}} fields={fields}
            initial={{}}
            onSubmit={() => { called = true; }}
          />
        </I18nProvider>
      </ChakraProvider>,
      host
    );

    Array.from(document.body.querySelectorAll('button'))
      .filter((button) => button.textContent === 'Save')[0].click();

    ReactDOM.unmountComponentAtNode(host);
    document.body.removeChild(host);

    expect(called).toBe(false);
  });
});

describe('a picker opened inside a form dialog', () => {
  /*
   * The bug this pins: Chakra puts its popover panel inside
   *  and gives that wrapper z-index 10, while a
   * modal's container carries 1400 - so a select or a date picker opened
   * inside a form dialog was painted UNDERNEATH it: positioned correctly,
   * fully rendered, and invisible.
   *
   * The fix is a stylesheet rule, because the wrapper is created by the
   * library and takes no props.  Jest stubs CSS imports out, so the rule
   * itself is asserted in chrome72.test.js; what is checked HERE is the
   * other half - that the panel really does render inside the class that
   * rule targets.  Neither half is worth much alone.
   */
  const openPickerInModal = (field) => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <FormModal
            isOpen title="Edit" onClose={() => {}} onSubmit={() => {}}
            fields={[field]} initial={{}}
          />
        </I18nProvider>
      </ChakraProvider>,
      host
    );

    // The closed control is a button; clicking it is what mounts the panel.
    document.body.querySelector('[data-name="' + field.name + '"]').click();

    const panel = document.body.querySelector('[data-no-focus-lock]');
    const positioner = panel ? panel.closest('.chakra-popover__popper') : null;

    ReactDOM.unmountComponentAtNode(host);
    document.body.removeChild(host);
    return { panel: panel, positioner: positioner };
  };

  test('a select opens into the wrapper the stylesheet lifts', () => {
    const { panel, positioner } = openPickerInModal({
      name: 'kind', label: 'Kind', type: 'select',
      options: [{ value: 'A', label: 'Ay' }, { value: 'B', label: 'Bee' }]
    });

    expect(panel).toBeTruthy();
    expect(positioner).toBeTruthy();
  });

  test('a date picker opens into it too', () => {
    const { panel, positioner } = openPickerInModal({
      name: 'when', label: 'When', type: 'date'
    });

    expect(panel).toBeTruthy();
    expect(positioner).toBeTruthy();
  });
});


test('the searchable select and the date picker render closed', () => {
  const options = Array.from({ length: 40 }, (ignored, i) => ({ value: i, label: 'Option ' + i }));
  expect(mount(<SelectField options={options} value={3} onChange={() => {}} />))
    .toContain('Option 3');

  expect(mount(<DatePicker value="2026-08-26" onChange={() => {}} />)).toBeTruthy();
  expect(mount(<SearchBar value="" onChange={() => {}} placeholder="Search" />)).toBeTruthy();
});

test('the confirm dialog renders in its controlled form', () => {
  const html = mount(
    <ConfirmDialogBox
      isOpen title="Delete" body="This will be removed." confirmText="Delete"
      onClose={() => {}} onConfirm={() => {}}
    />
  );
  expect(html).toContain('This will be removed.');
});

test('the wordmark and the timeout screen render', () => {
  expect(mount(<AppName />)).toContain('CRYSTAL');
  expect(mount(<AppName short />)).toContain('CR');
  expect(mount(<SessionExpired onSignIn={() => {}} />)).toBeTruthy();
});

/* ------------------------------------------------------------------ */
/*  the chrome                                                         */
/* ------------------------------------------------------------------ */

test('the sidebar builds itself from the rows the server sent', () => {
  const html = mount(<Sidebar />);

  expect(html).toContain('Repair tickets');
  expect(html).toContain('Service operations');
  // A group whose children were all filtered out is not drawn at all.
  expect(html).not.toContain('Nowhere');
});

test('the sidebar collapses to icons without losing the labels', () => {
  const html = mount(<Sidebar collapsed />);
  // Collapsed, the names live in tooltips rather than in the row.
  expect(html).not.toContain('>Repair tickets<');
  expect(html).toBeTruthy();
});

test('the sidebar is not pinned to one palette any more', () => {
  /*
   * It used to be charcoal in BOTH modes, from a fixed `sidebar` ramp in the
   * theme.  A black column down the side of an otherwise white console reads
   * as a panel that failed to load, so that ramp was removed and the menu
   * reads useSidebar() like everything else reads useSurface().
   *
   * Asserted against the theme rather than against two renders because Chakra
   * applies the colour mode in an effect - a render read back synchronously
   * is always the initial one, so comparing two of them would pass whatever
   * the sidebar did.
   */
  expect(theme.colors.sidebar).toBeUndefined();

  // And it still draws.
  expect(mount(<Sidebar />)).toContain('Repair tickets');
});

test('the command palette and the bell mount', () => {
  expect(mount(<PageJump />)).toBeTruthy();
  expect(mount(<NotificationsMenu iconColor="gray.500" />)).toBeTruthy();
});

/* ------------------------------------------------------------------ */
/*  a whole screen                                                     */
/* ------------------------------------------------------------------ */

test('a CRUD screen mounts against a stubbed resource', () => {
  const api = {
    base: '/symptoms',
    list: () => Promise.resolve({ data: { rows: [], total: 0 } }),
    create: () => Promise.resolve({ data: {} }),
    update: () => Promise.resolve({ data: {} }),
    remove: () => Promise.resolve({}),
    restore: () => Promise.resolve({})
  };

  const html = mount(
    <CrudPage
      page="/admin/service/tickets"
      api={api}
      subtitle="Everything the console knows about a symptom."
      defaultSort="code"
      excel
      columns={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }]}
      fields={[{ name: 'code', label: 'Code', required: true }]}
    />
  );

  expect(html).toContain('Everything the console knows');
  // Write permission on this page in the fixture, so the buttons are there.
  expect(html).toContain('Create');
  expect(html).toContain('Export');
});

/*
 * ---------------------------------------------------------------------------
 * The theme, where `extendTheme` silently replaces rather than merges.
 *
 * A component's baseStyle written here REPLACES Chakra's own, so anything the
 * default declared and this theme does not is simply gone - with no warning
 * and, for the two below, no visible sign until somebody hovers the right
 * control on the right screen. Both of these had already been lost once.
 * ---------------------------------------------------------------------------
 */
describe('the tooltip base style keeps what Chakra put there', () => {
  const styleFor = (colorMode) => theme.components.Tooltip.baseStyle({
    colorMode: colorMode,
    theme: theme
  });

  test('it names a z-index above a dialog', () => {
    ['light', 'dark'].forEach((colorMode) => {
      const style = styleFor(colorMode);
      // A tooltip is portalled to <body>; with no z-index it stacks by
      // document order behind the sticky header, the frozen action column,
      // the navbar and any open dialog.
      expect(style.zIndex).toBe('tooltip');
    });
  });

  test('the arrow is painted from the same variable as the bubble', () => {
    ['light', 'dark'].forEach((colorMode) => {
      const style = styleFor(colorMode);

      // The arrow is a separate element and reads --popper-arrow-bg. A base
      // style that sets only `bg` gives a coloured bubble with a colourless
      // spike hanging off it, which is what `hasArrow` looked like.
      expect(style['--tooltip-bg']).toBeTruthy();
      expect(style['--popper-arrow-bg']).toBe(style.bg);
      expect(style.bg).toContain('var(--tooltip-bg)');
    });
  });

  test('a long label wraps and the bubble is lifted off the page', () => {
    ['light', 'dark'].forEach((colorMode) => {
      const style = styleFor(colorMode);
      expect(style.maxW).toBeTruthy();
      expect(style.boxShadow).toBeTruthy();
      expect(style.color).toBeTruthy();
    });
  });
});

describe('the chart tooltip is styled in real CSS', () => {
  const { VIZ, vizTooltip } = require('../theme/viz');

  test('every colour it emits is a value a browser can parse', () => {
    ['light', 'dark'].forEach((mode) => {
      const style = vizTooltip(VIZ[mode]);

      /*
       * recharts puts these straight into an inline `style`, where nothing
       * resolves a theme token. Every chart used to pass
       * useColorModeValue('white', 'gray.800') in here - a token name the
       * browser drops on the floor, leaving recharts' own hard-coded white
       * box showing in both colour modes.
       */
      const colours = [
        style.contentStyle.background,
        style.contentStyle.color,
        style.labelStyle.color
      ];

      colours.forEach((value) => {
        expect(typeof value).toBe('string');
        expect(value).toMatch(/^(#|rgb|hsl)/);
      });

      // The label has to be told its colour: recharts colours each ITEM from
      // its series and leaves the label to inherit the page's text colour,
      // which is the one colour guaranteed to be wrong on this surface.
      expect(style.labelStyle.color).not.toBe(style.contentStyle.background);
    });
  });
});

describe('the confirm dialog', () => {
  const { ConfirmProvider, useConfirm } = require('../components/ConfirmDialog');

  /* A button that opens the dialog and records what it answered. */
  function Harness({ onAnswer }) {
    const confirm = useConfirm();
    return (
      <button
        type="button"
        data-testid="ask"
        onClick={() => confirm({ title: 'Delete', confirmLabel: 'Delete' }).then(onAnswer)}
      >
        ask
      </button>
    );
  }

  const openDialog = (onAnswer) => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    ReactDOM.render(
      <ChakraProvider theme={theme}>
        <I18nProvider>
          <ConfirmProvider>
            <Harness onAnswer={onAnswer} />
          </ConfirmProvider>
        </I18nProvider>
      </ChakraProvider>,
      host
    );

    host.querySelector('[data-testid="ask"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    return host;
  };

  test('a delete asks before it does anything', () => {
    openDialog(() => {});
    // The dialog is portalled, so it is looked for in the document.
    expect(document.body.textContent).toContain('Delete');
  });

  test('ENTER answers yes, even though Cancel holds the focus', (done) => {
    /*
     * `leastDestructiveRef` puts the initial focus on Cancel, which is the
     * right default for a mouse. For the keyboard it is not: somebody who has
     * read the prompt and reached for Enter means "go ahead".
     *
     * The dialog catches the keydown itself and preventDefault()s it, which is
     * what stops the focused Cancel button turning the same Enter into a
     * click. Both halves are needed, so both are asserted here.
     */
    openDialog((answer) => {
      expect(answer).toBe(true);
      done();
    });

    const dialog = document.querySelector('[role="alertdialog"], .chakra-modal__content');
    expect(dialog).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
});
