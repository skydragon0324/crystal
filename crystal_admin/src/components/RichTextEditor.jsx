import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, useDisclosure } from '@chakra-ui/react';
import { Global, css } from '@emotion/react';
import { Editor } from '@tinymce/tinymce-react';
import ImageUploadDialog from './ImageUploadDialog';
import EditorToolbar from './EditorToolbar';
import { useEditorPalette } from '../theme/editor';

/*
 * TinyMCE, self hosted.  These imports are what makes that work: the wrapper
 * only mounts the editor, the engine, the theme, the skin and every plugin
 * have to be pulled into the bundle explicitly or it falls back to loading
 * them from the cloud (which needs an API key and an internet connection).
 *
 * Only the light skin is imported.  Bundling oxide-dark as well would put two
 * competing `.tox` rule sets into one stylesheet and the later one would win
 * in both modes; the dark palette is applied as overrides instead, which also
 * lets the chrome follow the app's own colours rather than TinyMCE's.
 */
import 'tinymce/tinymce';
import 'tinymce/icons/default';
import 'tinymce/themes/silver';
import 'tinymce/skins/ui/oxide/skin.css';

import 'tinymce/plugins/advlist';
import 'tinymce/plugins/autolink';
import 'tinymce/plugins/lists';
import 'tinymce/plugins/charmap';
import 'tinymce/plugins/preview';
import 'tinymce/plugins/visualblocks';
import 'tinymce/plugins/fullscreen';
import 'tinymce/plugins/insertdatetime';
import 'tinymce/plugins/table';
import 'tinymce/plugins/paste';
import 'tinymce/plugins/hr';
import 'tinymce/plugins/textcolor';
import 'tinymce/plugins/colorpicker';
import { media } from '../api';
import { fileUrl } from '../api/client';

/*
 * The `image` plugin is deliberately absent.  It brings the insert/edit image
 * dialog with its source-URL and dimension fields, and the only way a picture
 * should get in here is by being uploaded - dropped, pasted, or picked.
 */
/*
 * link, searchreplace and code are gone with the three toolbar buttons that
 * drove them.  autolink stays: it turns a typed address into a link as you
 * go, which is the one bit of linking a daily report actually needs, and it
 * needs no dialog to do it.
 */
const PLUGINS = [
  'advlist', 'autolink', 'lists', 'charmap', 'preview',
  'visualblocks', 'fullscreen', 'insertdatetime',
  'table', 'paste', 'hr', 'textcolor', 'colorpicker'
];

/**
 * The console's own face, and the one the editor body is drawn in.
 *
 * Declared here rather than read from the theme because it also has to be
 * written into the editor's IFRAME, which has its own document and cannot see
 * this page's stylesheet.
 */
export const APP_FONT_STACK =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Fonts offered by the picker.
 *
 * Two kinds: the ones Windows installs with the system, and the CJK faces -
 * because half of this system is read in Chinese and an article written in
 * SimSun should still say SimSun when it is read back on another machine.
 *
 * Every stack ends in a generic family, so a machine missing the first choice
 * still renders something sensible instead of falling back to Times.
 */
