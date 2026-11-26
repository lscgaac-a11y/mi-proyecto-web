// ==========================================
// CATÁLOGO OFICIAL DE 60 SECCIONES DE CUNDUACÁN
// ==========================================
const SECCIONES_CUNDUACAN = [
  ...Array.from({ length: 59 }, (_, i) => String(609 + i).padStart(4, '0')).filter(s => s !== '0654'),
  '1202',
  '1203'
];

const META_SIMPATIZANTES_PROMOTOR = 15;

let usuarioActual = null;
let cacheAvances = [];
let cacheSimpatizantes = [];
let cachePromotores = [];
let cacheEstructura = [];
let cacheUsuarios = [];
let seccionesSeleccionadasEst = new Set();
let promotoresExpandidos = new Set();
let destinoINEActual = null;

function esSuperUsuario() {
  return usuarioActual && usuarioActual.rol === 'admin';
}

function esCapturista() {
  return usuarioActual && usuarioActual.rol === 'capturista';
}

function esPaseLista() {
  return usuarioActual && usuarioActual.rol === 'pase_lista';
}

// ==========================================
// GENERADOR DE REPORTES PDF (ESTILO INSTITUCIONAL)
// ==========================================
function generarPDFTabla({ titulo, subtitulo, columnas, filas, nombreArchivo, orientacion = 'landscape' }) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('La librería PDF aún está cargando. Intenta de nuevo en un segundo.');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: orientacion, unit: 'mm', format: 'letter' });
  const fechaHora = new Date().toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short'
  });

  doc.setFillColor(59, 7, 100);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(`Cunduacán 2027 · ${titulo}`, 14, 10);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${subtitulo}  |  Registros: ${filas.length}  |  Generado: ${fechaHora}`, 14, 17);

  doc.autoTable({
    head: [columnas],
    body: filas,
    startY: 27,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [31, 41, 55],
      lineColor: [233, 213, 255],
      lineWidth: 0.2
    },
    headStyles: {
      fillColor: [107, 33, 168],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8
    },
    alternateRowStyles: {
      fillColor: [250, 247, 255]
    },
    margin: { left: 14, right: 14, bottom: 16 },
    didDrawPage: (data) => {
      const totalPaginas = doc.internal.getNumberOfPages();
      const altoPagina = doc.internal.pageSize.getHeight();
      const anchoPagina = doc.internal.pageSize.getWidth();
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(
        `Organización Territorial Cunduacán · Página ${data.pageNumber} de ${totalPaginas}`,
        anchoPagina - 14,
        altoPagina - 7,
        { align: 'right' }
      );
    }
  });

  doc.save(nombreArchivo);
}

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  poblarCatalogosIniciales();
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

function poblarCatalogosIniciales() {
  const dl = document.getElementById('lista-secciones-cunduacan');
  if (dl) {
    dl.innerHTML = SECCIONES_CUNDUACAN.map(sec => `<option value="${sec}"></option>`).join('');
  }

  const selZona = document.getElementById('est-zona');
  const filtroZona = document.getElementById('filtro-est-zona');
  if (selZona && filtroZona) {
    for (let z = 1; z <= 20; z++) {
      selZona.innerHTML += `<option value="${z}">Zona ${z}</option>`;
      filtroZona.innerHTML += `<option value="${z}">Zona ${z}</option>`;
    }
  }

  const selRuta = document.getElementById('est-ruta');
  if (selRuta) {
    for (let r = 1; r <= 37; r++) {
      selRuta.innerHTML += `<option value="${r}">Ruta ${r}</option>`;
    }
  }

  renderizarChipsSeccionesEstructura();
}

// ==========================================
// NAVEGACIÓN BARRA LATERAL Y MÓVIL
// ==========================================
function abrirSidebarMovil() {
  document.getElementById('sidebar').classList.add('abierta');
  document.getElementById('overlay-sidebar').classList.add('activa');
}

function cerrarSidebarMovil() {
  document.getElementById('sidebar').classList.remove('abierta');
  document.getElementById('overlay-sidebar').classList.remove('activa');
}

function navegarA(idSeccion, titulo) {
  document.querySelectorAll('.vista-seccion').forEach(sec => sec.classList.add('oculto'));
  document.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('activo'));

  const sec = document.getElementById(idSeccion);
  const btn = document.querySelector(`.menu-item[data-vista="${idSeccion}"]`);
  if (sec) sec.classList.remove('oculto');
  if (btn) btn.classList.add('activo');
  if (titulo) document.getElementById('titulo-vista-actual').textContent = titulo;

  cerrarSidebarMovil();

  if (idSeccion === 'sec-avances') cargarTodo();
  if (idSeccion === 'sec-avance-promotores') {
    Promise.all([cargarPromotores(), cargarSimpatizantes()]).then(renderizarAvancePromotores);
  }
  if (idSeccion === 'sec-simpatizantes') {
    if (esCapturista()) {
      cargarPromotores();
    } else {
      Promise.all([cargarSimpatizantes(), cargarPromotores()]);
    }
  }
  if (idSeccion === 'sec-pase-lista') cargarSimpatizantes();
  if (idSeccion === 'sec-promotores') {
    if (esCapturista()) {
      cargarPromotores();
    } else {
      Promise.all([cargarPromotores(), cargarSimpatizantes()]);
    }
  }
  if (idSeccion === 'sec-estructura') {
    cargarEstructura();
    renderizarChipsSeccionesEstructura();
  }
  if (idSeccion === 'sec-usuarios' && esSuperUsuario()) cargarUsuarios();
}

// ==========================================
// ESCANEO RÁPIDO DE CREDENCIAL INE
// ==========================================
function iniciarEscaneoINE(destino) {
  destinoINEActual = destino;
  const input = document.getElementById('input-foto-ine');
  if (!input) return;
  input.value = '';
  input.click();
}

function optimizarImagenINE(archivo, maxAncho = 800, calidad = 0.72) {
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
    lector.onerror = () => reject(new Error('Error al abrir la imagen.'));
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

  const estilos = {
    info: { texto: '#6a1b9a', borde: '#8e24aa', fondo: '#f3e5f5' },
    ok: { texto: '#15803d', borde: '#15803d', fondo: '#dcfce7' },
    alerta: { texto: '#b45309', borde: '#b45309', fondo: '#fef3c7' },
    error: { texto: '#b91c1c', borde: '#b91c1c', fondo: '#fee2e2' }
  };
  const st = estilos[tipo] || estilos.info;
  caja.style.color = st.texto;
  caja.style.borderLeftColor = st.borde;
  caja.style.background = st.fondo;
  caja.textContent = mensaje;
  caja.classList.remove('oculto');
}

function asignarValor(id, valor, bloquearEnCapturista = false) {
  const el = document.getElementById(id);
  if (!el || !valor) return;
  el.value = valor;
  if (bloquearEnCapturista && esCapturista()) {
    el.readOnly = true;
    el.classList.add('campo-bloqueado-ine');
    el.title = 'Dato extraído de la INE (bloqueado)';
  }
}

function desbloquearCamposINE(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.readOnly = false;
    el.classList.remove('campo-bloqueado-ine');
    el.removeAttribute('title');
  });
}

function configurarListenerCamaraINE() {
  const input = document.getElementById('input-foto-ine');
  if (!input) return;

  input.addEventListener('change', async (e) => {
    const archivo = e.target.files && e.target.files[0];
    if (!archivo || !destinoINEActual) return;

    const destino = destinoINEActual;
    const inicio = performance.now();

    try {
      mostrarEstadoINE(destino, 'Leyendo credencial INE...', 'info');
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

      const { nombres, apellidos, curp, clave_elector, seccion, localidad, es_seccion_cunduacan } = data.datos;
      const nombreCompleto = `${apellidos || ''} ${nombres || ''}`.trim();

      if (destino === 'simpatizante') {
        desbloquearCamposINE(['simp-nombre', 'simp-curp', 'simp-clave-elector', 'simp-seccion', 'simp-localidad']);
        asignarValor('simp-nombre', nombreCompleto, true);
        asignarValor('simp-curp', curp, true);
        asignarValor('simp-clave-elector', clave_elector, true);
        asignarValor('simp-seccion', seccion, true);
        asignarValor('simp-localidad', localidad, true);
      } else if (destino === 'promotor') {
        desbloquearCamposINE(['prom-nombre', 'prom-seccion', 'prom-localidad']);
        asignarValor('prom-nombre', nombreCompleto, true);
        asignarValor('prom-seccion', seccion, true);
        asignarValor('prom-localidad', localidad, true);
      } else if (destino === 'estructura') {
        asignarValor('est-nombres', nombres);
        asignarValor('est-apellidos', apellidos);
        asignarValor('est-localidad', localidad);
        if (seccion && SECCIONES_CUNDUACAN.includes(seccion)) {
          seccionesSeleccionadasEst.add(seccion);
          renderizarChipsSeccionesEstructura();
        }
      }

      const segundos = ((performance.now() - inicio) / 1000).toFixed(1);

      if (seccion && !es_seccion_cunduacan) {
        mostrarEstadoINE(
          destino,
          `Leída en ${segundos}s, pero la sección ${seccion} no pertenece a las 60 secciones de Cunduacán.`,
          'alerta'
        );
      } else if (esCapturista()) {
        mostrarEstadoINE(
          destino,
          `Credencial leída en ${segundos}s. Datos de INE bloqueados; captura manualmente los campos restantes y guarda.`,
          'ok'
        );
      } else {
        mostrarEstadoINE(destino, `Credencial leída en ${segundos}s. Verifica los datos y guarda.`, 'ok');
      }
    } catch (error) {
      console.error('Error escaneo INE:', error);
      mostrarEstadoINE(destino, 'Error de conexión al procesar la credencial.', 'error');
    }
  });
}

// ==========================================
// LOGIN Y SESIÓN (SUPER USUARIO ADMIN / CAPTURISTA / PASE DE LISTA)
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

  document.getElementById('sidebar-nombre-usuario').textContent = usuarioActual.usuario;
  if (esSuperUsuario()) {
    document.getElementById('sidebar-rol-usuario').textContent = 'SUPER USUARIO · ADMIN';
  } else if (esCapturista()) {
    document.getElementById('sidebar-rol-usuario').textContent = 'CAPTURISTA · SOLO CAPTURA';
  } else if (esPaseLista()) {
    document.getElementById('sidebar-rol-usuario').textContent = `Pase de Lista · Sec. ${usuarioActual.seccion_asignada || 'Sin asignar'}`;
  } else {
    document.getElementById('sidebar-rol-usuario').textContent = usuarioActual.rol;
  }

  if (usuarioActual.requiere_cambio) {
    document.getElementById('modal-password').classList.remove('oculto');
  }

  document.querySelectorAll('#sidebar-menu .menu-item').forEach(btn => {
    btn.classList.remove('oculto');
  });

  const cardTablaSimp = document.getElementById('card-tabla-simpatizantes');
  const cardTablaProm = document.getElementById('card-tabla-promotores');
  const btnImprimir = document.getElementById('btn-topbar-imprimir');
  const plFiltroSeccion = document.getElementById('pl-filtro-seccion');
  const secPaseLista = document.getElementById('sec-pase-lista');
  const kpiPaseLista = document.getElementById('pl-total')?.closest('.grid-kpi');

  document.body.classList.remove('rol-pase-lista');
  if (cardTablaSimp) cardTablaSimp.classList.remove('oculto');
  if (cardTablaProm) cardTablaProm.classList.remove('oculto');
  if (btnImprimir) btnImprimir.classList.remove('oculto');
  if (kpiPaseLista) kpiPaseLista.classList.remove('oculto');
  if (secPaseLista) {
    secPaseLista.querySelectorAll('.acciones-excel, button').forEach(el => {
      if (
        el.classList.contains('acciones-excel') ||
        /exportar|print|imprimir/i.test(el.getAttribute('onclick') || '')
      ) {
        el.classList.remove('oculto');
      }
    });
  }
  if (plFiltroSeccion) {
    plFiltroSeccion.classList.remove('oculto');
    plFiltroSeccion.value = '';
  }

  const menuUsuarios = document.getElementById('menu-usuarios');
  if (!esSuperUsuario()) {
    menuUsuarios.classList.add('oculto');
  }

  if (esPaseLista()) {
    document.body.classList.add('rol-pase-lista');
    document.querySelectorAll('#sidebar-menu .menu-item').forEach(btn => {
      if (btn.dataset.vista !== 'sec-pase-lista') btn.classList.add('oculto');
    });
    if (plFiltroSeccion) {
      plFiltroSeccion.classList.add('oculto');
    }
    if (btnImprimir) {
      btnImprimir.classList.add('oculto');
    }
    if (kpiPaseLista) {
      kpiPaseLista.classList.add('oculto');
    }
    if (secPaseLista) {
      secPaseLista.querySelectorAll('.acciones-excel, button').forEach(el => {
        if (
          el.classList.contains('acciones-excel') ||
          /exportar|print|imprimir/i.test(el.getAttribute('onclick') || '')
        ) {
          el.classList.add('oculto');
        }
      });
    }
    cargarSimpatizantes();
    navegarA('sec-pase-lista', `Pase de Lista · Sección ${usuarioActual.seccion_asignada || ''}`);
  } else if (esCapturista()) {
    const vistasCapturista = new Set(['sec-simpatizantes', 'sec-promotores']);
    document.querySelectorAll('#sidebar-menu .menu-item').forEach(btn => {
      if (!vistasCapturista.has(btn.dataset.vista)) btn.classList.add('oculto');
    });
    if (cardTablaSimp) cardTablaSimp.classList.add('oculto');
    if (cardTablaProm) cardTablaProm.classList.add('oculto');
    if (btnImprimir) btnImprimir.classList.add('oculto');

    cargarPromotores();
    navegarA('sec-simpatizantes', 'Captura de Simpatizantes');
  } else {
    cargarTodo();
    navegarA('sec-avances', 'Avances y Resumen General');
  }
}

function cerrarSesion() {
  localStorage.removeItem('usuario_territorial');
  usuarioActual = null;
  location.reload();
}

async function cargarTodo() {
  await Promise.all([
    cargarAvances(),
    cargarSimpatizantes(),
    cargarPromotores(),
    cargarEstructura()
  ]);
  renderizarAvances();
  renderizarAvancePromotores();
  if (esSuperUsuario()) cargarUsuarios();
}

// ==========================================
// 1. AVANCES Y RESUMEN GENERAL
// ==========================================
async function cargarAvances() {
  const res = await fetch('/api/avances');
  if (res.ok) {
    cacheAvances = await res.json();
    renderizarAvances();
  }
}

function obtenerFilasAvances() {
  const mapaAvances = new Map(cacheAvances.map(a => [a.seccion, a]));
  const fSec = (document.getElementById('filtro-avances-seccion')?.value || '').trim();
  const fEst = document.getElementById('filtro-avances-estado')?.value || 'todas';

  return SECCIONES_CUNDUACAN
    .filter(sec => {
      const dato = mapaAvances.get(sec) || { total_registrados: 0, total_asistieron: 0 };
      if (fSec && !sec.includes(fSec)) return false;
      if (fEst === 'con' && dato.total_registrados === 0) return false;
      if (fEst === 'sin' && dato.total_registrados > 0) return false;
      return true;
    })
    .map(sec => {
      const dato = mapaAvances.get(sec) || { total_registrados: 0, total_asistieron: 0 };
      const pendientes = Math.max(0, dato.total_registrados - dato.total_asistieron);
      const pct = dato.total_registrados > 0
        ? ((dato.total_asistieron / dato.total_registrados) * 100).toFixed(1)
        : '0.0';
      const promsSec = cachePromotores.filter(p => p.seccion === sec).length;
      const coordSec = cacheEstructura.find(
        e => e.rol === 'Coordinador de Sección' && String(e.seccion).split(',').map(s => s.trim()).includes(sec)
      );

      return {
        seccion: sec,
        coordinador: coordSec ? `${coordSec.nombres} ${coordSec.apellidos}` : 'Sin asignar',
        promotores: promsSec,
        registrados: dato.total_registrados,
        asistieron: dato.total_asistieron,
        pendientes,
        pct
      };
    });
}

function renderizarAvances() {
  const tbody = document.getElementById('tabla-avances-body');
  if (!tbody) return;

  let totalReg = 0;
  let totalAsis = 0;
  let seccionesActivas = 0;

  cacheAvances.forEach(a => {
    totalReg += a.total_registrados;
    totalAsis += a.total_asistieron;
    if (a.total_registrados > 0) seccionesActivas++;
  });

  const pctGlobal = totalReg > 0 ? ((totalAsis / totalReg) * 100).toFixed(1) : '0.0';
  const pctSecciones = ((seccionesActivas / 60) * 100).toFixed(1);

  document.getElementById('kpi-registrados').textContent = totalReg;
  document.getElementById('kpi-asistieron').textContent = totalAsis;
  document.getElementById('kpi-porcentaje').textContent = `${pctGlobal}%`;
  document.getElementById('barra-asistencia-global').style.width = `${pctGlobal}%`;
  document.getElementById('kpi-promotores').textContent = cachePromotores.length;
  document.getElementById('kpi-secciones').textContent = `${seccionesActivas} / 60`;
  document.getElementById('barra-secciones-activas').style.width = `${pctSecciones}%`;

  const filas = obtenerFilasAvances();
  tbody.innerHTML = filas.map(r => `
    <tr>
      <td><span class="badge badge-morado">${r.seccion}</span></td>
      <td>${r.coordinador === 'Sin asignar' ? '<span style="color:#9ca3af;">Sin asignar</span>' : r.coordinador}</td>
      <td>${r.promotores}</td>
      <td><strong>${r.registrados}</strong></td>
      <td style="color:var(--verde); font-weight:700;">${r.asistieron}</td>
      <td>${r.pendientes}</td>
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="progreso-wrap" style="margin-top:0;"><div class="progreso-barra verde" style="width:${r.pct}%;"></div></div>
          <span style="font-size:0.82rem; font-weight:700;">${r.pct}%</span>
        </div>
      </td>
    </tr>
  `).join('');
}

function exportarExcelAvances() {
  const filas = obtenerFilasAvances().map(r => ({
    Seccion: r.seccion,
    Coordinador: r.coordinador,
    Promotores: r.promotores,
    Registrados: r.registrados,
    Asistieron: r.asistieron,
    Pendientes: r.pendientes,
    Avance: `${r.pct}%`
  }));
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Avances_60_Secciones');
  XLSX.writeFile(wb, 'Avances_Secciones_Cunduacan_2027.xlsx');
}

function exportarPDFAvances() {
  const filas = obtenerFilasAvances().map(r => [
    r.seccion,
    r.coordinador,
    String(r.promotores),
    String(r.registrados),
    String(r.asistieron),
    String(r.pendientes),
    `${r.pct}%`
  ]);
  generarPDFTabla({
    titulo: 'Avances y Resumen General por Sección',
    subtitulo: 'Desglose de las 60 secciones electorales',
    columnas: ['Sección', 'Coordinador de Sección', 'Promotores', 'Registrados', 'Asistieron', 'Pendientes', '% Asistencia'],
    filas,
    nombreArchivo: 'Avances_Secciones_Cunduacan_2027.pdf'
  });
}

// ==========================================
// 1B. AVANCE POR PROMOTOR (100% = 15 SIMPATIZANTES)
// ==========================================
function calcularEstadisticasPromotores() {
  const referidosPorPromotor = new Map();
  cacheSimpatizantes.forEach(s => {
    const ref = String(s.referencia || '').trim().toUpperCase();
    if (!ref) return;
    if (!referidosPorPromotor.has(ref)) {
      referidosPorPromotor.set(ref, []);
    }
    referidosPorPromotor.get(ref).push(s);
  });

  return cachePromotores.map(p => {
    const nombreNorm = String(p.nombre || '').trim().toUpperCase();
    const referidos = (referidosPorPromotor.get(nombreNorm) || []).slice().sort((a, b) =>
      String(a.nombre || '').localeCompare(String(b.nombre || ''))
    );
    const cantidad = referidos.length;
    const asistieron = referidos.filter(s => Boolean(s.asistio)).length;
    const faltantes = Math.max(0, META_SIMPATIZANTES_PROMOTOR - cantidad);
    const porcentaje = (cantidad / META_SIMPATIZANTES_PROMOTOR) * 100;
    return {
      ...p,
      referidos,
      cantidad,
      asistieron,
      faltantes,
      porcentaje
    };
  });
}

function obtenerAvancePromotoresFiltrados() {
  const listaCompleta = calcularEstadisticasPromotores();
  const fSec = (document.getElementById('filtro-ap-seccion')?.value || '').trim();
  const fBusq = (document.getElementById('filtro-ap-busqueda')?.value || '').trim().toUpperCase();
  const fEst = document.getElementById('filtro-ap-estado')?.value || 'todos';

  return listaCompleta
    .filter(p => {
      if (fSec && !String(p.seccion).includes(fSec)) return false;
      if (fBusq && !`${p.nombre} ${p.localidad}`.toUpperCase().includes(fBusq)) return false;
      if (fEst === 'cumplida' && p.cantidad < META_SIMPATIZANTES_PROMOTOR) return false;
      if (fEst === 'proceso' && (p.cantidad === 0 || p.cantidad >= META_SIMPATIZANTES_PROMOTOR)) return false;
      if (fEst === 'cero' && p.cantidad > 0) return false;
      return true;
    })
    .sort((a, b) => b.cantidad - a.cantidad || String(a.seccion).localeCompare(String(b.seccion)));
}

function toggleDetallePromotor(idPromotor) {
  const clave = String(idPromotor);
  if (promotoresExpandidos.has(clave)) {
    promotoresExpandidos.delete(clave);
  } else {
    promotoresExpandidos.add(clave);
  }
  renderizarAvancePromotores();
}

function renderizarAvancePromotores() {
  const tbody = document.getElementById('tabla-avance-promotores-body');
  if (!tbody) return;

  const listaCompleta = calcularEstadisticasPromotores();
  const totalPromotores = listaCompleta.length;
  const totalVinculados = listaCompleta.reduce((acc, p) => acc + p.cantidad, 0);
  const cumplidos = listaCompleta.filter(p => p.cantidad >= META_SIMPATIZANTES_PROMOTOR).length;
  const metaTotalGlobal = totalPromotores * META_SIMPATIZANTES_PROMOTOR;
  const pctGlobal = metaTotalGlobal > 0 ? ((totalVinculados / metaTotalGlobal) * 100).toFixed(1) : '0.0';

  document.getElementById('ap-kpi-total-promotores').textContent = totalPromotores;
  document.getElementById('ap-kpi-total-referidos').textContent = totalVinculados;
  document.getElementById('ap-kpi-cumplidos').textContent = `${cumplidos} / ${totalPromotores}`;
  document.getElementById('ap-kpi-porcentaje-global').textContent = `${pctGlobal}%`;
  document.getElementById('ap-barra-global').style.width = `${Math.min(100, Number(pctGlobal))}%`;

  const filtrados = obtenerAvancePromotoresFiltrados();

  tbody.innerHTML = filtrados.map(p => {
    const pctTexto = `${p.porcentaje.toFixed(1)}%`;
    const anchoBarra = Math.min(100, p.porcentaje).toFixed(1);
    const badgeClase = p.cantidad >= META_SIMPATIZANTES_PROMOTOR
      ? 'badge-verde'
      : (p.cantidad > 0 ? 'badge-morado' : 'badge-ambar');
    const estaExpandido = promotoresExpandidos.has(String(p.id));
    const pendientesPart = p.cantidad - p.asistieron;

    const filaPromotor = `
      <tr class="fila-promotor-click ${estaExpandido ? 'expandida' : ''}" onclick="toggleDetallePromotor(${p.id})" title="Haz clic para ver o ocultar el listado de simpatizantes">
        <td>
          <span class="indicador-expandir">${estaExpandido ? '▼' : '▶'}</span>
          <span class="badge badge-morado">${p.seccion}</span>
        </td>
        <td>
          <strong>${p.nombre}</strong>
          <div class="subtexto-participacion">${p.asistieron} de ${p.cantidad} participaron</div>
        </td>
        <td>${p.telefono || ''}</td>
        <td>${p.localidad || ''}</td>
        <td><span class="badge ${badgeClase}">${p.cantidad} / ${META_SIMPATIZANTES_PROMOTOR}</span></td>
        <td>${p.faltantes === 0 ? '<span style="color:var(--verde); font-weight:700;">Meta cumplida</span>' : p.faltantes}</td>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="progreso-wrap" style="margin-top:0;"><div class="progreso-barra verde" style="width:${anchoBarra}%;"></div></div>
            <span style="font-size:0.82rem; font-weight:700;">${pctTexto}</span>
          </div>
        </td>
      </tr>
    `;

    if (!estaExpandido) return filaPromotor;

    const contenidoDetalle = p.referidos.length === 0
      ? `<p class="detalle-vacio">Este promotor aún no tiene simpatizantes registrados a su nombre.</p>`
      : `
        <div class="tabla-wrap">
          <table class="subtabla-detalle">
            <thead>
              <tr>
                <th>#</th>
                <th>Sección</th>
                <th>Nombre Completo</th>
                <th>Teléfono</th>
                <th>Localidad / Dirección</th>
                <th>Status de Participación</th>
              </tr>
            </thead>
            <tbody>
              ${p.referidos.map((s, idx) => `
                <tr>
                  <td><strong>${idx + 1}</strong></td>
                  <td><span class="badge badge-morado">${s.seccion}</span></td>
                  <td><strong>${s.nombre}</strong></td>
                  <td>${s.telefono || '-'}</td>
                  <td>${s.localidad || '-'}</td>
                  <td>
                    ${s.asistio
                      ? '<span class="badge badge-verde">✓ Participó</span>'
                      : '<span class="badge badge-ambar">Pendiente</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

    const filaDetalle = `
      <tr class="fila-detalle-promotor">
        <td colspan="7">
          <div class="panel-detalle-promotor">
            <div class="panel-detalle-header">
              <span>📋 Listado a nombre de <strong>${p.nombre}</strong></span>
              <div class="panel-detalle-badges">
                <span class="badge badge-morado">Total: ${p.cantidad}</span>
                <span class="badge badge-verde">Participaron: ${p.asistieron}</span>
                <span class="badge badge-ambar">Pendientes: ${pendientesPart}</span>
              </div>
            </div>
            ${contenidoDetalle}
          </div>
        </td>
      </tr>
    `;

    return filaPromotor + filaDetalle;
  }).join('');
}

function exportarExcelAvancePromotores() {
  const lista = obtenerAvancePromotoresFiltrados();
  const filasResumen = lista.map(p => ({
    Seccion: p.seccion,
    Promotor: p.nombre,
    Telefono: p.telefono || '',
    Localidad: p.localidad || '',
    Simpatizantes: p.cantidad,
    Participaron: p.asistieron,
    Pendientes_Participacion: p.cantidad - p.asistieron,
    Meta: META_SIMPATIZANTES_PROMOTOR,
    Faltantes_Meta: p.faltantes,
    Porcentaje_Avance: `${p.porcentaje.toFixed(1)}%`
  }));

  const filasDetalle = [];
  lista.forEach(p => {
    if (p.referidos.length === 0) {
      filasDetalle.push({
        Promotor: p.nombre,
        Seccion_Promotor: p.seccion,
        No: 0,
        Simpatizante: 'SIN REGISTROS',
        Seccion_Simpatizante: '',
        Telefono: '',
        Localidad: '',
        Status_Participacion: ''
      });
    } else {
      p.referidos.forEach((s, idx) => {
        filasDetalle.push({
          Promotor: p.nombre,
          Seccion_Promotor: p.seccion,
          No: idx + 1,
          Simpatizante: s.nombre,
          Seccion_Simpatizante: s.seccion,
          Telefono: s.telefono || '',
          Localidad: s.localidad || '',
          Status_Participacion: s.asistio ? 'PARTICIPO' : 'PENDIENTE'
        });
      });
    }
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasResumen), 'Resumen_Promotores');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasDetalle), 'Detalle_Por_Promotor');
  XLSX.writeFile(wb, 'Avance_Por_Promotor_Cunduacan_2027.xlsx');
}

function exportarPDFAvancePromotores() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('La librería PDF aún está cargando. Intenta de nuevo en un segundo.');
    return;
  }

  const lista = obtenerAvancePromotoresFiltrados();
  const totalSimp = lista.reduce((acc, p) => acc + p.cantidad, 0);
  const totalPart = lista.reduce((acc, p) => acc + p.asistieron, 0);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const fechaHora = new Date().toLocaleString('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short'
  });

  doc.setFillColor(59, 7, 100);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Cunduacán 2027 · Avance por Promotor y Listado de Participación', 14, 10);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Meta: 15 = 100%  |  Promotores: ${lista.length}  |  Simpatizantes: ${totalSimp}  |  Participaron: ${totalPart}  |  Generado: ${fechaHora}`,
    14,
    17
  );

  const filasCuerpo = [];
  const metaFilas = [];

  lista.forEach(p => {
    filasCuerpo.push([
      `Sec. ${p.seccion}`,
      `PROMOTOR: ${p.nombre}`,
      p.telefono || '-',
      p.localidad || '-',
      `${p.cantidad} / ${META_SIMPATIZANTES_PROMOTOR}`,
      p.faltantes === 0 ? 'Cumplida' : String(p.faltantes),
      `${p.porcentaje.toFixed(1)}% (${p.asistieron} part.)`
    ]);
    metaFilas.push({ tipo: 'promotor' });

    if (p.referidos.length === 0) {
      filasCuerpo.push([
        '',
        '   Sin simpatizantes registrados a su nombre',
        '',
        '',
        '',
        '',
        ''
      ]);
      metaFilas.push({ tipo: 'vacio' });
    } else {
      p.referidos.forEach((s, idx) => {
        filasCuerpo.push([
          `   #${idx + 1} (Sec. ${s.seccion})`,
          `   • ${s.nombre}`,
          s.telefono || '-',
          s.localidad || '-',
          '',
          '',
          s.asistio ? 'PARTICIPÓ' : 'PENDIENTE'
        ]);
        metaFilas.push({ tipo: 'simpatizante', asistio: Boolean(s.asistio) });
      });
    }
  });

  doc.autoTable({
    head: [['Sección / #', 'Promotor / Simpatizante', 'Teléfono', 'Localidad / Dirección', 'Meta', 'Faltantes', 'Avance / Participación']],
    body: filasCuerpo,
    startY: 27,
    theme: 'grid',
    styles: {
      fontSize: 7.8,
      cellPadding: 2.3,
      textColor: [31, 41, 55],
      lineColor: [233, 213, 255],
      lineWidth: 0.2
    },
    headStyles: {
      fillColor: [107, 33, 168],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const meta = metaFilas[data.row.index];
      if (!meta) return;

      if (meta.tipo === 'promotor') {
        data.cell.styles.fillColor = [243, 232, 255];
        data.cell.styles.textColor = [59, 7, 100];
        data.cell.styles.fontStyle = 'bold';
      } else if (meta.tipo === 'vacio') {
        data.cell.styles.fillColor = [255, 255, 255];
        data.cell.styles.textColor = [107, 114, 128];
        data.cell.styles.fontStyle = 'italic';
      } else if (meta.tipo === 'simpatizante') {
        data.cell.styles.fillColor = [255, 255, 255];
        if (data.column.index === 6) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = meta.asistio ? [21, 128, 61] : [180, 83, 9];
        }
      }
    },
    margin: { left: 14, right: 14, bottom: 16 },
    didDrawPage: (data) => {
      const totalPaginas = doc.internal.getNumberOfPages();
      const altoPagina = doc.internal.pageSize.getHeight();
      const anchoPagina = doc.internal.pageSize.getWidth();
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text(
        `Organización Territorial Cunduacán · Página ${data.pageNumber} de ${totalPaginas}`,
        anchoPagina - 14,
        altoPagina - 7,
        { align: 'right' }
      );
    }
  });

  doc.save('Avance_Por_Promotor_Detallado_Cunduacan_2027.pdf');
}

