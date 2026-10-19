import { describe, expect, it } from "vitest";
import { withGroupOperationLock } from "../../../src/main_process/network/groupOperationQueue.js";

describe("group operation queue", () => {
  it("serializes operations for the same group while allowing other groups to proceed", async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withGroupOperationLock("group-a", async () => {
      order.push("first-start");
      await firstGate;
      order.push("first-end");
    });
    const second = withGroupOperationLock("group-a", async () => {
      order.push("second");
    });
    const otherGroup = withGroupOperationLock("group-b", async () => {
      order.push("other-group");
    });

    await otherGroup;
    expect(order).toEqual(["first-start", "other-group"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual([
      "first-start",
      "other-group",
      "first-end",
      "second",
    ]);
  });

  it("allows reentrant group operations without deadlocking", async () => {
    const result = await withGroupOperationLock("group-reentrant", async () =>
      withGroupOperationLock("group-reentrant", async () => "done"),
    );

    expect(result).toBe("done");
  });
});
