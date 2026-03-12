/**
 * @file features/abastecimiento/components/BoletaForm.jsx
 * @description Formulario de registro y edición de Boletas de Garantía.
 */
import React, { useEffect, useRef, useState } from 'react';
import './BoletaForm.css';

const BANCO_OPTIONS = [
    'Banco de Chile', 'Santander-Chile', 'BCI', 'Scotiabank',
    'Itau', 'BICE', 'Falabella', 'Ripley', 'Consorcio', 'BTG Pactual',
];

const TIPO_DOC_OPTIONS = [
    { value: 'Boleta De Garantia', label: 'Boleta De Garantía' },
    { value: 'Certificado De Fianza', label: 'Certificado De Fianza' },
    { value: 'Poliza De Seguro', label: 'Póliza De Seguro' },
];

const FORMATO_DOC_OPTIONS = [
    { value: 'Fisica', label: 'Física' },
    { value: 'Electronica', label: 'Electrónica' },
];

const ESTADO_TRAZABILIDAD_OPTIONS = [
    { value: 'En Abastecimiento', label: 'En Abastecimiento' },
    { value: 'En Finanzas', label: 'En Finanzas' },
    { value: 'Apagado', label: 'Apagado' },
];

const ALLOWED_EXTENSIONS = '.xlsx,.xls,.doc,.docx,.rar,.pdf';

const EMPTY_FORM = {
    mes_anio: '',
    tipo_documento: '',
    formato_documento: '',
    numero_documento: '',
    fecha_emision: '',
    monto: '',
    proveedor: '',
    banco: '',
    id_licitacion: '',
    nombre_licitacion: '',
    comprador: '',
    vigencia_garantia: '',
    fecha_derivacion_abastecimiento: '',
    depto_finanzas: '',
    numero_memo: '',
    fecha_despacho_finanzas: '',
    estado_trazabilidad: '',
};

/* ── Field helper (FUERA del componente para evitar re-montaje en cada render) ── */
function Field({ label, required, children }) {
    return (
        <div className="boleta-field">
            <label className="boleta-label">
                {label} {required && <span className="text-danger">*</span>}
            </label>
            {children}
        </div>
    );
}

