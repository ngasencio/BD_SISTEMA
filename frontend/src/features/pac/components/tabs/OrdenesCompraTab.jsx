import { useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

const C = ['#006FB3','#2D717C','#E0701E','#FE6565','#6C5CE7','#22c55e','#f59e0b','#8b5cf6','#ec4899','#14b8a6'];
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const fmt = (n) => new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(n??0);
const fmtM = (n) => `$${((n??0)/1e6).toFixed(1)}M`;
const BAR_OPTS = (title) => ({
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, title: { display: !!title, text: title, font:{size:12} } },
    scales: { y: { ticks: { font:{size:10} } }, x: { ticks: { font:{size:10} } } },
});
const H_BAR_OPTS = (title) => ({
    ...BAR_OPTS(title), indexAxis: 'y',
    scales: { x: { ticks: { font:{size:10} } }, y: { ticks: { font:{size:10} } } },
});

function KpiCard({ label, value, sub, color = '#006FB3' }) {
    return (
        <div className="kpi-card" style={{ borderTop: `3px solid ${color}` }}>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value" style={{ color }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: '#7a8899', marginTop: 2 }}>{sub}</div>}
        </div>
    );
}

function ChartBox({ title, height = 220, children }) {
    return (
        <div className="card" style={{ padding: 14 }}>
            {title && <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, fontFamily: 'Outfit,sans-serif' }}>{title}</div>}
            <div style={{ height }}>{children}</div>
        </div>
    );
}

function EmptyMsg() {
    return <div style={{ textAlign:'center', color:'#aaa', padding:20, fontSize:13 }}>Sin datos</div>;
}

