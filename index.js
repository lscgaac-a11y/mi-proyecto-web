try { require('dotenv').config(); } catch (_) {}

const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { GoogleGenAI, Type } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

let clienteAI = null;
function obtenerClienteAI() {
  if (!clienteAI && process.env.GEMINI_API_KEY) {
    clienteAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return clienteAI;
}

// Catálogo oficial de las 60 secciones electorales de Cunduacán, Tabasco
const SECCIONES_CUNDUACAN = new Set([
  ...Array.from({ length: 59 }, (_, i) => String(609 + i).padStart(4, '0')).filter(s => s !== '0654'),
  '1202',
  '1203'
]);

function normalizarTexto(txt) {
  return String(txt || '').trim().toUpperCase();
}

function normalizarCodigoINE(txt) {
  return String(txt || '').replace(/\s+/g, '').trim().toUpperCase();
}

function normalizarSeccion(sec) {
  const digitos = String(sec || '').replace(/\D/g, '');
  return digitos ? digitos.padStart(4, '0') : '';
}

function normalizarVigencia(vig) {
  const coincidencias = String(vig || '').match(/\b(19\d{2}|20\d{2})\b/g);
  if (!coincidencias || coincidencias.length === 0) return null;
  return Number(coincidencias[coincidencias.length - 1]);
}

function limpiarDireccionINE(dir) {
  let texto = normalizarTexto(dir)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Eliminar C.P. o código postal de 5 dígitos
  texto = texto
    .replace(/\bC\.?\s*P\.?\s*\d{5}\b/g, ' ')
    .replace(/(?:^|[\s,])\d{5}(?=[\s,]|$)/g, ' ');

  // Eliminar municipio y estado únicamente si aparecen al final de la dirección
  texto = texto
    .replace(/(?:,\s*|\s+)(?:CUNDUACAN\s*,?\s*)?(?:TABASCO|TAB\.?)\s*$/g, '')
    .replace(/(?:,\s*|\s+)CUNDUACAN\s*$/g, '');

  return texto
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,.\s-]+|[,.\s-]+$/g, '')
    .trim();
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generarRapidoConReintentos(ai, solicitud, maxIntentos = 3) {
  let ultimoError;
  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      return await ai.models.generateContent(solicitud);
    } catch (error) {
      ultimoError = error;
      const textoErr = String(error?.message || '');

      if (solicitud.config?.thinkingConfig && (error?.status === 400 || textoErr.includes('thinking'))) {
        const copiaConfig = { ...solicitud.config };
        delete copiaConfig.thinkingConfig;
        solicitud = { ...solicitud, config: copiaConfig };
        continue;
      }

      const esTemporal =
        error?.status === 503 ||
        error?.status === 429 ||
        textoErr.includes('503') ||
        textoErr.includes('429') ||
        textoErr.includes('UNAVAILABLE') ||
        textoErr.includes('high demand');

      if (!esTemporal || intento === maxIntentos) {
        throw error;
      }
      await esperar(700 * intento);
    }
  }
  throw ultimoError;
}

