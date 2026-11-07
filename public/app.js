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

async function cargarAvancesAdmin() {
  const res = await fetch('/api/avances');
  const datos = await res.json();
  const tbody = document.getElementById('tablaAvances');
  
  tbody.innerHTML = datos.map(d => `
    <tr>
      <td><strong>${d.seccion}</strong></td>
      <td>${d.total_registrados}</td>
      <td>${d.total_asistieron}</td>
    </tr>
  `).join('');
}

// --- FUNCIONES CAPTURISTA ---
document.getElementById('formSimpatizante').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch('/api/simpatizantes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: document.getElementById('simpNombre').value,
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
      <td><strong>${simp.nombre}</strong><br><small>${simp.telefono}</small></td>
      <td>${simp.localidad}</td>
      <td>${simp.referencia}</td>
      <td>
        <input type="checkbox" style="transform: scale(1.5);" 
               ${simp.asistio ? 'checked' : ''} 
               onchange="cambiarAsistencia(${simp.id}, this.checked)">
      </td>
    </tr>
  `).join('');
}

async function cambiarAsistencia(id, asistio) {
  await fetch(`/api/simpatizantes/${id}/asistencia`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asistio })
  });
}