# Autenticación JWT
- **Cluster:** Backend API (Django REST)
- **Tipo:** módulo
- **Ubicación:** backend/core/settings.py (SIMPLE_JWT), backend/api/models.py (PerfilUsuario)
- **Tecnología:** djangorestframework-simplejwt 5.5

## Qué hace
Emite y refresca los tokens JWT (`/api/auth/login/`, `/api/auth/refresh/`) y define el modelo de roles `PerfilUsuario`, que tanto el backend (permisos de vista) como el frontend (`RequireRole`) usan como fuente de verdad de "quién puede ver qué".

## Entradas / Salidas
- **Entrada:** credenciales de usuario Django (`auth.User`).
- **Salida:** access token (1 día) + refresh token (7 días).

## Depende de →
- (ninguno)

## Lo usan ←
- `backend-api`

## Riesgos / notas
El rol vive en `PerfilUsuario.role`, no en un `Group` de Django — cualquier cambio en los roles disponibles debe reflejarse también en `frontend/src/features/usuarios/constants/roles.js`.
