import { useSelector } from 'react-redux';
import { permissionOf } from '../app/authSlice';

/**
 * The level for one page url. 0 none, 1 read, 2 write, 3 super.
 *
 * Every screen that has a Save button asks this, and hides the button rather
 * than letting somebody fill in a form the server is going to refuse.  It is
 * a courtesy, not a security boundary - the guard is on the API - but a
 * console that offers actions it knows will fail is a console people stop
 * trusting.
 */
export default function usePermission(pageUrl) {
  const pages = useSelector((state) => state.auth.pages);
  const level = permissionOf(pages, pageUrl);

  return {
    level,
    canRead: level >= 1,
    canWrite: level >= 2,
    isSuper: level >= 3
  };
}
