import { useState, useEffect } from 'react';

import PropTypes from 'prop-types';
import { IntlProvider } from 'react-intl';

import useConfig from '../hooks/useConfig';

// load locales files
const loadLocaleData = (locale) => {
  switch (locale) {
    case 'sp':
      return import('../utils/locales/sp.json');
    default:
      return import('../utils/locales/en.json');
  }
};

const Locales = ({ children }) => {
  const { locale } = useConfig();
  const [messages, setMessages] = useState();

  useEffect(() => {
    loadLocaleData(locale).then((d) => {
      // `undefined` means index.jsx's vite:preloadError handler swallowed a
      // stale-chunk failure and a reload is already in flight — see
      // utils/lazyChunk. Leave `messages` unset so this renders nothing until
      // the reload lands, rather than throwing on `d.default`.
      if (d === undefined) {
        return;
      }
      setMessages(d.default);
    });
  }, [locale]);

  return (
    <>
      {messages && (
        <IntlProvider locale={locale} defaultLocale="en" messages={messages}>
          {children}
        </IntlProvider>
      )}
    </>
  );
};

Locales.propTypes = {
  children: PropTypes.node
};

export default Locales;