// ==========================================
// 2. SIMPATIZANTES Y PASE DE LISTA
// ==========================================
async function cargarSimpatizantes() {
  if (esCapturista()) return;

  if (esPaseLista()) {
    if (!usuarioActual.seccion_asignada) {
      cacheSimpatizantes = [];
      renderizarPaseLista();
      return;
    }
    const res = await fetch(`/api/simpatizantes/${encodeURIComponent(usuarioActual.seccion_asignada)}?basico=1`);
    if (res.ok) {
      cacheSimpatizantes = await res.json();
      renderizarPaseLista();
    }
    return;
  }

  const res = await fetch('/api/simpatizantes-todos');
  if (res.ok) {
    cacheSimpatizantes = await res.json();
    renderizarSimpatizantes();
    renderizarPaseLista();
    renderizarPromotores();
    renderizarAvancePromotores();
  }
}

function obtenerSimpatizantesFiltrados() {
  const fSec = (document.getElementById('filtro-simp-seccion')?.value || '').trim();
  const fBusq = (document.getElementById('filtro-simp-busqueda')?.value || '').trim().toUpperCase();
  const fAsis = document.getElementById('filtro-simp-asistencia')?.value || 'todos';

  return cacheSimpatizantes.filter(s => {
    if (fSec && !String(s.seccion).includes(fSec)) return false;
    if (fAsis === 'si' && !s.asistio) return false;
    if (fAsis === 'no' && s.asistio) return false;
    if (fBusq) {
      const texto = `${s.nombre} ${s.curp || ''} ${s.clave_elector || ''} ${s.localidad} ${s.referencia} ${s.telefono}`.toUpperCase();
      if (!texto.includes(fBusq)) return false;
    }
    return true;
  });
}

