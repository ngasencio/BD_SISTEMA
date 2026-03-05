import React from 'react';

export const TODAY = new Date('2026-03-05');

export const fmt = s => s ? new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

export function BadgeEstado({ estado }) {
    const m = {
        'Cerrada': 'tag-gris',
        'Publicada': 'tag-celeste',
        'Adjudicada': 'tag-verde',
        'Desierta': 'tag-rojo',
        'En Evaluación': 'tag-amarillo'
    };
    return <span className={`tag ${m[estado] || 'tag-gris'}`}>{estado}</span>;
}
