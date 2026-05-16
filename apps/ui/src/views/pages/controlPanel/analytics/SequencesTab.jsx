import { createContext, useContext, useEffect, useMemo } from 'react';
import * as React from 'react';

import { Box, Grid, Skeleton, Stack, Typography } from '@mui/material';
import { IconArrowDown, IconArrowUp, IconCategory, IconChevronRight, IconMinus, IconPlaylist } from '@tabler/icons-react';
import _ from 'lodash';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';

import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';
import { useSelector } from '../../../../store';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';
import { ViewerControlMode } from '../../../../utils/enum';

import PsaEffectiveness from './PsaEffectiveness';
import RequestConversion from './RequestConversion';
import useAnalyticsFilters from './useAnalyticsFilters';
import useDashboardStats from './useDashboardStats';

const sequenceDetailUrl = (name) => `/control-panel/analytics/sequence/${encodeURIComponent(name)}`;

// Mode override for the Sequences analytics tab. The two sub-routes
// ("Sequences (Jukebox)" / "Sequences (Voting)") each supply a value so
// the tab always reflects the user's chosen tab, not the show's current
// viewer-control mode — flipping the show mid-season no longer hides
// historical data.
const SequencesAnalyticsModeContext = createContext(null);
const useSequencesAnalyticsMode = () => useContext(SequencesAnalyticsModeContext);

// V11 — Top requested sequences with rank delta.
//
// Horizontal bar chart, top 20 sequences by request count. Each row shows
// the rank-change badge vs. the prior period when compare-to-prior is on.
// Spotify-for-Artists pattern. Click a row → V13 sequence-detail (P1).
const SECTION_LIMIT = 20;

const RankDelta = ({ delta }) => {
  if (delta === null || delta === undefined) return null;
  if (delta === 0) {
    return (
      <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color: 'text.disabled' }}>
        <IconMinus size={14} stroke={2} />
        <Typography variant="caption">—</Typography>
      </Stack>
    );
  }
  if (delta > 0) {
    return (
      <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color: 'success.main' }}>
        <IconArrowUp size={14} stroke={2} />
        <Typography variant="caption">{delta}</Typography>
      </Stack>
    );
  }
  return (
    <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color: 'error.main' }}>
      <IconArrowDown size={14} stroke={2} />
      <Typography variant="caption">{Math.abs(delta)}</Typography>
    </Stack>
  );
};

const TopSequencesBar = ({ items, maxValue, prevRankByName, compareToPrior, onRowClick }) => (
  <Stack spacing={0.75}>
    {items.map((item, i) => {
      const widthPct = maxValue > 0 ? Math.max(2, (item.total / maxValue) * 100) : 0;
      const prevRank = prevRankByName.get(item.name);
      const rankDelta = compareToPrior && prevRank !== undefined ? prevRank - (i + 1) : null;
      return (
        <Stack
          key={item.name}
          direction="row"
          alignItems="center"
          spacing={1.5}
          onClick={() => onRowClick && onRowClick(item.name)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && onRowClick) {
              e.preventDefault();
              onRowClick(item.name);
            }
          }}
          sx={{
            py: 0.75,
            px: 1,
            borderRadius: 1,
            cursor: onRowClick ? 'pointer' : 'default',
            '&:hover': {
              bgcolor: (t) =>
                t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'
            }
          }}
        >
          <Box
            sx={{
              width: 24,
              minWidth: 24,
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
              color: 'text.secondary',
              fontSize: 13,
              fontWeight: 500
            }}
          >
            {i + 1}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="body2" sx={{ fontWeight: 500, flexShrink: 1 }} noWrap>
                {item.name}
              </Typography>
              {compareToPrior && <RankDelta delta={rankDelta} />}
            </Stack>
            <Box
              sx={{
                mt: 0.5,
                height: 6,
                borderRadius: 3,
                bgcolor: (t) =>
                  t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                overflow: 'hidden'
              }}
            >
              <Box
                sx={{
                  height: '100%',
                  width: `${widthPct}%`,
                  borderRadius: 3,
                  bgcolor: 'primary.main',
                  transition: 'width 250ms ease'
                }}
              />
            </Box>
          </Box>
          <Box
            sx={{
              minWidth: 48,
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
              fontSize: 13,
              fontWeight: 600
            }}
          >
            {item.total}
          </Box>
          {onRowClick && (
            <Box sx={{ color: 'text.disabled', display: 'inline-flex' }}>
              <IconChevronRight size={16} stroke={1.75} />
            </Box>
          )}
        </Stack>
      );
    })}
  </Stack>
);

