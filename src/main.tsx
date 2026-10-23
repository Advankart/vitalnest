import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { watchTheme } from './lib/theme';
import { initTextSize } from './lib/textscale';
import { watchWebUpdates } from './lib/update';

watchTheme();
initTextSize();
watchWebUpdates();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
