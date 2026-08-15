import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = ROOT / "docs" / "contracts"
FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"


def main() -> int:
    failures = 0
    checked = 0
    for schema_file in sorted(SCHEMA_DIR.glob("*.schema.json")):
        name = schema_file.name.removesuffix(".schema.json")
        fixture_dir = FIXTURE_DIR / name
        if not fixture_dir.is_dir():
            continue
        validator = Draft202012Validator(json.loads(schema_file.read_text(encoding="utf-8")))
        for fixture in sorted(fixture_dir.glob("*.json")):
            instance = json.loads(fixture.read_text(encoding="utf-8"))
            errors = list(validator.iter_errors(instance))
            checked += 1
            if fixture.name.startswith("valid_") and errors:
                failures += 1
                print(f"FAIL (should pass): {fixture.relative_to(ROOT)}")
                for err in errors[:3]:
                    print(f"  - {err.json_path}: {err.message}")
            elif fixture.name.startswith("invalid_") and not errors:
                failures += 1
                print(f"FAIL (should be rejected): {fixture.relative_to(ROOT)}")
    print(f"checked={checked} failures={failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
