import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LayoutProvider } from './state/store';
import { UiProvider } from './state/ui';
import './styles/tokens.css';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <LayoutProvider>
      <UiProvider>
        <App />
      </UiProvider>
    </LayoutProvider>
  </StrictMode>,
);
