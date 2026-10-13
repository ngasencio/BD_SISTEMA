
/** Etiqueta + control + mensaje de error del servidor, con el estilo `.mu-field` del módulo. */
export default function Campo({ etiqueta, hint, error, children }) {
    return (
        <label className={`form-field mu-field ${error ? 'ue-campo-error' : ''}`}>
            <span>
                {etiqueta}
                {hint ? <span className="mu-hint">{hint}</span> : null}
            </span>
            {children}
            {error ? <small className="ue-error-texto">{error}</small> : null}
        </label>
    );
}

/** Interruptor accesible con el mismo aspecto que el de la tabla de usuarios. */
export function Interruptor({ activo, onChange, deshabilitado = false, children }) {
    const alternar = () => { if (!deshabilitado) onChange(!activo); };
    return (
        <div className="mu-toggle-row">
            <div className="mu-toggle-label">
                <div
                    className={`mu-toggle ${activo ? 'mu-toggle-on' : ''} ${deshabilitado ? 'mu-toggle-disabled' : ''}`}
                    onClick={alternar}
                    role="switch"
                    aria-checked={activo}
                    aria-disabled={deshabilitado}
                    tabIndex={deshabilitado ? -1 : 0}
                    onKeyDown={e => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), alternar())}
                >
                    <div className="mu-toggle-thumb" />
                </div>
                <span>{children}</span>
            </div>
        </div>
    );
}
