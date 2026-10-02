import { Environments } from '../../../../utils/enum';

// Max viewer pages per show (#191). Shared by every UI path that adds a
// page (viewer page editor, tab strip, template gallery). Mirrors
// ViewerPageService.MAX_PAGES_PER_SHOW on the control-panel server, which
// rejects saves that grow past it regardless of the local override below.
export const MAX_PAGES = 5;

// Local-env override matches the speeddial behavior the editor replaced.
export const canExceedMax = import.meta.env.VITE_HOST_ENV === Environments.LOCAL;

export const isAtPageLimit = (pageCount, maxPages = MAX_PAGES, allowExceed = canExceedMax) =>
  !allowExceed && pageCount >= maxPages;

// Explains why a page-adding action is unavailable at the cap. `action` is
// the verb phrase for what the user tried ("duplicate", "add a page").
// Shows grandfathered above the cap get the limit spelled out, since
// deleting a single page would not bring them back under it.
export const pageLimitMessage = (pageCount, maxPages = MAX_PAGES, action = 'duplicate') =>
  pageCount > maxPages
    ? `You have ${pageCount} pages; the limit is ${maxPages}. Delete pages to ${action}.`
    : `You have ${maxPages} pages. Delete one to ${action}.`;
