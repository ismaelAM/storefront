# Spree 5.6.1 authenticates before invoking this bookkeeping hook. Its native
# hourly guard only advances when MarkAsUsed runs; our general worker is off.
# Keep the same hourly precision without creating a job for every API request.
module BisonApiKeyUsage
  private

  def touch_api_key_if_needed(api_key)
    used_at = Time.current
    cutoff = used_at - 1.hour
    return if api_key.last_used_at.present? && api_key.last_used_at > cutoff

    # Recheck the timestamp in the UPDATE: concurrent requests can hold stale
    # snapshots. A deleted, moved or newly revoked key must not be updated.
    # Like the native job's update_column, bypass callbacks and updated_at.
    Spree::ApiKey.where(id: api_key.id, store_id: current_store.id, revoked_at: nil)
      .where('last_used_at IS NULL OR last_used_at <= ?', cutoff)
      .update_all(last_used_at: used_at)
  end
end
