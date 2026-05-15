import { forwardRef, useEffect } from 'react';

import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { Avatar, Box, Chip, ListItemButton, ListItemIcon, ListItemText, Tooltip, Typography, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { IconExternalLink } from '@tabler/icons-react';
import PropTypes from 'prop-types';
import { Link, useLocation } from 'react-router-dom';

import useConfig from '../../../../../hooks/useConfig';
import { useDispatch, useSelector } from '../../../../../store';
import { activeItem, openDrawer } from '../../../../../store/slices/menu';

const NavItem = ({ item, level }) => {
  const theme = useTheme();
  const { pathname } = useLocation();
  // Auto-close drawer after navigation only on mobile (temporary drawer).
  // At md+ the rail stays visible (full at lg+, auto-railed between md–lg).
  const matchesSM = useMediaQuery(theme.breakpoints.down('md'));
  // Mirror the rail-collapsed predicate from Sidebar so this row knows
  // when its label is hidden and a tooltip is the only way for the user
  // to identify what the icon does.
  const matchUpMd = useMediaQuery(theme.breakpoints.up('md'));
  const matchUpLg = useMediaQuery(theme.breakpoints.up('lg'));

  const { borderRadius, sidebarCollapsed } = useConfig();
  const railCollapsed = matchUpMd && (sidebarCollapsed || !matchUpLg);

  const dispatch = useDispatch();
  const { selectedItem } = useSelector((state) => state.menu);

  const Icon = item?.icon;
  const itemIcon = item?.icon ? (
    <Icon stroke={1.5} size="20px" />
  ) : (
    <FiberManualRecordIcon
      sx={{
        width: selectedItem.findIndex((id) => id === item?.id) > -1 ? 8 : 6,
        height: selectedItem.findIndex((id) => id === item?.id) > -1 ? 8 : 6
      }}
      fontSize={level > 0 ? 'inherit' : 'medium'}
    />
  );

  let itemTarget = '_self';
  if (item.target) {
    itemTarget = '_blank';
  }

  let listItemProps = { component: forwardRef((props, ref) => <Link ref={ref} {...props} to={item.url} target={itemTarget} />) };
  if (item?.external) {
    listItemProps = { component: 'a', href: item.url, target: itemTarget };
  }
  // onClick-driven items (e.g. the "Report a bug" entry that needs to build
  // a URL from live Redux state at click time) opt out of routed/href
  // navigation entirely. MenuList injects the handler — the menu config
  // itself stays declarative. The actual click dispatch happens in
  // itemHandler below so it composes cleanly with the activeItem call
  // (the explicit onClick on ListItemButton would otherwise clobber any
  // onClick we tried to put in listItemProps).
  if (item?.onClick) {
    listItemProps = { component: 'a', href: '#' };
  }

  const itemHandler = (id, e) => {
    if (item?.onClick) {
      e?.preventDefault();
      item.onClick();
    }
    dispatch(activeItem([id]));
    if (matchesSM) dispatch(openDrawer(false));
  };

  // active menu item on page load.
  //
  // Uses a strict URL-prefix match: the item is active when the current
  // pathname is exactly its url, or starts with `<url>/`. Segment-by-id
  // matching (the prior approach) caused prefix collisions — e.g.
  // /control-panel/analytics/sequences matched both the Analytics item AND
  // the top-level Sequences item via the trailing "sequences" segment,
  // and both fired activeItem so the wrong one ended up highlighted.
  useEffect(() => {
    if (!item?.url || item?.external) return;
    const path = (pathname || document.location.pathname).toString();
    if (path === item.url || path.startsWith(`${item.url}/`)) {
      dispatch(activeItem([item.id]));
    }
    // eslint-disable-next-line
    }, [pathname]);

  // v2 rail item per the dashboard mockup `.rail-item` block:
  //   • compact 8px y / 14px x padding (down from Berry's 10px / 16px)
  //   • 14px font, 500 weight
  //   • 4px radius (down from Berry's 8px) — feels tighter at small size
  //   • active state: amber left border + warm gradient + amber icon
  //   • icon column is 22px wide so labels align in collapsed/expanded
  const isActive = selectedItem?.findIndex((id) => id === item.id) > -1;

  // Tooltip only triggers when the rail is collapsed — in expanded mode
  // the label is already visible alongside the icon and a hover tooltip
  // would be noisy. PopperProps offset nudges it clear of the rail's
  // right edge so the arrow doesn't overlap the icon.
  const tooltipTitle = railCollapsed ? item.title : '';

  return (
    <Tooltip
      title={tooltipTitle}
      placement="right"
      enterDelay={300}
      arrow
      disableInteractive
      PopperProps={{ modifiers: [{ name: 'offset', options: { offset: [0, 8] } }] }}
    >
    <ListItemButton
      {...listItemProps}
      disabled={item.disabled}
      sx={{
        borderRadius: 1,
        mb: 0.25,
        alignItems: 'center',
        backgroundColor: level > 1 ? 'transparent !important' : 'inherit',
        py: 1,
        pl: level > 1 ? `${level * 16}px` : 1.25,
        pr: 1.25,
        position: 'relative',
        borderLeft: '2px solid transparent',
        ...(isActive && {
          borderLeftColor: (t) => t.palette.warning.main,
          background: (t) =>
            `linear-gradient(90deg, ${
              t.palette.mode === 'dark' ? 'rgba(255,167,38,0.10)' : 'rgba(255,152,0,0.10)'
            }, transparent 80%)`,
          '&.Mui-selected, &.Mui-selected:hover': {
            background: (t) =>
              `linear-gradient(90deg, ${
                t.palette.mode === 'dark' ? 'rgba(255,167,38,0.14)' : 'rgba(255,152,0,0.14)'
              }, transparent 80%)`
          }
        }),
        '&:hover': {
          background: (t) =>
            t.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
        }
      }}
      selected={isActive}
      onClick={(e) => itemHandler(item.id, e)}
    >
      <ListItemIcon
        sx={{
          my: 'auto',
          minWidth: 30,
          color: isActive ? 'warning.main' : 'text.secondary'
        }}
      >
        {itemIcon}
      </ListItemIcon>
      <ListItemText
        sx={{ my: 0 }}
        primary={
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 500,
              color: isActive ? 'text.primary' : 'text.secondary',
              lineHeight: 1.4
            }}
          >
            {item.title}
          </Typography>
        }
        secondary={
          item.caption && (
            <Typography variant="caption" sx={{ ...theme.typography.subMenuCaption }} display="block">
              {item.caption}
            </Typography>
          )
        }
      />
      {item.chip && (
        <Chip
          color={item.chip.color}
          variant={item.chip.variant}
          size={item.chip.size}
          label={item.chip.label}
          avatar={item.chip.avatar && <Avatar>{item.chip.avatar}</Avatar>}
        />
      )}
      {/* External-link affordance — appears on any row that opens in a
          new tab (set via item.target: true in the menu config). Reassures
          the user that the click will leave the app. */}
      {itemTarget === '_blank' && (
        <Tooltip title="Opens in a new tab">
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              color: isActive ? 'warning.main' : 'text.disabled',
              opacity: 0.85,
              ml: 0.5
            }}
          >
            <IconExternalLink size={13} stroke={1.75} />
          </Box>
        </Tooltip>
      )}
    </ListItemButton>
    </Tooltip>
  );
};

NavItem.propTypes = {
  item: PropTypes.object,
  level: PropTypes.number
};

export default NavItem;
