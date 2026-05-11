import React from 'react';

import { Card, CardContent, CardHeader, Divider, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import PropTypes from 'prop-types';

// v2 SubCard: no default border (was a redundant second border when
// nested inside a MainCard). 16px header/content padding instead of
// 20px to match the v2 spacing rhythm.
const SubCard = React.forwardRef(
  ({ children, content, contentClass, darkTitle, secondary, sx = {}, contentSX = {}, title, ...others }, ref) => {
    const theme = useTheme();

    return (
      <Card
        ref={ref}
        sx={{
          border: 'none',
          ...sx
        }}
        {...others}
      >
        {!darkTitle && title && <CardHeader sx={{ p: 2 }} title={<Typography variant="h5">{title}</Typography>} action={secondary} />}
        {darkTitle && title && <CardHeader sx={{ p: 2 }} title={<Typography variant="h4">{title}</Typography>} action={secondary} />}

        {title && (
          <Divider
            sx={{
              opacity: 1,
              borderColor: theme.palette.mode === 'dark' ? theme.palette.dark.light + 15 : theme.palette.primary.light
            }}
          />
        )}

        {content && (
          <CardContent sx={{ p: 2, ...contentSX }} className={contentClass || ''}>
            {children}
          </CardContent>
        )}
        {!content && children}
      </Card>
    );
  }
);

SubCard.propTypes = {
  children: PropTypes.node,
  content: PropTypes.bool,
  contentClass: PropTypes.string,
  darkTitle: PropTypes.bool,
  secondary: PropTypes.oneOfType([PropTypes.node, PropTypes.string, PropTypes.object]),
  sx: PropTypes.object,
  contentSX: PropTypes.object,
  title: PropTypes.oneOfType([PropTypes.node, PropTypes.string, PropTypes.object])
};

SubCard.defaultProps = {
  content: true
};

export default SubCard;
