import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// import TestApp from './TestApp'
import './styles/globals.css'

console.log('Starting React app...');

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Root element not found!');
} else {
  console.log('Root element found, creating React root...');
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}