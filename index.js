require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { GoogleGenAI, Type } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. CONFIGURACIÓN DE EXPRESS Y ARCHIVOS ESTÁTICOS
// ==========================================
// Límite de 6 MB para permitir el envío de fotografías de INE optimizadas en Base64
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true, limit: '6mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 2. CONEXIÓN A POSTGRESQL (LOCAL Y RENDER)
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// ==========================================
// 3. CONFIGURACIÓN DE GOOGLE GEMINI (AI STUDIO)
// ==========================================
// Lee automáticamente la variable de entorno process.env.GEMINI_API_KEY
const ai = new GoogleGenAI();

// 60 secciones electorales oficiales de Cunduacán, Tabasco
const SECCIONES_CUNDUACAN_SET = new Set([
  ...Array.from({ length: 59 }, (_, i) => String(609 + i).padStart(4, '0')).filter(s => s !== '0654'),
  '1202',
  '1203'
]);

const ineSchema = {
  type: Type.OBJECT,
  properties: {
    es_ine_valida: {
      type: Type.BOOLEAN,
      description: 'true si la imagen es una credencial para votar INE o IFE legible (original o fotocopia), false en caso contrario.'
    },
    apellidos: {
      type: Type.STRING,
      description: 'Apellido paterno y materno juntos en MAYUSCULAS y sin acentos (ej. PEREZ LOPEZ).'
    },
    nombres: {
      type: Type.STRING,
      description: 'Nombre(s) de pila en MAYUSCULAS y sin acentos (ej. JUAN CARLOS).'
    },
    seccion: {
      type: Type.STRING,
      description: 'Numero de seccion electoral de 4 digitos (ej. 0645).'
    },
    localidad: {
      type: Type.STRING,
      description: 'Solo la colonia, rancheria (R/A.), poblado (POB.), ejido (EJ.) o fraccionamiento (FRACC.) en MAYUSCULAS sin acentos, sin calle, sin C.P. y sin municipio/estado.'
    }
  },
  required: ['es_ine_valida', 'apellidos', 'nombres', 'seccion', 'localidad']
};