function MiniTable({ cols, rows, keyField }) {
    if (!rows?.length) return <EmptyMsg />;
    return (
        <div style={{ overflowX:'auto', maxHeight:320, overflowY:'auto' }}>
            <table className="data-table" style={{ fontSize:12 }}>
                <thead><tr>{cols.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead>
                <tbody>
                    {rows.map((r,i)=>(
                        <tr key={r[keyField]??i}>
                            {cols.map(c=><td key={c.key}>{c.render?c.render(r[c.key],r):r[c.key]}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 1. RESUMEN GENERAL
// ─────────────────────────────────────────────────────────────
function ResumenGeneralPanel({ data }) {
    if (!data) return <EmptyMsg />;
    const { resumen, cruce_pac, evolucion_enlace, por_tipo_interno } = data;
    const enlazada = cruce_pac?.find(r=>r.enlace==='Enlazada') ?? { monto:0, cantidad:0 };
    const noEnlazada = cruce_pac?.find(r=>r.enlace==='No Enlazada') ?? { monto:0, cantidad:0 };

    const mesesData = Array.from({length:12},(_,i)=>evolucion_enlace?.find(r=>r.mes===i+1));
    const evolChart = {
        labels: MESES,
        datasets: [
            { label:'Enlazada', data: mesesData.map(r=>r?.enlazada??0), backgroundColor:'#006FB3', borderRadius:3 },
            { label:'No Enlazada', data: mesesData.map(r=>r?.no_enlazada??0), backgroundColor:'#FE6565', borderRadius:3 },
        ],
    };
    const doughnutChart = {
        labels: ['Enlazada','No Enlazada'],
        datasets:[{ data:[enlazada.monto, noEnlazada.monto], backgroundColor:['#006FB3','#FE6565'], borderWidth:0 }],
    };
    const tipoLabels = (por_tipo_interno??[]).map(r=>r.tipo);
    const tipoChart = {
        labels: tipoLabels,
        datasets:[
            { label:'Enlazada', data:(por_tipo_interno??[]).map(r=>r.enlazada), backgroundColor:'#006FB3', borderRadius:3 },
            { label:'No Enlazada', data:(por_tipo_interno??[]).map(r=>r.no_enlazada), backgroundColor:'#FE6565', borderRadius:3 },
        ],
    };

    return (
        <div>
            <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:16}}>
                <KpiCard label="Total OC" value={(resumen.total_oc??0).toLocaleString('es-CL')} />
                <KpiCard label="Monto Total Neto" value={fmtM(resumen.monto_total)} />
                <KpiCard label="Monto Enlazado PAC" value={fmtM(enlazada.monto)} color="#006FB3"
                    sub={`${enlazada.cantidad} OC`} />
                <KpiCard label="Monto No Enlazado" value={fmtM(noEnlazada.monto)} color="#FE6565"
                    sub={`${noEnlazada.cantidad} OC`} />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12,marginBottom:12}}>
                <ChartBox title="Evolución Mensual: Enlazada vs No Enlazada" height={220}>
                    <Bar data={evolChart} options={{...BAR_OPTS(),maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{x:{stacked:false},y:{stacked:false}}}} />
                </ChartBox>
                <ChartBox title="Distribución EnlacePAC" height={220}>
                    <Doughnut data={doughnutChart} options={{maintainAspectRatio:false,plugins:{legend:{position:'right'}}}} />
                </ChartBox>
            </div>
            <ChartBox title="Monto por Tipo OC Interno (Enlazada vs No Enlazada)" height={200}>
                <Bar data={tipoChart} options={{maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{x:{ticks:{font:{size:10}}},y:{ticks:{font:{size:10}}}}}} />
            </ChartBox>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// TABLA MODERNA — Estado OC (pendientes)
// ─────────────────────────────────────────────────────────────
function TablaEstado({ rows }) {
    const [q, setQ] = useState('');
    const [sortK, setSortK] = useState('dias_pend');
    const [sortD, setSortD] = useState(-1);

    const filtered = (rows ?? []).filter(r => {
        const s = q.toLowerCase();
        return !s || r.codigo_oc?.toLowerCase().includes(s)
            || r.proveedor?.toLowerCase().includes(s)
            || r.descripcion_tipo?.toLowerCase().includes(s);
    });
    const sorted = [...filtered].sort((a, b) => {
        const av = a[sortK] ?? '', bv = b[sortK] ?? '';
        return typeof av === 'number' ? (av - bv) * sortD : String(av).localeCompare(String(bv)) * sortD;
    });

    const onSort = (k) => { if (sortK === k) setSortD(d => -d); else { setSortK(k); setSortD(-1); } };
    const arrow = (k) => sortK === k ? (sortD === -1 ? ' ↓' : ' ↑') : '';

    const urgClass = (d) => d > 60 ? 'pac-row-critico' : d > 30 ? 'pac-row-atento' : '';
    const urgBadge = (d) => {
        if (d > 60) return <span className="pac-badge-dias pac-badge-critico">{d}d</span>;
        if (d > 30) return <span className="pac-badge-dias pac-badge-atento">{d}d</span>;
        return <span className="pac-badge-dias pac-badge-normal">{d}d</span>;
    };

    return (
        <div className="pac-mt-wrap">
            <div className="pac-mt-head">
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span className="pac-mt-title">OC Pendientes de Recepción Conforme</span>
                    <span className="pac-mt-count">{filtered.length} registros</span>
                </div>
                <div className="pac-mt-search">
                    <span style={{color:'#7a8899'}}>🔍</span>
                    <input
                        value={q} onChange={e=>setQ(e.target.value)}
                        placeholder="Buscar OC, proveedor, tipo…"
                    />
                    {q && <button onClick={()=>setQ('')} style={{border:'none',background:'none',cursor:'pointer',color:'#aaa',fontSize:12}}>✕</button>}
                </div>
            </div>
            <div className="pac-mt-scroll">
                <table className="pac-mt">
                    <thead>
                        <tr>
                            <th onClick={()=>onSort('codigo_oc')}>Código OC{arrow('codigo_oc')}</th>
                            <th onClick={()=>onSort('descripcion_tipo')}>Modalidad{arrow('descripcion_tipo')}</th>
                            <th onClick={()=>onSort('estado')}>Estado{arrow('estado')}</th>
                            <th onClick={()=>onSort('proveedor')}>Proveedor{arrow('proveedor')}</th>
                            <th onClick={()=>onSort('fecha_envio')}>F. Envío{arrow('fecha_envio')}</th>
                            <th onClick={()=>onSort('total_neto')} style={{textAlign:'right'}}>Monto Neto{arrow('total_neto')}</th>
                            <th onClick={()=>onSort('dias_pend')} style={{textAlign:'center'}}>Antigüedad{arrow('dias_pend')}</th>
                            <th style={{textAlign:'center'}}>Acción</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.length === 0 && (
                            <tr className="pac-empty-row"><td colSpan={8}>Sin registros que coincidan con la búsqueda</td></tr>
                        )}
                        {sorted.map(r => (
                            <tr key={r.codigo_oc} className={urgClass(r.dias_pend)}>
                                <td><span style={{fontFamily:'monospace',fontSize:11,fontWeight:700,color:'#1a2233'}}>{r.codigo_oc}</span></td>
                                <td style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.descripcion_tipo||'—'}</td>
                                <td><span className="pac-badge-estado">{r.estado||'—'}</span></td>
                                <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.proveedor||'—'}</td>
                                <td style={{color:'#7a8899',fontSize:11}}>{r.fecha_envio||'—'}</td>
                                <td style={{textAlign:'right',fontWeight:600,color:'#1a2233'}}>{fmt(r.total_neto)}</td>
                                <td style={{textAlign:'center'}}>{urgBadge(r.dias_pend)}</td>
                                <td style={{textAlign:'center'}}>
                                    {r.link_mp
                                        ? <a href={r.link_mp} target="_blank" rel="noreferrer" className="pac-btn-mp">🔗 Ver MP</a>
                                        : <span style={{color:'#ccc',fontSize:11}}>—</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 2. ESTADO OC
// ─────────────────────────────────────────────────────────────
function EstadoOCPanel({ data }) {
    if (!data) return <EmptyMsg />;
    const { resumen, pendientes_edad, pendientes_evolucion, por_estado, pendientes_tabla } = data;
    const totalNC = (resumen.rc_count??0)+(resumen.pendientes_count??0);
    const pctRC = totalNC>0 ? ((resumen.rc_count/totalNC)*100).toFixed(1) : 0;

    const edadChart = {
        labels: (pendientes_edad??[]).map(r=>r.rango),
        datasets:[{
            label:'OC Pendientes',
            data:(pendientes_edad??[]).map(r=>r.cantidad),
            backgroundColor:(pendientes_edad??[]).map(r=>{
                if(r.rango==='>90'||r.rango==='61-90') return '#FE6565';
                if(r.rango==='31-60') return '#f59e0b';
                return '#22c55e';
            }),
            borderRadius:3,
        }],
    };
    const mesesEvol = Array.from({length:12},(_,i)=>pendientes_evolucion?.find(r=>r.mes===i+1));
    const evolChart = {
        labels: MESES,
        datasets:[{ label:'Pendientes', data:mesesEvol.map(r=>r?.cantidad??0), borderColor:'#E0701E', backgroundColor:'rgba(224,112,30,0.15)', fill:true, tension:0.4 }],
    };
    const estadoDChart = {
        labels:(por_estado??[]).map(r=>r.estado||'Sin estado'),
        datasets:[{ data:(por_estado??[]).map(r=>r.monto), backgroundColor:C, borderWidth:0 }],
    };

    return (
        <div>
            <div className="kpi-grid" style={{gridTemplateColumns:'repeat(5,1fr)',marginBottom:16}}>
                <KpiCard label="Recepción Conforme" value={(resumen.rc_count??0).toLocaleString('es-CL')} sub={`${pctRC}% del total`} color="#22c55e" />
                <KpiCard label="OC Pendientes" value={(resumen.pendientes_count??0).toLocaleString('es-CL')} sub={fmtM(resumen.pendientes_monto)} color="#E0701E" />
                <KpiCard label="🔴 Crítico >60d" value={(resumen.critico??0).toLocaleString('es-CL')} color="#FE6565" />
                <KpiCard label="🟡 Atención 31-60d" value={(resumen.atento??0).toLocaleString('es-CL')} color="#f59e0b" />
                <KpiCard label="🟢 Normal 0-30d" value={(resumen.normal??0).toLocaleString('es-CL')} color="#22c55e" />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:16}}>
                <ChartBox title="OC Pendientes por Antigüedad" height={200}>
                    <Bar data={edadChart} options={BAR_OPTS()} />
                </ChartBox>
                <ChartBox title="Evolución Mensual Pendientes" height={200}>
                    <Line data={evolChart} options={{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}} />
                </ChartBox>
                <ChartBox title="Monto por Estado" height={200}>
                    <Doughnut data={estadoDChart} options={{maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:10}}}}}} />
                </ChartBox>
            </div>
            <TablaEstado rows={pendientes_tabla} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 3. ANÁLISIS PAC
// ─────────────────────────────────────────────────────────────
function AnalisisPACPanel({ data }) {
    if (!data) return <EmptyMsg />;
    const { cruce_pac, evolucion_enlace, pac_semestral, no_enlazadas_tipo_compra, no_enlazadas_tipo_interno, oportunidades_enlace } = data;
    const enlazada = cruce_pac?.find(r=>r.enlace==='Enlazada')??{monto:0,cantidad:0};
    const noEnlazada = cruce_pac?.find(r=>r.enlace==='No Enlazada')??{monto:0,cantidad:0};
    const total = enlazada.monto + noEnlazada.monto;
    const pct = total>0 ? ((enlazada.monto/total)*100).toFixed(1) : 0;

    const mesesData = Array.from({length:12},(_,i)=>evolucion_enlace?.find(r=>r.mes===i+1));
    const evolChart = {
        labels: MESES,
        datasets:[
            { label:'Enlazada', data:mesesData.map(r=>r?.enlazada??0), backgroundColor:'#006FB3', borderRadius:3 },
            { label:'No Enlazada', data:mesesData.map(r=>r?.no_enlazada??0), backgroundColor:'#FE6565', borderRadius:3 },
        ],
    };
    const semChart = {
        labels:['S1 (Ene-Jun)','S2 (Jul-Dic)'],
        datasets:[
            { label:'Enlazada', data:[pac_semestral?.s1_enlazada??0, pac_semestral?.s2_enlazada??0], backgroundColor:'#006FB3', borderRadius:3 },
            { label:'No Enlazada', data:[pac_semestral?.s1_no_enlazada??0, pac_semestral?.s2_no_enlazada??0], backgroundColor:'#FE6565', borderRadius:3 },
        ],
    };
    const noEnlTCChart = {
        labels:(no_enlazadas_tipo_compra??[]).map(r=>r.tipo_compra||'Sin tipo'),
        datasets:[{ data:(no_enlazadas_tipo_compra??[]).map(r=>r.monto), backgroundColor:C, borderWidth:0 }],
    };
    const noEnlTIChart = {
        labels:(no_enlazadas_tipo_interno??[]).map(r=>r.tipo_interno||'Sin tipo'),
        datasets:[{
            label:'Monto',
            data:(no_enlazadas_tipo_interno??[]).map(r=>r.monto),
            backgroundColor:'#FE6565', borderRadius:3, indexAxis:'y',
        }],
    };

    return (
        <div>
            <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:16}}>
                <KpiCard label="% Compras en PAC" value={`${pct}%`} color="#006FB3" />
                <KpiCard label="Monto Enlazado" value={fmtM(enlazada.monto)} sub={`${enlazada.cantidad} OC`} color="#006FB3" />
                <KpiCard label="Monto No Enlazado" value={fmtM(noEnlazada.monto)} sub={`${noEnlazada.cantidad} OC`} color="#FE6565" />
                <KpiCard label="OC Corregibles" value={(oportunidades_enlace?.corregibles??0).toLocaleString('es-CL')} sub="con CodigoLicitacion" color="#E0701E" />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12,marginBottom:12}}>
                <ChartBox title="Evolución Mensual Enlazada vs No Enlazada" height={210}>
                    <Bar data={evolChart} options={{maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{x:{ticks:{font:{size:10}}},y:{ticks:{font:{size:10}}}}}} />
                </ChartBox>
                <ChartBox title="Semestral" height={210}>
                    <Bar data={semChart} options={{maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{x:{ticks:{font:{size:10}}},y:{ticks:{font:{size:10}}}}}} />
                </ChartBox>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <ChartBox title="No Enlazadas por Tipo Compra Interna" height={200}>
                    <Doughnut data={noEnlTCChart} options={{maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:10}}}}}} />
                </ChartBox>
                <ChartBox title="No Enlazadas por Tipo OC Interno" height={200}>
                    <Bar data={noEnlTIChart} options={{...H_BAR_OPTS(),maintainAspectRatio:false,plugins:{legend:{display:false}}}} />
                </ChartBox>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// TABLA MODERNA — Oportunidad Enlace
