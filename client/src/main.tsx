import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import MobileAgeVerification from './MobileAgeVerification';
import './index.css';

// Simple routing based on URL path
const getComponent = () => {
  const path = window.location.pathname;
  
  // Mobile verification page (from QR code scan)
  if (path === '/verify-mobile') {
    return <MobileAgeVerification />;
  }
  
  // Default: main app
  return <App />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {getComponent()}
  </React.StrictMode>
);
