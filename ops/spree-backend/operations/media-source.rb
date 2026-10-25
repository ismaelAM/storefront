require 'uri'
require 'digest'
module RecoveryMedia
  HOSTS = %w[tcgfactory.com devirinvestments.s3.eu-west-1.amazonaws.com].freeze
  MAX_BYTES = 5 * 1024 * 1024
  class BudgetExceeded < StandardError; end
  def self.manual_media?(variant)
    variant.images.exists? || variant.product.media.any? { |asset| !asset.metadata['recovery_image_source_sha256'] }
  end
  def self.association_permitted?(existing:, associated:, pending_source:, source_id:)
    !existing || associated || pending_source == source_id
  end
  def self.validate_listing!(store_code:, status:, recovery_state:, publications:, channel_id:, source_id:, expected_source_id:)
    safe = store_code == 'bisontcg' && status == 'active' &&
      recovery_state == 'catalog_visible_stock_unverified' && publications == [channel_id] &&
      !channel_id.nil? && source_id == expected_source_id && !source_id.nil?
    raise ArgumentError, 'Published recovery ownership changed' unless safe
    true
  end
  def self.optimize(path)
    require 'image_processing/vips'
    ImageProcessing::Vips.source(path).resize_to_limit(1200, 1200)
      .convert('webp').saver(quality: 80, strip: true).call
  end

  def self.uri(value)
    uri = URI.parse(value)
    raise ArgumentError, 'Unsupported media source' unless uri.scheme == 'https' && HOSTS.include?(uri.host) && uri.port == 443 && uri.userinfo.nil? && uri.fragment.nil?
    uri
  end

  def self.verify!(blob, size, sha)
    raise ArgumentError, 'Uploaded object size mismatch' unless blob.byte_size == size
    raise ArgumentError, 'Uploaded object checksum mismatch' unless Digest::SHA256.hexdigest(blob.download) == sha
    true
  end
end
