// ==========================================
// CATÁLOGO OFICIAL DE 60 SECCIONES DE CUNDUACÁN
// ==========================================
const SECCIONES_CUNDUACAN = [
  ...Array.from({ length: 59 }, (_, i) => String(609 + i).padStart(4, '0')).filter(s => s !== '0654'),
  '1202',
  '1203'
];

let usuarioActual = null;
let cacheAvances = [];
let cacheSimpatizantes = [];
let cachePromotores = [];
let cacheEstructura = [];
let destinoINEActual = null;

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  poblarDatalistSecciones();
  configurarEventosFormularios();
  configurarListenerCamaraINE();

  const guardado = localStorage.getItem('usuario_territorial');
  if (guardado) {
    try {
      usuarioActual = JSON.parse(guardado);
      iniciarSesionUI();
    } catch {
      localStorage.removeItem('usuario_territorial');
    }
  }
});

function poblarDatalistSecciones() {
  const dl = document.getElementById('lista-secciones-cunduacan');
  if (!dl) return;
  dl.innerHTML = SECCIONES_CUNDUACAN.map(sec => `<option value="${sec}"></option>`).join('');
}

// ==========================================
// ESCANEO DE CREDENCIAL INE CON GEMINI
// ==========================================
function iniciarEscaneoINE(destino) {
  destinoINEActual = destino;
  const input = document.getElementById('input-foto-ine');
  if (!input) return;
  input.value = '';
  input.click();
}

function optimizarImagenINE(archivo, maxAncho = 1280, calidad = 0.82) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let ancho = img.width;
        let alto = img.height;
        if (ancho > maxAncho) {
          alto = Math.round((alto * maxAncho) / ancho);
          ancho = maxAncho;
        }
        const canvas = document.createElement('canvas');
        canvas.width = ancho;
        canvas.height = alto;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, ancho, alto);
        resolve(canvas.toDataURL('image/jpeg', calidad));
      };
      img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      img.src = e.target.result;
    };
    lector.onerror = () => reject(new Error('Error al abrir el archivo.'));
    lector.readAsDataURL(archivo);
  });
}

function mostrarEstadoINE(destino, mensaje, tipo = 'info') {
  const mapaCajas = {
    simpatizante: 'estado-ine-simpatizante',
    promotor: 'estado-ine-promotor',
    estructura: 'estado-ine-estructura'
  };
  const caja = document.getElementById(mapaCajas[destino]);
  if (!caja) return;

  const colores = {
    info: { texto: '#1d4ed8', borde: '#1d4ed8', fondo: '#eff6ff' },
    ok: { texto: '#15803d', borde: '#15803d', fondo: '#f0fdf4' },
    alerta: { texto: '#b45309', borde: '#b45309', fondo: '#fffbeb' },
    error: { texto: '#b91c1c', borde: '#b91c1c', fondo: '#fef2f2' }
  };
  const estilo = colores[tipo] || colores.info;
  caja.style.color = estilo.texto;
  caja.style.borderLeftColor = estilo.borde;
  caja.style.background = estilo.fondo;
  caja.textContent = mensaje;
  caja.classList.remove('oculto');
}

function asignarValor(id, valor) {
  const el = document.getElementById(id);
  if (el && valor) {
    el.value = valor;
  }
}

function configurarListenerCamaraINE() {
  const input = document.getElementById('input-foto-ine');
  if (!input) return;

  input.addEventListener('change', async (e) => {
    const archivo = e.target.files && e.target.files[0];
    if (!archivo || !destinoINEActual) return;

    const destino = destinoINEActual;
    try {
      mostrarEstadoINE(destino, 'Procesando imagen y extrayendo datos de la INE...', 'info');

      const imagenBase64 = await optimizarImagenINE(archivo);

      const res = await fetch('/api/ine/escanear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagenBase64, mimeType: 'image/jpeg' })
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        mostrarEstadoINE(destino, data.error || 'No se pudo leer la credencial.', 'error');
        return;
      }

      const { nombres, apellidos, seccion, localidad, es_seccion_cunduacan } = data.datos;
      const nombreCompleto = `${nombres || ''} ${apellidos || ''}`.trim();

      if (destino === 'simpatizante') {
        asignarValor('simp-nombre', nombreCompleto);
        asignarValor('simp-seccion', seccion);
        asignarValor('simp-localidad', localidad);
      } else if (destino === 'promotor') {
        asignarValor('prom-nombre', nombreCompleto);
        asignarValor('prom-seccion', seccion);
        asignarValor('prom-localidad', localidad);
      } else if (destino === 'estructura') {
        asignarValor('est-nombres', nombres);
        asignarValor('est-apellidos', apellidos);
        asignarValor('est-localidad', localidad);
        const campoSec = document.getElementById('est-seccion');
        if (campoSec && seccion) {
          const actual = campoSec.value.trim();
          campoSec.value = actual ? `${actual}, ${seccion}` : seccion;
        }
      }

      if (seccion && !es_seccion_cunduacan) {
        mostrarEstadoINE(
          destino,
          `Datos cargados, pero la sección ${seccion} no pertenece a las 60 secciones de Cunduacán.`,
          'alerta'
        );
      } else {
        mostrarEstadoINE(destino, 'Credencial leída con éxito. Revisa los datos y guarda.', 'ok');
      }
    } catch (error) {
      console.error('Error escaneo INE:', error);
      mostrarEstadoINE(destino, 'Error de red al analizar la credencial.', 'error');
    }
  });
}

