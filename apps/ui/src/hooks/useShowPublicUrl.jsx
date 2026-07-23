import { useMemo } from 'react';

import { useSelector } from '../store';
import { getShowPublicUrl } from '../utils/showPublicUrl';

// Resolves the public viewer-page URL for the current show. Environment
// handling (local/test/prod, swapCP, path-routed self-host) lives in
// getShowPublicUrl so unauthenticated pages can reuse it for any subdomain.
const useShowPublicUrl = () => {
  const { show } = useSelector((state) => state.show);

  return useMemo(() => getShowPublicUrl(show?.showSubdomain), [show?.showSubdomain]);
};

export default useShowPublicUrl;
