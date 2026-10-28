import assert from "node:assert/strict";
import test from "node:test";
import {
  hasCitedR05Signage,
  mergeVerifiedR05Signage,
  verifiedR05SignageFinding,
} from "../lib/gv/r05-signage.ts";

const visualParts = [
  {
    pdfFileName: "Garage Sign system design.pdf",
    pdfUrl: "https://example.test/sign.pdf",
    pdfOriginalPages: Array.from({ length: 18 }, (_, index) => index + 1),
    source: { materialVersionId: "sign-drawing" },
  },
];

test("a cited marking finding skips the focused reread", () => {
  assert.equal(
    hasCitedR05Signage(
      [
        {
          text: "图纸设计了专用的充电车位标识（红色背景和插头图标）。",
          citations: [{ materialVersionId: "sign-drawing", page: 18 }],
        },
      ],
      visualParts,
    ),
    true,
  );
  assert.equal(
    hasCitedR05Signage(
      [
        {
          text: "申报设置了 14 个充电车位。",
          citations: [{ materialVersionId: "sign-drawing", page: 18 }],
        },
      ],
      visualParts,
    ),
    false,
  );
});

test("focused signage support requires a real drawing page", () => {
  const valid = verifiedR05SignageFinding(
    {
      visible: true,
      finding: "图纸显示充电车位专用标识采用红色背景和插头图标。",
      citations: [{ materialVersionId: "sign-drawing", page: 18 }],
    },
    visualParts,
  );
  assert.equal(valid?.citations[0].page, 18);
  assert.match(valid?.text ?? "", /红色背景/);
  assert.equal(
    verifiedR05SignageFinding(
      {
        visible: true,
        finding: "图纸显示充电车位标识。",
        citations: [{ materialVersionId: "sign-drawing", page: 19 }],
      },
      visualParts,
    ),
    null,
  );
  assert.equal(
    verifiedR05SignageFinding(
      {
        visible: true,
        finding: "图纸显示充电车位标识。",
        citations: [{ materialVersionId: "unrelated", page: 18 }],
      },
      visualParts,
    ),
    null,
  );
});

test("quantity and overlap claims cannot masquerade as signage support", () => {
  assert.equal(
    verifiedR05SignageFinding(
      {
        visible: true,
        finding: "充电车位有 14 个，数量达到要求。",
        citations: [{ materialVersionId: "sign-drawing", page: 18 }],
      },
      visualParts,
    ),
    null,
  );
  assert.equal(
    verifiedR05SignageFinding(
      {
        visible: false,
        finding: "图纸显示充电车位标识。",
        citations: [{ materialVersionId: "sign-drawing", page: 18 }],
      },
      visualParts,
    ),
    null,
  );
});

test("a verified drawing sign replaces a duplicate text-only sign", () => {
  const quantity = {
    text: "申报设置 14 个充电车位。",
    citations: [{ materialVersionId: "narrative", page: 1 }],
  };
  const oldSign = {
    text: "材料提到充电车位标识。",
    citations: [{ materialVersionId: "narrative", page: 1 }],
  };
  const verified = {
    text: "图纸显示充电车位专用标识为红色底和白色插头图标。",
    citations: [{ materialVersionId: "sign-drawing", page: 18 }],
  };
  assert.deepEqual(
    mergeVerifiedR05Signage([quantity, oldSign], verified, visualParts),
    [quantity, verified],
  );
});
