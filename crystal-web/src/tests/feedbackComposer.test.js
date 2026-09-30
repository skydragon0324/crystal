/*
 * CTRL+ENTER SENDS A REPLY, and Enter alone does not.
 *
 * A support message is usually several lines - what happened, what was
 * expected, what the device is - so Enter has to keep breaking lines. That
 * makes the shortcut easy to get subtly wrong in a way nobody notices until
 * somebody loses a half-written paragraph: sending on a bare Enter, or
 * sending an empty box, or firing a second request while the first is in
 * flight.
 *
 * The composer is exercised directly rather than through the page, because
 * what is being asserted is the keyboard contract - which key, which
 * modifiers, and the two guards - not how a drawer opens.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ChakraProvider } from '@chakra-ui/react';

import { I18nProvider } from '../i18n';
import { Conversation } from '../pages/account/Feedback';

const THREAD = {
  thread: {
    id: 1,
    title: 'Karaoke microphone drops out',
    status: 'OPEN',
    thread_source: 'SMARTPHONE',
    created_at: '2026-01-01T00:00:00.000Z'
  },
  messages: [
    {
      id: 1,
      action_type: 'MEMBER',
      message: 'It cuts out after about an hour.',
      created_at: '2026-01-01T00:00:00.000Z'
    }
  ]
};

const SURFACE = {
  page: 'white', card: 'white', raised: 'gray.50',
  border: 'gray.200', text: 'gray.900', strong: 'gray.800', muted: 'gray.500'
};

/** Renders the composer and returns its textarea plus what it called. */
function render(props) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  const sent = [];

  act(() => {
    ReactDOM.render(
      <ChakraProvider>
        <I18nProvider>
          <Conversation
            thread={THREAD}
            loading={false}
            draft={props.draft}
            busy={!!props.busy}
            surface={SURFACE}
            onDraft={() => {}}
            onSend={() => sent.push('sent')}
            onResolve={() => {}}
            onDelete={() => {}}
          />
        </I18nProvider>
      </ChakraProvider>,
      host
    );
  });

  const textarea = host.querySelector('textarea');

  return {
    textarea,
    sent,
    press(init) {
      act(() => {
        textarea.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true, cancelable: true, ...init
        }));
      });
    },
    done() {
      act(() => { ReactDOM.unmountComponentAtNode(host); });
      document.body.removeChild(host);
    }
  };
}

test('the composer is there to type into', () => {
  const ui = render({ draft: '' });
  expect(ui.textarea).toBeTruthy();
  ui.done();
});

test('ctrl+enter sends what has been written', () => {
  const ui = render({ draft: 'It happens on both TVs.' });

  ui.press({ key: 'Enter', ctrlKey: true });

  expect(ui.sent).toEqual(['sent']);
  ui.done();
});

test('cmd+enter sends it too', () => {
  /* The same shortcut, spelled the way a Mac spells it. */
  const ui = render({ draft: 'It happens on both TVs.' });

  ui.press({ key: 'Enter', metaKey: true });

  expect(ui.sent).toEqual(['sent']);
  ui.done();
});

test('enter on its own writes a new line instead', () => {
  /*
   * THE ONE THAT MATTERS. A reply is a paragraph; sending on a bare Enter
   * would post the first sentence of every message anybody writes.
   */
  const ui = render({ draft: 'It happens on both TVs.' });

  ui.press({ key: 'Enter' });

  expect(ui.sent).toEqual([]);
  ui.done();
});

test('an empty box sends nothing', () => {
  const ui = render({ draft: '   ' });

  ui.press({ key: 'Enter', ctrlKey: true });

  expect(ui.sent).toEqual([]);
  ui.done();
});

test('nothing is sent while a reply is already in flight', () => {
  /* The same guard the button carries, so the two cannot disagree. */
  const ui = render({ draft: 'It happens on both TVs.', busy: true });

  ui.press({ key: 'Enter', ctrlKey: true });

  expect(ui.sent).toEqual([]);
  ui.done();
});

