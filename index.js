try { require('dotenv').config(); } catch (_) {}

const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { GoogleGenAI, Type } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

// Límite ampliado para recibir fotos de credenciales INE en Base64
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Conexión a PostgreSQL (Render / Local)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Catálogo oficial de las 60 secciones electorales de Cunduacán, Tabasco
const SECCIONES_CUNDUACAN = new Set([
  ...Array.from({ length: 59 }, (_, i) => String(609 + i).padStart(4, '0')).filter(s => s !== '0654'),
  '1202',
  '1203'
]);

function normalizarTexto(txt) {
  return String(txt || '').trim().toUpperCase();
}

function normalizarSeccion(sec) {
  const digitos = String(sec || '').replace(/\D/g, '');
  return digitos ? digitos.padStart(4, '0') : '';
}

// ==========================================
// INICIALIZACIÓN DE TABLAS EN POSTGRESQL
// ==========================================
async function inicializarBD() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      usuario VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(100) NOT NULL,
      rol VARCHAR(50) NOT NULL DEFAULT 'capturista',
      seccion_asignada VARCHAR(10),
      requiere_cambio BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS simpatizantes (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(200) NOT NULL,
      telefono VARCHAR(30),
      seccion VARCHAR(10) NOT NULL,
      localidad VARCHAR(200),
      referencia VARCHAR(200),
      asistio BOOLEAN DEFAULT FALSE,
      creado_en TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS promotores (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(200) NOT NULL,
      telefono VARCHAR(30),
      seccion VARCHAR(10) NOT NULL,
      localidad VARCHAR(200),
      creado_en TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS estructura (
      id SERIAL PRIMARY KEY,
      rol VARCHAR(100) NOT NULL,
      zona INTEGER NOT NULL,
      ruta INTEGER,
      seccion TEXT NOT NULL,
      nombres VARCHAR(150) NOT NULL,
      apellidos VARCHAR(150) NOT NULL,
      telefono VARCHAR(30),
      localidad VARCHAR(200),
      creado_en TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_simp_seccion ON simpatizantes(seccion);
    CREATE INDEX IF NOT EXISTS idx_prom_seccion ON promotores(seccion);
    CREATE INDEX IF NOT EXISTS idx_est_zona ON estructura(zona);
  `);

  await pool.query(`
    INSERT INTO usuarios (usuario, password, rol, requiere_cambio)
    VALUES ('admin', 'admin123', 'admin', FALSE)
    ON CONFLICT (usuario) DO NOTHING;
  `);
}

// ==========================================
// ESCANEO DE CREDENCIAL INE CON GEMINI 3.8 FLASH
// ==========================================
app.post('/api/ine/escanear', async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Falta configurar GEMINI_API_KEY en el servidor.' });
    }

    const { imagenBase64, mimeType } = req.body;
    if (!imagenBase64) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen de la credencial.' });
    }

    const base64Limpio = imagenBase64.replace(/^data:image\/\w+;base64,/, '');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = [
      'Analiza esta imagen de una credencial para votar del INE de México (puede ser original a color o fotocopia en blanco y negro).',
      'Extrae con precisión:',
      '- es_ine_valida: true si corresponde a una credencial para votar INE/IFE legible, false en caso contrario.',
      '- apellidos: apellido paterno y materno en mayúsculas sin acentos.',
      '- nombres: nombre o nombres de pila en mayúsculas sin acentos.',
      '- seccion: número de sección electoral de 4 dígitos (por ejemplo 0615 o 1202).',
      '- localidad: colonia, ranchería, poblado o ejido que aparece en el domicilio (sin código postal ni municipio).'
    ].join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Limpio,
                mimeType: mimeType || 'image/jpeg'
              }
            }
          ]
        }
      ],
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            es_ine_valida: { type: Type.BOOLEAN },
            apellidos: { type: Type.STRING },
            nombres: { type: Type.STRING },
            seccion: { type: Type.STRING },
            localidad: { type: Type.STRING }
          },
          required: ['es_ine_valida', 'apellidos', 'nombres', 'seccion', 'localidad']
        }
      }
    });

    const textoJson = response.text || '{}';
    const datos = JSON.parse(textoJson);

    if (!datos.es_ine_valida) {
      return res.status(400).json({
        error: 'No se detectó una credencial INE legible. Toma la foto más cerca y con buena luz.'
      });
    }

    const seccionNorm = normalizarSeccion(datos.seccion);
    const esSeccionCunduacan = SECCIONES_CUNDUACAN.has(seccionNorm);

    return res.json({
      ok: true,
      datos: {
        es_ine_valida: true,
        nombres: normalizarTexto(datos.nombres),
        apellidos: normalizarTexto(datos.apellidos),
        seccion: seccionNorm,
        localidad: normalizarTexto(datos.localidad),
        es_seccion_cunduacan: esSeccionCunduacan
      }
    });
  } catch (error) {
    console.error('Error al procesar INE con Gemini:', error);
    const detalle = error?.message || 'Error desconocido';
    return res.status(500).json({
      error: `Error al analizar la credencial con Gemini: ${detalle}`
    });
  }
});

// ==========================================
// AUTENTICACIÓN Y GESTIÓN DE USUARIOS
// ==========================================
app.post('/api/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;
    const result = await pool.query(
      'SELECT id, usuario, rol, seccion_asignada, requiere_cambio FROM usuarios WHERE usuario = $1 AND password = $2',
      [String(usuario || '').trim(), String(password || '')]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
});

app.patch('/api/usuarios/:id/password', async (req, res) => {
  try {
    const { nuevoPassword } = req.body;
    await pool.query(
      'UPDATE usuarios SET password = $1, requiere_cambio = FALSE WHERE id = $2',
      [String(nuevoPassword || ''), req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar contraseña.' });
  }
});

app.get('/api/usuarios', async (_req, res) => {
  try {
    const result = await pool.query('SELECT id, usuario, password, rol, seccion_asignada FROM usuarios ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
});

app.post('/api/usuarios', async (req, res) => {
  try {
    const { usuario, password, rol, seccion_asignada } = req.body;
    const sec = rol === 'pase_lista' ? normalizarSeccion(seccion_asignada) : null;
    await pool.query(
      'INSERT INTO usuarios (usuario, password, rol, seccion_asignada, requiere_cambio) VALUES ($1, $2, $3, $4, TRUE)',
      [String(usuario || '').trim(), String(password || ''), rol || 'capturista', sec]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'No se pudo crear el usuario (verifica si ya existe).' });
  }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  try {
    await pool.query("DELETE FROM usuarios WHERE id = $1 AND usuario <> 'admin'", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar usuario.' });
  }
});

// ==========================================
// AVANCES POR SECCIÓN
// ==========================================
app.get('/api/avances', async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        seccion,
        COUNT(*)::int AS total_registrados,
        COUNT(*) FILTER (WHERE asistio = TRUE)::int AS total_asistieron
      FROM simpatizantes
      GROUP BY seccion
      ORDER BY seccion ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener avances.' });
  }
});

// ==========================================
// SIMPATIZANTES Y PASE DE LISTA
// ==========================================
app.get('/api/simpatizantes-todos', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM simpatizantes ORDER BY seccion ASC, nombre ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar simpatizantes.' });
  }
});

app.get('/api/simpatizantes/:seccion', async (req, res) => {
  try {
    const sec = normalizarSeccion(req.params.seccion);
    const result = await pool.query(
      'SELECT * FROM simpatizantes WHERE seccion = $1 ORDER BY nombre ASC',
      [sec]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar simpatizantes de la sección.' });
  }
});

app.post('/api/simpatizantes', async (req, res) => {
  try {
    const { nombre, telefono, seccion, localidad, referencia } = req.body;
    await pool.query(
      'INSERT INTO simpatizantes (nombre, telefono, seccion, localidad, referencia) VALUES ($1, $2, $3, $4, $5)',
      [
        normalizarTexto(nombre),
        String(telefono || '').trim(),
        normalizarSeccion(seccion),
        normalizarTexto(localidad),
        normalizarTexto(referencia)
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar simpatizante.' });
  }
});

app.patch('/api/simpatizantes/:id/editar', async (req, res) => {
  try {
    const { nombre, telefono, seccion, localidad, referencia } = req.body;
    await pool.query(
      'UPDATE simpatizantes SET nombre = $1, telefono = $2, seccion = $3, localidad = $4, referencia = $5 WHERE id = $6',
      [
        normalizarTexto(nombre),
        String(telefono || '').trim(),
        normalizarSeccion(seccion),
        normalizarTexto(localidad),
        normalizarTexto(referencia),
        req.params.id
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al editar simpatizante.' });
  }
});

app.patch('/api/simpatizantes/:id/asistencia', async (req, res) => {
  try {
    const { asistio } = req.body;
    await pool.query('UPDATE simpatizantes SET asistio = $1 WHERE id = $2', [Boolean(asistio), req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar asistencia.' });
  }
});

app.delete('/api/simpatizantes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM simpatizantes WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar simpatizante.' });
  }
});

app.post('/api/simpatizantes/importar', async (req, res) => {
  try {
    const registros = Array.isArray(req.body.registros) ? req.body.registros : [];
    let insertados = 0;
    for (const r of registros) {
      if (!r.nombre || !r.seccion) continue;
      await pool.query(
        'INSERT INTO simpatizantes (nombre, telefono, seccion, localidad, referencia, asistio) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          normalizarTexto(r.nombre),
          String(r.telefono || '').trim(),
          normalizarSeccion(r.seccion),
          normalizarTexto(r.localidad),
          normalizarTexto(r.referencia),
          Boolean(r.asistio)
        ]
      );
      insertados++;
    }
    res.json({ ok: true, mensaje: `Se importaron ${insertados} simpatizantes correctamente.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al importar simpatizantes desde Excel.' });
  }
});

