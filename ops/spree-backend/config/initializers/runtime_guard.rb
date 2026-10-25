# One runtime boot performs the same checks previously made by separate Rails
# commands. Recovery runners intentionally retain their explicit target guards
# and can initialize/migrate a new database without this pending-migration gate.
role = ENV['SPREE_RUNTIME_ROLE']
if role
  abort 'Unexpected runtime role' unless %w[web worker].include?(role)

  Rails.application.config.after_initialize do
    load Rails.root.join('target.rb')
    ActiveRecord::Migration.check_all_pending!
  end
end
