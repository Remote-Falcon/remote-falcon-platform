import { useMemo } from 'react';

import { useSelector } from '../store';
import { Environments } from '../utils/enum';

// Resolves the public viewer-page URL for the current show, environment-aware.
// Local dev uses a `subdomain.localhost:5173` form, dev test environment uses
// `*.remotefalcon.dev`, production uses `*.remotefalcon.com`. The
// `VITE_SWAP_CP` flag (used by some local setups) collapses everything to
// `localhost:5173`.
const useShowPublicUrl = () => {
  const { show } = useSelector((state) => state.show);

  return useMemo(() => {
    if (!show?.showSubdomain) return null;
    const swapCP = import.meta.env.VITE_SWAP_CP === 'true';
    if (import.meta.env.VITE_HOST_ENV === Environments.LOCAL) {
      return swapCP ? 'http://localhost:5173' : `http://${show.showSubdomain}.localhost:5173`;
    }
    if (import.meta.env.VITE_HOST_ENV === Environments.TEST) {
      return `https://${show.showSubdomain}.remotefalcon.dev`;
    }
    return `https://${show.showSubdomain}.remotefalcon.com`;
  }, [show?.showSubdomain]);
};

export default useShowPublicUrl;
