from pathlib import Path
import sys

import markdown


def render_markdown(source: Path, destination: Path) -> None:
    html = markdown.markdown(
        source.read_text(encoding="utf-8"),
        extensions=["fenced_code", "sane_lists", "tables"],
        output_format="html5",
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(html + "\n", encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: render_readme.py SOURCE.md OUTPUT.html")
    render_markdown(Path(sys.argv[1]), Path(sys.argv[2]))
