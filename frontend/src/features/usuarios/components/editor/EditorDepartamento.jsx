import { useEffect, useMemo, useState } from 'react';
import {
    getDepartamentoAdmin, getHistorialDepartamento, patchDepartamentoAdmin,
} from '../../api/usuariosApi';
import { descendientesDe, valoresIguales } from '../../utils/organizacion';
import Campo, { Interruptor } from './Campo';
import ListaCambios from './ListaCambios';

const aFormulario = (d) => ({
    descripcion: d.descripcion ?? '',
    nombre_corto: d.nombre_corto ?? '',
    parent_id: d.parent_id ?? null,
    subdireccion_id: d.subdireccion_id ?? null,
    establecimiento_id: d.establecimiento_id ?? null,
    es_depto: d.es_depto === 'SI',
});

/**
 * Edita un departamento de la jerarquía (data_departamento): nombre, de quién depende,
 * subdirección, establecimiento y si es de primer nivel. Cambia la organización para TODOS
 * (PAC Cumplimiento, alcance de gestores, clasificación de formularios): por eso muestra el
 * impacto antes de guardar y deja el cambio en el historial.
 */
export default function EditorDepartamento({ deptoId, indice, establecimientos, onClose, onGuardado }) {
    const [detalle, setDetalle]       = useState(null);
    const [form, setForm]             = useState(null);
    const [historial, setHistorial]   = useState([]);
    const [errores, setErrores]       = useState({});
    const [errorGeneral, setErrorGeneral] = useState(null);
    const [guardando, setGuardando]   = useState(false);
    const [reclasificar, setReclasificar] = useState(false);
    const [resultado, setResultado]   = useState(null);

    const cargar = async () => {
        const [d, h] = await Promise.all([getDepartamentoAdmin(deptoId), getHistorialDepartamento(deptoId)]);
        setDetalle(d.data);
        setForm(aFormulario(d.data));
        setHistorial(h.data);
    };

    useEffect(() => {
        cargar().catch(err => setErrorGeneral(err.response?.data?.detail || 'No se pudo cargar el departamento.'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deptoId]);

    const excluidos = useMemo(() => {
        const s = descendientesDe(indice.filas, deptoId);
        s.add(deptoId);
        return s;
    }, [indice, deptoId]);

    const opcionesPadre = useMemo(
        () => indice.filas.filter(f => !excluidos.has(f.id)).sort((a, b) => a.ruta.localeCompare(b.ruta, 'es')),
        [indice, excluidos],
    );

    if (errorGeneral && !detalle) {
        return (
            <div className="ue-modal-overlay" onClick={onClose}>
                <div className="ue-modal" onClick={e => e.stopPropagation()}>
                    <div className="error-message">{errorGeneral}</div>
                    <div className="ue-modal-pie"><button className="btn-secondary" onClick={onClose}>Cerrar</button></div>
                </div>
            </div>
        );
    }
    if (!detalle || !form) {
        return (
            <div className="ue-modal-overlay">
                <div className="ue-modal"><div className="ue-vacio">Cargando departamento…</div></div>
            </div>
        );
    }

    const original = aFormulario(detalle);
    const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));
    const err = (campo) => {
        const v = errores?.[campo];
        return Array.isArray(v) ? v[0] : (v || null);
    };

    const elegirPadre = (valor) => {
        const id = valor ? Number(valor) : null;
        setForm(f => {
            const padre = id ? indice.porId.get(id) : null;
            // Cuelga de su padre solo si comparten subdirección y establecimiento: hereda los suyos.
            return {
                ...f,
                parent_id: id,
                subdireccion_id: padre ? padre.subdireccion_id : f.subdireccion_id,
                establecimiento_id: padre ? padre.establecimiento_id : f.establecimiento_id,
            };
        });
    };

    const cambios = {};
    ['descripcion', 'nombre_corto', 'parent_id', 'subdireccion_id', 'establecimiento_id'].forEach(c => {
        if (!valoresIguales(original[c], form[c])) cambios[c] = form[c] === '' ? null : form[c];
    });
    if (original.es_depto !== form.es_depto) cambios.es_depto = form.es_depto ? 'SI' : null;
    const hayCambios = Object.keys(cambios).length > 0;
    const cambioNombre = 'descripcion' in cambios || 'nombre_corto' in cambios;
    const impacto = detalle.impacto;

    const guardar = async () => {
        setGuardando(true);
        setErrores({});
        setErrorGeneral(null);
        try {
            const { data } = await patchDepartamentoAdmin(deptoId, {
                ...cambios, reclasificar: cambioNombre && reclasificar,
            });
            setResultado(data);
            setDetalle(data);
            setForm(aFormulario(data));
            setReclasificar(false);
            const h = await getHistorialDepartamento(deptoId);
            setHistorial(h.data);
            await onGuardado();
        } catch (err) {
            const d = err.response?.data;
            setErrores(d?.errores?.departamento || {});
            setErrorGeneral(d?.detail || 'No se pudo guardar el departamento.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="ue-modal-overlay" onClick={onClose}>
            <div className="ue-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="ue-modal-cab">
                    <div>
                        <div className="ue-modal-titulo">Jerarquía del departamento</div>
                        <small className="ue-ruta">{detalle.ruta}</small>
                    </div>
                    <button type="button" className="ue-chip-btn" onClick={onClose} aria-label="Cerrar">✕</button>
                </div>

                <div className="ue-modal-cuerpo">
                    <div className="ue-aviso ue-aviso-alerta">
                        Este cambio afecta a <strong>toda la organización</strong>, no solo a este usuario.
                        {' '}Hoy: {impacto.n_sub_departamentos} sub-departamento(s),
                        {' '}{impacto.n_usuarios_panel} persona(s) del Panel,
                        {' '}{impacto.n_usuarios_asignados} asignación(es) propia(s) y
                        {' '}{impacto.n_formularios} formulario(s) vinculados por nombre.
                    </div>

                    {errorGeneral && <div className="error-message">{errorGeneral}</div>}

                    <div className="mu-grid-2">
                        <Campo etiqueta="Nombre" error={err('descripcion')}>
                            <input type="text" value={form.descripcion} maxLength={200}
                                onChange={e => set('descripcion', e.target.value)} />
                        </Campo>
                        <Campo etiqueta="Nombre corto" error={err('nombre_corto')}>
                            <input type="text" value={form.nombre_corto} maxLength={20}
                                onChange={e => set('nombre_corto', e.target.value)} />
                        </Campo>
                    </div>

                    <Campo etiqueta="Depende de" error={err('parent_id')}>
                        <select value={form.parent_id ?? ''} onChange={e => elegirPadre(e.target.value)}>
                            <option value="">— Ninguno (primer nivel de su subdirección) —</option>
                            {opcionesPadre.map(f => <option key={f.id} value={f.id}>{f.ruta}</option>)}
                        </select>
                    </Campo>

                    <div className="mu-grid-2">
                        <Campo etiqueta="Subdirección (id)" hint="se hereda del padre"
                            error={err('subdireccion_id')}>
                            <input type="number" value={form.subdireccion_id ?? ''}
                                onChange={e => set('subdireccion_id', e.target.value === '' ? null : Number(e.target.value))} />
                        </Campo>
                        <Campo etiqueta="Establecimiento"
                            error={err('establecimiento_id')}>
                            <select value={form.establecimiento_id ?? ''}
                                onChange={e => set('establecimiento_id', e.target.value ? Number(e.target.value) : null)}>
                                <option value="">— Sin asignar —</option>
                                {establecimientos.map(est => (
                                    <option key={est.id} value={est.id}>{est.nombre_corto || est.descripcion}</option>
                                ))}
                            </select>
                        </Campo>
                    </div>

                    <Interruptor activo={form.es_depto} onChange={v => set('es_depto', v)}>
                        <strong>Departamento de primer nivel</strong>
                        <span className="mu-hint"> — si está marcado, no cuelga de otro aunque tenga padre</span>
                    </Interruptor>

                    {cambioNombre && (
                        <div className="ue-aviso ue-aviso-alerta">
                            Los formularios se vinculan a un departamento <strong>por su nombre</strong>.
                            Hoy {impacto.n_formularios} formulario(s) calzan con el nombre actual
                            {impacto.unidades_formularios?.length
                                ? ` («${impacto.unidades_formularios.join('», «')}»)` : ''}.
                            Si cambia el nombre, quedarán «Sin Clasificar» hasta la próxima sincronización.
                            <label className="ue-check">
                                <input type="checkbox" checked={reclasificar}
                                    onChange={e => setReclasificar(e.target.checked)} />
                                Reclasificar los formularios ahora (Dentro/Fuera PAC y departamento)
                            </label>
                        </div>
                    )}

                    {resultado && (
                        <div className="ue-aviso ue-aviso-ok">
                            Guardado.
                            {resultado.reclasificacion
                                ? ` Formularios reclasificados: ${resultado.reclasificacion.actualizados} actualizado(s).`
                                : ''}
                        </div>
                    )}

                    <div className="mu-section-label" style={{ marginTop: 18 }}>Cambios anteriores</div>
                    <ListaCambios items={historial} vacio="Este departamento no se ha editado desde aquí." />
                </div>

                <div className="ue-modal-pie">
                    <button type="button" className="btn-secondary" onClick={onClose} disabled={guardando}>Cerrar</button>
                    <button type="button" className="btn-primary" onClick={guardar}
                        disabled={guardando || !hayCambios}>
                        {guardando ? 'Guardando…' : '💾 Guardar jerarquía'}
                    </button>
                </div>
            </div>
        </div>
    );
}