const TopRequested = () => {
  const { range, priorRange, compareToPrior, presetId } = useAnalyticsFilters();
  const navigate = useNavigate();

  const current = useDashboardStats(range);
  const prior = useDashboardStats(compareToPrior ? priorRange : null);

  const mode = useSequencesAnalyticsMode();
  const isJukebox = mode === ViewerControlMode.JUKEBOX;
  const sourceField = isJukebox ? 'jukeboxBySequence' : 'votingBySequence';
  const titleNoun = isJukebox ? 'requested' : 'voted';

  const openSequence = (name) => {
    trackPosthogEvent('analytics_sequence_opened', {
      mode,
      sequence_name: name,
      preset_id: presetId,
      source: 'top_requested'
    });
    navigate(sequenceDetailUrl(name));
  };

  const items = useMemo(() => {
    const raw = current.data?.[sourceField]?.sequences || [];
    return [...raw].sort((a, b) => (b.total || 0) - (a.total || 0)).slice(0, SECTION_LIMIT);
  }, [current.data, sourceField]);

  const prevRankByName = useMemo(() => {
    if (!prior.data) return new Map();
    const raw = prior.data?.[sourceField]?.sequences || [];
    const sorted = [...raw].sort((a, b) => (b.total || 0) - (a.total || 0));
    return new Map(sorted.map((item, i) => [item.name, i + 1]));
  }, [prior.data, sourceField]);

  const maxValue = items.length ? items[0].total || 0 : 0;

  return (
    <MainCard
      title={`Top ${titleNoun} sequences`}
      secondary={
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {compareToPrior ? 'with rank delta vs prior period' : 'in current range'}
        </Typography>
      }
    >
      {current.loading ? (
        <Stack spacing={1}>
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
          ))}
        </Stack>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconPlaylist size={32} stroke={1.5} />}
          title={`No sequence ${titleNoun === 'requested' ? 'requests' : 'votes'} in this range`}
          description={
            isJukebox
              ? 'Once viewers start requesting sequences during a show, they\'ll rank here.'
              : 'Once viewers start voting during a show, sequences will rank here.'
          }
        />
      ) : (
        <TopSequencesBar
          items={items}
          maxValue={maxValue}
          prevRankByName={prevRankByName}
          compareToPrior={compareToPrior}
          onRowClick={openSequence}
        />
      )}
    </MainCard>
  );
};