// ─────────────────────────────────────────────────────────────
function TablaEnlace({ rows, corregibles }) {
    const [q, setQ] = useState('');
    const [sortK, setSortK] = useState('total_neto');
    const [sortD, setSortD] = useState(-1);

    const filtered = (rows ?? []).filter(r => {
        const s = q.toLowerCase();
        return !s || r.codigo_oc?.toLowerCase().includes(s)
            || r.codigo_licitacion?.toLowerCase().includes(s)
            || r.proveedor?.toLowerCase().includes(s);
    });
    const sorted = [...filtered].sort((a, b) => {
        const av = a[sortK] ?? '', bv = b[sortK] ?? '';
        return typeof av === 'number' ? (av - bv) * sortD : String(av).localeCompare(String(bv)) * sortD;
    });

    const onSort = (k) => { if (sortK === k) setSortD(d => -d); else { setSortK(k); setSortD(-1); } };
    const arrow = (k) => sortK === k ? (sortD === -1 ? ' ↓' : ' ↑') : '';

    return (
        <div className="pac-mt-wrap">
            <div className="pac-mt-head">
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <span className="pac-mt-title">OC No Enlazadas — Licitación Identificable</span>
                    <span className="pac-mt-count">{filtered.length} de {corregibles ?? rows?.length ?? 0} corregibles</span>
                    <span style={{fontSize:11,color:'#E0701E',background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'2px 8px'}}>
                        ⚡ Estas OC pueden enlazarse al PAC
                    </span>
                </div>
                <div className="pac-mt-search">
                    <span style={{color:'#7a8899'}}>🔍</span>
                    <input
                        value={q} onChange={e=>setQ(e.target.value)}
                        placeholder="OC, licitación, proveedor…"
                    />
                    {q && <button onClick={()=>setQ('')} style={{border:'none',background:'none',cursor:'pointer',color:'#aaa',fontSize:12}}>✕</button>}
                </div>
            </div>
            <div className="pac-mt-scroll">
                <table className="pac-mt">
                    <thead>
                        <tr>
                            <th onClick={()=>onSort('codigo_oc')}>Código OC{arrow('codigo_oc')}</th>
                            <th onClick={()=>onSort('codigo_licitacion')}>Licitación{arrow('codigo_licitacion')}</th>
                            <th onClick={()=>onSort('descripcion_tipo')}>Modalidad{arrow('descripcion_tipo')}</th>
                            <th onClick={()=>onSort('proveedor')}>Proveedor{arrow('proveedor')}</th>
                            <th onClick={()=>onSort('fecha_envio')}>F. Envío{arrow('fecha_envio')}</th>
                            <th onClick={()=>onSort('total_neto')} style={{textAlign:'right'}}>Monto Neto{arrow('total_neto')}</th>
                            <th style={{textAlign:'center'}}>Ver en MP</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.length === 0 && (
                            <tr className="pac-empty-row"><td colSpan={7}>Sin registros que coincidan</td></tr>
                        )}
                        {sorted.map(r => (
                            <tr key={r.codigo_oc}>
                                <td><span style={{fontFamily:'monospace',fontSize:11,fontWeight:700,color:'#1a2233'}}>{r.codigo_oc}</span></td>
                                <td>
                                    {r.codigo_licitacion
                                        ? <span className="pac-badge-lic">{r.codigo_licitacion}</span>
                                        : <span style={{color:'#ccc'}}>—</span>}
                                </td>
                                <td style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:11}}>{r.descripcion_tipo||'—'}</td>
                                <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.proveedor||'—'}</td>
                                <td style={{color:'#7a8899',fontSize:11}}>{r.fecha_envio||'—'}</td>
                                <td style={{textAlign:'right',fontWeight:600,color:'#1a2233'}}>{fmt(r.total_neto)}</td>
                                <td style={{textAlign:'center'}}>
                                    {r.link_mp
                                        ? <a href={r.link_mp} target="_blank" rel="noreferrer" className="pac-btn-mp">🔗 Abrir</a>
                                        : <span style={{color:'#ccc',fontSize:11}}>—</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 4. OPORTUNIDAD DE ENLACE
// ─────────────────────────────────────────────────────────────
function OportunidadEnlacePanel({ data }) {
    if (!data) return <EmptyMsg />;
    const { cruce_pac, oportunidades_enlace, no_enlazadas_tipo_compra, no_enlazadas_tabla } = data;
    const enlazada = cruce_pac?.find(r=>r.enlace==='Enlazada')??{monto:0};
    const noEnlazada = cruce_pac?.find(r=>r.enlace==='No Enlazada')??{monto:0};

    const topLic = oportunidades_enlace?.top_licitaciones??[];
    const freqChart = {
        labels: topLic.map(r=>r.codigo_licitacion),
        datasets:[{
            label:'OC sin enlazar',
            data: topLic.map(r=>r.cantidad),
            backgroundColor:'#E0701E', borderRadius:3, indexAxis:'y',
        }],
    };
    const tcChart = {
        labels:(no_enlazadas_tipo_compra??[]).map(r=>r.tipo_compra||'Sin tipo'),
        datasets:[{ data:(no_enlazadas_tipo_compra??[]).map(r=>r.monto), backgroundColor:C, borderWidth:0 }],
    };

    return (
        <div>
            <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:16}}>
                <KpiCard label="Monto Enlazado" value={fmtM(enlazada.monto)} color="#006FB3" />
                <KpiCard label="Monto No Enlazado" value={fmtM(noEnlazada.monto)} color="#FE6565" />
                <KpiCard label="OC Corregibles" value={(oportunidades_enlace?.corregibles??0).toLocaleString('es-CL')} sub="tienen CodigoLicitacion" color="#E0701E" />
                <KpiCard label="Licitaciones Únicas" value={(oportunidades_enlace?.lic_unicas??0).toLocaleString('es-CL')} color="#2D717C" />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12,marginBottom:16}}>
                <ChartBox title="Top 10 Licitaciones más frecuentes (OC sin enlazar)" height={230}>
                    {topLic.length ? <Bar data={freqChart} options={{...H_BAR_OPTS(),maintainAspectRatio:false,plugins:{legend:{display:false}}}} /> : <EmptyMsg />}
                </ChartBox>
                <ChartBox title="No Enlazadas por Tipo Compra" height={230}>
                    <Doughnut data={tcChart} options={{maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:10}}}}}} />
                </ChartBox>
            </div>
            <TablaEnlace rows={no_enlazadas_tabla} corregibles={oportunidades_enlace?.corregibles} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 5. LEAD TIME
