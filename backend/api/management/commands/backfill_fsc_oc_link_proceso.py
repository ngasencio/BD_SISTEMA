"""
Management command: backfill_fsc_oc_link_proceso

Unifica retroactivamente los dos sistemas de enlace FSC<->OC que hoy conviven
sin comunicarse: ProcesoCompra (Mis Formularios, enlace 100% manual del
comprador) y FscOcLink (/fsc-oc-pac, matching automatico + revision humana).

Antes de este comando, services.agregar_oc_a_proceso()/agregar_formulario_a_proceso()
ya sincronizan hacia adelante (ver _confirmar_fsc_oc_desde_proceso en services.py)
cada vez que un comprador vincula FSC<->OC desde Mis Formularios. Este comando
hace lo mismo pero hacia atras, recorriendo TODOS los ProcesoCompraFormulario x
ProcesoCompraOrdenCompra ya existentes (combinacion FSC x OC por cada proceso)
y creando/confirmando el FscOcLink correspondiente si falta.

Idempotente -- seguro de correr mas de una vez (usa la misma funcion que el
hook en vivo, que ya no pisa un link ya CONFIRMADO).

Uso:
    python manage.py backfill_fsc_oc_link_proceso
    python manage.py backfill_fsc_oc_link_proceso --dry-run
"""
from django.core.management.base import BaseCommand

from api.models import ProcesoCompra


class Command(BaseCommand):
    help = 'Backfill: crea/confirma FscOcLink para cada par FSC<->OC ya vinculado via ProcesoCompra'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Solo cuenta, no escribe nada.')

    def handle(self, *args, **options):
        from api.services import _confirmar_fsc_oc_desde_proceso

        dry_run = options['dry_run']

        procesos = ProcesoCompra.objects.prefetch_related('vinculos_formulario', 'vinculos_oc')
        pares_totales = 0
        pares_creados_o_confirmados = 0

        for proceso in procesos.iterator(chunk_size=200):
            # OJO: .all() a proposito, NO .values_list(...) -- .values_list()
            # clona el queryset del related manager y dispara una query
            # nueva, IGNORANDO el prefetch_related de arriba (el mismo gotcha
            # que calcular_estado_pac_proceso_oc tenia en los serializers).
            formulario_ids = [v.formulario_derivado_id for v in proceso.vinculos_formulario.all()]
            codigos_oc = [v.orden_compra_id for v in proceso.vinculos_oc.all()]
            if not formulario_ids or not codigos_oc:
                continue
            for formulario_id in formulario_ids:
                for codigo_oc in codigos_oc:
                    pares_totales += 1
                    if dry_run:
                        continue
                    # revisado_por=None a proposito -- esto es un backfill
                    # automatico, no una revision humana; atribuirselo a un
                    # superusuario cualquiera ensuciaria el audit trail.
                    link = _confirmar_fsc_oc_desde_proceso(formulario_id, codigo_oc, None)
                    if link:
                        pares_creados_o_confirmados += 1

        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'[dry-run] {pares_totales} pares FSC x OC detectados via ProcesoCompra (nada escrito).'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'Backfill completo: {pares_totales} pares FSC x OC revisados, '
                f'{pares_creados_o_confirmados} FscOcLink creados/confirmados o ya al dia.'
            ))