// V12 — Top voted with win rate.
//
// Same shape as TopRequested but with an extra "win rate" column showing
// how often a voted-for sequence actually wins its round. Reveals
// "this song gets votes but never wins" insight. Voting-mode only.
const TopVoted = () => {
  const { range, presetId } = useAnalyticsFilters();
  const navigate = useNavigate();

  const current = useDashboardStats(range);

  const mode = useSequencesAnalyticsMode();
  const isVoting = mode === ViewerControlMode.VOTING;

  const openSequence = (name) => {
    trackPosthogEvent('analytics_sequence_opened', {
      mode,
      sequence_name: name,
      preset_id: presetId,
      source: 'top_voted'
    });
    navigate(sequenceDetailUrl(name));
  };

  const items = useMemo(() => {
    if (!isVoting) return [];
    const votes = current.data?.votingBySequence?.sequences || [];
    const wins = current.data?.votingWinBySequence?.sequences || [];
    const winsByName = new Map(wins.map((w) => [w.name, w.total || 0]));
    return [...votes]
      .sort((a, b) => (b.total || 0) - (a.total || 0))
      .slice(0, SECTION_LIMIT)
      .map((item) => ({
        ...item,
        wins: winsByName.get(item.name) || 0,
        winRate: item.total > 0 ? (winsByName.get(item.name) || 0) / item.total : 0
      }));
  }, [current.data, isVoting]);

  if (!isVoting) return null;

  const maxValue = items.length ? items[0].total || 0 : 0;

  return (
    <MainCard
      title="Top voted sequences with win rate"
      secondary={
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          win rate = wins ÷ votes
        </Typography>
      }
    >
      {current.loading ? (
        <Stack spacing={1}>
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
          ))}
        </Stack>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconPlaylist size={32} stroke={1.5} />}
          title="No votes in this range"
          description="Once viewers start voting during a show, sequences will rank here."
        />
      ) : (
        <Stack spacing={0.75}>
          {items.map((item) => {
            const widthPct = maxValue > 0 ? Math.max(2, (item.total / maxValue) * 100) : 0;
            const winPct = Math.round(item.winRate * 100);
            return (
              <Stack
                key={item.name}
                direction="row"
                alignItems="center"
                spacing={1.5}
                onClick={() => openSequence(item.name)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openSequence(item.name);
                  }
                }}
                sx={{
                  py: 0.75,
                  px: 1,
                  borderRadius: 1,
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: (t) =>
                      t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'
                  }
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                    {item.name}
                  </Typography>
                  <Box
                    sx={{
                      mt: 0.5,
                      height: 6,
                      borderRadius: 3,
                      bgcolor: (t) =>
                        t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                      overflow: 'hidden'
                    }}
                  >
                    <Box
                      sx={{
                        height: '100%',
                        width: `${widthPct}%`,
                        borderRadius: 3,
                        bgcolor: 'primary.main'
                      }}
                    />
                  </Box>
                </Box>
                <Box
                  sx={{
                    minWidth: 56,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: 13
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {item.total}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color:
                        winPct >= 50 ? 'success.main' : winPct >= 20 ? 'text.secondary' : 'error.main'
                    }}
                  >
                    {winPct}% wins
                  </Typography>
                </Box>
                <Box sx={{ color: 'text.disabled', display: 'inline-flex' }}>
                  <IconChevronRight size={16} stroke={1.75} />
                </Box>
              </Stack>
            );
          })}
        </Stack>
      )}
    </MainCard>
  );
};

// V14 — Sequence ↔ category mix donut.
//
// One donut per period: requests/votes broken down by sequence `category`.
// Joins the per-sequence stats against `show.sequences[].category` —
// sequences without a category are bucketed under "Uncategorized."
const CategoryColors = [
  '#1f7778',
  '#c77e23',
  '#2196f3',
  '#9c27b0',
  '#ff9800',
  '#4caf50',
  '#f44336',
  '#607d8b'
];

