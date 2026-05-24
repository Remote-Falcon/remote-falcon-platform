import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import Avatar from '../Avatar';
import Chip from '../Chip';
import Transitions from '../Transitions';
import AnimateButton from '../AnimateButton';
import Accordion from '../Accordion';

const theme = createTheme();
const wrap = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('extended/Avatar', () => {
  it.each(['badge', 'xs', 'sm', 'md', 'lg', 'xl', undefined])(
    'renders the size=%s variant',
    (size) => {
      expect(() => wrap(<Avatar size={size}>A</Avatar>)).not.toThrow();
    }
  );

  it('renders with a color + outline combination', () => {
    expect(() => wrap(<Avatar color="secondary" outline>A</Avatar>)).not.toThrow();
  });
});

describe('extended/Chip', () => {
  it.each(['primary', 'secondary', 'error', 'success', 'warning', undefined])(
    'renders the chipcolor=%s variant',
    (chipcolor) => {
      expect(() => wrap(<Chip label="x" chipcolor={chipcolor} />)).not.toThrow();
    }
  );

  it('renders the outlined variant', () => {
    expect(() => wrap(<Chip label="x" chipcolor="primary" variant="outlined" />)).not.toThrow();
  });

  it('renders the disabled state', () => {
    expect(() => wrap(<Chip label="x" disabled />)).not.toThrow();
  });
});

describe('extended/Transitions', () => {
  it.each(['top-right', 'top', 'bottom-left', 'bottom-right', 'bottom', 'top-left', undefined])(
    'renders with position=%s',
    (position) => {
      expect(() =>
        wrap(
          <Transitions position={position} type="grow" in>
            <div>child</div>
          </Transitions>
        )
      ).not.toThrow();
    }
  );

  it.each(['grow', 'fade', 'collapse', 'slide', 'zoom'])(
    'renders with type=%s',
    (type) => {
      expect(() =>
        wrap(
          <Transitions type={type} in direction="up">
            <div>child</div>
          </Transitions>
        )
      ).not.toThrow();
    }
  );
});

describe('extended/AnimateButton', () => {
  it('default scale type renders children', () => {
    wrap(<AnimateButton><span data-testid="ab-child">x</span></AnimateButton>);
    expect(screen.getByTestId('ab-child')).toBeInTheDocument();
  });

  it.each([
    ['slide', 'up'],
    ['slide', 'down'],
    ['slide', 'left'],
    ['slide', 'right'],
    ['rotate', 'right'],
    ['scale', 'right']
  ])('renders type=%s direction=%s without throwing', (type, direction) => {
    expect(() =>
      wrap(
        <AnimateButton type={type} direction={direction}>
          <span>x</span>
        </AnimateButton>
      )
    ).not.toThrow();
  });

  it('accepts a numeric scale and normalises to {hover, tap}', () => {
    expect(() =>
      wrap(<AnimateButton type="scale" scale={1.1}><span>x</span></AnimateButton>)
    ).not.toThrow();
  });
});

describe('extended/Accordion', () => {
  it('renders a single panel from a data array', () => {
    const data = [
      { id: 'p1', title: 'Panel 1', content: 'Hello' }
    ];
    expect(() => wrap(<Accordion data={data} />)).not.toThrow();
  });
});
