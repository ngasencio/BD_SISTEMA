from rest_framework import serializers
from .models import Licitacion, DetalleLicitacion, Devengo, OrdenCompra, DetalleOrdenCompra

class DetalleLicitacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DetalleLicitacion
        fields = '__all__'

class LicitacionSerializer(serializers.ModelSerializer):
    detalles = DetalleLicitacionSerializer(many=True, read_only=True)
    
    class Meta:
        model = Licitacion
        fields = '__all__'


class DevengoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Devengo
        fields = '__all__'


class DetalleOrdenCompraSerializer(serializers.ModelSerializer):
    class Meta:
        model = DetalleOrdenCompra
        fields = '__all__'

class OrdenCompraSerializer(serializers.ModelSerializer):
    detalles = DetalleOrdenCompraSerializer(many=True, read_only=True)
    
    class Meta:
        model = OrdenCompra
        fields = '__all__'
