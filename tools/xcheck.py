"""
Cross-check the TS pipeline against the Python Bitmap-LENS-BLK pipeline.

Usage:
    python3 tools/xcheck.py <height>

Compares, for the same block:
  1. txValues  (TS /r/block parser vs blockchain_parser on local .blk files)
  2. Mondrian rects + viewBox

Requires: PYTHON venv with blockchain_parser (DEV/PYTHON/venv), Bitcoin blocks
at /mnt/f/Bitcoin/blocks, and the TS side built (`npm run build`) with
`node dist/cli.js <height> --dump-values` already run for the same height.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PY_REPO = Path("/home/honeyd/DEV/PYTHON/Bitmap-LENS-BLK")
VENV_PY = Path("/home/honeyd/DEV/PYTHON/venv/bin/python")
BLOCKS = "/mnt/f/Bitcoin/blocks"
INDEX = "/mnt/f/Bitcoin/blocks/index"

sys.path.insert(0, str(PY_REPO))
from bitmap_svg.block_parser import parse_block            # noqa: E402
from bitmap_svg.generate_mondrian_array import generate_mondrian_array  # noqa: E402


def main(height: int) -> int:
    ts_values = json.loads((REPO / "output" / f"{height}.txvalues.json").read_text())

    dump = f"""
    import {{ generateMondrianArray }} from '{REPO}/dist/mondrian.js';
    import fs from 'fs';
    const txValues = JSON.parse(fs.readFileSync('{REPO}/output/{height}.txvalues.json', 'utf8'));
    const {{ rects, viewBox }} = generateMondrianArray(txValues);
    fs.writeFileSync('/tmp/ts_xcheck_{height}.json', JSON.stringify({{ rects, viewBox }}));
    """
    Path(f"/tmp/ts_xcheck_{height}.mjs").write_text(dump)
    subprocess.run(["node", f"/tmp/ts_xcheck_{height}.mjs"], check=True)
    ts_mondrian = json.loads(Path(f"/tmp/ts_xcheck_{height}.json").read_text())

    data = parse_block(height, BLOCKS, INDEX)
    py_values = data["txValues"]
    result = generate_mondrian_array(py_values)
    py_rects = [
        [math.floor(s["position"]["x"]), math.floor(s["position"]["y"]), math.floor(s["r"])]
        for s in result["slots"]
    ]

    ok = True
    if len(py_values) != len(ts_values):
        print(f"FAIL txCount: python={len(py_values)} ts={len(ts_values)}")
        ok = False
    else:
        vmis = sum(1 for a, b in zip(py_values, ts_values) if abs(a - b) > 1e-12)
        print(f"txValues: {len(ts_values)} entries, {vmis} mismatches")
        ok = ok and vmis == 0

    rmis = sum(1 for a, b in zip(py_rects, ts_mondrian["rects"]) if a != b)
    print(f"rects:    python={len(py_rects)} ts={len(ts_mondrian['rects'])}, {rmis} mismatches")
    print(f"viewBox:  python={result['viewBox']} ts={ts_mondrian['viewBox']}")
    ok = ok and rmis == 0 and result["viewBox"] == ts_mondrian["viewBox"]

    print("RESULT:", "MATCH" if ok else "MISMATCH")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(int(sys.argv[1])))
