# Guía Completa de Trabajo de Campo — Farming Simulator 25
> Basada en la serie oficial [Ground Working 101](https://farming-simulator.com/newsArticle.php?&news_id=291) — GIANTS Software Academy
>
> Artículos fuente: [Mejora de rendimiento](https://farming-simulator.com/newsArticle.php?&news_id=291) · [Fertilización](https://farming-simulator.com/newsArticle.php?&news_id=292) · [Malas hierbas](https://farming-simulator.com/newsArticle.php?&news_id=293) · [Arado y cultivado](https://farming-simulator.com/newsArticle.php?&news_id=294) · [Rodillos](https://farming-simulator.com/newsArticle.php?&news_id=295) · [Mulching](https://farming-simulator.com/newsArticle.php?&news_id=296) · [Siembra](https://farming-simulator.com/newsArticle.php?&news_id=317) · [Piedras](https://farming-simulator.com/newsArticle.php?&news_id=318)

---

## ¿Por qué importa el rendimiento?

Cada campo tiene un **multiplicador de cosecha** que depende de su estado. Hacer todas las tareas correctamente puede **doblar tus ingresos** sin cambiar de maquinaria ni comprar campos nuevos.

---

## Ciclo completo de un campo — orden óptimo

```
COSECHA
  └─ MULCHING (si quedan rastrojos) ← ANTES de cultivar
       └─ ARADO (si toca: cultivos de raíz o crear campo)
            └─ CULTIVAR (siempre)
                 └─ RECOGER PIEDRAS grandes/medianas (si hay)
                      └─ SIEMBRA / PLANTACIÓN
                           └─ RODILLO DE SUELO ← piedras pequeñas + +2,5%
                                └─ 1ª FERTILIZACIÓN (justo tras brotar)
                                     └─ [un estadio de crecimiento]
                                          └─ QUITAR MALAS HIERBAS
                                               └─ 2ª FERTILIZACIÓN
                                                    └─ COSECHA
```

> Si usas **siembra directa** (Direct Sowing Machine), te saltas el paso de cultivar.  
> Si usas **arado** en lugar de cultivado, las malas hierbas no crecen en ese ciclo.

---

## PASO 1 — Mulching (desmenuzado de rastrojos)

**Cuándo:** Justo después de cosechar, **ANTES de cultivar**.  
**Impacto:** +2,5% de rendimiento en la siguiente cosecha.

### Cultivos que dejan rastrojos (requieren mulcher)
- Trigo, cebada, avena, sorgo, girasoles, soja, maíz.

### Tipos de mulching
| Situación | Cuándo hacerlo | Herramienta |
|---|---|---|
| Rastrojos tras cereal/oleaginosa | Después de cosechar, antes de cultivar | Mulcher (categoría Mulchers) |
| Viñedos / olivos | Después de cultivar, cuando crece la hierba de nuevo | Mulcher → corta la hierba y evita penalización |
| Tocones y ramas forestales | Después de talar | Forestry Mulcher (Forestry Equipment) |

### Truco de eficiencia
> Puedes enganchar el **mulcher delante del tractor** y el **cultivador detrás**. Así realizas ambas operaciones en una sola pasada.

---

## PASO 2 — Arado o Cultivado

### ¿Cuándo ARAR (en lugar de cultivar)?

El arado es obligatorio en dos situaciones:

1. **Tras cosechar cultivos de raíz:** maíz, patatas, remolacha azucarera y caña de azúcar dejan raíces en el suelo que hay que eliminar en profundidad.
2. **Para crear o ampliar campos:** los arados pueden trazar los límites de nuevos campos.

**Bonus extra del arado:** las malas hierbas **no crecen** en el siguiente ciclo si usas un arado normal (los subsuéladores no dan este beneficio).

### Tipos de arado

| Herramienta | Velocidad | Piedras | Evita malas hierbas | Crea campos | Notas |
|---|---|---|---|---|---|
| **Arado regular (Plow)** | ~12 km/h | Pequeñas | ✅ Sí | ✅ Sí | Más lento, alta potencia |
| **Espadador (Spader)** | 5–8 km/h | Pequeñas | ❌ No | ✅ Sí | Similar al arado pero sin bonus malas hierbas |
| **Subsuélador (Subsoiler)** | 12–15 km/h | **Grandes** | ❌ No | ❌ No | Más rápido, pero genera piedras grandes |

### ¿Cuándo basta con CULTIVAR?

Para todos los cultivos que no sean de raíz —cereales, colza, girasol, soja— basta con cultivar antes de sembrar.

### Tipos de cultivado

| Herramienta | Velocidad | Piedras | Eficacia vs malas hierbas | Notas |
|---|---|---|---|---|
| **Cultivador regular** | ~15 km/h | Pequeñas | ✅ Alta | El más efectivo contra malas hierbas |
| **Cultivador superficial (Shallow)** | Más rápido | ❌ Ninguna | Media | Más ancho, menos potencia, más caro |
| **Rastra de discos (Disc Harrow)** | ~18 km/h | ❌ Ninguna | Baja (hierbas crecen más rápido) | Más barata, menos potencia |
| **Rastra de clavijas (Power Harrow)** | ~12 km/h | ❌ Ninguna | Baja | Barata, más potencia que la de discos |
| **Sembradora directa (Direct Sowing)** | Variable | ❌ Ninguna | Baja | Cultiva + siembra (+ fertiliza en algunos modelos) en una pasada; hierbas crecen más rápido |

> **Consejo de maquinaria:** Si tienes problemas de malas hierbas, usa cultivador regular (elimina más hierbas que las rastras). Si el campo tiene muchas piedras, usa shallow/disc harrow para no sacar más.

---

## PASO 3 — Gestión de Piedras

Las piedras aparecen **como consecuencia del arado y el cultivado**. Hay tres tamaños:

| Tamaño | Color en mapa | Generado por | Efecto en máquinas |
|---|---|---|---|
| **Pequeñas** | Amarillo | Cultivadores regulares, arados | Sembradora lo tolera; cosechadora toma algo de daño |
| **Medianas** | Naranja | Arados y subsuéladores | Daño moderado a la cosechadora; hay que recogerlas |
| **Grandes** | Rojo | Subsuéladores principalmente | Daño grave a la cosechadora; **retirar antes de sembrar** |

> **Importante:** Las piedras **crecen de tamaño** con cada preparación del campo si no se retiran. Una piedra pequeña ignorada puede convertirse en grande tras el siguiente arado.

> Las piedras **no afectan al rendimiento** ni al suelo — solo dañan maquinaria.

### Cómo evitar piedras del todo
Usa cualquiera de estas herramientas:
- Cultivador superficial (Shallow Cultivator)
- Rastra de discos (Disc Harrow)
- Rastra de clavijas (Power Harrow)
- Sembradora directa (Direct Sowing Machine)

### Cómo eliminar las piedras que aparecen

| Tamaño | Solución | Bonus |
|---|---|---|
| Pequeñas | **Rodillo de suelo** (las entierra) — hacerlo DESPUÉS de sembrar | +2,5% rendimiento |
| Pequeñas | Recogedor de piedras (Stone Picker) — más lento | Pequeña recompensa al vender |
| Medianas y grandes | **Stone Picker obligatorio** → llevar a la trituradora para vender | Pequeña recompensa |

> **Truco:** No uses el recogedor para piedras pequeñas — es más lento y rentable. El rodillo las entierra y encima te da el bonus de rendimiento.

---

## PASO 4 — Encalado (Liming)

**Cuándo:** Cada 3 cosechas. El campo y el mapa (filtro de composición del suelo) te avisan.  
**Efecto:** Sin cal, el pH del suelo baja y los cultivos crecen peor. Hay penalización de rendimiento.

- Usa un **Lime Spreader** con sacos de cal o a granel.
- Algunos esparcidores de fertilizante más caros **también pueden aplicar cal** — así ahorras una pasada.
- Puedes aplicar cal antes o después de cultivar, el orden no importa.

---

## PASO 5 — Siembra y Plantación

### Herramientas por tipo de cultivo

| Cultivo | Herramienta | Dónde comprar en la tienda |
|---|---|---|
| Trigo, cebada, avena, colza, sorgo, soja, rábano, hierba | **Sembradora (Seeder)** | Categoría "Seeders" |
| Maíz, remolacha, algodón, girasol, soja | **Plantadora (Planter)** | Categoría "Planters" |
| Patatas | **Plantadora de patatas** | Categoría "Potato Technology" |
| Caña de azúcar | **Plantadora de caña** | Categoría "Sugar Cane Technology" |
| Árboles y álamos | **Plantadora forestal** | Categoría "Forestry Equipment" |

> **Truco de semillas:** Usa la sección **"Packs"** de la tienda para encontrar todo el equipamiento necesario para un cultivo concreto sin buscar por categorías.

### Tipos y precios de semillas

| Formato | Precio | Capacidad |
|---|---|---|
| Bigbag Pallet | 900 $ | ~1.000–1.050 L |
| Bigbag | 800 $ | ~1.000–1.050 L |
| Pallet | 950 $ | ~1.000–1.050 L |

> Las patatas cosechadas pueden **usarse como semillas** en la plantadora de patatas — aprovéchalo para ahorrar en semillas.

### Paso a paso para sembrar

1. Cultivar (o arar) el campo.
2. Rellenar la sembradora: pon la máquina junto al bigbag de semillas y pulsa "Refill". Se carga automáticamente.
3. Seleccionar el cultivo deseado (se muestra arriba a la izquierda y junto al velocímetro).
4. Bajar la sembradora y sembrar en líneas rectas hasta cubrir todo el campo.
5. **Si hay crecimiento estacional activado:** respetar el calendario de siembra — no puedes sembrar fuera de temporada.

> **Siembra directa:** Algunos modelos más caros cultivan y siembran en una sola pasada. Ahorras tiempo y combustible, pero las malas hierbas crecen más rápido después.

---

## PASO 6 — Rodillo de Suelo

**Cuándo:** Después de sembrar.  
**Impacto:** +2,5% de rendimiento · entierra piedras pequeñas.

- Busca los rodillos en la categoría **"Rollers"** de la tienda.
- Enganchar → desplegar → bajar → pasar por todo el campo.
- Algunos rodillos tienen **dos puntos de enganche**: uno solo para transporte. Después de desplegar hay que reengancharlo en el otro punto para trabajar en campo.

> **Aviso:** Solo entierra piedras **pequeñas**. Las medianas y grandes deben retirarse con la recogepiedras antes de pasar el rodillo.

### Rodillo de hierba (Grass Roller)
Categoría: "Grassland Care". Se usa **después de cortar hierba** (no en campos de cereal):
- Pasar tras el corte → **te da automáticamente una etapa de fertilización** para el próximo ciclo.
- Si pasas el rodillo sobre hierba ya madura, su estadio de crecimiento se reinicia.

---

## PASO 7 — Fertilización

**Cuándo:** Hasta 2 veces por ciclo, con al menos **un estadio de crecimiento entre ambas**.  
**Impacto:** +~50% por aplicación → hasta **+100% total** con 2 aplicaciones.

### Reglas clave
- **La hierba**: solo admite **1 fertilización** (excepción única).
- **Estiércol y purín con tasa doble activada:** 1 sola aplicación equivale a 2 (a mitad de velocidad).
- La primera fertilización es la más rentable — priorízala siempre aunque no puedas hacer la segunda.

### Tipos de fertilizante y herramienta correcta

| Fertilizante | Herramienta | Origen / Compra | Coste |
|---|---|---|---|
| Sólido (Solid Fertilizer) | **Esparcidor (Fertilizer Spreader)** | Tienda — Bigbag Pallet o Bigbag | Precio de tienda |
| Líquido (Liquid Fertilizer) | **Pulverizador (Sprayer)** | Tienda — tanques en sección "Pallets" | Precio de tienda |
| Estiércol (Manure) | Esparcidor de estiércol | Vacas/cerdos (necesitan paja + agua) | **Gratis** |
| Purín (Slurry) | Cuba de purín (Slurry Tanker) | Vacas/cerdos (necesitan agua) | **Gratis** |
| Digestato (Digestate) | Cuba de purín (Slurry Tanker) | Subproducto de la planta de biogás al vender estiércol o ensilado | **Gratis** |
| Catch Crop (Rábano oleaginoso) | Sembradora (Seeder) | Semillas en tienda | Bajo coste |

> **Truco de ahorro:** El estiércol, purín y digestato fertilizan igual que el producto de tienda. Si tienes animales o biogás, úsalos siempre antes de comprar fertilizante.

> **Algunos esparcidores** de fertilizante sólido más caros **también pueden aplicar cal** — así combinas fertilización y encalado en una sola pasada.

### La cosecha-cubierta (Catch Crop)
- Planta **Rábano oleaginoso (Oilseed Radish)** en el campo antes del cultivo principal.
- Cuando esté completamente crecido, **puedes cultivar encima** → cuenta automáticamente como 1ª fertilización.
- Ideal para campos que van a pasar tiempo sin trabajar antes de la siguiente siembra.

---

## PASO 8 — Control de Malas Hierbas

**Cuándo:** Entre el 1er y 2º estadio de crecimiento de las hierbas.  
**Impacto:** **+20% de rendimiento** si el campo está completamente libre de malas hierbas en la cosecha.

> **Truco preventivo:** Si has usado un **arado regular** en la preparación del campo, las malas hierbas **no crecerán** en ese ciclo. Te ahorras este paso por completo.

### Estadios de crecimiento y herramienta a usar

| Estadio | Aspecto visual | Herramienta | Restricciones | Coste |
|---|---|---|---|---|
| **Pequeñas** | Manchas verdes dispersas | **Escardadora mecánica (Weeder)** | No sirve en cultivos en hilera (patatas) | Bajo |
| **Pequeñas (en hilera)** | Manchas verdes entre cultivos | **Azada (Hoe)** | Trabaja entre hileras sin dañarlas | Bajo |
| **Medianas** | Mayor densidad y diversidad visual | **Azada (Hoe)** | Funciona también en pequeñas | Bajo |
| **Grandes** | Flores altas y vistosas — **última oportunidad** | **Pulverizador con herbicida** | Solo herbicida funciona con grandes | Alto + penalización |

### Penalización del herbicida
- La aplicación de herbicida en sí **tiene una pequeña penalización de rendimiento** aunque elimine todas las hierbas.
- Úsalo solo cuando las hierbas ya son medianas/grandes o cuando no tengas otra opción.
- Si no tienes pulverizador y solo lo necesitas una vez: **alquílalo** en lugar de comprarlo.

### Campo info y mapa
- La **caja de información del campo** (`[I]`) te dice en qué estadio están las hierbas y qué máquina necesitas.
- En el **mapa → filtro de composición del suelo** también ves el estado de las hierbas en todos tus campos a la vez.

---

## Resumen de multiplicadores de rendimiento

| Acción | Bonus / Efecto | Cuándo en el ciclo | ¿Obligatorio? |
|---|---|---|---|
| **Arado regular** | Evita malas hierbas el ciclo completo | Antes de cultivar/sembrar | Solo en cultivos de raíz |
| **Mulching** | +2,5% | Justo tras cosechar | No, pero recomendado |
| **Encalado** | Evita penalización | Cada 3 cosechas | No, pero penaliza si no |
| **Rodillo** | +2,5% + entierra piedras pequeñas | Después de sembrar | No |
| **1ª Fertilización** | +~50% | Tras brotar | Muy recomendado |
| **2ª Fertilización** | +~50% más (total ~100%) | Un estadio después de la 1ª | Óptimo |
| **Sin malas hierbas** | +20% | Controladas antes de cosecha | No |

> **Campo perfecto = Mulch + Encal (c/ 3) + 2×Fertilizado + Sin hierbas + Rodillo → hasta el doble de cosecha base**

---

## Cómo usar el Dashboard TecnicFarming durante el trabajo de campo

| Dato del dashboard | Cómo usarlo |
|---|---|
| **Engine Load** | Arado/cultivado en tierra dura: si supera 90–100% continuado, reduce velocidad o usa una herramienta menor |
| **RPM + Zona ECO** | En mulching, esparcido de cal y fertilización (trabajo ligero), mantén el motor en zona ECO para ahorrar combustible |
| **Velocidad** | Esparcidores de fertilizante sólido son más efectivos a 8–12 km/h; a más velocidad, distribución irregular |
| **Temperatura motor** | Si el motor se calienta en arado profundo, baja la velocidad o haz una pausa |
| **Combustible / Autonomía** | Planifica repostajes antes de campos grandes; el arado gasta significativamente más que el cultivado |
| **Desgaste del tractor** | Revisa antes de jornadas largas; mejor ir al taller con poco desgaste que parar en mitad del campo |

---

## Checklist por campo

### Justo después de cosechar
- [ ] ¿Quedaron rastrojos? → **Mulchear** antes de cultivar
- [ ] ¿Toca encalar? (cada 3 cosechas — comprobar en mapa o en campo `[I]`)

### Preparación del suelo
- [ ] ¿Fue el último cultivo de raíz? (maíz/patatas/remolacha/caña) → **Arar** primero
- [ ] ¿No fue de raíz? → **Cultivar** directamente
- [ ] ¿Han aparecido **piedras medianas o grandes**? → Recoger con stone picker **antes de sembrar**

### Siembra
- [ ] Rellenar sembradora/plantadora con semillas
- [ ] Seleccionar el cultivo correcto
- [ ] Sembrar en líneas rectas cubriendo todo el campo
- [ ] **Si está activado el crecimiento estacional:** verificar calendario de siembra

### Tras sembrar
- [ ] Pasar **rodillo de suelo** (entierra piedras pequeñas + +2,5%)

### Durante el crecimiento
- [ ] **1ª fertilización** — justo tras brotar o en el primer estadio visible
- [ ] Comprobar malas hierbas al 1er–2º estadio de crecimiento → eliminar con escardadora/azada si son pequeñas/medianas
- [ ] **2ª fertilización** — con al menos un estadio entre la 1ª y la 2ª

### Cosecha
- [ ] Cosechar cuando el indicador de cosecha (`[I]` del campo) marca 100% de madurez
- [ ] Si hay piedras y los cultivos van a marchitarse: cosechar igualmente y asumir pequeño daño en máquina