// ==========================================
// 4. INICIALIZACIÓN DE TABLAS E ÍNDICES EN BD
// ==========================================
async function inicializarBaseDeDatos() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        usuario VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        rol VARCHAR(50) NOT NULL,
        seccion_asignada VARCHAR(10),
        requiere_cambio BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS simpatizantes (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        telefono VARCHAR(30),
        seccion VARCHAR(10) NOT NULL,
        localidad VARCHAR(200),
        referencia VARCHAR(200),
        asistio BOOLEAN DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS promotores (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        telefono VARCHAR(30),
        seccion VARCHAR(10) NOT NULL,
        localidad VARCHAR(200)
      );

      CREATE TABLE IF NOT EXISTS estructura (
        id SERIAL PRIMARY KEY,
        rol VARCHAR(80) NOT NULL,
        zona INTEGER NOT NULL,
        ruta INTEGER,
        seccion TEXT NOT NULL,
        nombres VARCHAR(150) NOT NULL,
        apellidos VARCHAR(150) NOT NULL,
        telefono VARCHAR(30),
        localidad VARCHAR(200)
      );

      CREATE INDEX IF NOT EXISTS idx_simpatizantes_seccion ON simpatizantes(seccion);
      CREATE INDEX IF NOT EXISTS idx_simpatizantes_asistio ON simpatizantes(asistio);
      CREATE INDEX IF NOT EXISTS idx_promotores_seccion ON promotores(seccion);
      CREATE INDEX IF NOT EXISTS idx_estructura_zona ON estructura(zona);
    `);

    // Crear usuario admin por defecto si la tabla está vacía
    const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM usuarios');
    if (rows[0].total === 0) {
      await pool.query(
        `INSERT INTO usuarios (usuario, password, rol, seccion_asignada, requiere_cambio)
         VALUES ('admin', 'admin123', 'admin', NULL, false)`
      );
      console.log('Usuario administrador inicial creado (admin / admin123).');
    }
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error);
  }
}

// ==========================================
// 5. ENDPOINT DE ESCANEO DE INE CON GEMINI
// ==========================================
app.post('/api/ine/escanear', async (req, res) => {
  try {
    const { imagenBase64, mimeType } = req.body;

    if (!imagenBase64) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Falta configurar GEMINI_API_KEY en el servidor.' });
    }

    // Quitar el prefijo data:image/...;base64, si viene desde el navegador
    const base64Limpio = imagenBase64.replace(/^data:image\/\w+;base64,/, '');

    const prompt = `Analiza esta imagen de una credencial para votar de México (INE/IFE), ya sea fotografía directa o fotocopia en blanco y negro.
Extrae los siguientes datos con precisión:
- apellidos: Apellido paterno y materno en MAYÚSCULAS sin acentos.
- nombres: Nombre(s) de pila en MAYÚSCULAS sin acentos.
- seccion: Número de sección electoral de 4 dígitos (ignora años de registro, emisión o vigencia).
- localidad: Únicamente el nombre de la colonia, ranchería (R/A.), poblado (POB.), ejido (EJ.) o fraccionamiento (FRACC.) en MAYÚSCULAS sin acentos.
Si un dato no aparece en el lado fotografiado, devuelve una cadena vacía "".`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        prompt,
        {
          inlineData: {
            data: base64Limpio,
            mimeType: mimeType || 'image/jpeg'
          }
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: ineSchema,
        temperature: 0.1
      }
    });

    const datos = JSON.parse(response.text);

    if (!datos.es_ine_valida) {
      return res.status(422).json({
        error: 'No se detectó una credencial INE legible. Intenta tomar la foto con mejor luz.'
      });
    }

    // Formatear sección a 4 dígitos y validar si pertenece a Cunduacán
    const digitos = String(datos.seccion || '').replace(/\D/g, '');
    datos.seccion = digitos ? digitos.padStart(4, '0') : '';
    datos.es_seccion_cunduacan = datos.seccion ? SECCIONES_CUNDUACAN_SET.has(datos.seccion) : false;

    return res.json({ ok: true, datos });
  } catch (error) {
    console.error('Error al procesar INE con Gemini:', error);
    return res.status(500).json({ error: 'Error interno al analizar la credencial con Gemini.' });
  }
});

// ==========================================
// 6. RUTAS DE AUTENTICACIÓN Y USUARIOS (STAFF)
// ==========================================
app.post('/api/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;
    const { rows } = await pool.query(
      'SELECT id, usuario, rol, seccion_asignada, requiere_cambio FROM usuarios WHERE usuario = $1 AND password = $2',
      [usuario, password]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    return res.json(rows[0]);
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});

app.patch('/api/usuarios/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const { nuevoPassword } = req.body;
    await pool.query(
      'UPDATE usuarios SET password = $1, requiere_cambio = false WHERE id = $2',
      [nuevoPassword, id]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    return res.status(500).json({ error: 'Error al actualizar contraseña' });
  }
});

app.get('/api/usuarios', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, usuario, password, rol, seccion_asignada FROM usuarios ORDER BY id ASC'
    );
    return res.json(rows);
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    return res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

app.post('/api/usuarios', async (req, res) => {
  try {
    const { usuario, password, rol, seccion_asignada } = req.body;
    const seccionFinal = rol === 'pase_lista' && seccion_asignada
      ? String(seccion_asignada).trim().padStart(4, '0')
      : null;

    await pool.query(
      `INSERT INTO usuarios (usuario, password, rol, seccion_asignada, requiere_cambio)
       VALUES ($1, $2, $3, $4, true)`,
      [usuario.trim(), password, rol, seccionFinal]
    );
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    return res.status(400).json({ error: 'No se pudo crear el usuario (posible duplicado)' });
  }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [req.params.id]);
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    return res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

// ==========================================
// 7. RUTAS DE AVANCES Y SIMPATIZANTES
// ==========================================
app.get('/api/avances', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        seccion,
        COUNT(*)::int AS total_registrados,
        COUNT(*) FILTER (WHERE asistio = true)::int AS total_asistieron
      FROM simpatizantes
      GROUP BY seccion
      ORDER BY seccion ASC
    `);
    return res.json(rows);
  } catch (error) {
    console.error('Error al obtener avances:', error);
    return res.status(500).json({ error: 'Error al obtener avances' });
  }
});

