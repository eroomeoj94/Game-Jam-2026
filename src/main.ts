import { startApplication } from './application';
import '@fontsource/chewy/latin-400.css';
import './style.css';

try {
  const cleanup = startApplication();
  if (import.meta.hot) import.meta.hot.dispose(cleanup);
} catch (error) {
  console.error('Unable to start Moth Fight Club', error);
  const status = document.querySelector('#status');
  if (status)
    status.textContent =
      'The 3D scene could not start. Try a browser with WebGL 2 enabled.';
}
