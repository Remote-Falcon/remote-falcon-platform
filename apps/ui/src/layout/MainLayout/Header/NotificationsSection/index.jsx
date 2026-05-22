import { useMemo, useRef, useState } from 'react';
import * as React from 'react';

import { useQuery } from '@apollo/client';
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  Link,
  List,
  ListItem,
  ListItemText,
  Popover,
  Stack,
  Tooltip,
  Typography
} from '@mui/material';
import { IconBell, IconExternalLink } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';

import useDismissedNotifications from '../../../../hooks/useDismissedNotifications';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';
import { NOTIFICATIONS } from '../../../../utils/graphql/controlPanel/queries';

// Cap the dropdown to the 20 most-recent notifications. Anything older
// is uninteresting in an operator context; keeps the list scannable.
const MAX_ROWS = 20;

// Defensive parse — server returns ISO strings but a malformed date
// shouldn't blow up the whole header.
const safeFormatRelative = (iso) => {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  try {
    return `${formatDistanceToNow(new Date(ms))} ago`;
  } catch {
    return '';
  }
};

const NotificationsSection = () => {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
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
  const handleClose = () => setOpen(false);

  const handleRowClick = (notification) => {
    dismiss(notification.uuid);
    trackPosthogEvent('notification_clicked', {
      has_link: !!notification.link,
      type: notification.type || 'UNKNOWN'
    });
  };

  const handleLinkClick = (notification) => (evt) => {
    // Stop the row's onClick from double-firing — we'll dismiss + track
    // explicitly here so the `has_link` prop is accurate.
    evt.stopPropagation();
    dismiss(notification.uuid);
    trackPosthogEvent('notification_clicked', {
      has_link: true,
      type: notification.type || 'UNKNOWN'
    });
    // Let the anchor's native target=_blank handle the navigation.
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
            {notifications.map((n) => {
              const isUnread = !dismissedSet.has(n.uuid);
              return (
                <ListItem
                  key={n.uuid}
                  onClick={() => handleRowClick(n)}
                  alignItems="flex-start"
                  sx={{
                    px: 2,
                    py: 1.25,
                    cursor: 'pointer',
                    // Unread emphasis: left-border accent + subtle tint.
                    // Subtle enough that read rows still feel "present"
                    // (not greyed-out junk) but the eye lands on unread
                    // first.
                    borderLeft: (t) =>
                      `3px solid ${isUnread ? t.palette.primary.main : 'transparent'}`,
                    backgroundColor: (t) =>
                      isUnread
                        ? t.palette.mode === 'dark'
                          ? 'rgba(99, 102, 241, 0.08)'
                          : 'rgba(99, 102, 241, 0.04)'
                        : 'transparent',
                    '&:hover': {
                      backgroundColor: (t) =>
                        t.palette.mode === 'dark'
                          ? 'rgba(255,255,255,0.04)'
                          : 'rgba(0,0,0,0.03)'
                    }
                  }}
                >
                  <ListItemText
                    disableTypography
                    primary={
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: isUnread ? 600 : 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {n.subject || '(no subject)'}
                      </Typography>
                    }
                    secondary={
                      <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                        {n.preview && (
                          <Typography
                            variant="caption"
                            sx={{
                              color: 'text.secondary',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}
                          >
                            {n.preview}
                          </Typography>
                        )}
                        <Stack
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          spacing={1}
                        >
                          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                            {safeFormatRelative(n.createdDate)}
                          </Typography>
                          {n.link && (
                            <Button
                              size="small"
                              variant="text"
                              component="a"
                              href={n.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={handleLinkClick(n)}
                              startIcon={<IconExternalLink size={14} stroke={1.75} />}
                              sx={{ minWidth: 0, py: 0, fontSize: '0.7rem' }}
                            >
                              View
                            </Button>
                          )}
                        </Stack>
                      </Stack>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        )}
      </Popover>
    </>
  );
};

export default NotificationsSection;
