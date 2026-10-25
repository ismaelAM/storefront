require_relative './media-source'
require_relative './recovery-access'

def check(value)
  raise 'Catalog recovery assertion failed' unless value
end
def rejects
  begin
    yield
  rescue ArgumentError
    return
  end
  raise 'Unsafe recovery accepted'
end

safe = {
  store_code: 'bisontcg', status: 'active',
  recovery_state: 'catalog_visible_stock_unverified', publications: [7],
  channel_id: 7, source_id: 'source', expected_source_id: 'source'
}
check(RecoveryMedia.validate_listing!(**safe))
rejects { RecoveryMedia.validate_listing!(**safe.merge(store_code: 'other')) }
rejects { RecoveryMedia.validate_listing!(**safe.merge(publications: [8])) }
rejects { RecoveryMedia.validate_listing!(**safe.merge(publications: [7, 8])) }
rejects { RecoveryMedia.validate_listing!(**safe.merge(source_id: 'other')) }
rejects { RecoveryMedia.validate_listing!(**safe.merge(recovery_state: nil)) }
rejects { RecoveryMedia.validate_listing!(**safe.merge(status: 'archived')) }
Images = Struct.new(:present) { def exists?; present; end }
Asset = Struct.new(:metadata)
MediaProduct = Struct.new(:media)
MediaVariant = Struct.new(:images, :product)
manual = Asset.new({})
recovered = Asset.new({'recovery_image_source_sha256' => 'sha'})
check(RecoveryMedia.manual_media?(MediaVariant.new(Images.new(true), MediaProduct.new([]))))
check(RecoveryMedia.manual_media?(MediaVariant.new(Images.new(false), MediaProduct.new([manual]))))
check(!RecoveryMedia.manual_media?(MediaVariant.new(Images.new(false), MediaProduct.new([recovered]))))
check(!RecoveryMedia.association_permitted?(existing: true, associated: false, pending_source: nil, source_id: 'source'))
check(RecoveryMedia.association_permitted?(existing: true, associated: false, pending_source: 'source', source_id: 'source'))
check(!RecoveryMedia.association_permitted?(existing: true, associated: false, pending_source: 'other', source_id: 'source'))
check(RecoveryMedia.association_permitted?(existing: false, associated: false, pending_source: nil, source_id: 'source'))

Key = Struct.new(:store_id, :scopes, :plaintext_token, :key_type, :revoked_at)
class FakeKeys
  attr_reader :rows
  def initialize; @rows = []; end
  def active; self; end
  def secret; self; end
  def where(name:); self; end
  def count; rows.size; end
  def first; rows.first; end
  def create!(name:, key_type:, scopes:)
    rows << Key.new(1, scopes, 'sk_private_fixture', key_type, nil)
    rows.last
  end
end
module Spree
  class ApiKey
    def self.find_by_secret_token(token)
      $keys.rows.find { |key| key.plaintext_token == token && key.revoked_at.nil? }
    end
  end
end
class FakeConnection
  attr_accessor :secret
  attr_reader :sql
  def initialize; @sql = []; end
  def transaction; yield; end
  def select_value(query)
    @sql << query
    return true if query.include?('pg_try_advisory_lock')
    secret
  end
  def execute(query); @sql << query; end
  def exec_query(query, name, binds)
    @sql << query
    raise 'Plaintext embedded in SQL' if query.include?('sk_private_fixture')
    @secret = binds.first.value_for_database
  end
end
module ActiveRecord
  module Type
    class String; end
  end
  module Relation
    QueryAttribute = Struct.new(:name, :value_for_database, :type)
  end
end
$keys = FakeKeys.new
store = Struct.new(:id, :code, :api_keys).new(1, 'bisontcg', $keys)
connection = FakeConnection.new
RecoveryAccess.provision!(store, connection)
check($keys.rows.size == 1)
check($keys.first.scopes.sort == %w[write_categories write_products write_settings write_stock])
check(connection.secret == 'sk_private_fixture')
RecoveryAccess.provision!(store, connection)
check($keys.rows.size == 1)
connection.secret = nil
rejects { RecoveryAccess.provision!(store, connection) }
check($keys.rows.size == 1)
connection.secret = 'sk_wrong_fixture'
rejects { RecoveryAccess.provision!(store, connection) }
rejects { RecoveryAccess.provision!(store.dup.tap { |s| s.code = 'other' }, connection) }
puts 'Catalog recovery ownership, scoped access and private handoff checks passed.'
