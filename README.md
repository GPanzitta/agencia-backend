# FG autos — backend

API del sistema de gestión para agencias de autos: stock de unidades, ventas y reservas,
interesados, comparación de precios con otros vendedores, cajas y gastos. Una misma
instalación atiende a varias agencias; cada una ve sólo lo suyo.

NestJS + TypeORM + PostgreSQL.

## Para correrlo en tu máquina

1. Copiá `.env.development.example` a `.env` y completá los datos de tu base local.
2. `npm install`
3. `npm run migration:run`
4. `npm run start:dev` (queda en el puerto que diga `PORT`; en desarrollo, 3200).

## Pruebas

`npm test`

## Repos hermanos

- `fg-autos-erp`: el sistema que usa la agencia puertas adentro.
- `fg-autos-sitio`: el sitio público de cada agencia.
