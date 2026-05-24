import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import React from 'react';

vi.mock('../../hooks/useConfig', () => ({
  default: () => ({ borderRadius: 8 })
}));

import { RFTabPanel, RFTab } from '../RFTabPanel';

const buildStore = (activeTab = 0) => {
  const slice = createSlice({
    name: 'components',
    initialState: { activeTab },
    reducers: {
      setActiveTab(state, action) {
        state.activeTab = action.payload;
      }
    }
  });
  return configureStore({ reducer: { components: slice.reducer } });
};

const wrap = (store, ui) => (
  <ThemeProvider theme={createTheme()}>
    <Provider store={store}>{ui}</Provider>
  </ThemeProvider>
);

describe('RFTabPanel', () => {
  const tabOptions = [
    { label: 'A', caption: 'first', icon: <span data-testid="i-a">a</span> },
    { label: 'B', caption: 'second', icon: <span data-testid="i-b">b</span> }
  ];

  it('renders one Tab per option with its label + caption', () => {
    render(wrap(buildStore(0), <RFTabPanel tabOptions={tabOptions} orientation="vertical" />));
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
  });

  it('clicking a tab dispatches setActiveTab', () => {
    const store = buildStore(0);
    render(wrap(store, <RFTabPanel tabOptions={tabOptions} orientation="vertical" />));
    const tab = screen.getByText('B').closest('button');
    fireEvent.click(tab);
    expect(store.getState().components.activeTab).toBe(1);
  });
});

describe('RFTab', () => {
  it('renders children only when activeTab matches its index', () => {
    const store = buildStore(1);
    render(wrap(store,
      <>
        <RFTab index={0} value={0}><span>panel-zero</span></RFTab>
        <RFTab index={1} value={1}><span>panel-one</span></RFTab>
      </>
    ));
    expect(screen.queryByText('panel-zero')).not.toBeInTheDocument();
    expect(screen.getByText('panel-one')).toBeInTheDocument();
  });
});
