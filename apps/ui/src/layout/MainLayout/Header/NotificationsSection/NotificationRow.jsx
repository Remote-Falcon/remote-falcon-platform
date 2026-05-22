import * as React from 'react';

import {
  Box,
  Button,
  ListItem,
  ListItemText,
  Stack,
  Typography
} from '@mui/material';
import { IconChevronDown, IconChevronUp, IconExternalLink } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';
import PropTypes from 'prop-types';

// Defensive parse — server returns ISO strings but a malformed date
// shouldn't blow up the row.
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

// Single-row renderer for a notification, shared by the header bell
// dropdown and the admin "Send a notification" live preview. Keeping
// this in one place means the preview is always pixel-accurate to what
// a recipient will see.
//
// Props:
//   notification             — { uuid, subject, preview, message, link, createdDate, ... }
//   unread                   — bool. Drives the left-border accent + bold subject.
//   expanded                 — bool. When true, subject + preview drop their
//                              truncation and the full `message` renders below
//                              with newlines preserved. Parent owns the state.
//   onClick                  — optional row click handler (bell uses it to dismiss
//                              + toggle expansion).
//   onLinkClick              — optional link-button click handler (bell intercepts
//                              to dismiss + track before navigation).
//   disableLinkNavigation    — when true, the "View" link button renders but does
//                              NOT navigate (used by the preview card).
const NotificationRow = ({
  notification,
  unread,
  expanded = false,
  onClick,
  onLinkClick,
  disableLinkNavigation = false
}) => {
  if (!notification) return null;

  const handleRowClick = () => {
    if (onClick) onClick(notification);
  };

  const handleLinkClick = (evt) => {
    // Stop the row's onClick from double-firing.
    evt.stopPropagation();
    if (disableLinkNavigation) {
      evt.preventDefault();
    }
    if (onLinkClick) onLinkClick(notification, evt);
  };

  return (
    <ListItem
      onClick={handleRowClick}
      alignItems="flex-start"
      sx={{
        px: 2,
        py: 1.25,
        cursor: onClick ? 'pointer' : 'default',
        // Unread emphasis: left-border accent + subtle tint.
        // Subtle enough that read rows still feel "present"
        // (not greyed-out junk) but the eye lands on unread
        // first.
        borderLeft: (t) =>
          `3px solid ${unread ? t.palette.primary.main : 'transparent'}`,
        backgroundColor: (t) =>
          unread
            ? t.palette.mode === 'dark'
              ? 'rgba(99, 102, 241, 0.08)'
              : 'rgba(99, 102, 241, 0.04)'
            : 'transparent',
        '&:hover': onClick
          ? {
              backgroundColor: (t) =>
                t.palette.mode === 'dark'
                  ? 'rgba(255,255,255,0.04)'
                  : 'rgba(0,0,0,0.03)'
            }
          : undefined
      }}
    >
      <ListItemText
        disableTypography
        primary={
          <Typography
            variant="body2"
            sx={{
              fontWeight: unread ? 600 : 500,
              ...(expanded
                ? { whiteSpace: 'normal' }
                : {
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  })
            }}
          >
            {notification.subject || '(no subject)'}
          </Typography>
        }
        secondary={
          <Stack spacing={0.75} sx={{ mt: 0.5 }}>
            {notification.preview && (
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  ...(expanded
                    ? { display: 'block' }
                    : {
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      })
                }}
              >
                {notification.preview}
              </Typography>
            )}
            {expanded && notification.message && (
              <Box
                sx={{
                  mt: 0.5,
                  pt: 1,
                  borderTop: (t) => `1px dashed ${t.palette.divider}`
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.primary',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    display: 'block'
                  }}
                >
                  {notification.message}
                </Typography>
              </Box>
            )}
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              spacing={1}
            >
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                {safeFormatRelative(notification.createdDate)}
              </Typography>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                {notification.link && (
                  <Button
                    size="small"
                    variant="text"
                    component="a"
                    href={disableLinkNavigation ? undefined : notification.link}
                    target={disableLinkNavigation ? undefined : '_blank'}
                    rel={disableLinkNavigation ? undefined : 'noopener noreferrer'}
                    onClick={handleLinkClick}
                    startIcon={<IconExternalLink size={14} stroke={1.75} />}
                    sx={{ minWidth: 0, py: 0, fontSize: '0.7rem' }}
                  >
                    View
                  </Button>
                )}
                {onClick && notification.message && (
                  <Box
                    component="span"
                    aria-hidden="true"
                    sx={{ display: 'inline-flex', color: 'text.disabled' }}
                  >
                    {expanded ? (
                      <IconChevronUp size={14} stroke={1.75} />
                    ) : (
                      <IconChevronDown size={14} stroke={1.75} />
                    )}
                  </Box>
                )}
              </Stack>
            </Stack>
          </Stack>
        }
      />
    </ListItem>
  );
};

NotificationRow.propTypes = {
  notification: PropTypes.shape({
    uuid: PropTypes.string,
    subject: PropTypes.string,
    preview: PropTypes.string,
    message: PropTypes.string,
    link: PropTypes.string,
    type: PropTypes.string,
    createdDate: PropTypes.string
  }),
  unread: PropTypes.bool,
  expanded: PropTypes.bool,
  onClick: PropTypes.func,
  onLinkClick: PropTypes.func,
  disableLinkNavigation: PropTypes.bool
};

export default NotificationRow;
