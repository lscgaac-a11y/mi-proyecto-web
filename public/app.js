let usuarioActual = null;

// --- CONTROL DE VISTAS ---
function mostrarVista(vistaId) {
  document.getElementById('vista-login').style.display = 'none';
  document.getElementById('vista-admin').style.display = 'none';
  document.getElementById('vista-capturista').style.display = 'none';
  document.getElementById('vista-lista').style.display = 'none';
  
  if (vistaId !== 'vista-login') {
    document.getElementById('navbar').style.display = 'block';
  } else {
    document.getElementById('navbar').style.display = 'none';
  }

  document.getElementById(vistaId).style.display = 'block';
}

function cerrarSesion() {
  usuarioActual = null;
  document.getElementById('formLogin').reset();
  mostrarVista('vista-login');
}

// --- LOGIN ---
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
    document.getElementById('navTitle').innerText = `Panel: ${usuarioActual.rol.toUpperCase()} - ${usuarioActual.usuario}`;
    
    // Redirigir según el rol
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
  } else {
    errorDiv.innerText = 'Usuario o contraseña incorrectos';
    errorDiv.style.display = 'block';
  }
});

// --- FUNCIONES ADMINISTRADOR ---
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

// --- FUNCIONES ADMINISTRADOR ---
let chartAvances = null; // Variable global para guardar la gráfica

function toggleSeccionAdmin() {
  const rol = document.getElementById('nuevoRol').value;
  document.getElementById('divSeccionAdmin').style.display = (rol === 'pase_lista') ? 'block' : 'none';
}

document.getElementById('formCrearUsuario').addEventListener('submit', async (e) => {
  // ... (mantén el código del formCrearUsuario igual)
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
  
  // 1. Llenar tabla resumen
  const tbody = document.getElementById('tablaAvances');
  tbody.innerHTML = datos.map(d => `
    <tr>
      <td><strong>${d.seccion}</strong></td>
      <td>${d.total_registrados}</td>
      <td>${d.total_asistieron}</td>
    </tr>
  `).join('');

  // 2. Llenar automáticamente el filtro de secciones
  const selectFiltro = document.getElementById('filtroSeccionAdmin');
  const seccionActual = selectFiltro.value; // Guardar la selección actual
  selectFiltro.innerHTML = '<option value="TODAS">Mostrar Todas</option>' + 
    datos.map(d => `<option value="${d.seccion}">${d.seccion}</option>`).join('');
  if (seccionActual) selectFiltro.value = seccionActual;

  // 3. Dibujar Gráfica
  const ctx = document.getElementById('graficaAvances').getContext('2d');
  if (chartAvances) chartAvances.destroy(); 

  chartAvances = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: datos.map(d => `Secc ${d.seccion}`),
      datasets: [
        {
          label: 'Faltan de Votar',
          data: datos.map(d => d.total_registrados - d.total_asistieron),
          backgroundColor: '#94a3b8'
        },
        {
          label: 'Ya Votaron',
          data: datos.map(d => d.total_asistieron),
          backgroundColor: '#16a34a'
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true }
      }
    }
  });

  // 4. Cargar la lista global de simpatizantes
  cargarListaGlobalAdmin();
}

async function cargarListaGlobalAdmin() {
  const res = await fetch('/api/simpatizantes-todos');
  const datos = await res.json();
  const tbody = document.getElementById('tablaGlobalAdmin');
  
  // Agregamos la clase "fila-global" y el atributo "data-seccion" para facilitar el filtro
  tbody.innerHTML = datos.map(simp => `
    <tr class="fila-global" data-seccion="${simp.seccion}">
      <td><span style="background:#e2e8f0; padding:3px 6px; border-radius:4px; font-weight:600;">${simp.seccion}</span></td>
      <td><strong>${simp.nombre}</strong></td>
      <td>${simp.telefono || '---'}</td>
      <td>${simp.referencia || '---'}</td> <!-- COLUMNA REFERENCIA -->
      <td>
        ${simp.asistio 
          ? `<span style="color: #166534; font-weight: bold;">✅ Ya Votó</span>` 
          : `<span style="color: #991b1b; font-weight: bold;">⏳ Pendiente</span>`}
      </td>
    </tr>
  `).join('');

  // Ejecutar el filtro por si el admin ya tenía una sección seleccionada al recargar
  filtrarListaGlobal();
}

