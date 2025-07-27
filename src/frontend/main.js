import React from 'react'
import ReactDOM from 'react-dom/client'

console.log('main.js loaded - plain JavaScript version');

// シンプルなコンポーネント
function TestApp() {
  return React.createElement('div', {
    style: {
      backgroundColor: '#1a1a1a',
      color: 'white',
      minHeight: '100vh',
      padding: '20px',
      fontFamily: 'Arial, sans-serif'
    }
  }, 
    React.createElement('h1', null, 'Claude Code Communication'),
    React.createElement('p', null, 'JavaScript version is working!'),
    React.createElement('div', {
      style: {
        marginTop: '20px',
        padding: '10px',
        backgroundColor: '#333',
        borderRadius: '5px'
      }
    }, 
      React.createElement('p', null, 'Time: ' + new Date().toLocaleTimeString())
    )
  );
}

// DOMContentLoaded を待つ
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  console.log('Initializing React app...');
  const rootElement = document.getElementById('root');
  
  if (!rootElement) {
    console.error('Root element not found!');
    return;
  }
  
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(React.createElement(TestApp));
    console.log('App rendered successfully');
  } catch (error) {
    console.error('Error rendering app:', error);
    rootElement.innerHTML = '<div style="color: red; padding: 20px;">Error: ' + error.message + '</div>';
  }
}