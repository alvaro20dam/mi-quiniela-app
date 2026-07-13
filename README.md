# Guía para Arrancar la Aplicación (Mi Quiniela App)

Esta guía te guiará paso a paso para levantar tanto el servidor **Backend** (API de Flask) como el **Frontend** (servidor web estático) y configurar la **Base de Datos** (PostgreSQL).

---

## Prerrequisitos

1. **Python 3.10+** instalado y en el PATH del sistema.
2. **PostgreSQL** instalado y ejecutándose localmente.

---

## Paso 1: Configurar la Base de Datos

1. Abre tu terminal de base de datos de PostgreSQL (como pgAdmin o la consola `psql`).
2. Crea una base de datos llamada `quiniela_db` y un usuario `quiniela_user` con contraseña `Qu1nI3#4` (o ajusta los valores en el archivo [backend/.env](file:///c:/Users/admin/Desktop/mi-quiniela-app/backend/.env)).
3. Ejecuta el script SQL de inicialización ubicado en:
   * [backend/db/la-liga-quiniela-db.sql](file:///c:/Users/admin/Desktop/mi-quiniela-app/backend/db/la-liga-quiniela-db.sql)

---

## Paso 2: Levantar el Backend (Flask)

1. Abre una terminal de comandos (PowerShell o CMD).
2. Navega al directorio `backend`:
   ```powershell
   cd backend
   ```
3. Activa el entorno virtual (`venv`):
   * En **Windows (PowerShell)**:
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
   * En **Windows (CMD)**:
     ```cmd
     .\venv\Scripts\activate.bat
     ```
   * En **macOS/Linux**:
     ```bash
     source venv/bin/activate
     ```
4. Instala las dependencias (solo si es necesario o si estás en un entorno nuevo):
   ```bash
   pip install -r requirements.txt
   ```
5. Ejecuta la aplicación de Flask:
   ```bash
   python app.py
   ```
   * *El backend estará disponible en: `http://localhost:5000`*

---

## Paso 3: Levantar el Frontend

1. Abre **otra terminal diferente** (deja la del backend corriendo).
2. Navega al directorio `frontend`:
   ```powershell
   cd frontend
   ```
3. Levanta un servidor web simple con Python:
   ```bash
   python -m http.server 8000
   ```
4. Abre tu navegador web favorito y accede a:
   * **[http://localhost:8000/index.html](http://localhost:8000/index.html)**
