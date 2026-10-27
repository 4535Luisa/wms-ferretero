// Limpia lo que entrega la pistola o la cámara antes de usarlo:
// - caracteres de control (el separador GS de las etiquetas GS1-128);
// - el identificador de simbología AIM que algunos lectores anteponen ("]C1");
// - el AI (01) de GS1 delante de un EAN14: "(01)177…" / "01177…" → "177…",
//   aunque detrás vengan más datos GS1 (lote, fecha…).
export function limpiarEscaneo(texto) {
  let v = String(texto ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .replace(/^\][A-Za-z]\d/, "");
  const gs1 = v.match(/^\(?01\)?(\d{14})(?:$|\(?\d{2})/);
  if (gs1) v = gs1[1];
  return v;
}