function renderizarSimpatizantes() {
  const tbody = document.getElementById('tabla-simpatizantes-body');
  if (!tbody) return;

  const filtrados = obtenerSimpatizantesFiltrados();
  document.getElementById('contador-simpatizantes').textContent = filtrados.length;

  tbody.innerHTML = filtrados.map(s => `
    <tr>
      <td>
        <input type="checkbox" ${s.asistio ? 'checked' : ''} onchange="toggleAsistencia(${s.id}, this.checked)" style="width:18px; height:18px; accent-color: var(--morado-principal); cursor:pointer;" />
      </td>
      <td><span class="badge badge-morado">${s.seccion}</span></td>
      <td><strong>${s.nombre}</strong></td>
      <td style="font-family:monospace; font-size:0.84rem;">${s.curp || '-'}</td>
      <td style="font-family:monospace; font-size:0.84rem;">${s.clave_elector || '-'}</td>
      <td>${s.telefono || ''}</td>
      <td>${s.localidad || ''}</td>
      <td>${s.referencia || ''}</td>
      <td class="no-print">
        <button type="button" class="btn btn-sm btn-editar" onclick="editarSimpatizante(${s.id})">Editar</button>
        <button type="button" class="btn btn-sm btn-rojo" onclick="eliminarSimpatizante(${s.id})">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

function obtenerPaseListaFiltrado() {
  const fSec = (document.getElementById('pl-filtro-seccion')?.value || '').trim();
  const fNom = (document.getElementById('pl-filtro-nombre')?.value || '').trim().toUpperCase();
  const fEst = document.getElementById('pl-filtro-estado')?.value || 'todos';

  return cacheSimpatizantes.filter(s => {
    if (esPaseLista() && usuarioActual.seccion_asignada) {
      if (String(s.seccion) !== String(usuarioActual.seccion_asignada)) return false;
    } else if (fSec && !String(s.seccion).includes(fSec)) {
      return false;
    }
    if (fEst === 'si' && !s.asistio) return false;
    if (fEst === 'no' && s.asistio) return false;
    if (fNom) {
      const textoBusqueda = esPaseLista()
        ? `${s.nombre}`
        : `${s.nombre} ${s.localidad || ''}`;
      if (!textoBusqueda.toUpperCase().includes(fNom)) return false;
    }
    return true;
  });
}

function renderizarPaseLista() {
  const tbody = document.getElementById('tabla-pase-lista-body');
  if (!tbody) return;

  const tabla = tbody.closest('table');
  const thead = tabla ? tabla.querySelector('thead') : null;
  const soloBasicoPaseLista = esPaseLista();

  if (thead) {
    if (soloBasicoPaseLista) {
      thead.innerHTML = `
        <tr>
          <th>Nombre Completo</th>
          <th>Sección</th>
          <th>Status</th>
          <th>Confirmación</th>
        </tr>
      `;
    } else {
      thead.innerHTML = `
        <tr>
          <th>Status</th>
          <th>Sección</th>
          <th>Nombre Completo</th>
          <th>Localidad</th>
          <th>Promotor / Referencia</th>
          <th>Acción</th>
        </tr>
      `;
    }
  }

  const filtrados = obtenerPaseListaFiltrado();
  const asistieron = filtrados.filter(s => s.asistio).length;

  const plTotalEl = document.getElementById('pl-total');
  const plAsisEl = document.getElementById('pl-asistieron');
  const plPendEl = document.getElementById('pl-pendientes');
  if (plTotalEl) plTotalEl.textContent = filtrados.length;
  if (plAsisEl) plAsisEl.textContent = asistieron;
  if (plPendEl) plPendEl.textContent = filtrados.length - asistieron;

  if (soloBasicoPaseLista) {
    tbody.innerHTML = filtrados.map(s => `
      <tr>
        <td><strong>${s.nombre}</strong></td>
        <td><span class="badge badge-morado">${s.seccion}</span></td>
        <td>
          ${s.asistio
            ? '<span class="badge badge-verde">Confirmado</span>'
            : '<span class="badge badge-ambar">Pendiente</span>'}
        </td>
        <td>
          ${s.asistio
            ? '<button type="button" class="btn btn-sm btn-gris" disabled style="opacity:0.78; cursor:not-allowed;">🔒 Confirmado</button>'
            : `<button type="button" class="btn btn-sm btn-verde" onclick="toggleAsistencia(${s.id}, true)">✓ Confirmar Asistencia</button>`}
        </td>
      </tr>
    `).join('');
    return;
  }

  tbody.innerHTML = filtrados.map(s => `
    <tr>
      <td>
        ${s.asistio
          ? '<span class="badge badge-verde">Asistió</span>'
          : '<span class="badge badge-ambar">Pendiente</span>'}
      </td>
      <td><span class="badge badge-morado">${s.seccion}</span></td>
      <td><strong>${s.nombre}</strong></td>
      <td>${s.localidad || ''}</td>
      <td>${s.referencia || ''}</td>
      <td>
        <button type="button" class="btn btn-sm ${s.asistio ? 'btn-gris' : 'btn-verde'}" onclick="toggleAsistencia(${s.id}, ${!s.asistio})">
          ${s.asistio ? 'Desmarcar' : '✓ Confirmar Asistencia'}
        </button>
      </td>
    </tr>
  `).join('');
}

function exportarExcelPaseLista() {
  if (esPaseLista()) return;

  const datos = obtenerPaseListaFiltrado().map(s => ({
    Estado: s.asistio ? 'ASISTIO' : 'PENDIENTE',
    Seccion: s.seccion,
    Nombre: s.nombre,
    CURP: s.curp || '',
    Clave_Elector: s.clave_elector || '',
    Localidad: s.localidad || '',
    Referencia: s.referencia || ''
  }));

  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pase_de_Lista');
  XLSX.writeFile(wb, 'Pase_de_Lista_Cunduacan_2027.xlsx');
}

function exportarPDFPaseLista() {
  if (esPaseLista()) return;

  const filas = obtenerPaseListaFiltrado().map(s => [
    s.asistio ? 'ASISTIÓ' : 'PENDIENTE',
    s.seccion,
    s.nombre,
    s.localidad || '-',
    s.referencia || '-'
  ]);
  generarPDFTabla({
    titulo: 'Pase de Lista · Control de Asistencia',
    subtitulo: 'Padrón de verificación territorial',
    columnas: ['Status', 'Sección', 'Nombre Completo', 'Localidad', 'Promotor / Referencia'],
    filas,
    nombreArchivo: 'Pase_de_Lista_Cunduacan_2027.pdf'
  });
}

async function guardarSimpatizante(e) {
  e.preventDefault();
  const id = document.getElementById('simp-id').value;
  const payload = {
    nombre: document.getElementById('simp-nombre').value,
    curp: document.getElementById('simp-curp').value,
    clave_elector: document.getElementById('simp-clave-elector').value,
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
    if (esCapturista()) {
      mostrarEstadoINE('simpatizante', 'Simpatizante guardado correctamente. Listo para el siguiente registro.', 'ok');
    } else {
      await cargarSimpatizantes();
      if (esSuperUsuario()) await cargarAvances();
    }
  } else {
    alert('Error al guardar simpatizante.');
  }
}

function editarSimpatizante(id) {
  const s = cacheSimpatizantes.find(item => item.id === id);
  if (!s) return;
  desbloquearCamposINE(['simp-nombre', 'simp-curp', 'simp-clave-elector', 'simp-seccion', 'simp-localidad']);
  document.getElementById('simp-id').value = s.id;
  document.getElementById('simp-nombre').value = s.nombre;
  document.getElementById('simp-curp').value = s.curp || '';
  document.getElementById('simp-clave-elector').value = s.clave_elector || '';
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
  desbloquearCamposINE(['simp-nombre', 'simp-curp', 'simp-clave-elector', 'simp-seccion', 'simp-localidad']);
  document.getElementById('simp-id').value = '';
  document.getElementById('titulo-form-simp').textContent = 'Registrar Simpatizante';
  document.getElementById('btn-cancelar-simp').classList.add('oculto');
  document.getElementById('estado-ine-simpatizante').classList.add('oculto');
}

async function toggleAsistencia(id, asistio) {
  const item = cacheSimpatizantes.find(s => s.id === id);

  if (!esSuperUsuario()) {
    if (item && item.asistio) return;
    if (!asistio) return;

    const nombreComp = item ? item.nombre : 'este simpatizante';
    const seccionComp = item ? item.seccion : (usuarioActual.seccion_asignada || '');
    const confirmado = confirm(
      `¿Confirmar la asistencia de "${nombreComp}" (Sección ${seccionComp})?\n\nUna vez confirmada, el registro quedará bloqueado.`
    );
    if (!confirmado) return;
  }

  const res = await fetch(`/api/simpatizantes/${id}/asistencia`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      asistio: Boolean(asistio),
      rol: usuarioActual ? usuarioActual.rol : '',
      seccion_asignada: usuarioActual ? usuarioActual.seccion_asignada : ''
    })
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'No se pudo actualizar el estatus.');
    await cargarSimpatizantes();
    return;
  }

  if (item) item.asistio = Boolean(asistio);
  renderizarSimpatizantes();
  renderizarPaseLista();
  renderizarAvancePromotores();
  if (esSuperUsuario()) cargarAvances();
}

async function eliminarSimpatizante(id) {
  if (!confirm('¿Eliminar este simpatizante?')) return;
  const res = await fetch(`/api/simpatizantes/${id}`, { method: 'DELETE' });
  if (res.ok) {
    await cargarSimpatizantes();
    if (esSuperUsuario()) await cargarAvances();
  }
}

function descargarPlantillaSimpatizantes() {
  const ejemplo = [
    {
      Seccion: '0615',
      Nombre: 'PEREZ LOPEZ JUAN',
      CURP: 'PELJ850412HTCRRN09',
      Clave_Elector: 'PRLPJN85041227H100',
      Telefono: '9141234567',
      Localidad: 'R/A. HUIMANGO 1RA',
      Referencia: 'GOMEZ MARIA',
      Asistio: 'NO'
    }
  ];
  const ws = XLSX.utils.json_to_sheet(ejemplo);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
  XLSX.writeFile(wb, 'Plantilla_Simpatizantes.xlsx');
}

function exportarExcelSimpatizantes() {
  const datos = obtenerSimpatizantesFiltrados().map(s => ({
    Seccion: s.seccion,
    Nombre: s.nombre,
    CURP: s.curp || '',
    Clave_Elector: s.clave_elector || '',
    Telefono: s.telefono || '',
    Localidad: s.localidad || '',
    Referencia: s.referencia || '',
    Asistio: s.asistio ? 'SI' : 'NO'
  }));
  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Simpatizantes');
  XLSX.writeFile(wb, 'Simpatizantes_Cunduacan_2027.xlsx');
}

function exportarPDFSimpatizantes() {
  const filas = obtenerSimpatizantesFiltrados().map(s => [
    s.seccion,
    s.nombre,
    s.curp || '-',
    s.clave_elector || '-',
    s.telefono || '-',
    s.localidad || '-',
    s.referencia || '-',
    s.asistio ? 'SÍ' : 'NO'
  ]);
  generarPDFTabla({
    titulo: 'Base de Datos de Simpatizantes',
    subtitulo: 'Padrón electoral municipal',
    columnas: ['Sección', 'Nombre Completo', 'CURP', 'Clave de Elector', 'Teléfono', 'Localidad', 'Promotor / Ref.', 'Asistió'],
    filas,
    nombreArchivo: 'Simpatizantes_Cunduacan_2027.pdf'
  });
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
    curp: f.CURP || f.curp || f.Curp || '',
    clave_elector: f.Clave_Elector || f.clave_elector || f['Clave de Elector'] || f.CLAVE_ELECTOR || '',
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
  await cargarSimpatizantes();
  if (esSuperUsuario()) await cargarAvances();
}

// ==========================================
// 3. PROMOTORES
// ==========================================
async function cargarPromotores() {
  const res = await fetch('/api/promotores');
  if (res.ok) {
    cachePromotores = await res.json();
    actualizarDatalistPromotores();
    if (!esCapturista()) {
      renderizarPromotores();
      renderizarAvancePromotores();
    }
  }
}

function actualizarDatalistPromotores() {
  const dl = document.getElementById('lista-promotores-registrados');
  if (!dl) return;
  dl.innerHTML = cachePromotores.map(p => `<option value="${p.nombre}"></option>`).join('');
}

function obtenerPromotoresFiltrados() {
  const fSec = (document.getElementById('filtro-prom-seccion')?.value || '').trim();
  const fBusq = (document.getElementById('filtro-prom-busqueda')?.value || '').trim().toUpperCase();

  return cachePromotores.filter(p => {
    if (fSec && !String(p.seccion).includes(fSec)) return false;
    if (fBusq && !`${p.nombre} ${p.localidad}`.toUpperCase().includes(fBusq)) return false;
    return true;
  });
}

function renderizarPromotores() {
  const tbody = document.getElementById('tabla-promotores-body');
  if (!tbody) return;

  const filtrados = obtenerPromotoresFiltrados();
  document.getElementById('contador-promotores').textContent = filtrados.length;

  tbody.innerHTML = filtrados.map(p => {
    const nombreProm = String(p.nombre || '').trim().toUpperCase();
    const totalReferidos = cacheSimpatizantes.filter(
      s => String(s.referencia || '').trim().toUpperCase() === nombreProm
    ).length;

    return `
      <tr>
        <td><span class="badge badge-morado">${p.seccion}</span></td>
        <td><strong>${p.nombre}</strong></td>
        <td>${p.telefono || ''}</td>
        <td>${p.localidad || ''}</td>
        <td><span class="badge badge-verde">${totalReferidos} / ${META_SIMPATIZANTES_PROMOTOR}</span></td>
        <td class="no-print">
          <button type="button" class="btn btn-sm btn-editar" onclick="editarPromotor(${p.id})">Editar</button>
          <button type="button" class="btn btn-sm btn-rojo" onclick="eliminarPromotor(${p.id})">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');
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
    await cargarPromotores();
    if (esCapturista()) {
      mostrarEstadoINE('promotor', 'Promotor guardado correctamente. Listo para el siguiente registro.', 'ok');
    } else if (esSuperUsuario()) {
      renderizarAvances();
    }
  } else {
    alert('Error al guardar promotor.');
  }
}

