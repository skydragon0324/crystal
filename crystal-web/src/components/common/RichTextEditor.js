import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, useDisclosure } from '@chakra-ui/react';
import { Global, css } from '@emotion/react';
import { Editor } from '@tinymce/tinymce-react';

import EditorToolbar from './EditorToolbar';
import ImageUploadDialog from './ImageUploadDialog';
import { useEditorPalette } from '@/theme/editor';

/*
 * TinyMCE, SELF HOSTED - these imports are what makes that true. The wrapper
 * only mounts the editor; the engine, the theme, the skin and every plugin
 * have to be pulled into the bundle explicitly, or TinyMCE loads them from
 * its cloud, which needs an API key and an internet connection.
 *
 * Only the light skin is imported, as in the console: bundling oxide-dark as
 * well puts two competing `.tox` rule sets into one stylesheet and the later
 * one wins in both modes. The dark palette is applied as overrides below, so
 * the editor follows the site's own colours rather than TinyMCE's.
 */
import 'tinymce/tinymce';
import 'tinymce/icons/default';
import 'tinymce/themes/silver';
import 'tinymce/skins/ui/oxide/skin.css';

import 'tinymce/plugins/advlist';
import 'tinymce/plugins/autolink';
import 'tinymce/plugins/lists';
import 'tinymce/plugins/charmap';
import 'tinymce/plugins/table';
import 'tinymce/plugins/wordcount';
import 'tinymce/plugins/paste';
import 'tinymce/plugins/hr';
import 'tinymce/plugins/textcolor';
import 'tinymce/plugins/colorpicker';

/**
 * THE EDITOR A MEMBER WRITES IN - the console's editor, in the storefront's
 * colours.
 *
 * A member's post used to be a textarea storing plain text, because the
 * storefront had no editor. It has this one now, and it is the SAME COMPONENT
 * the console has, down to the chrome: `EditorToolbar` is a row of Chakra
 * buttons with real tooltips, portalled menus and a hover-to-size table
 * picker, and `theme/editor.js` is the palette it and the editor's own
 * document are drawn in, in both colour modes. TinyMCE renders no chrome of
 * its own - `menubar: false, toolbar: false` - which is what lets every
 * control be a button this site styles.
 *
 * TWO COPIES, ON PURPOSE. The console has its own of all three files: the two
 * projects build separately and neither can import the other's source, and
 * their ramps differ. The files are the same shape, so a fix to one is a
 * legible patch to the other.
 *
 * IT IS LOADED ON DEMAND. TinyMCE is around a megabyte; the compose page
 * imports this through React.lazy, so it is fetched when somebody opens the
 * form and never by a reader.
 *
 * PICTURES ARE POSSIBLE AND ARE OFF. `onUploadImage` is how a picture gets in
 * - the dialog checks the type and the size, then hands the file to that
 * function and inserts the address it returns. The blog does not pass one:
 * the renderer drops images inside a body (components/blog/BlogContent.js)
 * and a member's post is sanitised to a tag list that has no <img> in it
 * (backend utils/richText.js), so the button would offer something that does
 * not survive the save. It is written and tested for the screen that wants
 * it, and the toolbar simply has no image button until one is given.
 *
 * FULLSCREEN IS THIS COMPONENT'S, not TinyMCE's plugin - the plugin lifts
 * only its own frame and buries this toolbar underneath it, leaving no
 * visible way back out.
 */

const PLUGINS = [
  'advlist', 'autolink', 'lists', 'charmap',
  'table', 'wordcount', 'paste', 'hr', 'textcolor', 'colorpicker'
];

/**
 * The faces the font picker offers.
 *
 * The site's own first - it is what the page is set in, and a post written in
 * it looks like the page it will be published on - then the faces a reader's
 * machine is likely to have, then the CJK ones, because half of this site is
 * read in Chinese and a post written in SimSun should still say SimSun when
 * it is read back somewhere else. Every stack ends in a generic family.
 */
export const DEFAULT_FONT_FAMILIES = [
  { label: 'Crystal', value: "'DM Sans',-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif" },

  { label: 'Arial', value: 'Arial,Helvetica,sans-serif' },
  { label: 'Georgia', value: 'Georgia,serif' },
  { label: 'Helvetica', value: 'Helvetica,Arial,sans-serif' },
  { label: 'Segoe UI', value: 'Segoe UI,Frutiger,Helvetica,sans-serif' },
  { label: 'Times New Roman', value: 'Times New Roman,Times,serif' },
  { label: 'Verdana', value: 'Verdana,Geneva,sans-serif' },
  { label: 'Consolas', value: 'Consolas,Courier New,monospace' },

  { label: '微软雅黑 Microsoft YaHei', value: 'Microsoft YaHei,PingFang SC,sans-serif' },
  { label: '宋体 SimSun', value: 'SimSun,Songti SC,serif' },
  { label: '黑体 SimHei', value: 'SimHei,Heiti SC,sans-serif' },
  { label: '楷体 KaiTi', value: 'KaiTi,Kaiti SC,STKaiti,serif' }
];

