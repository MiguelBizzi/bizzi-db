import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import { AppCrashFallback, ErrorBoundary } from './components/ErrorBoundary';
import { reportCrash } from './lib/crashReport';
import { bindOverlayScroll } from './lib/overlayScroll';
import './index.css';

bindOverlayScroll(document);

// Errors outside rendering (handlers, effects' async work) never reach a boundary.
window.addEventListener('error', (event) => reportCrash('window', event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => reportCrash('promise', event.reason));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary source="root" fallback={AppCrashFallback}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
