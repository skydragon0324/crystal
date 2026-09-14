import { useColorModeValue } from '@chakra-ui/react';

/**
 * One hook for the surface colours every panel needs, so a card's background,
 * border and shadow cannot drift apart across forty files.
 *
 * IMPORTANT: like every Chakra hook this must be called before any early
 * `return` and never inside a `.map()` - the rules of hooks are enforced by
 * CRA's build with warnings-as-errors, so breaking them fails `npm run build`
 * rather than showing up at runtime.
 */
export function useSurface() {
  return {
    page: useColorModeValue('#F8FAFC', 'navy.900'),
    card: useColorModeValue('white', 'navy.800'),
    raised: useColorModeValue('secondaryGray.300', 'navy.700'),
    border: useColorModeValue('secondaryGray.100', 'navy.600'),
    hover: useColorModeValue('secondaryGray.300', 'navy.700'),
    text: useColorModeValue('secondaryGray.900', 'navy.50'),
    muted: useColorModeValue('secondaryGray.600', 'navy.200'),
    /*
     * A card does not float in this design - it is a region marked out by a
     * border - so the card shadow is nothing at all.  `overlay` is for the
     * things that genuinely sit above the page: menus, popovers, dialogs.
     */
    shadow: 'none',
    overlay: useColorModeValue(
      '0 10px 30px rgba(15, 23, 42, 0.12)',
      '0 10px 30px rgba(0, 0, 0, 0.55)'
    )
  };
}

/**
 * The sidebar's palette, which follows the colour mode.
 *
 * Kept beside `useSurface` rather than inside it because the menu is not
 * quite a card: it sits flatter than the content next to it, and its hover
 * has to read against its own background rather than against the page.
 */
export function useSidebar() {
  return {
    bg: useColorModeValue('white', 'navy.800'),
    raised: useColorModeValue('secondaryGray.300', 'navy.700'),
    border: useColorModeValue('secondaryGray.100', 'navy.600'),
    text: useColorModeValue('secondaryGray.900', 'navy.50'),
    muted: useColorModeValue('secondaryGray.600', 'navy.200'),
    hover: useColorModeValue('secondaryGray.300', 'navy.700'),
    activeBg: useColorModeValue('brand.50', 'navy.700')
  };
}

/**
 * A trend, as the KPI tiles read it.
 *
 * `up` is not the same question as `good`: a rising repair backlog is a
 * number going up and a thing going wrong, so the caller says which
 * direction is the welcome one and the tile colours it from that.
 */
export function trendOf(delta, higherIsBetter) {
  const value = Number(delta);
  if (!isFinite(value) || value === 0) return { tone: 'gray', sign: '', value: 0 };

  const good = higherIsBetter === false ? value < 0 : value > 0;
  return {
    tone: good ? 'green' : 'red',
    sign: value > 0 ? '+' : '',
    value: value
  };
}
