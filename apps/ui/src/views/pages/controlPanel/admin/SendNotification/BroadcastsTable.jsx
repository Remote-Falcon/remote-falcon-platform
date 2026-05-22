import { useState } from 'react';
import * as React from 'react';

import { useMutation, useQuery } from '@apollo/client';
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Pagination,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  Button
} from '@mui/material';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { formatDistanceToNow } from 'date-fns';

import { useDispatch } from '../../../../../store';
import { trackPosthogEvent } from '../../../../../utils/analytics/posthog';
import { DELETE_NOTIFICATION } from '../../../../../utils/graphql/controlPanel/mutations';
import { LIST_ADMIN_NOTIFICATIONS } from '../../../../../utils/graphql/controlPanel/queries';
import { showAlert } from '../../../globalPageHelpers';

import EditNotificationModal from './EditNotificationModal';

const PAGE_SIZE = 10;

// Truncate helper — used for both subject (~50) and preview (~60) cells.
// Returns the original string if already short enough.
const truncate = (s, n) => {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

// Safe relative-time renderer; matches the bell's parsing strategy so the
// table and the bell don't drift on odd inputs.
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

const ageInDays = (iso) => {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24)));
};

const BroadcastsTable = () => {
  const dispatch = useDispatch();

  const [page, setPage] = useState(1);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, loading, refetch } = useQuery(LIST_ADMIN_NOTIFICATIONS, {
    variables: { offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE },
    fetchPolicy: 'cache-and-network',
    context: { headers: { Route: 'Control-Panel' } }
  });

  const [deleteNotification] = useMutation(DELETE_NOTIFICATION);

  const items = data?.listAdminNotifications?.items ?? [];
  const total = data?.listAdminNotifications?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleEdit = (row) => setEditTarget(row);
  const handleDelete = (row) => setDeleteTarget(row);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      await deleteNotification({
        context: { headers: { Route: 'Control-Panel' } },
        variables: { uuid: target.uuid }
      });
      trackPosthogEvent('admin_notification_deleted', {
        notification_uuid: target.uuid,
        age_days: ageInDays(target.createdDate)
      });
      showAlert(dispatch, { message: 'Notification deleted' });
      // If we just emptied the current page (and we're not on page 1),
      // step back so the table doesn't show a blank screen.
      if (items.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        await refetch();
      }
    } catch (err) {
      showAlert(dispatch, {
        alert: 'error',
        message: err?.message || 'Failed to delete notification'
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const emptyState = !loading && items.length === 0 && page === 1;

  return (
    <Box>
      {emptyState ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            No broadcasts yet. Send your first above.
          </Typography>
        </Box>
      ) : (
        <>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Subject</TableCell>
                  <TableCell>Preview</TableCell>
                  <TableCell>Sent</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.uuid} hover>
                    <TableCell sx={{ fontWeight: 600 }}>
                      <Tooltip title={row.subject || ''} placement="top">
                        <span>{truncate(row.subject, 50)}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>
                      <Tooltip title={row.preview || ''} placement="top">
                        <span>{truncate(row.preview, 60)}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={row.createdDate || ''} placement="top">
                        <span>{safeFormatRelative(row.createdDate)}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Edit">
                          <IconButton
                            size="small"
                            onClick={() => handleEdit(row)}
                            aria-label={`Edit ${row.subject || 'notification'}`}
                          >
                            <IconPencil size={18} stroke={1.5} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            onClick={() => handleDelete(row)}
                            aria-label={`Delete ${row.subject || 'notification'}`}
                          >
                            <IconTrash size={18} stroke={1.5} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {pageCount > 1 && (
            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
              <Pagination
                count={pageCount}
                page={page}
                onChange={(_, p) => setPage(p)}
                color="primary"
              />
            </Stack>
          )}
        </>
      )}

      {editTarget && (
        <EditNotificationModal
          notification={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={async () => {
            setEditTarget(null);
            await refetch();
          }}
        />
      )}

      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete &quot;{truncate(deleteTarget?.subject, 60)}&quot;?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This removes the notification from every user&apos;s bell. Already-dismissed users
            won&apos;t see it return. Continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BroadcastsTable;
