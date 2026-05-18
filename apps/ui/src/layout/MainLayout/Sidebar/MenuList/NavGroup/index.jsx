import { useEffect, useState } from 'react';
import * as React from 'react';

import { Collapse, List, Stack, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import PropTypes from 'prop-types';

import { useSelector } from '../../../../../store';

import NavCollapse from '../NavCollapse';
import NavItem from '../NavItem';

// Per-section collapse state lives in localStorage so the user's choice
// survives reloads. One key per group id; default = expanded.
const STORAGE_KEY = 'rf-nav-collapsed-groups';
const readCollapsed = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};
const writeCollapsed = (next) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked — silent */
  }
};

const NavGroup = ({ item }) => {
  const theme = useTheme();
  const { show } = useSelector((state) => state.show);

  const [collapsed, setCollapsed] = useState(() => !!readCollapsed()[item.id]);

  // Sync if some other group toggled (multi-tab / multi-mount edge case)
  useEffect(() => {
    setCollapsed(!!readCollapsed()[item.id]);
  }, [item.id]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      const all = readCollapsed();
      if (next) all[item.id] = true;
      else delete all[item.id];
      writeCollapsed(all);
      return next;
    });
  };

  const items = item.children?.map((menu) => {
    if (menu.id === 'admin') {
      if (show?.showRole !== 'ADMIN') {
        return <></>;
      }
    }
    switch (menu.type) {
      case 'collapse':
        return <NavCollapse key={menu.id} menu={menu} level={1} />;
      case 'item':
        return <NavItem key={menu.id} item={menu} level={1} />;
      default:
        return (
          <Typography key={menu.id} variant="h6" color="error" align="center">
            Menu Items Error
          </Typography>
        );
    }
  });

  // Sections without a title don't get a collapse affordance — there's
  // nothing to click. Just render the items inline.
  if (!item.title) {
    return <List sx={{ py: 0 }}>{items}</List>;
  }

  return (
    <List sx={{ py: 0 }}>
      {/* The clickable section header is a list item rather than a bare
          Stack so the parent <ul> only contains <li> children (WCAG 1.3.1).
          Color sourced from text.secondary (not text.disabled) — disabled
          resolves to #9e9e9e in light mode and fails AA at 2.67:1. */}
      <Stack
        component="li"
        role="button"
        direction="row"
        alignItems="center"
        spacing={0.5}
        onClick={toggle}
        sx={{
          px: 1.5,
          pt: 1.5,
          pb: 0.5,
          cursor: 'pointer',
          userSelect: 'none',
          listStyle: 'none',
          '&:hover .rf-nav-section-label': { color: 'text.primary' },
          '&:hover .rf-nav-section-chevron': { color: 'text.primary' }
        }}
        tabIndex={0}
        aria-expanded={!collapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <Typography
          variant="caption"
          data-rail-label
          className="rf-nav-section-label"
          sx={{
            flex: 1,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'text.secondary',
            lineHeight: 1.4,
            transition: 'color 120ms ease'
          }}
        >
          {item.title}
        </Typography>
        <Typography
          component="span"
          className="rf-nav-section-chevron"
          sx={{
            color: 'text.secondary',
            display: 'inline-flex',
            alignItems: 'center',
            transition: 'color 120ms ease'
          }}
        >
          {collapsed ? <IconChevronRight size={12} stroke={2} /> : <IconChevronDown size={12} stroke={2} />}
        </Typography>
      </Stack>
      {item.caption && (
        <Typography variant="caption" sx={{ ...theme.typography.subMenuCaption, px: 1.5 }} display="block" gutterBottom>
          {item.caption}
        </Typography>
      )}
      <Collapse in={!collapsed} timeout="auto" unmountOnExit>
        {items}
      </Collapse>
    </List>
  );
};

NavGroup.propTypes = {
  item: PropTypes.object
};

export default NavGroup;
