import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="databricks" enableSystem themes={['light', 'dark', 'green', 'databricks']}>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
);
