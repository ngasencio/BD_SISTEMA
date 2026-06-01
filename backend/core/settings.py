"""
Django settings for BD_SISTEMA.

Variables de entorno cargadas desde el entorno del proceso (os.environ).
Si no están definidas, se usan los fallbacks (solo para desarrollo local).
"""

import datetime
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

def _env(key, default=None):
    return os.environ.get(key, default)

def _env_bool(key, default=False):
    val = os.environ.get(key)
    if val is None:
        return default
    return val.lower() in ('true', '1', 'yes')

def _env_list(key, default=''):
    raw = os.environ.get(key, default)
    return [v.strip() for v in raw.split(',') if v.strip()]

# ─── Seguridad ────────────────────────────────────────────────────────────────

SECRET_KEY = _env(
    'SECRET_KEY',
    default='django-insecure-8&xd20=%g82njyyx0qyh!4&cxhb&drk7wbnxyqb)(bv8fr#&wr',
)
DEBUG = _env_bool('DEBUG', default=True)
ALLOWED_HOSTS = _env_list('ALLOWED_HOSTS', default='*')

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
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
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
        'NAME':     _env('DB_NAME',     'bd_sistema'),
        'USER':     _env('DB_USER',     'root'),
        'PASSWORD': _env('DB_PASSWORD', 'Nicolas2017#'),
        'HOST':     _env('DB_HOST',     '127.0.0.1'),
        'PORT':     _env('DB_PORT',     '3306'),
        'OPTIONS': {
            'charset': 'utf8mb4',
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

STATIC_URL = 'static/'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Frontend React build (servido por Django en desarrollo)
FRONTEND_DIST = BASE_DIR.parent / 'frontend' / 'dist'

# ─── CORS ─────────────────────────────────────────────────────────────────────
# En desarrollo local se permite todo.
# En producción, definir CORS_ALLOWED_ORIGINS en .env y poner CORS_ALLOW_ALL=False.

CORS_ALLOW_ALL_ORIGINS = DEBUG  # True en desarrollo, False en producción (DEBUG=False)
CORS_ALLOWED_ORIGINS = _env_list(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000,http://localhost:5173',
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

# ─── Cache ────────────────────────────────────────────────────────────────────
# LocMemCache: volátil (se pierde al reiniciar). No compartido entre workers.
# Migrar a Redis cuando el tiempo de recalculo supere 10s en producción.

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'bd-sistema-cache',
    }
}