// ==========================================
// INICIALIZACIÓN Y MIGRACIÓN SEGURA DE TABLAS
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
      curp VARCHAR(30),
      clave_elector VARCHAR(30),
      telefono VARCHAR(30),
      seccion VARCHAR(10) NOT NULL,
      localidad VARCHAR(200),
      referencia VARCHAR(200),
      asistio BOOLEAN DEFAULT FALSE,
      creado_en TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE simpatizantes ADD COLUMN IF NOT EXISTS curp VARCHAR(30);
    ALTER TABLE simpatizantes ADD COLUMN IF NOT EXISTS clave_elector VARCHAR(30);

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
// ESCANEO RÁPIDO DE CREDENCIAL INE CON VALIDACIÓN DE VIGENCIA
// ==========================================
app.post('/api/ine/escanear', async (req, res) => {
  try {
    const ai = obtenerClienteAI();
    if (!ai) {
      return res.status(500).json({ error: 'Falta configurar GEMINI_API_KEY en el servidor.' });
    }

    const { imagenBase64, mimeType } = req.body;
    if (!imagenBase64) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen de la credencial.' });
    }

    const base64Limpio = imagenBase64.replace(/^data:image\/\w+;base64,/, '');

    const prompt =
      'Lee esta credencial INE/IFE de México (original o copia). Devuelve JSON exacto: ' +
      'es_ine_valida (boolean), apellidos (mayúsculas sin acentos), nombres (mayúsculas sin acentos), ' +
      'curp (18 caracteres alfanuméricos en mayúsculas sin espacios), ' +
      'clave_elector (18 caracteres alfanuméricos en mayúsculas sin espacios), ' +
      'seccion (4 dígitos), ' +
      'vigencia (año de vencimiento de 4 dígitos impreso en el campo VIGENCIA; si aparece un rango como 2016-2026, devuelve el año final), ' +
      'localidad (dirección completa del domicilio: calle, número exterior/interior, manzana/lote, carretera/km y colonia, ranchería, ejido o poblado en mayúsculas sin acentos; EXCLUYE únicamente el código postal de 5 dígitos, el municipio y el estado).';

    const response = await generarRapidoConReintentos(ai, {
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
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            es_ine_valida: { type: Type.BOOLEAN },
            apellidos: { type: Type.STRING },
            nombres: { type: Type.STRING },
            curp: { type: Type.STRING },
            clave_elector: { type: Type.STRING },
            seccion: { type: Type.STRING },
            vigencia: { type: Type.STRING },
            localidad: { type: Type.STRING }
          },
          required: ['es_ine_valida', 'apellidos', 'nombres', 'curp', 'clave_elector', 'seccion', 'vigencia', 'localidad']
        }
      }
    });

    const datos = JSON.parse(response.text || '{}');

    if (!datos.es_ine_valida) {
      return res.status(400).json({
        error: 'No se detectó una credencial INE legible. Toma la foto más cerca y con buena luz.'
      });
    }

    const anioActual = new Date().getFullYear();
    const anioVigencia = normalizarVigencia(datos.vigencia);

    if (!anioVigencia) {
      return res.status(400).json({
        error: 'No se pudo leer el año de VIGENCIA en la credencial. Toma una foto completa donde se vea la vigencia.'
      });
    }

    if (anioVigencia < anioActual) {
      return res.status(400).json({
        error: `Credencial INE vencida (Vigencia: ${anioVigencia}). Solo se aceptan credenciales vigentes (${anioActual} o posterior).`
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
        curp: normalizarCodigoINE(datos.curp),
        clave_elector: normalizarCodigoINE(datos.clave_elector),
        seccion: seccionNorm,
        vigencia: anioVigencia,
        localidad: limpiarDireccionINE(datos.localidad),
        es_seccion_cunduacan: esSeccionCunduacan
      }
    });
  } catch (error) {
    console.error('Error al procesar INE con Gemini:', error);
    const textoErr = String(error?.message || '');
    if (textoErr.includes('503') || textoErr.includes('UNAVAILABLE') || textoErr.includes('high demand')) {
      return res.status(503).json({
        error: 'Los servidores de IA tienen alta demanda en este momento. Intenta de nuevo en unos segundos.'
      });
    }
    if (textoErr.includes('429') || textoErr.includes('RESOURCE_EXHAUSTED')) {
      return res.status(429).json({
        error: 'Límite de peticiones alcanzado. Espera unos segundos e intenta de nuevo.'
      });
    }
    return res.status(500).json({
      error: `Error al analizar la credencial con Gemini: ${textoErr || 'Error desconocido'}`
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
    const rolesValidos = new Set(['admin', 'capturista', 'pase_lista']);
    const rolFinal = rolesValidos.has(rol) ? rol : 'capturista';

    let sec = null;
    if (rolFinal === 'pase_lista') {
      sec = normalizarSeccion(seccion_asignada);
      if (!sec || !SECCIONES_CUNDUACAN.has(sec)) {
        return res.status(400).json({ error: 'Selecciona una sección válida de Cunduacán para el rol Pase de Lista.' });
      }
    }

    await pool.query(
      'INSERT INTO usuarios (usuario, password, rol, seccion_asignada, requiere_cambio) VALUES ($1, $2, $3, $4, TRUE)',
      [String(usuario || '').trim(), String(password || ''), rolFinal, sec]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'No se pudo crear el usuario (verifica si ya existe).' });
  }
});

