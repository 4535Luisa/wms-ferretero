-- Fase 5 — Traslados entre bodegas con confirmación en destino.
-- Aplicar en Supabase (SQL Editor).
--
-- Flujo: se ENVÍA desde la bodega origen (descuenta de inmediato y el traslado
-- queda 'en_transito') y se CONFIRMA en destino (suma). Si algo sale mal antes
-- de confirmar, se puede CANCELAR (devuelve el stock al origen). Todo atómico,
-- con bloqueo de filas, sin dejar inventario negativo, y trazado en bitácora.

-- 1) Tabla de traslados.
CREATE TABLE IF NOT EXISTS traslados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id uuid NOT NULL,
  bodega_origen_id uuid NOT NULL,
  bodega_destino_id uuid NOT NULL,
  ubicacion_origen_id uuid,
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  motivo text,
  estado text NOT NULL DEFAULT 'en_transito', -- en_transito | completado | cancelado
  solicitado_por uuid,
  confirmado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  hora_confirmacion timestamptz
);

CREATE INDEX IF NOT EXISTS idx_traslados_estado_created
  ON traslados (estado, created_at DESC);

-- 2) Crear traslado: descuenta del origen de forma atómica y lo deja en tránsito.
CREATE OR REPLACE FUNCTION crear_traslado(
  p_producto_id uuid,
  p_bodega_origen uuid,
  p_bodega_destino uuid,
  p_ubicacion_origen uuid,
  p_cantidad numeric,
  p_motivo text,
  p_usuario_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_inv_id uuid;
  v_disp numeric;
  v_traslado_id uuid;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_bodega_origen = p_bodega_destino THEN
    RETURN jsonb_build_object('status', 'same_bodega');
  END IF;

  -- Fila canónica por (producto, bodega): la más antigua, igual que recepción.
  SELECT id, COALESCE(cantidad_disponible, 0)
    INTO v_inv_id, v_disp
    FROM inventario
   WHERE producto_id = p_producto_id
     AND bodega_id = p_bodega_origen
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE;

  IF v_inv_id IS NULL OR v_disp < p_cantidad THEN
    RETURN jsonb_build_object('status', 'insufficient',
                              'disponible', COALESCE(v_disp, 0));
  END IF;

  UPDATE inventario
     SET cantidad_disponible = v_disp - p_cantidad, updated_at = now()
   WHERE id = v_inv_id;

  INSERT INTO traslados (producto_id, bodega_origen_id, bodega_destino_id,
                         ubicacion_origen_id, cantidad, motivo, estado,
                         solicitado_por)
  VALUES (p_producto_id, p_bodega_origen, p_bodega_destino,
          p_ubicacion_origen, p_cantidad, NULLIF(btrim(p_motivo), ''),
          'en_transito', p_usuario_id)
  RETURNING id INTO v_traslado_id;

  INSERT INTO bitacora (usuario_id, accion, tabla, registro_id, valores_despues)
  VALUES (p_usuario_id, 'TRASLADO_ENVIADO', 'traslados', v_traslado_id,
          jsonb_build_object('producto_id', p_producto_id,
                             'origen', p_bodega_origen,
                             'destino', p_bodega_destino,
                             'cantidad', p_cantidad));

  RETURN jsonb_build_object('status', 'ok', 'traslado_id', v_traslado_id);
END;
$$;

-- 3) Confirmar traslado en destino: suma al inventario de la bodega destino.
CREATE OR REPLACE FUNCTION confirmar_traslado(
  p_traslado_id uuid,
  p_usuario_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_t traslados%ROWTYPE;
  v_inv_id uuid;
  v_disp numeric;
BEGIN
  SELECT * INTO v_t FROM traslados WHERE id = p_traslado_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v_t.estado <> 'en_transito' THEN
    RETURN jsonb_build_object('status', 'already_done');
  END IF;

  -- Fila canónica del destino por (producto, bodega): la más antigua, igual que
  -- recepción. Si no existe, se crea (sin ubicación, como hace recepción).
  SELECT id, COALESCE(cantidad_disponible, 0)
    INTO v_inv_id, v_disp
    FROM inventario
   WHERE producto_id = v_t.producto_id
     AND bodega_id = v_t.bodega_destino_id
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE;

  IF v_inv_id IS NULL THEN
    INSERT INTO inventario (producto_id, bodega_id, cantidad_disponible)
    VALUES (v_t.producto_id, v_t.bodega_destino_id, v_t.cantidad);
  ELSE
    UPDATE inventario
       SET cantidad_disponible = v_disp + v_t.cantidad, updated_at = now()
     WHERE id = v_inv_id;
  END IF;

  UPDATE traslados
     SET estado = 'completado', confirmado_por = p_usuario_id,
         hora_confirmacion = now()
   WHERE id = p_traslado_id;

  INSERT INTO bitacora (usuario_id, accion, tabla, registro_id, valores_despues)
  VALUES (p_usuario_id, 'TRASLADO_CONFIRMADO', 'traslados', p_traslado_id,
          jsonb_build_object('destino', v_t.bodega_destino_id,
                             'cantidad', v_t.cantidad));

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

-- 4) Cancelar traslado en tránsito: devuelve el stock al origen.
CREATE OR REPLACE FUNCTION cancelar_traslado(
  p_traslado_id uuid,
  p_usuario_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_t traslados%ROWTYPE;
  v_inv_id uuid;
  v_disp numeric;
BEGIN
  SELECT * INTO v_t FROM traslados WHERE id = p_traslado_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v_t.estado <> 'en_transito' THEN
    RETURN jsonb_build_object('status', 'already_done');
  END IF;

  -- Fila canónica del origen por (producto, bodega): la más antigua.
  SELECT id, COALESCE(cantidad_disponible, 0)
    INTO v_inv_id, v_disp
    FROM inventario
   WHERE producto_id = v_t.producto_id
     AND bodega_id = v_t.bodega_origen_id
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE;

  IF v_inv_id IS NULL THEN
    INSERT INTO inventario (producto_id, bodega_id, cantidad_disponible)
    VALUES (v_t.producto_id, v_t.bodega_origen_id, v_t.cantidad);
  ELSE
    UPDATE inventario
       SET cantidad_disponible = v_disp + v_t.cantidad, updated_at = now()
     WHERE id = v_inv_id;
  END IF;

  UPDATE traslados
     SET estado = 'cancelado', confirmado_por = p_usuario_id,
         hora_confirmacion = now()
   WHERE id = p_traslado_id;

  INSERT INTO bitacora (usuario_id, accion, tabla, registro_id, valores_despues)
  VALUES (p_usuario_id, 'TRASLADO_CANCELADO', 'traslados', p_traslado_id,
          jsonb_build_object('origen', v_t.bodega_origen_id,
                             'cantidad', v_t.cantidad));

  RETURN jsonb_build_object('status', 'ok');
END;
$$;