app.get('/api/simpatizantes-todos', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM simpatizantes ORDER BY seccion ASC, nombre ASC'
    );
    return res.json(rows);
  } catch (error) {
    console.error('Error al listar simpatizantes:', error);
    return res.status(500).json({ error: 'Error al listar simpatizantes' });
  }
});

app.get('/api/simpatizantes/:seccion', async (req, res) => {
  try {
    const seccion = String(req.params.seccion).trim().padStart(4, '0');
    const { rows } = await pool.query(
      'SELECT * FROM simpatizantes WHERE seccion = $1 ORDER BY nombre ASC',
      [seccion]
    );
    return res.json(rows);
  } catch (error) {
    console.error('Error al listar simpatizantes por sección:', error);
    return res.status(500).json({ error: 'Error al listar simpatizantes de la sección' });
  }
});

app.post('/api/simpatizantes', async (req, res) => {
  try {
    const { nombre, telefono, seccion, localidad, referencia } = req.body;
    const seccionFmt = String(seccion || '').trim().padStart(4, '0');
    await pool.query(
      `INSERT INTO simpatizantes (nombre, telefono, seccion, localidad, referencia, asistio)
       VALUES ($1, $2, $3, $4, $5, false)`,
      [
        String(nombre || '').trim().toUpperCase(),
        String(telefono || '').trim(),
        seccionFmt,
        String(localidad || '').trim().toUpperCase(),
        String(referencia || '').trim()
      ]
    );
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Error al guardar simpatizante:', error);
    return res.status(500).json({ error: 'Error al guardar simpatizante' });
  }
});

app.patch('/api/simpatizantes/:id/editar', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, telefono, seccion, localidad, referencia } = req.body;
    const seccionFmt = String(seccion || '').trim().padStart(4, '0');
    await pool.query(
      `UPDATE simpatizantes
       SET nombre = $1, telefono = $2, seccion = $3, localidad = $4, referencia = $5
       WHERE id = $6`,
      [
        String(nombre || '').trim().toUpperCase(),
        String(telefono || '').trim(),
        seccionFmt,
        String(localidad || '').trim().toUpperCase(),
        String(referencia || '').trim(),
        id
      ]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error al editar simpatizante:', error);
    return res.status(500).json({ error: 'Error al editar simpatizante' });
  }
});

app.patch('/api/simpatizantes/:id/asistencia', async (req, res) => {
  try {
    const { id } = req.params;
    const { asistio } = req.body;
    await pool.query(
      'UPDATE simpatizantes SET asistio = $1 WHERE id = $2',
      [Boolean(asistio), id]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error al registrar asistencia:', error);
    return res.status(500).json({ error: 'Error al registrar asistencia' });
  }
});

app.delete('/api/simpatizantes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM simpatizantes WHERE id = $1', [req.params.id]);
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error al eliminar simpatizante:', error);
    return res.status(500).json({ error: 'Error al eliminar simpatizante' });
  }
});