function editarPromotor(id) {
  const p = cachePromotores.find(item => item.id === id);
  if (!p) return;
  desbloquearCamposINE(['prom-nombre', 'prom-seccion', 'prom-localidad']);
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
  desbloquearCamposINE(['prom-nombre', 'prom-seccion', 'prom-localidad']);
  document.getElementById('prom-id').value = '';
  document.getElementById('titulo-form-prom').textContent = 'Registrar Promotor';
  document.getElementById('btn-cancelar-prom').classList.add('oculto');
  document.getElementById('estado-ine-promotor').classList.add('oculto');
}

async function eliminarPromotor(id) {
  if (!confirm('¿Eliminar este promotor?')) return;
  const res = await fetch(`/api/promotores/${id}`, { method: 'DELETE' });
  if (res.ok) {
    await cargarPromotores();
    if (esSuperUsuario()) renderizarAvances();
  }
}

function exportarExcelPromotores() {
  const datos = obtenerPromotoresFiltrados().map(p => {
    const nombreProm = String(p.nombre || '').trim().toUpperCase();
    const totalReferidos = cacheSimpatizantes.filter(
      s => String(s.referencia || '').trim().toUpperCase() === nombreProm
    ).length;
    return {
      Seccion: p.seccion,
      Nombre: p.nombre,
      Telefono: p.telefono || '',
      Localidad: p.localidad || '',
      Simpatizantes: totalReferidos
    };
  });
  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Promotores');
  XLSX.writeFile(wb, 'Promotores_Cunduacan_2027.xlsx');
}

