// VARIABLES GLOBALES Y CONFIGURACIÓN
let usuarioActual = null;
let chartAvances = null;

let globalListaGeneral = [];
let globalSimpatizantesEdit = [];
let globalStaffEdit = [];
let globalPaseListaAdmin = [];
let globalPromotoresEdit = [];
let globalPromotoresLista = [];

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

  if (seccionId === 'admin-captura') cargarDatalistPromotores();
  if (seccionId === 'admin-lista') cargarListaGlobalAdmin();
  if (seccionId === 'admin-gestion-simp') cargarGestionSimpatizantes();
  if (seccionId === 'admin-gestion-staff') cargarGestionStaff();
  if (seccionId === 'admin-pase-lista-global') cargarPaseListaGlobalAdmin();
  if (seccionId === 'admin-gestion-promotores') cargarGestionPromotores();
  if (seccionId === 'admin-resumen-promotor') cargarResumenPromotor();
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
  const filtroTxt = document.getElementById('buscadorResumenProm').value.toLowerCase();

  let filtrados = globalPromotoresEdit.filter(p => {
    const matchSec = (filtroSec === "TODAS" || p.seccion === filtroSec);
    const matchTxt = p.nombre.toLowerCase().includes(filtroTxt);
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
      // Filtrar simpatizantes del promotor
      const simpatizantesProm = globalListaGeneral.filter(s => {
        const ref = (s.referencia || '').toLowerCase();
        return ref.includes(p.nombre.toLowerCase()) || ref.includes(`(secc. ${p.seccion})`.toLowerCase());
      });

      const totalSimp = simpatizantesProm.length;
      const votaronSimp = simpatizantesProm.filter(s => s.asistio).length;

      // CÁLCULO DE EFECTIVIDAD (Meta: 15 Votos = 100%)
      const metaVotos = 15;
      const porcentajeEfectividad = ((votaronSimp / metaVotos) * 100).toFixed(1);

      // Color de la insignia de efectividad
      let estiloBadgingEfectividad = 'background: #fee2e2; color: #991b1b;'; // Bajo (<50%)
      if (porcentajeEfectividad >= 100) {
        estiloBadgingEfectividad = 'background: #dcfce7; color: #15803d;'; // Meta cumplida o superada (>=100%)
      } else if (porcentajeEfectividad >= 50) {
        estiloBadgingEfectividad = 'background: #fef9c3; color: #854d0e;'; // En avance (50%-99%)
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
            <div style="max-height: 200px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; margin-top: 10px;">
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

// ARRANQUE DE APLICACIÓN
iniciarApp();