import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import appStyleText from './style.css?inline'

const STYLE_TAG_ID = 'app-inline-styles'

if (!document.getElementById(STYLE_TAG_ID)) {
  const styleEl = document.createElement('style')
  styleEl.id = STYLE_TAG_ID
  styleEl.textContent = appStyleText
  document.head.appendChild(styleEl)
}

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