// ─────────────────────────────────────────────────────────────
function LeadTimePanel({ data }) {
    if (!data) return <EmptyMsg />;
    const { resumen, lt_ce_distribucion, lt_ea_distribucion, lt_por_modalidad, lt_tabla } = data;

    const ceChart = {
        labels:(lt_ce_distribucion??[]).map(r=>r.rango),
        datasets:[{
            label:'Creación→Envío',
            data:(lt_ce_distribucion??[]).map(r=>r.cantidad),
            backgroundColor:(lt_ce_distribucion??[]).map(r=>{
                if(r.rango==='>60'||r.rango==='31-60') return '#FE6565';
                if(r.rango==='15-30') return '#f59e0b';
                return '#22c55e';
            }),
            borderRadius:3,
        }],
    };
    const eaChart = {
        labels:(lt_ea_distribucion??[]).map(r=>r.rango),
        datasets:[{
            label:'Envío→Aceptación',
            data:(lt_ea_distribucion??[]).map(r=>r.cantidad),
            backgroundColor:(lt_ea_distribucion??[]).map(r=>{
                if(r.rango==='>60'||r.rango==='31-60') return '#FE6565';
                if(r.rango==='15-30') return '#f59e0b';
                return '#006FB3';
            }),
            borderRadius:3,
        }],
    };
    const modalLabels = (lt_por_modalidad??[]).slice(0,8).map(r=>r.modalidad);
    const modalChart = {
        labels: modalLabels,
        datasets:[
            { label:'Creación→Envío', data:(lt_por_modalidad??[]).slice(0,8).map(r=>r.avg_ce), backgroundColor:'#006FB3', borderRadius:3 },
            { label:'Envío→Aceptación', data:(lt_por_modalidad??[]).slice(0,8).map(r=>r.avg_ea), backgroundColor:'#2D717C', borderRadius:3 },
        ],
    };

    const cols = [
        {key:'codigo_oc',label:'OC'},
        {key:'descripcion_tipo',label:'Tipo'},
        {key:'proveedor',label:'Proveedor'},
        {key:'fecha_creacion',label:'Creación'},
        {key:'fecha_envio',label:'Envío'},
        {key:'fecha_aceptacion',label:'Aceptación'},
        {key:'lt_ce',label:'CE días',render:v=><span style={{color:v>30?'#FE6565':v>7?'#f59e0b':'#22c55e',fontWeight:700}}>{v}</span>},
        {key:'lt_ea',label:'EA días',render:v=><span style={{color:v>30?'#FE6565':v>7?'#f59e0b':'#22c55e',fontWeight:700}}>{v}</span>},
        {key:'total_neto',label:'Monto',render:v=>fmt(v)},
    ];

    return (
        <div>
            <div className="kpi-grid" style={{gridTemplateColumns:'repeat(2,1fr)',marginBottom:16}}>
                <KpiCard label="Prom. Creación → Envío" value={`${resumen.avg_lt_ce??0} días`} color="#006FB3" />
                <KpiCard label="Prom. Envío → Aceptación" value={`${resumen.avg_lt_ea??0} días`} color="#2D717C" />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <ChartBox title="Distribución Lead Time Creación → Envío (días)" height={200}>
                    <Bar data={ceChart} options={BAR_OPTS()} />
                </ChartBox>
                <ChartBox title="Distribución Lead Time Envío → Aceptación (días)" height={200}>
                    <Bar data={eaChart} options={BAR_OPTS()} />
                </ChartBox>
            </div>
            <ChartBox title="Lead Time Promedio por Modalidad de Compra (días)" height={200}>
                <Bar data={modalChart} options={{maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{x:{ticks:{font:{size:10}}},y:{beginAtZero:true}}}} />
            </ChartBox>
            <div className="card" style={{padding:14,marginTop:12}}>
                <div style={{fontWeight:700,fontSize:13,marginBottom:8,fontFamily:'Outfit,sans-serif'}}>OC con Lead Time Crítico CE &gt; 10 días (Top 50)</div>
                <MiniTable cols={cols} rows={lt_tabla} keyField="codigo_oc" />
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 6. ANÁLISIS MONETARIO
// ─────────────────────────────────────────────────────────────
function AnalisisMonetarioPanel({ data }) {
    if (!data) return <EmptyMsg />;
    const { resumen, por_modalidad_monto, por_forma_pago, por_despacho, por_moneda } = data;

    const modalChart = {
        labels:(por_modalidad_monto??[]).map(r=>r.modalidad),
        datasets:[{ data:(por_modalidad_monto??[]).map(r=>r.monto), backgroundColor:C, borderWidth:0 }],
    };
    const pagoChart = {
        labels:(por_forma_pago??[]).map(r=>r.forma_pago),
        datasets:[{ data:(por_forma_pago??[]).map(r=>r.monto), backgroundColor:C, borderWidth:0 }],
    };
    const despLabels = (por_despacho??[]).map(r=>r.despacho);
    const despChart = {
        labels: despLabels,
        datasets:[{
            label:'Cantidad OC',
            data:(por_despacho??[]).map(r=>r.cantidad),
            backgroundColor:'#2D717C', borderRadius:3, indexAxis:'y',
        }],
    };
    const monedaChart = {
        labels:(por_moneda??[]).map(r=>r.moneda),
        datasets:[{ data:(por_moneda??[]).map(r=>r.monto), backgroundColor:C, borderWidth:0 }],
    };

    return (
        <div>
            <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:16}}>
                <KpiCard label="Monto Neto Total" value={fmtM(resumen.monto_total)} color="#006FB3" />
                <KpiCard label="Recepción Conforme" value={fmtM(resumen.monto_rc)} color="#22c55e" />
                <KpiCard label="Monto Pendiente" value={fmtM(resumen.monto_pendiente)} color="#E0701E" />
                <KpiCard label="Monto Cancelado" value={fmtM(resumen.monto_cancelado)} color="#FE6565" />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <ChartBox title="Monto por Modalidad de Compra" height={210}>
                    <Doughnut data={modalChart} options={{maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:10}}}}}} />
                </ChartBox>
                <ChartBox title="Monto por Forma de Pago" height={210}>
                    <Doughnut data={pagoChart} options={{maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:10}}}}}} />
                </ChartBox>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12}}>
                <ChartBox title="Tipo de Despacho (cantidad OC)" height={200}>
                    {despLabels.length ? <Bar data={despChart} options={{...H_BAR_OPTS(),maintainAspectRatio:false,plugins:{legend:{display:false}}}} /> : <EmptyMsg />}
                </ChartBox>
                <ChartBox title="Distribución por Moneda" height={200}>
                    <Doughnut data={monedaChart} options={{maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:10}}}}}} />
                </ChartBox>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 7. ANÁLISIS PRODUCTOS
