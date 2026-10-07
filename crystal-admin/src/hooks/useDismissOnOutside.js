import { useEffect } from 'react';

/**
 * CLOSES A DROPDOWN WHEN THE POINTER GOES DOWN ANYWHERE ELSE.
 *
 * Chakra's `closeOnBlur` only fires when focus leaves the popover panel, and
 * a select or calendar panel that never took focus (no search box) never
 * blurs - so opening a second dropdown left the first one hanging open. A
 * capture listener on document sees every pointer press first, including the
 * press on another dropdown's trigger, and closes this one unless the press
 * landed on its own trigger or panel (the panel is portalled, hence the refs
 * rather than a DOM ancestor check).
 */
export default function useDismissOnOutside(isOpen, onClose, refs) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onPress = (event) => {
      const inside = refs.some((ref) => ref.current && ref.current.contains(event.target));
      if (!inside) onClose();
    };
    document.addEventListener('mousedown', onPress, true);
    document.addEventListener('touchstart', onPress, true);
    return () => {
      document.removeEventListener('mousedown', onPress, true);
      document.removeEventListener('touchstart', onPress, true);
    };
  }, [isOpen, onClose]); // eslint-disable-line react-hooks/exhaustive-deps
}
