import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  FormControl, FormLabel, FormHelperText, Checkbox, Input, Textarea, Switch, Button,
  SimpleGrid, GridItem, Text, Box, Flex, useColorModeValue
} from '@chakra-ui/react';
import SelectField from './SelectField';
import ColorField from './ColorField';
import DatePicker from './DatePicker';
import ImageField from './ImageField';
import FileListField from './FileListField';
import RichTextEditor from './RichTextEditor';
import { useI18n } from '../i18n';

/**
 * fields: [{ name, label, type, options, required, placeholder, help, colSpan, isReadOnly, min, max, step, rows, folder }]
 * type: text | password | number | date | select | multiselect | textarea
 *       | checkbox | switch | color | image | files | richtext | section | custom
 *
 * `select`/`multiselect` use the searchable SelectField and `date` the custom
 * DatePicker, so both follow the colour mode and the active locale.
 *
 * A `section` entry is a heading rather than an input: it closes the block
 * above it and opens a new one.  A long form read as one run of twenty boxes
 * is what makes it feel long; the same twenty under four headings is a form
 * you can skim, and each block starts on its own row so the grouping survives
 * the grid.
 *
 * columns: how many inputs sit on a row, per breakpoint.  The default keeps
 * the two column form every screen was written against; a form with a lot of
 * short fields (an order, say) passes a wider one and gets three or four.
 * colSpan is clamped to whatever that is, so a field asking for two columns on
 * a one column phone still gets one, and 'full' means the whole row whatever
 * the row happens to be.
 */
const DEFAULT_COLUMNS = { base: 1, md: 2 };

/**
 * The span a field takes at each breakpoint, never wider than the grid.
 *
 * `span` and `colSpan` both work: this console's screens were written
 * against the first and the component library arrived using the second, and
 * making one an alias of the other was cheaper - and less risky - than
 * editing the field list on twenty-three screens to say the same thing.
 */
function spanOf(field, columns) {
  const asked = field.colSpan === undefined ? field.span : field.colSpan;

  const out = {};
  Object.keys(columns).forEach((breakpoint) => {
    const width = columns[breakpoint];
    const wanted = asked === 'full' ? width : (asked || 1);
    out[breakpoint] = Math.max(1, Math.min(wanted, width));
  });
  return out;
}
/**
 * Two ways to drive this, and it takes either.
 *
 * CONTROLLED - `values` and `onChange` - is the one CrudPage uses, because
 * it needs to read the form back on submit.  UNCONTROLLED - `initial`, and
 * the values handed to `onSubmit` - is what the screens in this console were
 * written against, and it is genuinely the nicer of the two for a one-off
 * form that nothing outside the dialog cares about.
 *
 * Supporting both was cheaper - and much less risky - than rewriting seven
 * screens to hold a piece of state they had no other use for.
 */
