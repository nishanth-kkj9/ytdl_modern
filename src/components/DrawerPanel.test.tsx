import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DrawerPanel } from "./DrawerPanel";

// UIUX-01: the drawer must move focus inside itself when it opens, and the
// Tab-cycling trap must keep focus within the dialog once it is inside.
describe("UIUX-01 DrawerPanel focus management", () => {
  it("moves focus into the drawer when it opens", () => {
    render(
      <DrawerPanel open={true} tab="history" onTabChange={() => {}} onClose={() => {}} />
    );
    const drawer = document.getElementById("queue-history-drawer");
    expect(drawer).not.toBeNull();
    // The first focusable element inside the aside (the "Close drawer" button)
    // must receive focus on open — not background content.
    expect(drawer!.contains(document.activeElement)).toBe(true);
  });

  it("keeps focus inside the drawer when Tab is pressed on the last focusable", () => {
    render(
      <DrawerPanel open={true} tab="history" onTabChange={() => {}} onClose={() => {}} />
    );
    const drawer = document.getElementById("queue-history-drawer")!;
    const focusables = drawer.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    expect(focusables.length).toBeGreaterThan(0);
    const last = focusables[focusables.length - 1];
    last.focus();
    expect(document.activeElement).toBe(last);
    // Simulate Tab from the last focusable element.
    const ev = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(ev);
    // The trap must have wrapped focus back to the first focusable element.
    expect(drawer.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(focusables[0]);
  });

  it("returns focus to the trigger when the drawer closes", () => {
    const trigger = document.createElement("button");
    trigger.type = "button";
    document.body.appendChild(trigger);
    const { rerender } = render(
      <DrawerPanel
        open={true}
        tab="history"
        onTabChange={() => {}}
        onClose={() => {}}
        triggerRef={{ current: trigger }}
      />
    );
    rerender(
      <DrawerPanel
        open={false}
        tab="history"
        onTabChange={() => {}}
        onClose={() => {}}
        triggerRef={{ current: trigger }}
      />
    );
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
