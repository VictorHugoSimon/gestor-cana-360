import React from 'react';
import ReactDOM from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import './economics.css';
import './operations.css';
import './harvest.css';
import './assets.css';
import './agronomy.css';
import './climateSatellite.css';
import './planningLeases.css';
import './decisionSupport.css';
import { App } from './App';
import { EconomicsConsole } from './EconomicsConsole';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <EconomicsConsole />
  </React.StrictMode>,
);
