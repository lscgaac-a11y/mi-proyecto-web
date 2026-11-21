// VARIABLES GLOBALES Y CONFIGURACIÓN
let usuarioActual = null;
let chartAvances = null;

let globalListaGeneral = [];
let globalSimpatizantesEdit = [];
let globalStaffEdit = [];
let globalPaseListaAdmin = [];
let globalPromotoresEdit = [];
let globalPromotoresLista = [];
let globalEstructuraPrincipal = [];

// 60 SECCIONES ELECTORALES OFICIALES DE CUNDUACÁN, TABASCO
// (0609 a 0653, 0655 a 0667, más 1202 y 1203 por división de la 0654)
const SECCIONES_CUNDUACAN = [
  ...Array.from({ length: 59 }, (_, i) => String(609 + i).padStart(4, '0')).filter(s => s !== '0654'),
  '1202',
  '1203'
];

const ITEMS_POR_PAGINA = 50;
let paginaActualLista = 1;
let paginaActualEditSimp = 1;
let paginaActualPaseListaAdmin = 1;
let paginaActualEditProm = 1;
let paginaActualResumenProm = 1;

// Variables de estado del Escáner INE
let streamCamaraINE = null;
let trackVideoINE = null;
let facingModeINE = 'environment';
let destinoFormularioINE = 'admin-simp';
let linternaActivaINE = false;
let zoomActualINE = 1.0;
let soportaZoomHardwareINE = false;

// Variables de estado del Editor de Recorte / Encuadre INE
let canvasFuenteRecorteINE = null;
let rotacionRecorteINE = 0;
let zoomRecorteINE = 1.0;
let offsetRecorteX = 0;
let offsetRecorteY = 0;
let arrastrandoRecorteINE = false;
let inicioArrastreX = 0;
let inicioArrastreY = 0;

// ==========================================
// INICIALIZACIÓN SEGURA Y MANTENER SESIÓN
// ==========================================
function iniciarApp() {
  const sesionGuardada = localStorage.getItem('sesionUsuario');
  
  if (sesionGuardada) {
    try {
      usuarioActual = JSON.parse(sesionGuardada);
      if (usuarioActual && usuarioActual.usuario) {
        if (usuarioActual.requiere_cambio) {
          mostrarVista('vista-cambio-password');
        } else {
          redirigirPorRol();
        }
        return;
      }
    } catch (error) {
      console.error("Memoria corrupta, limpiando...");
      localStorage.removeItem('sesionUsuario');
    }
  }
  
  mostrarVista('vista-login');
}

// ==========================================
// 1. CONTROL DE VISTAS Y RUTAS
// ==========================================
function mostrarVista(vistaId) {
  cerrarEscanerINE();
  document.getElementById('vista-login').style.display = 'none';
  document.getElementById('vista-cambio-password').style.display = 'none';
  document.getElementById('vista-admin').style.display = 'none';
  document.getElementById('vista-capturista').style.display = 'none';
  document.getElementById('vista-lista').style.display = 'none';
  
  if (vistaId !== 'vista-login' && vistaId !== 'vista-cambio-password') {
    document.getElementById('navbar').style.display = 'block';
  } else {
    document.getElementById('navbar').style.display = 'none';
  }
  document.getElementById(vistaId).style.display = 'block';
}

function cerrarSesion() {
  cerrarEscanerINE();
  usuarioActual = null;
  localStorage.removeItem('sesionUsuario'); 
  document.getElementById('formLogin').reset();
  mostrarVista('vista-login');
}

function redirigirPorRol() {
  document.getElementById('navTitle').innerText = `Panel: ${usuarioActual.rol.toUpperCase()} - ${usuarioActual.usuario}`;
  
  if (usuarioActual.rol === 'admin' || usuarioActual.rol === 'coordinador') {
    mostrarVista('vista-admin');
    
    const esAdmin = usuarioActual.rol === 'admin';
    
    document.getElementById('btn-admin-resumen').style.display = esAdmin ? 'block' : 'none';
    document.getElementById('btn-admin-grafica').style.display = esAdmin ? 'block' : 'none';
    document.getElementById('btn-admin-lista').style.display = esAdmin ? 'block' : 'none';
    document.getElementById('btn-admin-actualizar').style.display = esAdmin ? 'block' : 'none';
    document.getElementById('btn-admin-pase-lista-global').style.display = esAdmin ? 'block' : 'none';
    
    const optCoordinador = document.getElementById('optRolCoordinador');
    if (optCoordinador) optCoordinador.style.display = esAdmin ? 'block' : 'none';
    
    if (!esAdmin && document.getElementById('nuevoRol').value === 'coordinador') {
      document.getElementById('nuevoRol').value = 'capturista';
    }

    mostrarSeccionAdmin('admin-staff'); 
    if (esAdmin) cargarAvancesAdmin();
    cargarDatalistPromotores();
    
  } else if (usuarioActual.rol === 'capturista') {
    mostrarVista('vista-capturista');
    mostrarSubvistaCapturista('subvista-simp');
    cargarDatalistPromotores();
  } else if (usuarioActual.rol === 'pase_lista') {
    mostrarVista('vista-lista');
    document.getElementById('tituloSeccionLista').innerText = `Pase de Lista - Sección: ${usuarioActual.seccion_asignada}`;
    cargarPaseDeLista();
  }
}

function mostrarSubvistaCapturista(subvistaId) {
  document.getElementById('subvista-simp').style.display = (subvistaId === 'subvista-simp') ? 'block' : 'none';
  document.getElementById('subvista-prom').style.display = (subvistaId === 'subvista-prom') ? 'block' : 'none';
  
  document.getElementById('btnTabSimp').className = (subvistaId === 'subvista-simp') ? 'btn-primary' : 'btn-secondary';
  document.getElementById('btnTabProm').className = (subvistaId === 'subvista-prom') ? 'btn-primary' : 'btn-secondary';
}

async function cargarDatalistPromotores() {
  try {
    const res = await fetch('/api/promotores');
    globalPromotoresLista = await res.json();
    
    const htmlOptions = globalPromotoresLista.map(p => `<option value="${p.nombre} (Secc. ${p.seccion})"></option>`).join('');
    
    const dlAdmin = document.getElementById('listaPromotoresAdmin');
    const dlCap = document.getElementById('listaPromotoresCapturista');
    
    if (dlAdmin) dlAdmin.innerHTML = htmlOptions;
    if (dlCap) dlCap.innerHTML = htmlOptions;
  } catch (error) {
    console.error("Error al cargar datalist de promotores:", error);
  }
}

// ==========================================
// 2. LOGIN Y CAMBIO DE CONTRASEÑA
// ==========================================
document.getElementById('formLogin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorDiv = document.getElementById('loginError');
  errorDiv.style.display = 'none';

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usuario: document.getElementById('loginUsuario').value,
      password: document.getElementById('loginPassword').value
    })
  });

  if (res.ok) {
    usuarioActual = await res.json();
    localStorage.setItem('sesionUsuario', JSON.stringify(usuarioActual)); 
    if (usuarioActual.requiere_cambio) {
      mostrarVista('vista-cambio-password');
      return;
    }
    redirigirPorRol();
  } else {
    errorDiv.innerText = 'Usuario o contraseña incorrectos';
    errorDiv.style.display = 'block';
  }
});

document.getElementById('formCambioPassword').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p1 = document.getElementById('passNueva1').value;
  const p2 = document.getElementById('passNueva2').value;
  const errorDiv = document.getElementById('cambioPassError');
  errorDiv.style.display = 'none';

  if (p1 !== p2) {
    errorDiv.innerText = 'Las contraseñas no coinciden.';
    errorDiv.style.display = 'block';
    return;
  }
  const res = await fetch(`/api/usuarios/${usuarioActual.id}/password`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nuevoPassword: p1 })
  });

  if (res.ok) {
    usuarioActual.requiere_cambio = false;
    localStorage.setItem('sesionUsuario', JSON.stringify(usuarioActual)); 
    document.getElementById('formCambioPassword').reset();
    redirigirPorRol(); 
  } else {
    errorDiv.innerText = 'Error al guardar la contraseña.';
    errorDiv.style.display = 'block';
  }
});

// ==========================================
// 3. NAVEGACIÓN DEL PANEL ADMIN/COORDINADOR
// ==========================================
function mostrarSeccionAdmin(seccionId) {
  const secciones = document.getElementsByClassName('admin-seccion');
  for (let i = 0; i < secciones.length; i++) secciones[i].style.display = 'none';
  
  const botones = document.getElementsByClassName('nav-btn');
  for (let i = 0; i < botones.length; i++) botones[i].classList.remove('active');
  
  document.getElementById(seccionId).style.display = 'block';
  document.getElementById('btn-' + seccionId).classList.add('active');

  if (seccionId === 'admin-estructura') cargarEstructuraPrincipal();
  if (seccionId === 'admin-captura') cargarDatalistPromotores();
  if (seccionId === 'admin-lista') cargarListaGlobalAdmin();
  if (seccionId === 'admin-gestion-simp') cargarGestionSimpatizantes();
  if (seccionId === 'admin-gestion-staff') cargarGestionStaff();
  if (seccionId === 'admin-pase-lista-global') cargarPaseListaGlobalAdmin();
  if (seccionId === 'admin-gestion-promotores') cargarGestionPromotores();
  if (seccionId === 'admin-resumen-promotor') cargarResumenPromotor();
  if (seccionId === 'admin-exportar-importar') cargarSeccionesExportar();
}

function toggleSeccionAdmin() {
  const rol = document.getElementById('nuevoRol').value;
  document.getElementById('divSeccionAdmin').style.display = (rol === 'pase_lista') ? 'block' : 'none';
}

document.getElementById('formCrearUsuario').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      usuario: document.getElementById('nuevoUsuario').value,
      password: document.getElementById('nuevoPassword').value,
      rol: document.getElementById('nuevoRol').value,
      seccion_asignada: document.getElementById('nuevaSeccionAsignada').value
    })
  });
  if (res.ok) {
    alert('Usuario creado con éxito');
    document.getElementById('formCrearUsuario').reset();
    toggleSeccionAdmin();
  } else {
    alert('Error al crear usuario. Verifica que el nombre no exista ya.');
  }
});

// ==========================================
// 4. FUNCIONES DEL ADMINISTRADOR (GRÁFICAS)
// ==========================================
async function cargarAvancesAdmin() {
  try {
    const res = await fetch('/api/avances');
    const datos = await res.json();
    
    document.getElementById('tablaAvances').innerHTML = datos.map(d => `
      <tr><td><strong>${d.seccion}</strong></td><td>${d.total_registrados}</td><td>${d.total_asistieron}</td></tr>
    `).join('');

    const opcionesSecciones = '<option value="TODAS">Mostrar Todas</option>' + datos.map(d => `<option value="${d.seccion}">${d.seccion}</option>`).join('');
    ['filtroSeccionAdmin', 'filtroSeccionEditSimp', 'filtroSeccionPaseListaGlobal', 'filtroSeccionEditProm', 'filtroSeccionResumenProm'].forEach(id => {
      const sel = document.getElementById(id);
      if(sel) { const val = sel.value; sel.innerHTML = opcionesSecciones; if(val) sel.value = val; }
    });

    const ctx = document.getElementById('graficaAvances').getContext('2d');
    if (chartAvances) chartAvances.destroy(); 
    chartAvances = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: datos.map(d => `Secc ${d.seccion}`),
        datasets: [
          { label: 'Faltan de Votar', data: datos.map(d => d.total_registrados - d.total_asistieron), backgroundColor: '#94a3b8' },
          { label: 'Ya Votaron', data: datos.map(d => d.total_asistieron), backgroundColor: '#16a34a' }
        ]
      },
      options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }
    });

  } catch (error) { console.error("Error al cargar avances:", error); }
}

// ==========================================
// 5. LISTA GENERAL (Paginada)
// ==========================================
async function cargarListaGlobalAdmin() {
  const res = await fetch('/api/simpatizantes-todos');
  globalListaGeneral = await res.json();
  paginaActualLista = 1;
  renderListaGlobal();
}

function renderListaGlobal() {
  const filtroSec = document.getElementById('filtroSeccionAdmin').value;
  const filtroTxt = document.getElementById('buscadorListaGlobal').value.toLowerCase();

  let filtrados = globalListaGeneral.filter(s => {
    const matchSec = (filtroSec === "TODAS" || s.seccion === filtroSec);
    const matchTxt = s.nombre.toLowerCase().includes(filtroTxt);
    return matchSec && matchTxt;
  });

  const totalPaginas = Math.ceil(filtrados.length / ITEMS_POR_PAGINA) || 1;
  if (paginaActualLista > totalPaginas) paginaActualLista = totalPaginas;

  const inicio = (paginaActualLista - 1) * ITEMS_POR_PAGINA;
  const paginados = filtrados.slice(inicio, inicio + ITEMS_POR_PAGINA);

  document.getElementById('tablaGlobalAdmin').innerHTML = paginados.map(simp => `
    <tr>
      <td><span style="background:#e2e8f0; padding:3px 6px; border-radius:4px; font-weight:600;">${simp.seccion}</span></td>
      <td><strong>${simp.nombre}</strong></td>
      <td>${simp.telefono || '---'}</td>
      <td>${simp.referencia || '---'}</td>
      <td>${simp.asistio ? `<span style="color: #166534; font-weight: bold;">✅ Ya Votó</span>` : `<span style="color: #991b1b; font-weight: bold;">⏳ Pendiente</span>`}</td>
    </tr>
  `).join('');

  document.getElementById('paginacionListaGlobal').innerHTML = `
    <button class="btn-secondary" style="padding: 6px 12px; opacity: ${paginaActualLista === 1 ? '0.5' : '1'}; pointer-events: ${paginaActualLista === 1 ? 'none' : 'auto'};" onclick="cambiarPaginaLista(-1)">⬅️ Anterior</button>
    <span style="font-weight: 600; font-size: 0.9rem;">Página ${paginaActualLista} de ${totalPaginas} <br><small style="color: #64748b; font-weight: normal;">(${filtrados.length} resultados)</small></span>
    <button class="btn-secondary" style="padding: 6px 12px; opacity: ${paginaActualLista === totalPaginas ? '0.5' : '1'}; pointer-events: ${paginaActualLista === totalPaginas ? 'none' : 'auto'};" onclick="cambiarPaginaLista(1)">Siguiente ➡️</button>
  `;
}

