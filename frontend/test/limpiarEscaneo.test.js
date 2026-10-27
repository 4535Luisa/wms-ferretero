import { test, describe } from "node:test";
import assert from "node:assert";
import { limpiarEscaneo } from "../src/components/limpiarEscaneo.js";

describe("limpiarEscaneo: lo que entrega la pistola o la cámara", () => {
  const casos = [
    ["EAN14 con AI (01) del Honeywell", "0117708935847713", "17708935847713"],
    ["EAN14 con (01) entre paréntesis", "(01)17708935847713", "17708935847713"],
    ["GS1-128 con lote y separador GS", "]C10117708935847713\x1d10LOTE5", "17708935847713"],
    ["GS1-128 con fecha (17) detrás", "011770893584771317261231", "17708935847713"],
    ["EAN14 limpio no cambia", "17708935847713", "17708935847713"],
    ["EAN-13 de la unidad no cambia", "7709031644636", "7709031644636"],
    ["referencia SIESA", "120363", "120363"],
    ["espacios y salto de línea alrededor", "  120363\r\n", "120363"],
    ["ubicación conserva mayúsculas/minúsculas", "b13-1", "b13-1"],
    ["etiqueta de ubicación UB-", "UB-c12-1", "UB-c12-1"],
    ["prefijo AIM de QR", "]Q1UB-A1-2", "UB-A1-2"],
    ["vacío", "", ""],
    ["solo caracteres de control", "\x1d\x1d", ""],
    ["null", null, ""],
    ["undefined", undefined, ""],
    ["número", 120363, "120363"],
  ];
  for (const [nombre, entrada, esperado] of casos)
    test(nombre, () => assert.equal(limpiarEscaneo(entrada), esperado));

  test("01 seguido de menos de 14 dígitos no se toca", () => {
    assert.equal(limpiarEscaneo("01234567"), "01234567");
  });

  test("01 + 14 dígitos + letras sin AI no se recorta", () => {
    assert.equal(limpiarEscaneo("0117708935847713ABC"), "0117708935847713ABC");
  });

  test("texto muy largo no se cuelga", () => {
    const largo = "9".repeat(100000);
    assert.equal(limpiarEscaneo(largo).length, 100000);
  });
});