export default function FormModal({
  isOpen, onClose, title, fields, values, onChange, onSubmit,
  saving, isLoading, size, columns, initial
}) {
  const { t } = useI18n();

  /*
   * The internal copy only does anything when the caller sent no `values`.
   * It is seeded on OPEN rather than on every render, so typing into the form
   * is not undone by the parent re-rendering with the same `initial`.
   */
  const [own, setOwn] = useState(initial || {});

  useEffect(() => {
    if (isOpen) setOwn(Object.assign({}, initial || {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initial]);

  const controlled = values !== undefined && typeof onChange === 'function';
  const current = controlled ? values : own;
  const update = controlled ? onChange : setOwn;
  const busy = saving === undefined ? isLoading : saving;

  /*
   * Required fields are only marked once somebody has tried to save.
   *
   * Opening a create form and being met with six red boxes is being told off
   * for not having typed yet.
   */
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (isOpen) setTouched(false); }, [isOpen]);

  const list = fields || [];

  const isBlank = (field) => {
    if (field.type === 'checkbox' || field.type === 'switch') return false;
    if (field.type === 'files') return !(current[field.name] || []).length;
    const value = current[field.name];
    return value === '' || value === null || value === undefined;
  };

  const missing = list.filter((f) => f.required && f.type !== 'section' && isBlank(f));

  /**
   * What actually gets sent.
   *
   * The form holds everything as it was typed - a number input hands back a
   * STRING - so the shapes are settled here, once, rather than in each of the
   * twenty-three screens.  An empty box becomes null rather than '': the two
   * mean the same thing to somebody clearing a field, and only one of them is
   * a value a date or numeric column will accept.
   */
  const payloadOf = () => {
    const out = {};
    list.forEach((f) => {
      if (f.type === 'section' || f.compute) return;

      const value = current[f.name];
      // A list field always sends a list, empty included: [] is how the form
      // says "this row now has no attachments", and null would read as "leave
      // them alone".
      if (f.type === 'files') out[f.name] = Array.isArray(value) ? value : [];
      else if (f.type === 'checkbox' || f.type === 'switch') out[f.name] = !!value;
      /*
       * AN EMPTY NUMBER BOX IS "NOT ENTERED", NOT "NULL".
       *
       * It used to send null, and on a NOT NULL column - sort_order, a
       * warranty term, a display order - the database refused the whole save.
       * The console reported "a required value is missing" for a field the
       * person had never touched, which is why editing a product looked broken
       * when nothing about the product was wrong.
       *
       * So it is OMITTED. The row keeps the value it has, which is what an
       * untouched blank means, and a column with a default keeps its default.
       * A field that genuinely has to be clearable to null declares
       * `nullable: true` and still sends one.
       */
      else if (f.type === 'number') {
        const blank = value === '' || value === null || value === undefined;
        if (!blank) out[f.name] = Number(value);
        else if (f.nullable) out[f.name] = null;
      }
      else out[f.name] = value === '' || value === undefined ? null : value;
    });
    return out;
  };

  const submit = () => {
    setTouched(true);
    if (missing.length) return;
    onSubmit(payloadOf());
  };
  const textColor = useColorModeValue('navy.700', 'white');
  const helpColor = 'secondaryGray.600';
  const brandStars = useColorModeValue('brand.500', 'brand.400');
  const sectionColor = useColorModeValue('secondaryGray.600', 'secondaryGray.500');
  const ruleColor = useColorModeValue('secondaryGray.100', 'whiteAlpha.200');

  const grid = columns || DEFAULT_COLUMNS;

  // Everything up to the next heading belongs to the block that heading opened.
  const blocks = useMemo(() => {
    const out = [];
    let current = { title: null, fields: [] };

    fields.forEach((f) => {
      if (f.type !== 'section') return current.fields.push(f);
      if (current.title || current.fields.length) out.push(current);
      current = { title: f.label, fields: [] };
    });

    if (current.title || current.fields.length) out.push(current);
    return out;
  }, [fields]);

  /**
   * One field, changed.
   *
   * The new object is built from the *previous* state rather than from the
   * `values` this render closed over, because a handler is allowed to set
   * more than one field.  Two calls built from the same closure both start
   * from the same snapshot, so the second silently undoes the first - which
   * is what lost the stored path every time a file field wrote a path and a
   * filename together, leaving an upload that appeared to do nothing.
   */
  const set = (name, value) => update((prev) => Object.assign({}, prev, { [name]: value }));

  /*
   * Option labels are translated here rather than by each screen.
   *
   * The screens write them in English - 'Smartphones', 'Draft' - which is
   * this console's key, so running them through t() is what makes a dropdown
   * read in Chinese along with everything around it.
   */
  const translated = (options) => (options || []).map((option) => (
    typeof option.label === 'string' ? Object.assign({}, option, { label: t(option.label) }) : option
  ));

  const renderField = (f) => {
    // A computed field shows what it works out from the rest of the form rather
    // than what is stored against its own name, and cannot be typed into: the
    // server works the same figure out again, so an edited one would only ever
    // be a number that disagrees with the two beside it.
    const value = f.compute ? f.compute(current) : current[f.name];

    switch (f.type) {
      // An escape hatch for the screens that need a whole editor inside the
      // form - a repeating table of rows, a computed panel - rather than one
      // more input bound to one more key.
      case 'custom':
        return f.render ? f.render(current, set) : null;

      case 'select':
        return (
          <SelectField
            name={f.name}
            options={translated(f.options)}
            value={value === undefined ? null : value}
            placeholder={f.placeholder ? t(f.placeholder) : undefined}
            isDisabled={f.isReadOnly}
            /*
             * Clearable unless the field says otherwise. A field whose list
             * already CONTAINS the "none of them" answer as a real option has
             * nothing to clear to - offering the x there just puts the control
             * into a fourth state that means the same as the first.
             */
            isClearable={f.isClearable === undefined ? !f.required : f.isClearable}
            /*
             * A field can ASK for the search box. Left alone, SelectField
             * decides by length - over seven options and it appears - which is
             * a reasonable default and the wrong answer for a list that GROWS:
             * notice origins are rows somebody adds in the console, so the
             * picker is searchable on a site with eight and not on a site with
             * six, and the person who has to hunt is the one whose list just
             * crossed the line.
             */
            isSearchable={f.isSearchable}
            onChange={(v) => set(f.name, v === undefined ? null : v)}
          />
        );

      case 'multiselect':
        return (
          <SelectField
            isMulti
            name={f.name}
            options={translated(f.options)}
            /*
             * The values are handed back UNTOUCHED.
             *
             * These used to be run through Number(), which was right for the
             * id lists this field was first written for and silently turned
             * every string code into NaN - a service vocabulary, a status
             * list, anything whose value is a word.
             *
             * SelectField compares with String() either way, so nothing
             * needed the coercion; a screen that genuinely wants numbers can
             * map them in its own toPayload.
             */
            value={value || []}
            placeholder={f.placeholder ? t(f.placeholder) : undefined}
            isDisabled={f.isReadOnly}
            onChange={(v) => set(f.name, v)}
          />
        );

      case 'date':
        return (
          <DatePicker
            name={f.name}
            value={value ? String(value).slice(0, 10) : ''}
            placeholder={f.placeholder}
            isDisabled={f.isReadOnly}
            isClearable={!f.required}
            min={f.min}
            max={f.max}
            onChange={(v) => set(f.name, v || null)}
          />
        );

      case 'textarea':
        return (
          <Textarea
            rows={f.rows || 4} fontSize="sm"
            placeholder={f.placeholder ? t(f.placeholder) : undefined}
            value={value || ''}
            onChange={(e) => set(f.name, e.target.value)}
          />
        );

      /*
       * A colour, picked rather than typed.
       *
       * The column holds a hex either way; the difference is that an editor
       * choosing a badge colour should not have to know that #F59E0B is amber,
       * and should not find out they were wrong from the live site.
       */
      case 'color':
        return (
          <ColorField
            name={f.name}
            value={value || ''}
            isDisabled={f.isReadOnly}
            placeholder={f.placeholder}
            onChange={(next) => set(f.name, next || null)}
          />
        );

      /*
       * A body, not a paragraph.
       *
       * An article is written, not filled in, and a fourteen row textarea is
       * what somebody writes in when nothing better is offered - no headings,
       * no lists, and a pasted screenshot has nowhere to go.
       */
      case 'richtext':
        return (
          <RichTextEditor
            value={value || ''}
            height={f.height || 420}
            isDisabled={f.isReadOnly}
            placeholder={f.placeholder ? t(f.placeholder) : undefined}
            onChange={(next) => set(f.name, next)}
          />
        );

      /*
       * A stored path with a picture of it, rather than a box to type a path
       * into.  These columns hold '/uploads/...' strings, and typing one by
       * hand is how a product ends up with a broken image nobody notices
       * until it is on the storefront.
       */
      case 'image':
        return (
          <ImageField
            value={value || ''}
            folder={f.folder || 'misc'}
            isDisabled={f.isReadOnly}
            onChange={(next) => set(f.name, next)}
          />
        );

      /*
       * A tickbox, which is what twenty-three screens ask for by name.  It is
       * NOT the same control as a switch: a switch says "this is on now" and
       * a checkbox says "include this when I save", and the forms in this
       * console mean the second.
       */
      /*
       * A LIST of attached documents rather than one image path - the
       * certificates published beside a price, which are usually PDFs and
       * have no thumbnail to show.  The value is the array the API stores.
       */
      case 'files':
        return (
          <FileListField
            value={Array.isArray(value) ? value : []}
            folder={f.folder || 'service'}
            isDisabled={f.isReadOnly}
            onChange={(next) => set(f.name, next)}
          />
        );

      case 'checkbox':
        return (
          <Checkbox
            size="md" mt="0.375rem"
            isChecked={!!value}
            isDisabled={f.isReadOnly}
            onChange={(e) => set(f.name, e.target.checked)}
          >
            <Text fontSize="sm" color={helpColor}>{t(f.help || f.label)}</Text>
          </Checkbox>
        );

      case 'switch':
        return (
          <Switch
            colorScheme="brandScheme" size="md" mt="0.5rem"
            isChecked={!!value}
            onChange={(e) => set(f.name, e.target.checked)}
          />
        );

      default:
        return (
          <Input
            fontSize="sm" h="2.75rem"
            type={f.type || 'text'}
            step={f.step}
            min={f.min}
            placeholder={f.placeholder ? t(f.placeholder) : undefined}
            value={value === null || value === undefined ? '' : value}
            isReadOnly={f.isReadOnly || !!f.compute}
            onChange={(e) => set(f.name, e.target.value)}
          />
        );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size={size || '2xl'} isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader color={textColor}>{title}</ModalHeader>
        <ModalCloseButton _focus={{ boxShadow: 'none' }} />
        <ModalBody pb="0.625rem">
          <Flex direction="column" gap="1.375rem" data-gap="22" data-gap-column>
            {blocks.map((block, index) => (
              <Box key={block.title || 'block-' + index}>
                {block.title ? (
                  <Flex align="center" gap="0.625rem" data-gap="10" mb="0.875rem">
                    <Text
                      fontSize="xs" fontWeight="700" textTransform="uppercase"
                      letterSpacing="0.6px" color={sectionColor} whiteSpace="nowrap"
                    >
                      {block.title}
                    </Text>
                    <Box flex="1" h="1px" bg={ruleColor} />
                  </Flex>
                ) : null}

                <SimpleGrid columns={grid} spacing="1.125rem">
                  {block.fields.map((f) => (
                    <GridItem key={f.name} colSpan={spanOf(f, grid)}>
                      <FormControl isInvalid={touched && f.required && isBlank(f)}>
                        {/* A checkbox writes its own label beside the box, so
                            repeating it above would say it twice. */}
                        {f.type === 'checkbox' ? null : (
                          <FormLabel
                            display="flex" ms="0.25rem" fontSize="sm" fontWeight="500"
                            color={textColor} mb="0.375rem"
                          >
                            {t(f.label)}
                            {f.required ? <Text color={brandStars}>*</Text> : null}
                          </FormLabel>
                        )}
                        {renderField(f)}
                        {f.help && f.type !== 'checkbox' ? (
                          <FormHelperText fontSize="xs" color={helpColor} ms="0.25rem">
                            {t(f.help)}
                          </FormHelperText>
                        ) : null}
                      </FormControl>
                    </GridItem>
                  ))}
                </SimpleGrid>
              </Box>
            ))}
          </Flex>
        </ModalBody>
        <ModalFooter pt="1.25rem">
          <Button variant="subtle" fontSize="sm" borderRadius="0.5rem" me="0.75rem" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="brand" fontSize="sm" fontWeight="500" borderRadius="0.5rem"
            px="1.5rem" isLoading={busy}
            // Both modes get the same coerced payload: a screen that holds
            // the values itself still should not have to turn '12' into 12.
            onClick={submit}
          >
            {t('common.save')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