function exportarPDFPromotores() {
  const filas = obtenerPromotoresFiltrados().map(p => {
    const nombreProm = String(p.nombre || '').trim().toUpperCase();
    const totalReferidos = cacheSimpatizantes.filter(
      s => String(s.referencia || '').trim().toUpperCase() === nombreProm
    ).length;
    return [
      p.seccion,
      p.nombre,
      p.telefono || '-',
      p.localidad || '-',
      `${totalReferidos} / ${META_SIMPATIZANTES_PROMOTOR}`
    ];
  });
  generarPDFTabla({
    titulo: 'Base de Datos de Promotores',
    subtitulo: 'Red de promoción territorial',
    columnas: ['Sección', 'Nombre del Promotor', 'Teléfono', 'Localidad', 'Simpatizantes'],
    filas,
    nombreArchivo: 'Promotores_Cunduacan_2027.pdf'
  });
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
  await cargarPromotores();
}

// ==========================================
// 4. ESTRUCTURA PRINCIPAL (20 ZONAS, 37 RUTAS, 60 SECCIONES)
// ==========================================
function alCambiarRolEstructura() {
  const rol = document.getElementById('est-rol').value;
  const grupoRuta = document.getElementById('grupo-est-ruta');
  const inputRuta = document.getElementById('est-ruta');
  if (rol === 'Coordinador de Zona') {
    grupoRuta.classList.add('oculto');
    inputRuta.required = false;
  } else {
    grupoRuta.classList.remove('oculto');
    inputRuta.required = true;
  }
  renderizarChipsSeccionesEstructura();
}