// ==========================================
// PROMOTORES
// ==========================================
app.get('/api/promotores', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM promotores ORDER BY seccion ASC, nombre ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar promotores.' });
  }
});

app.post('/api/promotores', async (req, res) => {
  try {
    const { nombre, telefono, seccion, localidad } = req.body;
    await pool.query(
      'INSERT INTO promotores (nombre, telefono, seccion, localidad) VALUES ($1, $2, $3, $4)',
      [
        normalizarTexto(nombre),
        String(telefono || '').trim(),
        normalizarSeccion(seccion),
        normalizarTexto(localidad)
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar promotor.' });
  }
});

app.patch('/api/promotores/:id/editar', async (req, res) => {
  try {
    const { nombre, telefono, seccion, localidad } = req.body;
    await pool.query(
      'UPDATE promotores SET nombre = $1, telefono = $2, seccion = $3, localidad = $4 WHERE id = $5',
      [
        normalizarTexto(nombre),
        String(telefono || '').trim(),
        normalizarSeccion(seccion),
        normalizarTexto(localidad),
        req.params.id
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al editar promotor.' });
  }
});

app.delete('/api/promotores/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM promotores WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar promotor.' });
  }
});

app.post('/api/promotores/importar', async (req, res) => {
  try {
    const registros = Array.isArray(req.body.registros) ? req.body.registros : [];
    let insertados = 0;
    for (const r of registros) {
      if (!r.nombre || !r.seccion) continue;
      await pool.query(
        'INSERT INTO promotores (nombre, telefono, seccion, localidad) VALUES ($1, $2, $3, $4)',
        [
          normalizarTexto(r.nombre),
          String(r.telefono || '').trim(),
          normalizarSeccion(r.seccion),
          normalizarTexto(r.localidad)
        ]
      );
      insertados++;
    }
    res.json({ ok: true, mensaje: `Se importaron ${insertados} promotores correctamente.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al importar promotores desde Excel.' });
  }
});

// ==========================================
// ESTRUCTURA PRINCIPAL (20 ZONAS, 37 RUTAS, 60 SECCIONES)
// ==========================================
app.get('/api/estructura', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM estructura ORDER BY zona ASC, ruta ASC NULLS FIRST, id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar estructura.' });
  }
});

app.post('/api/estructura', async (req, res) => {
  try {
    const { rol, zona, ruta, secciones, nombres, apellidos, telefono, localidad } = req.body;
    const seccionesTexto = Array.isArray(secciones)
      ? secciones.map(normalizarSeccion).filter(Boolean).join(', ')
      : normalizarSeccion(secciones);

    await pool.query(
      'INSERT INTO estructura (rol, zona, ruta, seccion, nombres, apellidos, telefono, localidad) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [
        rol,
        Number(zona),
        ruta ? Number(ruta) : null,
        seccionesTexto,
        normalizarTexto(nombres),
        normalizarTexto(apellidos),
        String(telefono || '').trim(),
        normalizarTexto(localidad)
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar en estructura.' });
  }
});

app.patch('/api/estructura/:id/editar', async (req, res) => {
  try {
    const { rol, zona, ruta, secciones, nombres, apellidos, telefono, localidad } = req.body;
    const seccionesTexto = Array.isArray(secciones)
      ? secciones.map(normalizarSeccion).filter(Boolean).join(', ')
      : normalizarSeccion(secciones);

    await pool.query(
      'UPDATE estructura SET rol = $1, zona = $2, ruta = $3, seccion = $4, nombres = $5, apellidos = $6, telefono = $7, localidad = $8 WHERE id = $9',
      [
        rol,
        Number(zona),
        ruta ? Number(ruta) : null,
        seccionesTexto,
        normalizarTexto(nombres),
        normalizarTexto(apellidos),
        String(telefono || '').trim(),
        normalizarTexto(localidad),
        req.params.id
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al editar estructura.' });
  }
});

app.delete('/api/estructura/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM estructura WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar de estructura.' });
  }
});

// Ruta fallback para servir el frontend
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

inicializarBD()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Error al inicializar la base de datos:', err);
    process.exit(1);
  });