// ==========================================
// AUTENTICACIÓN Y NAVEGACIÓN
// ==========================================
function configurarEventosFormularios() {
  document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const usuario = document.getElementById('login-usuario').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, password })
      });
      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || 'Usuario o contraseña incorrectos.';
        return;
      }
      usuarioActual = data;
      localStorage.setItem('usuario_territorial', JSON.stringify(data));
      iniciarSesionUI();
    } catch {
      errorEl.textContent = 'Error de conexión con el servidor.';
    }
  });

  document.getElementById('form-cambiar-password').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nuevoPassword = document.getElementById('nuevo-password').value;
    const res = await fetch(`/api/usuarios/${usuarioActual.id}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nuevoPassword })
    });
    if (res.ok) {
      usuarioActual.requiere_cambio = false;
      localStorage.setItem('usuario_territorial', JSON.stringify(usuarioActual));
      document.getElementById('modal-password').classList.add('oculto');
    }
  });

  document.getElementById('form-simpatizante').addEventListener('submit', guardarSimpatizante);
  document.getElementById('form-promotor').addEventListener('submit', guardarPromotor);
  document.getElementById('form-estructura').addEventListener('submit', guardarEstructura);
  document.getElementById('form-usuario').addEventListener('submit', crearUsuario);
}

function iniciarSesionUI() {
  document.getElementById('vista-login').classList.add('oculto');
  document.getElementById('vista-app').classList.remove('oculto');
  document.getElementById('info-usuario-activo').textContent =
    `${usuarioActual.usuario} (${usuarioActual.rol}${usuarioActual.seccion_asignada ? ' - Sec. ' + usuarioActual.seccion_asignada : ''})`;

  if (usuarioActual.requiere_cambio) {
    document.getElementById('modal-password').classList.remove('oculto');
  }

  // Permisos por rol
  const btnUsuarios = document.getElementById('btn-tab-usuarios');
  if (usuarioActual.rol !== 'admin') {
    btnUsuarios.classList.add('oculto');
  } else {
    btnUsuarios.classList.remove('oculto');
  }

  if (usuarioActual.rol === 'pase_lista') {
    document.querySelectorAll('#nav-tabs button').forEach(btn => {
      if (btn.dataset.tab !== 'tab-simpatizantes') btn.classList.add('oculto');
    });
    document.getElementById('bloque-form-simpatizante').classList.add('oculto');
    document.getElementById('herramientas-excel-simp').classList.add('oculto');
    cambiarPestana('tab-simpatizantes');
  } else {
    cargarTodo();
    cambiarPestana('tab-avances');
  }
}

function cerrarSesion() {
  localStorage.removeItem('usuario_territorial');
  usuarioActual = null;
  location.reload();
}

function cambiarPestana(idTab) {
  document.querySelectorAll('.panel-tab').forEach(p => p.classList.add('oculto'));
  document.querySelectorAll('#nav-tabs button').forEach(b => b.classList.remove('activo'));

  const panel = document.getElementById(idTab);
  const boton = document.querySelector(`#nav-tabs button[data-tab="${idTab}"]`);
  if (panel) panel.classList.remove('oculto');
  if (boton) boton.classList.add('activo');

  if (idTab === 'tab-avances') cargarAvances();
  if (idTab === 'tab-simpatizantes') cargarSimpatizantes();
  if (idTab === 'tab-promotores') cargarPromotores();
  if (idTab === 'tab-estructura') cargarEstructura();
  if (idTab === 'tab-usuarios' && usuarioActual.rol === 'admin') cargarUsuarios();
}

