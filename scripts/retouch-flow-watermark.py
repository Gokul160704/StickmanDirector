from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np


def retouch(source: Path, destination: Path) -> None:
    image = cv2.imread(str(source), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"Unable to read {source}")
    height, width = image.shape[:2]
    mask = np.zeros((height, width), dtype=np.uint8)

    # The provider mark is fixed in the lower-right safe area of these Flow
    # exports. Keep the mask local so the story composition is preserved.
    x0 = max(0, width - 126)
    y0 = max(0, height - 126)
    x1 = min(width, width - 25)
    y1 = min(height, height - 25)
    cv2.rectangle(mask, (x0, y0), (x1, y1), 255, thickness=-1)

    repaired = cv2.inpaint(image, mask, 7, cv2.INPAINT_TELEA)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(destination), repaired, [int(cv2.IMWRITE_JPEG_QUALITY), 95]):
        raise RuntimeError(f"Unable to write {destination}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    retouch(args.source, args.destination)


if __name__ == "__main__":
    main()
