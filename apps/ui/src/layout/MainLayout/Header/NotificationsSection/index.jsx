import { useMemo, useRef, useState } from 'react';
import * as React from 'react';

import { useQuery } from '@apollo/client';
import {
  Badge,
  Box,
  Divider,
  IconButton,
  Link,
  List,
  Popover,
  Stack,
  Tooltip,
  Typography
} from '@mui/material';
import { IconBell } from '@tabler/icons-react';

import useDismissedNotifications from '../../../../hooks/useDismissedNotifications';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';
import { NOTIFICATIONS } from '../../../../utils/graphql/controlPanel/queries';
import NotificationRow from './NotificationRow';

// Cap the dropdown to the 20 most-recent notifications. Anything older
// is uninteresting in an operator context; keeps the list scannable.
const MAX_ROWS = 20;

const NotificationsSection = () => {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  // Per-dropdown-session expanded state. Not persisted — closing the
  // popover (and reopening) collapses everything back to the summary
  // view. Dismissal IS persisted; expansion is just "I'm reading this
  // right now."
  const [expandedSet, setExpandedSet] = useState(() => new Set());
  const { dismissedSet, dismiss, dismissAll } = useDismissedNotifications();

  // Poll-on-mount is fine for now — the bell badge doesn't need real-time
  // updates the way live stats do. TODO: bump to a poll interval if we
  // start surfacing time-sensitive notifications (FPP_HEALTH live alerts).
  const { data } = useQuery(NOTIFICATIONS, {
    fetchPolicy: 'cache-and-network',
    context: { headers: { Route: 'Control-Panel' } }
  });

  const notifications = useMemo(() => {
    const list = Array.isArray(data?.getNotifications) ? data.getNotifications : [];
    // Newest-first defensively even though the server orders for us.
    return [...list]
      .filter((n) => n && n.uuid)
      .sort((a, b) => {
        const aMs = Date.parse(a.createdDate || '') || 0;
        const bMs = Date.parse(b.createdDate || '') || 0;
        return bMs - aMs;
      })
      .slice(0, MAX_ROWS);
  }, [data]);

  const unreadUuids = useMemo(
    () => notifications.filter((n) => !dismissedSet.has(n.uuid)).map((n) => n.uuid),
    [notifications, dismissedSet]
  );
  const unreadCount = unreadUuids.length;

  const handleOpen = () => {
    setOpen(true);
    trackPosthogEvent('notification_bell_opened', { unread_count: unreadCount });
  };
  const handleClose = () => {
    setOpen(false);
    // Reset expansion on close — re-opening starts in summary mode so
    // the dropdown is scannable, not a wall of expanded text.
    setExpandedSet(new Set());
  };

  const handleRowClick = (notification) => {
    const wasUnread = !dismissedSet.has(notification.uuid);
    // Click toggles expansion AND marks the row read (if it wasn't
    // already). Collapsing later doesn't un-dismiss — dismissal is
    // monotonic per PRD-002.
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(notification.uuid)) {
        next.delete(notification.uuid);
      } else {
        next.add(notification.uuid);
      }
      return next;
    });
    dismiss(notification.uuid);
    // Only track the click event on the first interaction; toggling
    // expansion afterward isn't a fresh "click" in analytics terms.
    if (wasUnread) {
      trackPosthogEvent('notification_clicked', {
        has_link: !!notification.link,
        type: notification.type || 'UNKNOWN'
      });
    }
  };

  const handleLinkClick = (notification) => {
    // Dismiss + track explicitly so the `has_link` prop is accurate.
    // The row's onClick is suppressed via stopPropagation inside
    // NotificationRow; the anchor's native target=_blank handles
    // navigation once we return.
    dismiss(notification.uuid);
    trackPosthogEvent('notification_clicked', {
      has_link: true,
      type: notification.type || 'UNKNOWN'
    });
  };

  const handleMarkAllRead = () => {
    if (unreadUuids.length === 0) return;
    trackPosthogEvent('notification_mark_all_read_clicked', { count: unreadUuids.length });
    dismissAll(unreadUuids);
  };

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          ref={anchorRef}
          onClick={handleOpen}
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : 'Notifications'
          }
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
          sx={{ color: 'text.primary' }}
        >
          <Badge
            badgeContent={unreadCount}
            color="error"
            overlap="circular"
            invisible={unreadCount === 0}
            max={99}
          >
            <IconBell stroke={1.5} size={22} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            mt: 1,
            width: 380,
            maxWidth: '90vw',
            borderRadius: 2,
            border: (t) =>
              t.palette.mode === 'dark'
                ? '1px solid rgba(255,255,255,0.06)'
                : `1px solid ${t.palette.divider}`,
            boxShadow: (t) =>
              t.palette.mode === 'dark'
                ? '0 8px 24px rgba(0,0,0,0.5)'
                : '0 8px 24px rgba(0,0,0,0.12)'
          }
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, py: 1.25 }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Notifications
          </Typography>
          {unreadCount > 0 && (
            <Link
              component="button"
              type="button"
              variant="caption"
              underline="hover"
              onClick={handleMarkAllRead}
              sx={{ fontWeight: 500 }}
            >
              Mark all as read
            </Link>
          )}
        </Stack>
        <Divider />

        {notifications.length === 0 ? (
          <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              You&apos;re all caught up
            </Typography>
          </Box>
        ) : (
          <List
            dense
            disablePadding
            sx={{
              maxHeight: 480,
              overflowY: 'auto'
            }}
          >
            {notifications.map((n) => (
              <NotificationRow
                key={n.uuid}
                notification={n}
                unread={!dismissedSet.has(n.uuid)}
                expanded={expandedSet.has(n.uuid)}
                onClick={handleRowClick}
                onLinkClick={handleLinkClick}
              />
            ))}
          </List>
        )}
      </Popover>
    </>
  );
};

export default NotificationsSection;
