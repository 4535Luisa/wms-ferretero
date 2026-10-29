import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import ScanInput, { bip } from "../components/ScanInput";
import api from "../services/api";
import { reportarErrorEscaneo } from "../services/errorEscaneo";
import {
  Pagina,
  Acciones,
  Boton,
  Tarjeta,
  FilaKpis,
  Kpi,
  Campo,
  Mensaje,
  Tabla,
  Vacio,
  Pastilla,
  Modal,
  Progreso,
} from "../components/oficina";
import { estiloCampo, COLOR } from "../components/oficinaDatos";
import { num, haceTiempo } from "../components/panel/formato";

const mono = { fontFamily: "DM Mono, monospace" };

export default function Verificacion() {
  const [pedidos, setPedidos] = useState([]);
  const [activo, setActivo] = useState(null);
  const [vista, setVista] = useState("lista");
  const [mensaje, setMensaje] = useState({ texto: "", tipo: "" });
  const [cargando, setCargando] = useState(false);
  const [modalDiferencia, setModalDiferencia] = useState(null);
  const [modalSaldo, setModalSaldo] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [cantidadReal, setCantidadReal] = useState("");
  const [cantidadSaldoRecibida, setCantidadSaldoRecibida] = useState("");
  // Ítem del último escaneo correcto: se muestra de primero en pendientes.
  const [ultimoEscaneado, setUltimoEscaneado] = useState(null);

  const aviso = (texto, tipo = "ok") => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: "", tipo: "" }), 3500);
  };

  const cargarLista = async () => {
    try {
      const { data } = await api.get("/api/verificacion");
      setPedidos(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    cargarLista();
  }, []);

  const abrir = async (id) => {
    try {
      const { data } = await api.get(`/api/verificacion/${id}`);
      setActivo(data);
      setUltimoEscaneado(null);
      setVista("detalle");
    } catch (err) {
      console.error(err);
    }
  };

  const recargarActivo = async () => {
    if (!activo?.id) return;
    try {
      const { data } = await api.get(`/api/verificacion/${activo.id}`);
      setActivo(data);
    } catch (err) {
      console.error(err);
    }
  };

  // Calcula el estado de verificacion de un item
  const itemVerifInfo = (item) => {
    const ue = item.productos?.unidad_empaque || 1;
    const cantPicking = item.cantidad_picking ?? item.cantidad_pedida ?? 0;
    const cantSaldos = item.cantidad_saldos || 0;
    const unidadesCajas = cantPicking - cantSaldos;
    const cajasCompletas =
      unidadesCajas > 0 ? Math.ceil(unidadesCajas / ue) : 0;
    const unidadesVerificadas = item.unidades_verificadas || 0;
    const cajasVerificadas = ue > 0 ? Math.floor(unidadesVerificadas / ue) : 0;
    const cajasListas = cajasVerificadas >= cajasCompletas;
    const tieneSaldos = cantSaldos > 0;
    const saldoVerificado = item.saldo_verificado === true;
    const completo =
      item.verificado === true && (!tieneSaldos || saldoVerificado);
    return {
      ue,
      cantPicking,
      cantSaldos,
      unidadesCajas,
      cajasCompletas,
      cajasVerificadas,
      cajasListas,
      tieneSaldos,
      saldoVerificado,
      completo,
    };
  };

  // Escaneo de caja: el jefe escanea EAN14 de cada caja fisica
  const onEscanear = async (refEscaneada) => {
    if (!activo) return;

    // Busca el ítem del código escaneado para dar respuesta rápida; la
    // verificación definitiva la hace el backend. Se compara con la referencia
    // y el EAN14 de la caja; si no coincide y es numérico, puede ser el
    // código de barras de la unidad (EAN-13), que se resuelve en el servidor.
    const codigos = [refEscaneada.trim().toUpperCase()];
    const esDe = (item) => {
      const ci = (item.productos?.codigo_interno || "").trim().toUpperCase();
      const ean = (item.productos?.ean14 || "").trim().toUpperCase();
      return codigos.some((c) => c === ci || (ean && c === ean));
    };
    const buscar = () => ({
      objetivo: (activo.pedido_items || []).find((item) => {
        const info = itemVerifInfo(item);
        if (info.cajasListas) return false;
        if (item.verificado && !item.saldo_verificado && info.tieneSaldos)
          return false;
        return esDe(item);
      }),
      yaCompleto: (activo.pedido_items || []).find(
        (item) => itemVerifInfo(item).cajasListas && esDe(item),
      ),
    });

    let { objetivo, yaCompleto } = buscar();
    if (!objetivo && !yaCompleto && /^\d{8,14}$/.test(codigos[0])) {
      try {
        const { data } = await api.get(
          `/api/productos/buscar-barras?codigo_barras=${codigos[0]}`,
        );
        if (data?.codigo_interno) {
          codigos.push(data.codigo_interno.trim().toUpperCase());
          ({ objetivo, yaCompleto } = buscar());
        }
      } catch {
        // 404: el código no pertenece a ningún producto
      }
    }

    if (!objetivo) {
      bip("error");
      if (!yaCompleto)
        reportarErrorEscaneo({ codigo: refEscaneada, modulo: "verificacion", pedido_id: activo.id });
      aviso(
        yaCompleto
          ? `Las cajas de ${yaCompleto.productos?.codigo_interno} ya están verificadas`
          : `Código no reconocido: ${refEscaneada}`,
        "error",
      );
      return;
    }

    setCargando(true);
    try {
      const { data } = await api.patch(
        `/api/verificacion/${activo.id}/items/${objetivo.id}/verificar`,
        { referencia_escaneada: refEscaneada },
      );
      bip("ok");
      setUltimoEscaneado(objetivo.id);
      aviso(
        data.cajasListas
          ? `Cajas de ${objetivo.productos?.codigo_interno} completadas`
          : `Caja escaneada (${data.cajasVerificadas}/${data.cajasCompletas})`,
      );
      await recargarActivo();
    } catch (err) {
      bip("error");
      aviso(err.response?.data?.error || "Error al verificar", "error");
    } finally {
      setCargando(false);
    }
  };

  // Confirmar saldo recibido manualmente
  const confirmarSaldo = async () => {
    if (!modalSaldo || cantidadSaldoRecibida === "") return;
    setCargando(true);
    try {
      const { data } = await api.patch(
        `/api/verificacion/${activo.id}/items/${modalSaldo.item.id}/saldo`,
        { cantidad_saldo_recibida: Number(cantidadSaldoRecibida) },
      );
      bip("ok");
      aviso(data.mensaje || "Saldo confirmado");
      setModalSaldo(null);
      setCantidadSaldoRecibida("");
      await recargarActivo();
    } catch (err) {
      bip("error");
      aviso(err.response?.data?.error || "Error al confirmar saldo", "error");
    } finally {
      setCargando(false);
    }
  };

  const registrarDiferencia = async () => {
    if (!modalDiferencia || !cantidadReal || !motivo.trim()) return;
    setCargando(true);
    try {
      await api.post(
        `/api/verificacion/${activo.id}/items/${modalDiferencia.item.id}/diferencia`,
        { cantidad_real: Number(cantidadReal), motivo: motivo.trim() },
      );
      bip("ok");
      aviso("Diferencia registrada");
      setModalDiferencia(null);
      setMotivo("");
      setCantidadReal("");
      await recargarActivo();
    } catch (err) {
      bip("error");
      aviso(
        err.response?.data?.error || "Error al registrar diferencia",
        "error",
      );
    } finally {
      setCargando(false);
    }
  };

  const confirmar = async () => {
    if (!activo) return;
    setCargando(true);
    try {
      await api.patch(`/api/verificacion/${activo.id}/confirmar`);
      aviso("Pedido verificado y enviado a facturación");
      setVista("lista");
      setActivo(null);
      await cargarLista();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al confirmar", "error");
    } finally {
      setCargando(false);
    }
  };

  const confirmarConDiferencias = async () => {
    if (!activo) return;
    setCargando(true);
    try {
      await api.post(`/api/verificacion/${activo.id}/confirmar-diferencias`);
      aviso("Pedido aprobado con diferencias — enviado a facturación");
      setVista("lista");
      setActivo(null);
      await cargarLista();
    } catch (err) {
      aviso(err.response?.data?.error || "Error al confirmar", "error");
    } finally {
      setCargando(false);
    }
  };

  const items = activo?.pedido_items || [];
  const itemsInfo = items.map((i) => ({ item: i, info: itemVerifInfo(i) }));
  const todosCompletos =
    items.length > 0 && itemsInfo.every(({ info }) => info.completo);
  const hayDiferencias = items.some((i) => i.motivo_diferencia);
  const todosVerificadosODiferencia =
    items.length > 0 &&
    itemsInfo.every(
      ({ item, info }) => info.completo || item.motivo_diferencia,
    );

  const cajasTotal = itemsInfo.reduce((a, { info }) => a + info.cajasCompletas, 0);
  const cajasHechas = itemsInfo.reduce(
    (a, { info }) => a + Math.min(info.cajasVerificadas, info.cajasCompletas),
    0,
  );
  const saldosPendientes = itemsInfo.filter(
    ({ info }) => info.tieneSaldos && !info.saldoVerificado,
  ).length;
  const completas = itemsInfo.filter(({ info }) => info.completo).length;

  // Pendientes arriba (el último escaneado de primero); las completas van
  // aparte, en una sección plegada.
  // La referencia del último escaneo va aparte, justo encima del escáner;
  // debajo quedan las demás pendientes y las completas en una sección plegada.
  const escaneada = itemsInfo.find(({ item }) => item.id === ultimoEscaneado);
  const pendientes = itemsInfo.filter(
    ({ item, info }) => !info.completo && item.id !== ultimoEscaneado,
  );
  const verificadas = itemsInfo.filter(
    ({ item, info }) => info.completo && item.id !== ultimoEscaneado,
  );

  const volver = () => {
    setVista("lista");
    setActivo(null);
    setUltimoEscaneado(null);
    cargarLista();
  };

  // Fila de una referencia del pedido en el detalle.
  const filaItem = ({ item, info }, idx, destacado = false) => {
    const faltan = info.cajasCompletas - info.cajasVerificadas;
    return (
      <div
        key={item.id}
        style={{
          padding: destacado ? "14px 12px" : "14px 0",
          margin: destacado ? "0 -12px" : 0,
          borderRadius: destacado ? "10px" : 0,
          background: destacado ? "#E3F7EC" : "transparent",
          borderTop:
            idx > 0 && !destacado ? `1px solid ${COLOR.bordeSuave}` : "none",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          {destacado && (
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: COLOR.verdeTexto,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "4px",
              }}
            >
              Último escaneo
            </div>
          )}
          <div style={{ fontSize: "14px", fontWeight: 600 }}>
            {item.productos?.descripcion_corta || item.descripcion}
          </div>
          <div style={{ ...mono, fontSize: "12px", color: COLOR.gris, marginTop: "4px" }}>
            {item.productos?.codigo_interno} · Pedido: {info.cantPicking} u
          </div>

          {info.cajasCompletas > 0 && (
            <div style={{ marginTop: "10px", maxWidth: "420px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  color: COLOR.gris,
                  marginBottom: "4px",
                }}
              >
                <span>
                  Cajas: {info.cajasVerificadas}/{info.cajasCompletas} ({info.ue} u/caja)
                </span>
                <span style={{ color: info.cajasListas ? COLOR.verdeTexto : COLOR.gris, fontWeight: 600 }}>
                  {info.cajasListas ? "Completo" : `Faltan ${faltan}`}
                </span>
              </div>
              <Progreso
                valor={info.cajasVerificadas}
                total={info.cajasCompletas}
                color={info.cajasListas ? COLOR.verdeBarra : COLOR.negro}
              />
            </div>
          )}

          {info.tieneSaldos && (
            <div style={{ marginTop: "10px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <Pastilla
                texto={`Saldos: ${info.cantSaldos} u — ${
                  info.saldoVerificado
                    ? `recibido ${item.cantidad_saldo_recibida ?? info.cantSaldos} u`
                    : "pendiente confirmar"
                }`}
                bg={info.saldoVerificado ? "#E3F7EC" : "#FFF4D6"}
                fg={info.saldoVerificado ? COLOR.verdeTexto : COLOR.ambar}
              />
              {info.cajasListas && !info.saldoVerificado && (
                <Boton
                  pequeno
                  variante="principal"
                  onClick={() => {
                    setModalSaldo({ item, info });
                    setCantidadSaldoRecibida(String(info.cantSaldos));
                  }}
                >
                  Confirmar saldo
                </Boton>
              )}
            </div>
          )}

          {item.motivo_diferencia && (
            <div style={{ marginTop: "8px", fontSize: "13px", color: COLOR.rojo, fontWeight: 500 }}>
              Diferencia: {item.motivo_diferencia}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          {info.completo ? (
            <Pastilla texto="Verificado" bg="#E3F7EC" fg={COLOR.verdeTexto} />
          ) : (
            <>
              <Pastilla
                texto={
                  info.cajasListas
                    ? "Falta saldo"
                    : `Escanea ${faltan} caja${faltan !== 1 ? "s" : ""}`
                }
                bg={info.cajasListas ? "#EEF2FF" : "#FFF4D6"}
                fg={info.cajasListas ? "#3730A3" : COLOR.ambar}
              />
              {!item.motivo_diferencia && (
                <Boton
                  pequeno
                  variante="peligro"
                  onClick={() => {
                    setModalDiferencia({ item });
                    setCantidadReal(String(info.cantPicking));
                    setMotivo("");
                  }}
                >
                  Registrar diferencia
                </Boton>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const columnasLista = [
    {
      titulo: "Pedido",
      celda: (p) => <span style={{ ...mono, fontWeight: 600 }}>{p.numero}</span>,
    },
    { titulo: "Referencias", num: true, celda: (p) => num(p.pedido_items?.length || 0) },
    {
      titulo: "Unidades",
      num: true,
      celda: (p) =>
        num(
          (p.pedido_items || []).reduce(
            (a, i) => a + (i.cantidad_picking ?? i.cantidad_pedida ?? 0),
            0,
          ),
        ),
    },
    {
      titulo: "Cerrado",
      celda: (p) => (
        <span style={{ color: COLOR.gris }}>{p.hora_cierre ? haceTiempo(p.hora_cierre) : "—"}</span>
      ),
    },
    {
      titulo: "",
      celda: (p) => (
        <Boton pequeno variante="principal" onClick={(e) => { e.stopPropagation(); abrir(p.id); }}>
          Verificar
        </Boton>
      ),
    },
  ];

  return (
    <Layout
      titulo="Verificación"
      ocultarTituloMovil={vista === "detalle"}
      subtitulo={
        vista === "lista"
          ? `${pedidos.length} pedido${pedidos.length !== 1 ? "s" : ""} por verificar`
          : `Pedido ${activo?.numero}`
      }
    >
      <Pagina>
        {vista === "detalle" && (
          <Acciones>
            <Boton onClick={volver}>← Volver</Boton>
            <span style={{ ...mono, fontSize: "16px", fontWeight: 700 }}>
              {activo?.numero}
            </span>
          </Acciones>
        )}

        <Mensaje tipo={mensaje.tipo}>{mensaje.texto}</Mensaje>

        {/* LISTA DE PEDIDOS */}
        {vista === "lista" && (
          <Tarjeta
            titulo="Pedidos por verificar"
            subtitulo="Pedidos cerrados por el operario, del más antiguo al más reciente."
          >
            {pedidos.length === 0 ? (
              <Vacio>
                No hay pedidos por verificar.
                <br />
                Cuando un operario cierre un pedido aparecerá aquí.
              </Vacio>
            ) : (
              <Tabla columnas={columnasLista} filas={pedidos} alClic={(p) => abrir(p.id)} />
            )}
          </Tarjeta>
        )}

        {/* DETALLE DEL PEDIDO */}
        {vista === "detalle" && activo && (
          <>
            {/* Orden pensado para el EDA52: avance, referencia que se está
                escaneando, escáner y luego el resto de la lista. */}
            <FilaKpis etiqueta="Avance de la verificación" cuatroEnFila>
              <Kpi
                etiqueta="Referencias listas"
                valor={`${completas}/${items.length}`}
                colorValor={todosCompletos ? COLOR.verdeTexto : undefined}
              />
              <Kpi
                etiqueta="Cajas escaneadas"
                valor={`${cajasHechas}/${cajasTotal}`}
                colorValor={cajasTotal > 0 && cajasHechas >= cajasTotal ? COLOR.verdeTexto : undefined}
              />
              <Kpi
                etiqueta="Saldos por confirmar"
                valor={saldosPendientes}
                colorValor={saldosPendientes > 0 ? COLOR.ambar : undefined}
              />
              <Kpi
                etiqueta="Diferencias"
                valor={items.filter((i) => i.motivo_diferencia).length}
                colorValor={hayDiferencias ? COLOR.rojo : undefined}
              />
            </FilaKpis>

            {escaneada && (
              <Tarjeta style={{ padding: "4px 14px" }}>
                {filaItem(escaneada, 0, true)}
              </Tarjeta>
            )}

            <ScanInput
              onScan={onEscanear}
              disabled={cargando || todosCompletos}
              label="Escanear"
              hint=""
              autoFocus
            />

            {pendientes.length > 0 && (
              <Tarjeta
                titulo={`Pendientes (${pendientes.length})`}
                style={{ padding: "20px 20px 8px" }}
              >
                {pendientes.map((fila, idx) => filaItem(fila, idx))}
              </Tarjeta>
            )}

            {verificadas.length > 0 && (
              <Tarjeta style={{ padding: "4px 20px" }}>
                <details>
                  <summary
                    style={{
                      cursor: "pointer",
                      padding: "14px 0",
                      fontSize: "16px",
                      fontWeight: 700,
                      color: COLOR.verdeTexto,
                    }}
                  >
                    Completas ({verificadas.length})
                  </summary>
                  {verificadas.map((fila, idx) => filaItem(fila, idx))}
                </details>
              </Tarjeta>
            )}

            {/* Botones de confirmación */}
            {todosCompletos ? (
              <Boton variante="verde" onClick={confirmar} disabled={cargando} style={{ width: "100%", minHeight: "52px", fontSize: "16px" }}>
                Confirmar verificación — enviar a facturación
              </Boton>
            ) : todosVerificadosODiferencia && hayDiferencias ? (
              <Boton
                onClick={confirmarConDiferencias}
                disabled={cargando}
                style={{
                  width: "100%",
                  minHeight: "52px",
                  fontSize: "16px",
                  background: "#FFF4D6",
                  color: COLOR.ambar,
                  border: "1px solid #F2DFA6",
                }}
              >
                Aprobar despacho con diferencias
              </Boton>
            ) : (
              <div
                style={{
                  background: COLOR.bordeSuave,
                  color: COLOR.gris,
                  borderRadius: "10px",
                  padding: "16px",
                  fontSize: "14px",
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                {itemsInfo.some(({ info }) => !info.completo && !info.cajasListas)
                  ? "Faltan cajas por escanear"
                  : "Faltan saldos por confirmar"}
              </div>
            )}
          </>
        )}
      </Pagina>

      {modalSaldo && (
        <Modal
          titulo="Confirmar saldo recibido"
          subtitulo={`${modalSaldo.item.productos?.descripcion_corta || ""} — esperado: ${modalSaldo.info.cantSaldos} u`}
          onCerrar={() => setModalSaldo(null)}
          ancho="380px"
          acciones={
            <>
              <Boton onClick={() => setModalSaldo(null)}>Cancelar</Boton>
              <Boton variante="principal" onClick={confirmarSaldo} disabled={cargando || cantidadSaldoRecibida === ""}>
                Confirmar
              </Boton>
            </>
          }
        >
          <Campo etiqueta="Cantidad realmente recibida">
            <input
              type="number"
              value={cantidadSaldoRecibida}
              onChange={(e) => setCantidadSaldoRecibida(e.target.value)}
              style={estiloCampo}
              autoFocus
            />
          </Campo>
        </Modal>
      )}

      {modalDiferencia && (
        <Modal
          titulo="Registrar diferencia"
          subtitulo={modalDiferencia.item.productos?.descripcion_corta}
          onCerrar={() => setModalDiferencia(null)}
          acciones={
            <>
              <Boton onClick={() => setModalDiferencia(null)}>Cancelar</Boton>
              <Boton variante="principal" onClick={registrarDiferencia} disabled={cargando || !motivo.trim() || !cantidadReal}>
                Registrar
              </Boton>
            </>
          }
        >
          <Campo etiqueta="Cantidad real despachada">
            <input type="number" value={cantidadReal} onChange={(e) => setCantidadReal(e.target.value)} style={estiloCampo} />
          </Campo>
          <Campo etiqueta="Motivo de la diferencia *">
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: caja no encontrada en bodega"
              style={estiloCampo}
            />
          </Campo>
        </Modal>
      )}
    </Layout>
  );
}
