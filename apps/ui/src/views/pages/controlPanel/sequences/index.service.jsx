import fileDownload from 'js-file-download';
import _ from 'lodash';

import axios from '../../../../utils/axios';
import { showAlert } from '../../../../views/pages/globalPageHelpers';

export const downloadSequencesToExcelService = async () => {
  const response = await axios.post(
    `${import.meta.env.VITE_CONTROL_PANEL_API}/controlPanel/downloadSequencesToExcel`,
    {},
    { responseType: 'blob' }
  );
  return response;
};

export const importSequencesFromExcelService = async (formData) => {
  try {
    return await axios.post(`${import.meta.env.VITE_CONTROL_PANEL_API}/controlPanel/uploadSequencesCsv`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  } catch (error) {
    const normalizedError = error?.response?.data || error;
    return Promise.reject(normalizedError);
  }
};

export const downloadSequencesToExcel = async (dispatch, setIsDownloadingSequences) => {
  setIsDownloadingSequences(true);
  const response = await downloadSequencesToExcelService();
  if (response?.status === 200) {
    fileDownload(response.data, 'Remote Falcon Sequences.xlsx');
    showAlert(dispatch, { message: 'Sequences Exported Successfully' });
  } else {
    showAlert(dispatch, { alert: 'error' });
  }
  setIsDownloadingSequences(false);
};
