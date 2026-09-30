/**
 * PICTURE OR FILM, decided from the stored path.
 *
 * The advert screens - the two hero runs and the popups - hold one path that
 * may be either, and three places need to know which: the upload field's
 * thumbnail, the list's thumbnail, and the storefront's slide. The storefront
 * is told by the API (`media_type`, from utils/mediaKind.js on the server);
 * the console works it out here, because the CRUD reply is a plain row.
 *
 * THE EXTENSION IS TRUSTWORTHY, and not because anyone trusted the uploader:
 * the server sniffs the stored bytes and renames the file to the canonical
 * extension for what they actually are, so a path that ends in .mp4 is an
 * MP4. The list is the same one the server keeps in utils/mediaKind.js.
 */
export const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.webm'];

export function isVideoPath(path) {
  const text = String(path || '').toLowerCase();
  const at = text.lastIndexOf('.');
  return at !== -1 && VIDEO_EXTENSIONS.indexOf(text.slice(at)) !== -1;
}

export default isVideoPath;