const CategoryMix = () => {
  const { range } = useAnalyticsFilters();
  const { show } = useSelector((state) => state.show);
  const current = useDashboardStats(range);

  const isJukebox = useSequencesAnalyticsMode() === ViewerControlMode.JUKEBOX;
  const sourceField = isJukebox ? 'jukeboxBySequence' : 'votingBySequence';

  const segments = useMemo(() => {
    const raw = current.data?.[sourceField]?.sequences || [];
    const categoryByName = new Map(
      (show?.sequences || []).map((s) => [s.name, s.category || 'Uncategorized'])
    );
    const totals = new Map();
    raw.forEach((row) => {
      const cat = categoryByName.get(row.name) || 'Uncategorized';
      totals.set(cat, (totals.get(cat) || 0) + (row.total || 0));
    });
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((acc, [, v]) => acc + v, 0);
    return { entries: sorted, total };
  }, [current.data, sourceField, show?.sequences]);

  if (current.loading) {
    return (
      <MainCard title="Category mix">
        <Skeleton variant="circular" width={180} height={180} sx={{ mx: 'auto' }} />
      </MainCard>
    );
  }

  if (segments.total === 0) {
    return (
      <MainCard title="Category mix">
        <EmptyState
          icon={<IconCategory size={32} stroke={1.5} />}
          title="No data to break down by category"
          description="Once viewers interact with sequences that have categories, the mix will show here."
        />
      </MainCard>
    );
  }

  // Render a CSS conic-gradient donut — no chart-library dep needed.
  let cumulative = 0;
  const stops = segments.entries.map(([cat, value], i) => {
    const startPct = (cumulative / segments.total) * 100;
    cumulative += value;
    const endPct = (cumulative / segments.total) * 100;
    const color = CategoryColors[i % CategoryColors.length];
    return `${color} ${startPct}% ${endPct}%`;
  });

  return (
    <MainCard
      title="Category mix"
      secondary={
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {isJukebox ? 'requests by category' : 'votes by category'}
        </Typography>
      }
    >
      {/* Donut on top, legend below — the card sits in a narrow lg=4
          column so a side-by-side legend gets truncated to "C…/M…/N…"
          even with a flexible width. Stacking keeps full category names
          readable at every breakpoint. */}
      <Stack spacing={2.5} alignItems="stretch">
        <Box
          sx={{
            position: 'relative',
            width: 180,
            height: 180,
            mx: 'auto',
            borderRadius: '50%',
            background: `conic-gradient(${stops.join(', ')})`,
            flexShrink: 0,
            '&::after': {
              content: '""',
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 110,
              height: 110,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              bgcolor: 'background.paper'
            }
          }}
        >
          <Stack
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              alignItems: 'center',
              zIndex: 1
            }}
          >
            <Typography variant="h3" sx={{ fontWeight: 700, lineHeight: 1 }}>
              {segments.total}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              total
            </Typography>
          </Stack>
        </Box>
        <Stack spacing={0.75}>
          {segments.entries.map(([cat, value], i) => {
            const pct = Math.round((value / segments.total) * 100);
            return (
              <Stack key={cat} direction="row" alignItems="center" spacing={1.5}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '2px',
                    bgcolor: CategoryColors[i % CategoryColors.length],
                    flexShrink: 0
                  }}
                />
                <Typography variant="body2" sx={{ flex: 1, fontWeight: 500, minWidth: 0 }} noWrap>
                  {cat}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'text.secondary',
                    fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0
                  }}
                >
                  {value} · {pct}%
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      </Stack>
    </MainCard>
  );
};

// Fire a tab-view event tagged with mode + current date preset so we can
// see in PostHog which tab is actually getting used and whether operators
// flip between them within a session. Lives in its own component so we
// can subscribe to filters without forcing SequencesTab itself to.
const SequencesTabViewTracker = ({ mode }) => {
  const { presetId } = useAnalyticsFilters();
  useEffect(() => {
    trackPosthogEvent('analytics_sequences_tab_viewed', { mode, preset_id: presetId });
  }, [mode, presetId]);
  return null;
};
SequencesTabViewTracker.propTypes = {
  mode: PropTypes.oneOf([ViewerControlMode.JUKEBOX, ViewerControlMode.VOTING]).isRequired
};

const SequencesTab = ({ mode }) => (
  <SequencesAnalyticsModeContext.Provider value={mode}>
    <SequencesTabViewTracker mode={mode} />
    <Grid container spacing={2}>
      <Grid item xs={12} lg={8}>
        <TopRequested />
      </Grid>
      <Grid item xs={12} lg={4}>
        <CategoryMix />
      </Grid>
      <Grid item xs={12}>
        <TopVoted />
      </Grid>
      <Grid item xs={12} lg={7}>
        <RequestConversion />
      </Grid>
      <Grid item xs={12} lg={5}>
        <PsaEffectiveness />
      </Grid>
    </Grid>
  </SequencesAnalyticsModeContext.Provider>
);

SequencesTab.propTypes = {
  mode: PropTypes.oneOf([ViewerControlMode.JUKEBOX, ViewerControlMode.VOTING]).isRequired
};

export default SequencesTab;