function cambiarPaginaLista(delta) {
  paginaActualLista += delta;
  renderListaGlobal();
}

// ==========================================
// 6. EDICIÓN DE BASES DE DATOS
// ==========================================
async function cargarGestionStaff() {
  const res = await fetch('/api/usuarios');
  globalStaffEdit = await res.json();
  const seccionesStaff = [...new Set(globalStaffEdit.map(u => u.seccion_asignada).filter(s => s))].sort();
  const select = document.getElementById('filtroSeccionEditStaff');
  const valActual = select.value;
  select.innerHTML = '<option value="TODAS">Mostrar Todas</option>' + seccionesStaff.map(s => `<option value="${s}">${s}</option>`).join('');
  if(valActual) select.value = valActual;
  renderGestionStaff();
}

function renderGestionStaff() {
  const filtroSec = document.getElementById('filtroSeccionEditStaff').value;
  let filtrados = globalStaffEdit.filter(u => (filtroSec === "TODAS" || u.seccion_asignada === filtroSec));

  document.getElementById('tablaGestionStaff').innerHTML = filtrados.map(u => `
    <tr>
      <td><strong>${u.usuario}</strong></td>
      <td><span style="font-family: monospace; background: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${u.password}</span></td>
      <td>${u.rol.toUpperCase()}</td>
      <td>${u.seccion_asignada || '---'}</td>
      <td><button class="btn-secondary" style="background:#dc2626; padding: 4px 8px;" onclick="eliminarStaff(${u.id})">🗑️ Borrar</button></td>
    </tr>
  `).join('');
}

async function eliminarStaff(id) {
  if(confirm('¿Seguro que quieres borrar este usuario del sistema?')) {
    await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
    cargarGestionStaff();
  }
}

async function cargarGestionSimpatizantes() {
  const res = await fetch('/api/simpatizantes-todos');
  globalSimpatizantesEdit = await res.json();
  paginaActualEditSimp = 1;
  renderGestionSimpatizantes();
}

function renderGestionSimpatizantes() {
  const filtroSec = document.getElementById('filtroSeccionEditSimp').value;
  const filtroTxt = document.getElementById('buscadorEditSimp').value.toLowerCase();

  let filtrados = globalSimpatizantesEdit.filter(s => {
    const matchSec = (filtroSec === "TODAS" || s.seccion === filtroSec);
    const matchTxt = s.nombre.toLowerCase().includes(filtroTxt);
    return matchSec && matchTxt;
  });

  const totalPaginas = Math.ceil(filtrados.length / ITEMS_POR_PAGINA) || 1;
  if (paginaActualEditSimp > totalPaginas) paginaActualEditSimp = totalPaginas;

  const inicio = (paginaActualEditSimp - 1) * ITEMS_POR_PAGINA;
  const paginados = filtrados.slice(inicio, inicio + ITEMS_POR_PAGINA);

  document.getElementById('tablaGestionSimp').innerHTML = paginados.map(s => `
    <tr>
      <td>${s.seccion}</td>
      <td><strong>${s.nombre}</strong></td>
      <td>${s.telefono || ''}</td>
      <td style="display:flex; gap:5px;">
        <button class="btn-primary" style="padding: 4px 8px;" onclick="abrirModalEditarSimp(${s.id})">✏️</button>
        <button class="btn-secondary" style="background:#dc2626; padding: 4px 8px;" onclick="eliminarSimpatizante(${s.id})">🗑️</button>
      </td>
    </tr>
  `).join('');

  document.getElementById('paginacionEditSimp').innerHTML = `
    <button class="btn-secondary" style="padding: 6px 12px; opacity: ${paginaActualEditSimp === 1 ? '0.5' : '1'}; pointer-events: ${paginaActualEditSimp === 1 ? 'none' : 'auto'};" onclick="cambiarPaginaEditSimp(-1)">⬅️ Anterior</button>
    <span style="font-weight: 600; font-size: 0.9rem;">Página ${paginaActualEditSimp} de ${totalPaginas} <br><small style="color: #64748b; font-weight: normal;">(${filtrados.length} resultados)</small></span>
    <button class="btn-secondary" style="padding: 6px 12px; opacity: ${paginaActualEditSimp === totalPaginas ? '0.5' : '1'}; pointer-events: ${paginaActualEditSimp === totalPaginas ? 'none' : 'auto'};" onclick="cambiarPaginaEditSimp(1)">Siguiente ➡️</button>
  `;
}

function cambiarPaginaEditSimp(delta) {
  paginaActualEditSimp += delta;
  renderGestionSimpatizantes();
}

function abrirModalEditarSimp(id) {
  const simp = globalSimpatizantesEdit.find(x => x.id === id);
  document.getElementById('editSimpId').value = simp.id;
  document.getElementById('editSimpNombre').value = simp.nombre;
  document.getElementById('editSimpTelefono').value = simp.telefono;
  document.getElementById('editSimpSeccion').value = simp.seccion;
  document.getElementById('editSimpLocalidad').value = simp.localidad;
  document.getElementById('editSimpReferencia').value = simp.referencia;
  document.getElementById('modalEditarSimp').style.display = 'flex';
}

document.getElementById('formEditarSimp').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('editSimpId').value;
  await fetch(`/api/simpatizantes/${id}/editar`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: document.getElementById('editSimpNombre').value.toUpperCase(),
      telefono: document.getElementById('editSimpTelefono').value,
      seccion: document.getElementById('editSimpSeccion').value,
      localidad: document.getElementById('editSimpLocalidad').value,
      referencia: document.getElementById('editSimpReferencia').value
    })
  });
  document.getElementById('modalEditarSimp').style.display = 'none';
  cargarGestionSimpatizantes();
  if (usuarioActual.rol === 'admin') cargarAvancesAdmin(); 
});

async function eliminarSimpatizante(id) {
  if(confirm('¿Eliminar permanentemente a este simpatizante?')) {
    await fetch(`/api/simpatizantes/${id}`, { method: 'DELETE' });
    cargarGestionSimpatizantes();
    if (usuarioActual.rol === 'admin') cargarAvancesAdmin(); 
  }
}

// ==========================================
// 7. CAPTURA DESDE ADMIN/COORDINADOR
// ==========================================
document.getElementById('formAdminSimpatizante').addEventListener('submit', async (e) => {
  e.preventDefault();
  const apellidos = document.getElementById('adminSimpApellidos').value.trim().toUpperCase();
  const nombres = document.getElementById('adminSimpNombres').value.trim().toUpperCase();
  const nombreFormatoLista = `${apellidos}, ${nombres}`;
  const promotor = document.getElementById('adminSimpPromotor').value.trim();

  const res = await fetch('/api/simpatizantes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: nombreFormatoLista,
      telefono: document.getElementById('adminSimpTelefono').value,
      seccion: document.getElementById('adminSimpSeccion').value.trim().padStart(4, '0'),
      localidad: document.getElementById('adminSimpLocalidad').value.trim().toUpperCase(),
      referencia: promotor
    })
  });
  if (res.ok) {
    alert('Simpatizante guardado correctamente');
    document.getElementById('formAdminSimpatizante').reset();
    if (usuarioActual.rol === 'admin') cargarAvancesAdmin(); 
  } else {
    alert('Error al guardar simpatizante');
  }
});

// ==========================================
// 8. PASE DE LISTA GLOBAL (ADMIN)
// ==========================================
async function cargarPaseListaGlobalAdmin() {
  const res = await fetch('/api/simpatizantes-todos');
  globalPaseListaAdmin = await res.json();
  paginaActualPaseListaAdmin = 1;
  renderPaseListaGlobalAdmin();
}

function renderPaseListaGlobalAdmin() {
  const filtroSec = document.getElementById('filtroSeccionPaseListaGlobal').value;
  const filtroTxt = document.getElementById('buscadorPaseListaGlobal').value.toLowerCase();

  let filtrados = globalPaseListaAdmin.filter(s => {
    const matchSec = (filtroSec === "TODAS" || s.seccion === filtroSec);
    const matchTxt = s.nombre.toLowerCase().includes(filtroTxt);
    return matchSec && matchTxt;
  });

  const totalPaginas = Math.ceil(filtrados.length / ITEMS_POR_PAGINA) || 1;
  if (paginaActualPaseListaAdmin > totalPaginas) paginaActualPaseListaAdmin = totalPaginas;

  const inicio = (paginaActualPaseListaAdmin - 1) * ITEMS_POR_PAGINA;
  const paginados = filtrados.slice(inicio, inicio + ITEMS_POR_PAGINA);

  document.getElementById('tablaPaseListaGlobal').innerHTML = paginados.map(simp => `
    <tr>
      <td><span style="background:#e2e8f0; padding:3px 6px; border-radius:4px; font-weight:600;">${simp.seccion}</span></td>
      <td><strong>${simp.nombre}</strong><br><small>${simp.telefono || ''}</small></td>
      <td>${simp.localidad}<br><small style="color:#6b7280;">${simp.referencia || ''}</small></td>
      <td>
        ${simp.asistio 
          ? `<div style="color: #166534; font-weight: 600; display: flex; align-items: center; gap: 8px;">
               <input type="checkbox" checked disabled style="transform: scale(1.5);"> 
               <span>Ya votó</span>
             </div>`
          : `<div style="display: flex; gap: 12px; align-items: center;">
               <input type="checkbox" id="check_admin_${simp.id}" style="transform: scale(1.5);">
               <button class="btn-primary" style="padding: 6px 12px; font-size: 0.85rem; width: auto;" onclick="guardarCheckInAdmin(${simp.id})">Guardar</button>
             </div>`
        }
      </td>
    </tr>
  `).join('');

  document.getElementById('paginacionPaseListaGlobal').innerHTML = `
    <button class="btn-secondary" style="padding: 6px 12px; opacity: ${paginaActualPaseListaAdmin === 1 ? '0.5' : '1'}; pointer-events: ${paginaActualPaseListaAdmin === 1 ? 'none' : 'auto'};" onclick="cambiarPaginaPaseListaAdmin(-1)">⬅️ Anterior</button>
    <span style="font-weight: 600; font-size: 0.9rem;">Página ${paginaActualPaseListaAdmin} de ${totalPaginas} <br><small style="color: #64748b; font-weight: normal;">(${filtrados.length} resultados)</small></span>
    <button class="btn-secondary" style="padding: 6px 12px; opacity: ${paginaActualPaseListaAdmin === totalPaginas ? '0.5' : '1'}; pointer-events: ${paginaActualPaseListaAdmin === totalPaginas ? 'none' : 'auto'};" onclick="cambiarPaginaPaseListaAdmin(1)">Siguiente ➡️</button>
  `;
}

function cambiarPaginaPaseListaAdmin(delta) {
  paginaActualPaseListaAdmin += delta;
  renderPaseListaGlobalAdmin();
}

async function guardarCheckInAdmin(id) {
  const casilla = document.getElementById(`check_admin_${id}`);
  if (!casilla.checked) {
    alert("⚠️ Primero marca la casilla antes de presionar Guardar.");
    return;
  }
  if (confirm("¿Confirmar Check In? Una vez guardado, YA NO se podrá desmarcar.")) {
    const res = await fetch(`/api/simpatizantes/${id}/asistencia`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asistio: true })
    });
    if (res.ok) {
      const simp = globalPaseListaAdmin.find(s => s.id === id);
      if (simp) simp.asistio = true;
      renderPaseListaGlobalAdmin();
      if (usuarioActual.rol === 'admin') cargarAvancesAdmin();
    } else {
      alert("Hubo un error al conectar con la base de datos.");
    }
  }
}

// ==========================================
// 9. LÓGICA DE PROMOTORES
// ==========================================
async function guardarPromotorComun(nombresId, apellidosId, telId, seccId, locId, formId) {
  const nombres = document.getElementById(nombresId).value.trim().toUpperCase();
  const apellidos = document.getElementById(apellidosId).value.trim().toUpperCase();
  const nombreCompleto = `${nombres} ${apellidos}`;

  const res = await fetch('/api/promotores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: nombreCompleto,
      telefono: document.getElementById(telId).value,
      seccion: document.getElementById(seccId).value.trim().padStart(4, '0'),
      localidad: document.getElementById(locId).value.trim().toUpperCase()
    })
  });
  if (res.ok) {
    alert('Promotor guardado correctamente');
    document.getElementById(formId).reset();
    cargarDatalistPromotores();
  } else {
    alert('Error al guardar promotor');
  }
}

document.getElementById('formAdminPromotor').addEventListener('submit', (e) => {
  e.preventDefault();
  guardarPromotorComun('promNombres', 'promApellidos', 'promTelefono', 'promSeccion', 'promLocalidad', 'formAdminPromotor');
});

document.getElementById('formCapturistaPromotor').addEventListener('submit', (e) => {
  e.preventDefault();
  guardarPromotorComun('capPromNombres', 'capPromApellidos', 'capPromTelefono', 'capPromSeccion', 'capPromLocalidad', 'formCapturistaPromotor');
});

async function cargarGestionPromotores() {
  const res = await fetch('/api/promotores');
  globalPromotoresEdit = await res.json();
  paginaActualEditProm = 1;
  renderGestionPromotores();
}

function renderGestionPromotores() {
  const filtroSec = document.getElementById('filtroSeccionEditProm').value;
  const filtroTxt = document.getElementById('buscadorEditProm').value.toLowerCase();

  let filtrados = globalPromotoresEdit.filter(p => {
    const matchSec = (filtroSec === "TODAS" || p.seccion === filtroSec);
    const matchTxt = p.nombre.toLowerCase().includes(filtroTxt);
    return matchSec && matchTxt;
  });

  const totalPaginas = Math.ceil(filtrados.length / ITEMS_POR_PAGINA) || 1;
  if (paginaActualEditProm > totalPaginas) paginaActualEditProm = totalPaginas;

  const inicio = (paginaActualEditProm - 1) * ITEMS_POR_PAGINA;
  const paginados = filtrados.slice(inicio, inicio + ITEMS_POR_PAGINA);

  document.getElementById('tablaGestionProm').innerHTML = paginados.map(p => `
    <tr>
      <td>${p.seccion}</td>
      <td><strong>${p.nombre}</strong></td>
      <td>${p.telefono || '---'}</td>
      <td>${p.localidad || '---'}</td>
      <td style="display:flex; gap:5px;">
        <button class="btn-primary" style="padding: 4px 8px;" onclick="abrirModalEditarProm(${p.id})">✏️</button>
        <button class="btn-secondary" style="background:#dc2626; padding: 4px 8px;" onclick="eliminarPromotor(${p.id})">🗑️</button>
      </td>
    </tr>
  `).join('');

  document.getElementById('paginacionEditProm').innerHTML = `
    <button class="btn-secondary" style="padding: 6px 12px; opacity: ${paginaActualEditProm === 1 ? '0.5' : '1'}; pointer-events: ${paginaActualEditProm === 1 ? 'none' : 'auto'};" onclick="cambiarPaginaEditProm(-1)">⬅️ Anterior</button>
    <span style="font-weight: 600; font-size: 0.9rem;">Página ${paginaActualEditProm} de ${totalPaginas} <br><small style="color: #64748b; font-weight: normal;">(${filtrados.length} resultados)</small></span>
    <button class="btn-secondary" style="padding: 6px 12px; opacity: ${paginaActualEditProm === totalPaginas ? '0.5' : '1'}; pointer-events: ${paginaActualEditProm === totalPaginas ? 'none' : 'auto'};" onclick="cambiarPaginaEditProm(1)">Siguiente ➡️</button>
  `;
}

