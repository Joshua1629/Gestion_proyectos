import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';


// Workaround para DevTools error
if (typeof window !== 'undefined') {
  (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = { isDisabled: true };
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  console.error('No root element found');
} else {
  createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
