import { Component, Suspense } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import lazyChunk from '../lazyChunk';

// Vite's preload helper is `baseModule().catch(handlePreloadError)`, and
// handlePreloadError only rethrows when the vite:preloadError event was NOT
// default-prevented. index.jsx prevents it (so a stale chunk gets one clean
// reload), which means a failed chunk import RESOLVES with `undefined`
// instead of rejecting. React.lazy then reads `.default` off `undefined` and
// throws to the root boundary mid-reload — PostHog issues 019f5b28-6ff9
// (React.lazy `_result.default`) and 019f91cc-c5fe (Locales.jsx).
//
// lazyChunk keeps the tree suspended on that path so the reload is the only
// thing the visitor sees.

class Boundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <span>boundary</span> : this.props.children;
  }
}

const renderLazy = (loader) => {
  const Lazy = lazyChunk(loader);
  return render(
    <Boundary>
      <Suspense fallback={<span>loading</span>}>
        <Lazy />
      </Suspense>
    </Boundary>
  );
};

// React.lazy resolution spans several microtask turns before it commits.
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('lazyChunk', () => {
  it('renders the component once the chunk resolves', async () => {
    renderLazy(() => Promise.resolve({ default: () => <span>loaded</span> }));

    expect(await screen.findByText('loaded')).toBeInTheDocument();
  });

  it('stays suspended when the chunk resolves undefined', async () => {
    renderLazy(() => Promise.resolve(undefined));
    await settle();

    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('does not reach the error boundary when the chunk resolves undefined', async () => {
    // The pre-fix failure mode: "Cannot read properties of undefined
    // (reading 'default')" thrown out of React.lazy, replacing the page with
    // "Something went wrong" for the moment before the reload lands.
    renderLazy(() => Promise.resolve(undefined));
    await settle();

    expect(screen.queryByText('boundary')).not.toBeInTheDocument();
  });

  it('still propagates a genuine import rejection to the boundary', async () => {
    // Only the default-prevented path resolves undefined. A real rejection —
    // e.g. sessionStorage blocked, so index.jsx returns before calling
    // preventDefault() — must keep surfacing to the boundary.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderLazy(() => Promise.reject(new Error('chunk 404')));

    expect(await screen.findByText('boundary')).toBeInTheDocument();

    consoleError.mockRestore();
  });
});
