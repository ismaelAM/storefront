require_relative './email-http-drain'
require 'stringio'

def email_check(value)
  raise 'Email HTTP drain assertion failed' unless value
end

class FakeEmailRepository
  attr_reader :calls
  attr_accessor :claim_available, :attempt_available, :delivery
  def initialize
    @calls = []
    @claim_available = true
    @attempt_available = true
    @delivery = true
  end
  def with_lock
    @calls << :lock
    yield
  ensure
    @calls << :unlock
  end
  def recover_own_stale_processes!; @calls << :recover; end
  def dispatch_due!; @calls << :dispatch; end
  def enqueue_due_retry!; @calls << :retry; end
  def register!; @calls << :register; end
  def claim_one!
    @calls << :claim
    @claim_available ? self : nil
  end
  def delivery_claim?(_); @delivery; end
  def reserve_attempt!(_); @calls << :reserve; @attempt_available; end
  def finish_without_sending!(_); @calls << :exhausted; end
  def perform!(_); @calls << :perform; end
  def deregister!; @calls << :deregister; end
end

repository = FakeEmailRepository.new
email_check(EmailHttpDrain.run(repository: repository) == 1)
email_check(repository.calls.count(:claim) == 1 && repository.calls.count(:perform) == 1)
email_check(repository.calls.index(:reserve) < repository.calls.index(:perform))
email_check(repository.calls.last(2) == [:deregister, :unlock])

repository = FakeEmailRepository.new
repository.attempt_available = false
email_check(EmailHttpDrain.run(repository: repository) == 1)
email_check(repository.calls.include?(:exhausted) && !repository.calls.include?(:perform))

repository = FakeEmailRepository.new
repository.claim_available = false
email_check(EmailHttpDrain.run(repository: repository).zero?)
email_check(!repository.calls.include?(:perform) && repository.calls.include?(:deregister))

repository = FakeEmailRepository.new
times = [0, 26]
email_check(EmailHttpDrain.run(repository: repository, clock: -> { times.shift }).zero?)
email_check(!repository.calls.include?(:claim) && !repository.calls.include?(:register))

repository = FakeEmailRepository.new
def repository.with_lock; 0; end
email_check(EmailHttpDrain.run(repository: repository).zero? && repository.calls.empty?)

repository = FakeEmailRepository.new
repository.delivery = false
EmailHttpDrain.run(repository: repository)
email_check(repository.calls.include?(:perform) && !repository.calls.include?(:reserve))

repository = FakeEmailRepository.new
def repository.perform!(_); raise 'simulated native execution failure'; end
begin
  EmailHttpDrain.run(repository: repository)
  raise 'Native execution error was hidden'
rescue RuntimeError => error
  raise unless error.message == 'simulated native execution failure'
end
email_check(repository.calls.last(2) == [:deregister, :unlock])

secret = 's' * 64
header = "Bearer #{EmailHttpDrain.bearer(secret)}"
email_check(EmailHttpDrain.authorized?(header, secret))
email_check(!EmailHttpDrain.authorized?("Bearer #{secret}", secret))
email_check(!EmailHttpDrain.authorized?(header, 'different'))
email_check(!EmailHttpDrain.authorized?(nil, secret))
email_check(!EmailHttpDrain.authorized?("#{header}\n", secret))
email_check(EmailHttpDrain::MAX_ATTEMPTS == 3)
email_check(EmailHttpDrain::PROCESS_PREFIX == 'bisontcg-email-http-')

# Runtime/SQL are external boundaries; retain the real auth, Rack body/method
# gate and activation dispatch while preventing any live model or HTTP call.
def EmailHttpDrain.with_private_logging; yield; end
def EmailHttpDrain.validate_target!; true; end
def EmailHttpDrain.private_secret!; 's' * 64; end
module EmailActivation
  class << self
    attr_accessor :activation_calls
    def run!(secret:)
      raise 'Wrong private activation secret' unless secret == 's' * 64
      self.activation_calls = (activation_calls || 0) + 1
    end
  end
end
env = { 'REQUEST_METHOD' => 'POST', 'HTTP_AUTHORIZATION' => header, 'rack.input' => StringIO.new('{}') }
status, _, body = EmailHttpDrain::ActivationEndpoint.call(env)
email_check(status == 200 && JSON.parse(body.join) == { 'activated' => true })
email_check(EmailActivation.activation_calls == 1)
[
  env.merge('REQUEST_METHOD' => 'GET', 'rack.input' => StringIO.new('{}')),
  env.merge('HTTP_AUTHORIZATION' => 'Bearer wrong', 'rack.input' => StringIO.new('{}')),
  env.merge('rack.input' => StringIO.new('{"job":1}')),
].each do |request|
  email_check(EmailHttpDrain::ActivationEndpoint.call(request).first != 200)
end
email_check(EmailActivation.activation_calls == 1)
puts 'Email HTTP drain tests passed (bounded execution, retry cap, cleanup and authentication).'