// ─────────────────────────────────────────────────────────────
function AnalisisProductosPanel({ data }) {
    if (!data) return <div style={{textAlign:'center',padding:40,color:'#aaa'}}>Cargando productos…</div>;
    const { resumen, top_categorias, top_productos, top_td, por_categoria_modalidad } = data;

    const catChart = {
        labels:(top_categorias??[]).map(r=>r.categoria?.substring(0,40)),
        datasets:[{ label:'Monto', data:(top_categorias??[]).map(r=>r.monto), backgroundColor:'#006FB3', borderRadius:3, indexAxis:'y' }],
    };
    const prodChart = {
        labels:(top_productos??[]).map(r=>r.producto?.substring(0,40)),
        datasets:[{ label:'Cantidad líneas', data:(top_productos??[]).map(r=>r.cantidad), backgroundColor:'#2D717C', borderRadius:3, indexAxis:'y' }],
    };
    const tdChart = {
        labels:(top_td??[]).map(r=>r.producto?.substring(0,40)),
        datasets:[{ label:'Monto Trato Directo', data:(top_td??[]).map(r=>r.monto), backgroundColor:'#E0701E', borderRadius:3, indexAxis:'y' }],
    };

    // Stacked by category × modality
    const cats5 = (por_categoria_modalidad??[]).slice(0,5).map(r=>r.categoria?.substring(0,30));
    const allModals = [...new Set((por_categoria_modalidad??[]).flatMap(r=>Object.keys(r.modalidades??{})))];
    const stackedChart = {
        labels: cats5,
        datasets: allModals.map((m,i)=>({
            label: m,
            data: (por_categoria_modalidad??[]).slice(0,5).map(r=>r.modalidades?.[m]??0),
            backgroundColor: C[i%C.length],
            borderRadius:2,
        })),
    };

    return (
        <div>
            <div className="kpi-grid" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:16}}>
                <KpiCard label="Productos Únicos" value={(resumen?.unique_productos??0).toLocaleString('es-CL')} />
                <KpiCard label="Monto Total Detalle" value={fmtM(resumen?.total_lineas_monto)} />
                <KpiCard label="OC con Detalle" value={(resumen?.oc_con_detalle??0).toLocaleString('es-CL')} />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
                <ChartBox title="Top 10 Categorías por Monto" height={220}>
                    {(top_categorias?.length) ? <Bar data={catChart} options={{...H_BAR_OPTS(),maintainAspectRatio:false,plugins:{legend:{display:false}}}} /> : <EmptyMsg />}
                </ChartBox>
                <ChartBox title="Top 10 Productos por Cantidad de Líneas" height={220}>
                    {(top_productos?.length) ? <Bar data={prodChart} options={{...H_BAR_OPTS(),maintainAspectRatio:false,plugins:{legend:{display:false}}}} /> : <EmptyMsg />}
                </ChartBox>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <ChartBox title="Top 5 Categorías × Modalidad (Gasto Apilado)" height={220}>
                    {cats5.length ? <Bar data={stackedChart} options={{maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:10}}}},scales:{x:{stacked:true},y:{stacked:true}}}} /> : <EmptyMsg />}
                </ChartBox>
                <ChartBox title="Top Productos en Trato Directo" height={220}>
                    {(top_td?.length) ? <Bar data={tdChart} options={{...H_BAR_OPTS(),maintainAspectRatio:false,plugins:{legend:{display:false}}}} /> : <EmptyMsg />}
                </ChartBox>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 8. COMPARATIVO HISTÓRICO
