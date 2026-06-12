from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.http import FileResponse
from django.views.static import serve as static_serve

from api import urls as api_urls


def react_spa(request, path=''):
    """Serve React SPA — static assets by name, index.html for all routes."""
    if path:
        full = settings.FRONTEND_DIST / path
        if full.is_file():
            return static_serve(request, path, document_root=str(settings.FRONTEND_DIST))
    idx = settings.FRONTEND_DIST / 'index.html'
    return FileResponse(open(idx, 'rb'), content_type='text/html')


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(api_urls)),
    re_path(r'^gestion-sso/(?P<path>.*)$', react_spa),
    # Media files (boletas, adjuntos) — siempre activo, incluso DEBUG=False
    re_path(r'^media/(?P<path>.*)$', static_serve, {'document_root': settings.MEDIA_ROOT}),
]
