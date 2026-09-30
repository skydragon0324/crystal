import React from 'react';
import { Text } from '@chakra-ui/react';

/**
 * A DESCRIPTION, with its line breaks and its highlights - and nothing else.
 *
 * Two things the About copy needs that plain text cannot do:
 *
 *   SEVERAL SENTENCES ON SEVERAL LINES. A history year or a service is written
 *   as a short headline line and the story under it. An Enter in the string
 *   is a line break on screen; two are a paragraph gap.
 *
 *   A FEW WORDS IN BOLD. "<strong>Four hundred engineers</strong>" is how a
 *   figure worth noticing is marked.
 *
 *   THE NAME, BOLD AND LARGER. "<big>Crystal</big>" sets the company's name a
 *   size up from the sentence around it, the way it is printed on the
 *   company's own material. <strong> is emphasis at the text's own size;
 *   <big> is the name.
 *
 * IT IS NOT AN HTML RENDERER, and that is deliberate. Everything is escaped
 * first, and then exactly five tags are let back in: <strong>, <b>, <em>,
 * <i> and <big>, open or closed, with no attributes. So a stray `<` in a description is
 * shown as a `<`, a copied `<a href>` is shown as text rather than becoming a
 * link, and nothing in a translation file can add a script or a style to the
 * page. The copy is written in this repository and reviewed, but a renderer
 * that is safe regardless costs four lines more than one that is safe only as
 * long as everybody is careful.
 *
 * `white-space: pre-line` does the line breaks: it keeps an Enter and still
 * wraps a long line normally, which `pre` would not.
 */

const ALLOWED = /&lt;(\/?)(strong|b|em|i|big)&gt;/g;

function escape(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Exported for the test: what a description turns into. */
export function toMarkup(text) {
  if (text === null || text === undefined) return '';
  return escape(text).replace(ALLOWED, '<$1$2>');
}

export default function Prose({ children, ...rest }) {
  if (children === null || children === undefined || children === '') return null;

  return (
    <Text
      whiteSpace="pre-line"
      sx={{
        strong: { fontWeight: 700, color: 'inherit' },
        b: { fontWeight: 700 },
        /* em-relative, so it is a size up from whatever size the prose is set in. */
        big: { fontWeight: 800, fontSize: '1.25em', lineHeight: 1, color: 'inherit' }
      }}
      dangerouslySetInnerHTML={{ __html: toMarkup(children) }}
      {...rest}
    />
  );
}
