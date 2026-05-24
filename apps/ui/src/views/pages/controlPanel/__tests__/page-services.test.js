import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../utils/axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn()
  }
}));
vi.mock('js-file-download', () => ({ default: vi.fn() }));
vi.mock('../../globalPageHelpers', () => ({ showAlert: vi.fn() }));

import axios from '../../../../utils/axios';
import fileDownload from 'js-file-download';
import { showAlert } from '../../globalPageHelpers';

import {
  downloadSequencesToExcelService,
  importSequencesFromExcelService,
  downloadSequencesToExcel
} from '../sequences/index.service';
import {
  uploadImageService,
  getImagesService,
  deleteImageService
} from '../imageHosting/index.service';

describe('sequences index.service', () => {
  it('downloadSequencesToExcelService POSTs as a blob', async () => {
    axios.post.mockResolvedValueOnce({ status: 200, data: new Blob() });
    const r = await downloadSequencesToExcelService();
    expect(axios.post).toHaveBeenCalledWith(
      `${import.meta.env.VITE_CONTROL_PANEL_API}/controlPanel/downloadSequencesToExcel`,
      {},
      { responseType: 'blob' }
    );
    expect(r.status).toBe(200);
  });

  it('importSequencesFromExcelService POSTs the FormData with multipart headers', async () => {
    axios.post.mockResolvedValueOnce({ data: { ok: true } });
    const fd = new FormData();
    const r = await importSequencesFromExcelService(fd);
    expect(axios.post).toHaveBeenCalledWith(
      `${import.meta.env.VITE_CONTROL_PANEL_API}/controlPanel/uploadSequencesCsv`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    expect(r.data).toEqual({ ok: true });
  });

  it('importSequencesFromExcelService normalizes server error responses', async () => {
    axios.post.mockRejectedValueOnce({ response: { data: { message: 'bad csv' } } });
    await expect(importSequencesFromExcelService(new FormData())).rejects.toEqual({
      message: 'bad csv'
    });
  });

  it('downloadSequencesToExcel triggers file download + success toast on 200', async () => {
    axios.post.mockResolvedValueOnce({ status: 200, data: new Blob() });
    const dispatch = vi.fn();
    const setLoading = vi.fn();
    await downloadSequencesToExcel(dispatch, setLoading);
    expect(setLoading).toHaveBeenNthCalledWith(1, true);
    expect(fileDownload).toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith(dispatch, { message: 'Sequences Exported Successfully' });
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });

  it('downloadSequencesToExcel surfaces an error toast when status != 200', async () => {
    axios.post.mockResolvedValueOnce({ status: 500 });
    const dispatch = vi.fn();
    const setLoading = vi.fn();
    await downloadSequencesToExcel(dispatch, setLoading);
    expect(showAlert).toHaveBeenCalledWith(dispatch, { alert: 'error' });
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });
});

describe('imageHosting index.service', () => {
  it('uploadImageService POSTs the form with multipart headers', async () => {
    axios.post.mockResolvedValueOnce({ data: { url: 'x' } });
    const fd = new FormData();
    await uploadImageService(fd);
    expect(axios.post).toHaveBeenCalledWith(
      `${import.meta.env.VITE_CONTROL_PANEL_API}/controlPanel/image`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  });

  it('getImagesService GETs the images endpoint', async () => {
    axios.get.mockResolvedValueOnce({ data: [] });
    await getImagesService();
    expect(axios.get).toHaveBeenCalledWith(
      `${import.meta.env.VITE_CONTROL_PANEL_API}/controlPanel/images`
    );
  });

  it('deleteImageService DELETEs the named image', async () => {
    axios.delete.mockResolvedValueOnce({ data: { ok: true } });
    await deleteImageService('cat.png');
    expect(axios.delete).toHaveBeenCalledWith(
      `${import.meta.env.VITE_CONTROL_PANEL_API}/controlPanel/image/cat.png`
    );
  });
});
