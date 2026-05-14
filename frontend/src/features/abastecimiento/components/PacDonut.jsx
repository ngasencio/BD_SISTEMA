/**
 * @file features/abastecimiento/components/PacDonut.jsx
 * @description Gráfico de dona PAC / No PAC usando Chart.js.
 * Acepta los datos del hook useDashboardStats.
 */
import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

export const PacDonut = ({ dentroPac, fueraPac }) => {
    const data = {
        labels: ['Dentro PAC', 'Fuera PAC'],
        datasets: [
            {
                data: [dentroPac, fueraPac],
                backgroundColor: ['#3B82F6', '#F97316'],
                borderWidth: 0,
                hoverOffset: 6,
            },
        ],
    };

    const options = {
        cutout: '70%',
        plugins: {
            legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 16 } },
            tooltip: {
                callbacks: {
                    label: (ctx) => ` ${ctx.label}: ${ctx.parsed}%`,
                },
            },
        },
    };

    return (
        <div className="chart-container-sm">
            <Doughnut data={data} options={options} />
        </div>
    );
};
