let usuarioActual = null;
let chartAvances = null;
let globalSimpatizantesEdit = [];

// ==========================================
// NUEVO: MANTENER SESIÓN AL RECARGAR PÁGINA
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const sesionGuardada = localStorage.getItem('sesionUsuario');
  if (sesionGuardada) {
    usuarioActual = JSON.parse(sesionGuardada);
    // Si recargó estando en cambio de contraseña obligatorio
    if (usuarioActual.requiere_cambio) {
      mostrarVista('vista-cambio-password');
    } else {
      redirigirPorRol();
    }
  } else {
    mostrarVista('vista-login');
  }
});

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
  localStorage.removeItem('sesionUsuario'); // Borrar memoria al salir
  document.getElementById('formLogin').reset();
  mostrarVista('vista-login');
}

function redirigirPorRol() {
  document.getElementById('navTitle').innerText = `Panel: ${usuarioActual.rol.toUpperCase()} - ${usuarioActual.usuario}`;
  
  if (usuarioActual.rol === 'admin') {
    mostrarVista('vista-admin');
    cargarAvancesAdmin(); 
  } else if (usuarioActual.rol === 'capturista') {
    mostrarVista('vista-capturista');
  } else if (usuarioActual.rol === 'pase_lista') {
    mostrarVista('vista-lista');
    document.getElementById('tituloSeccionLista').innerText = `Pase de Lista - Sección: ${usuarioActual.seccion_asignada}`;
    cargarPaseDeLista();
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
    localStorage.setItem('sesionUsuario', JSON.stringify(usuarioActual)); // Guardar en memoria
    
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
    localStorage.setItem('sesionUsuario', JSON.stringify(usuarioActual)); // Actualizar memoria sin candado
    document.getElementById('formCambioPassword').reset();
    redirigirPorRol(); 
  } else {
    errorDiv.innerText = 'Error al guardar la contraseña.';
    errorDiv.style.display = 'block';
  }
});

// ==========================================
// 3. NAVEGACIÓN DEL PANEL ADMINISTRADOR
// ==========================================
function mostrarSeccionAdmin(seccionId) {
  const secciones = document.getElementsByClassName('admin-seccion');
  for (let i = 0; i < secciones.length; i++) {
    secciones[i].style.display = 'none';
  }
  
  const botones = document.getElementsByClassName('nav-btn');
  for (let i = 0; i < botones.length; i++) {
    botones[i].classList.remove('active');
  }
  
  document.getElementById(seccionId).style.display = 'block';
  document.getElementById('btn-' + seccionId).classList.add('active');

  if (seccionId === 'admin-gestion-simp') cargarGestionSimpatizantes();
  if (seccionId === 'admin-gestion-staff') cargarGestionStaff();
}

function toggleSeccionAdmin() {
  const rol = document.getElementById('nuevoRol').value;
  document.getElementById('divSeccionAdmin').style.display = (rol === 'pase_lista') ? 'block' : 'none';
}

// ==========================================
// 4. FUNCIONES DEL ADMINISTRADOR (GRÁFICAS Y LISTAS)
// ==========================================
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

async function cargarAvancesAdmin() {
  const res = await fetch('/api/avances');
  const datos = await res.json();
  
  // Tabla resumen
  const tbody = document.getElementById('tablaAvances');
  tbody.innerHTML = datos.map(d => `
    <tr>
      <td><strong>${d.seccion}</strong></td>
      <td>${d.total_registrados}</td>
      <td>${d.total_asistieron}</td>
    </tr>
  `).join('');

  // Filtro
  const selectFiltro = document.getElementById('filtroSeccionAdmin');
  const seccionActual = selectFiltro.value; 
  selectFiltro.innerHTML = '<option value="TODAS">Mostrar Todas</option>' + 
    datos.map(d => `<option value="${d.seccion}">${d.seccion}</option>`).join('');
  if (seccionActual) selectFiltro.value = seccionActual;

  // Gráfica
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

  cargarListaGlobalAdmin();
}

