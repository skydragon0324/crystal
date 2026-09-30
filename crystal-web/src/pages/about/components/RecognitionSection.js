import React from 'react';
import { Box } from '@chakra-ui/react';

import CertificateGrid from './CertificateGrid';
import SectionHeading from './SectionHeading';
import { chapterNumber } from '../constants';

/**
 * 04 — WHY TRUST US: the company's certificates, as a wall.
 *
 * There was a featured "Top 10" card above them, given the whole width, with
 * its own scan and its own dialog. It is gone - the chapter's heading already
 * makes that claim, and a second, larger copy of it pushed the certificates
 * that are the evidence below the fold.
 *
 * Each certificate's scan is bundled in its own named slot, so a certificate
 * with a scan shows it and one without shows its name.
 */
export default function RecognitionSection({ section, certificates }) {
  return (
    <Box>
      {section && (
        <SectionHeading
          number={chapterNumber('recognition')}
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.subtitle}
          align="center"
        />
      )}

      <CertificateGrid certificates={certificates} />
    </Box>
  );
}