function renderizarChipsSeccionesEstructura() {
  const grid = document.getElementById('grid-secciones-estructura');
  if (!grid) return;

  const rolActual = document.getElementById('est-rol')?.value || 'Coordinador de Zona';
  const editId = document.getElementById('est-id')?.value;

  const ocupadasPorRol = new Set();
  cacheEstructura.forEach(item => {
    if (editId && String(item.id) === String(editId)) return;
    if (item.rol === rolActual && item.seccion) {
      String(item.seccion).split(',').forEach(s => ocupadasPorRol.add(s.trim()));
    }
  });

  grid.innerHTML = SECCIONES_CUNDUACAN.map(sec => {
    const sel = seccionesSeleccionadasEst.has(sec);
    const ocup = ocupadasPorRol.has(sec);
    const clases = ['chip-seccion', sel ? 'seleccionada' : '', !sel && ocup ? 'ocupada' : ''].filter(Boolean).join(' ');
    return `<div class="${clases}" onclick="toggleChipSeccion('${sec}')">${sec}</div>`;
  }).join('');

  const txt = document.getElementById('texto-secciones-seleccionadas');
  if (txt) {
    const arr = Array.from(seccionesSeleccionadasEst).sort();
    txt.textContent = arr.length > 0 ? arr.join(', ') : 'Ninguna';
  }
}

