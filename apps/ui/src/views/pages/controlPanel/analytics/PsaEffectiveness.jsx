import { useCallback, useEffect, useState } from 'react';
import * as React from 'react';

import { useLazyQuery } from '@apollo/client';
import { Box, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { IconArrowDown, IconArrowUp, IconMinus, IconUsers } from '@tabler/icons-react';
import moment from 'moment';

import EmptyState from '../../../../ui-component/EmptyState';
import MainCard from '../../../../ui-component/cards/MainCard';
import { PSA_EFFECTIVENESS } from '../../../../utils/graphql/controlPanel/queries';

import useAnalyticsFilters from './useAnalyticsFilters';

// V16 — PSA effectiveness panel.
//
// For each configured PSA, the most recent play and what happened in a
// ±5 minute window: viewers around it + requests before vs after. Helps
// the owner see whether the PSA held attention (steady or rising request
// rate) or chased viewers off (sharp drop).
//
// Data limitation: PsaSequence only stores the most recent lastPlayed,
// not a full play history. So each row analyzes ONE play — the most recent.
// That's still the most actionable sample (the rest is historical).

const RequestDelta = ({ before, after }) => {
  const delta = (after || 0) - (before || 0);
  if (delta === 0) {
    return (
      <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color: 'text.disabled' }}>
        <IconMinus size={14} stroke={2} />
        <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>0</Typography>
      </Stack>
    );
  }
  if (delta > 0) {
    return (
      <Tooltip title="Request rate held or grew through the PSA — viewers stayed engaged">
        <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color: 'success.main' }}>
          <IconArrowUp size={14} stroke={2} />
          <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>+{delta}</Typography>
        </Stack>
      </Tooltip>
    );
  }
  return (
    <Tooltip title="Requests dipped after the PSA played — could mean viewers tuned out">
      <Stack direction="row" spacing={0.25} alignItems="center" sx={{ color: 'error.main' }}>
        <IconArrowDown size={14} stroke={2} />
        <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>{delta}</Typography>
      </Stack>
    </Tooltip>
  );
};

const PsaPlayRow = ({ play }) => {
  const playedRel = play.lastPlayedMs ? moment(play.lastPlayedMs).fromNow() : 'never played';
  const playedAbs = play.lastPlayedMs ? moment(play.lastPlayedMs).format('ddd MMM D, h:mm a') : null;
  const everPlayed = !!play.lastPlayedMs;

  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={{ xs: 1, sm: 2 }}
      alignItems={{ xs: 'flex-start', sm: 'center' }}
      sx={{ py: 1.25 }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 14 }} noWrap title={play.name}>
          {play.name}
        </Typography>
        <Tooltip title={playedAbs || ''} placement="bottom-start">
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            Last played {playedRel}
          </Typography>
        </Tooltip>
      </Box>
      {everPlayed ? (
        <>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 100 }}>
            <IconUsers size={14} stroke={1.75} />
            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {play.viewersAround?.toLocaleString() ?? 0}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              viewers
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 180 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {play.requestsBefore ?? 0} → {play.requestsAfter ?? 0} req
            </Typography>
            <RequestDelta before={play.requestsBefore} after={play.requestsAfter} />
          </Stack>
        </>
      ) : (
        <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
          Hasn&apos;t played yet
        </Typography>
      )}
    </Stack>
  );
};

const PsaEffectiveness = () => {
  const { timezone } = useAnalyticsFilters();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [psaQuery] = useLazyQuery(PSA_EFFECTIVENESS);

  const fetch = useCallback(async () => {
    if (!timezone) return;
    setLoading(true);
    await psaQuery({
      context: { headers: { Route: 'Control-Panel' } },
      variables: { timezone },
      fetchPolicy: 'network-only',
      onCompleted: (resp) => {
        setData(resp?.psaEffectiveness || null);
        setLoading(false);
      },
      onError: () => setLoading(false)
    });
  }, [psaQuery, timezone]);

  useEffect(() => {
    fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timezone]);

  return (
    <MainCard
      title={
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          PSA effectiveness
        </Typography>
      }
      contentSX={{ p: 2.5 }}
    >
      {loading ? (
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
      ) : !data?.psaPlays || data.psaPlays.length === 0 ? (
        <EmptyState
          title="No PSAs configured"
          body="Add PSAs in Sequences → PSAs to track when they played and how viewers responded."
        />
      ) : (
        <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
          {data.psaPlays.map((p) => (
            <PsaPlayRow key={p.name} play={p} />
          ))}
        </Stack>
      )}
    </MainCard>
  );
};

export default PsaEffectiveness;
