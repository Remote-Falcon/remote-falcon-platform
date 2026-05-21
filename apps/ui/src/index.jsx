import React from 'react';

import { ApolloClient, InMemoryCache, ApolloProvider, createHttpLink, ApolloLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { MultiAPILink } from '@habx/apollo-multi-endpoint-link';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { BASE_PATH } from './config';
import { ConfigProvider } from './contexts/ConfigContext';
import reportWebVitals from './reportWebVitals';
import * as serviceWorker from './serviceWorker';
import { store } from './store';

import './assets/scss/style.scss';
import { Environments } from './utils/enum';

// Required VITE_* env vars: bundle is broken without these. Surfaces
// build-time misconfiguration as a loud console error rather than a silent
// runtime degrade. See docs/PHASE-C-KICKOFF.md § 7 (item C8).
const REQUIRED_ENV = [
  'VITE_CONTROL_PANEL_API',
  'VITE_VIEWER_API',
  'VITE_HOSTNAME_PARTS'
];

const missingEnv = REQUIRED_ENV.filter((key) => {
  const value = import.meta.env[key];
  return value === undefined || value === '' || value === 'undefined';
});

if (missingEnv.length > 0) {
  const message =
    `Remote Falcon UI: required build-time env vars are missing or empty: ${missingEnv.join(', ')}. ` +
    'The bundle was built without these values, which means the workflow ' +
    "is missing the corresponding secrets or the build-args weren't passed. " +
    'Check the GitHub Actions deploy workflow + org-level secret access.';
  // eslint-disable-next-line no-console
  console.error(message);
  // Throw: prevents the React tree from mounting against a broken config.
  // Browser surfaces the error; ops sees it in PostHog error tracking.
  throw new Error(message);
}

// Direct PostHog hosts. The previous same-origin /ingest reverse proxy
// (commit 14404bf) was removed because the cluster admin disabled the
// nginx.ingress configuration-snippet annotation used to implement it.
// Tradeoff: the ~25-30% of users on ad blockers / DNS filters that block
// us.i.posthog.com will silently drop events. A snippet-free proxy is
// tracked in issue #130 for follow-up.
const posthogOptions = {
  api_host: 'https://us.i.posthog.com',
  ui_host: 'https://us.posthog.com',
  person_profiles: 'identified_only',
  // Capture unhandled errors + promise rejections as $exception events.
  capture_exceptions: true,
  // Web vitals capture requires BOTH this SDK opt-in AND the project-side
  // "Capture web vitals" toggle in PostHog settings. Either alone is a
  // silent no-op.
  capture_performance: { web_vitals: true }
};

if (import.meta.env.VITE_PUBLIC_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, posthogOptions);
  // Tag every event with the build's release so PostHog Error Tracking
  // can match it against source maps uploaded by `posthog-cli sourcemap
  // upload --release-name $VERSION` in the Dockerfile.
  if (import.meta.env.VITE_VERSION) {
    posthog.register({ $release: import.meta.env.VITE_VERSION });
  }
} else {
  posthog.opt_out_capturing?.();
}

const link = ApolloLink.from([
  new MultiAPILink({
    endpoints: {
      controlPanel: import.meta.env.VITE_CONTROL_PANEL_API,
      viewer: import.meta.env.VITE_VIEWER_API
    },
    createHttpLink: () => createHttpLink()
  })
]);

const client = new ApolloClient({
  cache: new InMemoryCache({
    addTypename: false
  }),
  // defaultOptions,
  link,
  connectToDevTools: import.meta.env.VITE_HOST_ENV === Environments.LOCAL
});

// eslint-disable-next-line import/prefer-default-export
export function setGraphqlHeaders(serviceToken) {
  let authLink = setContext((_, { headers }) => ({
    headers: {
      ...headers
    }
  }));
  if (serviceToken && serviceToken !== '') {
    authLink = setContext((_, { headers }) => ({
      headers: {
        ...headers,
        authorization: `Bearer ${serviceToken}`
      }
    }));
  }
  client.setLink(authLink.concat(link));
}

const container = document.getElementById('root');
const root = createRoot(container);

// Minimal root-level fallback. Sits outside the MUI theme tree, so styling
// stays inline. Single "Reload" action by design — no router nav, no API
// calls, just a hard refresh.
function RootErrorFallback() {
  return (
    <div
      role="alert"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '2rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        textAlign: 'center'
      }}
    >
      <h1 style={{ fontSize: '1.25rem', margin: 0 }}>Something went wrong.</h1>
      <p style={{ margin: 0 }}>Reload the page to try again.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: '0.5rem 1rem',
          fontSize: '1rem',
          cursor: 'pointer',
          border: '1px solid currentColor',
          borderRadius: '4px',
          background: 'transparent'
        }}
      >
        Reload
      </button>
    </div>
  );
}

function handleRootError(error) {
  // Backstop so the root boundary always reports to PostHog, even if the
  // autocapture wiring above misses (e.g. error thrown during render before
  // posthog finishes init).
  try {
    posthog.capture('$exception', {
      error: error?.message,
      stack: error?.stack,
      source: 'root_boundary'
    });
  } catch {
    // Swallow: never let observability break the fallback.
  }
}

root.render(
  <ErrorBoundary FallbackComponent={RootErrorFallback} onError={handleRootError}>
    <Provider store={store}>
      <ConfigProvider>
        <BrowserRouter basename={BASE_PATH}>
          <ApolloProvider client={client}>
            <PostHogProvider client={posthog}>
              <App />
            </PostHogProvider>
          </ApolloProvider>
        </BrowserRouter>
      </ConfigProvider>
    </Provider>
  </ErrorBoundary>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