async function cargarListaGlobalAdmin() {
  const res = await fetch('/api/simpatizantes-todos');
  const datos = await res.json();
  const tbody = document.getElementById('tablaGlobalAdmin');
  
  tbody.innerHTML = datos.map(simp => `
    <tr class="fila-global" data-seccion="${simp.seccion}">
      <td><span style="background:#e2e8f0; padding:3px 6px; border-radius:4px; font-weight:600;">${simp.seccion}</span></td>
      <td><strong>${simp.nombre}</strong></td>
      <td>${simp.telefono || '---'}</td>
      <td>${simp.referencia || '---'}</td>
      <td>
        ${simp.asistio ? `<span style="color: #166534; font-weight: bold;">✅ Ya Votó</span>` : `<span style="color: #991b1b; font-weight: bold;">⏳ Pendiente</span>`}
      </td>
    </tr>
  `).join('');
  filtrarListaGlobal();
}

function filtrarListaGlobal() {
  const seccionSeleccionada = document.getElementById('filtroSeccionAdmin').value;
  const filas = document.getElementsByClassName('fila-global');
  for (let i = 0; i < filas.length; i++) {
    const seccionFila = filas[i].getAttribute('data-seccion');
    if (seccionSeleccionada === "TODAS" || seccionSeleccionada === seccionFila) {
      filas[i].style.display = "";
    } else {
      filas[i].style.display = "none";
    }
  }
}

// ==========================================
// 5. EDICIÓN DE BASES DE DATOS (ADMIN)
// ==========================================

async function cargarGestionStaff() {
  const res = await fetch('/api/usuarios');
  const datos = await res.json();
  const tbody = document.getElementById('tablaGestionStaff');
  tbody.innerHTML = datos.map(u => `
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
  const tbody = document.getElementById('tablaGestionSimp');
  tbody.innerHTML = globalSimpatizantesEdit.map(s => `
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
  cargarAvancesAdmin(); 
});

async function eliminarSimpatizante(id) {
  if(confirm('¿Eliminar permanentemente a este simpatizante?')) {
    await fetch(`/api/simpatizantes/${id}`, { method: 'DELETE' });
    cargarGestionSimpatizantes();
    cargarAvancesAdmin(); 
  }
}

// ==========================================
// 6. FUNCIONES CAPTURISTA
// ==========================================
document.getElementById('formSimpatizante').addEventListener('submit', async (e) => {
  e.preventDefault();

  const apellidos = document.getElementById('simpApellidos').value.trim().toUpperCase();
  const nombres = document.getElementById('simpNombres').value.trim().toUpperCase();
  const nombreFormatoLista = `${apellidos}, ${nombres}`;

  const res = await fetch('/api/simpatizantes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: nombreFormatoLista,
      telefono: document.getElementById('simpTelefono').value,
      seccion: document.getElementById('simpSeccion').value,
      localidad: document.getElementById('simpLocalidad').value,
      referencia: document.getElementById('simpReferencia').value
    })
  });

  if (res.ok) {
    alert('Simpatizante guardado correctamente');
    document.getElementById('formSimpatizante').reset();
  } else {
    alert('Error al guardar simpatizante');
  }
});

// ==========================================
// 7. FUNCIONES PASE DE LISTA
// ==========================================
async function cargarPaseDeLista() {
  const res = await fetch(`/api/simpatizantes/${usuarioActual.seccion_asignada}`);
  const datos = await res.json();
  const tbody = document.getElementById('tablaPaseLista');
  
  tbody.innerHTML = datos.map(simp => `
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

    if (res.ok) {
      cargarPaseDeLista();
    } else {
      alert("Hubo un error al conectar con la base de datos.");
    }
  }
}

function filtrarLista() {
  const filtro = document.getElementById('buscadorLista').value.toLowerCase();
  const filas = document.getElementById('tablaPaseLista').getElementsByTagName('tr');

  for (let i = 0; i < filas.length; i++) {
    const celdaNombre = filas[i].getElementsByTagName('td')[0];
    if (celdaNombre) {
      const texto = celdaNombre.textContent || celdaNombre.innerText;
      if (texto.toLowerCase().indexOf(filtro) > -1) {
        filas[i].style.display = "";
      } else {
        filas[i].style.display = "none";
      }
    }
  }
}