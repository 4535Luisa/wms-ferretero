-- Fase 4 — Kits (ensamble / desensamble). Aplicar en Supabase (SQL Editor).
--
-- Un kit es un producto compuesto por otros (su receta está en kit_componentes).
-- ENSAMBLAR consume los componentes y produce unidades del kit. DESENSAMBLAR
-- revierte (consume kit, devuelve componentes) y requiere autorización del
-- gerente (se controla por rol en la ruta). Todo atómico y sin negativos.

-- 1) Receta: cuántas unidades de cada componente lleva 1 kit.
CREATE TABLE IF NOT EXISTS kit_componentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_producto_id uuid NOT NULL,
  componente_producto_id uuid NOT NULL,
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  UNIQUE (kit_producto_id, componente_producto_id)
);

-- 2) Bitácora de operaciones de ensamble/desensamble.
CREATE TABLE IF NOT EXISTS ensambles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,            -- ensamble | desensamble
  kit_producto_id uuid NOT NULL,
  bodega_id uuid NOT NULL,
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  realizado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3) RPC ensamblar: verifica TODOS los componentes (con bloqueo) antes de tocar
--    nada; si falta alguno, no aplica cambios. Luego descuenta componentes y
--    suma el kit en la misma bodega.
CREATE OR REPLACE FUNCTION ensamblar_kit(
  p_kit_producto_id uuid,
  p_bodega_id uuid,
  p_cantidad numeric,
  p_usuario_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_comp RECORD;
  v_disp numeric;
  v_req numeric;
  v_n int;
  v_kit_id uuid;
  v_kit_disp numeric;
  v_row_id uuid;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT count(*) INTO v_n FROM kit_componentes WHERE kit_producto_id = p_kit_producto_id;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('status', 'no_recipe');
  END IF;

  -- Verifica y bloquea la fila canónica de cada componente (la más antigua por
  -- producto+bodega, igual que recepción). No modifica nada todavía.
  FOR v_comp IN
    SELECT componente_producto_id, cantidad
      FROM kit_componentes WHERE kit_producto_id = p_kit_producto_id
  LOOP
    v_req := v_comp.cantidad * p_cantidad;
    SELECT id, COALESCE(cantidad_disponible, 0) INTO v_row_id, v_disp
      FROM inventario
     WHERE producto_id = v_comp.componente_producto_id
       AND bodega_id = p_bodega_id
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE;
    IF v_row_id IS NULL OR v_disp < v_req THEN
      RETURN jsonb_build_object('status', 'insufficient',
                                'componente', v_comp.componente_producto_id,
                                'disponible', COALESCE(v_disp, 0),
                                'requerido', v_req);
    END IF;
  END LOOP;

  -- Descuenta los componentes (sobre su fila canónica).
  FOR v_comp IN
    SELECT componente_producto_id, cantidad
      FROM kit_componentes WHERE kit_producto_id = p_kit_producto_id
  LOOP
    v_req := v_comp.cantidad * p_cantidad;
    SELECT id INTO v_row_id
      FROM inventario
     WHERE producto_id = v_comp.componente_producto_id
       AND bodega_id = p_bodega_id
     ORDER BY created_at ASC
     LIMIT 1;
    UPDATE inventario
       SET cantidad_disponible = cantidad_disponible - v_req, updated_at = now()
     WHERE id = v_row_id;
  END LOOP;

  -- Suma el kit terminado (fila canónica; se crea sin ubicación si no existe).
  SELECT id, COALESCE(cantidad_disponible, 0) INTO v_kit_id, v_kit_disp
    FROM inventario
   WHERE producto_id = p_kit_producto_id
     AND bodega_id = p_bodega_id
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE;
  IF v_kit_id IS NULL THEN
    INSERT INTO inventario (producto_id, bodega_id, cantidad_disponible)
    VALUES (p_kit_producto_id, p_bodega_id, p_cantidad);
  ELSE
    UPDATE inventario
       SET cantidad_disponible = v_kit_disp + p_cantidad, updated_at = now()
     WHERE id = v_kit_id;
  END IF;

  INSERT INTO ensambles (tipo, kit_producto_id, bodega_id, cantidad, realizado_por)
  VALUES ('ensamble', p_kit_producto_id, p_bodega_id, p_cantidad, p_usuario_id);
  INSERT INTO bitacora (usuario_id, accion, tabla, registro_id, valores_despues)
  VALUES (p_usuario_id, 'ENSAMBLE_KIT', 'ensambles', p_kit_producto_id,
          jsonb_build_object('bodega', p_bodega_id, 'cantidad', p_cantidad));

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

-- 4) RPC desensamblar: consume el kit y devuelve los componentes. Requiere
--    autorización del gerente (controlada en la ruta).
CREATE OR REPLACE FUNCTION desensamblar_kit(
  p_kit_producto_id uuid,
  p_bodega_id uuid,
  p_cantidad numeric,
  p_usuario_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_comp RECORD;
  v_n int;
  v_kit_id uuid;
  v_kit_disp numeric;
  v_dev numeric;
  v_comp_id uuid;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT count(*) INTO v_n FROM kit_componentes WHERE kit_producto_id = p_kit_producto_id;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('status', 'no_recipe');
  END IF;

  -- Fila canónica del kit por (producto, bodega): la más antigua.
  SELECT id, COALESCE(cantidad_disponible, 0) INTO v_kit_id, v_kit_disp
    FROM inventario
   WHERE producto_id = p_kit_producto_id
     AND bodega_id = p_bodega_id
   ORDER BY created_at ASC
   LIMIT 1
   FOR UPDATE;
  IF v_kit_id IS NULL OR v_kit_disp < p_cantidad THEN
    RETURN jsonb_build_object('status', 'insufficient',
                              'disponible', COALESCE(v_kit_disp, 0));
  END IF;

  UPDATE inventario
     SET cantidad_disponible = v_kit_disp - p_cantidad, updated_at = now()
   WHERE id = v_kit_id;

  -- Devuelve los componentes a su fila canónica (se crea sin ubicación si no existe).
  FOR v_comp IN
    SELECT componente_producto_id, cantidad
      FROM kit_componentes WHERE kit_producto_id = p_kit_producto_id
  LOOP
    v_dev := v_comp.cantidad * p_cantidad;
    SELECT id INTO v_comp_id
      FROM inventario
     WHERE producto_id = v_comp.componente_producto_id
       AND bodega_id = p_bodega_id
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE;
    IF v_comp_id IS NULL THEN
      INSERT INTO inventario (producto_id, bodega_id, cantidad_disponible)
      VALUES (v_comp.componente_producto_id, p_bodega_id, v_dev);
    ELSE
      UPDATE inventario
         SET cantidad_disponible = cantidad_disponible + v_dev, updated_at = now()
       WHERE id = v_comp_id;
    END IF;
  END LOOP;

  INSERT INTO ensambles (tipo, kit_producto_id, bodega_id, cantidad, realizado_por)
  VALUES ('desensamble', p_kit_producto_id, p_bodega_id, p_cantidad, p_usuario_id);
  INSERT INTO bitacora (usuario_id, accion, tabla, registro_id, valores_despues)
  VALUES (p_usuario_id, 'DESENSAMBLE_KIT', 'ensambles', p_kit_producto_id,
          jsonb_build_object('bodega', p_bodega_id, 'cantidad', p_cantidad));

  RETURN jsonb_build_object('status', 'ok');
END;
$$;