function cambiarPaginaEditProm(delta) {
  paginaActualEditProm += delta;
  renderGestionPromotores();
}

function abrirModalEditarProm(id) {
  const prom = globalPromotoresEdit.find(x => x.id === id);
  document.getElementById('editPromId').value = prom.id;
  document.getElementById('editPromNombre').value = prom.nombre;
  document.getElementById('editPromTelefono').value = prom.telefono;
  document.getElementById('editPromSeccion').value = prom.seccion;
  document.getElementById('editPromLocalidad').value = prom.localidad;
  document.getElementById('modalEditarProm').style.display = 'flex';
}

document.getElementById('formEditarProm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('editPromId').value;
  await fetch(`/api/promotores/${id}/editar`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: document.getElementById('editPromNombre').value.toUpperCase(),
      telefono: document.getElementById('editPromTelefono').value,
      seccion: document.getElementById('editPromSeccion').value,
      localidad: document.getElementById('editPromLocalidad').value
    })
  });
  document.getElementById('modalEditarProm').style.display = 'none';
  cargarGestionPromotores();
  cargarDatalistPromotores();
});

async function eliminarPromotor(id) {
  if(confirm('¿Eliminar permanentemente a este promotor?')) {
    await fetch(`/api/promotores/${id}`, { method: 'DELETE' });
    cargarGestionPromotores();
    cargarDatalistPromotores();
  }
}

// ==========================================
// 10. RESUMEN POR PROMOTOR Y EFECTIVIDAD
// ==========================================
function normalizarTexto(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

async function cargarResumenPromotor() {
  const [resProm, resSimp] = await Promise.all([
    fetch('/api/promotores'),
    fetch('/api/simpatizantes-todos')
  ]);
  
  globalPromotoresEdit = await resProm.json();
  globalListaGeneral = await resSimp.json();
  
  paginaActualResumenProm = 1;
  renderResumenPromotor();
}

function renderResumenPromotor() {
  const filtroSec = document.getElementById('filtroSeccionResumenProm').value;
  const filtroTxt = normalizarTexto(document.getElementById('buscadorResumenProm').value);

  let filtrados = globalPromotoresEdit.filter(p => {
    const matchSec = (filtroSec === "TODAS" || p.seccion === filtroSec);
    const matchTxt = normalizarTexto(p.nombre).includes(filtroTxt);
    return matchSec && matchTxt;
  });

  const totalPaginas = Math.ceil(filtrados.length / ITEMS_POR_PAGINA) || 1;
  if (paginaActualResumenProm > totalPaginas) paginaActualResumenProm = totalPaginas;

  const inicio = (paginaActualResumenProm - 1) * ITEMS_POR_PAGINA;
  const paginados = filtrados.slice(inicio, inicio + ITEMS_POR_PAGINA);

  const contenedor = document.getElementById('contenedorResumenPromotores');
  
  if (paginados.length === 0) {
    contenedor.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px;">No se encontraron promotores.</p>';
  } else {
    contenedor.innerHTML = paginados.map(p => {
      const nombrePromotorNorm = normalizarTexto(p.nombre);

      const simpatizantesProm = globalListaGeneral.filter(s => {
        const refNorm = normalizarTexto(s.referencia);
        if (!refNorm || !nombrePromotorNorm) return false;
        
        const refSoloNombre = refNorm.replace(/\(secc\..*?\)/g, '').trim();
        return refSoloNombre === nombrePromotorNorm || refNorm.includes(nombrePromotorNorm);
      });

      const totalSimp = simpatizantesProm.length;
      const votaronSimp = simpatizantesProm.filter(s => s.asistio).length;

      const metaVotos = 15;
      const porcentajeEfectividad = ((votaronSimp / metaVotos) * 100).toFixed(1);

      let estiloBadgingEfectividad = 'background: #fee2e2; color: #991b1b;';
      if (porcentajeEfectividad >= 100) {
        estiloBadgingEfectividad = 'background: #dcfce7; color: #15803d;';
      } else if (porcentajeEfectividad >= 50) {
        estiloBadgingEfectividad = 'background: #fef9c3; color: #854d0e;';
      }

      return `
        <div class="card" style="margin-bottom: 15px; border: 1px solid #cbd5e1; border-left: 5px solid #2563eb;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
            <div>
              <h3 style="margin: 0; font-size: 1.1rem; color: #1e293b;">👔 ${p.nombre}</h3>
              <small style="color: #64748b;">Sección: <strong>${p.seccion}</strong> | Localidad: ${p.localidad || '---'} | Tel: ${p.telefono || '---'}</small>
            </div>
            <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
              <span style="background: #e2e8f0; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 0.85rem;">
                Simpatizantes: ${totalSimp}
              </span>
              <span style="background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 12px; font-weight: 600; font-size: 0.85rem;">
                Votaron: ${votaronSimp} / 15
              </span>
              <span style="${estiloBadgingEfectividad} padding: 4px 10px; border-radius: 12px; font-weight: bold; font-size: 0.85rem;">
                🎯 Efectividad: ${porcentajeEfectividad}%
              </span>
            </div>
          </div>
          
          ${totalSimp > 0 ? `
            <div style="max-height: 200px; overflow-y: auto; overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 6px; margin-top: 10px;">
              <table class="table" style="margin: 0; font-size: 0.85rem;">
                <thead style="position: sticky; top: 0; background: #f8fafc;">
                  <tr><th>Sección</th><th>Nombre Simpatizante</th><th>Teléfono</th><th>Estatus</th></tr>
                </thead>
                <tbody>
                  ${simpatizantesProm.map(s => `
                    <tr>
                      <td>${s.seccion}</td>
                      <td><strong>${s.nombre}</strong></td>
                      <td>${s.telefono || '---'}</td>
                      <td>
                        ${s.asistio 
                          ? '<span style="color: #166534; font-weight: bold;">✅ Ya Votó</span>' 
                          : '<span style="color: #991b1b; font-weight: bold;">⏳ Pendiente</span>'}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p style="margin: 5px 0 0 0; font-size: 0.85rem; color: #94a3b8; font-style: italic;">Sin simpatizantes registrados aún.</p>'}
        </div>
      `;
    }).join('');
  }

  document.getElementById('paginacionResumenProm').innerHTML = `
    <button class="btn-secondary" style="padding: 6px 12px; opacity: ${paginaActualResumenProm === 1 ? '0.5' : '1'}; pointer-events: ${paginaActualResumenProm === 1 ? 'none' : 'auto'};" onclick="cambiarPaginaResumenProm(-1)">⬅️ Anterior</button>
    <span style="font-weight: 600; font-size: 0.9rem;">Página ${paginaActualResumenProm} de ${totalPaginas} <br><small style="color: #64748b; font-weight: normal;">(${filtrados.length} resultados)</small></span>
    <button class="btn-secondary" style="padding: 6px 12px; opacity: ${paginaActualResumenProm === totalPaginas ? '0.5' : '1'}; pointer-events: ${paginaActualResumenProm === totalPaginas ? 'none' : 'auto'};" onclick="cambiarPaginaResumenProm(1)">Siguiente ➡️</button>
  `;
}

function cambiarPaginaResumenProm(delta) {
  paginaActualResumenProm += delta;
  renderResumenPromotor();
}

// ==========================================
// 11. FUNCIONES DE CAPTURISTA REGULAR
// ==========================================
document.getElementById('formSimpatizante').addEventListener('submit', async (e) => {
  e.preventDefault();
  const apellidos = document.getElementById('simpApellidos').value.trim().toUpperCase();
  const nombres = document.getElementById('simpNombres').value.trim().toUpperCase();
  const nombreFormatoLista = `${apellidos}, ${nombres}`;
  const promotor = document.getElementById('simpPromotor').value.trim();

  const res = await fetch('/api/simpatizantes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: nombreFormatoLista,
      telefono: document.getElementById('simpTelefono').value,
      seccion: document.getElementById('simpSeccion').value.trim().padStart(4, '0'),
      localidad: document.getElementById('simpLocalidad').value.trim().toUpperCase(),
      referencia: promotor
    })
  });
  if (res.ok) {
    alert('Simpatizante guardado correctamente');
    document.getElementById('formSimpatizante').reset();
  } else {
    alert('Error al guardar simpatizante');
  }
});

async function cargarPaseDeLista() {
  const res = await fetch(`/api/simpatizantes/${usuarioActual.seccion_asignada}`);
  const datos = await res.json();
  document.getElementById('tablaPaseLista').innerHTML = datos.map(simp => `
    <tr>
      <td><strong>${simp.nombre}</strong><br><small>${simp.telefono || ''}</small></td>
      <td>${simp.localidad}</td>
      <td>${simp.referencia || ''}</td>
      <td>
        ${simp.asistio 
          ? `<div style="color: #166534; font-weight: 600; display: flex; align-items: center; gap: 8px;">
               <input type="checkbox" checked disabled style="transform: scale(1.5);"> 
               <span>Ya votó</span>
             </div>`
          : `<div style="display: flex; gap: 12px; align-items: center;">
               <input type="checkbox" id="check_${simp.id}" style="transform: scale(1.5);">
               <button class="btn-primary" style="padding: 6px 12px; font-size: 0.85rem; width: auto;" onclick="guardarCheckIn(${simp.id})">Guardar</button>
             </div>`
        }
      </td>
    </tr>
  `).join('');
}

async function guardarCheckIn(id) {
  const casilla = document.getElementById(`check_${id}`);
  if (!casilla.checked) {
    alert("⚠️ Primero marca la casilla antes de presionar Guardar.");
    return;
  }
  if (confirm("¿Confirmar Check In? Una vez guardado, YA NO se podrá desmarcar.")) {
    const res = await fetch(`/api/simpatizantes/${id}/asistencia`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asistio: true })
    });
    if (res.ok) cargarPaseDeLista();
    else alert("Hubo un error al conectar con la base de datos.");
  }
}

function filtrarLista() {
  const filtro = document.getElementById('buscadorLista').value.toLowerCase();
  const filas = document.getElementById('tablaPaseLista').getElementsByTagName('tr');
  for (let i = 0; i < filas.length; i++) {
    const celdaNombre = filas[i].getElementsByTagName('td')[0];
    if (celdaNombre) {
      const texto = celdaNombre.textContent || celdaNombre.innerText;
      filas[i].style.display = (texto.toLowerCase().indexOf(filtro) > -1) ? "" : "none";
    }
  }
}

// ==========================================
// 12. EXPORTAR E IMPORTAR BASE DE DATOS (EXCEL Y PDF)
// ==========================================
function obtenerFechaHoy() {
  return new Date().toISOString().split('T')[0];
}

async function cargarSeccionesExportar() {
  try {
    const [resSimp, resProm] = await Promise.all([
      fetch('/api/simpatizantes-todos'),
      fetch('/api/promotores')
    ]);
    const simpatizantes = await resSimp.json();
    const promotores = await resProm.json();

    const seccionesUnicas = [
      ...new Set([
        ...SECCIONES_CUNDUACAN,
        ...simpatizantes.map(s => String(s.seccion).trim()),
        ...promotores.map(p => String(p.seccion).trim())
      ].filter(Boolean))
    ].sort();

    const select = document.getElementById('filtroSeccionExportar');
    if (select) {
      const valActual = select.value;
      select.innerHTML = '<option value="TODAS">Todas las Secciones</option>' +
        seccionesUnicas.map(sec => `<option value="${sec}">Sección ${sec}</option>`).join('');
      if (valActual && (valActual === 'TODAS' || seccionesUnicas.includes(valActual))) {
        select.value = valActual;
      }
    }
  } catch (error) {
    console.error('Error al cargar secciones para exportar:', error);
  }
}

async function exportarSimpatizantesExcel() {
  try {
    const res = await fetch('/api/simpatizantes-todos');
    let datos = await res.json();

    const seccionSel = document.getElementById('filtroSeccionExportar').value;
    if (seccionSel !== 'TODAS') {
      datos = datos.filter(s => String(s.seccion).trim() === String(seccionSel).trim());
    }

    if (datos.length === 0) {
      return alert(seccionSel === 'TODAS'
        ? 'No hay simpatizantes para exportar.'
        : `No hay simpatizantes registrados en la Sección ${seccionSel}.`);
    }

    const filas = datos.map(s => ({
      'ID': s.id,
      'Sección': s.seccion,
      'Nombre Completo': s.nombre,
      'Teléfono': s.telefono || '',
      'Localidad': s.localidad || '',
      'Promotor / Referencia': s.referencia || '',
      'Estatus Voto': s.asistio ? 'YA VOTÓ' : 'PENDIENTE'
    }));

    const sufijo = seccionSel === 'TODAS' ? 'Todas' : `Secc_${seccionSel}`;
    const hoja = XLSX.utils.json_to_sheet(filas);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Simpatizantes');
    XLSX.writeFile(libro, `Simpatizantes_${sufijo}_${obtenerFechaHoy()}.xlsx`);
  } catch (error) {
    alert('Error al generar archivo Excel.');
  }
}

