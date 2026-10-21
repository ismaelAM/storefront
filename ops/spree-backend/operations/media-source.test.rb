require_relative './media-source'

def check(value)
  raise 'Media source assertion failed' unless value
end
def rejects
  begin
    yield
  rescue ArgumentError, URI::InvalidURIError
    return
  end
  raise 'Unsafe media source accepted'
end
check(RecoveryMedia.uri('https://tcgfactory.com/images/item.jpg').host == 'tcgfactory.com')
check(RecoveryMedia.uri('https://devirinvestments.s3.eu-west-1.amazonaws.com/item.png').scheme == 'https')
%w[http://tcgfactory.com/a https://tcgfactory.com.evil.test/a https://127.0.0.1/a https://user:pass@tcgfactory.com/a https://tcgfactory.com:444/a https://tcgfactory.com/a#fragment].each { |url| rejects { RecoveryMedia.uri(url) } }
blob = Struct.new(:byte_size, :bytes) { def download; bytes; end }.new(3, 'abc')
sha = Digest::SHA256.hexdigest('abc')
check(RecoveryMedia.verify!(blob, 3, sha))
rejects { RecoveryMedia.verify!(blob, 4, sha) }
rejects { RecoveryMedia.verify!(blob, 3, Digest::SHA256.hexdigest('bad')) }
blob.define_singleton_method(:download) do
  @attempts = (@attempts || 0) + 1
  raise IOError, 'Temporary readback failure' if @attempts == 1
  bytes
end
begin
  RecoveryMedia.verify!(blob, 3, sha)
  raise 'Readback failure was ignored'
rescue IOError
  # A persisted object must be verified again on retry.
end
check(RecoveryMedia.verify!(blob, 3, sha))
puts 'Media source and readback tests passed (13 checks).'
