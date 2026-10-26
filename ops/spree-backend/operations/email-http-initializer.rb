# Copy to config/initializers/bison_email_http.rb in the pinned backend image.
require Rails.root.join('email-http-drain')
Rails.application.routes.prepend do
  post '/internal/bison-email/drain', to: EmailHttpDrain::Endpoint
  post '/internal/bison-email/activate', to: EmailHttpDrain::ActivationEndpoint
end
