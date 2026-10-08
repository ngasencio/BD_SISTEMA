import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Sistema de diseño DV-UI (clases .dv-*, inertes en páginas que no las usan) — se importa
// una sola vez aquí; lo usan /fsc-oc-pac y Abastecimiento › Formularios.
import './styles/dv-ui.css'
import App from './App.jsx'

// Registro global de Chart.js (evita registros duplicados en distintos componentes)
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
} from 'chart.js';

ChartJS.register(
  ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale,
  BarElement, LineElement, PointElement,
  Title
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
