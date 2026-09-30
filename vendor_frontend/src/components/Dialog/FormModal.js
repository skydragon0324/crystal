import React from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  FormControl, FormLabel, FormHelperText, Input, Textarea, Switch, Button,
  SimpleGrid, GridItem, Text, useColorModeValue
} from '@chakra-ui/react';
import SelectField from 'components/Select/SelectField';
import DatePicker from 'components/Picker/DatePicker';
import { getLangText } from 'lang/lang';

/**
 * A form rendered from a field list, so a simple create/edit dialog does
 * not need its own component.
 *
 * fields: [{
 *   name, label, type, options, required, placeholder, help,
 *   colSpan, isReadOnly, min, max, step
 * }]
 * type: text | password | number | date | select | multiselect | textarea | switch
 *
 * `select`/`multiselect` use the searchable SelectField and `date` the
 * DatePicker, so both follow the colour mode and need no per-call styling.
 *
 * Values are held by the caller: `values` in, and every edit comes back
 * through `onChange` with the whole object. Anything more stateful than
 * that belongs in a Formik form of its own - see EditBlogModal.
 */
const FormModal = ({
  isOpen, onClose, title, fields, values, onChange, onSubmit, saving, size,
  submitLabel, cancelLabel,
}) => {
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const helpColor = useColorModeValue('secondaryGray.700', 'secondaryGray.500');
  const brandStars = useColorModeValue('brand.500', 'brand.400');

  const set = (name, value) => onChange(Object.assign({}, values, { [name]: value }));

  const renderField = (f) => {
    const value = values[f.name];

    switch (f.type) {
      case 'select':
        return (
          <SelectField
            name={f.name}
            options={f.options || []}
            value={value === undefined ? null : value}
            placeholder={f.placeholder}
            isDisabled={f.isReadOnly}
            isClearable={!f.required}
            onChange={(v) => set(f.name, v === undefined ? null : v)}
          />
        );

      case 'multiselect':
        return (
          <SelectField
            isMulti
            name={f.name}
            options={f.options || []}
            value={value || []}
            placeholder={f.placeholder}
            isDisabled={f.isReadOnly}
            onChange={(v) => set(f.name, v)}
          />
        );

      case 'date':
        return (
          <DatePicker
            name={f.name}
            value={value || ''}
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
            rows={3} fontSize="sm" variant="main"
            placeholder={f.placeholder}
            value={value || ''}
            isReadOnly={f.isReadOnly}
            onChange={(e) => set(f.name, e.target.value)}
          />
        );

      case 'switch':
        return (
          <Switch
            colorScheme="brandScheme" size="md" mt="8px"
            isChecked={!!value}
            isDisabled={f.isReadOnly}
            onChange={(e) => set(f.name, e.target.checked)}
          />
        );

      default:
        return (
          <Input
            fontSize="sm" h="44px" variant="main"
            type={f.type || 'text'}
            step={f.step}
            min={f.min}
            placeholder={f.placeholder}
            value={value === null || value === undefined ? '' : value}
            isReadOnly={f.isReadOnly}
            onChange={(e) => set(f.name, e.target.value)}
          />
        );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size={size || '2xl'} isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent borderRadius="20px">
        <ModalHeader color={textColor}>{title}</ModalHeader>
        <ModalCloseButton _focus={{ boxShadow: 'none' }} />

        <ModalBody pb="10px">
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing="18px">
            {(fields || []).map((f) => (
              <GridItem key={f.name} colSpan={{ base: 1, md: f.colSpan || 1 }}>
                <FormControl>
                  <FormLabel
                    display="flex" ms="4px" fontSize="sm" fontWeight="500"
                    color={textColor} mb="6px"
                  >
                    {f.label}
                    {f.required ? <Text color={brandStars}>*</Text> : null}
                  </FormLabel>
                  {renderField(f)}
                  {f.help ? (
                    <FormHelperText fontSize="xs" color={helpColor} ms="4px">
                      {f.help}
                    </FormHelperText>
                  ) : null}
                </FormControl>
              </GridItem>
            ))}
          </SimpleGrid>
        </ModalBody>

        <ModalFooter pt="20px">
          <Button variant="light" fontSize="sm" borderRadius="16px" me="12px" onClick={onClose}>
            {cancelLabel || getLangText('TEXT_CANCEL')}
          </Button>
          <Button
            variant="darkBrand" fontSize="sm" fontWeight="500" borderRadius="16px"
            px="26px" onClick={onSubmit} isLoading={saving}
          >
            {submitLabel || getLangText('TEXT_SAVE')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default FormModal;
