import * as React from 'react';

import { Typography } from '@mui/material';
import PropTypes from 'prop-types';

// Intra-page section label. Used between content blocks where a page
// has multiple logical "rows" (Dashboard: Right now / Pre-show readiness).
// Smaller weight than a PageHead title, larger than a card overline label
// — sits exactly between, signaling "new logical area" without competing
// with the page heading.
//
// Promoted from dashboard/index.jsx where it lived inline. Now available
// for any page that wants the same treatment (Analytics section dividers,
// Settings groupings, etc).
const SectionHeader = ({ label, sx }) => (
  <Typography
    variant="overline"
    sx={{
      display: 'block',
      color: 'text.secondary',
      letterSpacing: '0.08em',
      fontWeight: 600,
      mb: 1,
      mt: 2.5,
      ...sx
    }}
  >
    {label}
  </Typography>
);

SectionHeader.propTypes = {
  label: PropTypes.node.isRequired,
  sx: PropTypes.object
};

export default SectionHeader;
