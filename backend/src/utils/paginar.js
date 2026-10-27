// Supabase (PostgREST) devuelve como máximo 1000 filas por consulta. Estas
// utilidades piden todas las páginas o parten listas largas de ids.

const TAM_PAGINA = 1000;

// construir() debe devolver una consulta nueva (con su orden estable) en
// cada llamada; se le aplica .range() por página hasta que no haya más.
async function traerTodo(construir, tam = TAM_PAGINA) {
  const filas = [];
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await construir().range(desde, desde + tam - 1);
    if (error) return { data: null, error };
    filas.push(...(data || []));
    if (!data || data.length < tam) return { data: filas, error: null };
  }
}

// Ejecuta consultar(lote) por lotes de ids (evita URLs demasiado largas en
// los filtros .in()) y une los resultados.
async function porLotes(ids, consultar, tam = 200) {
  const filas = [];
  for (let i = 0; i < ids.length; i += tam) {
    const { data, error } = await consultar(ids.slice(i, i + tam));
    if (error) return { data: null, error };
    filas.push(...(data || []));
  }
  return { data: filas, error: null };
}

module.exports = { traerTodo, porLotes, TAM_PAGINA };
