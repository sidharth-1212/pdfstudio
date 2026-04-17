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
        {/* Main PDF Studio Engine */}
        <Route path="/" element={<App />} />
        
        {/* Dodo Payments Success Redirect */}
        <Route path="/success" element={<Success />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)