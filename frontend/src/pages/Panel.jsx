import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "../components/Layout";
import { useAuth } from "../context/AuthContext";
import EnVivo from "../components/panel/EnVivo";
import Operarios from "../components/panel/Operarios";
import Mercancia from "../components/panel/Mercancia";
import Flujo from "../components/panel/Flujo";
import Metas from "../components/panel/Metas";
import { COLOR, PERIODOS } from "../components/panel/formato";
import { estiloBoton, imprimir } from "../components/panel/herramientas";

const PESTANAS = [
  { id: "vivo", texto: "En vivo" },
  { id: "operarios", texto: "Operarios" },
  { id: "mercancia", texto: "Mercancía" },
  { id: "flujo", texto: "Flujo" },
  { id: "metas", texto: "Metas y descargas" },
];

const ESTILOS = `
  .panel-tab { font: inherit; font-size: 15px; font-weight: 500; padding: 10px 18px; min-height: 44px; border: none; border-radius: 8px 8px 0 0; background: transparent; color: #FFFFFF; cursor: pointer; }
  .panel-tab:hover { color: #00FF87; }
  .panel-tab[aria-selected="true"] { background: #00FF87; color: #0A0A0A; font-weight: 600; }
  .panel-tab:focus-visible { outline: 2px solid #00FF87; outline-offset: 2px; }
  .panel-solo-print { display: none; }
  @media print {
    @page { margin: 12mm; }
    body { background: #FFFFFF !important; }
    .wms-sidebar, .wms-topbar, .wms-bottomnav, .wms-header, .wms-mobile-title, .wms-mobile-menu, .wms-mobile-overlay, .panel-no-print { display: none !important; }
    .wms-layout { display: block !important; background: #FFFFFF !important; min-height: 0 !important; }
    .wms-content { padding: 0 !important; overflow: visible !important; }
    .panel-solo-print { display: block; }
    .panel-seccion { break-inside: avoid; }
    .panel-salto { break-before: page; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

// Informe completo para PDF: todas las pestañas del periodo, una tras otra.
// Imprime cuando las cuatro han cargado sus datos.
function Informe({ periodo, onFin }) {
  const cargadas = useRef(new Set());
  const impreso = useRef(false);
  const [listas, setListas] = useState(0);
  const titulo = `Informe ${periodo.periodo === "mes" ? "mensual" : "semanal"} MACHO WMS`;

  const marcar = useCallback((id) => {
    if (cargadas.current.has(id)) return;
    cargadas.current.add(id);
    setListas(cargadas.current.size);
  }, []);
  const callbacks = useMemo(
    () => ({
      vivo: () => marcar("vivo"),
      operarios: () => marcar("operarios"),
      mercancia: () => marcar("mercancia"),
      flujo: () => marcar("flujo"),
    }),
    [marcar],
  );

  useEffect(() => {
    if (listas < 4 || impreso.current) return undefined;
    impreso.current = true;
    // Un momento para que el navegador pinte las gráficas antes de imprimir.
    const id = setTimeout(() => {
      window.addEventListener("afterprint", onFin, { once: true });
      imprimir(titulo);
    }, 400);
    return () => clearTimeout(id);
  }, [listas, onFin, titulo]);

  const secciones = [
    { id: "vivo", texto: "En vivo", C: EnVivo },
    { id: "operarios", texto: "Operarios", C: Operarios },
    { id: "mercancia", texto: "Mercancía", C: Mercancia },
    { id: "flujo", texto: "Flujo", C: Flujo },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div className="panel-no-print" style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", background: "#FFF4D6", borderRadius: "12px", padding: "14px 18px" }}>
        <span style={{ fontSize: "14px" }} role="status">
          {listas < 4 ? `Preparando el informe (${listas}/4 secciones)…` : "Informe listo. Si no se abrió el diálogo de impresión, usa el botón."}
        </span>
        <div style={{ flex: "1 1 auto" }} />
        <button type="button" style={estiloBoton(false)} onClick={onFin}>Volver al panel</button>
        <button type="button" style={estiloBoton(true)} disabled={listas < 4} onClick={() => imprimir(titulo)}>Imprimir / PDF</button>
      </div>
      <h1 style={{ margin: 0, fontFamily: "'Bebas Neue', sans-serif", fontSize: "34px", letterSpacing: "0.04em" }}>
        {titulo} · {PERIODOS[periodo.periodo].etiqueta}
      </h1>
      {secciones.map(({ id, texto, C }, i) => (
        <div key={id} className={i > 0 ? "panel-salto" : undefined} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <h2 style={{ margin: 0, fontFamily: "'Bebas Neue', sans-serif", fontSize: "26px", letterSpacing: "0.04em" }}>{texto}</h2>
          <C fijo={periodo} onCargado={callbacks[id]} />
        </div>
      ))}
    </div>
  );
}

export default function Panel() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === "administrador";
  const [params, setParams] = useSearchParams();
  const pestana = PESTANAS.some((p) => p.id === params.get("tab")) ? params.get("tab") : "vivo";
  const [informe, setInforme] = useState(null);
  const terminarInforme = useCallback(() => setInforme(null), []);

  const cambiar = (id) => setParams(id === "vivo" ? {} : { tab: id }, { replace: true });
  const teclas = (e) => {
    const i = PESTANAS.findIndex((p) => p.id === pestana);
    let j = null;
    if (e.key === "ArrowRight") j = (i + 1) % PESTANAS.length;
    if (e.key === "ArrowLeft") j = (i - 1 + PESTANAS.length) % PESTANAS.length;
    if (e.key === "Home") j = 0;
    if (e.key === "End") j = PESTANAS.length - 1;
    if (j == null) return;
    e.preventDefault();
    cambiar(PESTANAS[j].id);
    document.getElementById(`tab-${PESTANAS[j].id}`)?.focus();
  };

  return (
    <Layout titulo="Panel de control" subtitulo={esAdmin ? "Administrador" : "Gerente logístico"}>
      <style>{ESTILOS}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "1440px", margin: "0 auto", color: COLOR.negro }}>
        {informe ? (
          <Informe periodo={informe} onFin={terminarInforme} />
        ) : (
          <>
            <div className="panel-no-print" style={{ background: COLOR.negro, borderRadius: "12px", padding: "12px 16px 0" }}>
              <div role="tablist" aria-label="Secciones del panel" onKeyDown={teclas} style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {PESTANAS.map((p) => (
                  <button
                    key={p.id}
                    id={`tab-${p.id}`}
                    type="button"
                    role="tab"
                    className="panel-tab"
                    aria-selected={pestana === p.id}
                    aria-controls="panel-contenido"
                    tabIndex={pestana === p.id ? 0 : -1}
                    onClick={() => cambiar(p.id)}
                  >
                    {p.texto}
                  </button>
                ))}
              </div>
            </div>
            <h1 className="panel-solo-print" style={{ margin: 0, fontFamily: "'Bebas Neue', sans-serif", fontSize: "30px" }}>
              MACHO WMS · {PESTANAS.find((p) => p.id === pestana).texto}
            </h1>
            <div id="panel-contenido" role="tabpanel" aria-labelledby={`tab-${pestana}`}>
              {pestana === "vivo" && <EnVivo />}
              {pestana === "operarios" && <Operarios />}
              {pestana === "mercancia" && <Mercancia />}
              {pestana === "flujo" && <Flujo />}
              {pestana === "metas" && <Metas esAdmin={esAdmin} onInforme={setInforme} />}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
