import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import App from './App'
import { ThemeProvider } from './context/ThemeContext'
import { ImportProvider } from './context/ImportContext'
import { BuildProvider } from './context/BuildContext'
import { OpsProvider } from './context/OpsContext'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_relativeSplatPath: true }}>
        <ThemeProvider>
          <ImportProvider>
            <BuildProvider>
              <OpsProvider>
                <App />
                <Toaster position="bottom-right" richColors expand />
              </OpsProvider>
            </BuildProvider>
          </ImportProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