async function exportarSimpatizantesPDF() {
  try {
    const res = await fetch('/api/simpatizantes-todos');
    let datos = await res.json();

    const seccionSel = document.getElementById('filtroSeccionExportar').value;
    if (seccionSel !== 'TODAS') {
      datos = datos.filter(s => String(s.seccion).trim() === String(seccionSel).trim());
    }

    if (datos.length === 0) {
      return alert(seccionSel === 'TODAS'
        ? 'No hay simpatizantes para exportar.'
        : `No hay simpatizantes registrados en la Sección ${seccionSel}.`);
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');

    const textoSeccion = seccionSel === 'TODAS' ? 'Todas las Secciones' : `Sección ${seccionSel}`;
    doc.setFontSize(16);
    doc.text(`Listado de Simpatizantes (${textoSeccion})`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Fecha de generación: ${obtenerFechaHoy()} | Total registros: ${datos.length}`, 14, 22);

    const columnas = ['Secc.', 'Nombre Completo', 'Teléfono', 'Localidad', 'Promotor / Ref', 'Estatus'];
    const filas = datos.map(s => [
      s.seccion,
      s.nombre,
      s.telefono || '---',
      s.localidad || '---',
      s.referencia || '---',
      s.asistio ? 'YA VOTÓ' : 'PENDIENTE'
    ]);

    doc.autoTable({
      head: [columnas],
      body: filas,
      startY: 28,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] }
    });

    const sufijo = seccionSel === 'TODAS' ? 'Todas' : `Secc_${seccionSel}`;
    doc.save(`Simpatizantes_${sufijo}_${obtenerFechaHoy()}.pdf`);
  } catch (error) {
    alert('Error al generar archivo PDF.');
  }
}

async function exportarPromotoresExcel() {
  try {
    const [resProm, resSimp] = await Promise.all([
      fetch('/api/promotores'),
      fetch('/api/simpatizantes-todos')
    ]);
    let promotores = await resProm.json();
    const simpatizantes = await resSimp.json();

    const seccionSel = document.getElementById('filtroSeccionExportar').value;
    if (seccionSel !== 'TODAS') {
      promotores = promotores.filter(p => String(p.seccion).trim() === String(seccionSel).trim());
    }

    if (promotores.length === 0) {
      return alert(seccionSel === 'TODAS'
        ? 'No hay promotores para exportar.'
        : `No hay promotores registrados en la Sección ${seccionSel}.`);
    }

    const filas = promotores.map(p => {
      const nomNorm = normalizarTexto(p.nombre);
      const simpProm = simpatizantes.filter(s => {
        const refNorm = normalizarTexto(s.referencia);
        const refSoloNombre = refNorm.replace(/\(secc\..*?\)/g, '').trim();
        return refSoloNombre === nomNorm || refNorm.includes(nomNorm);
      });
      const votaron = simpProm.filter(s => s.asistio).length;
      const efectividad = ((votaron / 15) * 100).toFixed(1) + '%';

      return {
        'ID': p.id,
        'Sección': p.seccion,
        'Nombre Promotor': p.nombre,
        'Teléfono': p.telefono || '',
        'Localidad': p.localidad || '',
        'Total Simpatizantes': simpProm.length,
        'Ya Votaron': votaron,
        'Efectividad (Meta 15)': efectividad
      };
    });

    const sufijo = seccionSel === 'TODAS' ? 'Todas' : `Secc_${seccionSel}`;
    const hoja = XLSX.utils.json_to_sheet(filas);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Promotores');
    XLSX.writeFile(libro, `Promotores_${sufijo}_${obtenerFechaHoy()}.xlsx`);
  } catch (error) {
    alert('Error al generar archivo Excel de promotores.');
  }
}

async function exportarPromotoresPDF() {
  try {
    const [resProm, resSimp] = await Promise.all([
      fetch('/api/promotores'),
      fetch('/api/simpatizantes-todos')
    ]);
    let promotores = await resProm.json();
    const simpatizantes = await resSimp.json();

    const seccionSel = document.getElementById('filtroSeccionExportar').value;
    if (seccionSel !== 'TODAS') {
      promotores = promotores.filter(p => String(p.seccion).trim() === String(seccionSel).trim());
    }

    if (promotores.length === 0) {
      return alert(seccionSel === 'TODAS'
        ? 'No hay promotores para exportar.'
        : `No hay promotores registrados en la Sección ${seccionSel}.`);
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const textoSeccion = seccionSel === 'TODAS' ? 'Todas las Secciones' : `Sección ${seccionSel}`;
    doc.setFontSize(16);
    doc.text(`Reporte de Promotores y Efectividad (${textoSeccion})`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Fecha: ${obtenerFechaHoy()} | Meta por promotor: 15 votos = 100%`, 14, 22);

    const columnas = ['Secc.', 'Promotor', 'Localidad', 'Simp.', 'Votaron', 'Efectividad'];
    const filas = promotores.map(p => {
      const nomNorm = normalizarTexto(p.nombre);
      const simpProm = simpatizantes.filter(s => {
        const refNorm = normalizarTexto(s.referencia);
        const refSoloNombre = refNorm.replace(/\(secc\..*?\)/g, '').trim();
        return refSoloNombre === nomNorm || refNorm.includes(nomNorm);
      });
      const votaron = simpProm.filter(s => s.asistio).length;
      const efectividad = ((votaron / 15) * 100).toFixed(1) + '%';

      return [p.seccion, p.nombre, p.localidad || '---', simpProm.length, `${votaron} / 15`, efectividad];
    });

    doc.autoTable({
      head: [columnas],
      body: filas,
      startY: 28,
      styles: { fontSize: 8.5 },
      headStyles: { fillColor: [22, 163, 74] }
    });

    const sufijo = seccionSel === 'TODAS' ? 'Todas' : `Secc_${seccionSel}`;
    doc.save(`Promotores_Efectividad_${sufijo}_${obtenerFechaHoy()}.pdf`);
  } catch (error) {
    alert('Error al generar PDF de promotores.');
  }
}

function descargarPlantillaSimpatizantes() {
  const ejemplo = [
    { nombre: 'PEREZ LOPEZ, JUAN', telefono: '9141000000', seccion: '0645', localidad: 'CENTRO', referencia: 'CARLOS RUIZ (Secc. 0645)' }
  ];
  const hoja = XLSX.utils.json_to_sheet(ejemplo);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Plantilla_Simpatizantes');
  XLSX.writeFile(libro, 'Plantilla_Importar_Simpatizantes.xlsx');
}

function descargarPlantillaPromotores() {
  const ejemplo = [
    { nombre: 'CARLOS RUIZ', telefono: '9141000000', seccion: '0645', localidad: 'CENTRO' }
  ];
  const hoja = XLSX.utils.json_to_sheet(ejemplo);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Plantilla_Promotores');
  XLSX.writeFile(libro, 'Plantilla_Importar_Promotores.xlsx');
}

function importarExcel(tipo) {
  const inputId = tipo === 'simpatizantes' ? 'archivoExcelSimpatizantes' : 'archivoExcelPromotores';
  const input = document.getElementById(inputId);
  const archivo = input.files[0];

  if (!archivo) {
    alert('⚠️ Por favor selecciona primero un archivo Excel (.xlsx o .csv).');
    return;
  }

  const lector = new FileReader();
  lector.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const primeraHoja = workbook.SheetNames[0];
      const filasCrudas = XLSX.utils.sheet_to_json(workbook.Sheets[primeraHoja]);

      if (filasCrudas.length === 0) {
        alert('El archivo Excel está vacío.');
        return;
      }

      const registros = filasCrudas.map(fila => {
        const obj = {};
        for (const clave in fila) {
          const k = normalizarTexto(clave);
          if (k.includes('nombre')) obj.nombre = fila[clave];
          if (k.includes('tel')) obj.telefono = fila[clave];
          if (k.includes('secc')) obj.seccion = fila[clave];
          if (k.includes('localidad') || k.includes('colonia')) obj.localidad = fila[clave];
          if (k.includes('ref') || k.includes('promotor')) obj.referencia = fila[clave];
          if (k.includes('estatus') || k.includes('voto') || k.includes('asistio')) {
            const val = normalizarTexto(String(fila[clave]));
            obj.asistio = (val === 'true' || val === '1' || val === 'si' || val.includes('voto'));
          }
        }
        return obj;
      }).filter(r => r.nombre && r.seccion);

      if (registros.length === 0) {
        alert('❌ No se encontraron filas válidas. Verifica que existan las columnas "nombre" y "seccion".');
        return;
      }

      if (!confirm(`Se detectaron ${registros.length} registros válidos para importar. ¿Deseas guardarlos en la base de datos?`)) {
        return;
      }

      const endpoint = tipo === 'simpatizantes' ? '/api/simpatizantes/importar' : '/api/promotores/importar';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registros })
      });

      const resultado = await res.json();
      if (res.ok) {
        alert(`✅ ${resultado.mensaje}`);
        input.value = '';
        if (usuarioActual.rol === 'admin') cargarAvancesAdmin();
        cargarDatalistPromotores();
        cargarSeccionesExportar();
      } else {
        alert(`❌ Error: ${resultado.error}`);
      }
    } catch (error) {
      console.error(error);
      alert('Error al leer el archivo. Asegúrate de que sea un Excel válido.');
    }
  };
  lector.readAsArrayBuffer(archivo);
}

