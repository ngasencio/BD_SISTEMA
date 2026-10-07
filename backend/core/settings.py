"""
Django settings for BD_SISTEMA.

Variables de entorno cargadas desde el entorno del proceso (os.environ).
Si no están definidas, se usan los fallbacks (solo para desarrollo local).
"""

import datetime
from pathlib import Path
from decouple import config, Csv

BASE_DIR = Path(__file__).resolve().parent.parent

# ─── Seguridad ────────────────────────────────────────────────────────────────

SECRET_KEY = config(
    'SECRET_KEY',
    default='django-insecure-8&xd20=%g82njyyx0qyh!4&cxhb&drk7wbnxyqb)(bv8fr#&wr',
)
DEBUG = config('DEBUG', default=True, cast=bool)
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='*', cast=Csv())

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ─── Apps ─────────────────────────────────────────────────────────────────────

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'django_filters',
    'api',
]

MIDDLEWARE = [
    'django.middleware.gzip.GZipMiddleware',  # Comprime respuestas grandes (ej. reporte SIGFE, ~20MB sin comprimir)
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'

# ─── Base de datos ────────────────────────────────────────────────────────────

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME':     config('DB_NAME',     default='bd_sistema'),
        'USER':     config('DB_USER',     default='root'),
        'PASSWORD': config('DB_PASSWORD', default='Nicolas2017#'),
        'HOST':     config('DB_HOST',     default='127.0.0.1'),
        'PORT':     config('DB_PORT',     default='3306'),
        'CONN_MAX_AGE': 60,
        'OPTIONS': {
            'charset': 'utf8mb4',
            'connect_timeout': 10,
        },
    }
}

# ─── Auth ─────────────────────────────────────────────────────────────────────

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ─── Internacionalización ─────────────────────────────────────────────────────

LANGUAGE_CODE = 'es-cl'
TIME_ZONE = 'America/Santiago'
USE_I18N = True
USE_TZ = True

# ─── Archivos estáticos y media ───────────────────────────────────────────────

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Frontend React build (servido por Django)
FRONTEND_DIST = BASE_DIR.parent / 'frontend' / 'dist'

# WhiteNoise — compresión gzip para archivos estáticos del admin
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}

# ─── CORS ─────────────────────────────────────────────────────────────────────
# En desarrollo local se permite todo.
# En producción, definir CORS_ALLOWED_ORIGINS en .env y poner CORS_ALLOW_ALL=False.

CORS_ALLOW_ALL_ORIGINS = DEBUG  # True en desarrollo, False en producción (DEBUG=False)
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000,http://localhost:5173',
    cast=Csv(),
)

# ─── Django REST Framework ────────────────────────────────────────────────────

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
}

# ─── JWT ──────────────────────────────────────────────────────────────────────

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':  datetime.timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': datetime.timedelta(days=7),
}

# ─── Correo — módulo Gestor de Compras > Notificación ─────────────────────────
# Credenciales SOLO en .env (nunca en código). Sin EMAIL_HOST_PASSWORD el envío falla
# con un error claro en vez de intentar conectarse.

EMAIL_BACKEND = config('EMAIL_BACKEND', default='django.core.mail.backends.smtp.EmailBackend')
EMAIL_HOST = config('EMAIL_HOST', default='smtp.office365.com')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')
EMAIL_TIMEOUT = 30
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL', default=EMAIL_HOST_USER)

# Quién puede abrir/usar la pestaña "Notificación" (correos masivos a funcionarios).
# Se valida en el servidor por correo del usuario, no por rol: un admin cualquiera NO pasa.
NOTIF_PLAN_USUARIOS = [e.lower() for e in config(
    'NOTIF_PLAN_USUARIOS', default='nicolas.asencio@redsalud.gob.cl', cast=Csv())]
# MODO PRUEBA (por defecto ACTIVO): todo correo va SOLO a NOTIF_PLAN_DESTINO_PRUEBA, sin CC.
# Desactivarlo es una decisión explícita (NOTIF_PLAN_MODO_PRUEBA=False en .env).
NOTIF_PLAN_MODO_PRUEBA = config('NOTIF_PLAN_MODO_PRUEBA', default=True, cast=bool)
NOTIF_PLAN_DESTINO_PRUEBA = config('NOTIF_PLAN_DESTINO_PRUEBA', default='nicolas.asencio@redsalud.gob.cl')
# Copia a las jefaturas del departamento de cada responsable (apagado hasta el visto bueno).
NOTIF_PLAN_CC_JEFATURAS = config('NOTIF_PLAN_CC_JEFATURAS', default=False, cast=bool)
# Copia fija a las jefaturas de Abastecimiento y destinatarias del PDF de cierre (apagado idem).
NOTIF_PLAN_RESUMEN_CC = config('NOTIF_PLAN_RESUMEN_CC', default='', cast=Csv())
# Destinatarios (Para) del correo resumen con el PDF, además de quien envía (sin duplicar).
NOTIF_PLAN_RESUMEN_PARA = config('NOTIF_PLAN_RESUMEN_PARA', default='', cast=Csv())
# Tope de responsables por lote (anti-spam / error de selección masiva).
NOTIF_PLAN_MAX_LOTE = config('NOTIF_PLAN_MAX_LOTE', default=50, cast=int)
# Pausa entre correos de un lote (Office 365 limita ~30 mensajes por minuto por buzón).
NOTIF_PLAN_PAUSA_SEG = config('NOTIF_PLAN_PAUSA_SEG', default=2, cast=int)
NOTIF_PLAN_URL_PANEL = 'https://panel.ssosorno.cl/panel_documental/login.php'

# ─── Cache ────────────────────────────────────────────────────────────────────
# LocMemCache: volátil (se pierde al reiniciar). No compartido entre workers.
# Migrar a Redis cuando el tiempo de recalculo supere 10s en producción.

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'bd-sistema-cache',
    }
}
