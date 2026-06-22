-- Fase 5 — Ajustes de inventario con aprobación del gerente.
-- Aplicar en Supabase (SQL Editor).
--
-- Flujo: el rol "inventarios" crea un ajuste (queda PENDIENTE) -> el gerente
-- logístico aprueba o rechaza. Al aprobar, la RPC modifica el inventario de
-- forma ATÓMICA y NUNCA lo deja en negativo (railguard). Todo queda en bitácora.

-- 1) Tabla de ajustes.
CREATE TABLE IF NOT EXISTS ajustes_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL,
  bodega_id uuid NOT NULL,
  ubicacion_id uuid,
  tipo text NOT NULL,            -- averia/perdida/sobrante/error/merma/correccion
  sentido text NOT NULL,         -- incremento | decremento
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  motivo text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente',  -- pendiente | aprobado | rechazado
  solicitado_por uuid,
  aprobado_por uuid,
  comentario_resolucion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ajustes_estado_created
  ON ajustes_inventario (estado, created_at DESC);

-- 2) RPC: aplica un ajuste pendiente de forma atómica (con bloqueo de filas) y
--    deja el inventario nunca negativo. Idempotente: si el ajuste ya no está
--    pendiente devuelve 'already_done'.
CREATE OR REPLACE FUNCTION aplicar_ajuste_inventario(
  p_ajuste_id uuid,
  p_usuario_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_aj    ajustes_inventario%ROWTYPE;
  v_delta numeric;
  v_inv_id uuid;
  v_antes numeric;
  v_nuevo numeric;
BEGIN
  SELECT * INTO v_aj FROM ajustes_inventario WHERE id = p_ajuste_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v_aj.estado <> 'pendiente' THEN
    RETURN jsonb_build_object('status', 'already_done');
  END IF;

  v_delta := CASE WHEN v_aj.sentido = 'incremento' THEN v_aj.cantidad
                  ELSE -v_aj.cantidad END;

  -- Fila canónica de inventario por (producto, bodega): la más antigua, igual
  -- que recepción (ignora la ubicación). Así el ajuste toca el mismo stock que
  -- ve el picking, en vez de una fila aparte por ubicación.
  SELECT id, COALESCE(cantidad_disponible, 0)
    INTO v_inv_id, v_antes
    FROM inventario
   WHERE producto_id = v_aj.producto_id
     AND bodega_id = v_aj.bodega_id
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE;

  IF v_inv_id IS NULL THEN
    -- No hay fila: solo se puede crear con incremento.
    IF v_delta < 0 THEN
      RETURN jsonb_build_object('status', 'insufficient', 'disponible', 0);
    END IF;
    INSERT INTO inventario (producto_id, bodega_id, cantidad_disponible)
    VALUES (v_aj.producto_id, v_aj.bodega_id, v_delta)
    RETURNING id INTO v_inv_id;
    v_antes := 0;
    v_nuevo := v_delta;
  ELSE
    v_nuevo := v_antes + v_delta;
    IF v_nuevo < 0 THEN
      RETURN jsonb_build_object('status', 'insufficient', 'disponible', v_antes);
    END IF;
    UPDATE inventario
       SET cantidad_disponible = v_nuevo, updated_at = now()
     WHERE id = v_inv_id;
  END IF;

  UPDATE ajustes_inventario
     SET estado = 'aprobado', aprobado_por = p_usuario_id, resolved_at = now()
   WHERE id = p_ajuste_id;

  INSERT INTO bitacora (usuario_id, accion, tabla, registro_id,
                        valores_antes, valores_despues)
  VALUES (p_usuario_id, 'AJUSTE_INVENTARIO', 'inventario', v_inv_id,
          jsonb_build_object('cantidad_disponible', v_antes),
          jsonb_build_object('cantidad_disponible', v_nuevo,
                             'ajuste_id', p_ajuste_id,
                             'tipo', v_aj.tipo, 'delta', v_delta));

  RETURN jsonb_build_object('status', 'ok', 'cantidad_disponible', v_nuevo);
END;
$$;
