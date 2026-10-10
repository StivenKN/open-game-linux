// `pnpm rol <correo> <usuario|revisor|administrador>` — the only role-promotion path (no admin UI this delivery).
// Decodes argv with the domain Rol schema; UPDATE usuario SET rol = $2 WHERE correo = lower(btrim($1)).
export {}
