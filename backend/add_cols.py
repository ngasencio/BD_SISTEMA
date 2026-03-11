import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.db import connection

with connection.cursor() as cursor:
    try:
        cursor.execute("ALTER TABLE api_ordencompra ADD COLUMN `ID Proyecto` VARCHAR(255) NULL;")
        print("Added ID Proyecto")
    except Exception as e:
        print("Error ID Proyecto:", e)

    try:
        cursor.execute("ALTER TABLE api_ordencompra ADD COLUMN EnlacePAC VARCHAR(255) NULL;")
        print("Added EnlacePAC")
    except Exception as e:
        print("Error EnlacePAC:", e)