// ==========================================
// 13. ESTRUCTURA PRINCIPAL (20 ZONAS, 37 RUTAS, 60 SECCIONES)
// ==========================================
function parsearSeccionesLista(seccionTexto) {
  if (!seccionTexto) return [];
  return String(seccionTexto)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function obtenerMapaSeccionesOcupadasPorRol(rol, excludeId = null) {
  const mapa = new Map();
  globalEstructuraPrincipal
    .filter(item => item.rol === rol && (!excludeId || Number(item.id) !== Number(excludeId)))
    .forEach(item => {
      const secs = parsearSeccionesLista(item.seccion);
      const etiqueta = item.rol === 'Coordinador de Zona'
        ? `Zona ${item.zona}: ${item.nombres} ${item.apellidos}`
        : item.rol === 'Coordinador de Ruta'
          ? `Ruta ${item.ruta}: ${item.nombres} ${item.apellidos}`
          : `${item.nombres} ${item.apellidos}`;
      secs.forEach(s => mapa.set(s, etiqueta));
    });
  return mapa;
}

async function cargarEstructuraPrincipal() {
  try {
    const res = await fetch('/api/estructura');
    globalEstructuraPrincipal = await res.json();

    poblarSelectoresEstructura();
    actualizarCamposEstructura();
    actualizarContadoresEstructura();
    renderEstructuraPrincipal();
  } catch (error) {
    console.error('Error al cargar estructura principal:', error);
  }
}

function poblarSelectoresEstructura() {
  const zonasOcupadas = new Map();
  globalEstructuraPrincipal
    .filter(x => x.rol === 'Coordinador de Zona' && x.zona)
    .forEach(x => zonasOcupadas.set(Number(x.zona), `${x.nombres} ${x.apellidos}`));

  const selZona = document.getElementById('estZona');
  const filtroZona = document.getElementById('filtroZonaEstructura');
  let htmlZonas = '';
  let primeraZonaLibre = null;

  for (let z = 1; z <= 20; z++) {
    const ocupadoPor = zonasOcupadas.get(z);
    if (!ocupadoPor && primeraZonaLibre === null) primeraZonaLibre = z;
    htmlZonas += `<option value="${z}" ${ocupadoPor ? 'disabled' : ''}>Zona ${z}${ocupadoPor ? ` (Ocupada: ${ocupadoPor})` : ' (Disponible)'}</option>`;
  }
  selZona.innerHTML = htmlZonas;
  if (primeraZonaLibre) selZona.value = String(primeraZonaLibre);

  if (filtroZona) {
    const valActualFiltro = filtroZona.value;
    let htmlFiltroZona = '<option value="TODAS">Todas las Zonas</option>';
    for (let z = 1; z <= 20; z++) {
      htmlFiltroZona += `<option value="${z}">Zona ${z}</option>`;
    }
    filtroZona.innerHTML = htmlFiltroZona;
    if (valActualFiltro) filtroZona.value = valActualFiltro;
  }

  const rutasOcupadas = new Map();
  globalEstructuraPrincipal
    .filter(x => x.rol === 'Coordinador de Ruta' && x.ruta)
    .forEach(x => rutasOcupadas.set(Number(x.ruta), `${x.nombres} ${x.apellidos}`));

  const selRuta = document.getElementById('estRuta');
  let htmlRutas = '';
  let primeraRutaLibre = null;

  for (let r = 1; r <= 37; r++) {
    const ocupadoPor = rutasOcupadas.get(r);
    if (!ocupadoPor && primeraRutaLibre === null) primeraRutaLibre = r;
    htmlRutas += `<option value="${r}" ${ocupadoPor ? 'disabled' : ''}>Ruta ${r}${ocupadoPor ? ` (Ocupada: ${ocupadoPor})` : ' (Disponible)'}</option>`;
  }
  selRuta.innerHTML = htmlRutas;
  if (primeraRutaLibre) selRuta.value = String(primeraRutaLibre);

  const seccionesJefeOcupadas = obtenerMapaSeccionesOcupadasPorRol('Jefe de Sección', null);

  const selSeccionUnica = document.getElementById('estSeccionUnica');
  let htmlSecciones = '';
  let primeraSeccionLibre = null;

  SECCIONES_CUNDUACAN.forEach(sec => {
    const ocupadoPor = seccionesJefeOcupadas.get(sec);
    if (!ocupadoPor && primeraSeccionLibre === null) primeraSeccionLibre = sec;
    htmlSecciones += `<option value="${sec}" ${ocupadoPor ? 'disabled' : ''}>Sección ${sec}${ocupadoPor ? ` (Ocupada: ${ocupadoPor})` : ' (Disponible)'}</option>`;
  });
  selSeccionUnica.innerHTML = htmlSecciones;
  if (primeraSeccionLibre) selSeccionUnica.value = primeraSeccionLibre;
}

function renderCheckboxesSecciones(contenedorId, prefijo, seleccionadas = [], rol = null, excludeId = null) {
  const cont = document.getElementById(contenedorId);
  if (!cont) return;

  const rolActual = rol || (prefijo === 'est'
    ? document.getElementById('estRol').value
    : document.getElementById('editEstRol').value);

  const ocupadas = obtenerMapaSeccionesOcupadasPorRol(rolActual, excludeId);
  const setSel = new Set(seleccionadas.map(s => String(s).trim()));

  cont.innerHTML = SECCIONES_CUNDUACAN.map(sec => {
    const ocupadoPor = ocupadas.get(sec);

    if (ocupadoPor) {
      return `
        <label class="item-check-seccion-${prefijo}" data-sec="${sec}" title="Bloqueada - Ocupada por ${ocupadoPor}" style="display: flex; align-items: center; gap: 4px; font-size: 0.82rem; padding: 4px 6px; border: 1px solid #e2e8f0; border-radius: 4px; background: #f1f5f9; color: #94a3b8; cursor: not-allowed; margin: 0; opacity: 0.8;">
          <input type="checkbox" class="chk-sec-${prefijo}" value="${sec}" disabled>
          <span>🔒 ${sec}</span>
        </label>
      `;
    }

    const checked = setSel.has(sec) ? 'checked' : '';
    return `
      <label class="item-check-seccion-${prefijo}" data-sec="${sec}" style="display: flex; align-items: center; gap: 5px; font-size: 0.85rem; padding: 4px 6px; border: 1px solid #e2e8f0; border-radius: 4px; background: ${checked ? '#eff6ff' : '#ffffff'}; cursor: pointer; margin: 0;">
        <input type="checkbox" class="chk-sec-${prefijo}" value="${sec}" ${checked} onchange="actualizarContadorCheckSecciones('${prefijo}')">
        <span>${sec}</span>
      </label>
    `;
  }).join('');

  actualizarContadorCheckSecciones(prefijo);
}

function actualizarContadorCheckSecciones(prefijo) {
  const checks = document.querySelectorAll(`.chk-sec-${prefijo}`);
  let totalSel = 0;
  let totalBloq = 0;

  checks.forEach(chk => {
    if (chk.disabled) {
      totalBloq++;
      return;
    }
    const lbl = chk.closest('label');
    if (chk.checked) {
      totalSel++;
      if (lbl) lbl.style.background = '#eff6ff';
    } else {
      if (lbl) lbl.style.background = '#ffffff';
    }
  });

  const disponibles = SECCIONES_CUNDUACAN.length - totalBloq;
  const spanId = prefijo === 'est' ? 'contadorCheckSecciones' : 'contadorEditCheckSecciones';
  const span = document.getElementById(spanId);
  if (span) {
    span.innerText = `${totalSel} seleccionada${totalSel === 1 ? '' : 's'} (${totalBloq} ocupadas, ${disponibles} disponibles)`;
  }
}

function filtrarCheckboxesSecciones(prefijo) {
  const filtro = document.getElementById('filtroCheckSecciones').value.trim();
  const items = document.querySelectorAll(`.item-check-seccion-${prefijo}`);
  items.forEach(lbl => {
    const sec = lbl.getAttribute('data-sec');
    lbl.style.display = sec.includes(filtro) ? 'flex' : 'none';
  });
}

function limpiarCheckboxesSecciones(prefijo) {
  const checks = document.querySelectorAll(`.chk-sec-${prefijo}:not(:disabled)`);
  checks.forEach(chk => { chk.checked = false; });
  actualizarContadorCheckSecciones(prefijo);
}

function obtenerSeccionesMarcadas(prefijo) {
  return Array.from(document.querySelectorAll(`.chk-sec-${prefijo}:checked:not(:disabled)`)).map(chk => chk.value);
}

function actualizarCamposEstructura() {
  const rol = document.getElementById('estRol').value;
  const grupoZona = document.getElementById('grupoEstZona');
  const grupoRuta = document.getElementById('grupoEstRuta');
  const grupoSeccionUnica = document.getElementById('grupoEstSeccionUnica');
  const grupoSeccionesMulti = document.getElementById('grupoEstSeccionesMulti');

  const selZona = document.getElementById('estZona');
  const selRuta = document.getElementById('estRuta');
  const selSeccionUnica = document.getElementById('estSeccionUnica');

  grupoZona.style.display = 'block';
  selZona.required = true;

  if (rol === 'Coordinador de Zona') {
    grupoRuta.style.display = 'none';
    selRuta.required = false;
    grupoSeccionUnica.style.display = 'none';
    selSeccionUnica.required = false;
    grupoSeccionesMulti.style.display = 'block';

    const prevSel = obtenerSeccionesMarcadas('est');
    renderCheckboxesSecciones('gridCheckSeccionesEst', 'est', prevSel, 'Coordinador de Zona', null);
    filtrarCheckboxesSecciones('est');
  } else if (rol === 'Coordinador de Ruta') {
    grupoRuta.style.display = 'block';
    selRuta.required = true;
    grupoSeccionUnica.style.display = 'none';
    selSeccionUnica.required = false;
    grupoSeccionesMulti.style.display = 'block';

    const prevSel = obtenerSeccionesMarcadas('est');
    renderCheckboxesSecciones('gridCheckSeccionesEst', 'est', prevSel, 'Coordinador de Ruta', null);
    filtrarCheckboxesSecciones('est');
  } else if (rol === 'Jefe de Sección') {
    grupoRuta.style.display = 'block';
    selRuta.required = true;
    grupoSeccionUnica.style.display = 'block';
    selSeccionUnica.required = true;
    grupoSeccionesMulti.style.display = 'none';
  }
}

function actualizarContadoresEstructura() {
  const totalZonas = globalEstructuraPrincipal.filter(x => x.rol === 'Coordinador de Zona').length;
  const totalRutas = globalEstructuraPrincipal.filter(x => x.rol === 'Coordinador de Ruta').length;
  const totalSecciones = globalEstructuraPrincipal.filter(x => x.rol === 'Jefe de Sección').length;
  const totalGeneral = globalEstructuraPrincipal.length;

  document.getElementById('contadorEstZonas').innerText = `${totalZonas} / 20`;
  document.getElementById('contadorEstRutas').innerText = `${totalRutas} / 37`;
  document.getElementById('contadorEstSecciones').innerText = `${totalSecciones} / 60`;
  document.getElementById('contadorEstTotal').innerText = `${totalGeneral} / 117`;
}

document.getElementById('formEstructuraPrincipal').addEventListener('submit', async (e) => {
  e.preventDefault();
  const rol = document.getElementById('estRol').value;
  const zona = document.getElementById('estZona').value;
  const ruta = document.getElementById('estRuta').value;

  let secciones = [];
  if (rol === 'Jefe de Sección') {
    const secUnica = document.getElementById('estSeccionUnica').value;
    if (!secUnica) {
      alert('⚠️ No hay secciones disponibles para Jefe de Sección.');
      return;
    }
    secciones = [secUnica];
  } else {
    secciones = obtenerSeccionesMarcadas('est');
    if (secciones.length === 0) {
      alert('⚠️ Debes seleccionar al menos 1 sección electoral disponible para este rol.');
      return;
    }
  }

  const res = await fetch('/api/estructura', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rol,
      zona,
      ruta: rol === 'Coordinador de Zona' ? null : ruta,
      secciones,
      nombres: document.getElementById('estNombres').value.trim().toUpperCase(),
      apellidos: document.getElementById('estApellidos').value.trim().toUpperCase(),
      telefono: document.getElementById('estTelefono').value.trim(),
      localidad: document.getElementById('estLocalidad').value.trim().toUpperCase()
    })
  });

  const data = await res.json();
  if (res.ok) {
    alert(`✅ ${data.mensaje}`);
    document.getElementById('estNombres').value = '';
    document.getElementById('estApellidos').value = '';
    document.getElementById('estTelefono').value = '';
    document.getElementById('estLocalidad').value = '';
    document.getElementById('filtroCheckSecciones').value = '';
    await cargarEstructuraPrincipal();
  } else {
    alert(`⚠️ ${data.error}`);
  }
});

