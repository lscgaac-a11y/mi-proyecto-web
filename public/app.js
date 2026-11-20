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
      seccion: document.getElementById('adminSimpSeccion').value,
      localidad: document.getElementById('adminSimpLocalidad').value,
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
      seccion: document.getElementById(seccId).value,
      localidad: document.getElementById(locId).value
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
      seccion: document.getElementById('simpSeccion').value,
      localidad: document.getElementById('simpLocalidad').value,
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

// Devuelve un Map(seccion -> etiquetaOcupante) de las secciones ya ocupadas por ese rol
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
  // 1. Zonas (1 al 20) — bloquear las ocupadas
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

  // 2. Rutas (1 al 37) — bloquear las ocupadas
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

  // 3. Selector de 1 Sección (Solo para Jefe de Sección) — bloquear las ocupadas
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

  // Zonas (bloquear las ocupadas por otros)
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

  // Rutas (bloquear las ocupadas por otros)
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

  // Sección única para Jefe de Sección (bloquear las ocupadas por otros)
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

// Construye el árbol jerárquico: Zona -> Rutas -> Jefes de Sección
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

// ARRANQUE DE APLICACIÓN
iniciarApp();