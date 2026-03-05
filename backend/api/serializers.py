from rest_framework import serializers
from .models import Licitacion, DetalleLicitacion

class DetalleLicitacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DetalleLicitacion
        fields = '__all__'

class LicitacionSerializer(serializers.ModelSerializer):
    detalles = DetalleLicitacionSerializer(many=True, read_only=True)
    
    class Meta:
        model = Licitacion
        fields = '__all__'
