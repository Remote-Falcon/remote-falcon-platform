import * as React from 'react';

import { Grid, Stack, Typography } from '@mui/material';

import MainCard from '../../../../../ui-component/cards/MainCard';

import BroadcastsTable from './BroadcastsTable';
import SendForm from './SendForm';

// Admin "Send a notification" tab. Two stacked cards: the compose form
// on top, the broadcasts table beneath. Both refer to the same data —
// `refetchQueries: ['listAdminNotifications']` on the create mutations
// keeps the table in sync after a send.
const SendNotification = () => (
  <Grid container spacing={3}>
    <Grid item xs={12}>
      <MainCard
        title={
          <Stack spacing={0.5}>
            <Typography variant="h4">Send a notification</Typography>
            <Typography variant="caption" color="text.secondary">
              Push an announcement to every logged-in show, or to one specific show.
            </Typography>
          </Stack>
        }
      >
        <SendForm mode="create" />
      </MainCard>
    </Grid>
    <Grid item xs={12}>
      <MainCard
        title={
          <Stack spacing={0.5}>
            <Typography variant="h4">Broadcasts</Typography>
            <Typography variant="caption" color="text.secondary">
              Edit or remove past broadcasts. Dismissal records persist, so deleted
              notifications never return to a user&apos;s bell.
            </Typography>
          </Stack>
        }
      >
        <BroadcastsTable />
      </MainCard>
    </Grid>
  </Grid>
);

export default SendNotification;
