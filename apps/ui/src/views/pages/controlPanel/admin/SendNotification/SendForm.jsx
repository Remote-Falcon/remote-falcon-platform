import { useMemo, useState } from 'react';
import * as React from 'react';

import { useLazyQuery, useMutation } from '@apollo/client';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  List,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import PropTypes from 'prop-types';

import NotificationRow from '../../../../../layout/MainLayout/Header/NotificationsSection/NotificationRow';
import { useDispatch } from '../../../../../store';
import MainCard from '../../../../../ui-component/cards/MainCard';
import { trackPosthogEvent } from '../../../../../utils/analytics/posthog';
import {
  CREATE_NOTIFICATION,
  CREATE_NOTIFICATION_FOR_USER,
  UPDATE_NOTIFICATION
} from '../../../../../utils/graphql/controlPanel/mutations';
import { GET_SHOWS_AUTO_SUGGEST } from '../../../../../utils/graphql/controlPanel/queries';
import { showAlert } from '../../../globalPageHelpers';

// Char limits — must match the server-side validation in the
// NotificationService. Keep these in sync if the backend bumps them.
const LIMITS = {
  subject: 80,
  preview: 200,
  message: 1000
};

const EMPTY_VALUES = {
  subject: '',
  preview: '',
  message: '',
  link: ''
};

