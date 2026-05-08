import controlPanelGroups from './controlPanel';

// `controlPanelGroups` is an array of NavGroup configs (Show / Account /
// Community / Admin). Spreading them yields one List + section-header
// per group in the sidebar.
const menuItems = {
  items: [...controlPanelGroups]
};

export default menuItems;