/* ── Buscador de Proveedor ── */
function ProveedorSearch({ proveedores, value, onChange }) {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef(null);

    const selected = proveedores.find((p) => p.rut === value);

    const filtered = proveedores.filter((p) => {
        const q = query.toLowerCase();
        return p.nombre.toLowerCase().includes(q) || p.rut.toLowerCase().includes(q);
    });

    // Cerrar al hacer clic fuera
    useEffect(() => {
        function handleClick(e) {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setOpen(false);
                setQuery('');
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleInputChange = (e) => {
        setQuery(e.target.value);
        setOpen(true);
        if (e.target.value === '') onChange('');
    };

    const handleSelect = (rut) => {
        onChange(rut);
        setQuery('');
        setOpen(false);
    };

    const displayValue = open ? query : (selected ? `${selected.nombre}  (${selected.rut})` : query);

    return (
        <div className="proveedor-search-wrapper" ref={wrapperRef}>
            <input
                type="text"
                className="boleta-input"
                placeholder="Buscar por nombre o RUT..."
                value={displayValue}
                onChange={handleInputChange}
                onFocus={() => { setQuery(''); setOpen(true); }}
                autoComplete="off"
            />
            {open && (
                <div className="proveedor-dropdown">
                    {filtered.length === 0 ? (
                        <div className="proveedor-option proveedor-no-results">Sin resultados</div>
                    ) : filtered.map((p) => (
                        <div
                            key={p.rut}
                            className={`proveedor-option${value === p.rut ? ' proveedor-option--selected' : ''}`}
                            onMouseDown={(e) => { e.preventDefault(); handleSelect(p.rut); }}
                        >
                            <span className="proveedor-nombre">{p.nombre}</span>
                            <span className="proveedor-rut">{p.rut}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function BoletaForm({ proveedores, compradores, initial, onSubmit, onCancel, saving, error }) {
    const [form, setForm] = useState(EMPTY_FORM);
    const [adjunto, setAdjunto] = useState(null);
    const fileRef = useRef();

    // Sincronizar con datos iniciales (edición)
    useEffect(() => {
        if (initial) {
            setForm({
                mes_anio: initial.mes_anio ?? '',
                tipo_documento: initial.tipo_documento ?? '',
                formato_documento: initial.formato_documento ?? '',
                numero_documento: initial.numero_documento ?? '',
                fecha_emision: initial.fecha_emision ?? '',
                monto: initial.monto ?? '',
                proveedor: initial.proveedor ?? '',
                banco: initial.banco ?? '',
                id_licitacion: initial.id_licitacion ?? '',
                nombre_licitacion: initial.nombre_licitacion ?? '',
                comprador: initial.comprador ?? '',
                vigencia_garantia: initial.vigencia_garantia ?? '',
                fecha_derivacion_abastecimiento: initial.fecha_derivacion_abastecimiento ?? '',
                depto_finanzas: initial.depto_finanzas ?? '',
                numero_memo: initial.numero_memo ?? '',
                fecha_despacho_finanzas: initial.fecha_despacho_finanzas ?? '',
                estado_trazabilidad: initial.estado_trazabilidad ?? '',
            });
        } else {
            setForm(EMPTY_FORM);
            setAdjunto(null);
        }
    }, [initial]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    const handleProveedorChange = (rut) => {
        setForm((prev) => ({ ...prev, proveedor: rut }));
    };

    const handleFileChange = (e) => {
        setAdjunto(e.target.files[0] ?? null);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const fd = new FormData();

        // Campos que son obligatorios (para no enviar strings vacíos si por alguna razón el HTML5 validation falla)
        const requiredFields = [
            'mes_anio', 'tipo_documento', 'formato_documento', 'numero_documento',
            'fecha_emision', 'vigencia_garantia', 'monto', 'banco', 'proveedor', 'comprador'
        ];

        Object.entries(form).forEach(([key, val]) => {
            // Si es un campo obligatorio y está vacío, no lo enviamos (el navegador debería bloquearlo de todos modos)
            // Si es opcional (como los de trazabilidad), enviamos el valor tal cual (incluso si es '') 
            // para que el backend pueda "limpiar" el campo si el usuario borra la fecha.
            if (requiredFields.includes(key)) {
                if (val !== '' && val !== null && val !== undefined) {
                    fd.append(key, val);
                }
            } else {
                // Campos opcionales: enviamos siempre (si val es '', el backend lo toma como null/vacío)
                fd.append(key, val ?? '');
            }
        });

        if (adjunto) fd.append('adjunto', adjunto);
        onSubmit(fd);
    };

    return (
        <form className="boleta-form-container" onSubmit={handleSubmit} noValidate>
            {error && (
                <div className="boleta-alert boleta-alert-error">
                    <span>⚠️</span>
                    {error}
                </div>
            )}

            {/* SECCIÓN 1: Datos del Documento */}
            <fieldset className="boleta-section">
                <legend>
                    <span className="legend-icon">📄</span>
                    1. Datos del Documento de Garantía
                </legend>
                <div className="boleta-grid-3">
                    <Field label="Mes / Año" required>
                        <input type="month" name="mes_anio" value={form.mes_anio} onChange={handleChange} required className="boleta-input" />
                    </Field>
                    <Field label="Tipo de Documento" required>
                        <select name="tipo_documento" value={form.tipo_documento} onChange={handleChange} required className="boleta-input">
                            <option value="">— Seleccione —</option>
                            {TIPO_DOC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </Field>
                    <Field label="Formato Documento" required>
                        <select name="formato_documento" value={form.formato_documento} onChange={handleChange} required className="boleta-input">
                            <option value="">— Seleccione —</option>
                            {FORMATO_DOC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </Field>
                    <Field label="N° Documento" required>
                        <input type="text" name="numero_documento" placeholder="Ej: 123456" value={form.numero_documento} onChange={handleChange} required maxLength={100} className="boleta-input" />
                    </Field>
                    <Field label="Fecha Emisión" required>
                        <input type="date" name="fecha_emision" value={form.fecha_emision} onChange={handleChange} required className="boleta-input" />
                    </Field>
                    <Field label="Vigencia de Garantía" required>
                        <input type="date" name="vigencia_garantia" value={form.vigencia_garantia} onChange={handleChange} required className="boleta-input" />
                    </Field>
                    <Field label="Monto ($)" required>
                        <input type="number" name="monto" value={form.monto} onChange={handleChange} required min="0" step="1" className="boleta-input" placeholder="Ej: 7700000" />
                    </Field>
                    <Field label="Banco" required>
                        <select name="banco" value={form.banco} onChange={handleChange} required className="boleta-input">
                            <option value="">— Seleccione —</option>
                            {BANCO_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </Field>
                </div>
            </fieldset>

            {/* SECCIÓN 2: Licitación y Proveedor */}
            <fieldset className="boleta-section">
                <legend>
                    <span className="legend-icon">🤝</span>
                    2. Información de Licitación y Proveedor
                </legend>
                <div className="boleta-grid-2">
                    <Field label="Proveedor" required>
                        <ProveedorSearch
                            proveedores={proveedores}
                            value={form.proveedor}
                            onChange={handleProveedorChange}
                        />
                    </Field>
                    <Field label="Comprador" required>
                        <select name="comprador" value={form.comprador} onChange={handleChange} required className="boleta-input">
                            <option value="">— Seleccione —</option>
                            {compradores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                    </Field>
                    <Field label="ID Licitación">
                        <input
                            type="text"
                            name="id_licitacion"
                            placeholder="Ej: 1234-56-LP24"
                            value={form.id_licitacion}
                            onChange={handleChange}
                            maxLength={100}
                            className="boleta-input"
                        />
                    </Field>
                    <Field label="Nombre Licitación">
                        <input
                            type="text"
                            name="nombre_licitacion"
                            placeholder="Nombre descriptivo de la licitación"
                            value={form.nombre_licitacion}
                            onChange={handleChange}
                            className="boleta-input"
                        />
                    </Field>
                </div>
            </fieldset>

            {/* SECCIÓN 3: Trazabilidad Interna */}
            <fieldset className="boleta-section">
                <legend>
                    <span className="legend-icon">⏱️</span>
                    3. Trazabilidad Interna
                </legend>
                <div className="boleta-grid-2" style={{ marginBottom: '16px' }}>
                    <Field label="Estado del Documento">
                        <select name="estado_trazabilidad" value={form.estado_trazabilidad} onChange={handleChange} className="boleta-input">
                            <option value="">— Seleccione estado —</option>
                            {ESTADO_TRAZABILIDAD_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </Field>
                </div>
                <div className="boleta-grid-4">
                    <Field label="Derivación Abast.">
                        <input type="date" name="fecha_derivacion_abastecimiento" value={form.fecha_derivacion_abastecimiento} onChange={handleChange} className="boleta-input" />
                    </Field>
                    <Field label="Recepción Finanzas">
                        <input type="date" name="depto_finanzas" value={form.depto_finanzas} onChange={handleChange} className="boleta-input" />
                    </Field>
                    <Field label="N° Memo Abast.">
                        <input
                            type="text"
                            name="numero_memo"
                            placeholder="N° de Memo"
                            value={form.numero_memo}
                            onChange={handleChange}
                            maxLength={100}
                            className="boleta-input"
                        />
                    </Field>
                    <Field label="Despacho Finanzas">
                        <input type="date" name="fecha_despacho_finanzas" value={form.fecha_despacho_finanzas} onChange={handleChange} className="boleta-input" />
                    </Field>
                </div>
            </fieldset>

            {/* SECCIÓN 4: Archivo Adjunto */}
            <fieldset className="boleta-section file-section">
                <legend>
                    <span className="legend-icon">📂</span>
                    4. Respaldo Digital
                </legend>
                <div className="file-upload-wrapper">
                    <Field label={`Certificado o Documento Escaneado (${ALLOWED_EXTENSIONS})`}>
                        <input ref={fileRef} type="file" accept={ALLOWED_EXTENSIONS} onChange={handleFileChange} className="boleta-file-input" id="adjunto-file" />
                        <label htmlFor="adjunto-file" className="boleta-btn-outline">
                            <span style={{ fontSize: '20px' }}>{adjunto ? '✅' : '📤'}</span>
                            {adjunto ? (
                                <strong>{adjunto.name}</strong>
                            ) : (
                                'Seleccionar archivo del equipo...'
                            )}
                        </label>
                        {initial?.adjunto_url && !adjunto && (
                            <div className="file-current-status" style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>📌 Documento cargado:</span>
                                <a href={initial.adjunto_url} target="_blank" rel="noopener noreferrer">
                                    Ver archivo actual
                                </a>
                            </div>
                        )}
                    </Field>
                </div>
            </fieldset>

            {/* ACCIONES */}
            <div className="boleta-form-actions">
                <button type="button" className="btn-cancel" onClick={onCancel} disabled={saving}>
                    Cancelar
                </button>
                <button type="submit" className="btn-submit" disabled={saving}>
                    {saving ? (
                        <>
                            <span className="spinner-small"></span>
                            Procesando...
                        </>
                    ) : (
                        <>{initial ? '💾 Actualizar Registro' : '✅ Guardar Boleta'}</>
                    )}
                </button>
            </div>
        </form>
    );
}
