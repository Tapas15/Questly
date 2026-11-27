import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { AdminPage } from './pages/AdminPage';
import { FormPage } from './pages/FormPage';
import { SharedPage } from './pages/SharedPage';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AdminPage />} />
        <Route path="/q/:slug" element={<FormPage />} />
        <Route path="/s/:token" element={<SharedPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
