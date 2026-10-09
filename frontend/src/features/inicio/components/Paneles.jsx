// Paneles del tablero: gráfico mensual, formularios por bandeja, deuda SIGFE y compra por modalidad.
// Los gráficos Chart.js no resuelven `var(--…)`: los colores se leen de los tokens DV-UI con `dvColor`.
import { Bar, Doughnut } from 'react-chartjs-2';
import '../styles/inicio.css';
import { dvColor } from '../../../lib/dvColor';
import { ESTADO_FSC_INFO } from '../../abastecimiento/components/formularios/shared';
import { fmtFechaCorta, fmtMillones, fmtN, fmtPct, nombreMes } from '../utils/formato';

const Panel = ({ titulo, nota, ruta, etiquetaRuta = 'Ver detalle ›', onIr, children }) => (
    <section className="dv-panel ini-panel">
        <div className="ini-panel__head">
            <h2 className="ini-panel__title">{titulo}</h2>
            {nota && <span className="ini-panel__note">{nota}</span>}
            {ruta && <button type="button" className="ini-link" onClick={() => onIr(ruta)}>{etiquetaRuta}</button>}
        </div>
        <div className="ini-panel__body">{children}</div>
    </section>
);

// ─── Monto neto por mes: año elegido contra el anterior ──────────────────────

export function PanelMensual({ oc, anio, onIr }) {
    const primario = dvColor('--dv-primary', '#0F69B4');
    const gris = dvColor('--dv-ink-4', '#A6AFBE');
    const ejes = dvColor('--dv-ink-3', '#7C8798');
    const rejilla = dvColor('--dv-line', '#E7EAF0');
    const sinDatos = oc.mensual.every((m) => !m.actual && !m.anterior);

    const data = {
        labels: oc.mensual.map((m) => nombreMes(m.mes)),
        datasets: [
            { label: String(anio - 1), data: oc.mensual.map((m) => m.anterior), backgroundColor: gris, borderRadius: 3 },
            // El mes en curso está incompleto: se pinta más claro para no leerlo como una caída.
            {
                label: String(anio), data: oc.mensual.map((m) => m.actual), borderRadius: 3,
                backgroundColor: oc.mensual.map((m) => (m.mes === oc.mes_en_curso ? `${primario}88` : primario)),
            },
        ],
    };
    const opciones = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 }, color: ejes } },
            tooltip: {
                callbacks: {
                    label: (ctx) => {
                        const fila = oc.mensual[ctx.dataIndex];
                        const cantidad = ctx.datasetIndex === 0 ? fila.cantidad_anterior : fila.cantidad_actual;
                        return ` ${ctx.dataset.label}: ${fmtMillones(ctx.raw)} · ${fmtN(cantidad)} OC`;
                    },
                },
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 }, color: ejes } },
            y: { beginAtZero: true, grid: { color: rejilla }, ticks: { font: { size: 10 }, color: ejes, callback: (v) => `${fmtN(v / 1e6)} M` } },
        },
    };

    return (
        <Panel titulo="Monto neto de órdenes de compra por mes" nota={`${anio} contra ${anio - 1}`} ruta="/ordenes-compra" onIr={onIr}>
            {sinDatos ? <div className="ini-vacio">No hay órdenes de compra registradas en este período.</div> : (
                <>
                    <div className="chart-box ini-chartbox"><Bar data={data} options={opciones} /></div>
                    {oc.mes_en_curso && (
                        <div className="ini-chartnote">{nombreMes(oc.mes_en_curso)} {anio} está en curso hasta el {fmtFechaCorta(oc.corte)}; su barra es parcial.</div>
                    )}
                </>
            )}
        </Panel>
    );
}

// ─── Formularios del año según su bandeja actual ─────────────────────────────

