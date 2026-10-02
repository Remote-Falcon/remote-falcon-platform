import { Link, Typography } from '@mui/material';
import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';

import StatTile from '../../../../ui-component/StatTile';

// Issue #189: page views that arrived with utm_source=qr, which the QR Code
// page appends when "Tag with print campaign" is on. Counts come from
// dashboardStats.qrVisits for the selected range; `unique` is distinct viewers
// across the whole range (anonymous viewerId, falling back to IP).
//
// Zero state doubles as setup help: nothing was recorded before this shipped,
// and untagged QR codes can't be told apart from any other visit.
const QrVisitsTile = ({ visits, delta }) => {
  const unique = visits?.unique || 0;
  const total = visits?.total || 0;

  if (total === 0) {
    return (
      <StatTile
        label="Visits from your QR code"
        value={0}
        accent="text.secondary"
        subtle
        sub={
          <span data-testid="qr-visits-empty">
            Turn on &ldquo;Tag with print campaign&rdquo; on the{' '}
            <Link component={RouterLink} to="/control-panel/qr-code">
              QR Code page
            </Link>{' '}
            and reprint your sign. Counting starts from this release, so earlier scans aren&rsquo;t included.
          </span>
        }
      />
    );
  }

  return (
    <StatTile
      label="Visits from your QR code"
      value={
        <>
          {unique}
          <Typography component="span" variant="body2" sx={{ ml: 1, color: 'text.secondary', fontWeight: 400 }}>
            {unique === 1 ? 'viewer' : 'viewers'} &middot; {total} {total === 1 ? 'hit' : 'hits'}
          </Typography>
        </>
      }
      accent="secondary.main"
      subtle
      delta={delta}
    />
  );
};

QrVisitsTile.propTypes = {
  visits: PropTypes.shape({
    unique: PropTypes.number,
    total: PropTypes.number
  }),
  delta: PropTypes.shape({
    text: PropTypes.node.isRequired,
    color: PropTypes.string
  })
};

export default QrVisitsTile;
