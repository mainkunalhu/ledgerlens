import { describe, expect, test } from "bun:test";
import { fieldMatches, iou, prf, scoreFields, scoreItems } from "./score.js";

describe("fieldMatches", () => {
  test("numeric tolerance with formatting", () => {
    expect(fieldMatches("total", "₹2,171.20", "2171.2")).toBe(true);
    expect(fieldMatches("gst", "331.19", "331.2")).toBe(true);
    expect(fieldMatches("total", "2711.2", "2171.2")).toBe(false);
    expect(fieldMatches("total", "not visible", "2171.2")).toBe(false);
  });
  test("text normalized exact", () => {
    expect(fieldMatches("vendor", "sharma traders", "SHARMA TRADERS")).toBe(
      true,
    );
    expect(fieldMatches("invoice_no", "INV 2026 0042", "INV-2026-0042")).toBe(
      true,
    );
    expect(fieldMatches("vendor", "Gupta Sons", "Sharma Traders")).toBe(false);
  });
});

describe("iou", () => {
  test("identical and disjoint", () => {
    expect(
      iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 }),
    ).toBe(1);
    expect(
      iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 50, y: 50, w: 10, h: 10 }),
    ).toBe(0);
  });
  test("half overlap", () => {
    expect(
      iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 0, w: 10, h: 10 }),
    ).toBeCloseTo(1 / 3, 5);
  });
});

describe("scoreFields", () => {
  const gt = {
    total: { value: "2171.2", bbox: { x: 1, y: 2, w: 3, h: 4 } },
    vendor: { value: "Sharma", bbox: { x: 1, y: 2, w: 3, h: 4 } },
  };
  test("tp with iou, missing is fn, wrong is fp+fn", () => {
    const out = scoreFields(
      [{ key: "total", value: "2171.20", bbox: { x: 1, y: 2, w: 3, h: 4 } }],
      gt,
    );
    expect(out.find((s) => s.key === "total")).toMatchObject({
      tp: 1,
      fp: 0,
      fn: 0,
    });
    expect(out.find((s) => s.key === "total")?.ious).toEqual([1]);
    expect(out.find((s) => s.key === "vendor")).toMatchObject({
      tp: 0,
      fp: 0,
      fn: 1,
    });
  });
  test("wrong value counts fp and fn", () => {
    const out = scoreFields([{ key: "total", value: "999", bbox: null }], gt);
    expect(out.find((s) => s.key === "total")).toMatchObject({
      tp: 0,
      fp: 1,
      fn: 1,
    });
  });
});

describe("prf", () => {
  test("perfect and zero", () => {
    expect(prf(6, 0, 0).f1).toBe(1);
    expect(prf(0, 0, 0).f1).toBe(0);
    expect(prf(3, 1, 1).f1).toBeCloseTo(0.75, 5);
  });
});

describe("scoreItems", () => {
  const gt = [
    {
      desc: "Rice",
      qty: 2,
      rate: 650,
      amount: 1300,
      bbox: { x: 0, y: 0, w: 1, h: 1 },
    },
    {
      desc: "Oil",
      qty: 3,
      rate: 180,
      amount: 540,
      bbox: { x: 0, y: 0, w: 1, h: 1 },
    },
  ];
  test("matches rows, penalizes extras and misses", () => {
    expect(scoreItems([{ desc: "Rice", amount: 1300 }], gt)).toMatchObject({
      tp: 1,
      fp: 0,
      fn: 1,
    });
    expect(
      scoreItems(
        [
          { desc: "Rice", amount: 1300 },
          { desc: "Soap", amount: 5 },
          { desc: "Oil", amount: 540 },
        ],
        gt,
      ),
    ).toMatchObject({ tp: 2, fp: 1, fn: 0 });
    expect(scoreItems([{ desc: "Rice", amount: 9999 }], gt)).toMatchObject({
      tp: 0,
      fp: 1,
      fn: 2,
    });
  });
});
