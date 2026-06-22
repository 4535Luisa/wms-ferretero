-- Fase 2 — Devoluciones de cliente y proveedor. Aplicar en Supabase (SQL Editor).
--
-- Devolución de CLIENTE: el cliente devuelve mercancía -> reingresa al
--   inventario (suma).
-- Devolución a PROVEEDOR: se devuelve mercancía al proveedor -> sale del
--   inventario (resta, nunca negativo).
-- Todo atómico (bloqueo de filas) y trazado en bitácora.

-- 1) Tabla de devoluciones.
CREATE TABLE IF NOT EXISTS devoluciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,                 -- cliente | proveedor
  producto_id uuid NOT NULL,
  bodega_id uuid NOT NULL,
  ubicacion_id uuid,
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  motivo text NOT NULL,
  referencia_externa text,            -- nro de factura / orden de compra
  estado text NOT NULL DEFAULT 'registrada',
  registrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_devoluciones_tipo_created
  ON devoluciones (tipo, created_at DESC);

-- 2) RPC: registra la devolución y aplica el movimiento de inventario atómico.
CREATE OR REPLACE FUNCTION registrar_devolucion(
  p_tipo text,
  p_producto_id uuid,
  p_bodega_id uuid,
  p_ubicacion_id uuid,
  p_cantidad numeric,
  p_motivo text,
  p_referencia text,
  p_usuario_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_delta numeric;
  v_inv_id uuid;
  v_disp numeric;
  v_nuevo numeric;
  v_dev_id uuid;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_tipo NOT IN ('cliente', 'proveedor') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  -- Cliente devuelve -> entra stock (+). Devolución a proveedor -> sale (-).
  v_delta := CASE WHEN p_tipo = 'cliente' THEN p_cantidad ELSE -p_cantidad END;

  SELECT id, COALESCE(cantidad_disponible, 0)
    INTO v_inv_id, v_disp
    FROM inventario
   WHERE producto_id = p_producto_id
     AND bodega_id = p_bodega_id
     AND (ubicacion_id IS NOT DISTINCT FROM p_ubicacion_id)
   FOR UPDATE;

  IF NOT FOUND THEN
    IF v_delta < 0 THEN
      RETURN jsonb_build_object('status', 'insufficient', 'disponible', 0);
    END IF;
    INSERT INTO inventario (producto_id, bodega_id, ubicacion_id,
                            cantidad_disponible, cantidad_comprometida)
    VALUES (p_producto_id, p_bodega_id, p_ubicacion_id, v_delta, 0);
    v_disp := 0;
    v_nuevo := v_delta;
  ELSE
    v_nuevo := v_disp + v_delta;
    IF v_nuevo < 0 THEN
      RETURN jsonb_build_object('status', 'insufficient', 'disponible', v_disp);
    END IF;
    UPDATE inventario
       SET cantidad_disponible = v_nuevo, updated_at = now()
     WHERE id = v_inv_id;
  END IF;

  INSERT INTO devoluciones (tipo, producto_id, bodega_id, ubicacion_id,
                            cantidad, motivo, referencia_externa, estado,
                            registrado_por)
  VALUES (p_tipo, p_producto_id, p_bodega_id, p_ubicacion_id, p_cantidad,
          NULLIF(btrim(p_motivo), ''), NULLIF(btrim(p_referencia), ''),
          'registrada', p_usuario_id)
  RETURNING id INTO v_dev_id;

  INSERT INTO bitacora (usuario_id, accion, tabla, registro_id,
                        valores_antes, valores_despues)
  VALUES (p_usuario_id, 'DEVOLUCION_' || upper(p_tipo), 'devoluciones', v_dev_id,
          jsonb_build_object('cantidad_disponible', v_disp),
          jsonb_build_object('cantidad_disponible', v_nuevo,
                             'cantidad', p_cantidad, 'tipo', p_tipo));

  RETURN jsonb_build_object('status', 'ok', 'devolucion_id', v_dev_id,
                            'cantidad_disponible', v_nuevo);
END;
$$;
