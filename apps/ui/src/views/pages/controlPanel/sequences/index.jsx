import * as React from 'react';
import { useRef, useState } from 'react';
import fileDownload from 'js-file-download';

import { useLazyQuery } from '@apollo/client';
import { Box, Button, ButtonGroup } from '@mui/material';
import { Outlet } from 'react-router-dom';

import { useDispatch } from '../../../../store';
import { setShow } from '../../../../store/slices/show';
import PageHead from '../../../../ui-component/PageHead';
import SubNav from '../../../../ui-component/SubNav';
import { trackPosthogEvent } from '../../../../utils/analytics/posthog';
import { GET_SHOW } from '../../../../utils/graphql/controlPanel/queries';
import { showAlert } from '../../globalPageHelpers';

import { downloadSequencesToExcelService, importSequencesFromExcelService } from './index.service';

// Sub-route entries — exported so CommandPalette + RouteBreadcrumb pick
// them up automatically (same pattern as the other tabbed pages).
export const sequencesRoutes = [
  { label: 'Sequences', to: '/control-panel/sequences/list' },
  { label: 'Sequence Groups', to: '/control-panel/sequences/groups' }
];

// v2 Sequences shell. Import / export are page-level (apply across both
// tabs) so they live here in PageHead actions. The sub-tab (List / Groups)
// owns its own table chrome.
//
// Children read shared loading state via Outlet context — both sub-tabs
// surface the linear progress bar from the same place to keep the UX
// consistent during long-running mutations.
const Sequences = () => {
  const dispatch = useDispatch();
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [getShowQuery] = useLazyQuery(GET_SHOW, { fetchPolicy: 'network-only' });

  const triggerFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const exportSequences = async () => {
    setBusy(true);
    try {
      const response = await downloadSequencesToExcelService();
      if (response?.status === 200) {
        fileDownload(response.data, 'Remote Falcon Sequences.csv');
        showAlert(dispatch, { message: 'Sequences Exported Successfully' });
      } else {
        showAlert(dispatch, { alert: 'error', message: 'Unable to export sequences' });
      }
    } catch (err) {
      showAlert(dispatch, { alert: 'error', message: err?.response?.data || 'Unable to export sequences' });
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setBusy(true);
    try {
      const response = await importSequencesFromExcelService(formData);
      if (response?.status === 200) {
        showAlert(dispatch, { message: 'Sequences imported successfully.' });
        const { data } = await getShowQuery();
        if (data?.getShow) dispatch(setShow(data.getShow));
        trackPosthogEvent('sequences_imported', {
          source: 'excel_upload',
          sequence_count: data?.getShow?.sequences?.length || 0
        });
      } else {
        showAlert(dispatch, { alert: 'error', message: response?.data || 'Unable to import sequences' });
      }
    } catch (err) {
      const apiError = err?.response?.data;
      const errorMessage =
        apiError?.message || err?.message || apiError || err?.data || 'Unable to import sequences';
      showAlert(dispatch, { alert: 'error', message: errorMessage });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <PageHead
        title="Sequences"
        description="Manage your show's sequences and sequence groups."
        actions={
          <ButtonGroup variant="outlined" disabled={busy}>
            <Button onClick={triggerFilePicker}>Import</Button>
            <Button onClick={exportSequences}>Export</Button>
          </ButtonGroup>
        }
      />
      <SubNav items={sequencesRoutes} />

      <input
        type="file"
        accept=".csv,text/csv"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <Outlet />
    </Box>
  );
};

export default Sequences;
