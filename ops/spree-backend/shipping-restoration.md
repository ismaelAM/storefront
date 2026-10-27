# Restauración nativa de envíos 2026

`operations/shipping-setup.rb` restaura exclusivamente la configuración publicada
en `SHIPPING.md`: 21 métodos Correos por provincia y peso, más Entrega en Madrid
por 4,99 €. Todos usan `Spree::Calculator::Shipping::FlatRate`, EUR y categoría
fiscal nula, porque los importes publicados ya son finales.

La ruta fija `POST /internal/bison-shipping/restore` hereda la autenticación y
las protecciones de `EmailHttpDrain::Endpoint`: HMAC privado existente de Vault,
contexto `bison-email-http-v1`, cuerpo exactamente `{}`, sin parámetros de
configuración y sin información privada en la respuesta. El inicializador debe
cargarse después de los inicializadores de correo y pagos. El Dockerfile debe
copiar `shipping-setup.rb` a `/rails` y `shipping-http-initializer.rb` a
`/rails/config/initializers/bison_shipping_http.rb`.

La operación valida el proyecto propio, esquema `spree`, una única tienda
`bisontcg` con ID 4, EUR y kg. Como Zone y ShippingMethod son modelos globales
en esta versión de Spree, aborta ante otras tiendas, métodos o zonas imprevistos.
Valida los 52 registros provinciales españoles antes de formar cuatro zonas:

| Zona | Provincias incluidas |
| --- | --- |
| Península | 47; excluye PM, GC, TF, CE y ML |
| Baleares | PM |
| Canarias | GC y TF |
| Madrid | M exclusivamente |

Usa únicamente las categorías físicas existentes 1 Default, 2 Predeterminado y
3 Predeterminado. No cambia productos, pesos, existencias ni categorías de
productos. Correos conserva mínimos exclusivos, máximos inclusivos y límite de
30 kg; un envío de peso cero no recibe Correos. Madrid conserva una tarifa fija
sin introducir límites de peso que no estaban documentados. No se inventan
tarifas para Portugal ni se activa la promoción BISON3 pendiente.

Las escrituras usan modelos Rails dentro de una transacción y un bloqueo
consultivo transaccional. Cada fila lleva un identificador fijo de restauración.
Una segunda llamada con la misma configuración devuelve cero creaciones. Si una
fila existente difiere de los importes, zonas, categorías, calculadora o
metadatos esperados, aborta; no sobrescribe cambios comerciales posteriores.
La respuesta contiene únicamente el resultado y los recuentos.

Validación local: `shipping-setup.test.rb` comprueba los 22 importes, las
provincias exactas, los límites usando el código FlatRate nativo, las llamadas
repetidas sin escrituras y los conflictos de tienda, zona, método, IVA y
categorías. Se ejecuta con Ruby en la imagen oficial; si el gem no está en la
ruta normal, `SPREE_FLAT_RATE_SOURCE` puede apuntar al archivo FlatRate de Spree
5.6.1. Los dobles de persistencia no sustituyen la verificación posterior de
recuentos y de un carrito real en el backend propio.
