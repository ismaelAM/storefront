-- Read-only export. Destination project dtrospakebdiqihhcrub ONLY.
-- Save the result privately, never in Git. Verify destination ownership first.
-- For MCP pagination, append LIMIT/OFFSET and preserve this ORDER BY.
SELECT m.source_table, m.source_id, m.destination_id,
       s.payload ->> CASE WHEN m.source_table = 'catalog_products'
                         THEN 'spree_product_id' ELSE 'spree_variant_id' END AS old_id
FROM spree_recovery.destination_mappings m
JOIN spree_recovery.source_records s USING (source_table, source_id)
WHERE m.verified_at IS NOT NULL
ORDER BY m.source_table, m.source_id;
