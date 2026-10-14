import { afterEach, describe, expect, it, vi } from "vitest";
const completion = vi.hoisted(() => ({ read: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/shipping/order-completion", () => ({ getOrderCompletionDetails: completion.read, setOrderCompleted: completion.set }));
import { POST } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

function request(body: object, authorized = true) {
  return new Request("https://shop.example.test/api/internal/shipping", { method: "POST", headers: { "Content-Type": "application/json", ...(authorized ? { Authorization: "Bearer ops-test" } : {}) }, body: JSON.stringify(body) });
}

describe("protected order completion endpoint", () => {
  it("requires the existing operations login before completing any order", async () => {
    vi.stubEnv("SHIPPING_OPERATIONS_TOKEN", "ops-test");
    const result = await POST(request({ action: "spree-set-order-completed", orderId: "or_1", completed: true }, false));
    expect(result.status).toBe(401);
    expect(completion.set).not.toHaveBeenCalled();
  });

  it("requires a boolean completion decision instead of coercing arbitrary input", async () => {
    vi.stubEnv("SHIPPING_OPERATIONS_TOKEN", "ops-test");
    const result = await POST(request({ action: "spree-set-order-completed", orderId: "or_1", completed: "false" }));
    expect(result.status).toBe(400);
    expect(completion.set).not.toHaveBeenCalled();
  });

  it("persists and returns the verified completion status", async () => {
    vi.stubEnv("SHIPPING_OPERATIONS_TOKEN", "ops-test");
    completion.set.mockResolvedValue({ orderId: "or_1", number: "R123", completed: true });
    const result = await POST(request({ action: "spree-set-order-completed", orderId: "or_1", completed: true }));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ completed: true, number: "R123" });
    expect(completion.set).toHaveBeenCalledWith("or_1", true);
  });
});