app.patch('/api/usuarios/:id/rol', async (req, res) => {
  try {
    const { rol, seccion_asignada } = req.body;
    const rolesValidos = new Set(['admin', 'capturista', 'pase_lista']);
    if (!rolesValidos.has(rol)) {
      return res.status(400).json({ error: 'Rol no válido.' });
    }

    let sec = null;
    if (rol === 'pase_lista') {
      sec = normalizarSeccion(seccion_asignada);
      if (!sec || !SECCIONES_CUNDUACAN.has(sec)) {
        return res.status(400).json({ error: 'Selecciona una sección válida de Cunduacán para el rol Pase de Lista.' });
      }
    }

    const result = await pool.query(
      "UPDATE usuarios SET rol = $1, seccion_asignada = $2 WHERE id = $3 AND usuario <> 'admin'",
      [rol, sec, req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ error: 'No se pudo cambiar el rol de este usuario.' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cambiar el rol del usuario.' });
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
    const soloBasico = String(req.query.basico || '') === '1';

    const consulta = soloBasico
      ? 'SELECT id, nombre, seccion, asistio FROM simpatizantes WHERE seccion = $1 ORDER BY nombre ASC'
      : 'SELECT * FROM simpatizantes WHERE seccion = $1 ORDER BY nombre ASC';

    const result = await pool.query(consulta, [sec]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar simpatizantes de la sección.' });
  }
});

app.post('/api/simpatizantes', async (req, res) => {
  try {
    const { nombre, curp, clave_elector, telefono, seccion, localidad, referencia } = req.body;
    await pool.query(
      'INSERT INTO simpatizantes (nombre, curp, clave_elector, telefono, seccion, localidad, referencia) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [
        normalizarTexto(nombre),
        normalizarCodigoINE(curp),
        normalizarCodigoINE(clave_elector),
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
    const { nombre, curp, clave_elector, telefono, seccion, localidad, referencia } = req.body;
    await pool.query(
      'UPDATE simpatizantes SET nombre = $1, curp = $2, clave_elector = $3, telefono = $4, seccion = $5, localidad = $6, referencia = $7 WHERE id = $8',
      [
        normalizarTexto(nombre),
        normalizarCodigoINE(curp),
        normalizarCodigoINE(clave_elector),
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
    const { asistio, rol, seccion_asignada } = req.body;

    if (rol === 'pase_lista') {
      if (!asistio) {
        return res.status(403).json({ error: 'No tienes permiso para revertir una asistencia confirmada.' });
      }
      const sec = normalizarSeccion(seccion_asignada);
      const result = await pool.query(
        'UPDATE simpatizantes SET asistio = TRUE WHERE id = $1 AND seccion = $2 AND asistio = FALSE',
        [req.params.id, sec]
      );
      if (result.rowCount === 0) {
        return res.status(403).json({ error: 'Este registro ya fue confirmado y bloqueado o no pertenece a tu sección.' });
      }
      return res.json({ ok: true });
    }

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
        'INSERT INTO simpatizantes (nombre, curp, clave_elector, telefono, seccion, localidad, referencia, asistio) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [
          normalizarTexto(r.nombre),
          normalizarCodigoINE(r.curp),
          normalizarCodigoINE(r.clave_elector),
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

// Ruta fallback compatible con Express 4 y 5
app.use((_req, res) => {
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