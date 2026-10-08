/**
 * THE ABOUT PAGE'S PICTURES - and they are FILES IN THIS PROJECT, not data.
 *
 * They were rows in `about_images`, uploaded through a console screen and
 * fetched with the page. That was the wrong shape for what they are. These
 * are not stock that turns over: they are the photographs a company
 * introduction is composed around, replaced when the building is repainted or
 * a certificate is renewed, and chosen by the same person who writes the copy
 * beside them - which is in content.js, in this folder, for exactly the same
 * reason. A picture reviewed with the words it sits next to belongs beside
 * them.
 *
 * So each one is imported, which buys three things a fetch could not:
 *
 *   THE BUILD FINGERPRINTS THEM, so every file goes out under a content hash
 *   and a replacement is a new address rather than a cache nobody can clear.
 *
 *   A MISSING FILE IS A BUILD ERROR, where a missing row was a hole in the
 *   page that only a reader would ever find.
 *
 *   THE PAGE NEEDS NO REQUEST. There is no loading state and nothing to fail:
 *   the pictures are part of the bundle that draws them.
 *
 * THE FILES LIVE in crystal-web/src/assets/images/about/. The `@assets`
 * alias keeps those imports readable while allowing Create React App to
 * fingerprint and validate them normally.
 *
 * ONE FILE PER SLOT, NAMED AFTER IT. `institute.research.software` is
 * institute-research-software.svg; a slot holding a carousel numbers its files
 * from the second (shop-floor-1-2.svg). Every file here is a generated
 * placeholder at the moment, so that naming is the whole of what tells
 * whoever drops the real photographs in which picture goes where.
 *
 * A SLOT NAME IS WRITTEN OUT IN FULL, never assembled from a key - content.js
 * says why, and the rule holds on this side of the marriage too.
 *
 * `dark` IS THE DARK-MODE RENDERING, and null everywhere so far: a photograph
 * must never be inverted to fit a colour mode, and only a diagram or a map has
 * a second version worth using. ResponsiveMedia falls back to the light file
 * on its own, so null is the honest answer rather than a copy of it.
 *
 * ALT TEXT IS ENGLISH ONLY, exactly as it was as data. `about_images` held one
 * `alt_text` per row whatever language the page was read in, and these are the
 * strings those rows carried. The copy around them is translated (content.zh,
 * content.ru); this is not, and that is a known gap rather than an oversight.
 */

import overview from '@assets/images/about/overview.svg';
import overviewSkyline from '@assets/images/about/overview-skyline.svg';
import overviewHandset from '@assets/images/about/overview-handset.svg';

import institute from '@assets/images/about/institute.svg';
import instituteResearchSoftware from '@assets/images/about/institute-research-software.svg';
import instituteResearchMobile from '@assets/images/about/institute-research-mobile.svg';
import instituteResearchCrystalOs from '@assets/images/about/institute-research-crystal-os.svg';
import instituteResearchImaging from '@assets/images/about/institute-research-imaging.svg';
import instituteResearchIot from '@assets/images/about/institute-research-iot.svg';
import instituteResearchSecurity from '@assets/images/about/institute-research-security.svg';
import instituteTechnology_crystalOs from '@assets/images/about/institute-technology-crystal-os.svg';
import instituteTechnology_smarttvOs from '@assets/images/about/institute-technology-smarttv-os.svg';
import instituteTechnology_computerBios from '@assets/images/about/institute-technology-computer-bios.svg';
import instituteTechnology_cameraSecurity from '@assets/images/about/institute-technology-camera-security.svg';
import instituteTechnology_printAuthentication from '@assets/images/about/institute-technology-print-authentication.svg';
import instituteTechnology_exfatFirmware from '@assets/images/about/institute-technology-exfat-firmware.svg';
import instituteTechnology_cordlessPhoneEncryption from '@assets/images/about/institute-technology-cordless-phone-encryption.svg';

import factory from '@assets/images/about/factory.svg';
import factoryFlowComponents from '@assets/images/about/factory-flow-components.svg';
import factoryFlowSmt from '@assets/images/about/factory-flow-smt.svg';
import factoryFlowAssembly from '@assets/images/about/factory-flow-assembly.svg';
import factoryFlowTesting from '@assets/images/about/factory-flow-testing.svg';
import factoryFlowQa from '@assets/images/about/factory-flow-qa.svg';
import factoryFlowPackaging from '@assets/images/about/factory-flow-packaging.svg';
import factoryCertificateIatf16949 from '@assets/images/about/factory-certificate-iatf-16949.svg';
import factoryCertificateIpcA610 from '@assets/images/about/factory-certificate-ipc-a-610.svg';
import factoryCertificateIso45001 from '@assets/images/about/factory-certificate-iso-45001.svg';
import factoryCertificateRohs from '@assets/images/about/factory-certificate-rohs.svg';
import factoryCertificateReach from '@assets/images/about/factory-certificate-reach.svg';
import factoryCertificateEsdS2020 from '@assets/images/about/factory-certificate-esd-s20-20.svg';

