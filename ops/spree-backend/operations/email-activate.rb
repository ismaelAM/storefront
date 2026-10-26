# Explicit Rails runner operation. Never invoke at ordinary web/worker startup.
load './target.rb'
require_relative './email-activation'
abort 'Unexpected email activation project' unless ENV['TARGET_SUPABASE_PROJECT_REF'] == EmailActivation::OWNED_PROJECT

begin
  EmailActivation.run!
  puts 'Storefront email endpoint enabled after signed non-email probe; native Rails mail remains disabled.'
rescue EmailActivation::Error => error
  abort "Email activation stopped: #{error.message}"
rescue StandardError
  abort 'Email activation stopped: runtime or database check failed; no private details are logged.'
end
