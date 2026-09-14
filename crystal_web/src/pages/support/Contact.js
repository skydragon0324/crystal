import React, { useState } from 'react';
import { Link as RouterLink, useHistory } from 'react-router-dom';
import {
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  Icon,
  Input,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  useToast
} from '@chakra-ui/react';
import { FiMail, FiMapPin, FiMessageSquare, FiPhone } from 'react-icons/fi';
import { useSelector } from 'react-redux';

import { Breadcrumbs, Section, SelectField } from '@/components/common';
import api from '@/api';
import { selectIsSignedIn, selectUser } from '@/app/authSlice';
import { useSurface } from '@/theme/tokens';
import { useT } from '@/i18n';

const CATEGORY_OPTIONS = [
  { value: 'PRODUCT', label: 'A product' },
  { value: 'REPAIR', label: 'A repair' },
  { value: 'ACCOUNT', label: 'My account' },
  { value: 'WEBSITE', label: 'This website' },
  { value: 'SUGGESTION', label: 'A suggestion' },
  { value: 'GENERAL', label: 'Something else' }
];

/**
 * Contact.
 *
 * The form writes to the member feedback queue, which is the only inbox the
 * platform actually has - so it requires a sign-in rather than pretending to
 * send an anonymous email that nothing would receive.
 */
export default function Contact() {
  const t = useT();

  const surface = useSurface();
  const toast = useToast();
  const history = useHistory();
  const isSignedIn = useSelector(selectIsSignedIn);
  const user = useSelector(selectUser);

  const [form, setForm] = useState({
    title: '',
    content: '',
    category: 'GENERAL',
    contact: ''
  });
  const [busy, setBusy] = useState(false);

  const setValue = (name, value) => setForm((current) => ({ ...current, [name]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;
    setBusy(true);
    try {
      await api.account.submitFeedback(form);
      toast({
        title: 'Message sent',
        description: 'You can follow it from your account.',
        status: 'success',
        duration: 4000,
        isClosable: true
      });
      history.push('/account/feedback');
    } catch (err) {
      toast({ title: err.message, status: 'error', duration: 6000, isClosable: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section py={{ base: 6, md: 10 }}>
      <Breadcrumbs items={[{ label: 'Support', to: '/support' }, { label: 'Contact' }]} />

      <Heading size="lg" color={surface.text} letterSpacing="-0.02em">
        {t('support.contact.contactUs')}
      </Heading>
      <Text color={surface.muted} mt="1" mb="10">
        {t('support.contact.messagesGoToTheSupport')}
      </Text>

      <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={{ base: 8, lg: 12 }}>
        <Box gridColumn={{ lg: 'span 2' }}>
          {isSignedIn ? (
            <Box as="form" onSubmit={submit}>
              <Stack spacing="5">
                <FormControl isRequired>
                  <FormLabel fontSize="sm" fontWeight="600">
                    {t('common.subject')}
                  </FormLabel>
                  <Input
                    value={form.title}
                    onChange={(event) => setValue('title', event.target.value)}
                    placeholder={t('support.contact.karaokeMicrophoneDropsOutAfter')}
                  />
                </FormControl>

                <SelectField
                  label={t('common.thisIsAbout')}
                  value={form.category}
                  onChange={(value) => setValue('category', value)}
                  options={CATEGORY_OPTIONS}
                  isSearchable={false}
                />

                <FormControl isRequired>
                  <FormLabel fontSize="sm" fontWeight="600">
                    {t('common.whatHappened')}
                  </FormLabel>
                  <Textarea
                    rows={8}
                    value={form.content}
                    onChange={(event) => setValue('content', event.target.value)}
                    placeholder={t('support.contact.tellUsWhatYouDid')}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm" fontWeight="600">
                    {t('support.contact.howToReachYou')}
                  </FormLabel>
                  <Input
                    value={form.contact}
                    onChange={(event) => setValue('contact', event.target.value)}
                    placeholder={
                      user ? user.email || user.phone || 'A phone number or email' : 'A phone number or email'
                    }
                  />
                </FormControl>

                <Button
                  type="submit"
                  variant="brand"
                  size="lg"
                  alignSelf="flex-start"
                  isLoading={busy}
                  isDisabled={!form.title.trim() || !form.content.trim()}
                >
                  {t('support.contact.sendMessage')}
                </Button>
              </Stack>
            </Box>
          ) : (
            <Box
              p={{ base: 6, md: 10 }}
              borderRadius="16px"
              border="1px solid"
              borderColor={surface.border}
              textAlign="center"
            >
              <Icon as={FiMessageSquare} boxSize="8" color="brand.500" />
              <Heading size="md" color={surface.text} mt="4">
                {t('support.contact.signInToWriteTo')}
              </Heading>
              <Text color={surface.muted} mt="2" maxW="420px" mx="auto">
                {t('support.contact.messagesAreAttachedToYour')}
              </Text>
              <Button as={RouterLink} to="/login" variant="brand" mt="6">
                {t('common.signIn')}
              </Button>
            </Box>
          )}
        </Box>

        <Stack spacing="5">
          <Box p="6" borderRadius="14px" bg={surface.raised}>
            <Flex gap="3" data-gap="12" align="flex-start">
              <Icon as={FiMapPin} color="brand.500" boxSize="5" mt="0.5" />
              <Box>
                <Text fontWeight="700" color={surface.text}>
                  {t('support.contact.headOffice')}
                </Text>
                <Text fontSize="sm" color={surface.muted} mt="1">
                  {t('support.contact.n318NanjingEastRoad')}
                  <br />
                  {t('support.contact.huangpuShanghai')}
                </Text>
              </Box>
            </Flex>
          </Box>

          <Box p="6" borderRadius="14px" bg={surface.raised}>
            <Flex gap="3" data-gap="12" align="flex-start">
              <Icon as={FiPhone} color="brand.500" boxSize="5" mt="0.5" />
              <Box>
                <Text fontWeight="700" color={surface.text}>
                  {t('support.contact.supportLine')}
                </Text>
                <Text fontSize="sm" color={surface.muted} mt="1">
                  +86 21 6350 1000
                  <br />
                  {t('support.contact.n09001800Seven')}
                </Text>
              </Box>
            </Flex>
          </Box>

          <Box p="6" borderRadius="14px" bg={surface.raised}>
            <Flex gap="3" data-gap="12" align="flex-start">
              <Icon as={FiMail} color="brand.500" boxSize="5" mt="0.5" />
              <Box>
                <Text fontWeight="700" color={surface.text}>
                  {t('support.contact.preferToWalkIn')}
                </Text>
                <Text fontSize="sm" color={surface.muted} mt="1">
                  {t('support.contact.everyServiceCentreTakesWalk')}
                </Text>
                <Button as={RouterLink} to="/support/centres" size="sm" variant="quiet" mt="3">
                  {t('support.contact.findOneNearYou')}
                </Button>
              </Box>
            </Flex>
          </Box>
        </Stack>
      </SimpleGrid>
    </Section>
  );
}