import recognitionCertificateIso9001 from '@assets/images/about/recognition-certificate-iso-9001.svg';
import recognitionCertificateIso14001 from '@assets/images/about/recognition-certificate-iso-14001.svg';
import recognitionCertificateIso27001 from '@assets/images/about/recognition-certificate-iso-27001.svg';
import recognitionCertificateHighTech from '@assets/images/about/recognition-certificate-high-tech.svg';
import recognitionCertificateSoftwareEnterprise from '@assets/images/about/recognition-certificate-software-enterprise.svg';
import recognitionCertificateIpManagement from '@assets/images/about/recognition-certificate-ip-management.svg';
import recognitionCertificateTrustedExport from '@assets/images/about/recognition-certificate-trusted-export.svg';

import shop from '@assets/images/about/shop.svg';
import shopFloor1 from '@assets/images/about/shop-floor-1.svg';
import shopFloor1_2 from '@assets/images/about/shop-floor-1-2.svg';
import shopFloor1_3 from '@assets/images/about/shop-floor-1-3.svg';
import shopFloor2 from '@assets/images/about/shop-floor-2.svg';
import shopFloor2_2 from '@assets/images/about/shop-floor-2-2.svg';
import shopFloor2_3 from '@assets/images/about/shop-floor-2-3.svg';
import shopFloor3 from '@assets/images/about/shop-floor-3.svg';
import shopFloor3_2 from '@assets/images/about/shop-floor-3-2.svg';
import shopFloor3_3 from '@assets/images/about/shop-floor-3-3.svg';

import service from '@assets/images/about/service.svg';

import presenceHeadquarters from '@assets/images/about/presence-headquarters.svg';
import presenceShop from '@assets/images/about/presence-shop.svg';

/**
 * Every picture on the page, by the slot content.js asks for it by.
 *
 * ALWAYS AN ARRAY, even for a slot holding one picture - that is the shape
 * `buildAbout` was written against when this arrived from the API, and a slot
 * that grows from one photograph into a carousel then changes nothing on
 * either side. The order here is the order the slides are shown in.
 */