function toggleChipSeccion(sec) {
  if (seccionesSeleccionadasEst.has(sec)) {
    seccionesSeleccionadasEst.delete(sec);
  } else {
    seccionesSeleccionadasEst.add(sec);
  }
  renderizarChipsSeccionesEstructura();
}

async function cargarEstructura() {
  const res = await fetch('/api/estructura');
  if (res.ok) {
    cacheEstructura = await res.json();
    renderizarEstructura();
    renderizarChipsSeccionesEstructura();
  }
}

function obtenerEstructuraFiltrada() {
  const fZona = document.getElementById('filtro-est-zona')?.value || '';
  const fRol = document.getElementById('filtro-est-rol')?.value || '';
  const fBusq = (document.getElementById('filtro-est-busqueda')?.value || '').trim().toUpperCase();

  return cacheEstructura.filter(e => {
    if (fZona && String(e.zona) !== fZona) return false;
    if (fRol && e.rol !== fRol) return false;
    if (fBusq && !`${e.nombres} ${e.apellidos} ${e.seccion} ${e.localidad}`.toUpperCase().includes(fBusq)) return false;
    return true;
  });
}

function renderizarEstructura() {
  const tbody = document.getElementById('tabla-estructura-body');
  if (!tbody) return;

  const zonasCubiertas = new Set(cacheEstructura.map(e => Number(e.zona)).filter(Boolean));
  const rutasCubiertas = new Set(cacheEstructura.map(e => Number(e.ruta)).filter(Boolean));
  const seccionesCubiertas = new Set();
  cacheEstructura.forEach(e => {
    String(e.seccion || '').split(',').map(s => s.trim()).filter(Boolean).forEach(s => seccionesCubiertas.add(s));
  });

  document.getElementById('est-kpi-zonas').textContent = `${zonasCubiertas.size} / 20`;
  document.getElementById('est-barra-zonas').style.width = `${((zonasCubiertas.size / 20) * 100).toFixed(1)}%`;

  document.getElementById('est-kpi-rutas').textContent = `${rutasCubiertas.size} / 37`;
  document.getElementById('est-barra-rutas').style.width = `${((rutasCubiertas.size / 37) * 100).toFixed(1)}%`;

  document.getElementById('est-kpi-secciones').textContent = `${seccionesCubiertas.size} / 60`;
  document.getElementById('est-barra-secciones').style.width = `${((seccionesCubiertas.size / 60) * 100).toFixed(1)}%`;

  const filtrados = obtenerEstructuraFiltrada();
  document.getElementById('contador-estructura').textContent = filtrados.length;

  tbody.innerHTML = filtrados.map(e => `
    <tr>
      <td><strong>Zona ${e.zona}</strong></td>
      <td>${e.ruta ? 'Ruta ' + e.ruta : '-'}</td>
      <td><span class="badge badge-morado">${e.rol}</span></td>
      <td>${e.seccion}</td>
      <td><strong>${e.nombres} ${e.apellidos}</strong></td>
      <td>${e.telefono || ''}</td>
      <td>${e.localidad || ''}</td>
      <td class="no-print">
        <button type="button" class="btn btn-sm btn-editar" onclick="editarEstructura(${e.id})">Editar</button>
        <button type="button" class="btn btn-sm btn-rojo" onclick="eliminarEstructura(${e.id})">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function guardarEstructura(e) {
  e.preventDefault();
  const id = document.getElementById('est-id').value;
  const secciones = Array.from(seccionesSeleccionadasEst).sort();

  if (secciones.length === 0) {
    alert('Selecciona al menos una sección electoral.');
    return;
  }

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
    await cargarEstructura();
    renderizarAvances();
  } else {
    alert(data.error || 'No se pudo guardar el registro.');
  }
}

function editarEstructura(id) {
  const e = cacheEstructura.find(item => item.id === id);
  if (!e) return;
  document.getElementById('est-id').value = e.id;
  document.getElementById('est-rol').value = e.rol;
  alCambiarRolEstructura();
  document.getElementById('est-zona').value = e.zona;
  if (e.ruta) document.getElementById('est-ruta').value = e.ruta;
  document.getElementById('est-nombres').value = e.nombres;
  document.getElementById('est-apellidos').value = e.apellidos;
  document.getElementById('est-telefono').value = e.telefono || '';
  document.getElementById('est-localidad').value = e.localidad || '';

  seccionesSeleccionadasEst = new Set(
    String(e.seccion || '').split(',').map(s => s.trim()).filter(Boolean)
  );
  renderizarChipsSeccionesEstructura();

  document.getElementById('titulo-form-est').textContent = 'Editar Integrante de Estructura';
  document.getElementById('btn-cancelar-est').classList.remove('oculto');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetFormEstructura() {
  document.getElementById('form-estructura').reset();
  document.getElementById('est-id').value = '';
  seccionesSeleccionadasEst.clear();
  alCambiarRolEstructura();
  document.getElementById('titulo-form-est').textContent = 'Registrar Integrante en Estructura Principal';
  document.getElementById('btn-cancelar-est').classList.add('oculto');
  document.getElementById('estado-ine-estructura').classList.add('oculto');
}

async function eliminarEstructura(id) {
  if (!confirm('¿Eliminar este integrante de la estructura?')) return;
  const res = await fetch(`/api/estructura/${id}`, { method: 'DELETE' });
  if (res.ok) {
    await cargarEstructura();
    renderizarAvances();
  }
}

function exportarExcelEstructura() {
  const datos = obtenerEstructuraFiltrada().map(e => ({
    Zona: e.zona,
    Ruta: e.ruta || '',
    Cargo: e.rol,
    Secciones: e.seccion,
    Nombres: e.nombres,
    Apellidos: e.apellidos,
    Telefono: e.telefono || '',
    Localidad: e.localidad || ''
  }));
  const ws = XLSX.utils.json_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Estructura_2027');
  XLSX.writeFile(wb, 'Estructura_Principal_Cunduacan_2027.xlsx');
}

function exportarPDFEstructura() {
  const filas = obtenerEstructuraFiltrada().map(e => [
    `Zona ${e.zona}`,
    e.ruta ? `Ruta ${e.ruta}` : '-',
    e.rol,
    e.seccion,
    `${e.nombres} ${e.apellidos}`,
    e.telefono || '-',
    e.localidad || '-'
  ]);
  generarPDFTabla({
    titulo: 'Estructura Territorial Principal',
    subtitulo: '20 Zonas · 37 Rutas · 60 Secciones',
    columnas: ['Zona', 'Ruta', 'Cargo', 'Secciones', 'Nombre Completo', 'Teléfono', 'Localidad'],
    filas,
    nombreArchivo: 'Estructura_Principal_Cunduacan_2027.pdf'
  });
}

// ==========================================
// 5. USUARIOS / EQUIPO (SOLO SUPER USUARIO ADMIN)
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

function onCambioSelectRolUsuario(id) {
  const selRol = document.getElementById(`edit-rol-${id}`);
  const selSec = document.getElementById(`edit-sec-${id}`);
  const txtSec = document.getElementById(`edit-sec-texto-${id}`);
  if (!selRol || !selSec || !txtSec) return;

  if (selRol.value === 'pase_lista') {
    selSec.classList.remove('oculto');
    txtSec.classList.add('oculto');
  } else {
    selSec.classList.add('oculto');
    txtSec.classList.remove('oculto');
  }
}

async function cambiarRolUsuario(id) {
  const u = cacheUsuarios.find(item => item.id === id);
  const selRol = document.getElementById(`edit-rol-${id}`);
  const selSec = document.getElementById(`edit-sec-${id}`);
  if (!selRol) return;

  const nuevoRol = selRol.value;
  const nuevaSeccion = nuevoRol === 'pase_lista' ? (selSec ? selSec.value : '') : null;

  if (nuevoRol === 'pase_lista' && !nuevaSeccion) {
    alert('Selecciona la sección asignada para el rol Pase de Lista.');
    if (selSec) selSec.focus();
    return;
  }

  const nombreUsuario = u ? u.usuario : 'este usuario';
  const detalleRol = nuevoRol === 'pase_lista' ? `pase_lista (Sección ${nuevaSeccion})` : nuevoRol;
  if (!confirm(`¿Cambiar el rol de "${nombreUsuario}" a "${detalleRol}"?`)) return;

  const res = await fetch(`/api/usuarios/${id}/rol`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rol: nuevoRol,
      seccion_asignada: nuevaSeccion
    })
  });

  const data = await res.json();
  if (res.ok) {
    alert(`Rol de "${nombreUsuario}" actualizado correctamente.`);
    await cargarUsuarios();
  } else {
    alert(data.error || 'No se pudo cambiar el rol.');
  }
}

async function cargarUsuarios() {
  const res = await fetch('/api/usuarios');
  if (!res.ok) return;
  cacheUsuarios = await res.json();
  const tbody = document.getElementById('tabla-usuarios-body');
  if (!tbody) return;

  tbody.innerHTML = cacheUsuarios.map(u => {
    if (u.usuario === 'admin') {
      return `
        <tr>
          <td><strong>${u.usuario}</strong></td>
          <td>${u.password}</td>
          <td><span class="badge badge-morado">admin (Super Usuario)</span></td>
          <td>-</td>
          <td class="no-print"><span style="color:#9ca3af; font-size:0.82rem;">Principal</span></td>
        </tr>
      `;
    }

    return `
      <tr>
        <td><strong>${u.usuario}</strong></td>
        <td>${u.password}</td>
        <td>
          <select id="edit-rol-${u.id}" class="select-tabla-rol" onchange="onCambioSelectRolUsuario(${u.id})">
            <option value="capturista" ${u.rol === 'capturista' ? 'selected' : ''}>capturista</option>
            <option value="pase_lista" ${u.rol === 'pase_lista' ? 'selected' : ''}>pase_lista</option>
            <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>admin (Super Usuario)</option>
          </select>
        </td>
        <td>
          <select id="edit-sec-${u.id}" class="select-tabla-rol ${u.rol === 'pase_lista' ? '' : 'oculto'}">
            <option value="">Selecciona sección...</option>
            ${SECCIONES_CUNDUACAN.map(sec => `<option value="${sec}" ${u.seccion_asignada === sec ? 'selected' : ''}>${sec}</option>`).join('')}
          </select>
          <span id="edit-sec-texto-${u.id}" class="${u.rol === 'pase_lista' ? 'oculto' : ''}" style="color:#9ca3af;">-</span>
        </td>
        <td class="no-print">
          <button type="button" class="btn btn-sm btn-editar" onclick="cambiarRolUsuario(${u.id})">Guardar Rol</button>
          <button type="button" class="btn btn-sm btn-rojo" onclick="eliminarUsuario(${u.id})">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');
}

function exportarPDFUsuarios() {
  const filas = cacheUsuarios.map(u => [
    u.usuario,
    u.password,
    u.rol === 'admin' ? 'admin (Super Usuario)' : u.rol,
    u.seccion_asignada || 'Todas'
  ]);
  generarPDFTabla({
    titulo: 'Usuarios y Equipo del Sistema',
    subtitulo: 'Control de accesos y roles',
    columnas: ['Usuario', 'Contraseña', 'Rol', 'Sección Asignada'],
    filas,
    nombreArchivo: 'Usuarios_Sistema_Cunduacan_2027.pdf',
    orientacion: 'portrait'
  });
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
  const data = await res.json();
  if (res.ok) {
    document.getElementById('form-usuario').reset();
    toggleCampoSeccionUsuario();
    cargarUsuarios();
  } else {
    alert(data.error || 'Error al crear usuario.');
  }
}

async function eliminarUsuario(id) {
  if (!confirm('¿Eliminar este usuario?')) return;
  const res = await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
  if (res.ok) cargarUsuarios();
}