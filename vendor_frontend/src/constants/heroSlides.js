import { getLangText } from 'lang/lang';
import { HERO_SLIDE_SEEDS, mockPhotoUrl } from 'utils/mockImage';

/**
 * The storefront hero deck.
 *
 * There is no banner endpoint on the API, so the pictures come from the
 * mock host - real photographs, chosen by a fixed seed so the same slide
 * shows the same image on every load rather than reshuffling under the
 * copy that was written for it. When a banner endpoint appears, give each
 * slide an `image` and the mock stays as the fallback underneath.
 *
 * A function, not an array: the copy is translated, and an array built at
 * import time would freeze it in whatever language loaded first.
 */
export const getPhoneHeroSlides = () => {
  const banner = (seed) => mockPhotoUrl(seed, { width: 1600, height: 720 });

  return [
    {
      key: 'flagship',
      mock: banner(HERO_SLIDE_SEEDS[0]),
      eyebrow: getLangText('PHONE_HERO_EYEBROW'),
      title: getLangText('PHONE_HERO_1_TITLE'),
      subtitle: getLangText('PHONE_HERO_1_SUB'),
      cta: { label: getLangText('PHONE_HERO_CTA'), to: '/vendor/phone/products' },
      align: 'left',
    },
    {
      key: 'camera',
      mock: banner(HERO_SLIDE_SEEDS[1]),
      eyebrow: getLangText('PHONE_HERO_2_EYEBROW'),
      title: getLangText('PHONE_HERO_2_TITLE'),
      subtitle: getLangText('PHONE_HERO_2_SUB'),
      cta: { label: getLangText('PHONE_HERO_CTA'), to: '/vendor/phone/products' },
      align: 'left',
    },
    {
      key: 'battery',
      mock: banner(HERO_SLIDE_SEEDS[2]),
      eyebrow: getLangText('PHONE_HERO_3_EYEBROW'),
      title: getLangText('PHONE_HERO_3_TITLE'),
      subtitle: getLangText('PHONE_HERO_3_SUB'),
      cta: { label: getLangText('PHONE_HERO_CTA'), to: '/vendor/phone/products' },
      align: 'center',
    },
    {
      key: 'service',
      mock: banner(HERO_SLIDE_SEEDS[3]),
      eyebrow: getLangText('PHONE_HERO_4_EYEBROW'),
      title: getLangText('PHONE_HERO_4_TITLE'),
      subtitle: getLangText('PHONE_HERO_4_SUB'),
      cta: { label: getLangText('PHONE_HERO_CTA_SERVICE'), to: '/vendor/phone/agencies' },
      align: 'left',
    },
  ];
};