const ABOUT_IMAGES = {
  /*
   * THE OVERVIEW SLOT IS A SCENE, which is why it holds three files.
   *
   * `layer` is the only place on the page where a picture carries its own
   * GEOMETRY, and it belongs here rather than in content.js: where a cut-out
   * sits in the frame is a property of the artwork, not of the sentence
   * beside it. AboutScene reads these positionally - the first picture is
   * the background and the rest arrive over it - and a slot with one file
   * and no `layer` is still drawn as a single drifting plate.
   *
   * THE NUMBERS ARE SCENE UNITS, not pixels: the frame is 1200 wide and as
   * tall as the chapter asks (4:3, so 900), and the engine scales the whole
   * thing to whatever width it is given. That is what makes one set of
   * coordinates right on a desktop and on a phone.
   */
  'overview': [
    {
      src: overview,
      dark: null,
      alt: 'The main entrance and reception',
      caption: null,
      /* The ground. `cover` so no edge of the frame is ever uncovered. */
      layer: { fit: 'cover', animation: 'zoom-out', duration: 9000 }
    },
    {
      src: overviewSkyline,
      dark: null,
      alt: 'The city around it',
      caption: null,
      /*
       * Along the bottom, rising in. A little parallax, because it is the
       * middle distance - the ground behind it gets none and the handset in
       * front gets more, which is what reads as depth.
       */
      layer: {
        x: 0, y: 600, width: 1200, height: 300,
        animation: 'slide-bottom', delay: 300, duration: 1300, parallax: 0.12
      }
    },
    {
      src: overviewHandset,
      dark: null,
      alt: 'A Crystal handset',
      caption: null,
      /*
       * The subject, arriving last and nearest. The sheen is the light
       * sweep across the screen, which is the one place on this page where
       * it is doing something a still could not.
       */
      layer: {
        x: 790, y: 170, width: 300, height: 553,
        animation: 'zoom-in', delay: 1000, duration: 1100, parallax: 0.4, sheen: true
      }
    }
  ],

  'institute': [ { src: institute, dark: null, alt: 'Engineers at work in the IT institute', caption: null } ],
  'institute.research.software': [ { src: instituteResearchSoftware, dark: null, alt: 'Software development', caption: null } ],
  'institute.research.mobile': [ { src: instituteResearchMobile, dark: null, alt: 'Mobile technology', caption: null } ],
  'institute.research.crystal-os': [ { src: instituteResearchCrystalOs, dark: null, alt: 'Crystal OS', caption: null } ],
  'institute.research.imaging': [ { src: instituteResearchImaging, dark: null, alt: 'Imaging and AI', caption: null } ],
  'institute.research.iot': [ { src: instituteResearchIot, dark: null, alt: 'IoT and connected devices', caption: null } ],
  'institute.research.security': [ { src: instituteResearchSecurity, dark: null, alt: 'Security and updates', caption: null } ],
  'institute.technology.crystal-os': [ { src: instituteTechnology_crystalOs, dark: null, alt: 'Crystal OS, developed in-house', caption: null } ],
  'institute.technology.smarttv-os': [ { src: instituteTechnology_smarttvOs, dark: null, alt: 'SmartTV OS, developed in-house', caption: null } ],
  'institute.technology.computer-bios': [ { src: instituteTechnology_computerBios, dark: null, alt: 'Computer BIOS, developed in-house', caption: null } ],
  'institute.technology.camera-security': [ { src: instituteTechnology_cameraSecurity, dark: null, alt: 'Camera Security, developed in-house', caption: null } ],
  'institute.technology.print-authentication': [ { src: instituteTechnology_printAuthentication, dark: null, alt: 'Print Authentication, developed in-house', caption: null } ],
  'institute.technology.exfat-firmware': [ { src: instituteTechnology_exfatFirmware, dark: null, alt: 'exFAT Firmware, developed in-house', caption: null } ],
  'institute.technology.cordless-phone-encryption': [ { src: instituteTechnology_cordlessPhoneEncryption, dark: null, alt: 'Cordless Phone Encryption, developed in-house', caption: null } ],

  'factory': [ { src: factory, dark: null, alt: 'The factory seen from the yard', caption: null } ],
  'factory.flow.components': [ { src: factoryFlowComponents, dark: null, alt: 'Incoming component inspection', caption: null } ],
  'factory.flow.smt': [ { src: factoryFlowSmt, dark: null, alt: 'A surface-mount line', caption: null } ],
  'factory.flow.assembly': [ { src: factoryFlowAssembly, dark: null, alt: 'Final assembly', caption: null } ],
  'factory.flow.testing': [ { src: factoryFlowTesting, dark: null, alt: 'Functional testing', caption: null } ],
  'factory.flow.qa': [ { src: factoryFlowQa, dark: null, alt: 'Quality inspection', caption: null } ],
  'factory.flow.packaging': [ { src: factoryFlowPackaging, dark: null, alt: 'Packaging', caption: null } ],
  'factory.certificate.iatf-16949': [ { src: factoryCertificateIatf16949, dark: null, alt: 'IATF 16949', caption: null } ],
  'factory.certificate.ipc-a-610': [ { src: factoryCertificateIpcA610, dark: null, alt: 'IPC-A-610', caption: null } ],
  'factory.certificate.iso-45001': [ { src: factoryCertificateIso45001, dark: null, alt: 'ISO 45001', caption: null } ],
  'factory.certificate.rohs': [ { src: factoryCertificateRohs, dark: null, alt: 'RoHS', caption: null } ],
  'factory.certificate.reach': [ { src: factoryCertificateReach, dark: null, alt: 'REACH', caption: null } ],
  'factory.certificate.esd-s20-20': [ { src: factoryCertificateEsdS2020, dark: null, alt: 'ESD S20.20', caption: null } ],

  'recognition.certificate.iso-9001': [ { src: recognitionCertificateIso9001, dark: null, alt: 'ISO 9001', caption: null } ],
  'recognition.certificate.iso-14001': [ { src: recognitionCertificateIso14001, dark: null, alt: 'ISO 14001', caption: null } ],
  'recognition.certificate.iso-27001': [ { src: recognitionCertificateIso27001, dark: null, alt: 'ISO 27001', caption: null } ],
  'recognition.certificate.high-tech': [ { src: recognitionCertificateHighTech, dark: null, alt: 'High-Technology Enterprise', caption: null } ],
  'recognition.certificate.software-enterprise': [ { src: recognitionCertificateSoftwareEnterprise, dark: null, alt: 'National Software Enterprise', caption: null } ],
  'recognition.certificate.ip-management': [ { src: recognitionCertificateIpManagement, dark: null, alt: 'Intellectual Property Management', caption: null } ],
  'recognition.certificate.trusted-export': [ { src: recognitionCertificateTrustedExport, dark: null, alt: 'Trusted Export Enterprise', caption: null } ],

  'shop': [ { src: shop, dark: null, alt: 'The Crystal Shop from the street', caption: null } ],
  'shop.floor.1': [
    { src: shopFloor1, dark: null, alt: 'The handset floor', caption: null },
    { src: shopFloor1_2, dark: null, alt: 'The handset floor', caption: null },
    { src: shopFloor1_3, dark: null, alt: 'The handset floor', caption: null }
  ],
  'shop.floor.2': [
    { src: shopFloor2, dark: null, alt: 'The living room floor', caption: null },
    { src: shopFloor2_2, dark: null, alt: 'The living room floor', caption: null },
    { src: shopFloor2_3, dark: null, alt: 'The living room floor', caption: null }
  ],
  'shop.floor.3': [
    { src: shopFloor3, dark: null, alt: 'The service counter', caption: null },
    { src: shopFloor3_2, dark: null, alt: 'The service counter', caption: null },
    { src: shopFloor3_3, dark: null, alt: 'The service counter', caption: null }
  ],

  'service': [ { src: service, dark: null, alt: 'A technician at an authorised service bench', caption: null } ],

  'presence.headquarters': [ { src: presenceHeadquarters, dark: null, alt: 'Crystal Headquarters in Shanghai', caption: null } ],
  'presence.shop': [ { src: presenceShop, dark: null, alt: 'The Crystal Shop on Nanjing East Road', caption: null } ]
};

export default ABOUT_IMAGES;
