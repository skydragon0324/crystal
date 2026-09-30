import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Flex, Button, Icon, Tooltip, Menu, MenuButton, MenuList, MenuItem,
  Popover, PopoverTrigger, PopoverContent, PopoverBody, Portal, SimpleGrid,
  Text
} from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import {
  MdUndo, MdRedo, MdFormatBold, MdFormatItalic, MdFormatUnderlined,
  MdFormatStrikethrough, MdFormatColorText, MdFormatColorFill,
  MdFormatAlignLeft, MdFormatAlignCenter, MdFormatAlignRight,
  MdFormatAlignJustify, MdFormatListBulleted, MdFormatListNumbered,
  MdFormatIndentIncrease, MdFormatIndentDecrease, MdGridOn, MdImage,
  MdRemove, MdFormatClear, MdFullscreen, MdFullscreenExit
} from 'react-icons/md';
import { useI18n } from '../i18n';
import { useEditorPalette } from '../theme/editor';

/**
 * ABOVE THE DIALOG THAT OPENED THE EDITOR.
 *
 * The paragraph, font and colour pickers are PORTALLED to <body>, so they
 * leave the modal's stacking context entirely and are then stacked against it
 * rather than inside it. Chakra's own numbers put them on the losing side:
 * `zIndex="dropdown"` is 1000 and a modal's container is 1400, so opening the
 * font menu inside a form dialog dropped the list BEHIND the dialog. It was
 * open, it was focusable, it was arrow-navigable - and all a reader could see
 * was a sliver at the edge, which is why this reads as "the drop-down is not
 * showing well" rather than as a control that is plainly broken.
 *
 * `rootProps` is the half that matters. Chakra puts the panel inside a popper
 * wrapper whose own theme style is `z-index: inherit`; setting z-index on the
 * panel itself cannot lift a wrapper that is sitting at `auto`. SelectField
 * carries the same number for the same reason - see its comment for why a
 * style prop is used rather than a stylesheet rule.
 */
const ABOVE_MODAL = 1500;

/** Largest table the grid picker offers before you have to type the numbers. */
const GRID_ROWS = 8;
const GRID_COLS = 10;

/**
 * Block styles offered by the paragraph picker.  `format` is what TinyMCE's
 * FormatBlock command takes.
 */
export const BLOCK_FORMATS = [
  { format: 'p', labelKey: 'editor.paragraph', fontSize: '0.875rem', fontWeight: '400' },
  { format: 'h1', labelKey: 'editor.heading1', fontSize: '1.5rem', fontWeight: '700' },
  { format: 'h2', labelKey: 'editor.heading2', fontSize: '1.25rem', fontWeight: '700' },
  { format: 'h3', labelKey: 'editor.heading3', fontSize: '1.0625rem', fontWeight: '700' },
  { format: 'h4', labelKey: 'editor.heading4', fontSize: '0.9375rem', fontWeight: '700' },
  { format: 'blockquote', labelKey: 'editor.quote', fontSize: '0.875rem', fontWeight: '400' },
  { format: 'pre', labelKey: 'editor.codeBlock', fontSize: '0.8125rem', fontWeight: '400' }
];

/**
 * Swatches for the text and highlight colour pickers.
 *
 * The console's own ramps rather than Horizon's, so a colour picked here is
 * one the rest of the system already uses: a row of slate neutrals, the
 * Crystal blue in four steps, and the semantic colours a status badge is
 * drawn in. Black and white are at the ends of the first row because in night
 * mode the useful default is white and in day mode it is black - and neither
 * should take a second click to reach.
 */
const SWATCHES = [
  '#000000', '#0F172A', '#475569', '#94A3B8',
  '#E2E8F0', '#FFFFFF', '#0C4A6E', '#0284C7',
  '#0EA5E9', '#38BDF8', '#059669', '#10B981',
  '#F59E0B', '#EA580C', '#DC2626', '#7C3AED'
];

/**
 * Hover-to-size table picker, the way every word processor does it: run the
 * pointer over the grid and the highlighted rectangle is what gets inserted.
 * Typing "3 columns, 4 rows" into a dialog is a worse way to express a shape
 * you can simply point at.
 */
