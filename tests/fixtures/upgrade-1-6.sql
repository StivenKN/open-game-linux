INSERT INTO usuario (id, alias, correo, correo_verificado, rol, activo)
  VALUES ('u1', 'ana', 'ana@demo.opengame.test', false, 'usuario', true), ('u2', 'rita', 'rita@opengame.test', true, 'revisor', true);
INSERT INTO session (id, "expiresAt", token, "updatedAt", "userId") VALUES ('s1', '2027-01-01T00:00:00Z', 'tok', '2026-10-01T00:00:00Z', 'u1');
INSERT INTO account (id, "accountId", "providerId", "userId", password, "updatedAt") VALUES ('a1', 'u1', 'credential', 'u1', 'hash', '2026-10-01T00:00:00Z');
INSERT INTO verification (id, identifier, value, "expiresAt") VALUES ('v1', 'ana@demo.opengame.test', 'x', '2027-01-01T00:00:00Z');
INSERT INTO juego (titulo, descripcion, nivel_x86_min) VALUES ('Juego Uno', 'd1', 'v2'), ('Juego Dos', 'd2', NULL);
INSERT INTO juego_api (juego_id, api) VALUES (1, 'd3d11'), (1, 'vulkan');
INSERT INTO lanzador (nombre, url_oficial) VALUES ('Steam', 'https://store.steampowered.com'), ('GOG', NULL);
INSERT INTO edicion_juego (juego_id, lanzador_id, identificador_externo) VALUES (1, 1, '271590'), (2, 1, NULL), (2, 2, 'gog-2');
INSERT INTO distribucion (nombre, version, url_oficial) VALUES ('Linux Mint', '22', NULL);
INSERT INTO version_capa (familia, variante, version) VALUES ('Proton', 'Valve', '9.0-4');
INSERT INTO equipo (usuario_id, alias) VALUES ('u1', 'portátil');
INSERT INTO diagnostico (equipo_id, capturado_en, sistema, version_sistema, distribucion_id, arquitectura, cpu_modelo, gpu_modelo, ram_mb, vram_mb,
  controlador, version_controlador, soporte_vulkan, version_vulkan, gpu_pci_id, biblioteca_steam, nivel_x86, arranque_seguro, tpm, zram_mb, swap_mb)
  VALUES (1, '2026-10-01T10:00:00Z', 'Linux', '6.8', 1, 'x86_64', 'cpu', 'gpu', 16384, 4096,
  'nvidia', '550', 'si', '1.3', '10de:25a2', '[{"app_id": 271590, "nombre": "GTA V"}]', 'v3', 'activo', '2.0', 0, 2048);
INSERT INTO perfil_configuracion (edicion_id, distribucion_id, version_capa_id, autor_id, arquitectura, revision, titulo, version_juego_objetivo,
  ram_min_mb, vram_min_mb, requiere_vulkan, version_vulkan_min, condicion_cpu, condicion_gpu, parametros_lanzamiento, creado_en)
  VALUES (1, 1, 1, 'u1', 'x86_64', 1, 'Perfil bajo', '1.0', 8192, 2048, true, '1.3', '4 núcleos', 'Vulkan 1.3', 'PROTON_USE_WINED3D=1 %command%', '2026-10-01T12:00:00Z');
INSERT INTO paso_configuracion (perfil_id, orden, titulo, instruccion) VALUES (1, 1, 'Paso 1', 'Haz esto'), (1, 2, 'Paso 2', 'Y luego esto');
INSERT INTO dependencia (nombre, gestor, descripcion) VALUES ('vcrun2019', 'winetricks', 'VC++');
INSERT INTO perfil_dependencia (perfil_id, dependencia_id, version_requerida, obligatoria, instruccion_instalacion) VALUES (1, 1, NULL, true, 'winetricks vcrun2019');
INSERT INTO tipo_fallo (codigo, descripcion) VALUES ('lanzador', 'El lanzador no abre'), ('otro', 'Causa no identificada');
INSERT INTO reporte (edicion_id, diagnostico_id, version_capa_id, perfil_id, version_juego, version_lanzador, fecha_prueba, resultado,
  fps_promedio, resolucion, calidad_grafica, metodo_medicion, observaciones, creado_en)
  VALUES (1, 1, 1, 1, '1.0', NULL, '2026-10-02T10:00:00Z', 'funciona', 54.5, '1280x720', 'Bajo', 'MangoHud', 'sin problemas', '2026-10-02T12:00:00Z'),
         (1, 1, 1, NULL, '1.0', '2.0', '2026-10-03T10:00:00Z', 'no_inicia', NULL, NULL, NULL, NULL, 'pantalla negra', '2026-10-03T12:00:00Z');
UPDATE reporte SET estado_revision = 'aprobado', revisor_id = 'u2', revisado_en = '2026-10-04T10:00:00Z', motivo_revision = 'probado', evidencia_revision = 'captura' WHERE id = 1;
INSERT INTO reporte_fallo (reporte_id, tipo_fallo_id, detalle) VALUES (2, 1, 'se cierra');
INSERT INTO solucion (reporte_id, tipo_fallo_id, autor_id, perfil_id, titulo, instrucciones) VALUES (2, 1, 'u1', NULL, 'Reinstalar', 'borra la carpeta');
INSERT INTO guia_adopcion (autor_id, distribucion_id, tipo, titulo, contenido, revision, estado) VALUES ('u2', 1, 'instalacion', 'Instalar Mint', 'Pasos', 1, 'publicada');
INSERT INTO protondb_resumen (edicion_id, exportado_en, reportes_total, recientes, recientes_funcionan, modestos_recientes, modestos_funcionan, ultimo_reporte, capa_variante, capa_version, capa_reportes)
  VALUES (1, '2026-10-01T00:00:00Z', 100, 40, 30, 10, 8, '2026-09-30T00:00:00Z', 'official', '9.0-4', 20);
UPDATE perfil_configuracion SET estado_revision = 'aprobado', revisor_id = 'u2', revisado_en = '2026-10-05T10:00:00Z', motivo_revision = 'ok', evidencia_revision = 'reporte 1' WHERE id = 1;
INSERT INTO arreglo_upstream (pr, perfil_id, registrado_por) VALUES (123, 1, 'u2');
