-- New destination dtrospakebdiqihhcrub only; applied after reconstruction.sql.
-- Never alter storage.objects directly: uploads must go through the Storage API.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('spree-media', 'spree-media', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'])
ON CONFLICT (id) DO NOTHING;