export const DEFAULT_FONT_FAMILIES = [
  { label: 'Inter', value: APP_FONT_STACK },

  { label: 'Arial', value: 'Arial,Helvetica,sans-serif' },
  { label: 'Calibri', value: 'Calibri,Candara,Segoe UI,sans-serif' },
  { label: 'Cambria', value: 'Cambria,Georgia,serif' },
  { label: 'Consolas', value: 'Consolas,Courier New,monospace' },
  { label: 'Courier New', value: 'Courier New,Courier,monospace' },
  { label: 'Georgia', value: 'Georgia,serif' },
  { label: 'Helvetica', value: 'Helvetica,Arial,sans-serif' },
  { label: 'Segoe UI', value: 'Segoe UI,Frutiger,Helvetica,sans-serif' },
  { label: 'Tahoma', value: 'Tahoma,Geneva,sans-serif' },
  { label: 'Times New Roman', value: 'Times New Roman,Times,serif' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS,Helvetica,sans-serif' },
  { label: 'Verdana', value: 'Verdana,Geneva,sans-serif' },

  { label: '微软雅黑 Microsoft YaHei', value: 'Microsoft YaHei,PingFang SC,sans-serif' },
  { label: '宋体 SimSun', value: 'SimSun,Songti SC,serif' },
  { label: '黑体 SimHei', value: 'SimHei,Heiti SC,sans-serif' },
  { label: '楷体 KaiTi', value: 'KaiTi,Kaiti SC,STKaiti,serif' },
  { label: '仿宋 FangSong', value: 'FangSong,STFangsong,serif' },
  { label: '思源黑体 Source Han Sans', value: 'Source Han Sans SC,Noto Sans SC,sans-serif' }
];

export const DEFAULT_FONT_SIZES = [
  '0.625rem', '0.6875rem', '0.75rem', '0.875rem', '1rem', '1.125rem', '1.5rem', '1.875rem', '2.25rem', '3rem'
];

/**
 * WYSIWYG editor for the daily report.
 *
 * Images are uploaded to the API and referenced by URL.  They are deliberately
 * not inlined as base64: a few pasted screenshots would otherwise push a
 * single report into the megabytes and make the report list unusable.
 */
export default function RichTextEditor({
  value, onChange, height, extraButtons, isDisabled, placeholder,
  fontFamilies, fontSizes, uiFontFamily
}) {
  /*
   * ONE PALETTE for the frame, the menus and the page inside the iframe.
   *
   * It is the console's own - see theme/editor.js - rather than Oxide's,
   * because a light skin with a dark document in it is the exact failure this
   * component is built to avoid: the toolbar and the paper have to agree, and
   * they are drawn by two different stylesheets in two different documents.
   */
  const { isDark, ui } = useEditorPalette();
  const borderColor = ui.border;

  const editorRef = useRef(null);
  const imageDialog = useDisclosure();

  // Holding the instance in state, not just a ref, is what re-renders the
  // toolbar once the editor is ready to take commands.
  const [instance, setInstance] = useState(null);

  /*
   * Fullscreen is handled here rather than by TinyMCE's plugin.  That plugin
   * lifts only its own frame to cover the viewport, which buries this
   * component's toolbar underneath it - leaving no visible way back out.
   * Expanding the whole wrapper keeps the toolbar on top of the editor.
   */
  const [isFullscreen, setFullscreen] = useState(false);

  /*
   * THE HEIGHT, AND THE CORNER THAT DRAGS IT.
   *
   * TinyMCE's own resize handle lived in the status bar, which is gone - and
   * with it went the word count and the element path reading "P", neither of
   * which earned a permanent strip. The handle did: an editor is a box you
   * want taller when you are writing and shorter when you are checking the
   * form around it, and the alternative is fullscreen, which is all or
   * nothing.
   *
   * So it is rebuilt here, on the wrapper, which is also the fix for a bug the
   * original had: TinyMCE resized its own frame and left this component's
   * toolbar sitting above a box of a different height.
   */
  const [boxHeight, setBoxHeight] = useState(height || 460);
  const dragRef = useRef(null);

  /**
   * WHETHER A DRAG IS IN PROGRESS, in state as well as in the ref.
   *
   * The ref is what the move handler reads; this is what puts the shield
   * below over the page, and a shield is the whole reason the drag ever
   * finishes - see it for why.
   */
  const [resizing, setResizing] = useState(false);

  /** Not smaller than a paragraph, not taller than the screen. */
  const MIN_HEIGHT = 200;
  const MAX_HEIGHT = 1400;

  const startResize = useCallback((event) => {
    event.preventDefault();

    /*
     * The pointer is captured on the DOCUMENT, not on the handle: a drag that
     * outruns the mouse - and it will, because the layout reflows a frame
     * behind - leaves the pointer off the 18 pixel corner, and a handler bound
     * to the handle stops getting events exactly when it is needed most.
     */
    dragRef.current = { y: event.clientY, from: boxHeight };
    setResizing(true);

    const onMove = (move) => {
      if (!dragRef.current) return;
      const next = dragRef.current.from + (move.clientY - dragRef.current.y);
      setBoxHeight(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, next)));
    };

    const finish = () => {
      dragRef.current = null;
      setResizing(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', finish);
      window.removeEventListener('blur', finish);
      // Restored, or every drag would leave the whole console unselectable.
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', finish);

    /*
     * AND ON BLUR. Dragging the pointer out of the window and letting go
     * there delivers the mouseup to nobody, so without this the editor is
     * still following the mouse when the reader comes back.
     */
    window.addEventListener('blur', finish);

    // A drag over an editor selects its text without this.
    document.body.style.userSelect = 'none';
  }, [boxHeight]);

  useEffect(() => {
    if (!isFullscreen) return undefined;

    const onKey = (event) => { if (event.key === 'Escape') setFullscreen(false); };
    document.addEventListener('keydown', onKey);

    // The page behind must not scroll while the editor owns the viewport.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);

  const uiFont = uiFontFamily || APP_FONT_STACK;

  /*
   * Every face offered by the picker is either installed on the machine or
   * loaded by the host page from Google Fonts.  The editor body is an iframe
   * with its own document and cannot see the host page's stylesheet, so Inter
   * is pulled into it directly - otherwise picking it in the toolbar would
   * silently render as the fallback, and only inside the editor, which is the
   * hardest kind of font bug to see.
   */
  const fontFaceCss =
    "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');";

  /*
   * THE PAGE INSIDE THE FRAME.
   *
   * Everything a browser draws with a default colour has to be named here,
   * not just the background and the text. In night mode the ones that were
   * missing were the ones that showed: a caret painted black on black, a
   * selection in the browser's own blue, a placeholder in a grey chosen
   * against white, and a horizontal rule that simply disappeared.
   *
   * `color-scheme` is what makes the frame's own scrollbar dark; without it
   * a black document scrolls with a light grey bar down the side of it.
   *
   * It is Chrome 81, so on the 72 this console supports the declaration is
   * dropped and the scrollbar stays light. That is a cosmetic loss inside one
   * iframe and there is no fallback worth having - the alternative is styling
   * the scrollbar by hand with a vendor prefix, which is more code than the
   * problem deserves. Stated here so nobody spends an afternoon on it.
   */
  const contentStyle = useMemo(() => (
    fontFaceCss + ' '
    + ':root { color-scheme: ' + (isDark ? 'dark' : 'light') + '; } '
    + 'body { font-family: ' + uiFont + '; font-size: 14px; '
    + 'line-height: 1.6; padding: 14px 18px; '
    + 'background: ' + ui.paper + '; color: ' + ui.ink + '; '
    + 'caret-color: ' + ui.ink + '; } '
    + '::selection { background: ' + ui.selection + '; color: ' + ui.ink + '; } '
    /* TinyMCE draws the placeholder as a pseudo element on the body. */
    + '.mce-content-body[data-mce-placeholder]:not(.mce-visualblocks)::before '
    + '{ color: ' + ui.placeholder + '; } '
    + 'h1, h2, h3, h4, h5, h6 { color: ' + ui.ink + '; } '
    + 'hr { border: 0; border-top: 1px solid ' + ui.rule + '; } '
    + 'blockquote { margin: 0 0 1em; padding: 2px 0 2px 14px; '
    + 'border-left: 3px solid ' + ui.rule + '; color: ' + ui.ink + '; } '
    + 'pre { background: ' + (isDark ? '#161619' : '#F1F5F9') + '; color: ' + ui.ink + '; '
    + 'padding: 10px 12px; border-radius: 8px; overflow: auto; } '
    + 'table { border-collapse: collapse; } '
    + 'table td, table th { border: 1px solid ' + ui.rule + '; padding: 6px 10px; } '
    + 'img { max-width: 100%; height: auto; border-radius: 6px; } '
    + 'a { color: ' + ui.link + '; }'
  ), [isDark, uiFont, fontFaceCss, ui]);

  /**
   * Pushes one file through the API and hands back the stored URL.
   *
   * Uploaded WITHOUT an owner, so the API stores the file and answers its
   * path rather than creating a media row: a picture pasted into an article
   * body belongs to the body, not to the product gallery.
   */
  const upload = useCallback((file) => (
    media.upload('articles', file).then(function (res) {
      return fileUrl(res.data.file_path);
    })
  ), []);

  /** Called by the dialog once a file has been picked and checked. */
  const insertUploaded = useCallback(async (file) => {
    const url = await upload(file);
    if (editorRef.current) {
      editorRef.current.insertContent('<img src="' + url + '" alt="" />');
    }
  }, [upload]);

  /*
   * Global rather than scoped: TinyMCE renders its menus, dropdowns and
   * dialogs into `.tox-tinymce-aux` on document.body, well outside this
   * component's tree, so a scoped rule would never reach them.
   */
  const editorTheme = css`
    .tox.tox-tinymce,
    .tox .tox-editor-header,
    .tox .tox-toolbar,
    .tox .tox-toolbar__primary,
    .tox .tox-toolbar-overlord,
    .tox .tox-menubar {
      background: ${ui.bg} !important;
      border-color: ${ui.border} !important;
    }

    .tox.tox-tinymce {
      border: 1px solid ${ui.border} !important;
      border-radius: 16px;
    }

    /*
     * THE EDIT AREA ITSELF, which is not the same element as the frame.
     *
     * Oxide paints these white, and in night mode that is a white band down
     * the sides of a black document and a white flash before the iframe has
     * loaded its own stylesheet - the one thing about the old palette that
     * was visible without looking for it.
     */
    .tox .tox-sidebar-wrap,
    .tox .tox-edit-area,
    .tox .tox-edit-area__iframe {
      background: ${ui.paper} !important;
    }

    /* The one pixel line between the toolbar and the paper. */
    .tox .tox-editor-header {
      border-bottom: 1px solid ${ui.border} !important;
      box-shadow: none !important;
    }

    .tox .tox-tbtn,
    .tox .tox-mbtn,
    .tox .tox-split-button {
      color: ${ui.text} !important;
      font-family: ${uiFont} !important;
    }

    .tox .tox-tbtn svg,
    .tox .tox-mbtn svg { fill: ${ui.text} !important; }

    .tox .tox-tbtn:hover,
    .tox .tox-mbtn:hover { background: ${ui.hover} !important; }

    .tox .tox-tbtn--enabled,
    .tox .tox-tbtn--enabled:hover { background: ${ui.active} !important; }

    .tox .tox-tbtn--disabled svg,
    .tox .tox-tbtn:disabled svg { fill: ${ui.muted} !important; }

    /* the format / font / size pickers */
    .tox .tox-tbtn--select { color: ${ui.text} !important; }
    .tox .tox-tbtn__select-label {
      color: ${ui.text} !important;
      font-family: ${uiFont} !important;
    }
    .tox .tox-tbtn__select-chevron svg { fill: ${ui.muted} !important; }

    /* menus, dropdowns and dialogs, all portalled to the body */
    .tox .tox-menu,
    .tox .tox-collection--list,
    .tox .tox-dialog,
    .tox .tox-dialog__header,
    .tox .tox-dialog__footer,
    .tox .tox-dialog__body,
    .tox .tox-swatches__picker-btn {
      background: ${ui.raised} !important;
      color: ${ui.text} !important;
      border-color: ${ui.border} !important;
    }

    .tox .tox-menu { border-radius: 12px; overflow: hidden; }

    .tox .tox-collection__item {
      color: ${ui.text} !important;
      font-family: ${uiFont} !important;
    }
    .tox .tox-collection__item--active,
    .tox .tox-collection__item--enabled,
    .tox .tox-collection__item:hover { background: ${ui.hover} !important; }
    .tox .tox-collection__item-icon svg,
    .tox .tox-collection__item-checkmark svg { fill: ${ui.text} !important; }
    .tox .tox-collection__group { border-color: ${ui.border} !important; }

    .tox .tox-dialog__title,
    .tox .tox-label,
    .tox .tox-toolbar-label {
      color: ${ui.text} !important;
      font-family: ${uiFont} !important;
    }

    .tox .tox-textfield,
    .tox .tox-textarea,
    .tox .tox-listbox,
    .tox .tox-selectfield select {
      background: ${ui.bg} !important;
      color: ${ui.text} !important;
      border-color: ${ui.border} !important;
    }

    .tox .tox-insert-table-picker__label { color: ${ui.muted} !important; }
    .tox .tox-insert-table-picker > div { border-color: ${ui.border} !important; }

    /* The dialog's own backdrop, and the divider above its buttons. */
    .tox .tox-dialog-wrap__backdrop {
      background: ${isDark ? 'rgba(0, 0, 0, 0.72)' : 'rgba(15, 23, 42, 0.42)'} !important;
    }
    .tox .tox-dialog__footer,
    .tox .tox-dialog__header { border-color: ${ui.border} !important; }

    /*
     * A menu long enough to scroll - the font picker is twenty faces - keeps
     * the browser's own scrollbar unless it is told otherwise, which on a
     * dark menu is a light grey bar down the side of it.
     */
    .tox .tox-menu,
    .tox .tox-collection__group,
    .tox .tox-autocompleter { scrollbar-color: ${ui.muted} ${ui.raised}; }
    .tox .tox-menu::-webkit-scrollbar,
    .tox .tox-collection__group::-webkit-scrollbar { width: 10px; }
    .tox .tox-menu::-webkit-scrollbar-track,
    .tox .tox-collection__group::-webkit-scrollbar-track { background: ${ui.raised}; }
    .tox .tox-menu::-webkit-scrollbar-thumb,
    .tox .tox-collection__group::-webkit-scrollbar-thumb {
      background: ${ui.border};
      border-radius: 999px;
    }

    /*
     * Focus is the brand colour, the one saturated colour in the chrome.
     *
     * :focus-visible IS NOT IN CHROME 72 - it landed in 86 - and a selector a
     * browser cannot parse invalidates the WHOLE rule it is part of, not just
     * its own clause. Grouped with :focus, the toolbar buttons and the text
     * fields would BOTH have lost their focus ring on the browser this
     * console supports.
     *
     * So the two are separate rules. Chrome 72 applies the :focus one and
     * shows a ring after a click as well as after a Tab, which is a slightly
     * noisier focus than intended and infinitely better than none.
     */
    .tox .tox-tbtn:focus,
    .tox .tox-mbtn:focus,
    .tox .tox-textfield:focus,
    .tox .tox-textarea:focus {
      outline: none !important;
      box-shadow: 0 0 0 2px ${ui.active} !important;
      border-color: ${ui.brand} !important;
    }

    /*
     * And the keyboard-only version for browsers that have it, in a rule of
     * its own. Chrome 72 drops this block entirely, which is the point.
     */
    .tox .tox-tbtn:focus-visible,
    .tox .tox-mbtn:focus-visible {
      box-shadow: 0 0 0 2px ${ui.active} !important;
    }

    /* our own tooltip, replacing the native title attribute */
    .tox .tox-editor-header,
    .tox .tox-toolbar,
    .tox .tox-toolbar__primary,
    .tox .tox-toolbar-overlord,
    .tox .tox-toolbar__group,
    .tox .tox-menubar { overflow: visible !important; }

    .tox [data-mce-tip] { position: relative; }

    .tox [data-mce-tip]::after {
      content: attr(data-mce-tip);
      position: absolute;
      left: 50%;
      top: calc(100% + 6px);
      transform: translateX(-50%);
      background: ${ui.tipBg};
      color: ${isDark ? ui.text : '#fff'};
      /* In night mode the tip sits one step above a nearly black toolbar, so
         the border is what gives it an edge at all. */
      border: 1px solid ${isDark ? ui.border : 'transparent'};
      font-family: ${uiFont};
      font-size: 11px;
      font-weight: 500;
      line-height: 1.3;
      letter-spacing: 0;
      white-space: nowrap;
      padding: 5px 9px;
      border-radius: 7px;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.12s ease 0.25s;
      z-index: 2000;
    }

    .tox [data-mce-tip]:hover::after { opacity: 1; }
  `;

  return (
    <>
      <Global styles={editorTheme} />

      {/*
        THE SHIELD, and it is what makes the drag stop.
        =============================================

        The editor body is an IFRAME, with its own document. The moment a drag
        crosses into it the browser starts delivering mousemove and mouseup to
        THAT document - not to this one - so the listeners above stopped
        hearing anything, never saw the mouseup, and the editor went on
        following the pointer after the button had been released. Dragging
        downward means crossing into the iframe immediately, so it happened on
        essentially every drag.

        Nothing can be listened for from out here to fix that: the parent
        document is simply not in the event path any more. The answer is to
        keep the pointer out of the iframe altogether - a transparent sheet
        over the whole viewport for the length of the drag, which is also
        where the resize cursor should live so it does not flicker back to a
        text caret over the editor.
      */}
      {resizing && (
        <Box
          position="fixed"
          top="0"
          left="0"
          right="0"
          bottom="0"
          zIndex={2000}
          cursor="ns-resize"
          aria-hidden="true"
        />
      )}

      <Box
        border="1px solid"
        borderColor={borderColor}
        borderRadius={isFullscreen ? '0' : '1rem'}
        overflow="hidden"
        position={isFullscreen ? 'fixed' : 'relative'}
        {...(isFullscreen
          ? {
            top: '0', left: '0', right: '0', bottom: '0',
            zIndex: 1500,
            bg: ui.paper,
            display: 'flex',
            flexDirection: 'column'
          }
          : {})}
        sx={isFullscreen ? {
          // TinyMCE writes its height inline at init, so the editor only fills
          // the expanded wrapper if that is overridden.
          '.tox-tinymce': { height: '100% !important', border: 'none !important' },
          '& > .chakra-stack, & > div:last-of-type': { flex: '1', minHeight: '0' }
        } : {
          /*
           * The height is DRAGGED, so it cannot stay on TinyMCE's inline
           * style - that is written once at init and never moves again.
           */
          '.tox-tinymce': { height: boxHeight + 'px !important' }
        }}
      >
        <EditorToolbar
          editor={instance}
          fontFamilies={fontFamilies || DEFAULT_FONT_FAMILIES}
          fontSizes={fontSizes || DEFAULT_FONT_SIZES}
          extraButtons={extraButtons}
          isDisabled={isDisabled}
          onPickImage={imageDialog.onOpen}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setFullscreen((on) => !on)}
        />

        <Editor
          value={value || ''}
          disabled={isDisabled}
          onEditorChange={(next) => onChange(next)}
          onInit={(evt, editor) => {
            editorRef.current = editor;
            setInstance(editor);

            // TinyMCE would otherwise accept a dropped file as a data URI even
            // with paste_data_images off, so the drop is refused outright.
            editor.on('drop dragover', (event) => {
              if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
                event.preventDefault();
                event.stopPropagation();
              }
            });
          }}
          init={{
            /* The starting height only. From here it is `boxHeight`, dragged
               from the corner and applied through the wrapper's sx - see the
               handle below. */
            height: boxHeight,

            // The chrome lives in EditorToolbar now, so TinyMCE renders none
            // of its own - that is what lets every control be a Chakra button
            // with a real tooltip.
            menubar: false,
            toolbar: false,
            /*
             * NO STATUS BAR.
             *
             * It carried three things and none of them earned a permanent
             * band of chrome under every editor in the console: a word count
             * nobody writing a two sentence notice needs, an element path
             * reading "P" - the tag under the cursor, which is a fact about
             * the HTML rather than about the document - and TinyMCE's own
             * branding, which was already off.
             *
             * The resize handle goes with it, and is not missed: the height
             * is set by whoever mounts the editor, and the toolbar has a
             * fullscreen button, which is a better answer than dragging a
             * corner a few pixels at a time.
             */
            statusbar: false,

            plugins: PLUGINS,
            placeholder: placeholder,
            branding: false,
            skin: false,          // the stylesheet is imported above instead
            content_css: false,
            content_style: contentStyle,
            font_formats: (fontFamilies || DEFAULT_FONT_FAMILIES)
              .map((f) => f.label + '=' + f.value).join(';'),
            fontsize_formats: (fontSizes || DEFAULT_FONT_SIZES).join(' '),
            browser_spellcheck: true,

            /*
             * Dropping or pasting a picture straight into the body is off:
             * every image goes through the toolbar's upload dialog, which
             * checks the type and size before anything is sent.  Without that
             * gate a dragged file lands in the document unverified.
             */
            paste_data_images: false,
            automatic_uploads: false,

            table_default_attributes: { border: '1' },
            table_responsive_width: true,

            // Anything the sanitizer would strip on save is not worth offering.
            invalid_elements: 'script,iframe,object,embed,form,input'
          }}
        />

        {/*
          THE RESIZE HANDLE, back where TinyMCE used to put one.

          Its own lived in the status bar this component removed. It is worth
          keeping - an editor is a box you want taller while writing and
          shorter while checking the form around it, and fullscreen is all or
          nothing - so it is rebuilt on the WRAPPER, which also fixes what the
          original did wrong: TinyMCE resized its own frame and left this
          component's toolbar sitting above a box of a different height.
        */}
        {!isFullscreen && (
          <Box
            position="absolute"
            right="0"
            bottom="0"
            w="1.125rem"
            h="1.125rem"
            cursor="ns-resize"
            zIndex="2"
            role="separator"
            aria-label="Resize the editor"
            onMouseDown={startResize}
            /* Three lines at 45 degrees: the corner grip every resizable box
               in every toolkit is drawn with, so it needs no explaining. */
            _before={{
              content: '""',
              position: 'absolute',
              right: '3px',
              bottom: '3px',
              width: '0.625rem',
              height: '0.625rem',
              background:
                'linear-gradient(135deg, transparent 0 45%, ' + ui.muted + ' 45% 55%, transparent 55% 70%, '
                + ui.muted + ' 70% 80%, transparent 80%)',
              opacity: 0.75
            }}
          />
        )}
      </Box>

      <ImageUploadDialog
        isOpen={imageDialog.isOpen}
        onClose={imageDialog.onClose}
        onUpload={insertUploaded}
      />
    </>
  );
}