app.post('/api/simpatizantes/importar', async (req, res) => {
  const client = await pool.connect();
  try {
    const { registros } = req.body;
    if (!Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({ error: 'No se recibieron registros válidos.' });
    }

    await client.query('BEGIN');
    let insertados = 0;

    for (const r of registros) {
      if (!r.nombre || !r.seccion) continue;
      const seccionFmt = String(r.seccion).trim().padStart(4, '0');
      await client.query(
        `INSERT INTO simpatizantes (nombre, telefono, seccion, localidad, referencia, asistio)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          String(r.nombre).trim().toUpperCase(),
          r.telefono ? String(r.telefono).trim() : '',
          seccionFmt,
          r.localidad ? String(r.localidad).trim().toUpperCase() : '',
          r.referencia ? String(r.referencia).trim() : '',
          Boolean(r.asistio)
        ]
      );
      insertados++;
    }

    await client.query('COMMIT');
    return res.json({ mensaje: `${insertados} simpatizantes importados correctamente.` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al importar simpatizantes:', error);
    return res.status(500).json({ error: 'Error al importar simpatizantes.' });
  } finally {
    client.release();
  }
});

// ==========================================
// 8. RUTAS DE PROMOTORES
// ==========================================
app.get('/api/promotores', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM promotores ORDER BY seccion ASC, nombre ASC'
    );
    return res.json(rows);
  } catch (error) {
    console.error('Error al listar promotores:', error);
    return res.status(500).json({ error: 'Error al listar promotores' });
  }
});

app.post('/api/promotores', async (req, res) => {
  try {
    const { nombre, telefono, seccion, localidad } = req.body;
    const seccionFmt = String(seccion || '').trim().padStart(4, '0');
    await pool.query(
      `INSERT INTO promotores (nombre, telefono, seccion, localidad)
       VALUES ($1, $2, $3, $4)`,
      [
        String(nombre || '').trim().toUpperCase(),
        String(telefono || '').trim(),
        seccionFmt,
        String(localidad || '').trim().toUpperCase()
      ]
    );
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Error al guardar promotor:', error);
    return res.status(500).json({ error: 'Error al guardar promotor' });
  }
});

app.patch('/api/promotores/:id/editar', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, telefono, seccion, localidad } = req.body;
    const seccionFmt = String(seccion || '').trim().padStart(4, '0');
    await pool.query(
      `UPDATE promotores
       SET nombre = $1, telefono = $2, seccion = $3, localidad = $4
       WHERE id = $5`,
      [
        String(nombre || '').trim().toUpperCase(),
        String(telefono || '').trim(),
        seccionFmt,
        String(localidad || '').trim().toUpperCase(),
        id
      ]
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error al editar promotor:', error);
    return res.status(500).json({ error: 'Error al editar promotor' });
  }
});

app.delete('/api/promotores/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM promotores WHERE id = $1', [req.params.id]);
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error al eliminar promotor:', error);
    return res.status(500).json({ error: 'Error al eliminar promotor' });
  }
});

app.post('/api/promotores/importar', async (req, res) => {
  const client = await pool.connect();
  try {
    const { registros } = req.body;
    if (!Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({ error: 'No se recibieron registros válidos.' });
    }

    await client.query('BEGIN');
    let insertados = 0;

    for (const r of registros) {
      if (!r.nombre || !r.seccion) continue;
      const seccionFmt = String(r.seccion).trim().padStart(4, '0');
      await client.query(
        `INSERT INTO promotores (nombre, telefono, seccion, localidad)
         VALUES ($1, $2, $3, $4)`,
        [
          String(r.nombre).trim().toUpperCase(),
          r.telefono ? String(r.telefono).trim() : '',
          seccionFmt,
          r.localidad ? String(r.localidad).trim().toUpperCase() : ''
        ]
      );
      insertados++;
    }

    await client.query('COMMIT');
    return res.json({ mensaje: `${insertados} promotores importados correctamente.` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al importar promotores:', error);
    return res.status(500).json({ error: 'Error al importar promotores.' });
  } finally {
    client.release();
  }
});

// ==========================================
// 9. RUTAS DE ESTRUCTURA PRINCIPAL (20 ZONAS, 37 RUTAS, 60 SECCIONES)
// ==========================================
app.get('/api/estructura', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM estructura ORDER BY zona ASC, ruta ASC NULLS FIRST, id ASC'
    );
    return res.json(rows);
  } catch (error) {
    console.error('Error al obtener estructura:', error);
    return res.status(500).json({ error: 'Error al obtener estructura principal' });
  }
});

async function validarDisponibilidadEstructura({ rol, zona, ruta, secciones, excludeId = null }) {
  const { rows } = await pool.query('SELECT * FROM estructura');

  for (const item of rows) {
    if (excludeId && Number(item.id) === Number(excludeId)) continue;

    if (rol === 'Coordinador de Zona' && item.rol === 'Coordinador de Zona' && Number(item.zona) === Number(zona)) {
      return `La Zona ${zona} ya está asignada a ${item.nombres} ${item.apellidos}.`;
    }

    if (rol === 'Coordinador de Ruta' && item.rol === 'Coordinador de Ruta' && Number(item.ruta) === Number(ruta)) {
      return `La Ruta ${ruta} ya está asignada a ${item.nombres} ${item.apellidos}.`;
    }

    if (item.rol === rol && item.seccion) {
      const ocupadas = String(item.seccion).split(',').map(s => s.trim());
      const conflicto = secciones.find(s => ocupadas.includes(String(s).trim()));
      if (conflicto) {
        return `La Sección ${conflicto} ya está asignada en el rol ${rol} a ${item.nombres} ${item.apellidos}.`;
      }
    }
  }
  return null;
}

app.post('/api/estructura', async (req, res) => {
  try {
    const { rol, zona, ruta, secciones, nombres, apellidos, telefono, localidad } = req.body;
    const listaSecciones = Array.isArray(secciones)
      ? secciones.map(s => String(s).trim().padStart(4, '0')).filter(Boolean)
      : [];

    if (!rol || !zona || listaSecciones.length === 0 || !nombres || !apellidos) {
      return res.status(400).json({ error: 'Faltan datos obligatorios para registrar en la estructura.' });
    }

    const errorValidacion = await validarDisponibilidadEstructura({
      rol,
      zona: Number(zona),
      ruta: ruta ? Number(ruta) : null,
      secciones: listaSecciones
    });

    if (errorValidacion) {
      return res.status(400).json({ error: errorValidacion });
    }

    await pool.query(
      `INSERT INTO estructura (rol, zona, ruta, seccion, nombres, apellidos, telefono, localidad)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        rol,
        Number(zona),
        rol === 'Coordinador de Zona' ? null : (ruta ? Number(ruta) : null),
        listaSecciones.join(', '),
        String(nombres).trim().toUpperCase(),
        String(apellidos).trim().toUpperCase(),
        String(telefono || '').trim(),
        String(localidad || '').trim().toUpperCase()
      ]
    );

    return res.status(201).json({ mensaje: 'Integrante registrado correctamente en la Estructura Principal.' });
  } catch (error) {
    console.error('Error al registrar en estructura:', error);
    return res.status(500).json({ error: 'Error al registrar en la estructura principal.' });
  }
});