// ─────────────────────────────────────────────────────────────
function ComparativoHistoricoPanel({ data }) {
    if (!data) return <EmptyMsg />;
    const { anio, resumen, historico_anual, historico_semestral, historico_modalidad } = data;

    const histLabels = (historico_anual??[]).map(r=>String(r.anio));
    const montoChart = {
        labels: histLabels,
        datasets:[{
            label:'Monto Neto',
            data:(historico_anual??[]).map(r=>r.monto_total),
            backgroundColor:(historico_anual??[]).map(r=>r.anio===anio?'rgba(0,111,179,0.5)':'#006FB3'),
            borderRadius:4,
        }],
    };
    const cantChart = {
        labels: histLabels,
        datasets:[{ label:'N° OC', data:(historico_anual??[]).map(r=>r.total_oc), borderColor:'#2D717C', backgroundColor:'rgba(45,113,124,0.1)', fill:true, tension:0.4 }],
    };
    const semLabels = (historico_semestral??[]).map(r=>String(r.anio));
    const semChart = {
        labels: semLabels,
        datasets:[
            { label:'S1 (Ene-Jun)', data:(historico_semestral??[]).map(r=>r.s1_monto), backgroundColor:'#006FB3', borderRadius:3 },
            { label:'S2 (Jul-Dic)', data:(historico_semestral??[]).map(r=>r.s2_monto), backgroundColor:'#2D717C', borderRadius:3 },
        ],
    };

    // Stacked by modality per year
    const allModals = [...new Set((historico_modalidad??[]).map(r=>r.modalidad))];
    const top5Modals = allModals
        .map(m=>({ m, total:(historico_modalidad??[]).filter(r=>r.modalidad===m).reduce((s,r)=>s+r.monto,0) }))
        .sort((a,b)=>b.total-a.total).slice(0,5).map(x=>x.m);
    const modalStackChart = {
        labels: histLabels,
        datasets: top5Modals.map((m,i)=>({
            label: m,
            data: histLabels.map(y=>(historico_modalidad??[]).find(r=>String(r.anio)===y&&r.modalidad===m)?.monto??0),
            backgroundColor: C[i%C.length],
            borderRadius:2,
        })),
    };

    const anioActual = historico_anual?.find(r=>r.anio===anio);

    return (
        <div>
            <div className="kpi-grid" style={{gridTemplateColumns:'repeat(2,1fr)',marginBottom:16}}>
                <KpiCard label={`N° OC ${anio}`} value={(anioActual?.total_oc??0).toLocaleString('es-CL')} />
                <KpiCard label={`Monto Total ${anio}`} value={fmtM(anioActual?.monto_total)} color="#006FB3" />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12,marginBottom:12}}>
                <ChartBox title="Monto Anual (todos los años)" height={210}>
                    <Bar data={montoChart} options={{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{font:{size:10},callback:v=>fmtM(v)}}}}} />
                </ChartBox>
                <ChartBox title="Cantidad de OC por Año" height={210}>
                    <Line data={cantChart} options={{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}} />
                </ChartBox>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12}}>
                <ChartBox title="Comparativo por Modalidad (Top 5) — Apilado" height={220}>
                    {top5Modals.length ? <Bar data={modalStackChart} options={{maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:10}}}},scales:{x:{stacked:true},y:{stacked:true,ticks:{font:{size:10},callback:v=>fmtM(v)}}}}} /> : <EmptyMsg />}
                </ChartBox>
                <ChartBox title="Comparativo Semestral por Año" height={220}>
                    <Bar data={semChart} options={{maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{font:{size:10}}}},scales:{x:{ticks:{font:{size:10}}},y:{ticks:{font:{size:10},callback:v=>fmtM(v)}}}}} />
                </ChartBox>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
