import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css'
import App from './App.jsx'
import Success from './Success.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* 1. Dodo Payments Success Redirect (Priority) */}
        <Route path="/success" element={<Success />} />

        {/* 2. Main PDF Engine - Catch any tool name (/:tabId) */}
        <Route path="/:tabId" element={<App />} />
        
        {/* 3. Fallback for the root URL */}
        <Route path="/" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)