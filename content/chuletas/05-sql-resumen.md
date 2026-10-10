# SQL: resumen de examen

## Orden de la consulta

- **Escritura**: `SELECT … FROM … WHERE … GROUP BY … HAVING … ORDER BY … FETCH FIRST n ROWS ONLY` (`LIMIT` en MySQL/PostgreSQL, `TOP` en SQL Server).
- **Evaluación lógica**: `FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `DISTINCT` → `ORDER BY` → límite. Por eso un alias del `SELECT` no sirve en `WHERE`.
- `WHERE` filtra **filas**; `HAVING` filtra **grupos** (admite agregaciones).

## NULL

- `x = NULL` nunca es verdadero: usar `IS NULL`.
- `COUNT(*)` cuenta todas las filas; `COUNT(col)`, `SUM`, `AVG`, `MIN`, `MAX` **ignoran** los NULL.
- `COALESCE(a, b)` primer no nulo · `NULLIF(a, b)` NULL si son iguales · `NOT IN` con un NULL en la subconsulta no devuelve filas (usar `NOT EXISTS`).

## Joins

| Join | Resultado |
|---|---|
| `INNER` | Solo coincidencias |
| `LEFT` | Todas las de la izquierda |
| `RIGHT` | Todas las de la derecha |
| `FULL` | Todas |
| `CROSS` | Producto cartesiano (n × m) |

«Sin…» → `LEFT JOIN … WHERE t2.id IS NULL` o `NOT EXISTS`.

## Conjuntos

`UNION` (sin duplicados) · `UNION ALL` (con duplicados) · `INTERSECT` · `EXCEPT`/`MINUS`.

## Ventana

`ROW_NUMBER()` único · `RANK()` con huecos tras empates · `DENSE_RANK()` sin huecos · `SUM(x) OVER (PARTITION BY d ORDER BY f)`.

## Sentencias

- DDL: `CREATE`, `ALTER`, `DROP` (elimina la tabla), `TRUNCATE` (vacía; sin WHERE).
- DML: `INSERT`, `UPDATE`, `DELETE`, `MERGE`. **UPDATE/DELETE sin WHERE afectan a todas las filas**.
- DCL: `GRANT … TO …`, `REVOKE`. TCL: `COMMIT`, `ROLLBACK`, `SAVEPOINT`.

## Restricciones y acciones referenciales

`PRIMARY KEY` = `UNIQUE` + `NOT NULL` · `FOREIGN KEY` · `CHECK` · `DEFAULT` · `ON DELETE CASCADE | SET NULL | SET DEFAULT | RESTRICT`.

## Transacciones y aislamiento

ACID. Niveles: `READ UNCOMMITTED` < `READ COMMITTED` < `REPEATABLE READ` < `SERIALIZABLE`. Lectura sucia / no repetible / fantasma.

## Procedimientos y triggers

- Procedimiento: `CALL`, parámetros `IN/OUT/INOUT`. Función: devuelve valor y se usa en `SELECT`.
- Trigger: `BEFORE | AFTER | INSTEAD OF` × `INSERT | UPDATE | DELETE`; `FOR EACH ROW`; `OLD`/`NEW` (SQL Server: `inserted`/`deleted`). En `INSERT` solo `NEW`; en `DELETE` solo `OLD`.

## Normalización

1FN atómicos · 2FN sin dependencias parciales · 3FN sin transitivas · FNBC todo determinante es clave candidata.
