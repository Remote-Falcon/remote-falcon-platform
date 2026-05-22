import * as React from 'react';

import { Dialog, DialogContent, DialogTitle } from '@mui/material';
import PropTypes from 'prop-types';

import SendForm from './SendForm';

// Thin wrapper: lifts the SendForm into a modal in edit mode. Recipient
// scope is fixed once a broadcast exists, so we never expose that toggle
// from here — SendForm hides it automatically when mode==='edit'.
const EditNotificationModal = ({ notification, onClose, onSaved }) => (
  <Dialog open={!!notification} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>Edit broadcast</DialogTitle>
    <DialogContent dividers>
      <SendForm
        mode="edit"
        initialValues={notification}
        onSubmitSuccess={onSaved || onClose}
        onCancel={onClose}
      />
    </DialogContent>
  </Dialog>
);

EditNotificationModal.propTypes = {
  notification: PropTypes.shape({
    uuid: PropTypes.string,
    subject: PropTypes.string,
    preview: PropTypes.string,
    message: PropTypes.string,
    link: PropTypes.string,
    type: PropTypes.string,
    createdDate: PropTypes.string
  }),
  onClose: PropTypes.func.isRequired,
  onSaved: PropTypes.func
};

export default EditNotificationModal;
