import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.contrib.auth.models import User

def check_users():
    print("--- USUARIOS EN LA BASE DE DATOS ---")
    users = User.objects.all()
    if not users:
        print("No hay usuarios registrados.")
    for user in users:
        print(f"Username: {user.username}, Is Superuser: {user.is_superuser}, Is Active: {user.is_active}")

def fix_admin():
    username = "admin"
    password = "admin"
    try:
        user = User.objects.get(username=username)
        user.set_password(password)
        user.is_superuser = True
        user.is_staff = True
        user.save()
        print(f"\n✅ Password para '{username}' reseteada a '{password}'.")
    except User.DoesNotExist:
        User.objects.create_superuser(username, "admin@example.com", password)
        print(f"\n✅ Superusuario '{username}' creado exitosamente con password '{password}'.")

if __name__ == "__main__":
    check_users()
    fix_admin()
