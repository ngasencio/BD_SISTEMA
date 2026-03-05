from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LicitacionViewSet, DetalleLicitacionViewSet, dashboard_stats
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

router = DefaultRouter()
router.register(r'licitaciones', LicitacionViewSet)
router.register(r'detalles', DetalleLicitacionViewSet)

urlpatterns = [
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('dashboard/stats/', dashboard_stats, name='dashboard_stats'),
    path('', include(router.urls)),
]
