
import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to. Verify index.html has a div with id='root'");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-sky-50 dark:bg-indigo-950"><div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>}>
      <App />
    </Suspense>
  </React.StrictMode>
);
