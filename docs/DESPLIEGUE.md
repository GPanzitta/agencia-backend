# Publicar FG autos

Tres piezas: la base en **Neon**, el backend en **Render** y los dos frentes (ERP y sitio) en **Vercel**.
Hecho en este orden, cada paso tiene a mano lo que necesita del anterior. Tiempo estimado: una hora.

Antes de empezar hacen falta: los tres repositorios en GitHub, un dominio propio (por ejemplo `tudominio.com`)
y, para el correo, una casilla desde la que mandar.

## 1. Base de datos (Neon)

1. Crear un proyecto nuevo, región **AWS US East (N. Virginia)**, base `fgautos`.
2. Copiar la cadena de conexión **pooled** (el host termina en `-pooler`). Es el `DATABASE_URL` del paso 2.
3. No hace falta crear tablas: el backend corre sus migraciones solo antes de cada publicación.

No usar el proyecto de Neon de otro sistema: esta base es sólo de FG autos.

## 2. Backend (Render)

1. New → **Blueprint** → elegir el repo `fg-autos-backend`. Render lee `render.yaml` y arma el servicio.
2. Cargar los valores que pide. La lista completa, con ejemplos, está en `.env.production.example`:

   | Variable | Qué poner |
   |---|---|
   | `DATABASE_URL` | La cadena de Neon del paso 1 |
   | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | El primer usuario; lo crea el paso 4 de esta sección |
   | `API_PUBLIC_URL` | `https://<servicio>.onrender.com/api` (Render muestra la dirección al crear el servicio) |
   | `ERP_URL`, `PORTAL_URL`, `CORS_ORIGINS` | Se completan en el paso 5; por ahora, las direcciones que vayan a tener |
   | `MAIL_*` | Paso 6. Vacías, el sistema anda igual sin correo |
   | `CLOUDINARY_URL` | Paso 7. Vacía, las fotos se pierden en cada publicación |

3. Esperar a que quede en verde y abrir `https://<servicio>.onrender.com/api/health`: tiene que contestar.
4. Una sola vez, en Render → Shell del servicio: `npm run seed:prod`. Crea el primer usuario con `ADMIN_EMAIL` y
   `ADMIN_PASSWORD`, y los medios de pago y cajas de base.

El plan es **Starter**, no el gratis: el gratis bloquea la salida de correo y se duerme a los 15 minutos.

## 3. Sitio (Vercel)

1. Add New → Project → repo `fg-autos-sitio`. Framework: Next.js (lo detecta solo).
2. Variables: las de `.env.production.example` de ese repo (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DOMINIO_BASE`,
   `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ERP_URL`, `PORTADA_PRODUCTO=1`).
3. Settings → Domains: agregar `tudominio.com` **y** `*.tudominio.com`. El comodín es lo que hace que cada
   agencia tenga su dirección (`garcia.tudominio.com`). Vercel pide apuntar los DNS del dominio a sus servidores
   de nombres para poder emitir el certificado del comodín.

## 4. ERP (Vercel)

1. Antes de publicar, cambiar en el repo `fg-autos-erp` las direcciones que empiezan con `REEMPLAZAR-`:
   - `src/environments/environment.ts`: `apiUrl` y `wsUrl` (backend de Render) y `portalUrl` (`https://tudominio.com`).
   - `vercel.json`: en la política de seguridad, las dos direcciones del backend (`https://…` y `wss://…`).
2. Add New → Project → repo `fg-autos-erp`. Vercel usa `vercel.json`.
3. Settings → Domains: `erp.tudominio.com`.

## 5. Cerrar el círculo

Con las direcciones definitivas, volver a Render → Environment y dejar:

- `ERP_URL=https://erp.tudominio.com`
- `PORTAL_URL=https://tudominio.com`
- `CORS_ORIGINS=https://erp.tudominio.com`

`CORS_ORIGINS` es una lista exacta, sin comodines, de los sitios que llaman a la API desde el navegador. Hoy es sólo
el ERP: el sitio de las agencias le pide los datos al backend desde su propio servidor.

Guardar publica de nuevo el backend.

## 6. Correo

Los mensajes por WhatsApp no necesitan nada: el ERP abre la conversación con el texto escrito.
El correo sí necesita una casilla de salida:

1. Con Gmail o Google Workspace: activar la verificación en dos pasos y crear una **contraseña de aplicación**.
2. En Render: `MAIL_HOST=smtp.gmail.com`, `MAIL_PORT=587`, `MAIL_USER` (la casilla), `MAIL_PASS` (la contraseña de
   aplicación) y `MAIL_FROM="FG autos <la casilla>"`.
3. Probar: en el ERP, Configuración → Mensajes dice desde qué casilla salen los correos. Después, en Interesados,
   «Escribirle» → Correo a una dirección propia.

Cada correo sale con el nombre de la agencia que lo manda, y las respuestas le llegan al «Correo de contacto»
que esa agencia cargó en Configuración → Empresa.

## 7. Fotos

Crear una cuenta en Cloudinary y copiar su `CLOUDINARY_URL` a Render. Sin esto las fotos de los autos se guardan
en el disco del servicio, que Render vacía en cada publicación.

## 8. Primera agencia y prueba

1. Entrar al ERP con `ADMIN_EMAIL` y `ADMIN_PASSWORD`.
2. Dar de alta la agencia desde «Registrate» en la pantalla de ingreso (o desde la plataforma, con el usuario dueño).
3. Recorrido de prueba, en este orden: cargar un auto con fotos y publicarlo → abrir su página en
   `https://<agencia>.tudominio.com` → mandar una consulta desde el sitio → verla en Interesados →
   «Escribirle» por WhatsApp y por correo.

## Qué mirar si algo falla

| Síntoma | Dónde mirar |
|---|---|
| El ERP entra pero no carga datos | `CORS_ORIGINS` en Render y las direcciones de `environment.ts` y `vercel.json` |
| El sitio de la agencia da «no encontrada» | El dominio comodín en Vercel y `NEXT_PUBLIC_DOMINIO_BASE` |
| «El envío de correos todavía no está configurado» | Faltan `MAIL_HOST`, `MAIL_USER` o `MAIL_PASS` en Render |
| El correo queda «No salió» | El motivo queda guardado: «Escribirle» → «Ver lo que ya se le escribió» |
| Las fotos desaparecen | Falta `CLOUDINARY_URL` |
| La publicación del backend falla antes de arrancar | Una migración: el registro de Render muestra cuál |
