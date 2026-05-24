import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import NavMotion from '../NavMotion';
import NavigationScroll from '../NavigationScroll';

describe('NavMotion', () => {
  it('wraps children in a motion.div and renders them', () => {
    const { getByTestId } = render(
      <NavMotion>
        <div data-testid="child">hello</div>
      </NavMotion>
    );
    expect(getByTestId('child')).toBeInTheDocument();
  });

  it('handles missing children gracefully', () => {
    expect(() => render(<NavMotion>{null}</NavMotion>)).not.toThrow();
  });
});

describe('NavigationScroll', () => {
  it('returns its children inside a router', () => {
    const { getByTestId } = render(
      <MemoryRouter>
        <NavigationScroll>
          <div data-testid="scroll-child">hi</div>
        </NavigationScroll>
      </MemoryRouter>
    );
    expect(getByTestId('scroll-child')).toBeInTheDocument();
  });

  it('returns null when children is undefined', () => {
    const { container } = render(
      <MemoryRouter>
        <NavigationScroll />
      </MemoryRouter>
    );
    // When no children, the component returns null — wrapper has empty body
    expect(container.firstChild).toBeNull();
  });
});
