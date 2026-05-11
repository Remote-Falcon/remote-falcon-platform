import { useState, useEffect, useCallback } from 'react';

import Editor from '@monaco-editor/react';
import { Box, Grid, Link, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import _ from 'lodash';
import { HtmlValidate } from 'html-validate';

import { useDispatch, useSelector } from '../../../../store';
import { gridSpacing } from '../../../../store/constant';
import MainCard from '../../../../ui-component/cards/MainCard';
import PageHead from '../../../../ui-component/PageHead';

import HtmlValidationSkeleton from '../../../../ui-component/cards/Skeleton/HtmlValidationSkeleton';
import { showAlertOld } from '../../globalPageHelpers';
import ViewerPageActions from './ViewerPageActions';

const validationExceptions = [
  'instructional-text',
  'Trailing whitespace',
  'Inline style is not allowed',
  'End tag for <br> must be omitted',
  'Anchor link must have a text describing its purpose',
  'Expected omitted end tag <link> instead of self-closing element <link/>',
  '<img> is missing required "alt" attribute',
  'Expected omitted end tag <br> instead of self-closing element <br/>'
];

const htmlValidator = new HtmlValidate({
  extends: ['html-validate:recommended']
});

const ViewerPage = () => {
  const dispatch = useDispatch();
  const { show } = useSelector((state) => state.show);

  const [isHtmlValidating, setIsHtmlValidating] = useState(false);
  const [activeViewerPageHtml, setActiveViewerPageHtml] = useState();
  const [activeViewerPageHtmlBase64, setActiveViewerPageHtmlBase64] = useState();
  const [activeViewerPageName, setActiveViewerPageName] = useState();
  const [htmlValidation, setHtmlValidation] = useState([]);
  const [editorLineNumber, setEditorLineNumber] = useState(0);
  const [openSidePreview, setOpenSidePreview] = useState(false);
  const [hasHtmlValidationRun, setHasHtmlValidationRun] = useState(false);

  const validateHtml = useCallback(async (html) => {
    setIsHtmlValidating(true);
    try {
      const report = await htmlValidator.validateString(html || '');
      const results = report?.results ?? [];
      const formattedMessages = _.orderBy(
        _.flatMap(results, (result) =>
          _.map(result.messages ?? [], (message) => {
            const lineNumber = message.line ?? message.location?.line ?? message.offset?.line ?? null;
            return {
              type: message.severity === 2 ? 'error' : 'warning',
              message: message.message,
              lastLine: lineNumber
            };
          })
        ),
        ['lastLine'],
        ['asc']
      );
      setHtmlValidation(formattedMessages);
      setHasHtmlValidationRun(true);
    } catch (err) {
      showAlertOld({ dispatch, message: 'Unable to validate HTML', alert: 'warning' });
    } finally {
      setIsHtmlValidating(false);
    }
  }, [dispatch]);

  const editorChanged = (value) => {
    setActiveViewerPageHtml(value);
    const viewerPageHtmlBase64 = `data:text/html;base64,${btoa(unescape(encodeURIComponent(value)))}`;
    setActiveViewerPageHtmlBase64(viewerPageHtmlBase64);
  };

  const setSelectedViewerPage = useCallback((viewerPage) => {
    const viewerHtml = viewerPage?.html ?? '';
    setActiveViewerPageHtml(viewerHtml);
    setActiveViewerPageName(viewerPage?.name);
    const viewerPageHtmlBase64 = `data:text/html;base64,${btoa(unescape(encodeURIComponent(viewerHtml)))}`;
    setActiveViewerPageHtmlBase64(viewerPageHtmlBase64);
  }, []);

  const isValidationException = (message) => {
    let isException = false;
    _.forEach(validationExceptions, (exception) => {
      if (message.includes(exception)) {
        isException = true;
      }
    });
    return isException;
  };

  const htmlValidationRowClicked = (lineNumber, setEditorLineNumber) => {
    window.scrollTo(0, 0);
    setEditorLineNumber(lineNumber);
  };

  const editViewerPage = (viewerPage) => {
    setSelectedViewerPage(viewerPage);
  };

  const editNewViewerPage = (viewerPage) => {
    setSelectedViewerPage(viewerPage);
  };

  useEffect(() => {
    if (!show?.pages?.length) {
      return;
    }

    if (activeViewerPageName) {
      const selectedPage = _.find(show.pages, (page) => page?.name === activeViewerPageName);
      if (selectedPage) {
        setSelectedViewerPage(selectedPage);
        return;
      }
    }

    const activePage = _.find(show.pages, (page) => page?.active);
    if (activePage) {
      setSelectedViewerPage(activePage);
      return;
    }

    setSelectedViewerPage(show?.pages?.[0]);
  }, [show?.pages, activeViewerPageName, setSelectedViewerPage]);

  useEffect(() => {
    if (activeViewerPageHtml !== undefined) {
      validateHtml(activeViewerPageHtml);
    }
  }, [activeViewerPageHtml, validateHtml]);

  const htmlValidationErrors = _.filter(
    htmlValidation,
    (validation) => validation.type === 'error' && !isValidationException(validation.message)
  );

  return (
    <Box>
      <PageHead
        title="Viewer Page"
        description="Edit the HTML that runs the viewer-facing show page."
      />
      <Grid container spacing={gridSpacing}>
        <Grid item xs={12}>
          <MainCard content={false}>
            <Box sx={{ m: 2 }}>
              <ViewerPageActions
                activeViewerPageHtml={activeViewerPageHtml}
                activeViewerPageName={activeViewerPageName}
                activeViewerPageHtmlBase64={activeViewerPageHtmlBase64}
                setOpenSidePreview={setOpenSidePreview}
                openSidePreview={openSidePreview}
                editViewerPage={editViewerPage}
                editNewViewerPage={editNewViewerPage}
              />
              <Box sx={{ mt: 2, mb: 2 }}>
                <Box sx={{ mt: 2, mb: 2 }}>
                  <Typography variant="h3" align="center" sx={{ marginLeft: openSidePreview ? '-50%' : '0' }}>
                    {activeViewerPageName}
                  </Typography>
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={openSidePreview ? 6 : 12}>
                    <Editor
                      height="60vh"
                      defaultLanguage="html"
                      value={activeViewerPageHtml}
                      onChange={(value) => editorChanged(value)}
                      theme="vs-dark"
                      line={editorLineNumber}
                    />
                  </Grid>
                  {openSidePreview && (
                    <Grid item xs={6}>
                      <Typography variant="h3" align="center" color="error" mt={-7} pb={4}>
                        NOTE! This preview displays all page elements and is not based on current viewer control settings!
                      </Typography>
                      <iframe title="viewerPagePreview" src={activeViewerPageHtmlBase64} style={{ height: '100%', width: '100%' }} />
                    </Grid>
                  )}
                </Grid>
              </Box>
              <Typography variant="h3" sx={{ paddingTop: 3 }}>
                HTML Validation
              </Typography>
              {isHtmlValidating ? (
                <HtmlValidationSkeleton />
              ) : htmlValidationErrors.length > 0 ? (
                <TableContainer>
                  <Table sx={{ minWidth: 350 }} aria-label="simple table">
                    <TableHead>
                      <TableRow>
                        <TableCell align="left">Type</TableCell>
                        <TableCell align="left">Message</TableCell>
                        <TableCell align="left">Line Number</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody className="validation">
                      {_.map(htmlValidationErrors, (validation) => (
                        <TableRow hover key={`${validation.message}-${validation.lastLine}`}>
                          <TableCell align="left">{validation.type}</TableCell>
                          <TableCell align="left">{validation.message}</TableCell>
                          <TableCell align="left">
                            <Link
                              style={{ cursor: 'pointer' }}
                              onClick={() => htmlValidationRowClicked(validation.lastLine, setEditorLineNumber)}
                            >
                              {validation.lastLine}
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                hasHtmlValidationRun && (
                  <Typography variant="h2" align="center" color="success.main" sx={{ mt: 2, mb: 4 }}>
                    Your viewer page looks awesome!
                  </Typography>
                )
              )}
            </Box>
          </MainCard>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ViewerPage;
