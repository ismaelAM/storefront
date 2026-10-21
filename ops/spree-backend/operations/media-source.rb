require 'uri'
require 'digest'
module RecoveryMedia
  HOSTS = %w[tcgfactory.com devirinvestments.s3.eu-west-1.amazonaws.com].freeze
  MAX_BYTES = 5 * 1024 * 1024
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
