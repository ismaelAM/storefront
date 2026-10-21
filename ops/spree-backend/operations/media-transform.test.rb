require_relative './media-source'
require 'vips'
require 'tmpdir'

Dir.mktmpdir do |directory|
  [[2400, 1200, 1200, 600], [64, 32, 64, 32]].each do |width, height, expected_width, expected_height|
    source = File.join(directory, "#{width}.png")
    Vips::Image.black(width, height).new_from_image([245, 130, 0]).pngsave(source)
    before = Digest::SHA256.file(source).hexdigest
    optimized = RecoveryMedia.optimize(source)
    begin
      result = Vips::Image.new_from_file(optimized.path)
      raise 'Wrong catalog image dimensions' unless [result.width, result.height] == [expected_width, expected_height]
      raise 'Expected a WebP image' unless File.binread(optimized.path, 12).end_with?('WEBP')
      raise 'Supplier original was modified' unless Digest::SHA256.file(source).hexdigest == before
    ensure
      optimized.close!
    end
  end
  invalid = File.join(directory, 'invalid.png')
  File.write(invalid, 'not an image')
  begin
    RecoveryMedia.optimize(invalid)
    raise 'Corrupt supplier image was accepted'
  rescue Vips::Error
    # Decoder failures must stop the operation before upload.
  end
end
puts 'Catalog image optimization tests passed.'
