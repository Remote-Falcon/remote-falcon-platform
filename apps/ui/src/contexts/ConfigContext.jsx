import React, { createContext } from 'react';

import PropTypes from 'prop-types';

import defaultConfig from '../config'
import useLocalStorage from '../hooks/useLocalStorage';

const initialState = {
  ...defaultConfig,
  onChangeMenuType: () => {},
  onChangePresetColor: () => {},
  onChangeLocale: () => {},
  onChangeRTL: () => {},
  onChangeContainer: () => {},
  onChangeFontFamily: () => {},
  onChangeBorderRadius: () => {},
  onChangeOutlinedField: () => {},
  onToggleSidebar: () => {}
};

const ConfigContext = createContext(initialState);

function ConfigProvider({ children }) {
  const [config, setConfig] = useLocalStorage('rf-config', {
    fontFamily: initialState.fontFamily,
    borderRadius: initialState.borderRadius,
    outlinedFilled: initialState.outlinedFilled,
    navType: initialState.navType,
    presetColor: initialState.presetColor,
    locale: initialState.locale,
    rtlLayout: initialState.rtlLayout,
    sidebarCollapsed: initialState.sidebarCollapsed
  });

  const onChangeMenuType = (navType) => {
    setConfig({
      ...config,
      navType
    });
  };

  const onChangePresetColor = (presetColor) => {
    setConfig({
      ...config,
      presetColor
    });
  };

  const onChangeLocale = (locale) => {
    setConfig({
      ...config,
      locale
    });
  };

  const onChangeRTL = (rtlLayout) => {
    setConfig({
      ...config,
      rtlLayout
    });
  };

  const onChangeContainer = () => {
    setConfig({
      ...config,
      container: !config.container
    });
  };

  const onChangeFontFamily = (fontFamily) => {
    setConfig({
      ...config,
      fontFamily
    });
  };

  const onChangeBorderRadius = (event, newValue) => {
    setConfig({
      ...config,
      borderRadius: newValue
    });
  };

  const onChangeOutlinedField = (outlinedFilled) => {
    setConfig({
      ...config,
      outlinedFilled
    });
  };

  const onToggleSidebar = () => {
    setConfig({
      ...config,
      sidebarCollapsed: !config.sidebarCollapsed
    });
  };

  return (
    <ConfigContext.Provider
      value={{
        ...config,
        onChangeMenuType,
        onChangePresetColor,
        onChangeLocale,
        onChangeRTL,
        onChangeContainer,
        onChangeFontFamily,
        onChangeBorderRadius,
        onChangeOutlinedField,
        onToggleSidebar
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

ConfigProvider.propTypes = {
  children: PropTypes.node
};

export { ConfigProvider, ConfigContext };
