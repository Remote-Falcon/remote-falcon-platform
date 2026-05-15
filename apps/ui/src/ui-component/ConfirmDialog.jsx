import * as React from 'react';

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle
} from '@mui/material';
import PropTypes from 'prop-types';

// Shared destructive-action confirm dialog. Pair with a `confirm` state slot
// in the parent that holds { title, message, confirmLabel?, action }.
//
// Usage:
//   const [confirm, setConfirm] = useState(null);
//   ...
//   onClick={() => setConfirm({
//     title: 'Delete X?',
//     message: 'This cannot be undone.',
//     confirmLabel: 'Delete',
//     action: () => doDelete(x)
//   })}
//   ...
//   <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
//
// The dialog calls action() then clears itself; supports both sync and
// async action handlers. Default confirm button is red (destructive).
const ConfirmDialog = ({ confirm, onClose, confirmColor = 'error' }) => {
  const handleConfirm = async () => {
    const action = confirm?.action;
    onClose();
    if (action) await action();
  };

  return (
    <Dialog open={!!confirm} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{confirm?.title}</DialogTitle>
      {confirm?.message && (
        <DialogContent>
          <DialogContentText>{confirm.message}</DialogContentText>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color={confirmColor} variant="contained" onClick={handleConfirm}>
          {confirm?.confirmLabel || 'Confirm'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

ConfirmDialog.propTypes = {
  confirm: PropTypes.shape({
    title: PropTypes.node.isRequired,
    message: PropTypes.node,
    confirmLabel: PropTypes.string,
    action: PropTypes.func
  }),
  onClose: PropTypes.func.isRequired,
  confirmColor: PropTypes.string
};

export default ConfirmDialog;