function renderEstructuraPrincipal() {
  const filtroRol = document.getElementById('filtroRolEstructura').value;
  const filtroZona = document.getElementById('filtroZonaEstructura').value;
  const filtroTxt = normalizarTexto(document.getElementById('buscadorEstructura').value);

  const filtrados = globalEstructuraPrincipal.filter(item => {
    const matchRol = (filtroRol === 'TODOS' || item.rol === filtroRol);
    const matchZona = (filtroZona === 'TODAS' || String(item.zona) === String(filtroZona));
    const textoFila = normalizarTexto(`${item.nombres} ${item.apellidos} ${item.localidad} ${item.seccion || ''} ${item.telefono || ''}`);
    const matchTxt = textoFila.includes(filtroTxt);
    return matchRol && matchZona && matchTxt;
  });

  const tbody = document.getElementById('tablaEstructuraPrincipal');
  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #64748b; padding: 16px;">No hay integrantes registrados con ese filtro.</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map(item => {
    let badgeRol = 'background: #dbeafe; color: #1e40af;';
    let estiloFila = '';
    if (item.rol === 'Coordinador de Zona') {
      estiloFila = 'background: #f8fafc;';
    } else if (item.rol === 'Coordinador de Ruta') {
      badgeRol = 'background: #dcfce7; color: #166534;';
    } else if (item.rol === 'Jefe de Sección') {
      badgeRol = 'background: #fef9c3; color: #854d0e;';
    }

    const secs = parsearSeccionesLista(item.seccion);
    const htmlSecciones = secs.length > 0
      ? secs.map(s => `<span style="display:inline-block; background:#e2e8f0; padding:2px 6px; border-radius:4px; font-weight:600; font-size:0.78rem; margin:1px;">${s}</span>`).join(' ')
      : '---';

    return `
      <tr style="${estiloFila}">
        <td><strong>${item.zona ? `Zona ${item.zona}` : '---'}</strong></td>
        <td>${item.ruta ? `Ruta ${item.ruta}` : '---'}</td>
        <td><span style="${badgeRol} padding: 3px 8px; border-radius: 12px; font-weight: 600; font-size: 0.8rem; white-space: nowrap;">${item.rol}</span></td>
        <td>${htmlSecciones}</td>
        <td><strong>${item.nombres} ${item.apellidos}</strong></td>
        <td>${item.telefono || '---'}</td>
        <td>${item.localidad || '---'}</td>
        <td style="display: flex; gap: 5px;">
          <button class="btn-primary" style="padding: 4px 8px;" onclick="abrirModalEditarEstructura(${item.id})">✏️</button>
          <button class="btn-secondary" style="background: #dc2626; color: white; padding: 4px 8px;" onclick="eliminarEstructura(${item.id})">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function actualizarCamposModalEstructura() {
  const rol = document.getElementById('editEstRol').value;
  const editId = document.getElementById('editEstId').value;

  document.getElementById('grupoEditEstRuta').style.display = (rol === 'Coordinador de Zona') ? 'none' : 'block';
  document.getElementById('grupoEditEstSeccionUnica').style.display = (rol === 'Jefe de Sección') ? 'block' : 'none';
  document.getElementById('grupoEditEstSeccionesMulti').style.display = (rol === 'Jefe de Sección') ? 'none' : 'block';

  if (rol !== 'Jefe de Sección') {
    const prevSel = obtenerSeccionesMarcadas('edit');
    renderCheckboxesSecciones('gridCheckSeccionesEdit', 'edit', prevSel, rol, editId);
  }
}

function abrirModalEditarEstructura(id) {
  const item = globalEstructuraPrincipal.find(x => x.id === id);
  if (!item) return;

  const zonasOcupadas = new Map();
  globalEstructuraPrincipal
    .filter(x => x.rol === 'Coordinador de Zona' && x.zona && x.id !== id)
    .forEach(x => zonasOcupadas.set(Number(x.zona), `${x.nombres} ${x.apellidos}`));

  let optZonas = '';
  for (let z = 1; z <= 20; z++) {
    const oc = zonasOcupadas.get(z);
    optZonas += `<option value="${z}" ${oc ? 'disabled' : ''}>Zona ${z}${oc ? ` (Ocupada: ${oc})` : ''}</option>`;
  }
  document.getElementById('editEstZona').innerHTML = optZonas;

  const rutasOcupadas = new Map();
  globalEstructuraPrincipal
    .filter(x => x.rol === 'Coordinador de Ruta' && x.ruta && x.id !== id)
    .forEach(x => rutasOcupadas.set(Number(x.ruta), `${x.nombres} ${x.apellidos}`));

  let optRutas = '';
  for (let r = 1; r <= 37; r++) {
    const oc = rutasOcupadas.get(r);
    optRutas += `<option value="${r}" ${oc ? 'disabled' : ''}>Ruta ${r}${oc ? ` (Ocupada: ${oc})` : ''}</option>`;
  }
  document.getElementById('editEstRuta').innerHTML = optRutas;

  const secsJefeOcupadas = obtenerMapaSeccionesOcupadasPorRol('Jefe de Sección', id);
  document.getElementById('editEstSeccionUnica').innerHTML = SECCIONES_CUNDUACAN
    .map(sec => {
      const oc = secsJefeOcupadas.get(sec);
      return `<option value="${sec}" ${oc ? 'disabled' : ''}>Sección ${sec}${oc ? ` (Ocupada: ${oc})` : ''}</option>`;
    })
    .join('');

  const secsActuales = parsearSeccionesLista(item.seccion);

  document.getElementById('editEstId').value = item.id;
  document.getElementById('editEstRol').value = item.rol;
  document.getElementById('editEstZona').value = item.zona || 1;
  document.getElementById('editEstRuta').value = item.ruta || 1;
  document.getElementById('editEstSeccionUnica').value = secsActuales[0] || SECCIONES_CUNDUACAN[0];
  document.getElementById('editEstNombres').value = item.nombres;
  document.getElementById('editEstApellidos').value = item.apellidos;
  document.getElementById('editEstTelefono').value = item.telefono || '';
  document.getElementById('editEstLocalidad').value = item.localidad || '';

  renderCheckboxesSecciones('gridCheckSeccionesEdit', 'edit', secsActuales, item.rol, item.id);
  actualizarCamposModalEstructura();
  document.getElementById('modalEditarEstructura').style.display = 'flex';
}

document.getElementById('formEditarEstructura').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('editEstId').value;
  const rol = document.getElementById('editEstRol').value;

  let secciones = [];
  if (rol === 'Jefe de Sección') {
    secciones = [document.getElementById('editEstSeccionUnica').value];
  } else {
    secciones = obtenerSeccionesMarcadas('edit');
    if (secciones.length === 0) {
      alert('⚠️ Debes seleccionar al menos 1 sección electoral.');
      return;
    }
  }

  const res = await fetch(`/api/estructura/${id}/editar`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rol,
      zona: document.getElementById('editEstZona').value,
      ruta: rol === 'Coordinador de Zona' ? null : document.getElementById('editEstRuta').value,
      secciones,
      nombres: document.getElementById('editEstNombres').value.trim().toUpperCase(),
      apellidos: document.getElementById('editEstApellidos').value.trim().toUpperCase(),
      telefono: document.getElementById('editEstTelefono').value.trim(),
      localidad: document.getElementById('editEstLocalidad').value.trim().toUpperCase()
    })
  });

  const data = await res.json();
  if (res.ok) {
    document.getElementById('modalEditarEstructura').style.display = 'none';
    await cargarEstructuraPrincipal();
  } else {
    alert(`⚠️ ${data.error}`);
  }
});

async function eliminarEstructura(id) {
  if (confirm('¿Eliminar permanentemente a este integrante de la Estructura Principal?')) {
    await fetch(`/api/estructura/${id}`, { method: 'DELETE' });
    await cargarEstructuraPrincipal();
  }
}

function construirJerarquiaEstructura(datos) {
  const zonasSet = new Set(datos.map(d => Number(d.zona)).filter(Boolean));
  const zonasOrdenadas = Array.from(zonasSet).sort((a, b) => a - b);

  return zonasOrdenadas.map(z => {
    const itemsZona = datos.filter(d => Number(d.zona) === z);
    const coordZona = itemsZona.find(d => d.rol === 'Coordinador de Zona') || null;
    const coordsRuta = itemsZona.filter(d => d.rol === 'Coordinador de Ruta').sort((a, b) => Number(a.ruta) - Number(b.ruta));
    const jefesSeccion = itemsZona.filter(d => d.rol === 'Jefe de Sección').sort((a, b) => String(a.seccion).localeCompare(String(b.seccion)));

    const rutasSet = new Set([
      ...coordsRuta.map(r => Number(r.ruta)).filter(Boolean),
      ...jefesSeccion.map(j => Number(j.ruta)).filter(Boolean)
    ]);
    const rutasOrdenadas = Array.from(rutasSet).sort((a, b) => a - b);

    const rutasArbol = rutasOrdenadas.map(r => ({
      ruta: r,
      coordRuta: coordsRuta.find(c => Number(c.ruta) === r) || null,
      jefes: jefesSeccion.filter(j => Number(j.ruta) === r)
    }));

    const jefesSinRuta = jefesSeccion.filter(j => !j.ruta);

    return {
      zona: z,
      coordZona,
      rutas: rutasArbol,
      jefesSinRuta,
      totalRutas: coordsRuta.length,
      totalJefes: jefesSeccion.length,
      totalPersonasACargo: coordsRuta.length + jefesSeccion.length
    };
  });
}

async function exportarEstructuraExcel() {
  try {
    const res = await fetch('/api/estructura');
    const datos = await res.json();
    if (datos.length === 0) return alert('No hay registros en la Estructura Principal para exportar.');

    const jerarquia = construirJerarquiaEstructura(datos);
    const filasJerarquicas = [];
    const filasResumenZona = [];

    jerarquia.forEach(bloque => {
      const cz = bloque.coordZona;
      const nombreCZ = cz ? `${cz.nombres} ${cz.apellidos}` : 'SIN ASIGNAR';
      const telCZ = cz ? (cz.telefono || '---') : '---';
      const locCZ = cz ? (cz.localidad || '---') : '---';
      const secCZ = cz ? (cz.seccion || '---') : '---';

      filasResumenZona.push({
        'Zona': `Zona ${bloque.zona}`,
        'Coordinador de Zona': nombreCZ,
        'Teléfono': telCZ,
        'Localidad': locCZ,
        'Secciones de Zona': secCZ,
        'Coord. de Ruta': bloque.totalRutas,
        'Jefes de Sección': bloque.totalJefes,
        'Total Personas a Cargo': bloque.totalPersonasACargo
      });

      filasJerarquicas.push({
        'Jerarquía': `ZONA ${bloque.zona}`,
        'Zona': `Zona ${bloque.zona}`,
        'Ruta': '---',
        'Rol': 'COORDINADOR DE ZONA',
        'Sección(es) Asignada(s)': secCZ,
        'Nombre Completo': nombreCZ,
        'Teléfono': telCZ,
        'Localidad': locCZ,
        'Personal a Cargo': `${bloque.totalRutas} Coord. Ruta | ${bloque.totalJefes} Jefes Secc. (Total: ${bloque.totalPersonasACargo})`
      });

      bloque.rutas.forEach(rObj => {
        const cr = rObj.coordRuta;
        const nombreCR = cr ? `${cr.nombres} ${cr.apellidos}` : 'SIN ASIGNAR';
        const telCR = cr ? (cr.telefono || '---') : '---';
        const locCR = cr ? (cr.localidad || '---') : '---';
        const secCR = cr ? (cr.seccion || '---') : '---';

        filasJerarquicas.push({
          'Jerarquía': `   ↳ RUTA ${rObj.ruta}`,
          'Zona': `Zona ${bloque.zona}`,
          'Ruta': `Ruta ${rObj.ruta}`,
          'Rol': 'COORDINADOR DE RUTA',
          'Sección(es) Asignada(s)': secCR,
          'Nombre Completo': nombreCR,
          'Teléfono': telCR,
          'Localidad': locCR,
          'Personal a Cargo': `${rObj.jefes.length} Jefes de Sección`
        });

        rObj.jefes.forEach(j => {
          filasJerarquicas.push({
            'Jerarquía': `      ↳ SECCIÓN ${j.seccion}`,
            'Zona': `Zona ${bloque.zona}`,
            'Ruta': `Ruta ${rObj.ruta}`,
            'Rol': 'JEFE DE SECCIÓN',
            'Sección(es) Asignada(s)': j.seccion,
            'Nombre Completo': `${j.nombres} ${j.apellidos}`,
            'Teléfono': j.telefono || '---',
            'Localidad': j.localidad || '---',
            'Personal a Cargo': `Sección ${j.seccion}`
          });
        });
      });

      bloque.jefesSinRuta.forEach(j => {
        filasJerarquicas.push({
          'Jerarquía': `      ↳ SECCIÓN ${j.seccion}`,
          'Zona': `Zona ${bloque.zona}`,
          'Ruta': '---',
          'Rol': 'JEFE DE SECCIÓN',
          'Sección(es) Asignada(s)': j.seccion,
          'Nombre Completo': `${j.nombres} ${j.apellidos}`,
          'Teléfono': j.telefono || '---',
          'Localidad': j.localidad || '---',
          'Personal a Cargo': `Sección ${j.seccion}`
        });
      });

      filasJerarquicas.push({});
    });

    const libro = XLSX.utils.book_new();
    const hojaJerarquia = XLSX.utils.json_to_sheet(filasJerarquicas);
    const hojaResumen = XLSX.utils.json_to_sheet(filasResumenZona);

    XLSX.utils.book_append_sheet(libro, hojaJerarquia, 'Desglose_Jerarquico');
    XLSX.utils.book_append_sheet(libro, hojaResumen, 'Resumen_por_Zona');
    XLSX.writeFile(libro, `Estructura_Jerarquica_Cunduacan_${obtenerFechaHoy()}.xlsx`);
  } catch (error) {
    console.error(error);
    alert('Error al exportar la Estructura Principal a Excel.');
  }
}

async function exportarEstructuraPDF() {
  try {
    const res = await fetch('/api/estructura');
    const datos = await res.json();
    if (datos.length === 0) return alert('No hay registros en la Estructura Principal para exportar.');

    const jerarquia = construirJerarquiaEstructura(datos);
    const totalZ = datos.filter(d => d.rol === 'Coordinador de Zona').length;
    const totalR = datos.filter(d => d.rol === 'Coordinador de Ruta').length;
    const totalS = datos.filter(d => d.rol === 'Jefe de Sección').length;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');

    doc.setFontSize(15);
    doc.text('Estructura Principal Jerárquica - Cunduacán', 14, 14);
    doc.setFontSize(9.5);
    doc.text(`Fecha: ${obtenerFechaHoy()} | Zonas: ${totalZ}/20 | Rutas: ${totalR}/37 | Jefes de Sección: ${totalS}/60 | Total: ${datos.length}/117`, 14, 21);

    const columnas = ['Nivel / Ubicación', 'Rol', 'Nombre Completo', 'Sección(es) a Cargo', 'Teléfono', 'Localidad', 'A Cargo'];
    const bodyRows = [];

    jerarquia.forEach(bloque => {
      const cz = bloque.coordZona;
      const nombreCZ = cz ? `${cz.nombres} ${cz.apellidos}` : 'SIN ASIGNAR';
      const telCZ = cz ? (cz.telefono || '---') : '---';
      const locCZ = cz ? (cz.localidad || '---') : '---';
      const secCZ = cz ? (cz.seccion || '---') : '---';

      bodyRows.push([
        { content: `ZONA ${bloque.zona}`, styles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' } },
        { content: 'COORD. DE ZONA', styles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' } },
        { content: nombreCZ, styles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' } },
        { content: secCZ, styles: { fillColor: [30, 64, 175], textColor: 255 } },
        { content: telCZ, styles: { fillColor: [30, 64, 175], textColor: 255 } },
        { content: locCZ, styles: { fillColor: [30, 64, 175], textColor: 255 } },
        { content: `${bloque.totalRutas} Rutas | ${bloque.totalJefes} Jefes`, styles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' } }
      ]);

      bloque.rutas.forEach(rObj => {
        const cr = rObj.coordRuta;
        const nombreCR = cr ? `${cr.nombres} ${cr.apellidos}` : 'SIN ASIGNAR';
        const telCR = cr ? (cr.telefono || '---') : '---';
        const locCR = cr ? (cr.localidad || '---') : '---';
        const secCR = cr ? (cr.seccion || '---') : '---';

        bodyRows.push([
          { content: `  ↳ Ruta ${rObj.ruta}`, styles: { fillColor: [220, 252, 231], fontStyle: 'bold' } },
          { content: 'Coord. de Ruta', styles: { fillColor: [220, 252, 231], fontStyle: 'bold' } },
          { content: nombreCR, styles: { fillColor: [220, 252, 231], fontStyle: 'bold' } },
          { content: secCR, styles: { fillColor: [220, 252, 231] } },
          { content: telCR, styles: { fillColor: [220, 252, 231] } },
          { content: locCR, styles: { fillColor: [220, 252, 231] } },
          { content: `${rObj.jefes.length} Jefes Secc.`, styles: { fillColor: [220, 252, 231] } }
        ]);

        rObj.jefes.forEach(j => {
          bodyRows.push([
            `      ↳ Secc. ${j.seccion}`,
            'Jefe de Sección',
            `${j.nombres} ${j.apellidos}`,
            `Sección ${j.seccion}`,
            j.telefono || '---',
            j.localidad || '---',
            '---'
          ]);
        });
      });

      bloque.jefesSinRuta.forEach(j => {
        bodyRows.push([
          `      ↳ Secc. ${j.seccion}`,
          'Jefe de Sección',
          `${j.nombres} ${j.apellidos}`,
          `Sección ${j.seccion}`,
          j.telefono || '---',
          j.localidad || '---',
          '---'
        ]);
      });
    });

    doc.autoTable({
      head: [columnas],
      body: bodyRows,
      startY: 26,
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 32 },
        2: { cellWidth: 58 },
        3: { cellWidth: 52 },
        4: { cellWidth: 26 },
        5: { cellWidth: 42 },
        6: { cellWidth: 32 }
      }
    });

    doc.save(`Estructura_Jerarquica_Cunduacan_${obtenerFechaHoy()}.pdf`);
  } catch (error) {
    console.error(error);
    alert('Error al exportar la Estructura Principal a PDF.');
  }
}

// ==========================================
// 14. ESCÁNER DE CREDENCIAL INE (ENCUADRE + AUTO-LEVELS + NITIDEZ + MRZ/OCR)
// ==========================================
function enfocarCapturaManual(inputId) {
  const campo = document.getElementById(inputId);
  if (campo) {
    campo.focus();
    campo.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

async function abrirEscanerINE(destino) {
  destinoFormularioINE = destino || destinoFormularioINE;
  document.getElementById('modalEscanerINE').style.display = 'flex';
  document.getElementById('pasoRecorteINE').style.display = 'none';
  document.getElementById('resultadoEscanerINE').style.display = 'none';
  document.getElementById('estadoEscanerINE').style.display = 'none';
  document.getElementById('avisoCamaraINE').style.display = 'none';

  document.getElementById('ineDetectadoApellidos').value = '';
  document.getElementById('ineDetectadoNombres').value = '';
  document.getElementById('ineDetectadoSeccion').value = '';
  document.getElementById('ineDetectadoLocalidad').value = '';
  document.getElementById('ineTextoCrudoDebug').innerText = '';

  await iniciarCamaraINE();
}

async function iniciarCamaraINE() {
  detenerStreamCamaraINE();
  const contCamara = document.getElementById('contenedorCamaraINE');
  const aviso = document.getElementById('avisoCamaraINE');
  const video = document.getElementById('videoEscanerINE');

  zoomActualINE = 1.0;
  linternaActivaINE = false;
  soportaZoomHardwareINE = false;
  const sliderZoom = document.getElementById('sliderZoomINE');
  const valorZoom = document.getElementById('valorZoomINE');
  const btnLinterna = document.getElementById('btnLinternaINE');
  if (sliderZoom) { sliderZoom.min = 1; sliderZoom.max = 3; sliderZoom.step = 0.1; sliderZoom.value = 1; }
  if (valorZoom) valorZoom.innerText = '1.0x';
  if (btnLinterna) { btnLinterna.style.display = 'none'; btnLinterna.innerText = '🔦 Luz: OFF'; }
  if (video) video.style.transform = 'scale(1)';

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    contCamara.style.display = 'none';
    aviso.style.display = 'block';
    aviso.innerText = '⚠️ Tu navegador requiere HTTPS para abrir la cámara en vivo. Usa el botón azul "Cámara Nativa (Máximo Enfoque)".';
    return;
  }

  try {
    streamCamaraINE = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingModeINE },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    });

    video.srcObject = streamCamaraINE;
    await video.play();
    contCamara.style.display = 'block';
    aviso.style.display = 'none';

    trackVideoINE = streamCamaraINE.getVideoTracks()[0] || null;
    if (trackVideoINE) {
      await configurarCapacidadesEnfoqueINE(trackVideoINE);
    }
  } catch (err) {
    console.warn('No se pudo abrir cámara en vivo:', err);
    contCamara.style.display = 'none';
    aviso.style.display = 'block';
    aviso.innerText = '⚠️ Usa "Cámara Nativa (Máximo Enfoque)" o "Elegir Foto / Copia Guardada" para capturar la credencial.';
  }
}

async function configurarCapacidadesEnfoqueINE(track) {
  if (!track || typeof track.getCapabilities !== 'function') return;

  try {
    const caps = track.getCapabilities();

    if (caps.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
      await track.applyConstraints({
        advanced: [{ focusMode: 'continuous' }]
      });
    }

    if (caps.zoom && typeof caps.zoom.min === 'number' && typeof caps.zoom.max === 'number' && caps.zoom.max > caps.zoom.min) {
      soportaZoomHardwareINE = true;
      const slider = document.getElementById('sliderZoomINE');
      if (slider) {
        slider.min = caps.zoom.min;
        slider.max = Math.min(caps.zoom.max, 4);
        slider.step = caps.zoom.step || 0.1;
        slider.value = caps.zoom.min;
      }
      const zoomInicial = Math.min(1.4, caps.zoom.max);
      if (zoomInicial > caps.zoom.min) {
        await ajustarZoomINE(zoomInicial);
        if (slider) slider.value = zoomInicial;
      }
    }

    if (caps.torch) {
      const btnLinterna = document.getElementById('btnLinternaINE');
      if (btnLinterna) btnLinterna.style.display = 'inline-block';
    }
  } catch (e) {
    console.warn('Capacidades avanzadas de cámara parcialmente soportadas:', e);
  }
}

async function reenfocarCamaraINE(event) {
  const video = document.getElementById('videoEscanerINE');
  const indicador = document.getElementById('indicadorEnfoqueINE');

  if (event && video && indicador) {
    const rect = video.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    indicador.style.left = `${x}px`;
    indicador.style.top = `${y}px`;
    indicador.style.display = 'block';
    setTimeout(() => { indicador.style.display = 'none'; }, 900);
  }

  if (!trackVideoINE || typeof trackVideoINE.getCapabilities !== 'function') return;

  try {
    const caps = trackVideoINE.getCapabilities();
    const modos = caps.focusMode || [];

    if (modos.includes('single-shot')) {
      await trackVideoINE.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });
    }
    if (modos.includes('continuous')) {
      setTimeout(async () => {
        try {
          if (trackVideoINE) {
            await trackVideoINE.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
          }
        } catch (err) { /* ignorar */ }
      }, 350);
    }
  } catch (e) {
    console.warn('No se pudo forzar re-enfoque por hardware:', e);
  }
}

async function ajustarZoomINE(valor) {
  zoomActualINE = parseFloat(valor) || 1.0;
  const labelZoom = document.getElementById('valorZoomINE');
  if (labelZoom) labelZoom.innerText = `${zoomActualINE.toFixed(1)}x`;

  const video = document.getElementById('videoEscanerINE');

  if (soportaZoomHardwareINE && trackVideoINE) {
    try {
      await trackVideoINE.applyConstraints({
        advanced: [{ zoom: zoomActualINE }]
      });
      if (video) video.style.transform = 'scale(1)';
      return;
    } catch (e) {
      soportaZoomHardwareINE = false;
    }
  }

  if (video) {
    video.style.transform = `scale(${zoomActualINE})`;
  }
}

async function alternarLinternaINE() {
  if (!trackVideoINE) return;
  const btn = document.getElementById('btnLinternaINE');
  try {
    linternaActivaINE = !linternaActivaINE;
    await trackVideoINE.applyConstraints({
      advanced: [{ torch: linternaActivaINE }]
    });
    if (btn) {
      btn.innerText = linternaActivaINE ? '🔦 Luz: ON' : '🔦 Luz: OFF';
      btn.style.background = linternaActivaINE ? '#eab308' : '';
      btn.style.color = linternaActivaINE ? '#0f172a' : '';
    }
  } catch (e) {
    alert('⚠️ No se pudo encender la linterna en este dispositivo.');
  }
}

async function cambiarCamaraINE() {
  facingModeINE = (facingModeINE === 'environment') ? 'user' : 'environment';
  await iniciarCamaraINE();
}

function detenerStreamCamaraINE() {
  if (trackVideoINE && linternaActivaINE) {
    try {
      trackVideoINE.applyConstraints({ advanced: [{ torch: false }] });
    } catch (e) { /* ignorar */ }
  }
  linternaActivaINE = false;
  trackVideoINE = null;

  if (streamCamaraINE) {
    streamCamaraINE.getTracks().forEach(track => track.stop());
    streamCamaraINE = null;
  }
  const video = document.getElementById('videoEscanerINE');
  if (video) {
    video.srcObject = null;
    video.style.transform = 'scale(1)';
  }
}

function cerrarEscanerINE() {
  detenerStreamCamaraINE();
  const modal = document.getElementById('modalEscanerINE');
  if (modal) modal.style.display = 'none';
}

function capturarFotoCamaraINE() {
  const video = document.getElementById('videoEscanerINE');
  if (!video || !video.videoWidth) {
    alert('⚠️ La cámara aún no está lista.');
    return;
  }

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const canvas = document.createElement('canvas');

  if (!soportaZoomHardwareINE && zoomActualINE > 1.0) {
    const cropW = Math.round(vw / zoomActualINE);
    const cropH = Math.round(vh / zoomActualINE);
    const cropX = Math.round((vw - cropW) / 2);
    const cropY = Math.round((vh - cropH) / 2);

    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  } else {
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, vw, vh);
  }

  detenerStreamCamaraINE();
  document.getElementById('contenedorCamaraINE').style.display = 'none';
  abrirEditorRecorteINE(canvas);
}

function procesarArchivoINE(event, destino) {
  if (destino) destinoFormularioINE = destino;
  const archivo = event.target.files[0];
  if (!archivo) return;

  document.getElementById('modalEscanerINE').style.display = 'flex';
  document.getElementById('contenedorCamaraINE').style.display = 'none';
  document.getElementById('avisoCamaraINE').style.display = 'none';
  document.getElementById('estadoEscanerINE').style.display = 'none';
  detenerStreamCamaraINE();

  if (destino) {
    document.getElementById('ineDetectadoApellidos').value = '';
    document.getElementById('ineDetectadoNombres').value = '';
    document.getElementById('ineDetectadoSeccion').value = '';
    document.getElementById('ineDetectadoLocalidad').value = '';
  }

  const lector = new FileReader();
  lector.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      abrirEditorRecorteINE(canvas);
    };
    img.src = e.target.result;
  };
  lector.readAsDataURL(archivo);
  event.target.value = '';
}

// ==========================================
// EDITOR DE ENCUADRE Y RECORTE DE LA CREDENCIAL
// ==========================================
function abrirEditorRecorteINE(canvasOrigen) {
  canvasFuenteRecorteINE = canvasOrigen;
  rotacionRecorteINE = 0;
  zoomRecorteINE = 1.0;
  offsetRecorteX = 0;
  offsetRecorteY = 0;

  const slider = document.getElementById('sliderZoomRecorteINE');
  const label = document.getElementById('valorZoomRecorteINE');
  if (slider) slider.value = 1.0;
  if (label) label.innerText = '1.0x';

  document.getElementById('pasoRecorteINE').style.display = 'block';
  inicializarEventosCanvasRecorteINE();
  dibujarVistaPreviaRecorteINE();
}

function volverAEncuadrarINE() {
  if (!canvasFuenteRecorteINE) return;
  document.getElementById('estadoEscanerINE').style.display = 'none';
  document.getElementById('pasoRecorteINE').style.display = 'block';
  dibujarVistaPreviaRecorteINE();
}

function obtenerCanvasRotadoRecorteINE() {
  if (!canvasFuenteRecorteINE) return null;
  const ang = ((rotacionRecorteINE % 360) + 360) % 360;
  if (ang === 0) return canvasFuenteRecorteINE;

  const c = document.createElement('canvas');
  const w = canvasFuenteRecorteINE.width;
  const h = canvasFuenteRecorteINE.height;

  if (ang === 90 || ang === 270) {
    c.width = h;
    c.height = w;
  } else {
    c.width = w;
    c.height = h;
  }

  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((ang * Math.PI) / 180);
  ctx.drawImage(canvasFuenteRecorteINE, -w / 2, -h / 2);
  return c;
}

function rotarImagenRecorteINE() {
  rotacionRecorteINE = (rotacionRecorteINE + 90) % 360;
  offsetRecorteX = 0;
  offsetRecorteY = 0;
  dibujarVistaPreviaRecorteINE();
}

function actualizarZoomRecorteINE(val) {
  zoomRecorteINE = parseFloat(val) || 1.0;
  const label = document.getElementById('valorZoomRecorteINE');
  if (label) label.innerText = `${zoomRecorteINE.toFixed(2)}x`;
  dibujarVistaPreviaRecorteINE();
}

function dibujarVistaPreviaRecorteINE() {
  const canvasVisor = document.getElementById('canvasRecorteINE');
  const src = obtenerCanvasRotadoRecorteINE();
  if (!canvasVisor || !src) return;

  // Proporción de visor cómoda con marco interior de credencial INE (ratio 1.586:1)
  const visorW = 500;
  const visorH = 330;
  canvasVisor.width = visorW;
  canvasVisor.height = visorH;

  const ctx = canvasVisor.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, visorW, visorH);

  // Marco guía de credencial centrado
  const marcoW = Math.round(visorW * 0.88);
  const marcoH = Math.round(marcoW / 1.586);
  const marcoX = Math.round((visorW - marcoW) / 2);
  const marcoY = Math.round((visorH - marcoH) / 2);

  // Escala base para que la imagen cubra el marco guía
  const escalaBase = Math.max(marcoW / src.width, marcoH / src.height);
  const escalaFinal = escalaBase * zoomRecorteINE;

  const drawW = src.width * escalaFinal;
  const drawH = src.height * escalaFinal;
  const drawX = (visorW - drawW) / 2 + offsetRecorteX;
  const drawY = (visorH - drawH) / 2 + offsetRecorteY;

  ctx.drawImage(src, drawX, drawY, drawW, drawH);

  // Oscurecer suavemente fuera del marco guía para que se vea exactamente qué se recortará
  ctx.fillStyle = 'rgba(15, 23, 42, 0.52)';
  ctx.fillRect(0, 0, visorW, marcoY);
  ctx.fillRect(0, marcoY + marcoH, visorW, visorH - (marcoY + marcoH));
  ctx.fillRect(0, marcoY, marcoX, marcoH);
  ctx.fillRect(marcoX + marcoW, marcoY, visorW - (marcoX + marcoW), marcoH);

  // Borde del marco guía
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(marcoX, marcoY, marcoW, marcoH);
}

let eventosRecorteInicializados = false;
function inicializarEventosCanvasRecorteINE() {
  if (eventosRecorteInicializados) return;
  const canvasVisor = document.getElementById('canvasRecorteINE');
  if (!canvasVisor) return;
  eventosRecorteInicializados = true;

  const obtenerCoords = (e) => {
    const rect = canvasVisor.getBoundingClientRect();
    const factorX = canvasVisor.width / rect.width;
    const factorY = canvasVisor.height / rect.height;
    const punto = e.touches ? e.touches[0] : e;
    return {
      x: (punto.clientX - rect.left) * factorX,
      y: (punto.clientY - rect.top) * factorY
    };
  };

  const iniciar = (e) => {
    arrastrandoRecorteINE = true;
    const pos = obtenerCoords(e);
    inicioArrastreX = pos.x - offsetRecorteX;
    inicioArrastreY = pos.y - offsetRecorteY;
  };

  const mover = (e) => {
    if (!arrastrandoRecorteINE) return;
    if (e.cancelable) e.preventDefault();
    const pos = obtenerCoords(e);
    offsetRecorteX = pos.x - inicioArrastreX;
    offsetRecorteY = pos.y - inicioArrastreY;
    dibujarVistaPreviaRecorteINE();
  };

  const terminar = () => {
    arrastrandoRecorteINE = false;
  };

  canvasVisor.addEventListener('mousedown', iniciar);
  window.addEventListener('mousemove', mover);
  window.addEventListener('mouseup', terminar);

  canvasVisor.addEventListener('touchstart', iniciar, { passive: true });
  canvasVisor.addEventListener('touchmove', mover, { passive: false });
  canvasVisor.addEventListener('touchend', terminar);
}

async function confirmarRecorteYLeerINE() {
  const src = obtenerCanvasRotadoRecorteINE();
  if (!src) return;

  const visorW = 500;
  const visorH = 330;
  const marcoW = Math.round(visorW * 0.88);
  const marcoH = Math.round(marcoW / 1.586);
  const marcoX = Math.round((visorW - marcoW) / 2);
  const marcoY = Math.round((visorH - marcoH) / 2);

  const escalaBase = Math.max(marcoW / src.width, marcoH / src.height);
  const escalaFinal = escalaBase * zoomRecorteINE;

  const drawW = src.width * escalaFinal;
  const drawH = src.height * escalaFinal;
  const drawX = (visorW - drawW) / 2 + offsetRecorteX;
  const drawY = (visorH - drawH) / 2 + offsetRecorteY;

  // Mapear el rectángulo del marco guía a coordenadas reales de alta resolución de la foto original
  const sx = Math.max(0, Math.round((marcoX - drawX) / escalaFinal));
  const sy = Math.max(0, Math.round((marcoY - drawY) / escalaFinal));
  const sw = Math.min(src.width - sx, Math.round(marcoW / escalaFinal));
  const sh = Math.min(src.height - sy, Math.round(marcoH / escalaFinal));

  if (sw <= 40 || sh <= 40) {
    alert('⚠️ Centra la credencial dentro del recuadro azul antes de leer.');
    return;
  }

  const canvasRecortado = document.createElement('canvas');
  canvasRecortado.width = sw;
  canvasRecortado.height = sh;
  const ctx = canvasRecortado.getContext('2d');
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);

  document.getElementById('pasoRecorteINE').style.display = 'none';
  await ejecutarLecturaINE(canvasRecortado);
}

async function leerImagenCompletaSinRecorteINE() {
  const src = obtenerCanvasRotadoRecorteINE();
  if (!src) return;
  document.getElementById('pasoRecorteINE').style.display = 'none';
  await ejecutarLecturaINE(src);
}

async function escanearOtroLadoINE() {
  document.getElementById('estadoEscanerINE').style.display = 'none';
  document.getElementById('pasoRecorteINE').style.display = 'none';
  await iniciarCamaraINE();
}

// ==========================================
// PREPROCESAMIENTO ADAPTATIVO DE LUZ + NITIDEZ SUAVE
// (Evita borrar letras delgadas y evita convertir hologramas en letras extra)
// ==========================================
function preprocesarCanvasINE(canvasOrigen) {
  const maxAncho = 1800;
  const minAncho = 1100;
  let w = canvasOrigen.width;
  let h = canvasOrigen.height;

  if (w > maxAncho) {
    h = Math.round(h * (maxAncho / w));
    w = maxAncho;
  } else if (w < minAncho) {
    h = Math.round(h * (minAncho / w));
    w = minAncho;
  }

  const canvasProc = document.createElement('canvas');
  canvasProc.width = w;
  canvasProc.height = h;
  const ctx = canvasProc.getContext('2d');
  ctx.drawImage(canvasOrigen, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const totalPixeles = w * h;
  const grises = new Uint8Array(totalPixeles);
  const histograma = new Uint32Array(256);

  // 1. Convertir a luminancia y construir histograma
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    grises[p] = g;
    histograma[g]++;
  }

  // 2. Calcular percentiles 4% y 94% para normalizar exposición sin quemar letras
  let acum = 0;
  let minVal = 0;
  let maxVal = 255;
  const pBajo = totalPixeles * 0.04;
  const pAlto = totalPixeles * 0.94;

  for (let i = 0; i < 256; i++) {
    acum += histograma[i];
    if (acum >= pBajo) { minVal = i; break; }
  }
  acum = 0;
  for (let i = 0; i < 256; i++) {
    acum += histograma[i];
    if (acum >= pAlto) { maxVal = i; break; }
  }

  const rango = Math.max(40, maxVal - minVal);
  const normalizados = new Uint8ClampedArray(totalPixeles);

  for (let p = 0; p < totalPixeles; p++) {
    let v = ((grises[p] - minVal) * 255) / rango;
    // Suave realce de tinta oscura sin destruir trazos finos
    v = (v - 128) * 1.15 + 128;
    normalizados[p] = Math.max(0, Math.min(255, Math.round(v)));
  }

  // 3. Filtro de nitidez ligero (Unsharp / Sharpen 3x3) para definir bordes de letras
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const centro = normalizados[idx] * 5;
      const vecinos =
        normalizados[idx - 1] +
        normalizados[idx + 1] +
        normalizados[idx - w] +
        normalizados[idx + w];

      const nitido = Math.max(0, Math.min(255, centro - vecinos));
      const p4 = idx * 4;
      d[p4] = nitido;
      d[p4 + 1] = nitido;
      d[p4 + 2] = nitido;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvasProc;
}

async function ejecutarLecturaINE(canvasOriginal) {
  const estadoDiv = document.getElementById('estadoEscanerINE');
  estadoDiv.style.display = 'block';
  estadoDiv.innerHTML = '⏳ Optimizando nitidez de credencial y buscando códigos...';

  try {
    const canvasMejorado = preprocesarCanvasINE(canvasOriginal);

    // 1. Intentar detectar QR en el reverso si existe
    let qrDetectado = false;
    if (typeof window.jsQR === 'function') {
      const ctxOrig = canvasOriginal.getContext('2d');
      const rawData = ctxOrig.getImageData(0, 0, canvasOriginal.width, canvasOriginal.height);
      const qr = window.jsQR(rawData.data, rawData.width, rawData.height);
      if (qr && qr.data) qrDetectado = true;
    }

    // 2. Ejecutar OCR con Tesseract.js
    if (typeof window.Tesseract === 'undefined') {
      throw new Error('La librería OCR aún está cargando. Intenta de nuevo en unos segundos.');
    }

    const resultadoOCR = await window.Tesseract.recognize(canvasMejorado, 'spa', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const pct = Math.round((m.progress || 0) * 100);
          estadoDiv.innerHTML = `🔍 Leyendo datos de la credencial INE... <strong>${pct}%</strong>`;
        }
      }
    });

    const textoCrudo = (resultadoOCR && resultadoOCR.data && resultadoOCR.data.text) ? resultadoOCR.data.text : '';
    const extraido = parsearTextoINE(textoCrudo);

    const apPrev = document.getElementById('ineDetectadoApellidos').value.trim();
    const nomPrev = document.getElementById('ineDetectadoNombres').value.trim();
    const secPrev = document.getElementById('ineDetectadoSeccion').value.trim();
    const locPrev = document.getElementById('ineDetectadoLocalidad').value.trim();

    document.getElementById('ineDetectadoApellidos').value = extraido.apellidos || apPrev;
    document.getElementById('ineDetectadoNombres').value = extraido.nombres || nomPrev;
    document.getElementById('ineDetectadoSeccion').value = extraido.seccion || secPrev;
    document.getElementById('ineDetectadoLocalidad').value = extraido.localidad || locPrev;

    const debugPrev = document.getElementById('ineTextoCrudoDebug').innerText;
    document.getElementById('ineTextoCrudoDebug').innerText = (debugPrev ? debugPrev + '\n--- LADO 2 ---\n' : '') + textoCrudo.trim();

    const badge = document.getElementById('badgeTipoLecturaINE');
    if (extraido.origen === 'MRZ') {
      badge.innerText = qrDetectado ? 'Reverso MRZ + QR' : 'Reverso MRZ';
    } else {
      badge.innerText = qrDetectado ? 'Frente + QR' : 'Frente OCR';
    }

    estadoDiv.style.display = 'none';
    document.getElementById('resultadoEscanerINE').style.display = 'block';
  } catch (error) {
    console.error('Error al procesar INE:', error);
    estadoDiv.innerHTML = `❌ No se pudo leer la imagen: ${error.message || 'Intenta re-encuadrar la credencial.'}`;
  }
}

// Limpia tokens basura de 1 letra generados por hologramas y normaliza espacios
function limpiarLineaNombreINE(linea) {
  if (!linea) return '';
  const palabrasReservadas = new Set([
    'INSTITUTO', 'NACIONAL', 'ELECTORAL', 'CREDENCIAL', 'PARA', 'VOTAR',
    'MEXICO', 'MÉXICO', 'NOMBRE', 'DOMICILIO', 'CLAVE', 'ELECTOR',
    'CURP', 'ESTADO', 'MUNICIPIO', 'LOCALIDAD', 'SECCION', 'SECCIÓN',
    'EMISION', 'EMISIÓN', 'VIGENCIA', 'SEXO', 'FECHA', 'NACIMIENTO', 'ANO', 'AÑO'
  ]);

  const tokens = linea
    .replace(/[^A-ZÁÉÍÓÚÑÜ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(tok => {
      if (!tok) return false;
      if (palabrasReservadas.has(tok)) return false;
      // Eliminar letras sueltas de 1 carácter (ruido de holograma), salvo 'Y'
      if (tok.length === 1 && tok !== 'Y') return false;
      return true;
    });

  return tokens.join(' ').trim();
}

// Analiza el texto OCR tanto del Reverso (MRZ IDMEX) como del Frente de la INE
function parsearTextoINE(texto) {
  const resultado = {
    apellidos: '',
    nombres: '',
    seccion: '',
    localidad: '',
    origen: 'FRENTE'
  };

  if (!texto) return resultado;

  const lineas = texto
    .split(/\r?\n/)
    .map(l => l.trim().toUpperCase())
    .filter(Boolean);

  // A. DETECCIÓN DE REVERSO MRZ (APELLIDO1<APELLIDO2<<NOMBRE1<NOMBRE2)
  // Incluye tolerancia cuando el OCR lee '<<<' como 'KKK' o 'CCC' al final de la línea
  const lineaMRZNombre = lineas.find(l => {
    const sinEsp = l.replace(/\s+/g, '');
    if (sinEsp.length < 10) return false;
    if (/^[A-Z<]{10,}$/.test(sinEsp) && (sinEsp.includes('<<') || /(?:KKK|CCC|<<<)$/.test(sinEsp))) {
      return true;
    }
    return false;
  });

  if (lineaMRZNombre) {
    let compacta = lineaMRZNombre
      .replace(/\s+/g, '')
      // Quitar relleno final de caracteres '<' o 'K'/'C' repetidos al final de la línea MRZ
      .replace(/[<KC]{3,}$/g, '');

    let partes = compacta.split('<<');
    if (partes.length < 2) {
      partes = compacta.split(/(?:KK|CC)/);
    }

    if (partes.length >= 2) {
      const apellidosMRZ = limpiarLineaNombreINE(partes[0].replace(/<+/g, ' '));
      const nombresMRZ = limpiarLineaNombreINE(partes.slice(1).join(' ').replace(/<+/g, ' '));
      if (apellidosMRZ.length >= 2 && nombresMRZ.length >= 2) {
        resultado.apellidos = apellidosMRZ;
        resultado.nombres = nombresMRZ;
        resultado.origen = 'MRZ';
      }
    }
  }

  // B. DETECCIÓN DE SECCIÓN ELECTORAL (4 DÍGITOS)
  const textoPlano = lineas.join(' ');
  const matchSeccionExplicita = textoPlano.match(/(?:SECCI[OÓ0]N|SECC)\s*[:.\-]?\s*(\d{4})/);
  if (matchSeccionExplicita) {
    resultado.seccion = matchSeccionExplicita[1];
  } else {
    const candidatos4Digitos = textoPlano.match(/\b\d{4}\b/g) || [];
    const coincidenciaCunduacan = candidatos4Digitos.find(num => SECCIONES_CUNDUACAN.includes(num));
    if (coincidenciaCunduacan) {
      resultado.seccion = coincidenciaCunduacan;
    }
  }

  // C. DETECCIÓN DE NOMBRE EN EL FRENTE (SI NO SE LEYÓ MRZ)
  if (!resultado.apellidos || !resultado.nombres) {
    const idxNombre = lineas.findIndex(l => /\bNOMBRE\b/.test(l));
    if (idxNombre !== -1) {
      const bloqueNombre = [];
      for (let i = idxNombre + 1; i < Math.min(idxNombre + 6, lineas.length); i++) {
        const ln = lineas[i];
        if (/(DOMICILIO|CLAVE|CURP|FECHA|SEXO|ESTADO|MUNICIPIO|LOCALIDAD|EMISI|VIGENCIA)/.test(ln)) break;
        const limpia = limpiarLineaNombreINE(ln);
        if (limpia.length >= 2) {
          bloqueNombre.push(limpia);
        }
      }

      if (bloqueNombre.length >= 3) {
        resultado.apellidos = `${bloqueNombre[0]} ${bloqueNombre[1]}`.trim();
        resultado.nombres = bloqueNombre.slice(2).join(' ').trim();
      } else if (bloqueNombre.length === 2) {
        resultado.apellidos = bloqueNombre[0];
        resultado.nombres = bloqueNombre[1];
      }
    }
  }

  // D. DETECCIÓN DE LOCALIDAD / COLONIA EN DOMICILIO
  const lineaColonia = lineas.find(l => /\b(?:COL|R\/A|RA|EJ|POB|FRACC|VILLA|CONG|LOC|LOCALIDAD)\.?\s+[A-ZÁÉÍÓÚÑÜ]/.test(l));
  if (lineaColonia) {
    resultado.localidad = lineaColonia
      .replace(/\b\d{5}\b/g, '')
      .replace(/,?\s*CUNDUAC[AÁ]N.*$/i, '')
      .replace(/,?\s*TAB\.?.*$/i, '')
      .replace(/[^A-ZÁÉÍÓÚÑÜ0-9\/\s.-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  } else {
    const idxMpio = lineas.findIndex(l => /CUNDUAC[AÁ]N/.test(l));
    if (idxMpio > 0) {
      resultado.localidad = lineas[idxMpio - 1]
        .replace(/\b\d{5}\b/g, '')
        .replace(/[^A-ZÁÉÍÓÚÑÜ0-9\/\s.-]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  return resultado;
}

function aplicarDatosINEAlFormulario() {
  const apellidos = document.getElementById('ineDetectadoApellidos').value.trim().toUpperCase();
  const nombres = document.getElementById('ineDetectadoNombres').value.trim().toUpperCase();
  const seccion = document.getElementById('ineDetectadoSeccion').value.trim().padStart(4, '0');
  const localidad = document.getElementById('ineDetectadoLocalidad').value.trim().toUpperCase();

  let mapaCampos = null;
  if (destinoFormularioINE === 'admin-simp') {
    mapaCampos = {
      apellidos: 'adminSimpApellidos',
      nombres: 'adminSimpNombres',
      seccion: 'adminSimpSeccion',
      localidad: 'adminSimpLocalidad',
      siguiente: 'adminSimpTelefono'
    };
  } else if (destinoFormularioINE === 'cap-simp') {
    mapaCampos = {
      apellidos: 'simpApellidos',
      nombres: 'simpNombres',
      seccion: 'simpSeccion',
      localidad: 'simpLocalidad',
      siguiente: 'simpTelefono'
    };
  } else if (destinoFormularioINE === 'admin-prom') {
    mapaCampos = {
      apellidos: 'promApellidos',
      nombres: 'promNombres',
      seccion: 'promSeccion',
      localidad: 'promLocalidad',
      siguiente: 'promTelefono'
    };
  } else if (destinoFormularioINE === 'cap-prom') {
    mapaCampos = {
      apellidos: 'capPromApellidos',
      nombres: 'capPromNombres',
      seccion: 'capPromSeccion',
      localidad: 'capPromLocalidad',
      siguiente: 'capPromTelefono'
    };
  }

  if (mapaCampos) {
    const llenarYResaltar = (id, valor) => {
      const el = document.getElementById(id);
      if (el && valor && valor !== '0000') {
        el.value = valor;
        el.style.backgroundColor = '#dcfce7';
        setTimeout(() => { el.style.backgroundColor = ''; }, 2200);
      }
    };

    llenarYResaltar(mapaCampos.apellidos, apellidos);
    llenarYResaltar(mapaCampos.nombres, nombres);
    llenarYResaltar(mapaCampos.seccion, seccion);
    llenarYResaltar(mapaCampos.localidad, localidad);

    cerrarEscanerINE();

    const sig = document.getElementById(mapaCampos.siguiente);
    if (sig) sig.focus();
  }
}

// ARRANQUE DE APLICACIÓN
iniciarApp();