export const DEFAULT_FONT_SIZES = [
  '12px', '14px', '16px', '18px', '20px', '24px', '30px', '36px'
];

/** theme/index.js fonts.body - what the page itself is set in. */
const BODY_FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/*
 * THE FACE HAS TO BE FETCHED INSIDE THE FRAME TOO.
 *
 * public/index.html loads DM Sans for the page; the editor's body is a
 * document of its own and that link means nothing in it, so it asks for the
 * same file. Without this a post is typed in the fallback and looks nothing
 * like what it will be published as - and `font-family: inherit` would give
 * the frame's own default, which is Times.
 */
const FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');";

export default function RichTextEditor({
  value, onChange, height, placeholder, isDisabled, ariaLabel,
  onUploadImage, fontFamilies, fontSizes, extraButtons
}) {
  const { isDark, ui } = useEditorPalette();

  const editorRef = useRef(null);
  const imageDialog = useDisclosure();

  /* In state, not only a ref: it is what re-renders the toolbar once the editor can take commands. */
  const [instance, setInstance] = useState(null);
  const [isFullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return undefined;

    const onKey = (event) => { if (event.key === 'Escape') setFullscreen(false); };
    document.addEventListener('keydown', onKey);

    /* The page behind must not scroll while the editor owns the viewport. */
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);

  /** Hands the picked file to the caller's uploader and inserts what comes back. */
  const insertUploaded = useCallback(async (file) => {
    if (!onUploadImage) return;

    const url = await onUploadImage(file);
    if (url && editorRef.current) {
      editorRef.current.insertContent('<img src="' + url + '" alt="" />');
    }
  }, [onUploadImage]);

  const contentStyle = useMemo(() => (
    FONT_IMPORT
    /* The frame's own scrollbar and its form controls follow the page's mode. */
    + ' :root { color-scheme: ' + (isDark ? 'dark' : 'light') + '; } '
    + 'body { font-family: ' + BODY_FONT + '; font-size: 16px; line-height: 1.7; '
    + 'padding: 14px 16px; background: ' + ui.paper + '; color: ' + ui.ink + '; } '
    + 'body[data-mce-placeholder]:not(.mce-visualblocks)::before { color: ' + ui.placeholder + '; } '
    + '::selection { background: ' + ui.selection + '; } '
    + 'p { margin: 0 0 1em; } '
    + 'h1, h2, h3, h4 { margin: 1.4em 0 0.5em; line-height: 1.25; } '
    + 'blockquote { margin: 0 0 1em; padding-left: 14px; border-left: 3px solid ' + ui.rule + '; color: ' + ui.muted + '; } '
    + 'pre { padding: 12px 14px; border-radius: 8px; background: ' + ui.bg + '; overflow-x: auto; } '
    + 'ul, ol { padding-left: 22px; } '
    + 'hr { border: 0; border-top: 1px solid ' + ui.rule + '; } '
    + 'table { border-collapse: collapse; } '
    + 'table td, table th { border: 1px solid ' + ui.rule + '; padding: 6px 10px; } '
    + 'img { max-width: 100%; height: auto; border-radius: 8px; } '
    + 'a { color: ' + ui.link + '; }'
  ), [isDark, ui]);

  /*
   * THE COLOURS ARE PUSHED IN, NOT ONLY PASSED IN.
   *
   * `content_style` is read ONCE, when TinyMCE builds its iframe - and that
   * happens before Chakra has resolved the colour mode from storage, so an
   * editor opened in night mode was built with the day palette and sat there
   * as a white page in a dark one. Re-rendering does not fix it: the init
   * object is never read again.
   *
   * So the same stylesheet is written into the editor's own document each
   * time the palette changes. That covers the first paint AND somebody
   * switching modes with the editor open.
   */
  useEffect(() => {
    const editor = editorRef.current;
    const doc = editor && editor.getDoc && editor.getDoc();
    if (!doc || !doc.head) return;

    let tag = doc.getElementById('crystal-editor-theme');
    if (!tag) {
      tag = doc.createElement('style');
      tag.id = 'crystal-editor-theme';
      doc.head.appendChild(tag);
    }
    tag.textContent = contentStyle;
  }, [contentStyle, instance]);

  /*
   * Global rather than scoped: TinyMCE renders its dialogs into
   * `.tox-tinymce-aux` on document.body, outside this component's tree, so a
   * scoped rule would never reach them. The toolbar is this site's own, so
   * what is left here is the frame, the status bar and those dialogs.
   */
  const chrome = css`
    .tox.tox-tinymce {
      border: 1px solid ${ui.border} !important;
      border-top: 0 !important;
      border-radius: 0 0 12px 12px;
    }

    /*
     * The frame under the document, so the white of the oxide skin never
     * shows: between mounting and the iframe's own stylesheet loading there
     * is a moment where it would flash, and it flashes white in night mode.
     */
    .tox .tox-sidebar-wrap,
    .tox .tox-edit-area,
    .tox .tox-edit-area__iframe {
      background: ${ui.paper} !important;
    }

    .tox .tox-editor-header,
    .tox .tox-statusbar {
      background: ${ui.bg} !important;
      border-color: ${ui.border} !important;
    }

    .tox .tox-statusbar,
    .tox .tox-statusbar a,
    .tox .tox-statusbar__wordcount { color: ${ui.muted} !important; }

    .tox .tox-dialog,
    .tox .tox-dialog__header,
    .tox .tox-dialog__footer,
    .tox .tox-dialog__body {
      background: ${ui.raised} !important;
      color: ${ui.text} !important;
      border-color: ${ui.border} !important;
    }

    .tox .tox-textfield,
    .tox .tox-listbox,
    .tox .tox-selectfield select {
      background: ${ui.bg} !important;
      color: ${ui.text} !important;
      border-color: ${ui.border} !important;
    }
  `;

  return (
    <>
      <Global styles={chrome} />

      <Box
        borderRadius={isFullscreen ? '0' : '12px'}
        overflow="hidden"
        data-rich-text-editor=""
        {...(isFullscreen
          ? {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            zIndex: 1500,
            bg: ui.paper,
            display: 'flex',
            flexDirection: 'column'
          }
          : {})}
        sx={isFullscreen ? {
          /* TinyMCE writes its height inline at init, so filling the expanded wrapper needs this. */
          '.tox-tinymce': { height: '100% !important', border: 'none !important' },
          '& > div:last-of-type': { flex: '1', minHeight: '0' }
        } : undefined}
      >
        <EditorToolbar
          editor={instance}
          fontFamilies={fontFamilies || DEFAULT_FONT_FAMILIES}
          fontSizes={fontSizes || DEFAULT_FONT_SIZES}
          extraButtons={extraButtons}
          isDisabled={isDisabled}
          onPickImage={onUploadImage ? imageDialog.onOpen : undefined}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setFullscreen((on) => !on)}
        />

        <Editor
          value={value || ''}
          disabled={isDisabled}
          onEditorChange={(next) => onChange(next)}
          onInit={(event, editor) => {
            editorRef.current = editor;
            setInstance(editor);

            if (ariaLabel) {
              const body = editor.getBody();
              if (body) body.setAttribute('aria-label', ariaLabel);
            }

            /*
             * TinyMCE would otherwise accept a dropped file as a data URI even
             * with paste_data_images off, so the drop is refused outright.
             */
            editor.on('drop dragover', (dropped) => {
              if (dropped.dataTransfer && dropped.dataTransfer.files && dropped.dataTransfer.files.length) {
                dropped.preventDefault();
                dropped.stopPropagation();
              }
            });
          }}
          init={{
            height: height || 420,

            /* The chrome is EditorToolbar; TinyMCE draws none of its own. */
            menubar: false,
            toolbar: false,
            statusbar: true,
            elementpath: false,
            resize: true,

            plugins: PLUGINS,
            placeholder: placeholder,
            branding: false,
            skin: false,            /* the stylesheet is imported above instead */
            content_css: false,
            content_style: contentStyle,
            browser_spellcheck: true,

            font_formats: (fontFamilies || DEFAULT_FONT_FAMILIES)
              .map((face) => face.label + '=' + face.value).join(';'),
            fontsize_formats: (fontSizes || DEFAULT_FONT_SIZES).join(' '),

            /*
             * Every picture goes through the dialog, which checks its type and
             * size first. Without this gate a dragged or pasted file lands in
             * the document unverified, as a data URL.
             */
            paste_data_images: false,
            automatic_uploads: false,

            table_default_attributes: { border: '1' },
            table_responsive_width: true,

            /* What the server would strip is not worth offering here. */
            invalid_elements: 'script,iframe,object,embed,form,input'
          }}
        />
      </Box>

      {onUploadImage && (
        <ImageUploadDialog
          isOpen={imageDialog.isOpen}
          onClose={imageDialog.onClose}
          onUpload={insertUploaded}
        />
      )}
    </>
  );
}