app.patch('/api/estructura/:id/editar', async (req, res) => {
  try {
    const { id } = req.params;
    const { rol, zona, ruta, secciones, nombres, apellidos, telefono, localidad } = req.body;
    const listaSecciones = Array.isArray(secciones)
      ? secciones.map(s => String(s).trim().padStart(4, '0')).filter(Boolean)
      : [];

    if (!rol || !zona || listaSecciones.length === 0 || !nombres || !apellidos) {
      return res.status(400).json({ error: 'Faltan datos obligatorios.' });
    }

    const errorValidacion = await validarDisponibilidadEstructura({
      rol,
      zona: Number(zona),
      ruta: ruta ? Number(ruta) : null,
      secciones: listaSecciones,
      excludeId: id
    });

    if (errorValidacion) {
      return res.status(400).json({ error: errorValidacion });
    }

    await pool.query(
      `UPDATE estructura
       SET rol = $1, zona = $2, ruta = $3, seccion = $4, nombres = $5, apellidos = $6, telefono = $7, localidad = $8
       WHERE id = $9`,
      [
        rol,
        Number(zona),
        rol === 'Coordinador de Zona' ? null : (ruta ? Number(ruta) : null),
        listaSecciones.join(', '),
        String(nombres).trim().toUpperCase(),
        String(apellidos).trim().toUpperCase(),
        String(telefono || '').trim(),
        String(localidad || '').trim().toUpperCase(),
        id
      ]
    );

    return res.json({ mensaje: 'Integrante actualizado correctamente.' });
  } catch (error) {
    console.error('Error al editar estructura:', error);
    return res.status(500).json({ error: 'Error al actualizar el registro.' });
  }
});

app.delete('/api/estructura/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM estructura WHERE id = $1', [req.params.id]);
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error al eliminar de estructura:', error);
    return res.status(500).json({ error: 'Error al eliminar el registro.' });
  }
});

// ==========================================
// 10. ARRANQUE DEL SERVIDOR
// ==========================================
inicializarBaseDeDatos().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
});