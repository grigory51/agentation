import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { PageFeedbackToolbarCSS, type AgentationProps } from "./index";
import { OUTPUT_DETAIL_OPTIONS } from "../../utils/generate-output";
import { getStorageKey } from "../../utils/storage";
import type { Annotation } from "../../types";

const annotation: Annotation = {
  id: "output-detail-test", x: 40, y: 100, timestamp: Date.now(),
  element: "button", elementPath: "body > button", comment: "Clarify this button",
};
const controls = () => within(document.querySelector("agentation-toolbar")!.shadowRoot! as unknown as HTMLElement);
const detailButton = (label: string) => controls().getByText(label).closest("button")!;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("feedback-toolbar-settings", JSON.stringify({ outputDetail: "compact" }));
  localStorage.setItem(getStorageKey(window.location.pathname), JSON.stringify([annotation]));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function open(props: AgentationProps = {}) {
  const view = render(<PageFeedbackToolbarCSS {...props} />);
  fireEvent.click(controls().getByRole("button", { name: "Start feedback mode" }));
  fireEvent.click(controls().getByRole("button", { name: "Settings" }));
  await waitFor(() => expect(document.querySelector("agentation-toolbar")!.shadowRoot!.querySelector("[data-agentation-settings-panel]")?.getAttribute("aria-hidden")).toBe("false"));
  return view;
}

describe("forced output detail", () => {
  it("uses the existing standard default when no preference or prop exists", async () => {
    localStorage.removeItem("feedback-toolbar-settings");
    await open();
    expect(detailButton("Standard").disabled).toBe(false);
  });

  it.each(OUTPUT_DETAIL_OPTIONS)("locks $label without replacing the user preference", async ({ value, label }) => {
    await open({ outputDetail: value });
    const detail = detailButton(label);
    expect(detail.disabled).toBe(true);
    fireEvent.click(detail);
    expect(detailButton(label)).toBe(detail);
    expect(JSON.parse(localStorage.getItem("feedback-toolbar-settings")!).outputDetail).toBe("compact");
  });

  it("preserves user configuration when omitted", async () => {
    await open();
    const detail = detailButton("Compact");
    expect(detail.disabled).toBe(false);
    fireEvent.click(detail);
    expect(detailButton("Standard")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("feedback-toolbar-settings")!).outputDetail).toBe("standard");
  });

  it("reacts to prop changes and restores the preference after unlocking", async () => {
    const view = await open({ outputDetail: "forensic" });
    view.rerender(<PageFeedbackToolbarCSS outputDetail="detailed" />);
    expect(detailButton("Detailed").disabled).toBe(true);
    view.rerender(<PageFeedbackToolbarCSS />);
    const detail = detailButton("Compact");
    expect(detail.disabled).toBe(false);
    fireEvent.click(detail);
    expect(detailButton("Standard")).toBeTruthy();
  });

  it("keeps unrelated settings editable without persisting the forced level", async () => {
    await open({ outputDetail: "forensic" });
    fireEvent.click(controls().getByLabelText("Red"));
    expect(JSON.parse(localStorage.getItem("feedback-toolbar-settings")!)).toMatchObject({ outputDetail: "compact", annotationColorId: "red" });
    expect(detailButton("Forensic").disabled).toBe(true);
  });

  it("uses forced detail in Copy and the automation callback", async () => {
    const onCopy = vi.fn();
    const onSubmit = vi.fn();
    await open({ outputDetail: "forensic", copyToClipboard: false, onCopy, onSubmit });
    fireEvent.click(controls().getByRole("button", { name: "Settings" }));
    fireEvent.click(controls().getByRole("button", { name: "Copy feedback" }));
    await waitFor(() => expect(onCopy).toHaveBeenCalledOnce());
    expect(onCopy.mock.calls[0][0]).toContain("**Environment:**");
    fireEvent.click(controls().getByRole("button", { name: "Send Annotations" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0][0]).toContain("**Environment:**");
    expect(onSubmit.mock.calls[0][1]).toEqual([annotation]);
  });

  it("uses forced detail in the manual webhook payload", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", request);
    localStorage.setItem("feedback-toolbar-settings", JSON.stringify({ outputDetail: "compact", webhooksEnabled: false }));
    await open({ outputDetail: "forensic", webhookUrl: "https://automation.test/feedback" });
    fireEvent.click(controls().getByRole("button", { name: "Settings" }));
    fireEvent.click(controls().getByRole("button", { name: "Send Annotations" }));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    const payload = JSON.parse(request.mock.calls[0][1].body);
    expect(payload.output).toContain("**Environment:**");
  });
});
