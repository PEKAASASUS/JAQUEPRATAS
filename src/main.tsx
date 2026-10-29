import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { SelectionProvider } from './lib/SelectionContext'
import './styles/global.css'
import './styles/admin.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SelectionProvider>
          <App />
        </SelectionProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
