import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import { bindOverlayScroll } from './lib/overlayScroll';
import './index.css';

bindOverlayScroll(document);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
