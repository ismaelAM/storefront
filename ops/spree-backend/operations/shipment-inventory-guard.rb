# Native checkout shipments propose inventory without deducting it. Only a
# completed order (or Order#finalize! in state complete, before completed_at is
# touched) may return or deduct inventory through cancellation/resumption.
module BisonShipmentInventoryGuard
  def after_cancel
    return unless order.completed? || order.complete?

    super
  end

  def after_resume
    return unless order.completed? || order.complete?

    super
  end
end