function TableGridPicker({ onPick, isDisabled, trigger, colors }) {
  const { t } = useI18n();
  const [hover, setHover] = useState({ rows: 0, cols: 0 });

  const cells = [];
  for (let r = 1; r <= GRID_ROWS; r++) {
    for (let c = 1; c <= GRID_COLS; c++) {
      const on = r <= hover.rows && c <= hover.cols;
      cells.push(
        <Box
          key={r + 'x' + c}
          as="button"
          type="button"
          w="1rem" h="1rem" borderRadius="3px"
          border="1px solid"
          borderColor={on ? colors.brand : colors.border}
          bg={on ? colors.brand : 'transparent'}
          onMouseEnter={() => setHover({ rows: r, cols: c })}
          onFocus={() => setHover({ rows: r, cols: c })}
          onClick={() => onPick(r, c)}
          aria-label={c + ' x ' + r}
        />
      );
    }
  }

  return (
    <Popover isLazy placement="bottom-start" onClose={() => setHover({ rows: 0, cols: 0 })}>
      <Tooltip label={t('editor.insertTable')} openDelay={350} placement="bottom" hasArrow>
        <Box display="inline-flex">
          <PopoverTrigger>{trigger}</PopoverTrigger>
        </Box>
      </Tooltip>
      <Portal>
        <PopoverContent
          rootProps={{ zIndex: ABOVE_MODAL }}
          bg={colors.menu} borderColor={colors.border} borderRadius="0.75rem" w="auto"
          _focus={{ outline: 'none', boxShadow: 'lg' }}
        >
          <PopoverBody p="0.625rem">
            <Box
              display="grid"
              gridTemplateColumns={'repeat(' + GRID_COLS + ', 16px)'}
              gridGap="3px"
              onMouseLeave={() => setHover({ rows: 0, cols: 0 })}
            >
              {cells}
            </Box>
            <Text fontSize="xs" color={colors.muted} textAlign="center" mt="0.5rem">
              {hover.rows
                ? hover.cols + ' x ' + hover.rows
                : t('editor.dragToSizeTheTable')}
            </Text>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
}

/**
 * The toolbar, built in Chakra rather than by TinyMCE.
 *
 * TinyMCE's own buttons carry a native `title`, which the browser draws as an
 * OS tooltip: slow, unstyleable, and impossible to translate or override per
 * button.  Driving the editor through execCommand from real Chakra controls
 * means every control gets a proper themed Tooltip and the toolbar becomes
 * ordinary React that can be rearranged like anything else.
 */
export default function EditorToolbar({
  editor, fontFamilies, fontSizes, onPickImage, extraButtons, isDisabled,
  isFullscreen, onToggleFullscreen
}) {
  const { t } = useI18n();

  /*
   * ONE PALETTE, shared with the editor frame below it - see theme/editor.js.
   *
   * These were the Horizon hexes, written when the console was drawn in that
   * style: #0C1533 navy and a #5B3FE0 purple accent. The console has been
   * Apex - neutral black, one saturated colour - for some time, so in night
   * mode this toolbar was a blue-black strip with purple highlights sitting
   * on top of a black page.
   */
  const { ui } = useEditorPalette();

  const bg = ui.bg;
  const borderColor = ui.border;
  const iconColor = ui.text;
  const mutedColor = ui.muted;
  const activeBg = ui.active;
  const hoverBg = ui.hover;
  const menuBg = ui.raised;
  const brandColor = ui.brand;

  /*
   * Which formats are on at the cursor.  TinyMCE fires NodeChange as the
   * selection moves, which is the only reliable moment to re-read them.
   */
  const [state, setState] = useState({});

  const refresh = useCallback(() => {
    if (!editor) return;
    setState({
      bold: editor.queryCommandState('Bold'),
      italic: editor.queryCommandState('Italic'),
      underline: editor.queryCommandState('Underline'),
      strike: editor.queryCommandState('Strikethrough'),
      alignleft: editor.queryCommandState('JustifyLeft'),
      aligncenter: editor.queryCommandState('JustifyCenter'),
      alignright: editor.queryCommandState('JustifyRight'),
      alignjustify: editor.queryCommandState('JustifyFull'),
      bullist: editor.queryCommandState('InsertUnorderedList'),
      numlist: editor.queryCommandState('InsertOrderedList'),
      block: editor.queryCommandValue('FormatBlock')
    });
  }, [editor]);

  useEffect(() => {
    if (!editor) return undefined;
    editor.on('NodeChange', refresh);
    editor.on('init', refresh);
    refresh();
    return () => { editor.off('NodeChange', refresh); };
  }, [editor, refresh]);

  const run = (fn) => () => {
    if (!editor) return;
    fn(editor);
    editor.focus();
    refresh();
  };

  const exec = (command, value) => run((ed) => ed.execCommand(command, false, value));

  /** Applying a named format is how font, size and colour are set in TinyMCE. */
  const applyFormat = (name, value) => run((ed) => ed.formatter.apply(name, { value: value }));

  /*
   * Every control here is an unlabelled glyph, so the tooltip IS the label -
   * and until the editor has loaded (`!editor`) they are all disabled, which
   * is exactly when a disabled element stops firing the pointer events the
   * tooltip needs. `shouldWrapChildren` puts a span around it that can.
   *
   * The two Popover-backed controls below already wrap their trigger in an
   * inline-flex Box by hand, which does the same job; these two did not.
   */
  const inactive = isDisabled || !editor;

  const btn = (key, icon, labelKey, onClick, active) => (
    <Tooltip
      key={key} label={t(labelKey)} openDelay={350} placement="bottom" hasArrow
      shouldWrapChildren={inactive}
    >
      <Button
        aria-label={t(labelKey)}
        aria-pressed={!!active}
        variant="ghost"
        minW="2rem" w="2rem" h="2rem" p="0" borderRadius="0.5rem"
        bg={active ? activeBg : 'transparent'}
        _hover={{ bg: active ? activeBg : hoverBg }}
        isDisabled={inactive}
        onClick={onClick}
      >
        <Icon as={icon} w="1.0625rem" h="1.0625rem" color={iconColor} />
      </Button>
    </Tooltip>
  );

  const separator = (key) => (
    <Box key={key} w="1px" h="1.25rem" bg={borderColor} mx="3px" flexShrink="0" />
  );

  /** A dropdown that shows the current value, for the three pickers. */
  const picker = (key, labelKey, current, width, children) => (
    <Menu isLazy key={key} placement="bottom-start">
      <Tooltip
        label={t(labelKey)} openDelay={350} placement="bottom" hasArrow
        shouldWrapChildren={inactive}
      >
        <MenuButton
          as={Button}
          variant="ghost" h="2rem" px="0.5rem" borderRadius="0.5rem"
          minW={width} maxW={width}
          _hover={{ bg: hoverBg }}
          isDisabled={inactive}
        >
          <Flex align="center" justify="space-between" gap="0.25rem" data-gap="4">
            <Text fontSize="xs" fontWeight="500" color={iconColor} noOfLines={1}>
              {current}
            </Text>
            <Icon as={ChevronDownIcon} w="0.75rem" h="0.75rem" color={mutedColor} flexShrink="0" />
          </Flex>
        </MenuButton>
      </Tooltip>
      <Portal>
        <MenuList
          rootProps={{ zIndex: ABOVE_MODAL }}
          bg={menuBg} borderColor={borderColor} borderRadius="0.75rem"
          p="0.375rem" minW="11.875rem"
        >
          {children}
        </MenuList>
      </Portal>
    </Menu>
  );

  const colorPicker = (key, icon, labelKey, formatName) => (
    <Popover isLazy key={key} placement="bottom-start">
      <Tooltip label={t(labelKey)} openDelay={350} placement="bottom" hasArrow>
        <Box display="inline-flex">
          <PopoverTrigger>
            <Button
              aria-label={t(labelKey)}
              variant="ghost" minW="2rem" w="2rem" h="2rem" p="0" borderRadius="0.5rem"
              _hover={{ bg: hoverBg }}
              isDisabled={isDisabled || !editor}
            >
              <Icon as={icon} w="1.0625rem" h="1.0625rem" color={iconColor} />
            </Button>
          </PopoverTrigger>
        </Box>
      </Tooltip>
      <Portal>
        <PopoverContent
          rootProps={{ zIndex: ABOVE_MODAL }}
          bg={menuBg} borderColor={borderColor} borderRadius="0.75rem"
          w="auto" _focus={{ outline: 'none', boxShadow: 'lg' }}
        >
          <PopoverBody p="0.625rem">
            <SimpleGrid columns={4} spacing="0.375rem">
              {SWATCHES.map((colour) => (
                <Box
                  as="button" type="button" key={colour}
                  w="1.5rem" h="1.5rem" borderRadius="0.375rem" bg={colour}
                  border="1px solid" borderColor={borderColor}
                  aria-label={colour}
                  onClick={applyFormat(formatName, colour)}
                />
              ))}
            </SimpleGrid>
            <Button
              w="100%" mt="0.5rem" size="xs" variant="subtle" borderRadius="0.5rem"
              onClick={run((ed) => ed.formatter.remove(formatName))}
            >
              {t('editor.clearColour')}
            </Button>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );

  const currentBlock = BLOCK_FORMATS
    .filter((b) => b.format === String(state.block || '').toLowerCase())[0] || BLOCK_FORMATS[0];

  return (
    <Flex
      align="center" wrap="wrap" gap="2px" data-gap="2" data-gap-wrap
      bg={bg} borderBottom="1px solid" borderColor={borderColor}
      px="0.625rem" py="0.4375rem"
    >
      {btn('undo', MdUndo, 'editor.undo', exec('Undo'))}
      {btn('redo', MdRedo, 'editor.redo', exec('Redo'))}
      {separator('s1')}

      {picker('block', 'Paragraph style', t(currentBlock.labelKey), '7rem',
        BLOCK_FORMATS.map((b) => (
          <MenuItem
            key={b.format} borderRadius="0.5rem" px="0.625rem" py="0.4375rem" bg="transparent"
            onClick={exec('FormatBlock', b.format)}
          >
            <Text fontSize={b.fontSize} fontWeight={b.fontWeight} color={iconColor}>
              {t(b.labelKey)}
            </Text>
          </MenuItem>
        ))
      )}

      {picker('font', 'Font', t('editor.font'), '6.5rem',
        fontFamilies.map((f) => (
          <MenuItem
            key={f.value} borderRadius="0.5rem" px="0.625rem" py="0.4375rem" bg="transparent"
            onClick={applyFormat('fontname', f.value)}
          >
            <Text fontSize="sm" style={{ fontFamily: f.value }} color={iconColor}>
              {f.label}
            </Text>
          </MenuItem>
        ))
      )}

      {picker('size', 'Font size', t('editor.size'), '4.75rem',
        fontSizes.map((size) => (
          <MenuItem
            key={size} borderRadius="0.5rem" px="0.625rem" py="0.4375rem" bg="transparent"
            onClick={applyFormat('fontsize', size)}
          >
            <Text fontSize="sm" color={iconColor}>{size}</Text>
          </MenuItem>
        ))
      )}

      {separator('s2')}
      {btn('bold', MdFormatBold, 'editor.bold', exec('Bold'), state.bold)}
      {btn('italic', MdFormatItalic, 'editor.italic', exec('Italic'), state.italic)}
      {btn('underline', MdFormatUnderlined, 'editor.underline', exec('Underline'), state.underline)}
      {btn('strike', MdFormatStrikethrough, 'editor.strikethrough', exec('Strikethrough'), state.strike)}
      {colorPicker('forecolor', MdFormatColorText, 'editor.textColour', 'forecolor')}
      {colorPicker('backcolor', MdFormatColorFill, 'editor.highlightColour', 'hilitecolor')}

      {separator('s3')}
      {btn('alignleft', MdFormatAlignLeft, 'editor.alignLeft', exec('JustifyLeft'), state.alignleft)}
      {btn('aligncenter', MdFormatAlignCenter, 'editor.alignCentre', exec('JustifyCenter'), state.aligncenter)}
      {btn('alignright', MdFormatAlignRight, 'editor.alignRight', exec('JustifyRight'), state.alignright)}
      {btn('alignjustify', MdFormatAlignJustify, 'editor.justify', exec('JustifyFull'), state.alignjustify)}

      {separator('s4')}
      {btn('bullist', MdFormatListBulleted, 'editor.bulletedList', exec('InsertUnorderedList'), state.bullist)}
      {btn('numlist', MdFormatListNumbered, 'editor.numberedList', exec('InsertOrderedList'), state.numlist)}
      {btn('outdent', MdFormatIndentDecrease, 'editor.decreaseIndent', exec('Outdent'))}
      {btn('indent', MdFormatIndentIncrease, 'editor.increaseIndent', exec('Indent'))}

      {separator('s5')}
      <TableGridPicker
        key="table"
        isDisabled={isDisabled || !editor}
        colors={{ brand: brandColor, border: borderColor, menu: menuBg, muted: mutedColor }}
        onPick={(rows, cols) => run((ed) =>
          ed.execCommand('mceInsertTable', false, { rows: rows, columns: cols }))()}
        trigger={
          <Button
            aria-label={t('editor.insertTable')}
            variant="ghost" minW="2rem" w="2rem" h="2rem" p="0" borderRadius="0.5rem"
            _hover={{ bg: hoverBg }}
            isDisabled={isDisabled || !editor}
          >
            <Icon as={MdGridOn} w="1.0625rem" h="1.0625rem" color={iconColor} />
          </Button>
        }
      />
      {btn('image', MdImage, 'dialog.uploadImage', () => onPickImage && onPickImage())}
      {btn('hr', MdRemove, 'editor.horizontalRule', exec('InsertHorizontalRule'))}

      {separator('s6')}
      {btn('removeformat', MdFormatClear, 'editor.clearFormatting', exec('RemoveFormat'))}
      {/*
        Fullscreen is ours, not TinyMCE's: its plugin lifts only the editor
        frame to cover the viewport, which left this toolbar behind it with no
        way back out.  Expanding the whole wrapper keeps the controls reachable.
      */}
      {btn(
        'fullscreen',
        isFullscreen ? MdFullscreenExit : MdFullscreen,
        isFullscreen ? 'editor.exitFullscreen' : 'editor.fullscreen',
        () => onToggleFullscreen && onToggleFullscreen(),
        isFullscreen
      )}

      {(extraButtons || []).length ? separator('s7') : null}
      {(extraButtons || []).map((b) => (
        btn(b.name, b.icon, b.tooltipKey || b.tooltip, run(b.onAction), false)
      ))}
    </Flex>
  );
}
