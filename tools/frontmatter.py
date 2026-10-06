"""Validate the skill's required scalar frontmatter without third-party YAML."""
import json
import re


def validate(path):
    text = path.read_text()
    lines = text.splitlines()
    if not lines or lines[0] != "---" or "---" not in lines[1:]:
        raise ValueError("SKILL.md needs delimited frontmatter")
    fields = {}
    for line in lines[1:lines.index("---", 1)]:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        match = re.fullmatch(r"([A-Za-z_][\w-]*):\s*(.*)", line)
        if not match or match[1] in fields:
            raise ValueError("Frontmatter must use unique scalar fields")
        key, value = match.groups()
        if value.startswith('"'):
            value = json.loads(value)
        elif value.startswith("'") and value.endswith("'"):
            value = value[1:-1].replace("''", "'")
        else:
            value = value.split(" #", 1)[0].strip()
            if (not value or value[0] in "[{>|&*!'\"" or ": " in value
                    or value.lower() in {"true", "false", "null", "~"}
                    or re.fullmatch(r"[-+]?\d+(\.\d+)?", value)):
                raise ValueError("Frontmatter fields must be string scalars")
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Frontmatter fields must be nonempty strings")
        fields[key] = value
    if not all(key in fields for key in ("name", "description")):
        raise ValueError("Frontmatter requires name and description")
    if len(fields["name"]) > 64 or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", fields["name"]):
        raise ValueError("Frontmatter name needs lowercase alphanumeric/hyphen format, <=64 characters")
    if len(fields["description"]) > 1024:
        raise ValueError("Frontmatter description exceeds 1024 characters")
    return fields
