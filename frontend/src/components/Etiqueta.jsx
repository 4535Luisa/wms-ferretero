import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export default function Etiqueta({ producto, cantidad, ubicacion, onCerrar }) {
  const barcodeRef = useRef(null);

  useEffect(() => {
    if (barcodeRef.current && producto?.referencia) {
      JsBarcode(barcodeRef.current, producto.referencia, {
        format: "CODE128",
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 14,
        margin: 8,
        background: "#ffffff",
        lineColor: "#000000",
      });
    }
  }, [producto]);

  const imprimir = () => {
    const ventana = window.open("", "_blank", "width=400,height=300");
    ventana.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Etiqueta — ${producto.referencia}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 12px; }
          .etiqueta { width: 350px; border: 1px solid #000; padding: 10px; }
          .empresa { font-size: 11px; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 4px; }
          .descripcion { font-size: 12px; font-weight: bold; margin-bottom: 2px; line-height: 1.3; }
          .referencia { font-size: 11px; color: #555; margin-bottom: 8px; font-family: monospace; }
          .barcode-wrap { text-align: center; margin: 8px 0; }
          .barcode-wrap svg { width: 100%; }
          .info { display: flex; justify-content: space-between; font-size: 11px; margin-top: 6px; border-top: 1px solid #eee; padding-top: 6px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="etiqueta">
          <div class="empresa">Indurruedas S.A. — MACHO</div>
          <div class="descripcion">${producto.descripcion}</div>
          <div class="referencia">Ref: ${producto.referencia}</div>
          <div class="barcode-wrap">
            ${barcodeRef.current?.outerHTML || ""}
          </div>
          <div class="info">
            <span>Cant: <strong>${cantidad} und</strong></span>
            ${ubicacion ? `<span>Ubic: <strong>${ubicacion}</strong></span>` : ""}
            <span>${new Date().toLocaleDateString("es-CO")}</span>
          </div>
        </div>
        <script>window.onload = () => { window.print(); window.close(); }</script>
      </body>
      </html>
    `);
    ventana.document.close();
  };

  if (!producto) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "12px",
          padding: "1.5rem",
          width: "380px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              fontFamily: "Bebas Neue, sans-serif",
              fontSize: "20px",
              letterSpacing: "0.04em",
            }}
          >
            Vista previa etiqueta
          </div>
          <button
            onClick={onCerrar}
            style={{
              background: "none",
              border: "none",
              fontSize: "22px",
              cursor: "pointer",
              color: "#888",
              lineHeight: 1,
              padding: "4px",
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            border: "1px solid #E8E8E8",
            borderRadius: "8px",
            padding: "12px",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#888",
              marginBottom: "4px",
            }}
          >
            Indurruedas S.A. — MACHO
          </div>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 700,
              marginBottom: "2px",
              lineHeight: 1.3,
            }}
          >
            {producto.descripcion}
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "#888",
              fontFamily: "DM Mono, monospace",
              marginBottom: "10px",
            }}
          >
            Ref: {producto.referencia}
          </div>
          <div style={{ textAlign: "center", marginBottom: "10px" }}>
            <svg ref={barcodeRef} />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "11px",
              paddingTop: "8px",
              borderTop: "1px solid #F0F0F0",
            }}
          >
            <span>
              Cant: <strong>{cantidad} und</strong>
            </span>
            {ubicacion && (
              <span>
                Ubic: <strong>{ubicacion}</strong>
              </span>
            )}
            <span>{new Date().toLocaleDateString("es-CO")}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={onCerrar}
            style={{
              flex: 1,
              background: "transparent",
              color: "#0A0A0A",
              border: "1.5px solid #E8E8E8",
              borderRadius: "8px",
              padding: "10px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "Outfit, sans-serif",
            }}
          >
            Omitir
          </button>
          <button
            onClick={imprimir}
            style={{
              flex: 2,
              background: "#00FF87",
              color: "#0A0A0A",
              border: "none",
              borderRadius: "8px",
              padding: "10px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "Outfit, sans-serif",
            }}
          >
            🖨 Imprimir etiqueta
          </button>
        </div>
      </div>
    </div>
  );
}
