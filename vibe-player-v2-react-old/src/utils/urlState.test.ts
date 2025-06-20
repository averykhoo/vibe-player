// vibe-player-v2-react/src/utils/urlState.test.ts
// vibe-player-v2/src/lib/utils/urlState.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";
// Removed static imports of functions from ./urlState

// No longer need to mock esm-env directly here.
// We will control the 'window' global for BROWSER variable evaluation in urlState.ts

describe("urlState", () => {
  beforeEach(() => {
    // Reset window.location and history mocks for each test
    const mockUrl = new URL("http://localhost");
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      href: mockUrl.href,
      search: mockUrl.search,
      pathname: mockUrl.pathname,
    });
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  describe("getParamFromUrl", () => {
    it("should return the value of the given parameter from the URL", async () => {
      const { getParamFromUrl } = await import("./urlState");
      // Mock window.location.href for this test case
      vi.spyOn(window, "location", "get").mockReturnValue({
        ...window.location,
        href: "http://localhost/?foo=bar&baz=qux",
      });
      expect(getParamFromUrl("foo")).toBe("bar");
      expect(getParamFromUrl("baz")).toBe("qux");
    });

    it("should return undefined if the parameter is not present", async () => {
      const { getParamFromUrl } = await import("./urlState");
      vi.spyOn(window, "location", "get").mockReturnValue({
        ...window.location,
        href: "http://localhost/?foo=bar",
      });
      expect(getParamFromUrl("baz")).toBeUndefined();
    });

    it("should return undefined if BROWSER is false", async () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window; // Make window undefined for this test scope
      vi.resetModules(); // Ensure urlState is re-evaluated with window undefined
      const { getParamFromUrl } = await import("./urlState");
      expect(getParamFromUrl("foo")).toBeUndefined();
      global.window = originalWindow; // Restore window
      vi.resetModules(); // Reset modules for subsequent tests that expect BROWSER true
    });
  });

  describe("createUrlWithParams", () => {
    it("should create a URL with the given parameters", async () => {
      const { createUrlWithParams } = await import("./urlState");
      const params = { foo: "bar", baz: "qux" };
      const url = createUrlWithParams(params);
      expect(url).toBe("http://localhost/?foo=bar&baz=qux");
    });

    it("should remove parameters with empty or undefined values in created URL", async () => {
      const { createUrlWithParams } = await import("./urlState");
      // @ts-expect-error testing undefined value
      const params = { foo: "bar", baz: undefined, qux: "" };
      const url = createUrlWithParams(params);
      expect(url).toBe("http://localhost/?foo=bar");
    });

    it("should return empty string if BROWSER is false", async () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;
      vi.resetModules();
      const { createUrlWithParams } = await import("./urlState");
      const params = { foo: "bar" };
      const url = createUrlWithParams(params);
      expect(url).toBe("");
      global.window = originalWindow;
      vi.resetModules();
    });
  });

  describe("updateUrlWithParams", () => {
    it("should update the URL with the given parameters", async () => {
      const { updateUrlWithParams } = await import("./urlState");
      const params = { foo: "bar", baz: "qux" };
      updateUrlWithParams(params);
      expect(window.history.replaceState).toHaveBeenCalledWith(
        {},
        "",
        "http://localhost/?foo=bar&baz=qux",
      );
    });

    it("should remove parameters with empty or undefined values", async () => {
      const { updateUrlWithParams } = await import("./urlState");
      // @ts-expect-error testing undefined value
      const params = { foo: "bar", baz: undefined, qux: "" };
      updateUrlWithParams(params);
      expect(window.history.replaceState).toHaveBeenCalledWith(
        {},
        "",
        "http://localhost/?foo=bar",
      );
    });

    it("should not call replaceState if BROWSER is false", async () => {
      const originalWindow = global.window;
      // @ts-ignore
      delete global.window;
      vi.resetModules();
      const { updateUrlWithParams } = await import("./urlState");
      const mockReplaceState = vi.spyOn(window.history, 'replaceState'); // Re-spy on potentially new history object
      const params = { foo: "bar" };
      updateUrlWithParams(params);
      expect(mockReplaceState).not.toHaveBeenCalled();
      mockReplaceState.mockRestore(); // Clean up spy for this specific instance
      global.window = originalWindow;
      vi.resetModules();
    });
  });
});
