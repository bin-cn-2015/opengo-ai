#!/usr/bin/env python3
"""Inspect a KataGo dumponnx export and emit browser-runtime metadata sidecars.

Build-time helper only. It does not perform inference and is not part of the
TypeScript browser runtime. Install with: python -m pip install onnx
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import onnx


def tensor_info(value_info):
    tensor = value_info.type.tensor_type
    dims = []
    for dim in tensor.shape.dim:
        if dim.HasField("dim_value"):
            dims.append(dim.dim_value)
        elif dim.HasField("dim_param"):
            dims.append(dim.dim_param)
        else:
            dims.append(None)
    return {
        "name": value_info.name,
        "elem_type": tensor.elem_type,
        "shape": dims,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("model", type=Path, help="ONNX file produced by katago dumponnx")
    parser.add_argument("--report", type=Path, help="write graph/operator report JSON")
    parser.add_argument("--metadata", type=Path, help="write katago.* metadata sidecar JSON")
    args = parser.parse_args()

    model = onnx.load(str(args.model), load_external_data=False)
    metadata = {item.key: item.value for item in model.metadata_props}
    operators = Counter((node.domain or "ai.onnx", node.op_type) for node in model.graph.node)
    opsets = {item.domain or "ai.onnx": item.version for item in model.opset_import}

    report = {
        "model": str(args.model),
        "ir_version": model.ir_version,
        "opsets": opsets,
        "node_count": len(model.graph.node),
        "operators": [
            {"domain": domain, "op_type": op_type, "count": count}
            for (domain, op_type), count in sorted(operators.items())
        ],
        "inputs": [tensor_info(value) for value in model.graph.input],
        "outputs": [tensor_info(value) for value in model.graph.output],
        "initializer_count": len(model.graph.initializer),
        "katago_metadata": metadata,
    }

    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if args.metadata:
        args.metadata.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
