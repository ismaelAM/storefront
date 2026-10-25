load './target.rb'
require_relative './media-source'
require 'net/http'
require 'tempfile'
require 'digest'

limit = Integer(ARGV.fetch(0, '10'), 10)
raise 'Invalid media batch limit' unless limit.between?(1, 5013)
mode = ARGV.fetch(1, 'draft')
raise 'Invalid media recovery mode' unless %w[draft published].include?(mode)
raise 'Unexpected asset storage service' unless Spree.public_storage_service_name.to_sym == :supabase

def download_media(url)
  uri = RecoveryMedia.uri(url)
  file = Tempfile.new(['spree-recovery-', '.image'])
  file.binmode
  received = 0
  begin
    Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 10, read_timeout: 20) do |http|
      http.request(Net::HTTP::Get.new(uri.request_uri)) do |response|
        raise "Supplier media unavailable (HTTP #{response.code})" unless response.is_a?(Net::HTTPSuccess)
        response.read_body do |chunk|
          received += chunk.bytesize
          raise 'Supplier media exceeds limit' if received > RecoveryMedia::MAX_BYTES
          file.write(chunk)
        end
      end
    end
    file.flush
    file.rewind
    type = Marcel::MimeType.for(file)
    raise 'Unsupported supplier media type' unless %w[image/jpeg image/png image/webp image/avif image/gif].include?(type)
    [RecoveryMedia.optimize(file.path), 'image/webp']
  ensure
    file.close!
  end
end

connection = ActiveRecord::Base.connection
raise 'Another media recovery is running' unless connection.select_value('SELECT pg_try_advisory_lock(20261021, 10)')
begin
  rows = connection.select_all("SELECT source_id, payload FROM spree_recovery.source_records WHERE source_table='catalog_variants' ORDER BY source_id").to_a
  offers = connection.select_all("SELECT source_id, payload FROM spree_recovery.source_records WHERE source_table='catalog_supplier_offers' ORDER BY source_id").to_a
  # The raw adapter result is JSON text; never write supplier payloads to logs.
  rows.each { |r| r['payload'] = JSON.parse(r['payload']) if r['payload'].is_a?(String) }
  offers.each { |r| r['payload'] = JSON.parse(r['payload']) if r['payload'].is_a?(String) }
  by_variant = offers.group_by { |o| o.fetch('payload').fetch('variant_id') }
  processed = 0
  existing = 0
  failed = 0
  Spree::Current.set(store: Spree::Store.find_by!(code: 'bisontcg'), content_locale: 'es') do
    Spree::Events.disable do
      I18n.with_locale(:es) do
        rows.each do |row|
          source = row.fetch('payload')
          mapping = connection.select_one("SELECT destination_id FROM spree_recovery.destination_mappings WHERE source_table='catalog_variants' AND source_id=#{connection.quote(row.fetch('source_id'))}")
          next unless mapping
          variant = Spree::Variant.find_by_prefix_id!(mapping.fetch('destination_id'))
          product = variant.product
          if mode == 'published'
            next unless product.active?
            RecoveryMedia.validate_listing!(store_code: product.store.code, status: product.status,
              recovery_state: product.metadata['recovery_state'],
              publications: product.product_publications.pluck(:channel_id),
              channel_id: product.store.default_channel.id,
              source_id: variant.metadata.dig('recovery_source', 'id'), expected_source_id: row.fetch('source_id'))
            raise 'Recovery product identity changed' unless product.metadata.dig('recovery_source', 'id') == source.fetch('product_id')
          else
            raise 'Unexpected media product state' unless product.status == 'draft' && product.store.code == 'bisontcg' && product.product_publications.empty? && variant.metadata.dig('recovery_source', 'id') == row.fetch('source_id')
          end
          next if mode == 'published' && RecoveryMedia.manual_media?(variant)
          candidates = by_variant.fetch(row.fetch('source_id'), []).sort_by { |o| [o.fetch('source_id') == source['selected_offer_id'] ? 0 : 1, o.fetch('source_id')] }
          url = candidates.flat_map { |o| Array(o.fetch('payload').dig('raw_payload', 'imageUrls')) }.find { |value| value.is_a?(String) && !value.empty? }
          next unless url
          RecoveryMedia.uri(url)
          sha = Digest::SHA256.hexdigest(url)
          asset = product.media.find_by("private_metadata ->> 'recovery_image_source_sha256' = ?", sha)
          already_associated = asset && Spree::VariantMedia.exists?(variant: variant, asset: asset)
          if mode == 'published'
            next unless RecoveryMedia.association_permitted?(existing: !asset.nil?, associated: already_associated,
              pending_source: asset&.metadata&.fetch('recovery_association_pending_for', nil), source_id: row.fetch('source_id'))
          end
          if asset
            raise 'Previously recovered object is missing' unless asset.attachment.attached? && asset.attachment.blob.service.exist?(asset.attachment.blob.key)
          else
            bytes = connection.select_value("SELECT coalesce(sum((metadata->>'size')::bigint),0) FROM storage.objects WHERE bucket_id='spree-media'").to_i
            raise RecoveryMedia::BudgetExceeded, 'Media storage batch budget reached' if bytes >= 400 * 1024 * 1024
            file, type = download_media(url)
            begin
              raise RecoveryMedia::BudgetExceeded, 'Media storage batch budget reached' if bytes + file.size > 400 * 1024 * 1024
              asset = product.media.build(media_type: 'image', metadata: {
                'recovery_image_source_sha256' => sha, 'recovery_image_source_url' => url,
                'recovery_association_pending_for' => row.fetch('source_id'),
                'recovery_image_format' => 'webp_1200_v1',
                'recovery_image_content_sha256' => Digest::SHA256.file(file.path).hexdigest,
                'recovery_image_byte_size' => file.size
              })
              asset.attachment.attach(io: file, filename: "recovery-#{sha[0,24]}.#{type.split('/').last}", content_type: type)
              asset.save!
            ensure
              file.close!
            end
          end
          # An interrupted upload must pass the same readback check on every retry.
          expected_sha = asset.metadata.fetch('recovery_image_content_sha256')
          expected_size = asset.metadata.fetch('recovery_image_byte_size')
          blob = asset.attachment.blob
          RecoveryMedia.verify!(blob, expected_size, expected_sha)
          if mode == 'published' && already_associated
            existing += 1
            next
          end
          Spree::VariantMedia.transaction do
            Spree::VariantMedia.find_or_create_by!(variant: variant, asset: asset)
            asset.update!(metadata: asset.metadata.except('recovery_association_pending_for'))
          end
          processed += 1
          puts "Verified #{processed} primary media associations" if processed % 25 == 0 || processed == limit
          break if processed >= limit
        rescue StandardError => error
          raise if mode == 'draft' || error.is_a?(RecoveryMedia::BudgetExceeded)
          failed += 1
          # Never print supplier payloads, signed URLs, SQL or credential values.
          puts "Deferred media association: #{error.class.name}"
        end
      end
    end
  end
  raise 'No recoverable media found' if processed.zero? && existing.zero?
  puts "Primary media batch verified: #{processed} new, #{existing} existing, #{failed} deferred; remaining gallery images stay in source staging."
ensure
  connection.execute('SELECT pg_advisory_unlock(20261021, 10)')
end
