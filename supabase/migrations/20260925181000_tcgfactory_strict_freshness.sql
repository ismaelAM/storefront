update public.catalog_suppliers
set stale_after_hours = 8,
    updated_at = now()
where code = 'tcgfactory';