// --- NUEVA FUNCIÓN: FILTRO POR SECCIÓN ---
function filtrarListaGlobal() {
  const seccionSeleccionada = document.getElementById('filtroSeccionAdmin').value;
  const filas = document.getElementsByClassName('fila-global');

  for (let i = 0; i < filas.length; i++) {
    const seccionFila = filas[i].getAttribute('data-seccion');
    
    // Mostrar si seleccionó "TODAS" o si coincide con la sección de la fila
    if (seccionSeleccionada === "TODAS" || seccionSeleccionada === seccionFila) {
      filas[i].style.display = "";
    } else {
      filas[i].style.display = "none";
    }
  }
}

// --- FUNCIONES CAPTURISTA ---
document.getElementById('formSimpatizante').addEventListener('submit', async (e) => {
  e.preventDefault();

  // Extraer, limpiar y convertir a MAYÚSCULAS para formato de Lista Nominal
  const apellidos = document.getElementById('simpApellidos').value.trim().toUpperCase();
  const nombres = document.getElementById('simpNombres').value.trim().toUpperCase();
  
  // Unimos el texto: "APELLIDOS, NOMBRES"
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

// --- FUNCIONES PASE DE LISTA ---
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
          ? `<!-- Si ya asistió: Casilla bloqueada permanentemente -->
             <div style="color: #166534; font-weight: 600; display: flex; align-items: center; gap: 8px;">
               <input type="checkbox" checked disabled style="transform: scale(1.5);"> 
               <span>Ya votó</span>
             </div>`
          : `<!-- Si NO ha asistido: Casilla + Botón de Guardar -->
             <div style="display: flex; gap: 12px; align-items: center;">
               <input type="checkbox" id="check_${simp.id}" style="transform: scale(1.5);">
               <button class="btn-primary" style="padding: 6px 12px; font-size: 0.85rem; width: auto;" onclick="guardarCheckIn(${simp.id})">Guardar</button>
             </div>`
        }
      </td>
    </tr>
  `).join('');
}

// Nueva función para validar, guardar y bloquear
async function guardarCheckIn(id) {
  const casilla = document.getElementById(`check_${id}`);
  
  // 1. Validar que la casilla esté marcada
  if (!casilla.checked) {
    alert("⚠️ Primero marca la casilla antes de presionar Guardar.");
    return;
  }

  // 2. Confirmación final de seguridad
  if (confirm("¿Confirmar Check In? Una vez guardado, YA NO se podrá desmarcar.")) {
    const res = await fetch(`/api/simpatizantes/${id}/asistencia`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asistio: true }) // Forzamos siempre a TRUE
    });

    if (res.ok) {
      cargarPaseDeLista(); // Recarga la lista para aplicar el bloqueo visual
    } else {
      alert("Hubo un error al conectar con la base de datos.");
    }
  }
}
// --- FUNCIÓN DE BÚSQUEDA EN PASE DE LISTA ---
function filtrarLista() {
  const filtro = document.getElementById('buscadorLista').value.toLowerCase();
  const filas = document.getElementById('tablaPaseLista').getElementsByTagName('tr');

  for (let i = 0; i < filas.length; i++) {
    // Obtenemos la primera columna de la fila (donde está el nombre)
    const celdaNombre = filas[i].getElementsByTagName('td')[0];
    if (celdaNombre) {
      const texto = celdaNombre.textContent || celdaNombre.innerText;
      // Si el nombre incluye lo escrito en el buscador, lo muestra, si no, lo oculta
      if (texto.toLowerCase().indexOf(filtro) > -1) {
        filas[i].style.display = "";
      } else {
        filas[i].style.display = "none";
      }
    }
  }
}