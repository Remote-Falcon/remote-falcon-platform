import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as React from 'react';

import { useLazyQuery } from '@apollo/client';
import { Box, Button, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconPlayerPause,
  IconPlayerPlay,
  IconPumpkinScary,
  IconShare3,
  IconSnowflake
} from '@tabler/icons-react';
import moment from 'moment-timezone';
import { useParams } from 'react-router-dom';

import { WRAPPED_SUMMARY } from '../../../utils/graphql/controlPanel/queries';

import WrappedCard from './WrappedCard';
import WrappedProgressBar from './WrappedProgressBar';

const parseSeasonSlug = (slug) => {
  if (!slug) return null;
  const match = slug.match(/^(christmas|halloween)-(\d{4})$/i);
  if (!match) return null;
  return { season: match[1].toLowerCase(), year: parseInt(match[2], 10) };
};

const seasonEndDate = (season, year) => {
  if (season === 'halloween') return moment({ year, month: 10, day: 8 }).startOf('day');
  if (season === 'christmas') return moment({ year: year + 1, month: 0, day: 8 }).startOf('day');
  return null;
};

const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return null;
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 1) return `${seconds} seconds`;
  if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
  const hours = Math.floor(totalMinutes / 60);
  const remMin = totalMinutes % 60;
  if (remMin === 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${hours} hour${hours === 1 ? '' : 's'} and ${remMin} minute${remMin === 1 ? '' : 's'}`;
};

const SEASON_THEMES = {
  christmas: {
    title: 'Christmas',
    icon: IconSnowflake,
    bg: 'linear-gradient(180deg, #0c1120 0%, #1a2548 50%, #0c1120 100%)',
    accent: '#c77e23',
    accentBright: '#f4a93a'
  },
  halloween: {
    title: 'Halloween',
    icon: IconPumpkinScary,
    bg: 'linear-gradient(180deg, #0e0719 0%, #2a1240 50%, #0e0719 100%)',
    accent: '#f97316',
    accentBright: '#fb923c'
  }
};

// Per-card display duration in ms. Hero + closing get a beat longer
// because they're more chrome than data; stats are quick reads.
const SLIDE_MS_DEFAULT = 5000;
const SLIDE_MS_BY_KEY = {
  hero: 4500,
  thanks: 6000,
  totalPlay: 6000  // multi-line compound card, takes longer to read
};

const WrappedPage = () => {
  const { token, seasonAndYear } = useParams();
  const parsed = useMemo(() => parseSeasonSlug(seasonAndYear), [seasonAndYear]);
  const [data, setData] = useState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);

  const [wrappedQuery] = useLazyQuery(WRAPPED_SUMMARY);

  useEffect(() => {
    if (!parsed || !token) {
      setLoading(false);
      setError('invalid_url');
      return;
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    wrappedQuery({
      variables: { token, season: parsed.season, year: parsed.year, timezone: tz },
      fetchPolicy: 'network-only',
      onCompleted: (resp) => {
        setData(resp?.wrappedSummary);
        setLoading(false);
      },
      onError: (err) => {
        setError(err?.message || 'fetch_failed');
        setLoading(false);
      }
    });
  }, [token, parsed, wrappedQuery]);

  const theme = parsed ? SEASON_THEMES[parsed.season] : null;
  const ThemeIcon = theme?.icon;

  const cards = useMemo(() => {
    if (!data) return [];
    const out = [];
    out.push({ key: 'hero', eyebrow: `${theme.title} ${data.year}`, intro: 'Wrapped', headline: data.showName || 'Your show' });
    if (data.activeNights > 0) {
      out.push({ key: 'nights', eyebrow: 'You showed up', big: data.activeNights.toLocaleString(), bigUnit: data.activeNights === 1 ? 'night' : 'nights', caption: 'of holiday magic' });
    }
    if (data.uniqueViewers > 0) {
      out.push({ key: 'viewers', eyebrow: 'Your audience', big: data.uniqueViewers.toLocaleString(), bigUnit: data.uniqueViewers === 1 ? 'viewer parked outside' : 'viewers parked outside', caption: data.totalPageHits ? `That's ${data.totalPageHits.toLocaleString()} total page visits` : null });
    }
    if (data.medianDwellSeconds && data.medianDwellSeconds > 0) {
      const minutes = Math.max(1, Math.round(data.medianDwellSeconds / 60));
      out.push({ key: 'dwell', eyebrow: 'They stuck around', big: minutes.toLocaleString(), bigUnit: minutes === 1 ? 'median minute' : 'median minutes', caption: data.longestDwellSeconds && data.longestDwellSeconds > data.medianDwellSeconds * 3 ? `One viewer stayed for ${formatDuration(data.longestDwellSeconds)}` : 'parked outside watching your show' });
    }
    if (data.mostLoyalRegularNights && data.mostLoyalRegularNights >= 2) {
      out.push({ key: 'regular', eyebrow: 'Your biggest fan', big: data.mostLoyalRegularNights.toLocaleString(), bigUnit: data.mostLoyalRegularNights === 1 ? 'night' : 'nights', caption: data.regularsCount ? `Plus ${data.regularsCount.toLocaleString()} other regulars who came back 2+ nights` : 'Your most loyal regular came back this many times' });
    }
    if (data.topRequestedSequence) {
      out.push({ key: 'topReq', eyebrow: 'Most requested', headline: data.topRequestedSequence, big: data.topRequestedCount?.toLocaleString(), bigUnit: data.topRequestedCount === 1 ? 'play' : 'plays' });
    }
    if (data.topRequestedTotalPlaySeconds && data.topRequestedTotalPlaySeconds > 0) {
      const dur = formatDuration(data.topRequestedTotalPlaySeconds);
      if (dur) {
        out.push({ key: 'totalPlay', eyebrow: 'On repeat', intro: 'You played', headline: data.topRequestedSequence, outro: `for ${dur} this season` });
      }
    }
    if (data.peakNightDate && data.peakNightViewers > 0) {
      out.push({ key: 'peakNight', eyebrow: 'Your biggest night', headline: moment(data.peakNightDate).format('dddd, MMM D'), big: data.peakNightViewers.toLocaleString(), bigUnit: data.peakNightViewers === 1 ? 'viewer' : 'viewers' });
    }
    if (data.peakHour !== null && data.peakHour !== undefined) {
      const hourLabel = data.peakHour === 0 ? '12 AM' : data.peakHour === 12 ? '12 PM' : data.peakHour < 12 ? `${data.peakHour} AM` : `${data.peakHour - 12} PM`;
      out.push({ key: 'peakHour', eyebrow: 'Their favorite time', big: hourLabel, caption: data.peakDayOfWeek && data.peakDayOfWeekAvg ? `${data.peakDayOfWeek}s averaged ${data.peakDayOfWeekAvg.toLocaleString()} viewers` : 'was when the parking lot filled up' });
    }
    out.push({ key: 'thanks', eyebrow: 'Thanks for lighting up', headline: `${theme.title} ${data.year}`, caption: 'See you next season', closing: true });
    return out;
  }, [data, theme]);

  // ----- Slide deck state -----
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const [paused, setPaused] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const [progress, setProgress] = useState(0);  // 0..1 within current slide
  const [reachedEnd, setReachedEnd] = useState(false);
  const startTimeRef = useRef(null);
  const animFrameRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e) => {
      setReducedMotion(e.matches);
      if (e.matches) setPaused(true);
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  // Progress / auto-advance loop. Drives the per-slide progress bar and
  // auto-advances when the current slide's duration elapses.
  useEffect(() => {
    if (cards.length === 0 || reachedEnd || paused || reducedMotion) {
      cancelAnimationFrame(animFrameRef.current);
      return undefined;
    }
    const slideMs = SLIDE_MS_BY_KEY[cards[currentIndex]?.key] || SLIDE_MS_DEFAULT;
    startTimeRef.current = performance.now();
    const tick = (now) => {
      const elapsed = now - startTimeRef.current;
      const pct = Math.min(1, elapsed / slideMs);
      setProgress(pct);
      if (pct >= 1) {
        if (currentIndex >= cards.length - 1) {
          setReachedEnd(true);
        } else {
          setCurrentIndex((i) => i + 1);
        }
        return;
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [currentIndex, paused, cards, reachedEnd, reducedMotion]);

  // Reset progress whenever the slide changes
  useEffect(() => {
    setProgress(0);
  }, [currentIndex]);

  // Navigation handlers
  const next = useCallback(() => {
    setProgress(0);
    setCurrentIndex((i) => {
      if (i >= cards.length - 1) {
        setReachedEnd(true);
        return i;
      }
      return i + 1;
    });
  }, [cards.length]);

  const prev = useCallback(() => {
    setProgress(0);
    setReachedEnd(false);
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const jumpTo = useCallback((idx) => {
    setProgress(0);
    setReachedEnd(false);
    setCurrentIndex(Math.max(0, Math.min(cards.length - 1, idx)));
  }, [cards.length]);

  const restart = useCallback(() => {
    setProgress(0);
    setReachedEnd(false);
    setPaused(false);
    setCurrentIndex(0);
  }, []);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === 'Escape') {
        setReachedEnd(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  // Click-half navigation
  const handleClick = (e) => {
    if (reachedEnd) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.35) prev();
    else next();
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${data?.showName} — ${theme?.title} ${data?.year} Wrapped`, url });
        return;
      } catch {
        /* user dismissed */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  // ----- Render branches -----

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error === 'invalid_url' || !parsed) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', p: 4 }}>
        <Stack spacing={1.5} alignItems="center" sx={{ maxWidth: 480, textAlign: 'center' }}>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>
            Wrapped link looks off
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            URLs look like <code>/wrapped/yourshow/christmas-2026</code> or <code> /wrapped/yourshow/halloween-2026</code>. Double-check the link.
          </Typography>
        </Stack>
      </Box>
    );
  }

  if (!data || cards.length === 0) {
    const endMoment = seasonEndDate(parsed.season, parsed.year);
    const seasonOver = data?.seasonComplete ?? (endMoment ? moment().isAfter(endMoment) : false);
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', p: 4 }}>
        <Stack spacing={2} alignItems="center" sx={{ maxWidth: 520, textAlign: 'center' }}>
          {ThemeIcon && (
            <Box sx={{ color: theme.accent, opacity: 0.6 }}>
              <ThemeIcon size={64} stroke={1.25} />
            </Box>
          )}
          <Typography variant="h2" sx={{ fontWeight: 700 }}>
            {seasonOver ? 'No data for this season yet' : `${theme.title} ${parsed.year} Wrapped opens after the season`}
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>
            {seasonOver
              ? `Looks like ${data?.showName || 'this show'} didn't run during ${theme.title} ${parsed.year}.`
              : `Come back after ${(data?.endDate ? moment(data.endDate) : endMoment).format('MMM D, YYYY')} to see how the season went.`}
          </Typography>
        </Stack>
      </Box>
    );
  }

  const currentCard = cards[currentIndex];

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        background: theme.bg,
        color: '#f8f8f5',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      <WrappedProgressBar
        total={cards.length}
        current={currentIndex}
        progress={progress}
        paused={paused || reachedEnd}
        onJump={jumpTo}
        accent={theme.accent}
      />

      {/* Pause/play indicator in top-right (next to the slide counter) */}
      <Box sx={{ position: 'fixed', top: 24, right: 24, zIndex: 11, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Tooltip title={paused ? 'Play (space)' : 'Pause (space)'}>
          <IconButton
            size="small"
            aria-label={paused ? 'Play' : 'Pause'}
            onClick={(e) => {
              e.stopPropagation();
              setPaused((p) => !p);
            }}
            sx={{ color: 'rgba(255,255,255,0.6)', '&:hover': { color: '#fff' } }}
          >
            {paused ? <IconPlayerPlay size={18} /> : <IconPlayerPause size={18} />}
          </IconButton>
        </Tooltip>
        <Typography
          sx={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.5)',
            letterSpacing: '0.08em',
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {String(currentIndex + 1).padStart(2, '0')} / {String(cards.length).padStart(2, '0')}
        </Typography>
      </Box>

      {/* Click target — left third = prev, right two-thirds = next */}
      <Box
        onClick={handleClick}
        sx={{
          position: 'absolute',
          inset: 0,
          cursor: reachedEnd ? 'default' : 'pointer'
        }}
      >
        {/* Stack of cards — only one visible at a time, but all mounted so
            Fade transitions are clean */}
        <Box sx={{ position: 'absolute', inset: 0 }}>
          {cards.map((card, i) => (
            <WrappedCard
              key={card.key}
              card={card}
              accent={theme.accent}
              accentBright={theme.accentBright}
              visible={!reachedEnd && i === currentIndex}
            />
          ))}
        </Box>

        {/* Reached-end overlay with the share button */}
        {reachedEnd && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Stack spacing={3} alignItems="center" sx={{ textAlign: 'center', maxWidth: 480, px: 3 }}>
              <Typography
                sx={{
                  color: theme.accent,
                  letterSpacing: '0.18em',
                  fontWeight: 700,
                  fontSize: { xs: 12, md: 14 },
                  textTransform: 'uppercase'
                }}
              >
                Thanks for lighting up
              </Typography>
              <Typography sx={{ fontWeight: 700, fontSize: { xs: 36, md: 56 }, lineHeight: 1.05 }}>
                {theme.title} {data.year}
              </Typography>
              <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  size="large"
                  startIcon={shareCopied ? <IconCheck size={20} /> : <IconShare3 size={20} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShare();
                  }}
                  sx={{
                    bgcolor: theme.accent,
                    color: '#0c1120',
                    fontWeight: 700,
                    px: 3,
                    py: 1.25,
                    fontSize: 15,
                    '&:hover': { bgcolor: theme.accentBright }
                  }}
                >
                  {shareCopied ? 'Link copied' : 'Share'}
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  onClick={(e) => {
                    e.stopPropagation();
                    restart();
                  }}
                  sx={{
                    color: '#fff',
                    borderColor: 'rgba(255,255,255,0.3)',
                    fontWeight: 600,
                    px: 3,
                    py: 1.25,
                    fontSize: 15,
                    '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.06)' }
                  }}
                >
                  Watch again
                </Button>
              </Stack>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', mt: 2 }}>
                Powered by Remote Falcon
              </Typography>
            </Stack>
          </Box>
        )}
      </Box>

      {/* Side affordance arrows — desktop only, subtle */}
      {!reachedEnd && (
        <>
          <IconButton
            aria-label="Previous slide"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            sx={{
              position: 'fixed',
              left: { xs: 8, md: 24 },
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(255,255,255,0.4)',
              display: { xs: 'none', sm: 'inline-flex' },
              zIndex: 11,
              '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.06)' }
            }}
            disabled={currentIndex === 0}
          >
            <IconArrowLeft size={24} />
          </IconButton>
          <IconButton
            aria-label="Next slide"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            sx={{
              position: 'fixed',
              right: { xs: 8, md: 24 },
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(255,255,255,0.4)',
              display: { xs: 'none', sm: 'inline-flex' },
              zIndex: 11,
              '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.06)' }
            }}
          >
            <IconArrowRight size={24} />
          </IconButton>
        </>
      )}

      {/* First-slide hint — fades out after a moment */}
      {currentIndex === 0 && progress < 0.5 && (
        <Typography
          sx={{
            position: 'fixed',
            bottom: { xs: 24, md: 40 },
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            zIndex: 11,
            transition: 'opacity 600ms ease',
            opacity: progress < 0.4 ? 1 : 0,
            pointerEvents: 'none'
          }}
        >
          Tap, swipe, or use arrow keys to navigate
        </Typography>
      )}
    </Box>
  );
};

export default WrappedPage;