function cargarTodo() {
  cargarAvances();
  cargarSimpatizantes();
  cargarPromotores();
  cargarEstructura();
  if (usuarioActual && usuarioActual.rol === 'admin') cargarUsuarios();
}

// ==========================================
// 1. AVANCES POR SECCIÓN
// ==========================================
async function cargarAvances() {
  const res = await fetch('/api/avances');
  if (res.ok) {
    cacheAvances = await res.json();
    renderizarAvances();
  }
}

function renderizarAvances() {
  const mapa = new Map(cacheAvances.map(a => [a.seccion, a]));
  const filtro = (document.getElementById('filtro-avances-seccion').value || '').trim();

  let totalReg = 0;
  let totalAsis = 0;
  let seccionesActivas = 0;

  cacheAvances.forEach(a => {
    totalReg += a.total_registrados;
    totalAsis += a.total_asistieron;
    if (a.total_registrados > 0) seccionesActivas++;
  });

  const pctGlobal = totalReg > 0 ? ((totalAsis / totalReg) * 100).toFixed(1) : '0.0';
  document.getElementById('kpi-registrados').textContent = totalReg;
  document.getElementById('kpi-asistieron').textContent = totalAsis;
  document.getElementById('kpi-porcentaje').textContent = `${pctGlobal}%`;
  document.getElementById('kpi-secciones').textContent = `${seccionesActivas} / 60`;

  const tbody = document.getElementById('tabla-avances-body');
  const lista = SECCIONES_CUNDUACAN.filter(sec => !filtro || sec.includes(filtro));

  tbody.innerHTML = lista.map(sec => {
    const dato = mapa.get(sec) || { total_registrados: 0, total_asistieron: 0 };
    const pct = dato.total_registrados > 0
      ? ((dato.total_asistieron / dato.total_registrados) * 100).toFixed(1)
      : '0.0';
    return `
      <tr>
        <td><strong>${sec}</strong></td>
        <td>${dato.total_registrados}</td>
        <td>${dato.total_asistieron}</td>
        <td>${pct}%</td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// 2. SIMPATIZANTES Y PASE DE LISTA
// ==========================================
async function cargarSimpatizantes() {
  const url = usuarioActual.rol === 'pase_lista' && usuarioActual.seccion_asignada
    ? `/api/simpatizantes/${usuarioActual.seccion_asignada}`
    : '/api/simpatizantes-todos';

  const res = await fetch(url);
  if (res.ok) {
    cacheSimpatizantes = await res.json();
    renderizarSimpatizantes();
  }
}

function renderizarSimpatizantes() {
  const fSec = (document.getElementById('filtro-simp-seccion').value || '').trim();
  const fBusq = (document.getElementById('filtro-simp-busqueda').value || '').trim().toUpperCase();

  const filtrados = cacheSimpatizantes.filter(s => {
    const okSec = !fSec || String(s.seccion).includes(fSec);
    const okBusq = !fBusq ||
      String(s.nombre || '').toUpperCase().includes(fBusq) ||
      String(s.localidad || '').toUpperCase().includes(fBusq);
    return okSec && okBusq;
  });

  const esPaseLista = usuarioActual.rol === 'pase_lista';
  const tbody = document.getElementById('tabla-simpatizantes-body');

  tbody.innerHTML = filtrados.map(s => `
    <tr>
      <td>
        <input type="checkbox" ${s.asistio ? 'checked' : ''} onchange="toggleAsistencia(${s.id}, this.checked)" style="width:18px; height:18px; cursor:pointer;" />
      </td>
      <td><strong>${s.seccion}</strong></td>
      <td>${s.nombre}</td>
      <td>${s.telefono || ''}</td>
      <td>${s.localidad || ''}</td>
      <td>${s.referencia || ''}</td>
      <td>
        ${esPaseLista ? '' : `
          <button type="button" class="btn btn-editar" onclick="editarSimpatizante(${s.id})">Editar</button>
          <button type="button" class="btn btn-rojo" onclick="eliminarSimpatizante(${s.id})">Eliminar</button>
        `}
      </td>
    </tr>
  `).join('');
}

async function guardarSimpatizante(e) {
  e.preventDefault();
  const id = document.getElementById('simp-id').value;
  const payload = {
    nombre: document.getElementById('simp-nombre').value,
    telefono: document.getElementById('simp-telefono').value,
    seccion: document.getElementById('simp-seccion').value,
    localidad: document.getElementById('simp-localidad').value,
    referencia: document.getElementById('simp-referencia').value
  };

  const url = id ? `/api/simpatizantes/${id}/editar` : '/api/simpatizantes';
  const method = id ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    resetFormSimpatizante();
    cargarSimpatizantes();
    cargarAvances();
  } else {
    alert('Error al guardar simpatizante.');
  }
}

function editarSimpatizante(id) {
  const s = cacheSimpatizantes.find(item => item.id === id);
  if (!s) return;
  document.getElementById('simp-id').value = s.id;
  document.getElementById('simp-nombre').value = s.nombre;
  document.getElementById('simp-telefono').value = s.telefono || '';
  document.getElementById('simp-seccion').value = s.seccion;
  document.getElementById('simp-localidad').value = s.localidad || '';
  document.getElementById('simp-referencia').value = s.referencia || '';
  document.getElementById('titulo-form-simp').textContent = 'Editar Simpatizante';
  document.getElementById('btn-cancelar-simp').classList.remove('oculto');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetFormSimpatizante() {
  document.getElementById('form-simpatizante').reset();
  document.getElementById('simp-id').value = '';
  document.getElementById('titulo-form-simp').textContent = 'Registrar Simpatizante';
  document.getElementById('btn-cancelar-simp').classList.add('oculto');
  document.getElementById('estado-ine-simpatizante').classList.add('oculto');
}

async function toggleAsistencia(id, asistio) {
  await fetch(`/api/simpatizantes/${id}/asistencia`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asistio })
  });
  const item = cacheSimpatizantes.find(s => s.id === id);
  if (item) item.asistio = asistio;
  cargarAvances();
}

async function eliminarSimpatizante(id) {
  if (!confirm('¿Eliminar este simpatizante?')) return;
  const res = await fetch(`/api/simpatizantes/${id}`, { method: 'DELETE' });
  if (res.ok) {
    cargarSimpatizantes();
    cargarAvances();
  }
}

function exportarExcelSimpatizantes() {
  const datos = cacheSimpatizantes.map(s => ({
    Seccion: s.seccion,
    Nombre: s.nombre,
    Telefono: s.telefono || '',
    Localidad: s.localidad || '',
    Referencia: s.referencia || '',
    Asistio: s.asistio ? 'SI' : 'NO'
  }));
  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Simpatizantes');
  XLSX.writeFile(wb, 'Simpatizantes_Cunduacan.xlsx');
}

async function importarExcelSimpatizantes(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const buffer = await archivo.arrayBuffer();
  const wb = XLSX.read(buffer);
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja);

  const registros = filas.map(f => ({
    nombre: f.Nombre || f.nombre || f.NOMBRE,
    telefono: f.Telefono || f.telefono || f.TELEFONO || '',
    seccion: f.Seccion || f.seccion || f.SECCION,
    localidad: f.Localidad || f.localidad || f.LOCALIDAD || '',
    referencia: f.Referencia || f.referencia || f.REFERENCIA || '',
    asistio: String(f.Asistio || f.asistio || '').toUpperCase() === 'SI'
  }));

  const res = await fetch('/api/simpatizantes/importar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ registros })
  });
  const data = await res.json();
  alert(data.mensaje || data.error);
  e.target.value = '';
  cargarSimpatizantes();
  cargarAvances();
}

// ==========================================
// 3. PROMOTORES
// ==========================================
async function cargarPromotores() {
  const res = await fetch('/api/promotores');
  if (res.ok) {
    cachePromotores = await res.json();
    renderizarPromotores();
  }
}

function renderizarPromotores() {
  const fSec = (document.getElementById('filtro-prom-seccion').value || '').trim();
  const fBusq = (document.getElementById('filtro-prom-busqueda').value || '').trim().toUpperCase();

  const filtrados = cachePromotores.filter(p => {
    const okSec = !fSec || String(p.seccion).includes(fSec);
    const okBusq = !fBusq || String(p.nombre || '').toUpperCase().includes(fBusq);
    return okSec && okBusq;
  });

  const tbody = document.getElementById('tabla-promotores-body');
  tbody.innerHTML = filtrados.map(p => `
    <tr>
      <td><strong>${p.seccion}</strong></td>
      <td>${p.nombre}</td>
      <td>${p.telefono || ''}</td>
      <td>${p.localidad || ''}</td>
      <td>
        <button type="button" class="btn btn-editar" onclick="editarPromotor(${p.id})">Editar</button>
        <button type="button" class="btn btn-rojo" onclick="eliminarPromotor(${p.id})">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function guardarPromotor(e) {
  e.preventDefault();
  const id = document.getElementById('prom-id').value;
  const payload = {
    nombre: document.getElementById('prom-nombre').value,
    telefono: document.getElementById('prom-telefono').value,
    seccion: document.getElementById('prom-seccion').value,
    localidad: document.getElementById('prom-localidad').value
  };

  const url = id ? `/api/promotores/${id}/editar` : '/api/promotores';
  const method = id ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (res.ok) {
    resetFormPromotor();
    cargarPromotores();
  } else {
    alert('Error al guardar promotor.');
  }
}

function editarPromotor(id) {
  const p = cachePromotores.find(item => item.id === id);
  if (!p) return;
  document.getElementById('prom-id').value = p.id;
  document.getElementById('prom-nombre').value = p.nombre;
  document.getElementById('prom-telefono').value = p.telefono || '';
  document.getElementById('prom-seccion').value = p.seccion;
  document.getElementById('prom-localidad').value = p.localidad || '';
  document.getElementById('titulo-form-prom').textContent = 'Editar Promotor';
  document.getElementById('btn-cancelar-prom').classList.remove('oculto');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetFormPromotor() {
  document.getElementById('form-promotor').reset();
  document.getElementById('prom-id').value = '';
  document.getElementById('titulo-form-prom').textContent = 'Registrar Promotor';
  document.getElementById('btn-cancelar-prom').classList.add('oculto');
  document.getElementById('estado-ine-promotor').classList.add('oculto');
}

async function eliminarPromotor(id) {
  if (!confirm('¿Eliminar este promotor?')) return;
  const res = await fetch(`/api/promotores/${id}`, { method: 'DELETE' });
  if (res.ok) cargarPromotores();
}

function exportarExcelPromotores() {
  const datos = cachePromotores.map(p => ({
    Seccion: p.seccion,
    Nombre: p.nombre,
    Telefono: p.telefono || '',
    Localidad: p.localidad || ''
  }));
  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Promotores');
  XLSX.writeFile(wb, 'Promotores_Cunduacan.xlsx');
}

async function importarExcelPromotores(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const buffer = await archivo.arrayBuffer();
  const wb = XLSX.read(buffer);
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja);

  const registros = filas.map(f => ({
    nombre: f.Nombre || f.nombre || f.NOMBRE,
    telefono: f.Telefono || f.telefono || f.TELEFONO || '',
    seccion: f.Seccion || f.seccion || f.SECCION,
    localidad: f.Localidad || f.localidad || f.LOCALIDAD || ''
  }));

  const res = await fetch('/api/promotores/importar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ registros })
  });
  const data = await res.json();
  alert(data.mensaje || data.error);
  e.target.value = '';
  cargarPromotores();
}

// ==========================================
// 4. ESTRUCTURA PRINCIPAL
// ==========================================
function toggleCampoRutaEstructura() {
  const rol = document.getElementById('est-rol').value;
  const grupoRuta = document.getElementById('grupo-est-ruta');
  const inputRuta = document.getElementById('est-ruta');
  if (rol === 'Coordinador de Zona') {
    grupoRuta.classList.add('oculto');
    inputRuta.required = false;
    inputRuta.value = '';
  } else {
    grupoRuta.classList.remove('oculto');
    inputRuta.required = true;
  }
}

async function cargarEstructura() {
  const res = await fetch('/api/estructura');
  if (res.ok) {
    cacheEstructura = await res.json();
    renderizarEstructura();
  }
}

function renderizarEstructura() {
  const fZona = (document.getElementById('filtro-est-zona').value || '').trim();
  const filtrados = cacheEstructura.filter(e => !fZona || String(e.zona) === fZona);

  const tbody = document.getElementById('tabla-estructura-body');
  tbody.innerHTML = filtrados.map(e => `
    <tr>
      <td>Zona ${e.zona}</td>
      <td>${e.ruta ? 'Ruta ' + e.ruta : '-'}</td>
      <td>${e.rol}</td>
      <td>${e.seccion}</td>
      <td>${e.nombres} ${e.apellidos}</td>
      <td>${e.telefono || ''}</td>
      <td>${e.localidad || ''}</td>
      <td>
        <button type="button" class="btn btn-editar" onclick="editarEstructura(${e.id})">Editar</button>
        <button type="button" class="btn btn-rojo" onclick="eliminarEstructura(${e.id})">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function guardarEstructura(e) {
  e.preventDefault();
  const id = document.getElementById('est-id').value;
  const secciones = document.getElementById('est-seccion').value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const payload = {
    rol: document.getElementById('est-rol').value,
    zona: document.getElementById('est-zona').value,
    ruta: document.getElementById('est-ruta').value || null,
    secciones,
    nombres: document.getElementById('est-nombres').value,
    apellidos: document.getElementById('est-apellidos').value,
    telefono: document.getElementById('est-telefono').value,
    localidad: document.getElementById('est-localidad').value
  };

  const url = id ? `/api/estructura/${id}/editar` : '/api/estructura';
  const method = id ? 'PATCH' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (res.ok) {
    resetFormEstructura();
    cargarEstructura();
  } else {
    alert(data.error || 'No se pudo guardar el registro.');
  }
}

function editarEstructura(id) {
  const e = cacheEstructura.find(item => item.id === id);
  if (!e) return;
  document.getElementById('est-id').value = e.id;
  document.getElementById('est-rol').value = e.rol;
  toggleCampoRutaEstructura();
  document.getElementById('est-zona').value = e.zona;
  document.getElementById('est-ruta').value = e.ruta || '';
  document.getElementById('est-seccion').value = e.seccion;
  document.getElementById('est-nombres').value = e.nombres;
  document.getElementById('est-apellidos').value = e.apellidos;
  document.getElementById('est-telefono').value = e.telefono || '';
  document.getElementById('est-localidad').value = e.localidad || '';
  document.getElementById('titulo-form-est').textContent = 'Editar Integrante de Estructura';
  document.getElementById('btn-cancelar-est').classList.remove('oculto');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetFormEstructura() {
  document.getElementById('form-estructura').reset();
  document.getElementById('est-id').value = '';
  toggleCampoRutaEstructura();
  document.getElementById('titulo-form-est').textContent = 'Registrar en Estructura Principal';
  document.getElementById('btn-cancelar-est').classList.add('oculto');
  document.getElementById('estado-ine-estructura').classList.add('oculto');
}

async function eliminarEstructura(id) {
  if (!confirm('¿Eliminar este integrante de la estructura?')) return;
  const res = await fetch(`/api/estructura/${id}`, { method: 'DELETE' });
  if (res.ok) cargarEstructura();
}

// ==========================================
// 5. USUARIOS (SOLO ADMIN)
// ==========================================
function toggleCampoSeccionUsuario() {
  const rol = document.getElementById('usu-rol').value;
  const grupo = document.getElementById('grupo-usu-seccion');
  if (rol === 'pase_lista') {
    grupo.classList.remove('oculto');
  } else {
    grupo.classList.add('oculto');
  }
}

async function cargarUsuarios() {
  const res = await fetch('/api/usuarios');
  if (!res.ok) return;
  const usuarios = await res.json();
  const tbody = document.getElementById('tabla-usuarios-body');
  tbody.innerHTML = usuarios.map(u => `
    <tr>
      <td>${u.usuario}</td>
      <td>${u.password}</td>
      <td>${u.rol}</td>
      <td>${u.seccion_asignada || '-'}</td>
      <td>
        ${u.usuario === 'admin' ? '' : `<button type="button" class="btn btn-rojo" onclick="eliminarUsuario(${u.id})">Eliminar</button>`}
      </td>
    </tr>
  `).join('');
}

async function crearUsuario(e) {
  e.preventDefault();
  const payload = {
    usuario: document.getElementById('usu-nombre').value,
    password: document.getElementById('usu-password').value,
    rol: document.getElementById('usu-rol').value,
    seccion_asignada: document.getElementById('usu-seccion').value
  };
  const res = await fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (res.ok) {
    document.getElementById('form-usuario').reset();
    toggleCampoSeccionUsuario();
    cargarUsuarios();
  } else {
    const data = await res.json();
    alert(data.error || 'Error al crear usuario.');
  }
}

async function eliminarUsuario(id) {
  if (!confirm('¿Eliminar este usuario?')) return;
  const res = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
  if (res.ok) cargarUsuarios();
}