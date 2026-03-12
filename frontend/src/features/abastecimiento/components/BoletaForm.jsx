/**
 * @file features/abastecimiento/components/BoletaForm.jsx
 * @description Formulario de registro / edición de Boletas de Garantía.
 *
 * Campos (18) según Formulario del Excel:
 *  MES/AÑO · Tipo de Documento · Formato Documento · N° Docto. ·
 *  Fecha Emisión · Monto · Rut Proveedor · Banco · ID Licitación ·
 *  Nombre Licitación · Comprador · Vigencia de Garantía ·
 *  Fecha Derivación a Abastecimiento · Depto Finanzas ·
 *  N° Memo · Fecha Despacho a Finanzas · Adjuntar Archivo
 */
import React, { useEffect, useRef, useState } from 'react';

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

const ALLOWED_EXTENSIONS = '.xlsx,.xls,.doc,.docx,.rar';

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
};

export function BoletaForm({ proveedores, compradores, initial, onSubmit, onCancel, saving, error }) {
    const [form, setForm] = useState(EMPTY_FORM);
    const [adjunto, setAdjunto] = useState(null);
    const fileRef = useRef();

    // Cargar datos iniciales cuando se edita una boleta
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

    const handleFileChange = (e) => {
        setAdjunto(e.target.files[0] ?? null);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const fd = new FormData();
        Object.entries(form).forEach(([key, val]) => {
            if (val !== '' && val !== null && val !== undefined) {
                fd.append(key, val);
            }
        });
        if (adjunto) fd.append('adjunto', adjunto);
        onSubmit(fd);
    };

    const Field = ({ label, required, children }) => (
        <div className="boleta-field">
            <label className={`boleta-label${required ? ' required' : ''}`}>{label}</label>
            {children}
        </div>
    );

    return (
        <form className="boleta-form" onSubmit={handleSubmit} noValidate>
            {error && <div className="boleta-error">{error}</div>}

            <div className="boleta-form-grid">
                {/* Fila 1 */}
                <Field label="Mes / Año" required>
                    <input
                        type="month"
                        name="mes_anio"
                        value={form.mes_anio}
                        onChange={handleChange}
                        required
                        className="boleta-input"
                    />
                </Field>

                <Field label="Tipo de Documento" required>
                    <select
                        name="tipo_documento"
                        value={form.tipo_documento}
                        onChange={handleChange}
                        required
                        className="boleta-input"
                    >
                        <option value="">— Seleccione —</option>
                        {TIPO_DOC_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </Field>

                <Field label="Formato Documento" required>
                    <select
                        name="formato_documento"
                        value={form.formato_documento}
                        onChange={handleChange}
                        required
                        className="boleta-input"
                    >
                        <option value="">— Seleccione —</option>
                        {FORMATO_DOC_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </Field>

                <Field label="N° Documento" required>
                    <input
                        type="text"
                        name="numero_documento"
                        value={form.numero_documento}
                        onChange={handleChange}
                        required
                        maxLength={100}
                        className="boleta-input"
                    />
                </Field>

                {/* Fila 2 */}
                <Field label="Fecha Emisión" required>
                    <input
                        type="date"
                        name="fecha_emision"
                        value={form.fecha_emision}
                        onChange={handleChange}
                        required
                        className="boleta-input"
                    />
                </Field>

                <Field label="Monto ($)" required>
                    <input
                        type="number"
                        name="monto"
                        value={form.monto}
                        onChange={handleChange}
                        required
                        min="0"
                        step="1"
                        className="boleta-input"
                    />
                </Field>

                <Field label="Proveedor" required>
                    <select
                        name="proveedor"
                        value={form.proveedor}
                        onChange={handleChange}
                        required
                        className="boleta-input"
                    >
                        <option value="">— Seleccione —</option>
                        {proveedores.map((p) => (
                            <option key={p.rut} value={p.rut}>{p.nombre}</option>
                        ))}
                    </select>
                </Field>

                <Field label="Banco" required>
                    <select
                        name="banco"
                        value={form.banco}
                        onChange={handleChange}
                        required
                        className="boleta-input"
                    >
                        <option value="">— Seleccione —</option>
                        {BANCO_OPTIONS.map((b) => (
                            <option key={b} value={b}>{b}</option>
                        ))}
                    </select>
                </Field>

                {/* Fila 3 */}
                <Field label="ID Licitación">
                    <input
                        type="text"
                        name="id_licitacion"
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
                        value={form.nombre_licitacion}
                        onChange={handleChange}
                        className="boleta-input"
                    />
                </Field>

                <Field label="Comprador" required>
                    <select
                        name="comprador"
                        value={form.comprador}
                        onChange={handleChange}
                        required
                        className="boleta-input"
                    >
                        <option value="">— Seleccione —</option>
                        {compradores.map((c) => (
                            <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                    </select>
                </Field>

                <Field label="Vigencia de Garantía" required>
                    <input
                        type="date"
                        name="vigencia_garantia"
                        value={form.vigencia_garantia}
                        onChange={handleChange}
                        required
                        className="boleta-input"
                    />
                </Field>

                {/* Fila 4 */}
                <Field label="Fecha Derivación a Abastecimiento">
                    <input
                        type="date"
                        name="fecha_derivacion_abastecimiento"
                        value={form.fecha_derivacion_abastecimiento}
                        onChange={handleChange}
                        className="boleta-input"
                    />
                </Field>

                <Field label="Depto. Finanzas (Fecha)">
                    <input
                        type="date"
                        name="depto_finanzas"
                        value={form.depto_finanzas}
                        onChange={handleChange}
                        className="boleta-input"
                    />
                </Field>

                <Field label="N° Memo Depto. Abast. y Op.">
                    <input
                        type="text"
                        name="numero_memo"
                        value={form.numero_memo}
                        onChange={handleChange}
                        maxLength={100}
                        className="boleta-input"
                    />
                </Field>

                <Field label="Fecha Despacho a Finanzas">
                    <input
                        type="date"
                        name="fecha_despacho_finanzas"
                        value={form.fecha_despacho_finanzas}
                        onChange={handleChange}
                        className="boleta-input"
                    />
                </Field>

                {/* Adjunto — ocupa columna completa */}
                <Field label={`Adjuntar Archivo (${ALLOWED_EXTENSIONS})`}>
                    <div className="boleta-file-wrapper">
                        <input
                            ref={fileRef}
                            type="file"
                            accept={ALLOWED_EXTENSIONS}
                            onChange={handleFileChange}
                            className="boleta-file-input"
                            id="adjunto-file"
                        />
                        <label htmlFor="adjunto-file" className="boleta-file-label">
                            {adjunto ? adjunto.name : (initial?.adjunto_url ? '📎 Archivo existente (seleccionar para reemplazar)' : '📂 Seleccionar archivo...')}
                        </label>
                        {initial?.adjunto_url && !adjunto && (
                            <a
                                href={initial.adjunto_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="boleta-file-link"
                            >
                                Ver adjunto actual
                            </a>
                        )}
                    </div>
                </Field>
            </div>

            <div className="boleta-form-actions">
                <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={saving}>
                    Cancelar
                </button>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                    {saving ? 'Guardando...' : (initial ? 'Actualizar Boleta' : 'Registrar Boleta')}
                </button>
            </div>
        </form>
    );
}
