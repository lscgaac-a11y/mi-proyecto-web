const form = document.getElementById('dataForm');
const input = document.getElementById('nombreInput');
const lista = document.getElementById('listaRegistros');

// Escuchar el envío del formulario
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const texto = input.value;

  // Enviar datos al servidor
  const res = await fetch('/api/registros', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: texto })
  });

  if (res.ok) {
    input.value = '';
    cargarRegistros();
  }
});

// Obtener y mostrar registros desde el servidor
async function cargarRegistros() {
  const res = await fetch('/api/registros');
  const datos = await res.json();
  lista.innerHTML = datos.map(d => `<li>${d.item}</li>`).join('');
}

cargarRegistros();