export function PanelFormularios({ formularios: f, anio, ruta, onIr }) {
    const maximo = Math.max(1, ...f.bandejas.map((b) => b.cantidad), f.rechazados);
    return (
        <Panel titulo={`Formularios ${anio}`} nota="dónde están hoy" ruta={ruta} onIr={onIr}>
            <div className="ini-resumen">
                <div className="ini-mini"><div className="ini-mini__label">Presentados</div><div className="ini-mini__value">{fmtN(f.total)}</div></div>
                <div className="ini-mini"><div className="ini-mini__label">Derivados a comprador</div><div className="ini-mini__value">{fmtN(f.derivados)}</div></div>
            </div>
            <div className="ini-bars ini-bars--largas">
                {f.bandejas.map((b) => (
                    <div className="ini-bar" key={b.codigo}>
                        {/* Mismos nombres de bandeja que la página de Formularios. */}
                        <span className="ini-bar__label" title={ESTADO_FSC_INFO[b.codigo]?.nombre ?? b.nombre}>{b.codigo} · {ESTADO_FSC_INFO[b.codigo]?.nombre ?? b.nombre}</span>
                        <span className="ini-track"><i style={{ width: `${(b.cantidad / maximo) * 100}%`, '--ini-color': b.codigo === 'AC' ? 'var(--dv-ok)' : 'var(--dv-primary)' }} /></span>
                        <span className="ini-bar__value">{fmtN(b.cantidad)}</span>
                    </div>
                ))}
                <div className="ini-bars__sep" />
                <div className="ini-bar">
                    <span className="ini-bar__label">R · Rechazados</span>
                    <span className="ini-track"><i style={{ width: `${(f.rechazados / maximo) * 100}%`, '--ini-color': 'var(--dv-secondary)' }} /></span>
                    <span className="ini-bar__value">{fmtN(f.rechazados)}</span>
                </div>
            </div>
            <div className="ini-chartnote">Cada formulario cuenta en la bandeja donde está hoy; no es un acumulado. Actualizado el {fmtFechaCorta(f.actualizado)}.</div>
        </Panel>
    );
}

// ─── Deuda SIGFE por unidad ejecutora ────────────────────────────────────────

export function PanelDeuda({ deuda: d, ruta, onIr }) {
    const maximo = Math.max(1, ...d.por_ue.map((u) => u.deuda));
    return (
        <Panel titulo="Deuda SIGFE por unidad ejecutora" nota="saldo vigente" ruta={ruta} onIr={onIr}>
            <div className="ini-bigvalue">
                <div className="ini-bigvalue__num">{fmtMillones(d.total)}</div>
                <div className="ini-bigvalue__sub">en {fmtN(d.n_documentos)} documentos con saldo pendiente · {fmtPct(d.pct_pendiente)} de su monto vigente</div>
            </div>
            <div className="ini-bars">
                {d.por_ue.map((u) => (
                    <div className="ini-bar" key={u.codigo}>
                        <span className="ini-bar__label" title={u.nombre}>{u.nombre}<small>UE {u.codigo}</small></span>
                        <span className="ini-track"><i style={{ width: `${(u.deuda / maximo) * 100}%`, '--ini-color': 'var(--dv-group-3)' }} /></span>
                        <span className="ini-bar__value">{fmtMillones(u.deuda)}</span>
                    </div>
                ))}
            </div>
            <div className="ini-chartnote">Foto de la última sincronización con SIGFE ({fmtFechaCorta(d.actualizado)}); no depende del año elegido.</div>
        </Panel>
    );
}

// ─── Compra por modalidad ────────────────────────────────────────────────────

const COLORES_MODALIDAD = ['--dv-primary', '--dv-group-2', '--dv-group-3', '--dv-group-4', '--dv-ink-4'];

export function PanelModalidades({ oc, anio, onIr }) {
    const total = oc.modalidades.reduce((s, m) => s + m.monto, 0);
    const colores = oc.modalidades.map((_, i) => dvColor(COLORES_MODALIDAD[i % COLORES_MODALIDAD.length]));
    const data = { labels: oc.modalidades.map((m) => m.modalidad), datasets: [{ data: oc.modalidades.map((m) => m.monto), backgroundColor: colores, borderWidth: 0 }] };

    return (
        <Panel titulo="Compra por modalidad" nota={`${anio}, por monto neto`} ruta="/ordenes-compra" onIr={onIr}>
            {!total ? <div className="ini-vacio">Sin compras registradas en este período.</div> : (
                <div className="ini-modal">
                    <div className="ini-modal__donut">
                        <Doughnut data={data} options={{
                            responsive: true, maintainAspectRatio: false, cutout: '64%',
                            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtMillones(ctx.raw)}` } } },
                        }} />
                    </div>
                    <ul className="ini-legend">
                        {oc.modalidades.map((m, i) => (
                            <li key={m.modalidad}>
                                <i style={{ background: colores[i] }} />
                                <span>{m.modalidad}</span>
                                <b>{fmtPct((m.monto / total) * 100)}</b>
                                <small>{fmtMillones(m.monto)} · {fmtN(m.cantidad)} OC</small>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Panel>
    );
}