// A link is optional, but if present it must parse as a valid URL.
// No domain whitelist per PRD — admins can link anywhere.
const isValidUrl = (value) => {
  if (!value) return true;
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

// Compute the set of fields that changed between two value objects.
// Used to emit `admin_notification_edited` with a `changed_fields`
// array so we can audit edit patterns without logging the full bodies.
const diffFields = (before, after) => {
  const keys = ['subject', 'preview', 'message', 'link'];
  return keys.filter((k) => (before?.[k] ?? '') !== (after?.[k] ?? ''));
};

const SendForm = ({
  mode = 'create',
  initialValues,
  onSubmitSuccess,
  onCancel
}) => {
  const dispatch = useDispatch();
  const isEdit = mode === 'edit';

  // Recipient toggle is only meaningful in create mode. In edit mode the
  // notification's recipient scope is fixed at create time and we don't
  // expose a way to change it.
  const [recipient, setRecipient] = useState('broadcast');

  // Show autocomplete (for "Send to one show" mode).
  const [showSearchValue, setShowSearchValue] = useState('');
  const [showOptions, setShowOptions] = useState([]);
  const [getShowsAutoSuggestQuery] = useLazyQuery(GET_SHOWS_AUTO_SUGGEST);

  const [values, setValues] = useState({
    subject: initialValues?.subject ?? '',
    preview: initialValues?.preview ?? '',
    message: initialValues?.message ?? '',
    link: initialValues?.link ?? ''
  });

  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [createNotification] = useMutation(CREATE_NOTIFICATION);
  const [createNotificationForUser] = useMutation(CREATE_NOTIFICATION_FOR_USER);
  const [updateNotification] = useMutation(UPDATE_NOTIFICATION);

  const getShowsAutoSuggest = async (showName) => {
    if (!showName || showName.length < 3) {
      setShowOptions([]);
      return;
    }
    await getShowsAutoSuggestQuery({
      context: { headers: { Route: 'Control-Panel' } },
      variables: { showName },
      fetchPolicy: 'network-only',
      onCompleted: (data) => setShowOptions(data?.getShowsAutoSuggest ?? []),
      onError: () => showAlert(dispatch, { alert: 'error' })
    });
  };

  // Per-field validation. Returns the first error message or '' if valid.
  const errors = useMemo(() => {
    const e = {};
    const subject = values.subject?.trim() ?? '';
    if (!subject) e.subject = 'Required';
    else if (subject.length > LIMITS.subject) e.subject = `Max ${LIMITS.subject} chars`;

    const preview = values.preview?.trim() ?? '';
    if (!preview) e.preview = 'Required';
    else if (preview.length > LIMITS.preview) e.preview = `Max ${LIMITS.preview} chars`;

    const message = values.message?.trim() ?? '';
    if (!message) e.message = 'Required';
    else if (message.length > LIMITS.message) e.message = `Max ${LIMITS.message} chars`;

    if (values.link && !isValidUrl(values.link)) e.link = 'Must be a valid URL';

    // showSubdomain — only required in create mode + "oneShow" recipient.
    if (!isEdit && recipient === 'oneShow') {
      if (!showSearchValue) {
        e.showSubdomain = 'Pick a show';
      } else if (!showOptions.includes(showSearchValue)) {
        // The autocomplete enforces real selections; this guards against
        // a user typing into the field without picking from the list.
        e.showSubdomain = 'Pick a real show from the list';
      }
    }
    return e;
  }, [values, isEdit, recipient, showSearchValue, showOptions]);

  const isValid = Object.keys(errors).length === 0;

  const handleField = (field) => (evt) => {
    const v = evt.target.value;
    setValues((prev) => ({ ...prev, [field]: v }));
  };

  const handleBlur = (field) => () => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const previewNotification = useMemo(
    () => ({
      uuid: 'preview',
      subject: values.subject || 'Subject preview',
      preview: values.preview || 'Preview text preview',
      message: values.message,
      link: values.link || null,
      type: 'ADMIN',
      // Static "just now" so the preview's relative time doesn't tick
      // distractingly while the operator types.
      createdDate: new Date().toISOString()
    }),
    [values]
  );

  // Build the GraphQL input. Trimmed; empty link → null so the server
  // doesn't store an empty string.
  const buildInput = () => ({
    subject: values.subject.trim(),
    preview: values.preview.trim(),
    message: values.message.trim(),
    link: values.link?.trim() ? values.link.trim() : null
  });

  const handleSubmitClick = () => {
    // Force-touch all fields so errors render even if the user never blurred.
    setTouched({ subject: true, preview: true, message: true, link: true, showSubdomain: true });
    if (!isValid) return;
    setConfirmOpen(true);
  };

  const resetForm = () => {
    setValues(EMPTY_VALUES);
    setTouched({});
    setRecipient('broadcast');
    setShowSearchValue('');
    setShowOptions([]);
  };

  const handleConfirm = async () => {
    setConfirmOpen(false);
    setSubmitting(true);
    const input = buildInput();
    try {
      if (isEdit) {
        await updateNotification({
          context: { headers: { Route: 'Control-Panel' } },
          variables: { uuid: initialValues?.uuid, notification: input }
        });
        const changed = diffFields(initialValues, input);
        trackPosthogEvent('admin_notification_edited', {
          notification_uuid: initialValues?.uuid,
          changed_fields: changed
        });
        showAlert(dispatch, { message: 'Notification updated' });
      } else if (recipient === 'oneShow') {
        await createNotificationForUser({
          context: { headers: { Route: 'Control-Panel' } },
          variables: { notification: input, showSubdomain: showSearchValue },
          // Keep the broadcasts table in sync when the page shell is
          // showing one — Apollo refetches all active observers of this
          // operation regardless of their variable set.
          refetchQueries: ['listAdminNotifications']
        });
        trackPosthogEvent('admin_notification_sent', {
          recipient_type: 'user',
          has_link: !!input.link,
          subject_length: input.subject.length,
          message_length: input.message.length
        });
        showAlert(dispatch, { message: 'Notification sent' });
        resetForm();
      } else {
        await createNotification({
          context: { headers: { Route: 'Control-Panel' } },
          variables: { notification: input },
          refetchQueries: ['listAdminNotifications']
        });
        trackPosthogEvent('admin_notification_sent', {
          recipient_type: 'admin',
          has_link: !!input.link,
          subject_length: input.subject.length,
          message_length: input.message.length
        });
        showAlert(dispatch, { message: 'Notification sent' });
        resetForm();
      }
      if (onSubmitSuccess) onSubmitSuccess();
    } catch (err) {
      showAlert(dispatch, {
        alert: 'error',
        message: err?.message || 'Failed to send notification'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const confirmMessage = (() => {
    if (isEdit) {
      return 'Save changes to this broadcast? Already-dismissed users will keep their dismissal.';
    }
    if (recipient === 'oneShow') {
      return `This will appear in only ${showSearchValue}'s bell. Continue?`;
    }
    return "This will appear in every logged-in user's bell. Continue?";
  })();

  return (
    <Box>
      <Grid container spacing={3}>
        {!isEdit && (
          <Grid item xs={12}>
            <FormControl>
              <RadioGroup
                row
                value={recipient}
                onChange={(_, v) => setRecipient(v)}
                aria-label="Recipient"
              >
                <FormControlLabel
                  value="broadcast"
                  control={<Radio />}
                  label="Broadcast to all users"
                />
                <FormControlLabel
                  value="oneShow"
                  control={<Radio />}
                  label="Send to one show"
                />
              </RadioGroup>
            </FormControl>
          </Grid>
        )}

        {!isEdit && recipient === 'oneShow' && (
          <Grid item xs={12} md={6}>
            <Autocomplete
              fullWidth
              options={showOptions}
              value={showSearchValue || null}
              inputValue={showSearchValue}
              onInputChange={(_, newInputValue, reason) => {
                setShowSearchValue(newInputValue ?? '');
                if (reason !== 'reset') {
                  getShowsAutoSuggest(newInputValue);
                }
              }}
              onChange={(_, newValue) => {
                if (typeof newValue === 'string') {
                  setShowSearchValue(newValue);
                } else if (newValue == null) {
                  setShowSearchValue('');
                }
              }}
              onBlur={handleBlur('showSubdomain')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  type="text"
                  fullWidth
                  label="Show"
                  error={!!(touched.showSubdomain && errors.showSubdomain)}
                  helperText={touched.showSubdomain ? errors.showSubdomain : 'Type 3+ chars to search'}
                />
              )}
              freeSolo={false}
            />
          </Grid>
        )}

        <Grid item xs={12}>
          <TextField
            label="Subject"
            fullWidth
            value={values.subject}
            onChange={handleField('subject')}
            onBlur={handleBlur('subject')}
            error={!!(touched.subject && errors.subject)}
            helperText={
              (touched.subject && errors.subject) ||
              `${values.subject.length}/${LIMITS.subject}`
            }
            inputProps={{ maxLength: LIMITS.subject }}
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            label="Preview"
            fullWidth
            value={values.preview}
            onChange={handleField('preview')}
            onBlur={handleBlur('preview')}
            error={!!(touched.preview && errors.preview)}
            helperText={
              (touched.preview && errors.preview) ||
              `${values.preview.length}/${LIMITS.preview}`
            }
            inputProps={{ maxLength: LIMITS.preview }}
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            label="Message"
            fullWidth
            multiline
            minRows={4}
            value={values.message}
            onChange={handleField('message')}
            onBlur={handleBlur('message')}
            error={!!(touched.message && errors.message)}
            helperText={
              (touched.message && errors.message) ||
              `${values.message.length}/${LIMITS.message}`
            }
            inputProps={{ maxLength: LIMITS.message }}
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            label="Link (optional)"
            fullWidth
            value={values.link}
            onChange={handleField('link')}
            onBlur={handleBlur('link')}
            error={!!(touched.link && errors.link)}
            helperText={
              (touched.link && errors.link) ||
              'Optional. If provided, shows a "View" button in the row.'
            }
            placeholder="https://..."
          />
        </Grid>

        <Grid item xs={12}>
          <Typography variant="overline" sx={{ color: 'text.secondary' }}>
            Preview
          </Typography>
          <MainCard content={false} sx={{ mt: 1 }}>
            <List dense disablePadding>
              <NotificationRow
                notification={previewNotification}
                unread
                disableLinkNavigation
              />
            </List>
          </MainCard>
        </Grid>

        <Grid item xs={12}>
          <Stack direction="row" spacing={2} justifyContent="flex-end">
            {onCancel && (
              <Button onClick={onCancel} disabled={submitting}>
                Cancel
              </Button>
            )}
            <Button
              variant="contained"
              onClick={handleSubmitClick}
              disabled={submitting || !isValid}
            >
              {isEdit ? 'Save changes' : 'Send notification'}
            </Button>
          </Stack>
        </Grid>
      </Grid>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{isEdit ? 'Save changes?' : 'Send this notification?'}</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirmMessage}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleConfirm}>
            {isEdit ? 'Save' : 'Send'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

SendForm.propTypes = {
  mode: PropTypes.oneOf(['create', 'edit']),
  initialValues: PropTypes.shape({
    uuid: PropTypes.string,
    subject: PropTypes.string,
    preview: PropTypes.string,
    message: PropTypes.string,
    link: PropTypes.string,
    type: PropTypes.string,
    showSubdomain: PropTypes.string
  }),
  onSubmitSuccess: PropTypes.func,
  onCancel: PropTypes.func
};

export default SendForm;