test('the newest message is scrolled into view', () => {
  /*
   * THE POINT OF THE SHORTCUT IS SEEING WHAT YOU SENT.
   *
   * jsdom gives every element a scrollHeight of 0, so a test that only read
   * scrollTop would pass against a component that never scrolled at all.
   * The heights are stubbed to something a real drawer would have, which is
   * what makes "scrolled to the bottom" a claim rather than a coincidence.
   */
  const host = document.createElement('div');
  document.body.appendChild(host);

  const long = {
    thread: THREAD.thread,
    messages: Array.from({ length: 30 }).map((ignored, i) => ({
      id: i + 1,
      action_type: i % 2 ? 'MANAGER' : 'MEMBER',
      message: 'Message number ' + (i + 1),
      created_at: '2026-01-01T00:00:00.000Z'
    }))
  };

  /* A scroll container only scrolls when its content is taller than it is. */
  const heights = { scrollHeight: 2400, clientHeight: 600 };
  const scrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
  const clientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');

  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => heights.scrollHeight });
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => heights.clientHeight });

  try {
    act(() => {
      ReactDOM.render(
        <ChakraProvider>
          <I18nProvider>
            <Conversation
              thread={long}
              loading={false}
              draft=""
              busy={false}
              surface={SURFACE}
              onDraft={() => {}}
              onSend={() => {}}
              onResolve={() => {}}
              onDelete={() => {}}
            />
          </I18nProvider>
        </ChakraProvider>,
        host
      );
    });

    /* The scroll container is whichever element the effect moved. */
    const scrolled = [...host.querySelectorAll('*')].filter((el) => el.scrollTop > 0);

    expect(scrolled.length).toBeGreaterThan(0);
    expect(scrolled[0].scrollTop).toBe(2400);
  } finally {
    Object.defineProperty(Element.prototype, 'scrollHeight', scrollHeight);
    Object.defineProperty(Element.prototype, 'clientHeight', clientHeight);
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    document.body.removeChild(host);
  }
});

test('it stays at the bottom when the content grows after the first scroll', async () => {
  /*
   * THE REAL-BROWSER CASE, as far as jsdom can express it.
   *
   * An effect runs before the browser has finished laying out: the drawer is
   * still animating in, and a web font arriving a moment later re-flows every
   * bubble and makes the list taller than it was when it was measured. One
   * scroll lands near the bottom and then the bottom moves.
   *
   * Here the height is grown between frames, which is the same shape of
   * event, and the list has to end up at the NEW bottom rather than the old.
   */
  const host = document.createElement('div');
  document.body.appendChild(host);

  const long = {
    thread: THREAD.thread,
    messages: Array.from({ length: 30 }).map((ignored, i) => ({
      id: i + 1,
      action_type: i % 2 ? 'MANAGER' : 'MEMBER',
      message: 'Message number ' + (i + 1),
      created_at: '2026-01-01T00:00:00.000Z'
    }))
  };

  const heights = { scrollHeight: 2400, clientHeight: 600 };
  const scrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
  const clientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');

  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => heights.scrollHeight });
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => heights.clientHeight });

  /* Frames run on demand, so the growth lands between two of them. */
  const frames = [];
  const realRaf = window.requestAnimationFrame;
  const realCancel = window.cancelAnimationFrame;

  window.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  window.cancelAnimationFrame = () => {};

  try {
    act(() => {
      ReactDOM.render(
        <ChakraProvider>
          <I18nProvider>
            <Conversation
              thread={long} loading={false} draft="" busy={false} surface={SURFACE}
              onDraft={() => {}} onSend={() => {}} onResolve={() => {}} onDelete={() => {}}
            />
          </I18nProvider>
        </ChakraProvider>,
        host
      );
    });

    const list = [...host.querySelectorAll('*')].filter((el) => el.scrollTop > 0)[0];
    expect(list.scrollTop).toBe(2400);

    /* The font lands and every bubble gets taller. */
    heights.scrollHeight = 3000;

    act(() => {
      while (frames.length) frames.shift()();
    });

    expect(list.scrollTop).toBe(3000);
  } finally {
    window.requestAnimationFrame = realRaf;
    window.cancelAnimationFrame = realCancel;
    Object.defineProperty(Element.prototype, 'scrollHeight', scrollHeight);
    Object.defineProperty(Element.prototype, 'clientHeight', clientHeight);
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    document.body.removeChild(host);
  }
});
