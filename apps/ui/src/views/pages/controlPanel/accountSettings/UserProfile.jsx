import { useCallback, useEffect, useMemo, useState } from 'react';

import { useMutation } from '@apollo/client';
import ErrorTwoToneIcon from '@mui/icons-material/ErrorTwoTone';
import { Grid, TextField, Typography, Modal } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import _ from 'lodash';
import md5 from 'md5';

import useAuth from '../../../../hooks/useAuth';
import useAutoSave from '../../../../hooks/useAutoSave';
import { saveShowService, saveUserProfileService } from '../../../../services/controlPanel/mutations.service';
import { useDispatch, useSelector } from '../../../../store';
import { gridSpacing } from '../../../../store/constant';
import { setShow } from '../../../../store/slices/show';
import Avatar from '../../../../ui-component/extended/Avatar';
import StickyFormBar from '../../../../ui-component/StickyFormBar';
import { UPDATE_SHOW, UPDATE_USER_PROFILE } from '../../../../utils/graphql/controlPanel/mutations';

import { showAlert } from '../../globalPageHelpers';
import UpdateEmailModal from './UpdateEmail.modal';
import UpdateShowNameModal from './UpdateShowName.modal';

const UserProfile = () => {
  const theme = useTheme();
  const dispatch = useDispatch();
  const { logout } = useAuth();
  const { show } = useSelector((state) => state.show);

  // Compute the gravatar URL from the user's email — keeps this component
  // fully self-contained so it can render directly as a route element.
  const gravatar = useMemo(() => {
    const hashedEmail = show?.email ? md5(show.email, { encoding: 'binary' }) : '';
    return `//www.gravatar.com/avatar/${hashedEmail}?r=pg&d=identicon`;
  }, [show?.email]);

  // Auto-saved profile fields. Email and showName are kept out of this
  // set because changing either forces a logout — that needs an explicit
  // confirm step, not silent debounced persistence.
  const [values, setValues] = useState({
    firstName: show?.userProfile?.firstName || '',
    lastName: show?.userProfile?.lastName || '',
    facebookUrl: show?.userProfile?.facebookUrl || '',
    youtubeUrl: show?.userProfile?.youtubeUrl || ''
  });

  useEffect(() => {
    setValues({
      firstName: show?.userProfile?.firstName || '',
      lastName: show?.userProfile?.lastName || '',
      facebookUrl: show?.userProfile?.facebookUrl || '',
      youtubeUrl: show?.userProfile?.youtubeUrl || ''
    });
  }, [
    show?.userProfile?.firstName,
    show?.userProfile?.lastName,
    show?.userProfile?.facebookUrl,
    show?.userProfile?.youtubeUrl
  ]);

  const [updateUserProfileMutation] = useMutation(UPDATE_USER_PROFILE);
  const [updateShowMutation] = useMutation(UPDATE_SHOW);

  const save = useCallback(
    (snapshot) =>
      new Promise((resolve, reject) => {
        const updatedUserProfile = _.cloneDeep({ ...show?.userProfile, ...snapshot });
        saveUserProfileService(updatedUserProfile, updateUserProfileMutation, (response) => {
          if (response?.success) {
            dispatch(setShow({ ...show, userProfile: updatedUserProfile }));
            resolve();
          } else {
            showAlert(dispatch, response?.toast);
            reject(new Error('save failed'));
          }
        });
      }),
    [dispatch, show, updateUserProfileMutation]
  );

  const status = useAutoSave(values, save);

  // Email and showName: confirm modal flow stays as-is.
  const [email, setEmail] = useState(show?.email);
  const [showName, setShowName] = useState(show?.showName);
  const [updateEmailOpen, setUpdateEmailOpen] = useState(false);
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
  const [updateShowNameOpen, setUpdateShowNameOpen] = useState(false);
  const [isUpdatingShowName, setIsUpdatingShowName] = useState(false);

  useEffect(() => {
    setEmail(show?.email);
    setShowName(show?.showName);
  }, [show?.email, show?.showName]);

  const handleEmailChange = () => {
    if (show?.email !== email) setUpdateEmailOpen(true);
  };

  const handleEmailUpdate = () => {
    setIsUpdatingEmail(true);
    const updatedShow = _.cloneDeep({ ...show, email });
    saveShowService(updatedShow, updateShowMutation, (response) => {
      if (response?.success) {
        dispatch(setShow({ ...updatedShow }));
        showAlert(dispatch, response?.toast);
        setIsUpdatingEmail(false);
        logout();
      } else {
        showAlert(dispatch, response?.toast);
        setIsUpdatingEmail(false);
      }
    });
  };

  const handleEmailUpdateCancel = () => {
    setEmail(show?.email);
    setUpdateEmailOpen(false);
  };

  const handleShowNameChange = () => {
    if (show?.showName !== showName) setUpdateShowNameOpen(true);
  };

  const handleShowNameUpdate = () => {
    setIsUpdatingShowName(true);
    const updatedShow = _.cloneDeep({ ...show, showName });
    saveShowService(updatedShow, updateShowMutation, (response) => {
      if (response?.success) {
        dispatch(setShow({ ...updatedShow }));
        showAlert(dispatch, response?.toast);
        setIsUpdatingShowName(false);
        logout();
      } else {
        showAlert(dispatch, response?.toast);
        setIsUpdatingShowName(false);
      }
    });
  };

  const handleShowNameUpdateCancel = () => {
    setShowName(show?.showName);
    setUpdateShowNameOpen(false);
  };

  return (
    <>
      <Grid container spacing={gridSpacing}>
        <Grid item xs={12}>
          <Grid container spacing={2} alignItems="center">
            <Grid item>
              <Avatar alt="User 1" src={gravatar} sx={{ height: 80, width: 80 }} />
            </Grid>
            <Grid item sm zeroMinWidth>
              <Grid container spacing={1}>
                <Grid item xs={12}>
                  <Typography variant="caption">
                    <ErrorTwoToneIcon sx={{ height: 16, width: 16, mr: 1, verticalAlign: 'text-bottom' }} />
                    Image can be changed using{' '}
                    <a href="https://en.gravatar.com/" target="_blank" rel="noreferrer">
                      Gravatar
                    </a>
                  </Typography>
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="First Name"
            value={values.firstName}
            onChange={(e) => setValues((prev) => ({ ...prev, firstName: e.target.value }))}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Last Name"
            value={values.lastName}
            onChange={(e) => setValues((prev) => ({ ...prev, lastName: e.target.value }))}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Show Name"
            value={showName}
            onChange={(e) => setShowName(e?.target?.value)}
            onBlur={handleShowNameChange}
            helperText="Changing your show name signs you out and updates your show URL."
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Email Address"
            value={email}
            onChange={(e) => setEmail(e?.target?.value)}
            onBlur={handleEmailChange}
            helperText="Changing your email signs you out and requires re-verification."
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Facebook Show URL"
            value={values.facebookUrl}
            onChange={(e) => setValues((prev) => ({ ...prev, facebookUrl: e.target.value }))}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="YouTube Show URL"
            value={values.youtubeUrl}
            onChange={(e) => setValues((prev) => ({ ...prev, youtubeUrl: e.target.value }))}
          />
        </Grid>
        <Modal
          open={updateEmailOpen}
          onClose={handleEmailUpdateCancel}
          aria-labelledby="update-email-modal"
        >
          <UpdateEmailModal
            theme={theme}
            handleClose={handleEmailUpdateCancel}
            updateEmail={handleEmailUpdate}
            updatedEmail={email}
            isUpdatingEmail={isUpdatingEmail}
          />
        </Modal>
        <Modal
          open={updateShowNameOpen}
          onClose={handleShowNameUpdateCancel}
          aria-labelledby="update-show-name-modal"
        >
          <UpdateShowNameModal
            theme={theme}
            handleClose={handleShowNameUpdateCancel}
            updateShowName={handleShowNameUpdate}
            updatedShowName={showName}
            isUpdatingShowName={isUpdatingShowName}
          />
        </Modal>
      </Grid>
      <StickyFormBar status={status} />
    </>
  );
};

export default UserProfile;
