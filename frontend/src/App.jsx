import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import AnexoDeudaPage from './pages/AnexoDeudaPage';

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <BrowserRouter basename="/bd_sistema">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        } />
        <Route path="/anexo3" element={
          <PrivateRoute>
            <AnexoDeudaPage />
          </PrivateRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
