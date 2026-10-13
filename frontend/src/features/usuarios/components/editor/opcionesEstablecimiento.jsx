/**
 * <option>s de establecimiento. El valor guardado es el CÓDIGO del Panel (197-203), que es lo que
 * trae `data_usuario_panel` y casi todos los perfiles. Si el valor actual no coincide con ningún
 * código (cuentas antiguas guardaron el id 1-7), se agrega como opción propia para que el selector
 * muestre lo que realmente hay guardado en vez de «Sin asignar».
 */
export function opcionesEstablecimiento(establecimientos, valorActual) {
    const codigos = new Set(establecimientos.map(e => e.codigo));
    const huerfano = valorActual !== null && valorActual !== undefined && valorActual !== ''
        && !codigos.has(Number(valorActual));
    return [
        ...establecimientos.map(est => (
            <option key={est.codigo} value={est.codigo}>{est.nombre_corto || est.descripcion}</option>
        )),
        huerfano ? <option key="huerfano" value={valorActual}>#{valorActual} (valor antiguo)</option> : null,
    ];
}
