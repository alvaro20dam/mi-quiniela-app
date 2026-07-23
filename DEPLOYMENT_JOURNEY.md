# Bitácora de Despliegue y Depuración — Mi Quiniela App

¡Felicidades por tener la aplicación 100% en línea! Este documento resume de manera educativa cada uno de los desafíos que enfrentamos y cómo los resolvimos, para que puedas estudiarlo en el futuro.

---

## 📅 Resumen del Flujo de Trabajo

1. **Inicio:** App funcionando en local con PostgreSQL y Flask.
2. **GitHub y Gitignore:** Configuración de seguridad para no subir secretos.
3. **PostgreSQL en Render:** Creación de la base de datos administrada y carga del esquema SQL.
4. **Flask Backend en Render:** Despliegue de la API usando Gunicorn.
5. **Frontend en Vercel:** Despliegue del cliente HTML/JS estático.
6. **Depuración de CORS y SameSite:** Ajustes de seguridad para conectar dos dominios diferentes de forma segura.
7. **Corrección de URL:** Ajuste del endpoint del cliente al dominio de Render.

---

## 🛠️ Los Desafíos y sus Soluciones

### 1. Control de Archivos Sensibles (Gitignore)
* **Desafío:** Subir contraseñas, secretos de JWT y la carpeta `venv` a repositorios públicos es un riesgo crítico.
* **Solución:** Creamos un archivo `.gitignore` en la raíz del proyecto para asegurar que git ignore automáticamente las carpetas `venv`, `.pytest_cache`, y el archivo `.env`.

---

### 2. Error de Sintaxis de Bash con Gunicorn en Render
* **Desafío:** Render fallaba al arrancar la app con `gunicorn app:create_app()` debido a los paréntesis, que el shell Bash interpreta como un error de sintaxis: `syntax error near unexpected token '('`.
* **Solución:** Creamos un archivo de punto de entrada llamado `backend/wsgi.py` que carga la aplicación. De esta forma, el comando de inicio en Render es simplemente:
  ```bash
  gunicorn wsgi:app
  ```

---

### 3. El Error de Módulo No Encontrado (`wsgi`)
* **Desafío:** Render arrojó el error `ModuleNotFoundError: No module named 'wsgi'`.
* **Solución:** Ocurrió porque el archivo `wsgi.py` aún no se había subido a GitHub cuando iniciamos el primer despliegue. Una vez que realizamos el commit y subimos el archivo, Render lo compiló sin problemas.

---

### 4. Bloqueo de CORS (Cross-Origin Resource Sharing)
* **Desafío:** La aplicación en Vercel se quedaba cargando indefinidamente porque el backend de Flask bloqueaba peticiones que no vinieran de `localhost`.
* **Solución:** Actualizamos la configuración de Flask en `backend/app.py` para permitir peticiones procedentes de cualquier subdominio de Vercel (`https://*.vercel.app`) y permitimos el uso de variables de entorno de producción.

---

### 5. Cookies en Diferentes Dominios (SameSite)
* **Desafío:** Los navegadores bloqueaban el almacenamiento del token JWT de sesión debido a las políticas de seguridad al estar el frontend en Vercel (`*.vercel.app`) y el backend en Render (`*.onrender.com`).
* **Solución:** Modificamos `backend/config.py` para que, al detectar que `FLASK_ENV=production`, configure dinámicamente las cookies con `SameSite="None"` y `Secure=True`. Esto habilita el intercambio seguro de cookies entre diferentes dominios en HTTPS.

---

### 6. Desajuste de la URL del Backend (URL Mismatch)
* **Desafío:** El frontend seguía sin poder comunicarse con el backend en producción.
* **Solución:** Encontramos que el archivo `frontend/js/api.js` apuntaba a una URL predeterminada, pero Render te había asignado una URL específica: `https://quiniela-backend-wtrs.onrender.com`. Corregimos la dirección URL en el frontend para que use la correcta.

---

### 7. Inicialización de la Base de Datos en Producción
* **Desafío:** El registro e inicio de sesión daban errores `500 (Internal Server Error)` porque la base de datos de producción en Render no contenía las tablas.
* **Solución:** Conectamos a través del comando interactivo de `psql` de Render y ejecutamos el comando `\i backend/db/la-liga-quiniela-db.sql`, poblando la base de datos en la nube con las tablas correspondientes.

---

## 📈 Conclusión y Aprendizajes
Este flujo representa la arquitectura moderna para aplicaciones desacopladas:
* **Frontend:** Alojado en servidores perimetrales estáticos rápidos (Vercel).
* **Backend:** Alojado en contenedores de aplicaciones dinámicas (Render).
* **Base de Datos:** Alojada en una base de datos relacional administrada (PostgreSQL en Render).

¡Has aprendido conceptos fundamentales de CORS, políticas de cookies cross-site (SameSite), entornos de producción y administración de bases de datos remotas!
