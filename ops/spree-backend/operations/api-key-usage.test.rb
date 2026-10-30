# Exercise the pinned Spree authentication methods, replacing only persistence,
# the job transport and Rails request/clock boundaries. No database is opened.
require 'pathname'
api_root = ENV['SPREE_API_GEM_PATH'] || Gem::Specification.find_by_name('spree_api').full_gem_path
core_root = ENV['SPREE_CORE_GEM_PATH'] || Gem::Specification.find_by_name('spree_core').full_gem_path
def native_method(root, path, name, indent)
  source = File.read(File.join(root, path))
  source.match(/^#{' ' * indent}def #{Regexp.escape(name)}(?:\([^\n]*\))?\n.*?^#{' ' * indent}end$/m)&.[](0) || raise("Missing native method #{name}")
end

class Object
  def present? = !nil? && self != ''
  def presence = (self if present?)
end
class Numeric
  def hour = self * 3600
  def ago = Time.current - self
end
class Time
  def self.current = Time.at(1_800_000_000)
end

module Spree
  module ApiKeys
    class MarkAsUsed
      def self.perform_later(*) = $enqueued += 1
    end
  end
  class ApiKey
    attr_accessor :id, :store_id, :revoked_at, :last_used_at, :token, :key_type, :scopes
    class << self
      attr_accessor :rows, :before_update, :updates, :queries
      def where(*) = Relation.new(rows).where(*)
      def find_by_secret_token(token) = rows.find { |key| key.key_type == 'secret' && key.token == token && key.revoked_at.nil? }&.dup
    end
    class Relation
      def initialize(rows, conditions = [], cutoff = nil)
        @rows, @conditions, @cutoff = rows, conditions, cutoff
      end
      def where(condition, *bindings)
        if condition.is_a?(Hash)
          self.class.new(@rows, @conditions + [condition], @cutoff)
        else
          raise 'Unexpected timestamp predicate' unless condition == 'last_used_at IS NULL OR last_used_at <= ?' && bindings.length == 1
          self.class.new(@rows, @conditions, bindings.first)
        end
      end
      def active = where(revoked_at: nil)
      def publishable = where(key_type: 'publishable')
      def find_by(**conditions)
        where(conditions).matches.first&.dup
      end
      def matches
        @rows.select { |row| @conditions.all? { |condition| condition.all? { |key, value| row.public_send(key) == value } } }
      end
      def update_all(attributes)
        raise 'Only last_used_at may change' unless attributes.keys == [:last_used_at]
        raise 'Missing hourly database guard' unless @cutoff == Time.current - 3600
        ApiKey.queries += 1
        ApiKey.before_update&.call
        rows = matches.select { |row| row.last_used_at.nil? || row.last_used_at <= @cutoff }
        rows.each { |row| row.last_used_at = attributes.fetch(:last_used_at) }
        ApiKey.updates += rows.length
        rows.length
      end
    end
  end
end
Spree::ApiKey.class_eval(native_method(core_root, 'app/models/spree/api_key.rb', 'has_scope?', 4))

class ApiKeyAuthenticationFixture
  Store = Struct.new(:id) do
    def api_keys = Spree::ApiKey::Relation.new(Spree::ApiKey.rows).where(store_id: id)
  end
  Request = Struct.new(:headers)
  attr_reader :current_api_key, :error, :request
  def initialize(token, store_id = 4)
    @request = Request.new({ 'X-Spree-Api-Key' => token })
    @store = Store.new(store_id)
  end
  def current_store = @store
  def render_error(**error) = @error = error
  def require_authentication! = false
  def self._scope_check_skipped = false
  def self._scope_check_skipped_actions = nil
  def scoped_resource_name = 'products'
  def action_kind = 'write'
  def resolve_current_api_key_for_scope_check! = nil
  def secret_key_request? = true
  module ErrorHandler
    ERROR_CODES = { invalid_token: 'invalid_token', access_denied: 'access_denied' }
  end
end
module Spree
  module Api
    module V3
      ErrorHandler = ApiKeyAuthenticationFixture::ErrorHandler
      module ApiKeyAuthentication
        ErrorHandler = ApiKeyAuthenticationFixture::ErrorHandler
      end
    end
  end
end
auth = 'app/controllers/concerns/spree/api/v3/api_key_authentication.rb'
%w[authenticate_api_key! authenticate_secret_key! touch_api_key_if_needed extract_api_key].each do |name|
  Spree::Api::V3::ApiKeyAuthentication.module_eval(native_method(api_root, auth, name, 8))
end
ApiKeyAuthenticationFixture.include(Spree::Api::V3::ApiKeyAuthentication)
ApiKeyAuthenticationFixture.class_eval(native_method(api_root, 'app/controllers/concerns/spree/api/v3/admin_authentication.rb', 'authenticate_admin!', 8))
ApiKeyAuthenticationFixture.class_eval(native_method(api_root, 'app/controllers/concerns/spree/api/v3/scoped_authorization.rb', 'authorize_api_key_scope!', 8))

patch = File.join(__dir__, 'api-key-usage.rb')
if File.exist?(patch)
  module Rails
    def self.root = Pathname.new(__dir__)
    def self.application = self
    def self.config = self
    def self.to_prepare(&block) = (@prepare = block)
    def self.prepare! = @prepare.call
  end
  initializer = File.join(__dir__, 'api-key-usage-initializer.rb')
  initializer = File.join(__dir__, 'config/initializers/bison_api_key_usage.rb') unless File.file?(initializer)
  load initializer
  2.times { Rails.prepare! }
  raise 'Initializer must prepend exactly once' unless Spree::Api::V3::ApiKeyAuthentication.ancestors.count(BisonApiKeyUsage) == 1
end

def check(value, label)
  raise "API key usage assertion failed: #{label}" unless value
end
def setup_key(type = 'publishable', used_at: nil, store_id: 4, revoked_at: nil)
  key = Spree::ApiKey.new
  key.id, key.store_id, key.key_type, key.token = 12, store_id, type, 'fixture-key'
  key.last_used_at, key.revoked_at, key.scopes = used_at, revoked_at, ['read_products']
  Spree::ApiKey.rows, Spree::ApiKey.before_update = [key], nil
  Spree::ApiKey.updates, Spree::ApiKey.queries, $enqueued = 0, 0, 0
  key
end

key = setup_key
20.times { check(ApiKeyAuthenticationFixture.new(key.token).authenticate_api_key!, 'valid Store key authenticates') }
check(key.last_used_at == Time.current && Spree::ApiKey.updates == 1 && Spree::ApiKey.queries == 1 && $enqueued == 0, 'repeated requests persist hourly usage without jobs')

[[Time.current - 3599, 0], [Time.current - 3600, 1], [Time.current - 3601, 1], [Time.current + 60, 0]].each do |previous, writes|
  key = setup_key(used_at: previous)
  ApiKeyAuthenticationFixture.new(key.token).authenticate_api_key!
  check(Spree::ApiKey.updates == writes, "hourly boundary #{previous}")
  check(Spree::ApiKey.queries == writes, 'recent or future usage needs no extra database query')
  check(key.last_used_at == (writes == 1 ? Time.current : previous), 'timestamps never regress')
end

%w[authenticate_secret_key! authenticate_admin!].each do |method|
  key = setup_key('secret')
  controller = ApiKeyAuthenticationFixture.new(key.token)
  check(controller.public_send(method), "valid secret authenticates via #{method}")
  controller.send(:authorize_api_key_scope!)
  check(controller.error[:status] == :forbidden, 'native scope guard still rejects write with read-only key')
  check(key.has_scope?('read_products') && !key.has_scope?('write_products'), 'permissions unchanged')
  check(key.last_used_at == Time.current && $enqueued == 0, 'secret usage recorded without jobs')
end

%w[authenticate_api_key! authenticate_secret_key! authenticate_admin!].each do |method|
  [{}, { store_id: 9 }, { revoked_at: Time.current }].each do |attributes|
    key = setup_key(method == 'authenticate_api_key!' ? 'publishable' : 'secret', **attributes)
    token = attributes.empty? ? 'invalid-key' : key.token
    controller = ApiKeyAuthenticationFixture.new(token)
    check(controller.public_send(method) == false, "invalid, wrong-store and revoked keys rejected by #{method}")
    check(Spree::ApiKey.updates == 0 && $enqueued == 0, 'failed authentication never records usage')
  end
end

setup_key('secret')
jwt = ApiKeyAuthenticationFixture.new('invalid-secret')
def jwt.require_authentication! = true
def jwt.require_store_membership! = true
check(jwt.authenticate_admin! && jwt.current_api_key.nil?, 'native JWT fallback still authenticates without a key')
check(Spree::ApiKey.updates == 0 && $enqueued == 0, 'JWT fallback does not record API-key usage')

[:recent, :newer, :revoked, :deleted, :other_store].each do |race|
  key = setup_key
  Spree::ApiKey.before_update = lambda do
    case race
    when :recent then key.last_used_at = Time.current
    when :newer then key.last_used_at = Time.current + 1
    when :revoked then key.revoked_at = Time.current
    when :deleted then Spree::ApiKey.rows.clear
    when :other_store then key.store_id = 9
    end
  end
  check(ApiKeyAuthenticationFixture.new(key.token).authenticate_api_key!, 'zero-row bookkeeping does not change native authentication result')
  check(Spree::ApiKey.updates == 0 && $enqueued == 0, "atomic predicate protects #{race} race")
  expected = case race
             when :recent then Time.current
             when :newer then Time.current + 1
             else nil
             end
  check(key.last_used_at == expected, 'zero-row update leaves timestamp intact')
end

key = setup_key
Spree::ApiKey.before_update = -> { raise 'fixture database failure' }
begin
  ApiKeyAuthenticationFixture.new(key.token).authenticate_api_key!
  raise 'Expected persistence failure to remain visible'
rescue RuntimeError => error
  check(error.message == 'fixture database failure', 'unexpected persistence errors are not hidden or re-enqueued')
end
check(key.last_used_at.nil? && $enqueued == 0, 'failed persistence leaves usage and queues intact')
puts 'API key usage contract tests passed'
