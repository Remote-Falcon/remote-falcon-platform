import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import MainCard from '../MainCard';
import RevenueCard from '../RevenueCard';
import SubCard from '../SubCard';
import DashboardChartsSkeleton from '../Skeleton/DashboardChartsSkeleton';
import DashboardStatsSkeleton from '../Skeleton/DashboardStatsSkeleton';
import HtmlValidationSkeleton from '../Skeleton/HtmlValidationSkeleton';
import SequencesSkeleton from '../Skeleton/SequencesSkeleton';
import TrackerSkeleton from '../Skeleton/TrackerSkeleton';
import UserProfileSkeleton from '../Skeleton/UserProfileSkeleton';
import ViewerPageTemplatesSkeleton from '../Skeleton/ViewerPageTemplatesSkeleton';

const theme = createTheme();
const wrap = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('cards — base cards', () => {
  it('MainCard renders children', () => {
    wrap(<MainCard title="Hello"><div>card body</div></MainCard>);
    expect(screen.getByText('card body')).toBeInTheDocument();
  });

  it('MainCard renders without a title (untitled card)', () => {
    expect(() => wrap(<MainCard><div>body</div></MainCard>)).not.toThrow();
  });

  it('SubCard renders title and children', () => {
    wrap(<SubCard title="sub-title"><div>sub body</div></SubCard>);
    expect(screen.getByText('sub-title')).toBeInTheDocument();
    expect(screen.getByText('sub body')).toBeInTheDocument();
  });

  it('RevenueCard renders the primary/secondary text + icon', () => {
    expect(() =>
      wrap(
        <RevenueCard
          primary="Revenue"
          secondary="$1,234"
          content="+12% MoM"
          iconPrimary={() => <span>ic</span>}
          color="#000"
        />
      )
    ).not.toThrow();
  });
});

describe('cards — Skeletons', () => {
  it.each([
    ['DashboardChartsSkeleton', DashboardChartsSkeleton],
    ['DashboardStatsSkeleton', DashboardStatsSkeleton],
    ['HtmlValidationSkeleton', HtmlValidationSkeleton],
    ['SequencesSkeleton', SequencesSkeleton],
    ['TrackerSkeleton', TrackerSkeleton],
    ['UserProfileSkeleton', UserProfileSkeleton],
  ])('%s renders without throwing', (_name, Comp) => {
    expect(() => wrap(<Comp />)).not.toThrow();
  });

  it('ViewerPageTemplatesSkeleton renders with tabOptions list', () => {
    expect(() =>
      wrap(<ViewerPageTemplatesSkeleton tabOptions={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} />)
    ).not.toThrow();
  });
});