const SUB_TABS = [
    { id:'resumen',   label:'Resumen General' },
    { id:'estado',    label:'Estado OC' },
    { id:'pac',       label:'Análisis PAC' },
    { id:'enlace',    label:'Oportunidad Enlace' },
    { id:'leadtime',  label:'Lead Time' },
    { id:'monetario', label:'Análisis Monetario' },
    { id:'productos', label:'Análisis Productos' },
    { id:'historico', label:'Comparativo Histórico' },
];

export default function OrdenesCompraTab({ ocStats, ocProductos }) {
    const [subTab, setSubTab] = useState('resumen');

    const panels = {
        resumen:   <ResumenGeneralPanel data={ocStats} />,
        estado:    <EstadoOCPanel data={ocStats} />,
        pac:       <AnalisisPACPanel data={ocStats} />,
        enlace:    <OportunidadEnlacePanel data={ocStats} />,
        leadtime:  <LeadTimePanel data={ocStats} />,
        monetario: <AnalisisMonetarioPanel data={ocStats} />,
        productos: <AnalisisProductosPanel data={ocProductos} />,
        historico: <ComparativoHistoricoPanel data={ocStats} />,
    };

    return (
        <div className="pac-tab-content">
            <div className="pac-sub-tabs">
                {SUB_TABS.map(t=>(
                    <button
                        key={t.id}
                        className={`pac-sub-tab-btn ${subTab===t.id?'active':''}`}
                        onClick={()=>setSubTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            <div style={{marginTop:16}}>{panels[subTab]}</div>
        </div>
    );
}
