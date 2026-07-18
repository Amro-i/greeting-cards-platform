import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
import NetworkStatusBanner from './components/NetworkStatusBanner';
import { AppSettingsProvider } from './context/AppSettingsContext';
import { AuthProvider } from './context/AuthContext';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <AppSettingsProvider>
          <AuthProvider>
            <NetworkStatusBanner />
            <App />
          </AuthProvider>
        </AppSettingsProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
);
